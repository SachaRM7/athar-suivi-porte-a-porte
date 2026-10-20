import { afterEach, describe, expect, it, vi } from 'vitest';
import { locateOnce } from './locate-once';
afterEach(() => vi.useRealTimers());
function fixture() {
  let success!: PositionCallback; let failure!: PositionErrorCallback;
  const geo = { watchPosition: vi.fn((yes: PositionCallback, no: PositionErrorCallback) => { success = yes; failure = no; return 7; }), clearWatch: vi.fn(), getCurrentPosition: vi.fn() };
  return { geo, success: () => success({ coords: { latitude: 43.6, longitude: 1.4, accuracy: 25 } } as GeolocationPosition), failure: () => failure({ code: 1 } as GeolocationPositionError) };
}
describe('requested one-shot position', () => {
  it('uses a cached low-power fix and immediately releases the watcher', async () => {
    const { geo, success } = fixture(); const request = locateOnce(geo, new AbortController().signal); success();
    await expect(request).resolves.toMatchObject({ accuracy: 25 }); expect(geo.clearWatch).toHaveBeenCalledWith(7);
    expect(geo.watchPosition.mock.calls[0]).toHaveLength(3);
    expect((geo.watchPosition.mock.calls[0] as unknown[])[2]).toMatchObject({ enableHighAccuracy: false, maximumAge: 30000 });
  });
  it('clears after a permission refusal', async () => {
    const { geo, failure } = fixture(); const request = locateOnce(geo, new AbortController().signal); failure();
    await expect(request).rejects.toThrow('refusée'); expect(geo.clearWatch).toHaveBeenCalledWith(7);
  });
  it('clears when the page goes to background or unmounts', async () => {
    const { geo } = fixture(); const controller = new AbortController(); const request = locateOnce(geo, controller.signal); controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' }); expect(geo.clearWatch).toHaveBeenCalledWith(7);
  });
  it('stops even when a browser never calls either callback', async () => {
    vi.useFakeTimers(); const { geo } = fixture(); const request = locateOnce(geo, new AbortController().signal); const assertion = expect(request).rejects.toThrow('introuvable');
    await vi.advanceTimersByTimeAsync(12000); await assertion; expect(geo.clearWatch).toHaveBeenCalledWith(7);
  });
});
