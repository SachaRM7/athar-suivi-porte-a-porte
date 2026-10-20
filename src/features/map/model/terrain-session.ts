import type { Door } from '../../../domain/workspace/models';
import type { TraceEntry } from '../../../design/components';
import { isWorkspaceStatusId, WORKSPACE_VISUAL_STATUS } from '../../../domain/workspace/status-ids';

/** Au-delà de ce silence entre deux portes, la sortie a marqué une pause. */
const PAUSE_AFTER_MINUTES = 20;

export type TerrainSession = {
  /** Portes marquées depuis le début de la journée, dans l'ordre où elles l'ont été. */
  trace: readonly TraceEntry[];
  markedCount: number;
  /** `null` tant qu'aucune porte n'a été marquée aujourd'hui. */
  durationLabel: string | null;
};

function sameDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

/** « 1 h 05 » au-delà de l'heure, « 25 min » en dessous, « à l'instant » sous la minute. */
export function elapsedLabel(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * L’activité du jour (derniers passages connus, tous auteurs) se lit sur les portes elles-mêmes : celles dont le dernier passage
 * date d'aujourd'hui. Aucune donnée de session n'est stockée à côté — le passage fait foi.
 */
export function terrainSession(doors: readonly Door[], now: Date = new Date()): TerrainSession {
  const marked = doors
    .filter((door) => door.active && door.lastVisitAt !== null && isWorkspaceStatusId(door.currentStatusId) && door.currentStatusId !== 'unvisited')
    .map((door) => ({ at: new Date(door.lastVisitAt!), statusId: door.currentStatusId }))
    .filter((entry) => !Number.isNaN(entry.at.getTime()) && sameDay(entry.at, now))
    .sort((left, right) => left.at.getTime() - right.at.getTime());

  if (marked.length === 0) return { trace: [], markedCount: 0, durationLabel: null };

  const trace: TraceEntry[] = [];
  marked.forEach((entry, index) => {
    const previous = marked[index - 1];
    if (previous && entry.at.getTime() - previous.at.getTime() > PAUSE_AFTER_MINUTES * 60_000) trace.push('pause');
    if (isWorkspaceStatusId(entry.statusId)) trace.push(WORKSPACE_VISUAL_STATUS[entry.statusId]);
  });

  const span = marked[marked.length - 1]!.at.getTime() - marked[0]!.at.getTime();
  return { trace, markedCount: marked.length, durationLabel: elapsedLabel(span) };
}
