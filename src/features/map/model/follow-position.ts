import type { Feature, FeatureCollection, Point, Polygon } from 'geojson';

export type PositionFix = { latitude: number; longitude: number; accuracy: number };

/**
 * Suivi de la position tant que l'utilisateur le demande. Haute précision : on marche dans une
 * rue, une position à 100 m près ne dit pas laquelle. Rien n'est enregistré ni envoyé : la
 * position ne sert qu'à dessiner le point sur la carte. Le GPS est libéré dès que `signal` est
 * annulé (second appui, mise en arrière-plan, fermeture de la carte).
 */
export function followPosition(
  geolocation: Geolocation,
  signal: AbortSignal,
  onFix: (fix: PositionFix) => void,
  /** `fatal` : le suivi s'est arrêté (refus, appareil sans localisation). */
  onError: (error: Error, fatal: boolean) => void
): void {
  if (signal.aborted) return;
  let watch: number | undefined;
  const release = () => { if (watch !== undefined) geolocation.clearWatch(watch); watch = undefined; };
  signal.addEventListener('abort', release, { once: true });
  try {
    watch = geolocation.watchPosition(
      (position) => {
        if (signal.aborted) return;
        onFix({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy });
      },
      (error) => {
        if (signal.aborted) return;
        // Un refus est définitif ; une absence de signal (immeuble, sous-sol) laisse le suivi actif.
        if (error.code === 1) {
          release();
          onError(new Error('Localisation refusée. Autorise la position dans les réglages du navigateur ou continue avec la carte.'), true);
        } else {
          onError(new Error('Signal GPS faible. Le suivi continue : place-toi à l’extérieur.'), false);
        }
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 }
    );
    if (signal.aborted) release();
  } catch {
    onError(new Error('Localisation indisponible sur cet appareil. Continue avec la carte.'), true);
  }
}

const EARTH_RADIUS = 6_371_008.8;

/** Cercle de précision (rayon en mètres) autour d'une position, en polygone géographique. */
export function accuracyCircle(fix: PositionFix, steps = 48): Polygon {
  const latitude = (fix.latitude * Math.PI) / 180;
  const radius = Math.max(fix.accuracy, 1) / EARTH_RADIUS;
  const ring: [number, number][] = [];
  for (let index = 0; index <= steps; index++) {
    const angle = (index / steps) * 2 * Math.PI;
    const dLatitude = radius * Math.cos(angle);
    const dLongitude = (radius * Math.sin(angle)) / Math.max(Math.cos(latitude), 1e-6);
    ring.push([fix.longitude + (dLongitude * 180) / Math.PI, fix.latitude + (dLatitude * 180) / Math.PI]);
  }
  return { type: 'Polygon', coordinates: [ring] };
}

/** Point de position et cercle de précision, prêts pour la source MapLibre. */
export function positionFeatures(fix: PositionFix): FeatureCollection<Point | Polygon> {
  const point: Feature<Point> = { type: 'Feature', properties: { kind: 'point' }, geometry: { type: 'Point', coordinates: [fix.longitude, fix.latitude] } };
  const circle: Feature<Polygon> = { type: 'Feature', properties: { kind: 'accuracy' }, geometry: accuracyCircle(fix) };
  return { type: 'FeatureCollection', features: [circle, point] };
}
