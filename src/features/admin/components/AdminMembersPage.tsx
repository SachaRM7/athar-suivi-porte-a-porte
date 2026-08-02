import { useState, type FormEvent, type ReactElement } from 'react';
import { environment } from '../../../app/config/environment';
import { AppLink } from '../../../app/routes/router';

export function AdminMembersPage(): ReactElement {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setResult(null);
    setError(null);
    try {
      const [adminModule, clientModule] = await Promise.all([
        import('../../../infrastructure/firebase/admin-members-gateway'),
        import('../../../infrastructure/firebase/client')
      ]);
      const created = await adminModule.createMemberWithFunction(clientModule.getFirebaseClient().functions, {
        workspaceId: environment.workspaceId,
        username: String(data.get('username') ?? ''),
        displayName: String(data.get('displayName') ?? ''),
        temporaryPassword: String(data.get('temporaryPassword') ?? '')
      });
      setResult(`Compte ${created.username} cree.`);
      form.reset();
    } catch {
      setError('Le compte n\'a pas pu etre cree. Verifiez les champs ou les droits administrateur.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="admin-shell">
      <header className="member-header">
        <div><p className="eyebrow">Administration / membres</p><h1>Creer un acces</h1></div>
        <AppLink className="text-link" href="/">Retour</AppLink>
      </header>
      <form className="admin-form" onSubmit={(event) => void submit(event)}>
        <label>Identifiant<input autoComplete="off" name="username" pattern="[a-z0-9._-]{3,32}" required /></label>
        <label>Nom affiche<input autoComplete="off" maxLength={80} name="displayName" required /></label>
        <label>Mot de passe temporaire<input autoComplete="new-password" minLength={12} name="temporaryPassword" required type="password" /></label>
        {result && <p className="form-success" role="status">{result}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-action" disabled={pending} type="submit">{pending ? 'Creation...' : 'Creer le membre'}</button>
      </form>
    </main>
  );
}
