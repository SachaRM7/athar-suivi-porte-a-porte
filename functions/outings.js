const { getFirestore, FieldPath, Timestamp } = require('firebase-admin/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { access, identifier, iso } = require('./pilotage-access');
const { summarizeOuting } = require('./outing-report');

function serialize(doc) {
  const data = doc.data();
  return { id: doc.id, zoneId: data.zoneId, zoneName: data.zoneName, title: data.title,
    ownerId: data.ownerId, startedAt: iso(data.startedAt), endedAt: iso(data.endedAt),
    participants: Object.fromEntries(Object.entries(data.participants).map(([id, p]) =>
      [id, { displayName: p.displayName, joinedAt: iso(p.joinedAt), leftAt: iso(p.leftAt) }])) };
}

exports.manageOuting = onCall(async request => {
  const { root, ref, uid } = await access(request);
  const id = identifier(request.data.outingId);
  const action = request.data.action;
  if (!['start', 'join', 'leave', 'end'].includes(action)) throw new HttpsError('invalid-argument', 'Action inconnue.');
  const outingRef = root.collection('outings').doc(id);
  await getFirestore().runTransaction(async tx => {
    const [memberDoc, outingDoc] = await tx.getAll(ref, outingRef);
    const member = memberDoc.data();
    if (member?.active !== true) throw new HttpsError('permission-denied', 'Membre actif requis.');
    const now = Timestamp.now();
    if (action === 'start') {
      if (outingDoc.exists) {
        if (outingDoc.data().ownerId === uid) return; // Rejeu après réponse réseau perdue.
        throw new HttpsError('already-exists', 'Sortie déjà créée.');
      }
      if (member.activeOuting) throw new HttpsError('failed-precondition', 'Termine ou quitte ta sortie actuelle.');
      const zoneId = identifier(request.data.zoneId);
      const zone = await tx.get(root.collection('zones').doc(zoneId));
      if (!zone.exists) throw new HttpsError('not-found', 'Zone introuvable.');
      const title = typeof request.data.title === 'string' ? request.data.title.trim() : '';
      if (!title || title.length > 80) throw new HttpsError('invalid-argument', 'Nom de sortie requis (80 caractères maximum).');
      tx.create(outingRef, { title, zoneId, zoneName: zone.data().name, ownerId: uid, startedAt: now, endedAt: null,
        participants: { [uid]: { displayName: member.displayName, joinedAt: now, leftAt: null } } });
      tx.update(ref, { activeOuting: { id, zoneId, title } });
      return;
    }
    if (!outingDoc.exists) throw new HttpsError('not-found', 'Sortie introuvable.');
    const outing = outingDoc.data();
    if (action === 'join') {
      if (outing.endedAt) throw new HttpsError('failed-precondition', 'Sortie terminée.');
      if (member.activeOuting?.id === id) return;
      if (member.activeOuting) throw new HttpsError('failed-precondition', 'Quitte ta sortie actuelle avant de rejoindre celle-ci.');
      if (outing.participants[uid]) throw new HttpsError('failed-precondition', 'Une participation terminée ne peut pas être rouverte.');
      // HYPOTHÈSE : 50 participants maximum ; aucun itinéraire ni suivi GPS personnel.
      if (Object.keys(outing.participants).length >= 50) throw new HttpsError('resource-exhausted', 'Cette sortie compte déjà 50 participants.');
      tx.update(outingRef, { participants: { ...outing.participants, [uid]: { displayName: member.displayName, joinedAt: now, leftAt: null } } });
      tx.update(ref, { activeOuting: { id, zoneId: outing.zoneId, title: outing.title } });
    } else if (action === 'leave') {
      if (!outing.participants[uid]) throw new HttpsError('permission-denied', 'Participation requise.');
      if (uid === outing.ownerId && !outing.endedAt) throw new HttpsError('failed-precondition', 'Le responsable doit terminer la sortie.');
      if (!outing.participants[uid].leftAt) tx.update(outingRef, { participants: { ...outing.participants, [uid]: { ...outing.participants[uid], leftAt: now } } });
      if (member.activeOuting?.id === id) tx.update(ref, { activeOuting: null });
    } else {
      if (uid !== outing.ownerId && member.role !== 'admin') throw new HttpsError('permission-denied', 'Responsable ou administrateur requis.');
      if (outing.endedAt) return;
      const participants = await tx.getAll(...Object.keys(outing.participants).map(id => root.collection('members').doc(id)));
      tx.update(outingRef, { endedAt: now, endedBy: uid });
      for (const participant of participants) {
        if (participant.data()?.activeOuting?.id === id) tx.update(participant.ref, { activeOuting: null });
      }
    }
  });
  return serialize(await outingRef.get());
});

exports.listOutings = onCall(async request => {
  const { root } = await access(request);
  let query = root.collection('outings').orderBy('startedAt', 'desc').orderBy(FieldPath.documentId(), 'desc').limit(26);
  if (request.data.cursor) {
    const cursor = request.data.cursor;
    if (!Number.isSafeInteger(cursor.at)) throw new HttpsError('invalid-argument', 'Page invalide.');
    query = query.startAfter(Timestamp.fromMillis(cursor.at), identifier(cursor.id));
  }
  const page = await query.get();
  const docs = page.docs.slice(0, 25);
  return { outings: docs.map(serialize), nextCursor: page.size > 25 ? { at: docs.at(-1).data().startedAt.toMillis(), id: docs.at(-1).id } : null };
});

exports.getOutingReport = onCall(async request => {
  const { root } = await access(request);
  const outingRef = root.collection('outings').doc(identifier(request.data.outingId));
  // Même instant de lecture pour la clôture, les participants et les passages.
  return getFirestore().runTransaction(async tx => {
    const outing = await tx.get(outingRef);
    if (!outing.exists) throw new HttpsError('not-found', 'Sortie introuvable.');
    const visits = await tx.get(root.collection('visits').where('outingId', '==', outing.id).limit(10001));
    if (visits.size > 10000) throw new HttpsError('resource-exhausted', 'Bilan trop volumineux. Aucun total partiel ne sera présenté.');
    return { outing: serialize(outing), ...summarizeOuting(outing.data(), visits.docs.map(doc => ({ ...doc.data(), syncedAt: doc.createTime }))),
      readAt: iso(visits.readTime), source: 'server' };
  }, { readOnly: true });
});

exports.recordMemberActivity = onDocumentCreated({ document: 'workspaces/{workspaceId}/visits/{visitId}', retry: true }, async event => {
  const visit = event.data?.data();
  const receivedAt = event.data?.createTime;
  if (!visit?.authorId || !receivedAt?.toMillis) return;
  const ref = getFirestore().doc(`workspaces/${event.params.workspaceId}/members/${visit.authorId}`);
  await getFirestore().runTransaction(async tx => {
    const member = await tx.get(ref);
    if (member.exists && (member.data().lastActivityAt?.toMillis() ?? 0) < receivedAt.toMillis()) {
      tx.update(ref, { lastActivityAt: receivedAt });
    }
  });
});
