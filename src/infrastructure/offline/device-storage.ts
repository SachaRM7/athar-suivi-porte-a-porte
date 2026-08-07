import { clearIndexedDbOutboxForUser } from '../outbox/indexeddb-outbox';

const TRUSTED_DEVICE_KEY = 'athar.trusted-device';

export function isTrustedDevice(): boolean {
  return typeof window !== 'undefined' && window.localStorage.getItem(TRUSTED_DEVICE_KEY) === 'true';
}

export function setTrustedDevice(trusted: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TRUSTED_DEVICE_KEY, trusted ? 'true' : 'false');
}

export async function purgeUntrustedDevice(authorId: string): Promise<void> {
  await clearIndexedDbOutboxForUser(authorId);
  if (typeof window === 'undefined') return;
  const registrations = await navigator.serviceWorker?.getRegistrations?.() ?? [];
  await Promise.all(registrations.map((registration) => registration.active?.postMessage({ type: 'PURGE_ATHAR_DATA' })));
  if ('caches' in window) {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('athar-')).map((name) => caches.delete(name)));
  }
}
