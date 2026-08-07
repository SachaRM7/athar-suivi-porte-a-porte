import type { Outbox } from '../../../domain/sync/outbox';
import { assertDoor, assertVisit } from '../../../domain/workspace/invariants';
import type { Door, Status, Visit } from '../../../domain/workspace/models';
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
  const pendingForDoor = entries.filter((entry) => entry.doorId === door.id && entry.state === 'pending');
  if (pendingForDoor.length > 0) {
    throw new Error('A local visit is already waiting for this door.');
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
    lastVisitId: visit.id
  };

  assertDoor(nextDoor);
  assertVisit(visit);
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
