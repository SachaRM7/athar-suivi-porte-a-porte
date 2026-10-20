import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import { fromFirestoreZoneStats } from './workspace-codecs';

const updatedAt = Timestamp.fromDate(new Date('2026-08-03T08:00:00.000Z'));

describe('frontière Firestore des projections', () => {
  it('refuse une projection partielle plutôt que de fabriquer 100 %', () => {
    expect(() => fromFirestoreZoneStats('carmes', { doorCount: 10, countsByStatus: { contacted: 2 }, updatedAt }))
      .toThrow('do not cover');
  });

  it('ne mélange pas les statuts du schéma historique avec ceux du workspace', () => {
    expect(() => fromFirestoreZoneStats('carmes', { doorCount: 2, countsByStatus: { todo: 1, open: 1 }, updatedAt }))
      .toThrow('unknown workspace status');
  });

  it('décode un relevé complet et conserve sa date serveur', () => {
    expect(fromFirestoreZoneStats('carmes', { doorCount: 2, countsByStatus: { unvisited: 1, retry: 1 }, updatedAt }))
      .toEqual({ zoneId: 'carmes', doorCount: 2, countsByStatus: { unvisited: 1, retry: 1 }, updatedAt: '2026-08-03T08:00:00.000Z' });
  });
});
