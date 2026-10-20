import { ReadAbortedError } from '../../domain/workspace/read-pagination';

export class ReadTimeoutError extends Error {
  constructor() { super('La lecture prend trop de temps. Vérifie la connexion puis réessaie.'); this.name = 'ReadTimeoutError'; }
}

/** The SDK cannot cancel an issued read; stop waiting and never issue its next page. */
export function readTask<T>(work: Promise<T>, signal?: AbortSignal, timeout = 15_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => finish(new ReadAbortedError());
    const timer = setTimeout(() => finish(new ReadTimeoutError()), timeout);
    function finish(error?: unknown, value?: T) {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(value!);
    }
    signal?.addEventListener('abort', abort, { once: true });
    work.then(value => finish(undefined, value), error => finish(error));
    if (signal?.aborted) abort();
  });
}

export async function mapLimited<T, R>(items: readonly T[], concurrency: number, signal: AbortSignal | undefined, run: (item: T) => Promise<R>): Promise<R[]> {
  const result: R[] = new Array(items.length);
  let next = 0;
  let failed = false;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (!failed && next < items.length) {
      signal?.throwIfAborted();
      const index = next++;
      try { result[index] = await run(items[index]); }
      catch (error) { failed = true; throw error; }
    }
  }));
  signal?.throwIfAborted();
  return result;
}

/** A deadline stops both the UI wait and the scheduling of subsequent pages. */
export async function readSession<T>(run: (signal: AbortSignal) => Promise<T>, parent?: AbortSignal, timeout = 30_000): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  parent?.addEventListener('abort', abort, { once: true });
  if (parent?.aborted) abort();
  try { return await readTask(run(controller.signal), parent, timeout); }
  finally { controller.abort(); parent?.removeEventListener('abort', abort); }
}
