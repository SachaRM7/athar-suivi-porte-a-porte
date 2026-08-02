import type { WorkspaceSnapshot } from '../../domain/workspace/models';
import { geohashForLocation } from 'geofire-common';

const createdAt = '2026-07-29T09:00:00.000Z';
const visitedAt = '2026-07-29T10:30:00.000Z';
const dalbadGeohash = geohashForLocation([43.6058, 1.4454]);
const carmesGeohash = geohashForLocation([43.6072, 1.4481]);

export const demoWorkspace: WorkspaceSnapshot = {
  id: 'main',
  members: [
    { id: 'admin-1', username: 'sacha.admin', displayName: 'Sacha', role: 'admin', active: true, createdAt },
    { id: 'member-1', username: 'terrain.31', displayName: 'Terrain 31', role: 'member', active: true, createdAt },
    { id: 'former-member', username: 'archive.31', displayName: 'Archive 31', role: 'member', active: false, createdAt }
  ],
  statuses: [
    { id: 'unvisited', label: 'Pas visite', color: '#8C9494', order: 0, active: true },
    { id: 'retry', label: 'A revenir', color: '#D8A200', order: 1, active: true },
    { id: 'contacted', label: 'Contact', color: '#16835F', order: 2, active: true },
    { id: 'do-not-return', label: 'Ne pas revenir', color: '#B8403B', order: 3, active: true }
  ],
  zones: [{
    id: 'carmes', name: 'Carmes', color: '#16835F', coverageState: 'active', assigneeLabel: 'Terrain 31',
    bbox: { north: 43.6089, south: 43.6039, east: 1.4518, west: 1.4418 },
    geometry: { type: 'Polygon', coordinates: [[1.4418, 43.6039], [1.4518, 43.6039], [1.4518, 43.6089], [1.4418, 43.6089], [1.4418, 43.6039]] }
  }],
  zoneStats: [{ zoneId: 'carmes', doorCount: 4, countsByStatus: { unvisited: 2, retry: 1, contacted: 1 }, updatedAt: visitedAt }],
  buildings: [
    { id: 'building-dalbad', addressLabel: '18 rue du Languedoc, Toulouse', location: { latitude: 43.6058, longitude: 1.4454 }, geohash: dalbadGeohash, zoneId: 'carmes', createdBy: 'admin-1' },
    { id: 'building-carmes', addressLabel: '7 rue des Filatiers, Toulouse', location: { latitude: 43.6072, longitude: 1.4481 }, geohash: carmesGeohash, zoneId: 'carmes', createdBy: 'admin-1' }
  ],
  doors: [
    { id: 'door-dalbad-01', buildingId: 'building-dalbad', zoneId: 'carmes', location: { latitude: 43.6058, longitude: 1.4454 }, geohash: dalbadGeohash, floor: 0, label: '01', currentStatusId: 'contacted', revision: 1, lastVisitId: 'visit-dalbad-01', createdBy: 'admin-1' },
    { id: 'door-dalbad-02', buildingId: 'building-dalbad', zoneId: 'carmes', location: { latitude: 43.6058, longitude: 1.4454 }, geohash: dalbadGeohash, floor: 0, label: '02', currentStatusId: 'unvisited', revision: 0, lastVisitId: null, createdBy: 'admin-1' },
    { id: 'door-carmes-11', buildingId: 'building-carmes', zoneId: 'carmes', location: { latitude: 43.6072, longitude: 1.4481 }, geohash: carmesGeohash, floor: 1, label: '11', currentStatusId: 'retry', revision: 1, lastVisitId: 'visit-carmes-11', createdBy: 'admin-1' },
    { id: 'door-carmes-12', buildingId: 'building-carmes', zoneId: 'carmes', location: { latitude: 43.6072, longitude: 1.4481 }, geohash: carmesGeohash, floor: 1, label: '12', currentStatusId: 'unvisited', revision: 0, lastVisitId: null, createdBy: 'admin-1' }
  ],
  visits: [
    { id: 'visit-dalbad-01', doorId: 'door-dalbad-01', statusId: 'contacted', note: 'Accueil cordial.', authorId: 'member-1', occurredAt: visitedAt, syncedAt: visitedAt, doorRevision: 1, replacesVisitId: null, voidedAt: null },
    { id: 'visit-carmes-11', doorId: 'door-carmes-11', statusId: 'retry', note: 'Repasser en fin de journee.', authorId: 'member-1', occurredAt: visitedAt, syncedAt: visitedAt, doorRevision: 1, replacesVisitId: null, voidedAt: null }
  ]
};
