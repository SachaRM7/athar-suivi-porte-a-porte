import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
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

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    function trap(event: KeyboardEvent) {
      if (event.key !== 'Tab' || !panel.current) return;
      const controls = [...panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]')].filter(control => control.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (!first) { event.preventDefault(); panel.current.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', trap);
    return () => { document.removeEventListener('keydown', trap); if (previous?.isConnected) previous.focus(); };
  }, [open]);

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
