import { describe, expect, it } from 'vitest';
import { firestoreWriteErrorMessage, isRecoverableFirestoreCacheError } from './firestore-errors';

describe('Firestore write errors', () => {
  it('recognizes internal Firestore and IndexedDB cache failures', () => {
    expect(isRecoverableFirestoreCacheError({ code: 'firestore/internal' })).toBe(true);
    expect(isRecoverableFirestoreCacheError(new Error('Internal error.'))).toBe(true);
    expect(isRecoverableFirestoreCacheError(new Error('Error thrown when writing to IndexedDB (idb-set)'))).toBe(true);
    expect(isRecoverableFirestoreCacheError(new Error('QuotaExceededError'))).toBe(true);
  });

  it('does not treat an authorization failure as a cache failure', () => {
    expect(isRecoverableFirestoreCacheError({ code: 'permission-denied' })).toBe(false);
  });

  it('turns Firebase codes into actionable French messages', () => {
    expect(firestoreWriteErrorMessage({ code: 'firestore/permission-denied' }, 'fallback')).toContain('droits du workspace');
    expect(firestoreWriteErrorMessage({ code: 'unavailable' }, 'fallback')).toContain('connexion');
    expect(firestoreWriteErrorMessage({ code: 'failed-precondition' }, 'fallback')).toContain('Recharge le bâtiment');
    expect(firestoreWriteErrorMessage(new Error('unknown'), 'fallback')).toBe('fallback Détail technique : unknown');
    expect(firestoreWriteErrorMessage(null, 'fallback')).toBe('fallback');
  });
});
