import { describe, expect, it } from 'vitest';
import { environment } from './environment';

describe('application environment', () => {
  it('uses the explicit local workspace default', () => {
    expect(environment.workspaceId).toBe('main');
  });
});
