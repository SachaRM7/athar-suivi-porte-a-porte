import { describe, expect, it } from 'vitest';
import { doorFollowUp, doorsForGroupedAbsence, isExcludedFromFollowUp, requiresDoNotDisturbConfirmation } from './follow-up';

const door = (currentStatusId: string, active = true) => ({ id: currentStatusId, active, currentStatusId });

describe('door follow-up cycle', () => {
  it('takes « Ne pas déranger » and « Attaché à l’effort » out of the ordinary cycle', () => {
    expect(isExcludedFromFollowUp('do-not-return')).toBe(true);
    expect(isExcludedFromFollowUp('linked')).toBe(true);
    expect(doorFollowUp(door('do-not-return'))).toBe('excluded');
  });

  it('never makes an absence or a blocked access definitive', () => {
    expect(doorFollowUp(door('retry'))).toBe('revisit');
    expect(doorFollowUp(door('locked'))).toBe('revisit');
    expect(doorFollowUp(door('contacted'))).toBe('revisit');
    expect(doorFollowUp(door('unvisited'))).toBe('first-visit');
    expect(doorFollowUp(door('retry', false))).toBe('inactive');
  });

  it('lets a grouped action reach only the doors never visited', () => {
    const doors = [door('unvisited'), door('do-not-return'), door('linked'), door('retry'), door('unvisited', false)];
    expect(doorsForGroupedAbsence(doors).map((candidate) => candidate.id)).toEqual(['unvisited']);
  });

  it('asks for confirmation before correcting a « Ne pas déranger » door', () => {
    expect(requiresDoNotDisturbConfirmation({ currentStatusId: 'do-not-return' }, 'contacted')).toBe(true);
    expect(requiresDoNotDisturbConfirmation({ currentStatusId: 'do-not-return' }, 'do-not-return')).toBe(false);
    expect(requiresDoNotDisturbConfirmation({ currentStatusId: 'retry' }, 'contacted')).toBe(false);
  });
});
