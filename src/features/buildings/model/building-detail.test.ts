import { describe, expect, it } from 'vitest';
import { floorLabel, floorProgress, overallProgress } from './building-detail';
import type { Door } from '../../../domain/workspace/models';

const door = (id: string, floor: number, status: string, active = true): Door => ({
  id, buildingId: 'building', zoneId: 'zone', location: { latitude: 43.6, longitude: 1.4 }, geohash: 'spc0',
  floor, label: id, sortOrder: Number(id.replace(/\D/g, '')) || 0, active, currentStatusId: status,
  revision: 3, lastVisitId: 'visit', createdBy: 'member', sisters: false
});

describe('building detail progress', () => {
  it('keeps archived doors out of floor and building progress', () => {
    const doors = [door('01', 0, 'contacted'), door('02', 0, 'unvisited'), door('11', 1, 'retry'), door('12', 1, 'unvisited', false)];
    expect(floorProgress(doors)).toEqual([
      { floor: 0, doorCount: 2, treatedCount: 1, ratio: .5 },
      { floor: 1, doorCount: 1, treatedCount: 1, ratio: 1 }
    ]);
    expect(overallProgress(doors)).toMatchObject({ doorCount: 3, treatedCount: 2, ratio: 2 / 3 });
  });

  it('uses human floor labels and can be rendered from the highest level down', () => {
    const progress = floorProgress([door('01', 0, 'unvisited'), door('11', 1, 'unvisited'), door('21', 2, 'unvisited')]);
    expect(progress.slice().reverse().map((item) => floorLabel(item.floor))).toEqual(['2ème', '1er', 'RDC']);
  });
});
