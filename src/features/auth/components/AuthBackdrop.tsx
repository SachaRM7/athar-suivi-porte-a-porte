import type { ReactElement, ReactNode } from 'react';
import { mapSVG } from './auth-map';

function AuthMap(): ReactElement {
  return <div aria-hidden="true" className="auth-map" dangerouslySetInnerHTML={{ __html: mapSVG() }} />;
}

export function AuthWordmark({ className = '' }: { className?: string }): ReactElement {
  return (
    <div className={`auth-wordmark ${className}`.trim()} aria-label="Athar">
      <span lang="ar">أثر</span>
      <i aria-hidden="true" />
      <strong>ATHAR</strong>
    </div>
  );
}

export function AuthBackdrop({ children, labelledBy }: { children: ReactNode; labelledBy: string }): ReactElement {
  return (
    <main className="auth-shell">
      <AuthMap />
      <div aria-hidden="true" className="auth-map-veil" />
      <AuthWordmark className="auth-wordmark--mobile" />
      <section aria-labelledby={labelledBy} className="auth-card">
        <AuthWordmark className="auth-wordmark--card" />
        {children}
      </section>
    </main>
  );
}
