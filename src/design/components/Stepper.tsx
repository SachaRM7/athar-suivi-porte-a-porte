import type { ReactElement } from 'react';

export type StepperProps = {
  /** Décrit le réglage pour les lecteurs d'écran ; le micro-libellé visible est posé par l'appelant. */
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Explique la conséquence du réglage : « étages · RDC compris = 4 niveaux ». */
  gloss?: string;
  /** Unité collée à la valeur : « étages », « portes ». */
  unit?: string;
};

export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 99,
  step = 1,
  gloss,
  unit,
}: StepperProps): ReactElement {
  const atMin = value <= min;
  const atMax = value >= max;

  return (
    <div className="ds-stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="ds-stepper__button"
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={atMin}
        aria-label={`Diminuer — ${label}`}
      >
        −
      </button>
      <span className="ds-stepper__value" aria-live="polite">
        <b>{value}</b>
        {(unit || gloss) && (
          <em className="ds-stepper__gloss">
            {unit}
            {unit && gloss ? ' · ' : ''}
            {gloss}
          </em>
        )}
      </span>
      <button
        type="button"
        className="ds-stepper__button"
        onClick={() => onChange(Math.min(max, value + step))}
        disabled={atMax}
        aria-label={`Augmenter — ${label}`}
      >
        +
      </button>
    </div>
  );
}
