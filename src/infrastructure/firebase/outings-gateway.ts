import { httpsCallable } from 'firebase/functions';
import { getFirebaseClient } from './client';
import { environment } from '../../app/config/environment';

export type Outing = {
  id: string; zoneId: string; zoneName: string; title: string; ownerId: string;
  startedAt: string; endedAt: string | null;
  participants: Record<string, { displayName: string; joinedAt: string; leftAt: string | null }>;
};
export type OutingCursor = { at: number; id: string } | null;
export type OutingReport = {
  outing: Outing; visitCount: number; doorCount: number; outsidePeriodCount: number; lateSyncCount: number;
  countsByStatus: Record<string, number>; byParticipant: Record<string, number>; readAt: string; source: 'server';
};
export async function listOutings(cursor: OutingCursor) {
  return (await httpsCallable<unknown, { outings: Outing[]; nextCursor: OutingCursor }>(getFirebaseClient().functions, 'listOutings', { timeout: 30_000 })({ workspaceId: environment.workspaceId, cursor })).data;
}
export async function manageOuting(input: { action: 'start' | 'join' | 'leave' | 'end'; outingId: string; zoneId?: string; title?: string }) {
  return (await httpsCallable<unknown, Outing>(getFirebaseClient().functions, 'manageOuting', { timeout: 30_000 })({ workspaceId: environment.workspaceId, ...input })).data;
}
export async function getOutingReport(outingId: string) {
  return (await httpsCallable<unknown, OutingReport>(getFirebaseClient().functions, 'getOutingReport', { timeout: 30_000 })({ workspaceId: environment.workspaceId, outingId })).data;
}
export function pilotageError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (['functions/failed-precondition', 'functions/aborted', 'functions/resource-exhausted', 'functions/invalid-argument'].includes(code) && error instanceof Error) return error.message;
  if (code === 'functions/permission-denied') return 'Tes droits ne permettent plus cette action. Actualise la page.';
  return 'Le serveur ne peut pas confirmer cette action. Reconnecte-toi puis actualise avant de réessayer.';
}
export const pilotageDate = (value: string | null) => value ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Indisponible';
