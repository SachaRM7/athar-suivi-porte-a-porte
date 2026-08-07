import type { CSSProperties, ReactElement } from 'react';
import { statusColorVar, traceHeight, type DoorStatus } from '../status';

/** Une porte marquée, ou une pause dans la sortie. */
export type TraceEntry = DoorStatus | 'pause';

export type TraceBarProps = {
  entries: readonly TraceEntry[];
  /** Invitation affichée tant qu'aucune porte n'a été marquée. */
  emptyLabel?: string;
  className?: string;
};

/**
 * Élément signature : un trait par porte marquée pendant la sortie en cours,
 * hauteur et couleur selon le résultat. C'est le seul endroit où l'interface
 * se permet de l'audace.
 */
export function TraceBar({
  entries,
  emptyLabel = 'Marque une première porte',
  className,
}: TraceBarProps): ReactElement {
  const marked = entries.filter((entry) => entry !== 'pause').length;

  return (
    <div
      className={className ? `ds-trace ${className}` : 'ds-trace'}
      role="img"
      aria-label={marked > 0 ? `Trace de la sortie — ${marked} porte${marked > 1 ? 's' : ''} marquée${marked > 1 ? 's' : ''}` : emptyLabel}
    >
      {entries.length === 0 && <span className="ds-trace__empty">{emptyLabel}</span>}
      {entries.map((entry, index) =>
        entry === 'pause' ? (
          <i key={index} className="ds-trace__pause" />
        ) : (
          <i
            key={index}
            className="ds-trace__stroke"
            style={{ height: `${traceHeight(entry)}px`, '--ds-stroke-color': statusColorVar(entry) } as CSSProperties}
          />
        )
      )}
    </div>
  );
}
