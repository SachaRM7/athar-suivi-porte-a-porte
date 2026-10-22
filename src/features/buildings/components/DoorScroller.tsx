import { useCallback, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

type ScrollState = { overflow: boolean; atEnd: boolean; ratio: number; visible: number };

const IDLE: ScrollState = { overflow: false, atEnd: true, ratio: 0, visible: 1 };

/**
 * Rangée de portes d'un étage, défilant horizontalement. Un étage de douze portes tient sur une
 * ligne : on garde la coupe lisible (un étage = une rangée) et on glisse pour voir la suite.
 * La flèche et la jauge n'apparaissent que si la rangée dépasse réellement.
 */
export function DoorScroller({ label, children }: { label: string; children: ReactNode }): ReactElement {
  const track = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ScrollState>(IDLE);

  const measure = useCallback(() => {
    const element = track.current;
    if (!element) return;
    const max = element.scrollWidth - element.clientWidth;
    const next: ScrollState = max > 4
      ? { overflow: true, atEnd: element.scrollLeft >= max - 4, ratio: element.scrollLeft / max, visible: element.clientWidth / element.scrollWidth }
      : IDLE;
    setState((current) => current.overflow === next.overflow && current.atEnd === next.atEnd
      && Math.abs(current.ratio - next.ratio) < .01 && Math.abs(current.visible - next.visible) < .01 ? current : next);
  }, []);

  useLayoutEffect(() => {
    measure();
    const element = track.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure, children]);

  const scrollNext = () => {
    const element = track.current;
    if (!element) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    element.scrollBy({ left: element.clientWidth * .8, behavior: reduced ? 'auto' : 'smooth' });
  };

  const thumb = Math.max(12, state.visible * 100);
  return (
    <div className="door-scroller" data-at-end={state.atEnd} data-overflow={state.overflow}>
      <div aria-label={label} className="door-grid" onScroll={measure} ref={track} role="group">{children}</div>
      {state.overflow && !state.atEnd && (
        <button aria-label={`Portes suivantes, ${label}`} className="door-scroller-next" onClick={scrollNext} type="button">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
        </button>
      )}
      {state.overflow && (
        <div aria-hidden="true" className="door-scroller-foot">
          <span className="door-scroller-track"><i style={{ width: `${thumb}%`, left: `${state.ratio * (100 - thumb)}%` }} /></span>
          <span className="door-scroller-hint">Glisser →</span>
        </div>
      )}
    </div>
  );
}

/** Volée d'escalier du trait de coupe, montant d'un étage à l'autre. Purement décorative. */
export function FloorStairs({ mirrored }: { mirrored: boolean }): ReactElement {
  return (
    <svg aria-hidden="true" className={mirrored ? 'building-floor-stairs building-floor-stairs--mirrored' : 'building-floor-stairs'} viewBox="0 0 44 40">
      <path d="M2 38h9v-9h9v-9h9v-9h9V2h4" />
    </svg>
  );
}
