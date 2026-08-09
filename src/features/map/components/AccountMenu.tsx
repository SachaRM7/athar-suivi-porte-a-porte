import { useEffect, useRef, useState, type ReactElement } from 'react';

type AccountMenuProps = {
  displayName: string;
  onOpenSettings(): void;
  onSignOut(): void;
};

/** « Sacha Martin » donne « SM » ; un nom d'un seul mot donne sa première lettre. */
function initialsOf(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('');
}

/**
 * Le compte est la seule porte d'entrée vers les réglages et la déconnexion : ces deux
 * actions n'ont pas à flotter au-dessus de la carte, où elles recouvraient la barre du haut.
 */
export function AccountMenu({ displayName, onOpenSettings, onSignOut }: AccountMenuProps): ReactElement {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const dismiss = (event: MouseEvent): void => {
      if (container.current && !container.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div className="terrain-account" ref={container}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Compte de ${displayName}`}
        className="terrain-avatar"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {initialsOf(displayName)}
      </button>
      {open && (
        <div className="terrain-account-menu" role="menu">
          <button onClick={() => { setOpen(false); onOpenSettings(); }} role="menuitem" type="button">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-1 1.47V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.77.32H9a1.6 1.6 0 0 0 1-1.47V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.77V9a1.6 1.6 0 0 0 1.47 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
            </svg>
            Réglages
          </button>
          <button className="terrain-account-signout" onClick={() => { setOpen(false); onSignOut(); }} role="menuitem" type="button">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="m16 17 5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
            Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}
