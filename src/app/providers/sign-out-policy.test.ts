import { describe, expect, it } from 'vitest';
import { planSignOut } from './sign-out-policy';

describe('sign-out policy', () => {
  it('warns before purging unsynced writes on an untrusted device', () => {
    expect(planSignOut({ authorId: 'member-a', trusted: false, discardUnsynced: false, unsynced: { visits: 2, profiles: 1 } }))
      .toEqual({ action: 'warn', visits: 2, profiles: 1 });
  });

  it('treats an unreadable local queue as a risk, never as "nothing to lose"', () => {
    expect(planSignOut({ authorId: 'member-a', trusted: false, discardUnsynced: false, unsynced: null }))
      .toEqual({ action: 'warn', visits: null, profiles: null });
  });

  it('purges only after an explicit confirmation', () => {
    expect(planSignOut({ authorId: 'member-a', trusted: false, discardUnsynced: true, unsynced: { visits: 2, profiles: 0 } }))
      .toEqual({ action: 'sign-out', purge: true });
  });

  it('keeps the queue of a trusted device without asking', () => {
    expect(planSignOut({ authorId: 'member-a', trusted: true, discardUnsynced: false, unsynced: { visits: 5, profiles: 0 } }))
      .toEqual({ action: 'sign-out', purge: false });
  });

  it('purges an untrusted device straight away when everything is synchronised', () => {
    expect(planSignOut({ authorId: 'member-a', trusted: false, discardUnsynced: false, unsynced: { visits: 0, profiles: 0 } }))
      .toEqual({ action: 'sign-out', purge: true });
  });
});
