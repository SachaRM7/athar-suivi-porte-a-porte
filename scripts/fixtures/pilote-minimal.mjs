export const PILOTE_MINIMAL = Object.freeze({
  workspaceId: 'main',
  password: 'Temporary-password-123',
  createdAt: '2026-08-03T08:00:00.000Z',
  users: [
    { uid: 'admin-1', username: 'pilot.admin', displayName: 'Admin pilote', role: 'admin' },
    { uid: 'member-1', username: 'terrain.31', displayName: 'Terrain 31', role: 'member' },
    { uid: 'member-b', username: 'terrain.b', displayName: 'Terrain B', role: 'member' }
  ],
  building: {
    id: 'pilot-building-001',
    addressLabel: '1 rue du Pilote, Toulouse',
    latitude: 43.6058,
    longitude: 1.4454,
    zoneId: 'carmes'
  },
  door: { id: 'pilot-door-002', label: '02' }
});
