import type { ReactElement, ReactNode } from 'react';

const FOOTPRINTS = Array.from({ length: 48 }, (_, index) => ({
  x: 52 + (index % 8) * 142 + (index % 3) * 9,
  y: 58 + Math.floor(index / 8) * 116 + (index % 4) * 6,
  width: 42 + (index % 3) * 11,
  height: 30 + (index % 2) * 9,
  status: ['todo', 'open', 'away', 'todo', 'linked', 'locked', 'todo', 'dnd'][index % 8]
}));

function AuthMap(): ReactElement {
  return (
    <svg aria-hidden="true" className="auth-map" preserveAspectRatio="xMidYMid slice" viewBox="0 0 1200 800">
      <rect className="auth-map-ground" height="800" width="1200" />
      <path className="auth-map-park" d="M885 0h315v258l-118 42-96-78-101 24z" />
      <path className="auth-map-water" d="M0 655c188-38 303 11 449 12 188 1 310-60 460-35 113 19 196 54 291 34v86c-102 16-197-16-301-35-161-29-273 28-455 27-164-1-280-45-444-13z" />
      {Array.from({ length: 11 }, (_, index) => <line className="auth-map-road" key={`v-${index}`} x1={index * 122 - 30} x2={index * 122 + 26} y1="0" y2="800" />)}
      {Array.from({ length: 8 }, (_, index) => <line className="auth-map-road" key={`h-${index}`} x1="0" x2="1200" y1={index * 112 + 24} y2={index * 112 - 8} />)}
      {FOOTPRINTS.map((footprint, index) => (
        <rect
          className={`auth-map-footprint auth-map-footprint--${footprint.status}`}
          height={footprint.height}
          key={index}
          rx="2"
          width={footprint.width}
          x={footprint.x}
          y={footprint.y}
        />
      ))}
    </svg>
  );
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
