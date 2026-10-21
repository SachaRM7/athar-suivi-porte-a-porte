import { useRef, useState, type ReactElement } from 'react';
import { useModalFocus } from '../../design/hooks/use-modal-focus';
import type { WorkspaceMember } from '../../domain/workspace/models';

type InitialAdminSettingsProps = {
  allowInitialAdminActivation: boolean;
  member: WorkspaceMember;
  onClose(): void;
  onActivate(code: string): Promise<void>;
};

export function InitialAdminSettings({ allowInitialAdminActivation, member, onClose, onActivate }: InitialAdminSettingsProps): ReactElement {
  const [taps, setTaps] = useState(0);
  const [message, setMessage] = useState('');
  const [activating, setActivating] = useState(false);
  const [code, setCode] = useState('');
  const panel = useRef<HTMLElement>(null);
  useModalFocus(panel, true, onClose);
  const revealed = allowInitialAdminActivation && taps >= 10;

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
    <button aria-label="Fermer les reglages" tabIndex={-1} aria-hidden="true" className="structure-sheet-backdrop" onClick={onClose} type="button" />
    <section aria-label="Reglages" className="structure-sheet" role="dialog" aria-modal="true" tabIndex={-1} ref={panel}>
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
