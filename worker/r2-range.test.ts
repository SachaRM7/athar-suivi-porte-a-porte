import { describe, expect, it } from 'vitest';
import { contentRange } from './r2-range';

describe('R2 byte ranges', () => {
  it('describes an explicit range', () => {
    expect(contentRange({ offset: 0, length: 16_384 }, 44_660_788)).toEqual({ header: 'bytes 0-16383/44660788', length: 16_384 });
    expect(contentRange({ offset: 100 }, 1_000)).toEqual({ header: 'bytes 100-999/1000', length: 900 });
  });

  it('describes a suffix range', () => {
    expect(contentRange({ suffix: 10 }, 1_000)).toEqual({ header: 'bytes 990-999/1000', length: 10 });
  });

  it('treats a missing or whole-file range as a complete response', () => {
    expect(contentRange(undefined, 1_000)).toBeNull();
    expect(contentRange({ offset: 0, length: 1_000 }, 1_000)).toBeNull();
  });
});
