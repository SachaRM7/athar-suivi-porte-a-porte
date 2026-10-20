import type { ZoneDoorProgress } from '../../../domain/workspace/zone-progress';

export function zoneProgressSummary(progress: ZoneDoorProgress): string {
  if (progress.state === 'unavailable') return 'Statistiques indisponibles';
  if (progress.state === 'empty') return 'Aucune porte décrite dans ce relevé';
  return `${progress.visited}/${progress.total} portes décrites avec passage`;
}

export function zoneProgressDate(progress: ZoneDoorProgress): string {
  if (!progress.updatedAt) return 'Relevé indisponible';
  return `Relevé du ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(progress.updatedAt))}`;
}
