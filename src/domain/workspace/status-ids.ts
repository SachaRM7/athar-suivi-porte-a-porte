/** Identifiants persistés dans workspaces ; les clés visuelles todo/open/away/dnd ne le sont pas. */
export const WORKSPACE_STATUS_IDS = ['unvisited', 'contacted', 'retry', 'linked', 'do-not-return', 'locked'] as const;
export type WorkspaceStatusId = (typeof WORKSPACE_STATUS_IDS)[number];

export function isWorkspaceStatusId(value: string): value is WorkspaceStatusId {
  return (WORKSPACE_STATUS_IDS as readonly string[]).includes(value);
}

/** Local display evidence only; server projections additionally verify the referenced history. */
export function hasRecordedVisit(door: { active: boolean; lastVisitId: string | null; currentStatusId: string }): boolean {
  return door.active && Boolean(door.lastVisitId) && isWorkspaceStatusId(door.currentStatusId);
}

export const WORKSPACE_VISUAL_STATUS = {
  unvisited: 'todo', contacted: 'open', retry: 'away', linked: 'linked', 'do-not-return': 'dnd', locked: 'locked'
} as const;
