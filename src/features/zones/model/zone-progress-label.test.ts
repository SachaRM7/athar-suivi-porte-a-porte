import { describe, expect, it } from 'vitest';
import type { ZoneStats } from '../../../domain/workspace/models';
import { zoneDoorProgress } from '../../../domain/workspace/zone-progress';
import { zoneBuildingCoverage, zoneStatsProvenance } from './zone-progress-label';
const stats: ZoneStats = {
  zoneId: 'z', schemaVersion: 2, formulaVersion: 'doors-history-v2', completeness: 'complete', generation: 'g',
  updatedAt: '2026-10-01T00:00:00Z', sourceReadTime: '2026-10-01T00:00:00Z', computedAt: '2026-10-01T00:01:00Z',
  doorCount: 20, visitedDoorCount: 1, countsByStatus: { linked: 1, unvisited: 19 },
  detectedBuildingCount: 100, describedCatalogueBuildingCount: 1, visitedCatalogueBuildingCount: 1, outsideCatalogueBuildingCount: 2, catalogueVersion: 'catalogue'
};
describe('canonical statistics presentation', () => {
  it('separates door progression from catalogue coverage and local buildings', () => {
    expect(zoneDoorProgress(stats, 'z').percent).toBe(5);
    expect(zoneBuildingCoverage(stats)).toContain('100 bâtiments détectés · 1 décrits · 1 avec passage (1 %)');
    expect(zoneBuildingCoverage(stats)).toContain('2 suivis hors catalogue');
  });
  it('rejects interrupted or invalid reconstructions even if their old counters look consistent', () => {
    for (const completeness of ['incomplete', 'invalid'] as const) {
      expect(zoneDoorProgress({ ...stats, completeness }, 'z').state).toBe('unavailable');
      expect(zoneBuildingCoverage({ ...stats, completeness })).toContain('indisponible');
    }
  });
  it('does not mistake zero known buildings for an unknown catalogue', () => {
    expect(zoneBuildingCoverage({ ...stats, detectedBuildingCount: null })).toContain('indisponible');
    expect(zoneBuildingCoverage({ ...stats, detectedBuildingCount: 0, describedCatalogueBuildingCount: 0, visitedCatalogueBuildingCount: 0 })).toContain('sans pourcentage');
  });
  it('identifies cached and unreconstructed records without claiming live data', () => {
    expect(zoneStatsProvenance({ ...stats, readSource: 'cache' })).toContain('Copie hors ligne');
    expect(zoneStatsProvenance({ ...stats, schemaVersion: undefined })).toContain('ancien relevé non reconstruit');
  });
});
