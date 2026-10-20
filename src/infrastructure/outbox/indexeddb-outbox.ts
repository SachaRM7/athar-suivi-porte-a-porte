import type { DoorMarkerIntent, DoorSnapshot, OutboxEntry, RejectionCategory, VisitIntent } from '../../domain/doors/contracts';
import type { DoorMarkerOutbox } from '../../domain/sync/door-marker-outbox';
import { LocalStorageUnavailableError, type Outbox } from '../../domain/sync/outbox';

const DATABASE_NAME = 'athar-prototype-outbox';
const STORE_NAME = 'entries';
const MARKER_STORE_NAME = 'door-markers';

type StoredEntry = OutboxEntry & { storageKey: string };
type StoredMarker = DoorMarkerIntent & { storageKey: string };

/**
 * Persistance locale des écritures terrain.
 *
 * Une intention n'est « enregistrée sur l'appareil » qu'une fois la transaction IndexedDB
 * terminée (`oncomplete`), en durabilité stricte quand le navigateur la propose. Aucune
 * erreur IndexedDB n'est convertie en file mémoire : un passage qui ne survivrait pas à un
 * rechargement ne doit jamais être présenté comme sauvegardé. L'erreur remonte sous la
 * forme d'une `LocalStorageUnavailableError`, que l'interface affiche et propose de
 * réessayer. Les intentions déjà écrites restent intactes : rien n'est effacé pour
 * « réparer » la base.
 */

function storageKey(authorId: string, commandId: string): string {
  return `${authorId}:${commandId}`;
}

function errorName(error: unknown): string {
  return typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
}

/** Les erreurs logiques (doublon, conflit inconnu) restent telles quelles ; le reste est du stockage. */
function storageFailure(error: unknown): Error {
  if (error instanceof LocalStorageUnavailableError) return error;
  if (errorName(error) === 'ConstraintError') return new Error('Duplicate outbox command.');
  return new LocalStorageUnavailableError(error);
}

const WRITE_OPTIONS = { durability: 'strict' } as const;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      // Version 2 : ajout de la file du marqueur « à confier aux sœurs ». La montée doit
      // rester idempotente, un appareil de terrain pouvant encore porter la version 1.
      request = indexedDB.open(DATABASE_NAME, 2);
    } catch (error) {
      reject(new LocalStorageUnavailableError(error));
      return;
    }
    request.onerror = () => reject(new LocalStorageUnavailableError(request.error));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'storageKey' }).createIndex('authorId', 'authorId', { unique: false });
      }
      if (!database.objectStoreNames.contains(MARKER_STORE_NAME)) {
        database.createObjectStore(MARKER_STORE_NAME, { keyPath: 'storageKey' }).createIndex('authorId', 'authorId', { unique: false });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      // Un autre onglet qui monte de version ne doit pas rester bloqué par celui-ci.
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}

function transactionOn(database: IDBDatabase, storeNames: string | string[], mode: IDBTransactionMode): IDBTransaction {
  try {
    return mode === 'readwrite'
      ? database.transaction(storeNames, mode, WRITE_OPTIONS)
      : database.transaction(storeNames, mode);
  } catch (error) {
    throw new LocalStorageUnavailableError(error);
  }
}

/**
 * Exécute une transaction et ne résout qu'à sa validation complète. Une exception levée par
 * `action` annule la transaction et remonte telle quelle.
 */
async function runTransaction<T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  action: (transaction: IDBTransaction, setResult: (value: T) => void) => void
): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      let transaction: IDBTransaction;
      try {
        transaction = transactionOn(database, storeNames, mode);
      } catch (error) {
        reject(error);
        return;
      }
      let result: T;
      let actionError: unknown;
      transaction.oncomplete = () => resolve(result);
      // Une requête en échec annule la transaction : le rejet part de `onabort`, une seule fois.
      transaction.onabort = () => reject(storageFailure(actionError ?? transaction.error ?? new Error('IndexedDB transaction aborted.')));
      try {
        action(transaction, (value) => { result = value; });
      } catch (error) {
        actionError = error;
        try { transaction.abort(); } catch { reject(storageFailure(error)); }
      }
    });
  } finally {
    database.close();
  }
}

function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>, storeName = STORE_NAME): Promise<T> {
  return runTransaction<T>(storeName, mode, (transaction, setResult) => {
    const request = action(transaction.objectStore(storeName));
    request.onsuccess = () => setResult(request.result);
  });
}

function mutateUserEntries(
  authorId: string,
  mutation: (store: IDBObjectStore, entries: StoredEntry[]) => void
): Promise<void> {
  return runTransaction<void>(STORE_NAME, 'readwrite', (transaction) => {
    const store = transaction.objectStore(STORE_NAME);
    const request = store.index('authorId').getAll(authorId) as IDBRequest<StoredEntry[]>;
    request.onsuccess = () => {
      try {
        mutation(store, request.result);
      } catch {
        // L'appelant a conservé l'erreur logique ; on annule seulement la transaction.
        transaction.abort();
      }
    };
  });
}

function sortEntries(entries: readonly StoredEntry[]): OutboxEntry[] {
  return [...entries]
    .sort((left, right) => {
      if (left.doorId === right.doorId && left.expectedRevision !== right.expectedRevision) {
        return left.expectedRevision - right.expectedRevision;
      }
      return left.createdAt.localeCompare(right.createdAt) || left.commandId.localeCompare(right.commandId);
    })
    .map(({ storageKey: _storageKey, ...entry }) => entry);
}

export class IndexedDbOutbox implements Outbox {
  constructor(private readonly authorId: string) {}

  async add(intent: VisitIntent): Promise<void> {
    await this.addMany([intent]);
  }

  async addMany(intents: readonly VisitIntent[]): Promise<void> {
    if (intents.length === 0) return;
    if (intents.some((intent) => intent.authorId !== this.authorId)) throw new Error('Outbox user does not match intent author.');
    if (new Set(intents.map((intent) => intent.commandId)).size !== intents.length) throw new Error('Duplicate outbox command.');
    await runTransaction<void>(STORE_NAME, 'readwrite', (transaction) => {
      const store = transaction.objectStore(STORE_NAME);
      for (const intent of intents) {
        // `add` et non `put` : un UUID déjà présent fait échouer toute la transaction.
        store.add({ ...intent, state: 'pending', storageKey: storageKey(this.authorId, intent.commandId) });
      }
    });
  }

  async all(): Promise<OutboxEntry[]> {
    const entries = await withStore('readonly', (store) => store.index('authorId').getAll(this.authorId)) as StoredEntry[];
    return sortEntries(entries);
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
    await mutateWithLogicalErrors(this.authorId, (store, storedEntries) => {
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
    await mutateWithLogicalErrors(this.authorId, (store, storedEntries) => {
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
    await mutateWithLogicalErrors(this.authorId, (store, entries) => {
      const stored = entries.find((entry) => entry.commandId === commandId);
      if (!stored) throw new Error(`Unknown outbox entry: ${commandId}`);
      const { storageKey: _storageKey, ...entry } = stored;
      store.put({ ...change(entry), storageKey: storageKey(this.authorId, commandId) });
    });
  }
}

/** Variante de `mutateUserEntries` qui distingue l'erreur logique de la panne de stockage. */
async function mutateWithLogicalErrors(
  authorId: string,
  mutation: (store: IDBObjectStore, entries: StoredEntry[]) => void
): Promise<void> {
  let logicalError: unknown = null;
  try {
    await mutateUserEntries(authorId, (store, entries) => {
      try {
        mutation(store, entries);
      } catch (error) {
        logicalError = error;
        throw error;
      }
    });
  } catch (error) {
    if (logicalError) throw logicalError;
    throw storageFailure(error);
  }
}

/**
 * File du profil sensible, clé par porte : une nouvelle modification
 * remplace la précédente au lieu de s'empiler. Aucun passage n'est touché.
 */
export class IndexedDbDoorMarkerOutbox implements DoorMarkerOutbox {
  constructor(private readonly authorId: string) {}

  async add(intent: DoorMarkerIntent): Promise<void> {
    if (intent.authorId !== this.authorId) throw new Error('Outbox user does not match intent author.');
    await withStore(
      'readwrite',
      (store) => store.put({ ...intent, storageKey: storageKey(this.authorId, intent.doorId) }),
      MARKER_STORE_NAME
    );
  }

  async pending(): Promise<DoorMarkerIntent[]> {
    const stored = await withStore(
      'readonly',
      (store) => store.index('authorId').getAll(this.authorId),
      MARKER_STORE_NAME
    ) as StoredMarker[];
    return stored
      .map(({ storageKey: _storageKey, ...intent }) => intent)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.doorId.localeCompare(right.doorId));
  }

  /**
   * Retire l'intention seulement si c'est bien celle qui a été envoyée : une modification
   * faite pendant l'envoi (même porte, nouvel identifiant) reste en file.
   */
  async markSynced(doorId: string, commandId?: string): Promise<void> {
    await runTransaction<void>(MARKER_STORE_NAME, 'readwrite', (transaction) => {
      const store = transaction.objectStore(MARKER_STORE_NAME);
      const key = storageKey(this.authorId, doorId);
      const request = store.get(key) as IDBRequest<StoredMarker | undefined>;
      request.onsuccess = () => {
        if (!request.result) return;
        if (commandId && request.result.commandId !== commandId) return;
        store.delete(key);
      };
    });
  }
}

export type UnsyncedLocalWrites = { visits: number; profiles: number };

/** Ce qui serait perdu si la partition de cet utilisateur était effacée maintenant. */
export async function countUnsyncedLocalWrites(authorId: string): Promise<UnsyncedLocalWrites> {
  const [visits, profiles] = await Promise.all([
    new IndexedDbOutbox(authorId).all(),
    new IndexedDbDoorMarkerOutbox(authorId).pending()
  ]);
  return { visits: visits.length, profiles: profiles.length };
}

export async function clearIndexedDbOutboxForTests(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Efface la partition d'un utilisateur (passages et profils sensibles) en une seule
 * transaction : soit tout disparaît, soit rien. Les autres UID ne sont jamais touchés.
 */
export async function clearIndexedDbOutboxForUser(authorId: string): Promise<void> {
  try {
    await runTransaction<void>([STORE_NAME, MARKER_STORE_NAME], 'readwrite', (transaction) => {
      for (const name of [STORE_NAME, MARKER_STORE_NAME]) {
        const store = transaction.objectStore(name);
        const request = store.index('authorId').getAllKeys(authorId);
        request.onsuccess = () => {
          for (const key of request.result) store.delete(key);
        };
      }
    });
  } catch (error) {
    throw storageFailure(error);
  }
}
