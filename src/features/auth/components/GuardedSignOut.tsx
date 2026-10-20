import { useCallback, useState, type ReactElement } from 'react';
import { useAuth, type SignOutOutcome } from '../../../app/providers/auth-context';
import { Dialog } from '../../../design/components';

type UnsyncedWarning = Extract<SignOutOutcome, { status: 'unsynced' }>;

function lossDescription(warning: UnsyncedWarning): string {
  if (warning.visits === null || warning.profiles === null) {
    return 'Le stockage de cet appareil ne répond pas : impossible de vérifier si des passages attendent encore leur envoi.';
  }
  const parts = [
    warning.visits > 0 ? `${warning.visits} passage${warning.visits > 1 ? 's' : ''}` : null,
    warning.profiles > 0 ? `${warning.profiles} fiche${warning.profiles > 1 ? 's' : ''} de foyer` : null
  ].filter(Boolean);
  return `${parts.join(' et ')} ${warning.visits + warning.profiles > 1 ? 'ne sont' : 'n’est'} pas encore envoyé${warning.visits + warning.profiles > 1 ? 's' : ''} au serveur.`;
}

/**
 * Déconnexion qui ne jette jamais en silence ce qui n'est pas synchronisé. Sur un appareil
 * non déclaré de confiance, la purge effacerait les écritures en attente : on les compte,
 * on prévient, et l'effacement n'a lieu que sur confirmation explicite.
 */
export function useGuardedSignOut(options: { onSynchronize?(): Promise<void> } = {}): { request(): void; dialog: ReactElement | null } {
  const { signOut } = useAuth();
  const [warning, setWarning] = useState<UnsyncedWarning | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (discardUnsynced: boolean) => {
    setBusy(true);
    try {
      const outcome = await signOut({ discardUnsynced });
      if (outcome.status === 'unsynced') setWarning(outcome);
      else setWarning(null);
      if (outcome.status === 'purge-incomplete') {
        setNotice(`Déconnexion faite, mais l’effacement local est incomplet (${outcome.failed.join(', ')}). Ferme les autres onglets Athar puis réessaie depuis l’écran de connexion.`);
      }
    } catch {
      setNotice('La déconnexion a échoué. Réessaie.');
    } finally {
      setBusy(false);
    }
  }, [signOut]);

  const request = useCallback(() => { void run(false); }, [run]);

  const synchronizeFirst = useCallback(async () => {
    if (!options.onSynchronize) return;
    setBusy(true);
    try {
      await options.onSynchronize();
    } finally {
      setBusy(false);
      setWarning(null);
    }
  }, [options]);

  const dialog = warning ? (
    <Dialog
      footer={<div className="signout-guard-actions">
        {options.onSynchronize && <button className="primary-action" disabled={busy} onClick={() => void synchronizeFirst()} type="button">Synchroniser d’abord</button>}
        <button className="secondary-action" disabled={busy} onClick={() => setWarning(null)} type="button">Rester connecté</button>
        <button className="secondary-action danger-action" disabled={busy} onClick={() => void run(true)} type="button">Effacer et me déconnecter</button>
      </div>}
      onClose={() => setWarning(null)}
      open
      sub={lossDescription(warning)}
      title="Des saisies ne sont pas encore envoyées"
    >
      <p className="signout-guard-copy">Cet appareil n’est pas déclaré de confiance : la déconnexion efface tout ce qu’Athar y garde. Synchronise d’abord, ou coche « Appareil de confiance » sur ton téléphone personnel pour les garder jusqu’à ta prochaine connexion.</p>
    </Dialog>
  ) : notice ? (
    <Dialog onClose={() => setNotice(null)} open title="Déconnexion" footer={<button className="secondary-action" onClick={() => setNotice(null)} type="button">Compris</button>}>
      <p className="signout-guard-copy" role="alert">{notice}</p>
    </Dialog>
  ) : null;

  return { request, dialog };
}
