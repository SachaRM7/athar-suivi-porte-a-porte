import { lazy, Suspense, type ReactElement } from 'react';

const TechnicalLab = lazy(async () => ({ default: (await import('../features/lab/TechnicalLab')).TechnicalLab }));
const DesignSystemPage = lazy(async () => ({ default: (await import('../design/DesignSystemPage')).DesignSystemPage }));
const MapPreview = lazy(async () => ({ default: (await import('../features/map/components/MapPreview')).MapPreview }));

/** Laboratoires de développement et de recette. Jamais chargé par le build de production. */
export function TechnicalRoutes({ pathname }: { pathname: string }): ReactElement | null {
  const page = pathname === '/technical-lab' ? <TechnicalLab />
    : pathname === '/_ds' ? <DesignSystemPage />
      : pathname === '/technical-map' ? <MapPreview />
        : null;
  if (!page) return null;
  return <Suspense fallback={<div className="workspace-map-loading" aria-label="Chargement" />}>{page}</Suspense>;
}
