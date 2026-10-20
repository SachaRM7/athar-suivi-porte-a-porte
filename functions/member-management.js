const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue, FieldPath, Timestamp } = require('firebase-admin/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { randomUUID } = require('node:crypto');
const { access, identifier, iso } = require('./pilotage-access');

exports.listMembers = onCall(async request => {
  const { root } = await access(request, true);
  let query = root.collection('members').orderBy(FieldPath.documentId()).limit(26);
  if (request.data.cursor) query = query.startAfter(identifier(request.data.cursor));
  const page = await query.get();
  const docs = page.docs.slice(0, 25);
  const accounts = docs.length ? await getAuth().getUsers(docs.map(doc => ({ uid: doc.id }))) : { users: [] };
  const users = new Map(accounts.users.map(user => [user.uid, user]));
  return {
    members: docs.map(doc => {
      const member = doc.data();
      const user = users.get(doc.id);
      return { id: doc.id, username: member.username, displayName: member.displayName,
        role: member.role, active: member.active === true, createdAt: iso(member.createdAt),
        lastVisitAt: iso(member.lastActivityAt), lastSignInAt: user?.metadata.lastSignInTime ?? null,
        accountState: !user ? 'missing' : user.disabled ? 'disabled' : 'enabled' };
    }),
    nextCursor: page.size > 25 ? docs.at(-1).id : null
  };
});

exports.manageMember = onCall(async request => {
  const { root, ref: callerRef, uid } = await access(request, true);
  const targetId = identifier(request.data.targetId);
  const action = request.data.action;
  const password = request.data.temporaryPassword;
  if (!['suspend', 'reactivate', 'promote', 'demote', 'reset-password'].includes(action)
    || (action === 'reset-password' && (typeof password !== 'string' || password.length < 12 || password.length > 128))) {
    throw new HttpsError('invalid-argument', 'Action ou mot de passe invalide.');
  }
  // Ne jamais supprimer soi-même le dernier accès d'administration. Les transactions
  // relisent aussi l'auteur : deux administrateurs ne peuvent pas se retirer mutuellement.
  if (targetId === uid) throw new HttpsError('failed-precondition', 'Un autre administrateur doit modifier ton accès.');
  const db = getFirestore();
  const target = root.collection('members').doc(targetId);
  const lock = root.collection('memberManagement').doc(targetId);
  const audit = root.collection('memberAudit').doc(randomUUID());
  const operationId = audit.id;
  await db.runTransaction(async tx => {
    const [caller, member, lease] = await tx.getAll(callerRef, target, lock);
    if (caller.data()?.active !== true || caller.data().role !== 'admin') throw new HttpsError('permission-denied', 'Accès administrateur retiré.');
    if (!member.exists) throw new HttpsError('not-found', 'Membre introuvable.');
    if (lease.data()?.expiresAt?.toMillis() > Date.now()) throw new HttpsError('aborted', 'Une modification est déjà en cours. Réessaie.');
    tx.set(lock, { operationId, expiresAt: Timestamp.fromMillis(Date.now() + 300_000) });
    tx.create(audit, { actorId: uid, targetId, action, state: 'started', at: FieldValue.serverTimestamp() });
    // Désactivation immédiate côté règles, avant l'appel Auth. Un échec Auth reste fermé.
    if (action === 'suspend') tx.update(target, { active: false });
    if (action === 'demote') tx.update(target, { role: 'member' });
  });
  try {
    const auth = getAuth();
    if (action === 'suspend' || action === 'reactivate') await auth.updateUser(targetId, { disabled: action === 'suspend' });
    if (action === 'reset-password') await auth.updateUser(targetId, { password });
    if (action === 'promote' || action === 'demote') {
      const user = await auth.getUser(targetId);
      await auth.setCustomUserClaims(targetId, { ...user.customClaims, role: action === 'promote' ? 'admin' : 'member' });
    }
    await auth.revokeRefreshTokens(targetId);
    await db.runTransaction(async tx => {
      const [lease, caller] = await tx.getAll(lock, callerRef);
      if (lease.data()?.operationId !== operationId) throw new HttpsError('aborted', 'Opération à reprendre.');
      if ((action === 'reactivate' || action === 'promote') && (caller.data()?.active !== true || caller.data().role !== 'admin')) {
        throw new HttpsError('permission-denied', 'Accès administrateur retiré.');
      }
      if (action === 'reactivate') tx.update(target, { active: true });
      if (action === 'promote') tx.update(target, { role: 'admin' });
      tx.update(audit, { state: 'completed', completedAt: FieldValue.serverTimestamp() });
      tx.delete(lock);
    });
    return { ok: true };
  } catch {
    await db.runTransaction(async tx => {
      const lease = await tx.get(lock);
      if (lease.data()?.operationId === operationId) tx.delete(lock);
      tx.update(audit, { state: 'failed', completedAt: FieldValue.serverTimestamp() });
    });
    throw new HttpsError('internal', 'Modification incomplète. Actualise puis réessaie la même action.');
  }
});
