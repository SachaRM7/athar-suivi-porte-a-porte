import { useCallback, useRef, useState } from 'react';
import type { Building } from '../../../domain/workspace/models';
import type { WorkspaceRepositories } from '../../../domain/workspace/repositories';

export type OpenedBuilding = {
  building: Building | null;
  select(building: Building, options: { persisted: boolean }): void;
  close(): void;
  /** Écrit le document du bâtiment uniquement s'il n'existe pas encore. */
  ensureExists(): Promise<void>;
};

/**
 * Un bâtiment détecté sur la carte peut être ouvert sans exister en base : la fiche
 * s'affiche alors sur l'état vide « Bâtiment non décrit ». Le document n'est écrit qu'au
 * premier geste qui a besoin de lui — décrire la structure — conformément à `02-DATA-MODEL.md`.
 */
export function useOpenedBuilding(repositories: WorkspaceRepositories): OpenedBuilding {
  const [building, setBuilding] = useState<Building | null>(null);
  const persisted = useRef(true);
  const opened = useRef<Building | null>(null);

  const select = useCallback((next: Building, options: { persisted: boolean }) => {
    persisted.current = options.persisted;
    opened.current = next;
    setBuilding(next);
  }, []);

  const close = useCallback(() => {
    opened.current = null;
    persisted.current = true;
    setBuilding(null);
  }, []);

  const ensureExists = useCallback(async () => {
    const current = opened.current;
    if (!current || persisted.current) return;
    await repositories.buildings.create(current);
    persisted.current = true;
  }, [repositories]);

  return { building, select, close, ensureExists };
}
