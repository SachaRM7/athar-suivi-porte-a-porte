import type { ReactElement, ReactNode } from 'react';

/** Trois hauteurs : peek 306px, detail 392px, building/full 620px. */
export type SheetHeight = 'peek' | 'detail' | 'full';

export type SheetProps = {
  height: SheetHeight;
  /** Appelé par la poignée. Non fourni : la poignée n'est pas rendue interactive. */
  onHeightChange?: (height: SheetHeight) => void;
  head?: ReactNode;
  children: ReactNode;
  /** Nomme la sheet pour les lecteurs d'écran. */
  label: string;
};

const NEXT_HEIGHT: Readonly<Record<SheetHeight, SheetHeight>> = {
  peek: 'detail',
  detail: 'full',
  full: 'peek',
};

const HEIGHT_CLASS: Readonly<Record<SheetHeight, string>> = {
  peek: '',
  detail: ' ds-sheet--detail',
  full: ' ds-sheet--full',
};

export function Sheet({ height, onHeightChange, head, children, label }: SheetProps): ReactElement {
  return (
    <section className={`ds-sheet${HEIGHT_CLASS[height]}`} aria-label={label}>
      {onHeightChange ? (
        <button
          type="button"
          className="ds-sheet__grip"
          onClick={() => onHeightChange(NEXT_HEIGHT[height])}
          aria-label={`Changer la hauteur du panneau — actuellement ${height}`}
        >
          <i />
        </button>
      ) : (
        <div className="ds-sheet__grip" aria-hidden="true">
          <i />
        </div>
      )}
      {head && <div className="ds-sheet__head">{head}</div>}
      <div className="ds-sheet__scroll">{children}</div>
    </section>
  );
}
