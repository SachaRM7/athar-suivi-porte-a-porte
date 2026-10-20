/**
 * Lot A5.1 — règles de configuration d'un build destiné à Firebase Hosting.
 *
 * Les valeurs VITE_FIREBASE_* sont la configuration Web publique de Firebase (elles finissent
 * dans le bundle) ; ce ne sont pas des secrets serveur. On ne les imprime pas pour autant :
 * seuls les NOMS des variables et l'identifiant de projet apparaissent dans les journaux.
 */
export const REQUIRED_WEB_CONFIG = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'];

/** Seule Function que le frontend de production peut appeler. */
export const PRODUCTION_FUNCTIONS = ['createMember'];

export function deployConfigErrors(env, { expectedProjectId, productionFunctions }) {
  const errors = [];
  for (const key of REQUIRED_WEB_CONFIG) {
    if (!env[key]?.trim()) errors.push(`${key} est absente : la configuration Web Firebase est incomplète.`);
  }
  const projectId = env.VITE_FIREBASE_PROJECT_ID?.trim();
  if (!expectedProjectId) errors.push('Aucun projet attendu : renseigner ATHAR_EXPECTED_PROJECT_ID ou .firebaserc (projects.default).');
  else if (projectId && projectId !== expectedProjectId) {
    errors.push(`VITE_FIREBASE_PROJECT_ID vise « ${projectId} » au lieu de « ${expectedProjectId} ».`);
  }
  if (env.VITE_USE_FIREBASE_EMULATORS?.trim() === 'true') errors.push('VITE_USE_FIREBASE_EMULATORS=true : option réservée aux émulateurs.');
  if (env.VITE_ATHAR_TECHNICAL_ROUTES?.trim() === 'true') errors.push('VITE_ATHAR_TECHNICAL_ROUTES=true : les laboratoires seraient publiés.');
  if (/^(local-|demo-|fake)/i.test(env.VITE_FIREBASE_API_KEY?.trim() ?? '')) errors.push('VITE_FIREBASE_API_KEY ressemble à une clé de recette locale.');
  if (productionFunctions) {
    const unexpected = productionFunctions.filter((name) => !PRODUCTION_FUNCTIONS.includes(name));
    if (unexpected.length > 0) {
      errors.push(`functions/index.js exporterait en production : ${unexpected.join(', ')}. L'inscription ou l'amorçage local ne doivent jamais être publiés.`);
    }
  }
  return errors;
}
