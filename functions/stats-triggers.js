const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { rebuildWorkspaceStats, compareTime } = require('./stats-rebuild');

const trigger = collection => onDocumentWritten({
  document: `workspaces/{workspaceId}/${collection}/{documentId}`,
  retry: true, timeoutSeconds: 540, memory: '512MiB', maxInstances: 2
}, async event => {
  if (collection === 'doors' && event.data?.before?.exists && event.data?.after?.exists) {
    const relevant = ['buildingId', 'zoneId', 'active', 'currentStatusId', 'revision', 'lastVisitId', 'lastVisitAt'];
    const before = event.data.before.data(), after = event.data.after.data();
    if (relevant.every(field => JSON.stringify(before[field]) === JSON.stringify(after[field]))) return;
  }
  const db = getFirestore();
  // The emulator shares trigger registrations across test projects; preserve project isolation.
  if (event.project && event.project !== db.projectId) return;
  const state = await db.doc(`workspaces/${event.params.workspaceId}/statsState/current`).get();
  const eventTime = event.data?.after?.exists ? event.data.after.updateTime : Timestamp.fromDate(new Date(event.time));
  // A completed snapshot already includes this event; avoid rescanning for every item in a batch.
  if (state.data()?.state === 'ready' && state.data()?.sourceReadTime && compareTime(state.data().sourceReadTime, eventTime) >= 0) return;
  try { return await rebuildWorkspaceStats(db, event.params.workspaceId); }
  catch (error) {
    // A deterministic size limit needs an operator, not a retry storm. Transient errors retry.
    if (['stats-read-budget-exceeded', 'stats-zone-budget-exceeded', 'stats-catalogue-budget-exceeded', 'stats-publish-budget-exceeded'].includes(error.message)) return;
    throw error;
  }
});

exports.projectWorkspaceDoor = trigger('doors');
exports.projectWorkspaceVisit = trigger('visits');
exports.projectWorkspaceBuilding = trigger('buildings');
exports.projectWorkspaceZone = trigger('zones');
exports.projectWorkspaceCatalogue = trigger('zoneCatalogues');
exports.rebuildZoneStats = onCall({ timeoutSeconds: 540, memory: '512MiB' }, async request => {
  const workspaceId = request.data?.workspaceId;
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Authentification requise.');
  if (typeof workspaceId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(workspaceId)) throw new HttpsError('invalid-argument', 'Workspace invalide.');
  const db = getFirestore();
  const member = await db.doc(`workspaces/${workspaceId}/members/${request.auth.uid}`).get();
  if (request.auth.token.role !== 'admin' || member.data()?.role !== 'admin' || member.data()?.active !== true) throw new HttpsError('permission-denied', 'Administrateur actif requis.');
  return rebuildWorkspaceStats(db, workspaceId);
});
