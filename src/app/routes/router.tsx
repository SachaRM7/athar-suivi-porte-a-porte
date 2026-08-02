import { useEffect, type AnchorHTMLAttributes, type MouseEvent, type ReactElement } from 'react';
import { navigate } from './navigation';

export function AppLink({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }): ReactElement {
  function follow(event: MouseEvent<HTMLAnchorElement>): void {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  }
  return <a href={href} onClick={follow} {...props} />;
}

export function Redirect({ to }: { to: string }): null {
  useEffect(() => navigate(to, true), [to]);
  return null;
}
