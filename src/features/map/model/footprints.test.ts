import { describe, expect, it } from 'vitest';
import type { Building, Door, Status, Zone, ZoneStats } from '../../../domain/workspace/models';
import {
  centerOfRing,
  dominantStatusId,
  doorsByBuilding,
  footprintState,
  isInsideZone,
  squareAround,
  zoneProgressLabel,
  type FootprintContext
} from './footprints';

const zone: Zone = {
  id: 'carmes', name: 'Carmes', color: '#16835F', coverageState: 'active', assigneeLabel: null,
  bbox: { north: 43.6089, south: 43.6039, east: 1.4518, west: 1.4418 },
  geometry: { type: 'Polygon', coordinates: [[1.4418, 43.6039], [1.4518, 43.6039], [1.4518, 43.6089], [1.4418, 43.6089], [1.4418, 43.6039]] }
};

const statuses = new Map<string, Status>([
  ['unvisited', { id: 'unvisited', label: 'Pas visite', color: '#8C9494', order: 0, active: true }],
  ['retry', { id: 'retry', label: 'A revenir', color: '#D8A200', order: 1, active: true }],
  ['contacted', { id: 'contacted', label: 'Contact', color: '#16835F', order: 2, active: true }]
]);

function door(overrides: Partial<Door> & Pick<Door, 'id' | 'buildingId' | 'currentStatusId'>): Door {
  return {
    zoneId: 'carmes', location: { latitude: 43.6058, longitude: 1.4454 }, geohash: 'spdt',
    floor: 0, label: '01', sortOrder: 0, active: true, revision: 1, lastVisitId: 'visit-1', createdBy: 'admin-1', sisters: false,
    ...overrides
  };
}

function building(id: string): Building {
  return { id, addressLabel: id, location: { latitude: 43.6058, longitude: 1.4454 }, geohash: 'spdt', zoneId: 'carmes', createdBy: 'admin-1', structureRevision: 0 };
}

const context = (overrides: Partial<FootprintContext> = {}): FootprintContext => ({
  zone, buildings: new Map(), doorsByBuilding: new Map(), statuses, untouchedColor: '#CDD3CD', ...overrides
});

describe('dominantStatusId', () => {
  it('returns null while no door carries a passage', () => {
    expect(dominantStatusId([door({ id: 'd1', buildingId: 'b', currentStatusId: 'unvisited', lastVisitId: null })])).toBeNull();
  });

  it('applies the open > away priority of the data model', () => {
    const doors = [
      door({ id: 'd1', buildingId: 'b', currentStatusId: 'retry' }),
      door({ id: 'd2', buildingId: 'b', currentStatusId: 'contacted' }),
      door({ id: 'd3', buildingId: 'b', currentStatusId: 'do-not-return' })
    ];
    expect(dominantStatusId(doors)).toBe('contacted');
  });

  it('ignores doors that were never visited', () => {
    const doors = [
      door({ id: 'd1', buildingId: 'b', currentStatusId: 'unvisited', lastVisitId: null }),
      door({ id: 'd2', buildingId: 'b', currentStatusId: 'retry' })
    ];
    expect(dominantStatusId(doors)).toBe('retry');
  });
});

describe('footprintState', () => {
  it('leaves a footprint without a Firestore document untracked and grey', () => {
    const state = footprintState('PG31CARMES002', [1.447, 43.6065], context());
    expect(state).toEqual({ inZone: true, tracked: false, color: '#CDD3CD', sisters: false });
  });

  it('colours a tracked footprint with its dominant status', () => {
    const state = footprintState('building-dalbad', [1.4454, 43.6058], context({
      buildings: new Map([['building-dalbad', building('building-dalbad')]]),
      doorsByBuilding: new Map([['building-dalbad', [door({ id: 'd1', buildingId: 'building-dalbad', currentStatusId: 'retry' })]]])
    }));
    expect(state).toEqual({ inZone: true, tracked: true, color: '#D8A200', sisters: false });
  });

  it('keeps a described building without any passage grey', () => {
    const state = footprintState('building-dalbad', [1.4454, 43.6058], context({
      buildings: new Map([['building-dalbad', building('building-dalbad')]]),
      doorsByBuilding: new Map([['building-dalbad', [door({ id: 'd1', buildingId: 'building-dalbad', currentStatusId: 'unvisited', lastVisitId: null })]]])
    }));
    expect(state).toMatchObject({ tracked: true, color: '#CDD3CD' });
  });

  it('marks a footprint outside the active zone', () => {
    expect(footprintState('PG31HORS0001', [1.4415, 43.6065], context()).inZone).toBe(false);
  });

  it('lights the sisters ring as soon as one door carries the marker', () => {
    const state = footprintState('building-dalbad', [1.4454, 43.6058], context({
      buildings: new Map([['building-dalbad', building('building-dalbad')]]),
      doorsByBuilding: new Map([['building-dalbad', [
        door({ id: 'd1', buildingId: 'building-dalbad', currentStatusId: 'retry' }),
        door({ id: 'd2', buildingId: 'building-dalbad', currentStatusId: 'retry', sisters: true })
      ]]])
    }));
    expect(state.sisters).toBe(true);
  });

  it('leaves the ring dark on a footprint that has no document', () => {
    expect(footprintState('PG31CARMES002', [1.447, 43.6065], context()).sisters).toBe(false);
  });
});

describe('geometry helpers', () => {
  it('centres a closed ring on its footprint', () => {
    const center = centerOfRing([[1.4, 43.6], [1.402, 43.6], [1.402, 43.602], [1.4, 43.602], [1.4, 43.6]]);
    expect(center[0]).toBeCloseTo(1.401, 6);
    expect(center[1]).toBeCloseTo(43.601, 6);
  });

  it('reports no zone as outside', () => {
    expect(isInsideZone(null, [1.4468, 43.6064])).toBe(false);
  });

  it('draws a square of the requested size around a placed building', () => {
    const ring = squareAround(1.4468, 43.6064, 14);
    expect(ring).toHaveLength(5);
    expect((ring[2]![1] - ring[0]![1]) * 111_320).toBeCloseTo(14, 3);
  });
});

describe('doorsByBuilding', () => {
  it('drops archived doors so they never colour a footprint', () => {
    const grouped = doorsByBuilding([
      door({ id: 'd1', buildingId: 'b', currentStatusId: 'retry' }),
      door({ id: 'd2', buildingId: 'b', currentStatusId: 'contacted', active: false })
    ]);
    expect(grouped.get('b')).toHaveLength(1);
  });
});

describe('zoneProgressLabel', () => {
  it('aggregates the zone progress read below zoom 16', () => {
    const stats: ZoneStats = { zoneId: 'carmes', doorCount: 6, countsByStatus: { unvisited: 3, retry: 1, contacted: 2 }, updatedAt: '2026-07-29T10:30:00.000Z' };
    expect(zoneProgressLabel(zone, stats)).toBe('Carmes · 50 % · 3/6 portes');
  });

  it('invites to describe a zone that has no door yet', () => {
    expect(zoneProgressLabel(zone, null)).toBe('Carmes · aucune porte décrite');
  });
});
