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

export class IndexedDbOutbox implements Outbox {
  constructor(private readonly authorId: string) {}

  async add(intent: VisitIntent): Promise<void> {
    if (intent.authorId !== this.authorId) throw new Error('Outbox user does not match intent author.');
    await withStore('readwrite', (store) => store.put({ ...intent, state: 'pending', storageKey: storageKey(this.authorId, intent.commandId) }));
  }

  async all(): Promise<OutboxEntry[]> {
    const entries = await withStore('readonly', (store) => store.index('authorId').getAll(this.authorId)) as StoredEntry[];
    return entries
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
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

  private async update(commandId: string, change: (entry: OutboxEntry) => OutboxEntry): Promise<void> {
    const key = storageKey(this.authorId, commandId);
    const stored = await withStore('readonly', (store) => store.get(key)) as StoredEntry | undefined;
    if (!stored) throw new Error(`Unknown outbox entry: ${commandId}`);
    const { storageKey: _storageKey, ...entry } = stored;
    await withStore('readwrite', (store) => store.put({ ...change(entry), storageKey: key }));
  }
}

export async function clearIndexedDbOutboxForTests(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}
