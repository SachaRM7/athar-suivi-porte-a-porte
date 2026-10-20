const { getFirestore } = require('firebase-admin/firestore');
const { HttpsError } = require('firebase-functions/v2/https');

function identifier(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) {
    throw new HttpsError('invalid-argument', 'Identifiant invalide.');
  }
  return value;
}

async function access(request, admin = false) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Connexion requise.');
  const workspaceId = identifier(request.data?.workspaceId);
  const root = getFirestore().doc(`workspaces/${workspaceId}`);
  const ref = root.collection('members').doc(request.auth.uid);
  const member = await ref.get();
  if (!member.exists || member.data().active !== true || (admin && member.data().role !== 'admin')) {
    throw new HttpsError('permission-denied', 'Accès actif requis.');
  }
  return { root, ref, member: member.data(), uid: request.auth.uid };
}

const iso = value => value?.toDate?.().toISOString() ?? null;
module.exports = { access, identifier, iso };
