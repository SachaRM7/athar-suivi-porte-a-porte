import type { WorkspaceSnapshot } from '../../domain/workspace/models';
import { geohashForLocation } from 'geofire-common';

const createdAt = '2026-07-29T09:00:00.000Z';

/**
 * Les deux passages de démonstration sont datés **relativement à aujourd'hui**, sinon la
 * colonne d'ancienneté finirait par afficher « il y a 3 ans » sur tout le jeu et le seuil
 * d'alerte de 90 jours ne serait plus démontrable.
 */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

const visitedAt = daysAgo(10);
/** Passage volontairement ancien : il fait vivre le seuil d'alerte de 90 jours. */
const staleVisitedAt = daysAgo(128);
const dalbadGeohash = geohashForLocation([43.6058, 1.4454]);
const carmesGeohash = geohashForLocation([43.6072, 1.4481]);

export const demoWorkspace: WorkspaceSnapshot = {
  id: 'main',
  members: [
    { id: 'admin-1', username: 'sacha.admin', displayName: 'Sacha', role: 'admin', active: true, createdAt },
    { id: 'member-1', username: 'terrain.31', displayName: 'Terrain 31', role: 'member', active: true, createdAt },
    { id: 'member-b', username: 'terrain.b', displayName: 'Terrain B', role: 'member', active: true, createdAt },
    { id: 'former-member', username: 'archive.31', displayName: 'Archive 31', role: 'member', active: false, createdAt }
  ],
  statuses: [
    { id: 'unvisited', label: 'Pas encore fait', color: '#8B948F', order: 0, active: true },
    { id: 'contacted', label: 'Contact établi', color: '#1F7A5A', order: 1, active: true },
    { id: 'retry', label: 'Absent', color: '#C87A0A', order: 2, active: true },
    { id: 'linked', label: "Attaché à l'effort", color: '#2456A6', order: 3, active: true },
    { id: 'do-not-return', label: 'Ne pas déranger', color: '#A93B2E', order: 4, active: true },
    { id: 'locked', label: 'Accès bloqué', color: '#6B5AA8', order: 5, active: true }
  ],
  zones: [{
    id: 'carmes', name: 'Carmes', color: '#16835F', coverageState: 'active', assigneeLabel: 'Terrain 31',
    bbox: { north: 43.6089, south: 43.6039, east: 1.4518, west: 1.4418 },
    geometry: { type: 'Polygon', coordinates: [[1.4418, 43.6039], [1.4518, 43.6039], [1.4518, 43.6089], [1.4418, 43.6089], [1.4418, 43.6039]] }
  }],
  zoneStats: [{ zoneId: 'carmes', doorCount: 6, countsByStatus: { unvisited: 3, retry: 1, contacted: 2 }, updatedAt: visitedAt }],
  buildings: [
    { id: 'building-dalbad', addressLabel: '18 rue du Languedoc, Toulouse', location: { latitude: 43.6058, longitude: 1.4454 }, geohash: dalbadGeohash, zoneId: 'carmes', createdBy: 'admin-1', structureRevision: 0 },
    { id: 'building-carmes', addressLabel: '7 rue des Filatiers, Toulouse', location: { latitude: 43.6072, longitude: 1.4481 }, geohash: carmesGeohash, zoneId: 'carmes', createdBy: 'admin-1', structureRevision: 0 }
  ],
  doors: [
    { id: 'door-dalbad-01', buildingId: 'building-dalbad', zoneId: 'carmes', location: { latitude: 43.6058, longitude: 1.4454 }, geohash: dalbadGeohash, floor: 0, label: '01', sortOrder: 0, active: true, currentStatusId: 'contacted', revision: 1, lastVisitId: 'visit-dalbad-01', lastVisitAt: visitedAt, createdBy: 'admin-1', foyer: 'famille', sisters: false },
    { id: 'door-dalbad-02', buildingId: 'building-dalbad', zoneId: 'carmes', location: { latitude: 43.6058, longitude: 1.4454 }, geohash: dalbadGeohash, floor: 0, label: '02', sortOrder: 1, active: true, currentStatusId: 'unvisited', revision: 0, lastVisitId: null, lastVisitAt: null, createdBy: 'admin-1', foyer: null, sisters: false },
    { id: 'door-dalbad-11', buildingId: 'building-dalbad', zoneId: 'carmes', location: { latitude: 43.6058, longitude: 1.4454 }, geohash: dalbadGeohash, floor: 1, label: '11', sortOrder: 2, active: true, currentStatusId: 'contacted', revision: 1, lastVisitId: 'visit-dalbad-11', lastVisitAt: visitedAt, createdBy: 'admin-1', foyer: null, sisters: false },
    { id: 'door-dalbad-12', buildingId: 'building-dalbad', zoneId: 'carmes', location: { latitude: 43.6058, longitude: 1.4454 }, geohash: dalbadGeohash, floor: 1, label: '12', sortOrder: 3, active: true, currentStatusId: 'unvisited', revision: 0, lastVisitId: null, lastVisitAt: null, createdBy: 'admin-1', foyer: null, sisters: false },
    { id: 'door-carmes-11', buildingId: 'building-carmes', zoneId: 'carmes', location: { latitude: 43.6072, longitude: 1.4481 }, geohash: carmesGeohash, floor: 1, label: '11', sortOrder: 0, active: true, currentStatusId: 'retry', revision: 1, lastVisitId: 'visit-carmes-11', lastVisitAt: staleVisitedAt, createdBy: 'admin-1', foyer: null, sisters: false },
    { id: 'door-carmes-12', buildingId: 'building-carmes', zoneId: 'carmes', location: { latitude: 43.6072, longitude: 1.4481 }, geohash: carmesGeohash, floor: 1, label: '12', sortOrder: 1, active: true, currentStatusId: 'unvisited', revision: 0, lastVisitId: null, lastVisitAt: null, createdBy: 'admin-1', foyer: 'femme', sisters: true }
  ],
  visits: [
    { id: 'visit-dalbad-01', doorId: 'door-dalbad-01', statusId: 'contacted', note: 'Accueil cordial.', authorId: 'member-1', occurredAt: visitedAt, syncedAt: visitedAt, doorRevision: 1, replacesVisitId: null, voidedAt: null },
    { id: 'visit-dalbad-11', doorId: 'door-dalbad-11', statusId: 'contacted', note: 'Passage termine.', authorId: 'member-1', occurredAt: visitedAt, syncedAt: visitedAt, doorRevision: 1, replacesVisitId: null, voidedAt: null },
    { id: 'visit-carmes-11', doorId: 'door-carmes-11', statusId: 'retry', note: 'Repasser en fin de journee.', authorId: 'member-1', occurredAt: staleVisitedAt, syncedAt: staleVisitedAt, doorRevision: 1, replacesVisitId: null, voidedAt: null }
  ]
};
