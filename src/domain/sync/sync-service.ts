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
      lastVisitId: intent.commandId
    };
    this.doors.set(nextDoor.id, nextDoor);
    return { ...nextDoor };
  }
}

export class MemoryOutbox implements Outbox {
  private readonly entries = new Map<string, OutboxEntry>();

  async add(intent: VisitIntent): Promise<void> {
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
}

export class SyncLab {
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
    const lastPending = pendingForDoor.at(-1);
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

  async flush(): Promise<void> {
    const blockedDoors = new Set(
      (await this.outbox.all()).filter((entry) => entry.state !== 'pending').map((entry) => entry.doorId)
    );

    for (const entry of await this.outbox.pending()) {
      if (blockedDoors.has(entry.doorId)) continue;

      try {
        await this.gateway.commit(entry);
        await this.outbox.markSynced(entry.commandId);
      } catch (error) {
        if (error instanceof NetworkUnavailableError) return;
        if (error instanceof RevisionConflictError) {
          await this.outbox.markConflict(entry.commandId, error.serverDoor);
          blockedDoors.add(entry.doorId);
          continue;
        }
        if (error instanceof SyncRejectedError) {
          await this.outbox.markRejected(entry.commandId, error.category);
          blockedDoors.add(entry.doorId);
          continue;
        }
        throw error;
      }
    }
  }
}
