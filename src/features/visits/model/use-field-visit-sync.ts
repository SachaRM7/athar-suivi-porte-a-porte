import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DoorSnapshot, OutboxEntry } from '../../../domain/doors/contracts';
import { SyncLab } from '../../../domain/sync/sync-service';
import type { Outbox } from '../../../domain/sync/outbox';
import { flushDoorMarkers, type DoorMarkerOutbox } from '../../../domain/sync/door-marker-outbox';
import type { WorkspaceRepositories } from '../../../domain/workspace/repositories';
import { environment } from '../../../app/config/environment';
import { getFirebaseClient } from '../../../infrastructure/firebase/client';
import { FirestoreDoorGateway } from '../../../infrastructure/firestore/firestore-door-gateway';
import { FirestoreDoorMarkerGateway } from '../../../infrastructure/firestore/firestore-door-marker-gateway';

export type FieldVisitSync = {
  online: boolean;
  entries: readonly OutboxEntry[];
  reconciledDoors: readonly DoorSnapshot[];
  syncing: boolean;
  synchronize(): Promise<void>;
  reapplyConflict(commandId: string): Promise<void>;
  abandonConflict(commandId: string): Promise<void>;
  refresh(): Promise<void>;
};

function browserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

export function useFieldVisitSync(
  authorId: string,
  outbox: Outbox,
  markers: DoorMarkerOutbox,
  repositories: WorkspaceRepositories
): FieldVisitSync {
  const [online, setOnline] = useState(browserOnline);
  const [entries, setEntries] = useState<readonly OutboxEntry[]>([]);
  const [reconciledDoors, setReconciledDoors] = useState<readonly DoorSnapshot[]>([]);
  const [syncing, setSyncing] = useState(false);
  const sync = useMemo(() => {
    const client = getFirebaseClient();
    return new SyncLab(
      new FirestoreDoorGateway(client.firestore, environment.workspaceId, () => client.auth.currentUser?.uid ?? null, browserOnline),
      outbox,
      authorId
    );
  }, [authorId, outbox]);
  const markerWriter = useMemo(() => {
    const client = getFirebaseClient();
    return new FirestoreDoorMarkerGateway(client.firestore, environment.workspaceId, () => client.auth.currentUser?.uid ?? null);
  }, []);

  const refresh = useCallback(async () => {
    setEntries(await outbox.all());
  }, [outbox]);

  const synchronize = useCallback(async () => {
    if (!browserOnline()) {
      setOnline(false);
      await refresh();
      return;
    }
    setOnline(true);
    setSyncing(true);
    try {
      const entriesBeforeFlush = await outbox.all();
      // Les marqueurs partent dans la même passe, mais par leur propre chemin : ils
      // n'entrent ni dans la chaîne de révisions, ni dans la résolution de conflits.
      await flushDoorMarkers(markers, markerWriter);
      const events = await sync.flush();
      const refreshedDoors = await Promise.all(events.map(async (event) => {
        if (event.type !== 'rejected') {
          await repositories.reconcileDoorSnapshot(event.door);
          return repositories.doors.get(event.door.id);
        }
        const rejected = entriesBeforeFlush.find((entry) => entry.commandId === event.commandId);
        return rejected ? repositories.refreshDoor(rejected.doorId) : null;
      }));
      setReconciledDoors(refreshedDoors.filter((door): door is NonNullable<typeof door> => door !== null));
    } finally {
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

  return { online, entries, reconciledDoors, syncing, synchronize, reapplyConflict, abandonConflict, refresh };
}
