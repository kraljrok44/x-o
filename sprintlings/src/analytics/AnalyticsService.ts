export interface AnalyticsEvent {
  name: string;
  at: number;
  props: Record<string, string | number | boolean>;
}

/**
 * Minimal, privacy-first analytics: anonymous gameplay events (race finished,
 * shop opened...) batched to our own server only when consent was granted.
 * No third-party trackers, no personal data. Without an endpoint the last
 * events stay in memory for debugging.
 */
export class AnalyticsService {
  private readonly buffer: AnalyticsEvent[] = [];
  private queue: AnalyticsEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly endpoint: string | null,
    private readonly allowed: () => boolean,
  ) {}

  track(name: string, props: AnalyticsEvent['props'] = {}): void {
    const e = { name, at: Date.now(), props };
    this.buffer.push(e);
    if (this.buffer.length > 100) this.buffer.shift();
    if (!this.endpoint || !this.allowed()) return;
    this.queue.push(e);
    this.timer ??= setTimeout(() => this.flush(), 5000);
  }

  recent(): readonly AnalyticsEvent[] {
    return this.buffer;
  }

  flush(): void {
    this.timer = null;
    if (!this.endpoint || !this.queue.length || !this.allowed()) {
      this.queue = [];
      return;
    }
    const batch = this.queue;
    this.queue = [];
    try {
      const body = JSON.stringify({ events: batch });
      if (!navigator.sendBeacon?.(this.endpoint, body)) void fetch(this.endpoint, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => {});
    } catch {
      /* analytics must never break the game */
    }
  }
}
