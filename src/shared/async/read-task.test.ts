import { afterEach, expect, it, vi } from 'vitest';
import { readTask, readSession } from './read-task';
afterEach(() => vi.useRealTimers());
it('ends a hung read with a recoverable timeout', async () => {
  vi.useFakeTimers(); const assertion = expect(readTask(new Promise(() => undefined), undefined, 50)).rejects.toMatchObject({ name: 'ReadTimeoutError' });
  await vi.advanceTimersByTimeAsync(50); await assertion;
});
it('ignores a late result after cancellation', async () => {
  const controller = new AbortController(); let finish!: (value: number) => void;
  const task = readTask(new Promise<number>(resolve => { finish = resolve; }), controller.signal); controller.abort(); finish(42);
  await expect(task).rejects.toMatchObject({ name: 'ReadAbortedError' });
});

it('aborts the paginated reader when the overall deadline expires', async () => {
  vi.useFakeTimers(); let signal!: AbortSignal;
  const task = readSession(async active => { signal = active; await readTask(new Promise(() => undefined), active); return 1; }, undefined, 50);
  const assertion = expect(task).rejects.toMatchObject({ name: 'ReadTimeoutError' });
  await vi.advanceTimersByTimeAsync(50); await assertion; expect(signal.aborted).toBe(true);
});
