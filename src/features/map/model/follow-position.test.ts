import { describe, expect, it, vi } from 'vitest';
import { accuracyCircle, followPosition, positionFeatures } from './follow-position';

function fixture() {
  let success!: PositionCallback; let failure!: PositionErrorCallback; let options!: PositionOptions;
  const geo = {
    watchPosition: vi.fn((yes: PositionCallback, no: PositionErrorCallback, opts: PositionOptions) => { success = yes; failure = no; options = opts; return 7; }),
    clearWatch: vi.fn(), getCurrentPosition: vi.fn()
  };
  return {
    geo,
    options: () => options,
    move: (latitude: number, accuracy = 8) => success({ coords: { latitude, longitude: 1.4, accuracy } } as GeolocationPosition),
    fail: (code: number) => failure({ code } as GeolocationPositionError)
  };
}

describe('followed position', () => {
  it('keeps reporting fixes in high accuracy until it is stopped', () => {
    const { geo, options, move } = fixture(); const controller = new AbortController(); const fixes = vi.fn();
    followPosition(geo, controller.signal, fixes, vi.fn());
    expect(options().enableHighAccuracy).toBe(true);
    move(43.6); move(43.601);
    expect(fixes).toHaveBeenCalledTimes(2);
    expect(geo.clearWatch).not.toHaveBeenCalled();
    controller.abort(); move(43.602);
    expect(geo.clearWatch).toHaveBeenCalledWith(7);
    expect(fixes).toHaveBeenCalledTimes(2);
  });

  it('releases the GPS on refusal but survives a weak signal', () => {
    const { geo, fail } = fixture(); const errors = vi.fn();
    followPosition(geo, new AbortController().signal, vi.fn(), errors);
    fail(3); expect(geo.clearWatch).not.toHaveBeenCalled();
    fail(1); expect(geo.clearWatch).toHaveBeenCalledWith(7);
    expect(errors).toHaveBeenCalledTimes(2);
    expect(errors.mock.calls[1]![0].message).toContain('refusée');
  });

  it('never starts when already stopped', () => {
    const { geo } = fixture(); const controller = new AbortController(); controller.abort();
    followPosition(geo, controller.signal, vi.fn(), vi.fn());
    expect(geo.watchPosition).not.toHaveBeenCalled();
  });

  it('draws an accuracy circle with the right radius', () => {
    const ring = accuracyCircle({ latitude: 43.6, longitude: 1.4, accuracy: 50 }).coordinates[0]!;
    const north = ring[0]!;
    expect((north[1] - 43.6) * 111_195).toBeCloseTo(50, 0);
    expect(ring[0]).toEqual(ring.at(-1));
    expect(positionFeatures({ latitude: 43.6, longitude: 1.4, accuracy: 10 }).features.map((feature) => feature.geometry.type)).toEqual(['Polygon', 'Point']);
  });
});
