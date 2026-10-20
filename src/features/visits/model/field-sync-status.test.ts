import { describe, expect, it } from 'vitest';
import { LocalStorageUnavailableError } from '../../../domain/sync/outbox';
import { localWriteErrorMessage, summarizeFieldSync } from './field-sync-status';

const entry = {
  commandId: '1c2e9f1a-uuid', authorId: 'member-a', doorId: 'door-a', statusId: 'retry', note: '',
  expectedRevision: 3, createdAt: '2026-08-09T20:00:00.000Z', state: 'pending' as const
};
const base = { online: true, entries: [], pendingProfiles: 0, deferral: null, failure: null };

describe('field sync summary', () => {
  it('does not announce server confirmation before reading the local outbox', () => {
    expect(summarizeFieldSync({ ...base, checking: true })).toMatchObject({ phase: 'checking', label: 'Vérification des saisies…' });
    expect(summarizeFieldSync(base).detail).toContain('confirmées par le serveur');
  });
  it('keeps a failed save visible even when the outbox is readable and empty', () => {
    expect(summarizeFieldSync({ ...base, localSaveFailure: 'Rien n’a été enregistré.' })).toMatchObject({ phase: 'save-error', label: 'Saisie non enregistrée' });
  });
  it('distinguishes the five states without exposing UUIDs or revisions', () => {
    const summaries = [
      summarizeFieldSync(base),
      summarizeFieldSync({ ...base, entries: [entry] }),
      summarizeFieldSync({ ...base, entries: [entry], online: false }),
      summarizeFieldSync({ ...base, entries: [{ ...entry, state: 'conflict' }] }),
      summarizeFieldSync({ ...base, entries: null })
    ];
    expect(summaries.map((summary) => summary.phase)).toEqual(['synced', 'pending', 'deferred', 'attention', 'storage-error']);
    for (const summary of summaries) {
      expect(`${summary.label} ${summary.detail ?? ''}`).not.toMatch(/uuid|revision|révision|\b3\b/i);
    }
  });

  it('says offline even when nothing waits, without inventing a pending write', () => {
    expect(summarizeFieldSync({ ...base, online: false })).toMatchObject({ phase: 'synced', label: 'Hors ligne' });
  });

  it('never reports "À jour" while a profile change is still only on the device', () => {
    expect(summarizeFieldSync({ ...base, pendingProfiles: 1 }).phase).toBe('pending');
  });

  it('separates an expired session and a server outage from a plain offline state', () => {
    expect(summarizeFieldSync({ ...base, entries: [entry], deferral: 'session' }).label).toBe('Reconnexion nécessaire');
    expect(summarizeFieldSync({ ...base, entries: [entry], deferral: 'server' }).phase).toBe('deferred');
    expect(summarizeFieldSync({ ...base, entries: [entry], failure: 'HTTP 418' }).phase).toBe('deferred');
  });

  it('explains a storage refusal as "nothing saved" and offers a retry', () => {
    const message = localWriteErrorMessage(new LocalStorageUnavailableError(new Error('QuotaExceededError')));
    expect(message).toMatch(/Rien n’a été enregistré/);
    expect(message).toMatch(/touche à nouveau/);
  });
});
