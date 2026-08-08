import { describe, expect, it } from 'vitest';
import type { Building, Door } from '../../../domain/workspace/models';
import {
  buildingListEntries,
  buildingStaleness,
  compareByStaleness,
  lastVisitOfBuilding,
  matchesBuildingListFilter,
  sortBuildingList,
  stalenessLabel,
  STALE_ALERT_DAYS,
  type BuildingListEntry
} from './building-staleness';

const now = new Date('2026-08-08T10:00:00.000Z');

function daysAgo(days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

function building(id: string, addressLabel = id): Building {
  return { id, addressLabel, location: { latitude: 43.6058, longitude: 1.4454 }, geohash: 'spdt', zoneId: 'carmes', createdBy: 'admin-1', structureRevision: 1 };
}

function door(overrides: Partial<Door> & Pick<Door, 'id' | 'buildingId'>): Door {
  return {
    zoneId: 'carmes', location: { latitude: 43.6058, longitude: 1.4454 }, geohash: 'spdt',
    floor: 0, label: '01', sortOrder: 0, active: true, currentStatusId: 'unvisited', revision: 0,
    lastVisitId: null, lastVisitAt: null, createdBy: 'admin-1', sisters: false,
    ...overrides
  };
}

function visited(id: string, buildingId: string, days: number): Door {
  return door({ id, buildingId, currentStatusId: 'contacted', revision: 1, lastVisitId: `visit-${id}`, lastVisitAt: daysAgo(days) });
}

describe('stalenessLabel', () => {
  it('follows the scale of the data model', () => {
    expect(stalenessLabel(0)).toBe("aujourd'hui");
    expect(stalenessLabel(1)).toBe('hier');
    expect(stalenessLabel(12)).toBe('il y a 12 j');
    expect(stalenessLabel(29)).toBe('il y a 29 j');
    expect(stalenessLabel(30)).toBe('il y a 1 mois');
    expect(stalenessLabel(128)).toBe('il y a 4 mois');
  });

  it('names a building nobody ever visited', () => {
    expect(stalenessLabel(null)).toBe('jamais vu');
  });
});

describe('buildingStaleness', () => {
  it('reads a building without any passage as never seen, and not as an alert', () => {
    expect(buildingStaleness(null, now)).toEqual({ lastVisitAt: null, days: null, label: 'jamais vu', alert: false });
  });

  it('stays calm below the ninety-day threshold', () => {
    const recent = buildingStaleness(daysAgo(STALE_ALERT_DAYS - 1), now);
    expect(recent.days).toBe(89);
    expect(recent.alert).toBe(false);
  });

  it('raises the alert once the threshold is reached', () => {
    expect(buildingStaleness(daysAgo(STALE_ALERT_DAYS), now).alert).toBe(true);
    expect(buildingStaleness(daysAgo(200), now)).toMatchObject({ label: 'il y a 6 mois', alert: true });
  });

  it('ignores an unreadable date rather than inventing an ancienneté', () => {
    expect(buildingStaleness('pas une date', now)).toMatchObject({ days: null, label: 'jamais vu' });
  });
});

describe('lastVisitOfBuilding', () => {
  it('keeps the most recent passage of the building', () => {
    const doors = [visited('d1', 'b', 40), visited('d2', 'b', 4), door({ id: 'd3', buildingId: 'b' })];
    expect(lastVisitOfBuilding(doors)).toBe(daysAgo(4));
  });

  it('does not let an archived door rejuvenate a building', () => {
    const doors = [visited('d1', 'b', 120), { ...visited('d2', 'b', 2), active: false }];
    expect(lastVisitOfBuilding(doors)).toBe(daysAgo(120));
  });

  it('returns nothing when no door was ever visited', () => {
    expect(lastVisitOfBuilding([door({ id: 'd1', buildingId: 'b' })])).toBeNull();
  });
});

describe('building list', () => {
  const entries = buildingListEntries(
    [building('b-stale', '7 rue des Filatiers'), building('b-fresh', '18 rue du Languedoc'), building('b-never', '3 place des Carmes')],
    new Map([
      ['b-stale', [visited('d1', 'b-stale', 128)]],
      ['b-fresh', [visited('d2', 'b-fresh', 3), door({ id: 'd3', buildingId: 'b-fresh' })]],
      ['b-never', [door({ id: 'd4', buildingId: 'b-never' })]]
    ]),
    now
  );
  const entryFor = (id: string): BuildingListEntry => entries.find((entry) => entry.building.id === id)!;

  it('counts the treated doors alongside the ancienneté', () => {
    expect(entryFor('b-fresh')).toMatchObject({ doorCount: 2, treatedCount: 1 });
    expect(entryFor('b-fresh').staleness.label).toBe('il y a 3 j');
  });

  it('shows « jamais vu » on a described building nobody visited', () => {
    expect(entryFor('b-never').staleness).toMatchObject({ label: 'jamais vu', alert: false });
  });

  it('keeps « Pas vu > 3 mois » apart from « Pas encore fait »', () => {
    expect(entries.filter((entry) => matchesBuildingListFilter(entry, 'stale')).map((entry) => entry.building.id)).toEqual(['b-stale']);
    expect(entries.filter((entry) => matchesBuildingListFilter(entry, 'todo')).map((entry) => entry.building.id)).toEqual(['b-never']);
    expect(entries.filter((entry) => matchesBuildingListFilter(entry, 'all'))).toHaveLength(3);
  });

  it('sorts the oldest first and puts a never seen building at the top', () => {
    expect(sortBuildingList(entries, 'staleness').map((entry) => entry.building.id)).toEqual(['b-never', 'b-stale', 'b-fresh']);
  });

  it('falls back on the address for two equally old buildings', () => {
    expect(compareByStaleness(entryFor('b-stale'), entryFor('b-stale'))).toBe(0);
    expect(sortBuildingList(entries, 'address').map((entry) => entry.building.addressLabel)).toEqual([
      '18 rue du Languedoc', '3 place des Carmes', '7 rue des Filatiers'
    ]);
  });
});
