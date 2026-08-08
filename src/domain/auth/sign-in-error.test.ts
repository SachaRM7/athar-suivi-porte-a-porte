import { describe, expect, it } from 'vitest';
import { signInErrorMessage } from './sign-in-error';
import { InvalidUsernameError } from './username';

const cloud = { useEmulators: false };
const local = { useEmulators: true };

function firebaseError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

describe('signInErrorMessage', () => {
  it('blames the credentials only when the server rejected them', () => {
    expect(signInErrorMessage(firebaseError('auth/invalid-credential'), cloud)).toBe('Identifiant ou mot de passe incorrect.');
    expect(signInErrorMessage(firebaseError('auth/user-not-found'), cloud)).toBe('Identifiant ou mot de passe incorrect.');
  });

  it('points at the local emulators when they are the unreachable service', () => {
    expect(signInErrorMessage(firebaseError('auth/network-request-failed'), local)).toContain('npm run dev:local');
  });

  it('points at the network when the environment talks to a real project', () => {
    const message = signInErrorMessage(firebaseError('auth/network-request-failed'), cloud);
    expect(message).toContain('injoignable');
    expect(message).not.toContain('npm run dev:local');
  });

  it('separates a throttled device from a wrong password', () => {
    expect(signInErrorMessage(firebaseError('auth/too-many-requests'), cloud)).toContain('Trop de tentatives');
  });

  it('tells a disabled account how to be reopened', () => {
    expect(signInErrorMessage(firebaseError('auth/user-disabled'), cloud)).toContain('coordinateur');
  });

  it('describes the accepted shape of an identifier refused before any request', () => {
    expect(signInErrorMessage(new InvalidUsernameError(), cloud)).toContain('3 à 32 caractères');
  });

  it('falls back on the credentials wording for an unknown failure', () => {
    expect(signInErrorMessage(new Error('boom'), cloud)).toBe('Identifiant ou mot de passe incorrect.');
  });
});
