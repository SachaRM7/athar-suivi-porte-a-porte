import type { Outbox } from '../../../domain/sync/outbox';
import { assertDoor, assertVisit } from '../../../domain/workspace/invariants';
import type { Door, Status, Visit } from '../../../domain/workspace/models';
import { doorFollowUp } from '../../../domain/workspace/follow-up';
import type { WorkspaceRepositories } from '../../../domain/workspace/repositories';

export type RecordLocalVisitInput = {
  doorId: string;
  statusId: string;
  note: string;
  authorId: string;
  now?: Date;
  createId?: () => string;
};

export type RecordLocalVisitResult = {
  door: Door;
  visit: Visit;
};

export type RecordLocalVisitsInput = Omit<RecordLocalVisitInput, 'doorId' | 'createId'> & {
  doorIds: readonly string[];
  createId?: () => string;
};

function normalizeNote(note: string): string {
  return note.trim().replace(/\s+/g, ' ');
}

function requireActiveStatus(statuses: readonly Status[], statusId: string): Status {
  const status = statuses.find((candidate) => candidate.id === statusId);
  if (!status || !status.active) throw new Error('Visit status must be active.');
  return status;
}

export async function recordLocalVisit(
  repositories: WorkspaceRepositories,
  outbox: Outbox,
  input: RecordLocalVisitInput
): Promise<RecordLocalVisitResult> {
  const [door, statuses, member] = await Promise.all([
    repositories.doors.get(input.doorId),
    repositories.statuses.list(),
    repositories.members.get(input.authorId)
  ]);
  if (!door) throw new Error('Door not found.');
  if (!door.active) throw new Error('Cannot record a visit for an archived door.');
  if (!member?.active) throw new Error('Visit author must be an active member.');
  requireActiveStatus(statuses, input.statusId);

  const entries = await outbox.all();
  if (entries.some((entry) => entry.doorId === door.id && entry.state !== 'pending')) {
    throw new Error('Resolve the existing door conflict before adding another visit.');
  }
  // Plusieurs passages hors ligne sur une même porte forment une chaîne de révisions :
  // la projection locale doit déjà porter le dernier maillon en attente.
  const lastPending = entries
    .filter((entry) => entry.doorId === door.id && entry.state === 'pending')
    .reduce<number | null>((latest, entry) => latest === null || entry.expectedRevision > latest ? entry.expectedRevision : latest, null);
  if (lastPending !== null && door.revision !== lastPending + 1) {
    throw new Error('The local door projection is behind its pending visits.');
  }

  const occurredAt = (input.now ?? new Date()).toISOString();
  const visitId = input.createId?.() ?? crypto.randomUUID();
  const visit: Visit = {
    id: visitId,
    doorId: door.id,
    statusId: input.statusId,
    note: normalizeNote(input.note),
    authorId: input.authorId,
    occurredAt,
    syncedAt: null,
    doorRevision: door.revision + 1,
    replacesVisitId: null,
    voidedAt: null
  };
  const nextDoor: Door = {
    ...door,
    currentStatusId: input.statusId,
    revision: door.revision + 1,
    lastVisitId: visit.id,
    lastVisitAt: occurredAt
  };

  assertDoor(nextDoor);
  assertVisit(visit);
  // L'ordre compte : l'intention est durable avant que la projection affiche le passage.
  // Si le stockage refuse, rien n'est montré comme enregistré.
  await outbox.add({
    commandId: visit.id,
    authorId: input.authorId,
    doorId: door.id,
    statusId: input.statusId,
    note: visit.note,
    expectedRevision: door.revision,
    createdAt: occurredAt
  });
  await repositories.commitVisitAndDoor(visit, nextDoor);
  return { door: nextDoor, visit };
}

/** Builds every passage before committing their local projection as one group. */
export async function recordLocalVisits(
  repositories: WorkspaceRepositories,
  outbox: Outbox,
  input: RecordLocalVisitsInput
): Promise<readonly RecordLocalVisitResult[]> {
  const doorIds = [...new Set(input.doorIds)];
  if (doorIds.length === 0) return [];
  const [doors, statuses, member, entries] = await Promise.all([
    Promise.all(doorIds.map((doorId) => repositories.doors.get(doorId))),
    repositories.statuses.list(),
    repositories.members.get(input.authorId),
    outbox.all()
  ]);
  if (!member?.active) throw new Error('Visit author must be an active member.');
  requireActiveStatus(statuses, input.statusId);
  if (doors.some((door) => !door)) throw new Error('Door not found.');
  const resolvedDoors = doors as Door[];
  if (resolvedDoors.some((door) => !door.active)) throw new Error('Cannot record a visit for an archived door.');
  // Défense en profondeur : un geste groupé n'écrit jamais sur une porte sortie du suivi.
  if (resolvedDoors.some((door) => doorFollowUp(door) === 'excluded')) {
    throw new Error('A grouped action cannot target a door excluded from follow-up.');
  }
  if (entries.some((entry) => doorIds.includes(entry.doorId))) {
    throw new Error('Resolve the existing door conflict before adding another visit.');
  }

  const occurredAt = (input.now ?? new Date()).toISOString();
  const results = resolvedDoors.map((door): RecordLocalVisitResult => {
    const visit: Visit = {
      id: input.createId?.() ?? crypto.randomUUID(), doorId: door.id, statusId: input.statusId,
      note: normalizeNote(input.note), authorId: input.authorId, occurredAt, syncedAt: null,
      doorRevision: door.revision + 1, replacesVisitId: null, voidedAt: null
    };
    const nextDoor: Door = { ...door, currentStatusId: input.statusId, revision: door.revision + 1, lastVisitId: visit.id, lastVisitAt: occurredAt };
    assertDoor(nextDoor);
    assertVisit(visit);
    return { door: nextDoor, visit };
  });

  // Une seule transaction pour tout le groupe, avant la projection : un échec de stockage
  // n'en laisse aucun affiché comme enregistré, et un succès les rend tous durables.
  await outbox.addMany(results.map(({ visit, door }) => ({
    commandId: visit.id, authorId: input.authorId, doorId: door.id, statusId: input.statusId,
    note: visit.note, expectedRevision: door.revision - 1, createdAt: occurredAt
  })));
  await repositories.commitVisitsAndDoors(results.map(({ visit, door }) => ({ visit, door })));
  return results;
}
