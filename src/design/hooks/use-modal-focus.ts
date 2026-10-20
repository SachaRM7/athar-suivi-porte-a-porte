import { useEffect, useRef, type RefObject } from 'react';

const stack: HTMLElement[] = [];
let restoreInert: (() => void) | null = null;
function isolateTop() {
  restoreInert?.();
  const changed: HTMLElement[] = [];
  let branch = stack.at(-1);
  while (branch?.parentElement) {
    for (const sibling of branch.parentElement.children) {
      if (sibling !== branch && sibling instanceof HTMLElement && !sibling.inert) {
        sibling.inert = true; changed.push(sibling);
      }
    }
    branch = branch.parentElement;
  }
  restoreInert = () => { for (const element of changed) element.inert = false; };
}

/** Un seul dialogue reçoit Échap/Tab, y compris lorsqu'une fiche en ouvre une autre. */
export function useModalFocus<T extends HTMLElement>(panel: RefObject<T | null>, open: boolean, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; }, [close]);
  useEffect(() => {
    const element = panel.current;
    if (!open || !element) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stack.push(element); isolateTop(); element.focus();
    function onKey(event: KeyboardEvent) {
      if (stack.at(-1) !== element) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); closeRef.current(); return; }
      if (event.key !== 'Tab') return;
      const controls = [...element!.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]')]
        .filter(control => !control.closest('[inert]') && control.getClientRects().length > 0);
      const first = controls[0]; const last = controls.at(-1);
      if (!first) { event.preventDefault(); element!.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === element)) { event.preventDefault(); first.focus(); }
    }
    function onFocus(event: FocusEvent) {
      if (stack.at(-1) === element && event.target instanceof Node && !element!.contains(event.target)) element!.focus();
    }
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('keydown', onKey, true); document.removeEventListener('focusin', onFocus);
      const index = stack.indexOf(element); if (index >= 0) stack.splice(index, 1);
      isolateTop();
      if (previous?.isConnected && !previous.closest('[inert]')) previous.focus();
      else stack.at(-1)?.focus();
    };
  }, [open, panel]);
}
