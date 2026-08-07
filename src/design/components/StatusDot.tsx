import type { CSSProperties, ReactElement } from 'react';
import { statusColorVar, type DoorStatus } from '../status';

export type StatusDotMarker = 'sisters' | 'todo-footprint';

export type StatusDotProps = {
  status?: DoorStatus;
  /**
   * `sisters` — anneau rose vide du marqueur « à confier aux sœurs ».
   * Jamais un disque plein : ce n'est pas un septième statut.
   * `todo-footprint` — emprise détectée sans aucun passage enregistré.
   */
  marker?: StatusDotMarker;
  size?: 'sm' | 'md' | 'lg';
  /** Fourni si la pastille porte l'information seule ; sinon elle est décorative. */
  label?: string;
  className?: string;
};

const SIZE_CLASS = { sm: ' ds-statusdot--sm', md: ' ds-statusdot--md', lg: '' } as const;

export function StatusDot({ status, marker, size = 'lg', label, className }: StatusDotProps): ReactElement {
  const classes = ['ds-statusdot'];
  if (size !== 'lg') classes.push(SIZE_CLASS[size].trim());
  if (marker) classes.push(`ds-statusdot--${marker}`);
  if (className) classes.push(className);

  const style = marker || !status ? undefined : ({ '--ds-dot-color': statusColorVar(status) } as CSSProperties);

  return (
    <i
      className={classes.join(' ')}
      style={style}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
