import type { ZoneStats } from '../../../domain/workspace/models';
import { zoneDoorProgress } from '../../../domain/workspace/zone-progress';
import type { ZoneDoorProgress } from '../../../domain/workspace/zone-progress';

export function zoneProgressSummary(progress: ZoneDoorProgress): string {
  if (progress.state === 'unavailable') return 'Progression indisponible';
  if (progress.state === 'empty') return 'Aucune porte décrite pour l’instant';
  return `${progress.visited}/${progress.total} portes visitées`;
}

export function zoneProgressDate(progress: ZoneDoorProgress): string {
  if (!progress.updatedAt) return 'Relevé indisponible';
  return `Relevé du ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(progress.updatedAt))}`;
}

export function zoneStatsProvenance(stats: ZoneStats | null): string {
  if (!stats) return 'Relevé indisponible';
  const source = stats.readSource === 'cache' ? 'Copie hors ligne' : stats.readSource === 'server' ? 'Relevé serveur' : 'Relevé enregistré';
  return `${source} · ${stats.schemaVersion === 2 ? 'historique vérifié' : 'ancien relevé non reconstruit'}. Les passages en attente sur cet appareil sont exclus.`;
}

export function zoneBuildingCoverage(stats: ZoneStats | null): string {
  if (!stats || zoneDoorProgress(stats, stats.zoneId).state === 'unavailable'
    || stats.detectedBuildingCount == null || !stats.catalogueVersion) return 'Couverture des bâtiments indisponible : catalogue complet requis';
  const total = stats.detectedBuildingCount;
  const described = stats.describedCatalogueBuildingCount;
  const visited = stats.visitedCatalogueBuildingCount;
  if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(visited) || !Number.isSafeInteger(described)
    || visited! < 0 || described! < visited! || described! > total) return 'Couverture des bâtiments indisponible';
  const percent = total === 0 ? 'sans pourcentage' : `${Number(BigInt(visited!) * 100n / BigInt(total))} %`;
  return `${total} bâtiments détectés · ${described} décrits · ${visited} avec passage (${percent}) · ${stats.outsideCatalogueBuildingCount ?? 0} suivis hors catalogue`;
}
