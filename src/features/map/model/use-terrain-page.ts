import { useCallback, useEffect, useRef, useState } from 'react';
import type { Building, Door } from '../../../domain/workspace/models';
import type { WorkspaceReadRepositories } from '../../../domain/workspace/repositories';
import { readTask } from '../../../shared/async/read-task';
import { loadTerrainPage } from './terrain-reads';

type PageState = { zoneId: string | null; phase: 'loading' | 'ready' | 'error'; buildings: readonly Building[]; doors: readonly Door[]; index: number; nextCursor: string | null; documentsRead: number };
const EMPTY: PageState = { zoneId: null, phase: 'loading', buildings: [], doors: [], index: 0, nextCursor: null, documentsRead: 0 };

export function useTerrainPage(repositories: WorkspaceReadRepositories, zoneId: string | null, reloadToken: number) {
  const [state, setState] = useState<PageState>(EMPTY);
  const request = useRef<AbortController | null>(null);
  const navigation = useRef<{ zoneId: string | null; index: number; cursors: (string | null)[] }>({ zoneId: null, index: 0, cursors: [null] });
  const load = useCallback(async (id: string | null, index: number) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    if (navigation.current.zoneId !== id) navigation.current = { zoneId: id, index: 0, cursors: [null] };
    navigation.current.index = index;
    setState({ ...EMPTY, zoneId: id, index, phase: id ? 'loading' : 'ready' });
    if (!id) return;
    try {
      const result = await readTask(loadTerrainPage(repositories, id, { cursor: navigation.current.cursors[index], signal: controller.signal }), controller.signal, 30_000);
      if (request.current !== controller || controller.signal.aborted) return;
      navigation.current.cursors = navigation.current.cursors.slice(0, index + 1);
      if (result.nextCursor) navigation.current.cursors.push(result.nextCursor);
      setState({ ...result, zoneId: id, index, phase: 'ready' });
    } catch {
      if (request.current !== controller || controller.signal.aborted) return;
      controller.abort();
      setState({ ...EMPTY, zoneId: id, index, phase: 'error' });
    }
  }, [repositories]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void load(zoneId, navigation.current.zoneId === zoneId ? navigation.current.index : 0); });
    const currentRequest = request;
    return () => { active = false; currentRequest.current?.abort(); };
  }, [load, zoneId, reloadToken]);
  const visible = state.zoneId === zoneId ? state : EMPTY;
  return {
    ...visible,
    partial: visible.index > 0 || visible.nextCursor !== null,
    retry: () => void load(zoneId, navigation.current.index),
    next: () => { if (visible.nextCursor && visible.phase === 'ready') void load(zoneId, visible.index + 1); },
    previous: () => { if (visible.index > 0 && visible.phase !== 'loading') void load(zoneId, visible.index - 1); }
  };
}
