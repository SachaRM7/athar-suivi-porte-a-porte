import { geohashForLocation } from 'geofire-common';
import type { Door, WorkspaceSnapshot } from '../../domain/workspace/models';

export type LoadWorkspaceOptions = {
  buildingCount?: number;
  featuredDoorCount?: number;
  featuredVisitCount?: number;
};

export function generateLoadWorkspace(options: LoadWorkspaceOptions = {}): WorkspaceSnapshot {
  const buildingCount = options.buildingCount ?? 300;
  const featuredDoorCount = options.featuredDoorCount ?? 180;
  const featuredVisitCount = options.featuredVisitCount ?? 150;
  const pointFor = (index: number) => {
    if (buildingCount > 1 && index === buildingCount - 1) {
      // Deliberate geohash candidate outside the measured viewport, used to
      // prove exact bbox filtering rather than only range matching.
      return { latitude: 43.5938, longitude: 1.4228 };
    }
    const row = Math.floor(index / 20);
    const column = index % 20;
    return { latitude: 43.596 + row * .0007, longitude: 1.426 + column * .0008 };
  };
  const doors: Door[] = [];
  const buildings = Array.from({ length: buildingCount }, (_, index) => {
    const location = pointFor(index);
    const id = `load-building-${String(index).padStart(3, '0')}`;
    const geohash = geohashForLocation([location.latitude, location.longitude]);
    if (index === 0) {
      for (let doorIndex = 0; doorIndex < featuredDoorCount; doorIndex += 1) {
        const isHistoryDoor = doorIndex === 0 && featuredVisitCount > 0;
        doors.push({ id: `load-door-${String(doorIndex).padStart(3, '0')}`, buildingId: id, zoneId: 'load-zone', location, geohash, floor: Math.floor(doorIndex / 12), label: String(100 + doorIndex), sortOrder: doorIndex, active: true, currentStatusId: 'unvisited', revision: isHistoryDoor ? featuredVisitCount : 0, lastVisitId: isHistoryDoor ? `load-visit-${String(featuredVisitCount - 1).padStart(3, '0')}` : null, lastVisitAt: isHistoryDoor ? `2026-08-03T08:${String((featuredVisitCount - 1) % 60).padStart(2, '0')}:00.000Z` : null, createdBy: 'load-member', foyer: null, sisters: false });
      }
    } else {
      doors.push({ id: `load-door-${String(featuredDoorCount + index).padStart(3, '0')}`, buildingId: id, zoneId: 'load-zone', location, geohash, floor: 0, label: '01', sortOrder: 0, active: true, currentStatusId: 'unvisited', revision: 0, lastVisitId: null, lastVisitAt: null, createdBy: 'load-member', foyer: null, sisters: false });
    }
    return { id, addressLabel: `${index} rue de charge, Toulouse`, location, geohash, zoneId: 'load-zone', createdBy: 'load-member', structureRevision: 0 };
  });
  return {
    id: 'load',
    members: [{ id: 'load-member', username: 'load.member', displayName: 'Load member', role: 'member', active: true, createdAt: '2026-08-03T08:00:00.000Z' }],
    statuses: [{ id: 'unvisited', label: 'Pas encore fait', color: '#8B948F', order: 0, active: true }],
    zones: [{ id: 'load-zone', name: 'Charge Toulouse', color: '#16835F', coverageState: 'active', assigneeLabel: null, bbox: { north: 43.62, south: 43.59, east: 1.46, west: 1.42 }, geometry: { type: 'Polygon', coordinates: [[1.42, 43.59], [1.46, 43.59], [1.46, 43.62], [1.42, 43.59]] } }],
    zoneStats: [{ zoneId: 'load-zone', doorCount: doors.length, countsByStatus: { unvisited: doors.length }, updatedAt: '2026-08-03T08:00:00.000Z' }],
    buildings,
    doors,
    visits: Array.from({ length: featuredVisitCount }, (_, index) => ({ id: `load-visit-${String(index).padStart(3, '0')}`, doorId: 'load-door-000', statusId: 'unvisited', note: '', authorId: 'load-member', occurredAt: `2026-08-03T08:${String(index % 60).padStart(2, '0')}:00.000Z`, syncedAt: '2026-08-03T08:00:00.000Z', doorRevision: index + 1, replacesVisitId: null, voidedAt: null }))
  };
}
