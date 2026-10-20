/** Identifiants persistés dans workspaces ; les clés visuelles todo/open/away/dnd ne le sont pas. */
export const WORKSPACE_STATUS_IDS = ['unvisited', 'contacted', 'retry', 'linked', 'do-not-return', 'locked'] as const;
export type WorkspaceStatusId = (typeof WORKSPACE_STATUS_IDS)[number];

export function isWorkspaceStatusId(value: string): value is WorkspaceStatusId {
  return (WORKSPACE_STATUS_IDS as readonly string[]).includes(value);
}
