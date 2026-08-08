import type { DoorSnapshot, DoorStatusId, OutboxEntry, RejectionCategory, VisitIntent } from '../doors/contracts';
import type { Outbox } from './outbox';

export class RevisionConflictError extends Error {
  readonly serverDoor: DoorSnapshot;

  constructor(serverDoor: DoorSnapshot) {
    super('The door changed on another device.');
    this.name = 'RevisionConflictError';
    this.serverDoor = serverDoor;
  }
}

export class NetworkUnavailableError extends Error {
  constructor() {
    super('Network unavailable.');
    this.name = 'NetworkUnavailableError';
  }
}

export class SyncRejectedError extends Error {
  constructor(readonly category: RejectionCategory, message: string) {
    super(message);
    this.name = 'SyncRejectedError';
  }
}

export interface DoorWriteGateway {
  commit(intent: VisitIntent): Promise<DoorSnapshot>;
}

export type SyncEvent =
  | { type: 'synced'; commandId: string; door: DoorSnapshot }
  | { type: 'conflict'; commandId: string; door: DoorSnapshot }
  | { type: 'rejected'; commandId: string; category: RejectionCategory };

export class MemoryDoorGateway implements DoorWriteGateway {
  private readonly doors = new Map<string, DoorSnapshot>();
  private online = true;

  constructor(initialDoors: DoorSnapshot[]) {
    for (const door of initialDoors) {
      this.doors.set(door.id, { ...door });
    }
  }

  read(doorId: string): DoorSnapshot {
    const door = this.doors.get(doorId);
    if (!door) throw new Error(`Unknown door: ${doorId}`);
    return { ...door };
  }

  setOnline(online: boolean): void {
    this.online = online;
  }

  async commit(intent: VisitIntent): Promise<DoorSnapshot> {
    if (!this.online) throw new NetworkUnavailableError();

    const door = this.read(intent.doorId);
    if (door.revision !== intent.expectedRevision) {
      throw new RevisionConflictError(door);
    }

    const nextDoor: DoorSnapshot = {
      ...door,
      currentStatusId: intent.statusId,
      revision: door.revision + 1,
      lastVisitId: intent.commandId,
      lastVisitAt: intent.createdAt
    };
    this.doors.set(nextDoor.id, nextDoor);
    return { ...nextDoor };
  }
}

export class MemoryOutbox implements Outbox {
  private readonly entries = new Map<string, OutboxEntry>();

  async add(intent: VisitIntent): Promise<void> {
    if (this.entries.has(intent.commandId)) throw new Error(`Duplicate outbox command: ${intent.commandId}`);
    this.entries.set(intent.commandId, { ...intent, state: 'pending' });
  }

  async pending(): Promise<OutboxEntry[]> {
    return [...this.entries.values()].filter((entry) => entry.state === 'pending');
  }

  async all(): Promise<OutboxEntry[]> {
    return [...this.entries.values()].map((entry) => ({ ...entry }));
  }

  async markSynced(commandId: string): Promise<void> {
    this.entries.delete(commandId);
  }

  async markConflict(commandId: string, serverDoor: DoorSnapshot): Promise<void> {
    const entry = this.entries.get(commandId);
    if (!entry) throw new Error(`Unknown outbox entry: ${commandId}`);
    this.entries.set(commandId, { ...entry, state: 'conflict', conflict: serverDoor });
  }

  async markRejected(commandId: string, category: RejectionCategory): Promise<void> {
    const entry = this.entries.get(commandId);
    if (!entry) throw new Error(`Unknown outbox entry: ${commandId}`);
    this.entries.set(commandId, { ...entry, state: 'rejected', rejection: category });
  }

  async reapplyConflict(commandId: string): Promise<void> {
    const conflict = this.entries.get(commandId);
    if (!conflict || conflict.state !== 'conflict' || !conflict.conflict) {
      throw new Error('Only a recorded conflict can be reapplied.');
    }
    const chain = [...this.entries.values()]
      .filter((entry) => entry.doorId === conflict.doorId && entry.expectedRevision >= conflict.expectedRevision)
      .sort((left, right) => left.expectedRevision - right.expectedRevision || left.createdAt.localeCompare(right.createdAt));
    let revision = conflict.conflict.revision;
    for (const entry of chain) {
      if (entry.commandId !== commandId && entry.state !== 'pending') continue;
      this.entries.set(entry.commandId, {
        ...entry,
        expectedRevision: revision++,
        state: 'pending',
        conflict: undefined,
        rejection: undefined
      });
    }
  }

  async abandonConflict(commandId: string): Promise<void> {
    const conflict = this.entries.get(commandId);
    if (!conflict || conflict.state !== 'conflict') {
      throw new Error('Only a recorded conflict can be abandoned.');
    }
    for (const entry of [...this.entries.values()]) {
      if (entry.doorId === conflict.doorId && entry.expectedRevision >= conflict.expectedRevision) {
        this.entries.delete(entry.commandId);
      }
    }
  }
}

export class SyncLab {
  private flushing: Promise<readonly SyncEvent[]> | null = null;

  constructor(
    private readonly gateway: DoorWriteGateway,
    private readonly outbox: Outbox,
    private readonly authorId: string,
    private readonly now: () => Date = () => new Date(),
    private readonly createCommandId: () => string = () => crypto.randomUUID()
  ) {}

  async queueStatus(
    door: DoorSnapshot,
    statusId: DoorStatusId,
    note = ''
  ): Promise<VisitIntent> {
    if ((await this.outbox.all()).some((entry) => entry.doorId === door.id && entry.state !== 'pending')) {
      throw new Error('Resolve the existing door conflict before adding another visit.');
    }

    const pendingForDoor = (await this.outbox.pending()).filter((entry) => entry.doorId === door.id);
    const lastPending = pendingForDoor.reduce<OutboxEntry | undefined>(
      (latest, entry) => !latest || entry.expectedRevision > latest.expectedRevision ? entry : latest,
      undefined
    );
    const intent: VisitIntent = {
      commandId: this.createCommandId(),
      authorId: this.authorId,
      doorId: door.id,
      statusId,
      note,
      expectedRevision: lastPending ? lastPending.expectedRevision + 1 : door.revision,
      createdAt: this.now().toISOString()
    };
    await this.outbox.add(intent);
    return intent;
  }

  flush(): Promise<readonly SyncEvent[]> {
    if (this.flushing) return this.flushing;
    const pending = this.flushPending();
    this.flushing = pending;
    void pending.then(() => {
      if (this.flushing === pending) this.flushing = null;
    }, () => {
      if (this.flushing === pending) this.flushing = null;
    });
    return pending;
  }

  private async flushPending(): Promise<readonly SyncEvent[]> {
    const events: SyncEvent[] = [];
    const blockedDoors = new Set(
      (await this.outbox.all()).filter((entry) => entry.state !== 'pending').map((entry) => entry.doorId)
    );

    for (const entry of await this.outbox.pending()) {
      if (blockedDoors.has(entry.doorId)) continue;

      try {
        const door = await this.gateway.commit(entry);
        await this.outbox.markSynced(entry.commandId);
        events.push({ type: 'synced', commandId: entry.commandId, door });
      } catch (error) {
        if (error instanceof NetworkUnavailableError) return events;
        if (error instanceof RevisionConflictError) {
          await this.outbox.markConflict(entry.commandId, error.serverDoor);
          blockedDoors.add(entry.doorId);
          events.push({ type: 'conflict', commandId: entry.commandId, door: error.serverDoor });
          continue;
        }
        if (error instanceof SyncRejectedError) {
          await this.outbox.markRejected(entry.commandId, error.category);
          blockedDoors.add(entry.doorId);
          events.push({ type: 'rejected', commandId: entry.commandId, category: error.category });
          continue;
        }
        throw error;
      }
    }
    return events;
  }

  async reapplyConflict(commandId: string): Promise<void> {
    await this.outbox.reapplyConflict(commandId);
  }

  async abandonConflict(commandId: string): Promise<void> {
    await this.outbox.abandonConflict(commandId);
  }
}
