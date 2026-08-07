import type { ReactElement, ReactNode } from 'react';
import { StatusDot, type StatusDotMarker } from './StatusDot';
import type { DoorStatus } from '../status';

export type ChipProps = {
  children: ReactNode;
  /** Rendu en `aria-pressed` : un chip est un interrupteur, pas un lien. */
  pressed?: boolean;
  onClick?: () => void;
  /** Pastille de statut à gauche du libellé. */
  dot?: DoorStatus;
  /** Marqueur à gauche du libellé, exclusif de `dot`. */
  marker?: StatusDotMarker;
  /** Compteur en mono, à droite du libellé. */
  count?: number;
  disabled?: boolean;
  className?: string;
};

/** Pastille arrondie : filtres, composition du foyer, schémas de numérotation. */
export function Chip({ children, pressed, onClick, dot, marker, count, disabled, className }: ChipProps): ReactElement {
  return (
    <button
      type="button"
      className={className ? `ds-chip ${className}` : 'ds-chip'}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
    >
      {(dot || marker) && <StatusDot status={dot} marker={marker} size="sm" />}
      <span>{children}</span>
      {count !== undefined && <b className="ds-chip__count">{count}</b>}
    </button>
  );
}
