import type { DoorMarkerOutbox } from '../../../domain/sync/door-marker-outbox';
import { assertDoor } from '../../../domain/workspace/invariants';
import type { Door, DoorFoyer } from '../../../domain/workspace/models';
import type { WorkspaceRepositories } from '../../../domain/workspace/repositories';

export type MarkDoorForSistersInput = {
  doorId: string;
  sisters: boolean;
  authorId: string;
  now?: Date;
  createId?: () => string;
};

export type UpdateDoorProfileInput = {
  doorId: string;
  authorId: string;
  foyer: DoorFoyer;
  sisters: boolean;
  now?: Date;
  createId?: () => string;
};

/** Met à jour ensemble les deux champs sensibles, sans créer de passage. */
export async function updateDoorProfile(
  repositories: WorkspaceRepositories,
  markers: DoorMarkerOutbox,
  input: UpdateDoorProfileInput
): Promise<Door> {
  const [door, member] = await Promise.all([
    repositories.doors.get(input.doorId),
    repositories.members.get(input.authorId)
  ]);
  if (!door) throw new Error('Door not found.');
  if (!door.active) throw new Error('Cannot update an archived door.');
  if (!member?.active) throw new Error('Profile author must be an active member.');

  const nextDoor: Door = { ...door, foyer: input.foyer, sisters: input.sisters };
  assertDoor(nextDoor);
  await repositories.commitDoorMarker(nextDoor);
  await markers.add({
    commandId: input.createId?.() ?? crypto.randomUUID(),
    authorId: input.authorId,
    doorId: door.id,
    foyer: nextDoor.foyer,
    sisters: nextDoor.sisters,
    createdAt: (input.now ?? new Date()).toISOString()
  });
  return nextDoor;
}

/**
 * Bascule le marqueur « à confier aux sœurs » sur une porte.
 *
 * Le marqueur est cumulable avec n'importe quel statut : il ne crée aucun passage, ne
 * change pas le statut courant et ne fait pas avancer la révision. Le corriger, c'est
 * simplement le rebasculer — contrairement à un passage, qui ne se corrige qu'en en
 * ajoutant un autre.
 */
export async function markDoorForSisters(
  repositories: WorkspaceRepositories,
  markers: DoorMarkerOutbox,
  input: MarkDoorForSistersInput
): Promise<Door> {
  const door = await repositories.doors.get(input.doorId);
  if (!door) throw new Error('Door not found.');
  return updateDoorProfile(repositories, markers, {
    ...input,
    foyer: door.foyer
  });
}
