import { describe, expect, it, vi } from 'vitest';
import { normalizeUsername, signInWithUsername, technicalEmailForUsername } from './username';

describe('technical username authentication prototype', () => {
  it('maps a visible username to a deterministic non-personal email', () => {
    expect(technicalEmailForUsername('  Sacha.Admin  ')).toBe('sacha.admin@auth.athar.invalid');
  });

  it('rejects unsafe usernames before any auth request', () => {
    expect(() => normalizeUsername('sacha admin')).toThrow(/Username/);
    expect(() => normalizeUsername('ab')).toThrow(/Username/);
  });

  it('only invokes password sign-in and exposes no public sign-up operation', async () => {
    const signIn = vi.fn(async (_email: string, _password: string): Promise<void> => undefined);

    await signInWithUsername(signIn, 'terrain-31', 'secret');
    expect(signIn).toHaveBeenCalledWith('terrain-31@auth.athar.invalid', 'secret');
  });
});
