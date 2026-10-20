export type PositionFix = { latitude: number; longitude: number; accuracy: number };

/** One requested fix only. Always release the GPS, including on background/unmount. */
export function locateOnce(geolocation: Geolocation, signal: AbortSignal): Promise<PositionFix> {
  return new Promise((resolve, reject) => {
    let watch: number | undefined;
    let settled = false;
    const abort = () => finish(new DOMException('Recherche de position interrompue.', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('Position introuvable pour le moment. Place-toi à l’extérieur puis réessaie.')), 12_000);
    function finish(error?: Error, fix?: PositionFix) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      if (watch !== undefined) geolocation.clearWatch(watch);
      if (error) reject(error); else resolve(fix!);
    }
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    try { watch = geolocation.watchPosition(position => finish(undefined, {
      latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy
    }), error => finish(new Error(error.code === 1
      ? 'Localisation refusée. Autorise la position dans les réglages du navigateur ou continue avec la carte.'
      : 'Position indisponible. Place-toi à l’extérieur puis réessaie.')),
    { enableHighAccuracy: false, maximumAge: 30_000, timeout: 10_000 });
    if (settled) geolocation.clearWatch(watch);
    } catch { finish(new Error("Localisation indisponible sur cet appareil. Continue avec la carte.")); }
  });
}
