// In-memory ring buffer of recent backend errors. Survives only until the
// process restarts — good enough for a live ops view without paying for a
// schema migration. Bumped to disk only if we add persistence later.

export interface ErrorLogEntry {
  id: string;
  at: string;             // ISO timestamp
  message: string;
  stack?: string;
  source: 'request' | 'unhandledRejection' | 'uncaughtException' | 'manual';
  method?: string;
  path?: string;
  statusCode?: number;
  userId?: string;
}

const MAX = 200;
const buffer: ErrorLogEntry[] = [];
let counter = 0;

function nextId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter.toString(36)}`;
}

export function recordError(entry: Omit<ErrorLogEntry, 'id' | 'at'>): void {
  buffer.unshift({ id: nextId(), at: new Date().toISOString(), ...entry });
  if (buffer.length > MAX) buffer.length = MAX;
}

export function getRecentErrors(limit = 50): ErrorLogEntry[] {
  return buffer.slice(0, Math.min(limit, MAX));
}

export function clearErrors(): void {
  buffer.length = 0;
}
