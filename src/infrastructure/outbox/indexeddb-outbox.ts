import type { DoorSnapshot, OutboxEntry, RejectionCategory, VisitIntent } from '../../domain/doors/contracts';
import type { Outbox } from '../../domain/sync/outbox';

const DATABASE_NAME = 'athar-prototype-outbox';
const STORE_NAME = 'entries';

type StoredEntry = OutboxEntry & { storageKey: string };

function storageKey(authorId: string, commandId: string): string {
  return `${authorId}:${commandId}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE_NAME, { keyPath: 'storageKey' });
      store.createIndex('authorId', 'authorId', { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = action(transaction.objectStore(STORE_NAME));
      let result: T;
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error ?? request.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    });
  } finally {
    database.close();
  }
}

async function mutateUserEntries(
  authorId: string,
  mutation: (store: IDBObjectStore, entries: StoredEntry[]) => void
): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const request = transaction.objectStore(STORE_NAME).index('authorId').getAll(authorId) as IDBRequest<StoredEntry[]>;
      let mutationError: unknown;
      request.onsuccess = () => {
        try {
          mutation(transaction.objectStore(STORE_NAME), request.result);
        } catch (error) {
          mutationError = error;
          transaction.abort();
        }
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? request.error);
      transaction.onabort = () => reject(mutationError ?? transaction.error ?? new Error('IndexedDB transaction aborted.'));
    });
  } finally {
    database.close();
  }
}

export class IndexedDbOutbox implements Outbox {
  constructor(private readonly authorId: string) {}

  async add(intent: VisitIntent): Promise<void> {
    if (intent.authorId !== this.authorId) throw new Error('Outbox user does not match intent author.');
    await withStore('readwrite', (store) => store.add({ ...intent, state: 'pending', storageKey: storageKey(this.authorId, intent.commandId) }));
  }

  async all(): Promise<OutboxEntry[]> {
    const entries = await withStore('readonly', (store) => store.index('authorId').getAll(this.authorId)) as StoredEntry[];
    return entries
      .sort((left, right) => {
        if (left.doorId === right.doorId && left.expectedRevision !== right.expectedRevision) {
          return left.expectedRevision - right.expectedRevision;
        }
        return left.createdAt.localeCompare(right.createdAt) || left.commandId.localeCompare(right.commandId);
      })
      .map(({ storageKey: _storageKey, ...entry }) => entry);
  }

  async pending(): Promise<OutboxEntry[]> {
    return (await this.all()).filter((entry) => entry.state === 'pending');
  }

  async markSynced(commandId: string): Promise<void> {
    await withStore('readwrite', (store) => store.delete(storageKey(this.authorId, commandId)));
  }

  async markConflict(commandId: string, serverDoor: DoorSnapshot): Promise<void> {
    await this.update(commandId, (entry) => ({ ...entry, state: 'conflict', conflict: serverDoor }));
  }

  async markRejected(commandId: string, category: RejectionCategory): Promise<void> {
    await this.update(commandId, (entry) => ({ ...entry, state: 'rejected', rejection: category }));
  }

  async reapplyConflict(commandId: string): Promise<void> {
    await mutateUserEntries(this.authorId, (store, storedEntries) => {
      const entries = storedEntries.map(({ storageKey: _storageKey, ...entry }) => entry);
      const conflict = entries.find((entry) => entry.commandId === commandId);
      if (!conflict || conflict.state !== 'conflict' || !conflict.conflict) {
        throw new Error('Only a recorded conflict can be reapplied.');
      }
      const chain = entries
        .filter((entry) => entry.doorId === conflict.doorId && entry.expectedRevision >= conflict.expectedRevision)
        .sort((left, right) => left.expectedRevision - right.expectedRevision || left.createdAt.localeCompare(right.createdAt));
      let revision = conflict.conflict.revision;
      for (const entry of chain) {
        if (entry.commandId !== commandId && entry.state !== 'pending') continue;
        store.put({
          ...entry,
          expectedRevision: revision++,
          state: 'pending',
          conflict: undefined,
          rejection: undefined,
          storageKey: storageKey(this.authorId, entry.commandId)
        });
      }
    });
  }

  async abandonConflict(commandId: string): Promise<void> {
    await mutateUserEntries(this.authorId, (store, storedEntries) => {
      const entries = storedEntries.map(({ storageKey: _storageKey, ...entry }) => entry);
      const conflict = entries.find((entry) => entry.commandId === commandId);
      if (!conflict || conflict.state !== 'conflict') {
        throw new Error('Only a recorded conflict can be abandoned.');
      }
      for (const entry of entries) {
        if (entry.doorId === conflict.doorId && entry.expectedRevision >= conflict.expectedRevision) {
          store.delete(storageKey(this.authorId, entry.commandId));
        }
      }
    });
  }

  private async update(commandId: string, change: (entry: OutboxEntry) => OutboxEntry): Promise<void> {
    await mutateUserEntries(this.authorId, (store, entries) => {
      const stored = entries.find((entry) => entry.commandId === commandId);
      if (!stored) throw new Error(`Unknown outbox entry: ${commandId}`);
      const { storageKey: _storageKey, ...entry } = stored;
      store.put({ ...change(entry), storageKey: storageKey(this.authorId, commandId) });
    });
  }
}

export async function clearIndexedDbOutboxForTests(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function clearIndexedDbOutboxForUser(authorId: string): Promise<void> {
  await mutateUserEntries(authorId, (store, entries) => {
    for (const entry of entries) store.delete(entry.storageKey);
  });
}
