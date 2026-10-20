import { describe, expect, it } from 'vitest';
import { matchesAddress, markingCandidates } from './field-navigation';
import { buildingListEntries } from '../../buildings/model/building-staleness';
import type { Building, Door } from '../../../domain/workspace/models';

describe('field entry and scoped search', () => {
  it('matches accents, punctuation, case and word order without inventing an address result', () => {
    expect(matchesAddress('12 rue de l’Église, Toulouse', 'eglise 12')).toBe(true);
    expect(matchesAddress('12 rue de l’Église, Toulouse', 'carmes')).toBe(false);
    expect(matchesAddress('12 rue de l’Église, Toulouse', '')).toBe(true);
  });
  it('orders candidates around the map centre and excludes buildings entirely out of follow-up', () => {
    const building = (id: string, longitude: number): Building => ({ id, addressLabel: id, location: { latitude: 43, longitude }, geohash: '', zoneId: 'zone', createdBy: 'member', structureRevision: 0 });
    const entries = buildingListEntries([building('far', 2), building('near', 1.1), building('dnd', 1), building('linked', 1)], new Map([
      ['dnd', [{ active: true, currentStatusId: 'do-not-return' } as Door]],
      ['linked', [{ active: true, currentStatusId: 'linked' } as Door]]
    ]));
    expect(markingCandidates(entries, { latitude: 43, longitude: 1 }).map(entry => entry.building.id)).toEqual(['near', 'far']);
  });
});
