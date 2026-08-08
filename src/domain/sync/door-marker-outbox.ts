import type { DoorMarkerIntent } from '../doors/contracts';

/**
 * File d'attente du marqueur « à confier aux sœurs ».
 *
 * Séparée de l'`Outbox` des passages : elle n'a ni révision attendue, ni conflit, ni
 * rejet à rejouer. La dernière intention gagne, par porte et par auteur.
 */
export interface DoorMarkerOutbox {
  add(intent: DoorMarkerIntent): Promise<void>;
  pending(): Promise<DoorMarkerIntent[]>;
  markSynced(doorId: string): Promise<void>;
}

export type DoorMarkerWriter = {
  apply(intent: DoorMarkerIntent): Promise<void>;
};

export class MemoryDoorMarkerOutbox implements DoorMarkerOutbox {
  private readonly intents = new Map<string, DoorMarkerIntent>();

  async add(intent: DoorMarkerIntent): Promise<void> {
    this.intents.set(intent.doorId, { ...intent });
  }

  async pending(): Promise<DoorMarkerIntent[]> {
    return [...this.intents.values()]
      .map((intent) => ({ ...intent }))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.doorId.localeCompare(right.doorId));
  }

  async markSynced(doorId: string): Promise<void> {
    this.intents.delete(doorId);
  }
}

export type DoorMarkerFlushResult = {
  synced: readonly string[];
  failed: readonly { doorId: string; reason: string }[];
};

/**
 * Vide la file. Une intention qui échoue reste en attente : le marqueur repartira à la
 * prochaine passe plutôt que de disparaître silencieusement.
 */
export async function flushDoorMarkers(outbox: DoorMarkerOutbox, writer: DoorMarkerWriter): Promise<DoorMarkerFlushResult> {
  const synced: string[] = [];
  const failed: { doorId: string; reason: string }[] = [];
  for (const intent of await outbox.pending()) {
    try {
      await writer.apply(intent);
      await outbox.markSynced(intent.doorId);
      synced.push(intent.doorId);
    } catch (error) {
      failed.push({ doorId: intent.doorId, reason: error instanceof Error ? error.message : 'Écriture du marqueur refusée.' });
    }
  }
  return { synced, failed };
}
