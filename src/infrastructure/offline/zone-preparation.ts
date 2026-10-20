import { collection, doc, documentId, getDocFromCache, getDocFromServer, getDocsFromCache, getDocsFromServer, getPersistentCacheIndexManager, limit, orderBy, query, startAfter, where, type Firestore, type QueryConstraint } from 'firebase/firestore';
import { withBasePath } from '../../app/config/public-paths';
import { PREPARATION_DOCUMENT_BUDGET, type DataReceipt, type PreparationQuery, type PreparedAssets, type PreparedDocument } from '../../features/offline/model/zone-preparation';
import { isTrustedDevice } from './device-storage';
import { fromFirestoreBuilding, fromFirestoreDoor, fromFirestoreMember, fromFirestoreStatus, fromFirestoreVisit, fromFirestoreZone } from '../firestore/workspace-codecs';

const RECEIPT_CACHE = 'athar-preparations-v1';
export type StoredPreparation = { data: DataReceipt; assetVersion: string; persistentStorage: boolean };
export type PreparationIdentity = Pick<DataReceipt, 'projectId' | 'workspaceId' | 'userId' | 'zoneId'>;
const codecs = { members: fromFirestoreMember, statuses: fromFirestoreStatus, zones: fromFirestoreZone, buildings: fromFirestoreBuilding, doors: fromFirestoreDoor, visits: fromFirestoreVisit };

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('Préparation annulée.', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
    if (signal.aborted) abort();
  });
}

export function requirePersistentDevice(db: Firestore): void {
  if (!isTrustedDevice() || !getPersistentCacheIndexManager(db)) {
    throw new Error('Déclare cet appareil de confiance puis recharge Athar pour conserver les données de la zone.');
  }
}

/** Server reads never fall back to cache during preparation. Verification uses cache only. */
export function preparationReader(db: Firestore, workspaceId: string, source: 'server' | 'cache', signal: AbortSignal) {
  return async (scope: PreparationQuery): Promise<readonly PreparedDocument[]> => {
    signal.throwIfAborted();
    if (!(scope.collection in codecs)) throw new Error('Préparation incompatible. Prépare à nouveau la zone.');
    const path = `workspaces/${workspaceId}/${scope.collection}`;
    if (scope.id) {
      const reference = doc(db, path, scope.id);
      try {
        const snapshot = await abortable(source === 'server' ? getDocFromServer(reference) : getDocFromCache(reference), signal);
        signal.throwIfAborted();
        if (!snapshot.exists()) return [];
        codecs[scope.collection](snapshot.id, snapshot.data());
        return [{ id: snapshot.id, data: snapshot.data() }];
      } catch (error) {
        // A cached negative member lookup is allowed; an unavailable known document is not.
        if (source === 'cache' && typeof error === 'object' && error !== null && 'code' in error && error.code === 'unavailable') return [];
        throw error;
      }
    }
    const values: PreparedDocument[] = [];
    let after: string | null = null;
    do {
      signal.throwIfAborted();
      const constraints: QueryConstraint[] = scope.field ? [where(scope.field, '==', scope.value)] : [];
      constraints.push(orderBy(documentId()));
      if (after) constraints.push(startAfter(after));
      constraints.push(limit(200));
      const snapshots = await abortable((source === 'server' ? getDocsFromServer : getDocsFromCache)(query(collection(db, path), ...constraints)), signal);
      signal.throwIfAborted();
      for (const snapshot of snapshots.docs) {
        codecs[scope.collection](snapshot.id, snapshot.data());
        values.push({ id: snapshot.id, data: snapshot.data() });
      }
      if (values.length > PREPARATION_DOCUMENT_BUDGET) throw new Error('Cette zone est trop volumineuse pour être préparée sur cet appareil.');
      after = snapshots.size === 200 ? snapshots.docs.at(-1)!.id : null;
    } while (after);
    return values;
  };
}

function receiptKey(identity: PreparationIdentity): string {
  return withBasePath(`/offline-receipts/${[identity.projectId, identity.workspaceId, identity.userId, identity.zoneId].map(encodeURIComponent).join('/')}`);
}
export async function readPreparation(identity: PreparationIdentity): Promise<StoredPreparation | null> {
  const response = await (await caches.open(RECEIPT_CACHE)).match(receiptKey(identity));
  if (!response) return null;
  const value = await response.json() as StoredPreparation;
  if (!value.data || Object.entries(identity).some(([key, expected]) => value.data[key as keyof PreparationIdentity] !== expected)) return null;
  return value;
}
export async function writePreparation(value: StoredPreparation): Promise<void> {
  if (!isTrustedDevice()) throw new Error('Appareil non déclaré de confiance.');
  await (await caches.open(RECEIPT_CACHE)).put(receiptKey(value.data), new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } }));
}
export async function removePreparation(identity: PreparationIdentity): Promise<void> {
  await (await caches.open(RECEIPT_CACHE)).delete(receiptKey(identity));
}

export async function offlineAssets(type: 'CHECK_OFFLINE_ASSETS' | 'PREPARE_ZONE_ASSETS', signal: AbortSignal, progress: (step: string) => void = () => undefined): Promise<PreparedAssets> {
  if (!navigator.serviceWorker) throw new Error('La préparation hors ligne nécessite la version publiée d’Athar et un navigateur compatible.');
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => finish(new Error('Préparation trop longue. Vérifie le réseau puis réessaie.')), 180_000);
    const abort = () => finish(new Error('Préparation annulée.'));
    function finish(error?: Error, assets?: PreparedAssets) {
      window.clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      channel.port1.close();
      if (error) reject(error); else resolve(assets!);
    }
    signal.addEventListener('abort', abort, { once: true });
    channel.port1.onmessage = event => {
      if (event.data?.step) { progress(event.data.step); return; }
      if (event.data?.ok && event.data.assets) {
        const currentBuild = document.querySelector<HTMLMetaElement>('meta[name="athar-build"]')?.content;
        if (!currentBuild || currentBuild !== event.data.assets.version) {
          finish(new Error('Une nouvelle version attend. Ferme les autres onglets Athar puis rouvre l’application avant de préparer cette zone.'));
        } else finish(undefined, event.data.assets);
      }
      else finish(new Error(event.data?.error ?? 'Stockage hors ligne indisponible.'));
    };
    void navigator.serviceWorker.ready.then(registration => {
      if (signal.aborted) { abort(); return; }
      const worker = navigator.serviceWorker.controller ?? registration.active;
      if (!worker) { finish(new Error('Recharge Athar avant de préparer cette zone.')); return; }
      worker.postMessage({ type }, [channel.port2]);
    }).catch(() => finish(new Error('La préparation hors ligne est indisponible.')));
  });
}
