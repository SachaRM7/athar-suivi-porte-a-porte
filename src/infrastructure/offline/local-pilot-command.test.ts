import { describe, expect, it } from 'vitest';
import script from '../../../scripts/run-local-app.ps1?raw';

describe('local pilot command', () => {
  it('serves a production build so the service worker remains active', () => {
    expect(script).toContain('npm run build');
    expect(script).toContain('vite preview');
    expect(script).not.toContain('npm run dev');
  });
});
