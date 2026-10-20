import { useRef, type ReactElement, type ReactNode } from 'react';
import { useModalFocus } from '../hooks/use-modal-focus';
import { createPortal } from 'react-dom';

export type DialogProps = {
  open: boolean;
  title: string;
  /** Phrase d'explication sous le titre. */
  sub?: ReactNode;
  /** Micro-libellé au-dessus du titre : l'adresse concernée, le plus souvent. */
  eyebrow?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Actions en pied de dialogue. */
  footer?: ReactNode;
};

/** Centré sur desktop (max 400px), en sheet sur mobile. */
export function Dialog({ open, title, sub, eyebrow, onClose, children, footer }: DialogProps): ReactElement | null {
  const panel = useRef<HTMLDivElement>(null);

  useModalFocus(panel, open, onClose);

  if (!open) return null;

  return createPortal(
    <div
      className="ds-scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="ds-dialog" role="dialog" aria-modal="true" aria-label={title} ref={panel} tabIndex={-1}>
        {eyebrow}
        <h3 className="ds-dialog__title">{title}</h3>
        {sub && <p className="ds-dialog__sub">{sub}</p>}
        {children}
        {footer}
      </div>
    </div>, document.body
  );
}
