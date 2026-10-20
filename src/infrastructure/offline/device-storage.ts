import { clearIndexedDbOutboxForUser, countUnsyncedLocalWrites, type UnsyncedLocalWrites } from '../outbox/indexeddb-outbox';

const TRUSTED_DEVICE_KEY = 'athar.trusted-device';
/**
 * Drapeau technique (pas une donnée métier) : une purge de déconnexion n'a pas pu aller au
 * bout. Il contient seulement l'UID concerné, pour reprendre l'effacement au prochain
 * démarrage sans session.
 */
const PENDING_PURGE_KEY = 'athar.pending-purge';

function readStorage(key: string): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (typeof window === 'undefined') return;
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Un stockage de préférences indisponible ne bloque ni la session ni la purge.
  }
}

export function isTrustedDevice(): boolean {
  return readStorage(TRUSTED_DEVICE_KEY) === 'true';
}

export function setTrustedDevice(trusted: boolean): void {
  writeStorage(TRUSTED_DEVICE_KEY, trusted ? 'true' : 'false');
}

/**
 * Écritures locales qui seraient perdues par une purge. `null` signifie « illisible » :
 * on ne peut pas affirmer qu'il n'y a rien à perdre, l'appelant doit le traiter comme un risque.
 */
export async function unsyncedLocalWrites(authorId: string): Promise<UnsyncedLocalWrites | null> {
  try {
    return await countUnsyncedLocalWrites(authorId);
  } catch {
    return null;
  }
}

export type PurgeStep = 'file locale' | 'service worker' | 'caches hors ligne' | 'cache Firestore';

export type PurgeReport = { complete: boolean; failed: readonly PurgeStep[] };

/**
 * Efface les données Athar de cet UID sur un appareil non déclaré de confiance. Chaque étape
 * est tentée même si une précédente échoue, puis le résultat est rendu tel quel : une purge
 * partielle n'est jamais présentée comme réussie.
 */
export async function purgeUntrustedDevice(authorId: string, extraSteps: readonly { step: PurgeStep; run(): Promise<boolean> }[] = []): Promise<PurgeReport> {
  const steps: { step: PurgeStep; run(): Promise<unknown> }[] = [
    { step: 'file locale', run: () => clearIndexedDbOutboxForUser(authorId) },
    {
      step: 'service worker',
      run: async () => {
        if (typeof navigator === 'undefined') return;
        const registrations = await navigator.serviceWorker?.getRegistrations?.() ?? [];
        await Promise.all(registrations.map((registration) => registration.active?.postMessage({ type: 'PURGE_ATHAR_DATA' })));
      }
    },
    {
      step: 'caches hors ligne',
      run: async () => {
        if (typeof window === 'undefined' || !('caches' in window)) return;
        const names = await caches.keys();
        await Promise.all(names.filter((name) => name.startsWith('athar-')).map((name) => caches.delete(name)));
      }
    },
    ...extraSteps.map(({ step, run }) => ({ step, run: async () => { if (!(await run())) throw new Error(`${step} non effacé`); } }))
  ];
  const outcomes = await Promise.allSettled(steps.map(({ run }) => run()));
  const failed = steps.filter((_, index) => outcomes[index]?.status === 'rejected').map(({ step }) => step);
  writeStorage(PENDING_PURGE_KEY, failed.length > 0 ? authorId : null);
  return { complete: failed.length === 0, failed };
}

/** UID dont la purge est restée incomplète, ou `null`. */
export function pendingPurge(): string | null {
  return readStorage(PENDING_PURGE_KEY);
}

export function forgetPendingPurge(): void {
  writeStorage(PENDING_PURGE_KEY, null);
}
