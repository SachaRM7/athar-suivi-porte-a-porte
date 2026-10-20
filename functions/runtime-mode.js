/**
 * Lot A3.2 — sécurité par défaut des Cloud Functions.
 *
 * `registerMember` (inscription libre) et `claimInitialAdmin` (amorçage du premier
 * administrateur) ne servent qu'à la recette locale. Ils ne sont exportés QUE lorsque le
 * code tourne dans l'émulateur Functions (`FUNCTIONS_EMULATOR=true`, posé par l'émulateur
 * lui-même) ET qu'aucun mode production n'est demandé. Une variable absente, vide ou mal
 * orthographiée en production ne peut donc pas ouvrir l'inscription : le cloud ne pose
 * jamais `FUNCTIONS_EMULATOR`.
 *
 * `ATHAR_FUNCTIONS_MODE=production` reste accepté pour rejouer la configuration de
 * production dans l'émulateur.
 */
function isEmulatorRuntime(env = process.env) {
  return env.FUNCTIONS_EMULATOR === 'true';
}

function localOnboardingEnabled(env = process.env) {
  return isEmulatorRuntime(env) && env.ATHAR_FUNCTIONS_MODE !== 'production';
}

module.exports = { isEmulatorRuntime, localOnboardingEnabled };
