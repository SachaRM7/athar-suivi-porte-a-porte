export type ReadRequest = {
  cursor?: string | null;
  pageSize?: number;
  signal?: AbortSignal;
};

export type ReadMetrics = {
  documentsRead: number;
  returnedCount: number;
  responseBytes: number;
  rangeCount: number;
  duplicateCount: number;
  falsePositiveCount: number;
  durationMs: number;
};

export type ReadPage<T> = {
  items: readonly T[];
  nextCursor: string | null;
  metrics: ReadMetrics;
};

export class ReadAbortedError extends Error {
  constructor() {
    super('Read was superseded by a newer request.');
    this.name = 'ReadAbortedError';
  }
}

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export function pageSizeFor(request?: ReadRequest): number {
  const size = request?.pageSize ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(size) || size < 1 || size > MAX_PAGE_SIZE) {
    throw new Error(`Page size must be an integer from 1 to ${MAX_PAGE_SIZE}.`);
  }
  return size;
}

export function throwIfReadAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ReadAbortedError();
}

export function responseSizeBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function encodeReadCursor(scope: string, value: Record<string, string | number>): string {
  return encodeURIComponent(JSON.stringify({ ...value, scope, version: 1 }));
}

export function decodeReadCursor(cursor: string | null | undefined, expectedScope: string): Record<string, unknown> | null {
  if (!cursor) return null;
  try {
    const value: unknown = JSON.parse(decodeURIComponent(cursor));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
    const decoded = value as Record<string, unknown>;
    if (decoded.version !== 1 || decoded.scope !== expectedScope) throw new Error('invalid');
    return decoded;
  } catch {
    throw new Error('Read cursor is invalid.');
  }
}
