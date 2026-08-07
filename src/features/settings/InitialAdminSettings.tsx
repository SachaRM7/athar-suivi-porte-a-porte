import { useState, type ReactElement } from 'react';
import type { WorkspaceMember } from '../../domain/workspace/models';

type InitialAdminSettingsProps = {
  member: WorkspaceMember;
  onClose(): void;
  onActivate(code: string): Promise<void>;
};

export function InitialAdminSettings({ member, onClose, onActivate }: InitialAdminSettingsProps): ReactElement {
  const [taps, setTaps] = useState(0);
  const [message, setMessage] = useState('');
  const [activating, setActivating] = useState(false);
  const [code, setCode] = useState('');
  const revealed = taps >= 10;

  async function activate(): Promise<void> {
    setActivating(true);
    try {
      await onActivate(code);
      setMessage('Administration activee. La carte va se mettre a jour.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Activation impossible.');
    } finally {
      setActivating(false);
    }
  }

  return <div className="structure-sheet-layer">
    <button aria-label="Fermer les reglages" className="structure-sheet-backdrop" onClick={onClose} type="button" />
    <section aria-label="Reglages" className="structure-sheet" role="dialog">
      <header><div><p className="eyebrow">Compte</p><h3>Reglages</h3></div><button aria-label="Fermer les reglages" className="icon-action" onClick={onClose} type="button">X</button></header>
      <p>{member.displayName} - {member.role === 'admin' ? 'administrateur' : 'membre'}</p>
      <button aria-label="Version de l application" className="text-button" onClick={() => setTaps((value) => Math.min(10, value + 1))} type="button">Athar V1.0</button>
      {revealed && <div className="initial-admin-activation">
        <label>
          Code d activation unique
          <input aria-label="Code d activation unique" autoComplete="off" onChange={(event) => setCode(event.target.value)} type="password" value={code} />
        </label>
        <button className="primary-action" disabled={activating || !code} onClick={() => void activate()} type="button">Activer l administration de ce workspace</button>
      </div>}
      {message && <p className="workspace-map-message" role="status">{message}</p>}
    </section>
  </div>;
}
