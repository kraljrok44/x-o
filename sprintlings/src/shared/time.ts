export const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC day key, e.g. "2026-10-25". Daily content rolls over at 00:00 UTC. */
export function dayKey(timeMs: number): string {
  return new Date(timeMs).toISOString().slice(0, 10);
}

export function startOfUtcDay(timeMs: number): number {
  return Math.floor(timeMs / DAY_MS) * DAY_MS;
}

export function msUntilNextUtcDay(timeMs: number): number {
  return startOfUtcDay(timeMs) + DAY_MS - timeMs;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${total % 60}s`;
}

export function formatRaceTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
