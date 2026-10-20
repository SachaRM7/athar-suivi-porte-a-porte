import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DoorSnapshot, OutboxEntry } from '../../../domain/doors/contracts';
import { SyncLab, type SyncDeferralReason } from '../../../domain/sync/sync-service';
import type { Outbox } from '../../../domain/sync/outbox';
import { flushDoorMarkers, type DoorMarkerOutbox } from '../../../domain/sync/door-marker-outbox';
import type { WorkspaceRepositories } from '../../../domain/workspace/repositories';
import { environment } from '../../../app/config/environment';
import { firestoreRestAuthFor, getFirebaseClient } from '../../../infrastructure/firebase/client';
import { FirestoreDoorGateway } from '../../../infrastructure/firestore/firestore-door-gateway';
import { FirestoreDoorMarkerGateway } from '../../../infrastructure/firestore/firestore-door-marker-gateway';
import { localWriteErrorMessage, summarizeFieldSync, type FieldSyncSummary } from './field-sync-status';

export type FieldVisitSync = {
  online: boolean;
  entries: readonly OutboxEntry[];
  reconciledDoors: readonly DoorSnapshot[];
  syncing: boolean;
  /** État lisible de la sauvegarde : appareil, serveur, attente, conflit ou panne de stockage. */
  status: FieldSyncSummary;
  failedDoorId: string | null;
  reportLocalSave(doorId: string, error?: unknown): void;
  synchronize(): Promise<void>;
  reapplyConflict(commandId: string): Promise<void>;
  abandonConflict(commandId: string): Promise<void>;
  refresh(): Promise<void>;
};

function browserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Synchronisation interrompue.';
}

export function useFieldVisitSync(
  authorId: string,
  outbox: Outbox,
  markers: DoorMarkerOutbox,
  repositories: WorkspaceRepositories
): FieldVisitSync {
  const [online, setOnline] = useState(browserOnline);
  const [checking, setChecking] = useState(true);
  const [localSaveFailure, setLocalSaveFailure] = useState<{ doorId: string; message: string } | null>(null);
  const reportLocalSave = useCallback((doorId: string, error?: unknown) => {
    setLocalSaveFailure(current => error
      ? { doorId, message: localWriteErrorMessage(error) }
      : current?.doorId === doorId ? null : current);
  }, []);
  /** `null` : la file locale n'a pas pu être lue, ce qui n'est pas « rien en attente ». */
  const [entries, setEntries] = useState<readonly OutboxEntry[] | null>([]);
  const [pendingProfiles, setPendingProfiles] = useState(0);
  const [deferral, setDeferral] = useState<SyncDeferralReason | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [reconciledDoors, setReconciledDoors] = useState<readonly DoorSnapshot[]>([]);
  const [syncing, setSyncing] = useState(false);
  const sync = useMemo(() => {
    const client = getFirebaseClient();
    return new SyncLab(
      new FirestoreDoorGateway(client.firestore, environment.workspaceId, () => client.auth.currentUser?.uid ?? null, browserOnline, firestoreRestAuthFor(client)),
      outbox,
      authorId
    );
  }, [authorId, outbox]);
  const markerWriter = useMemo(() => {
    const client = getFirebaseClient();
    return new FirestoreDoorMarkerGateway(
      client.firestore,
      environment.workspaceId,
      () => client.auth.currentUser?.uid ?? null,
      firestoreRestAuthFor(client)
    );
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [nextEntries, nextProfiles] = await Promise.all([outbox.all(), markers.pending()]);
      setEntries(nextEntries);
      setPendingProfiles(nextProfiles.length);
    } catch {
      // Une file illisible n'est jamais affichée comme vide : l'état passe en panne de stockage.
      setEntries(null);
    } finally {
      setChecking(false);
    }
  }, [markers, outbox]);

  const synchronize = useCallback(async () => {
    if (!browserOnline()) {
      setOnline(false);
      await refresh();
      return;
    }
    setOnline(true);
    setSyncing(true);
    let nextDeferral: SyncDeferralReason | null = null;
    let nextFailure: string | null = null;
    try {
      // Les passages d'abord : un profil de porte refusé ne doit jamais bloquer leur envoi.
      try {
        const entriesBeforeFlush = await outbox.all();
        const events = await sync.flush();
        nextDeferral = events.find((event) => event.type === 'deferred')?.reason ?? null;
        const refreshedDoors = await Promise.all(events.map(async (event) => {
          if (event.type === 'deferred') return null;
          if (event.type !== 'rejected') {
            await repositories.reconcileDoorSnapshot(event.door);
            return repositories.doors.get(event.door.id);
          }
          const rejected = entriesBeforeFlush.find((entry) => entry.commandId === event.commandId);
          return rejected ? repositories.refreshDoor(rejected.doorId) : null;
        }));
        setReconciledDoors(refreshedDoors.filter((door): door is NonNullable<typeof door> => door !== null));
      } catch (error) {
        nextFailure = failureMessage(error);
      }
      // Les marqueurs partent ensuite, par leur propre chemin : ils n'entrent ni dans la
      // chaîne de révisions ni dans les conflits. Un échec les laisse en file.
      if (!nextDeferral) {
        try {
          const markerResult = await flushDoorMarkers(markers, markerWriter);
          if (markerResult.failed.length > 0) nextFailure ??= markerResult.failed[0]?.reason ?? 'Profil de porte non synchronisé.';
        } catch (error) {
          nextFailure ??= failureMessage(error);
        }
      }
    } finally {
      setDeferral(nextDeferral);
      setFailure(nextFailure);
      setSyncing(false);
      await refresh();
    }
  }, [markerWriter, markers, outbox, refresh, repositories, sync]);

  const reapplyConflict = useCallback(async (commandId: string) => {
    const conflict = (await outbox.all()).find((entry) => entry.commandId === commandId && entry.state === 'conflict');
    if (!conflict?.conflict) throw new Error('Conflit introuvable.');
    await repositories.reconcileDoorSnapshot(conflict.conflict);
    await sync.reapplyConflict(commandId);
    await refresh();
    await synchronize();
  }, [outbox, refresh, repositories, sync, synchronize]);

  const abandonConflict = useCallback(async (commandId: string) => {
    const conflict = (await outbox.all()).find((entry) => entry.commandId === commandId && entry.state === 'conflict');
    if (!conflict?.conflict) throw new Error('Conflit introuvable.');
    await sync.abandonConflict(commandId);
    const serverDoor = await repositories.refreshDoor(conflict.doorId);
    setReconciledDoors(serverDoor ? [serverDoor] : []);
    await refresh();
  }, [outbox, refresh, repositories, sync]);

  useEffect(() => {
    const handleOnline = () => { setOnline(true); void synchronize(); };
    const handleOffline = () => { setOnline(false); void refresh(); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    const initialSync = window.setTimeout(() => {
      void refresh().then(() => { if (browserOnline()) void synchronize(); });
    }, 0);
    return () => {
      window.clearTimeout(initialSync);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refresh, synchronize]);

  // `online` peut précéder la disponibilité du transport. Un fetch refusé doit être
  // réessayé même sans nouvel événement réseau ; les refus de session restent explicites.
  // L'intervalle survit à deux échecs identiques, contrairement à un timeout dépendant
  // uniquement d'une raison d'échec dont la valeur ne change pas.
  useEffect(() => {
    if (!online || (deferral !== 'offline' && deferral !== 'server' && !failure)) return undefined;
    const retry = window.setInterval(() => { if (browserOnline()) void synchronize(); }, deferral === 'offline' ? 5_000 : 30_000);
    return () => window.clearInterval(retry);
  }, [deferral, failure, online, synchronize]);

  const status = useMemo(
    () => summarizeFieldSync({ checking, localSaveFailure: localSaveFailure?.message, online, entries, pendingProfiles, deferral, failure }),
    [checking, localSaveFailure, deferral, entries, failure, online, pendingProfiles]
  );

  return { online, entries: entries ?? [], reconciledDoors, syncing, status, failedDoorId: localSaveFailure?.doorId ?? null, reportLocalSave, synchronize, reapplyConflict, abandonConflict, refresh };
}
