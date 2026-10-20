/** Bilan reproductible à partir des passages immuables, sans contenu sensible. */
function summarizeOuting(outing, visits) {
  const doors = new Set();
  const countsByStatus = {};
  const byParticipant = {};
  let visitCount = 0;
  let outsidePeriodCount = 0;
  let lateSyncCount = 0;
  for (const visit of visits) {
    const participant = outing.participants[visit.authorId];
    const at = visit.occurredAt?.toMillis();
    const start = participant?.joinedAt?.toMillis();
    const end = Math.min(participant?.leftAt?.toMillis() ?? Infinity, outing.endedAt?.toMillis() ?? Infinity);
    if (visit.voidedAt) continue;
    if (!participant || !Number.isFinite(at) || !Number.isFinite(start) || at < start || at > end) {
      outsidePeriodCount++;
      continue;
    }
    visitCount++;
    doors.add(visit.doorId);
    countsByStatus[visit.statusId] = (countsByStatus[visit.statusId] ?? 0) + 1;
    byParticipant[visit.authorId] = (byParticipant[visit.authorId] ?? 0) + 1;
    if (outing.endedAt && visit.syncedAt?.toMillis() > outing.endedAt.toMillis()) lateSyncCount++;
  }
  return { visitCount, doorCount: doors.size, countsByStatus, byParticipant, outsidePeriodCount, lateSyncCount };
}
module.exports = { summarizeOuting };
