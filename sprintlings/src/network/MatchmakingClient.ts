import type { ClientMessage, ServerMessage } from './ServerMessages';

/**
 * Client side of online matchmaking (experimental, not yet exposed in the
 * UI). Connects to /ws, authenticates with the account token, queues and
 * forwards per-tick input bits to the authoritative server room.
 */
export class MatchmakingClient {
  private ws: WebSocket | null = null;
  onMessage: ((m: ServerMessage) => void) | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = this.baseUrl.replace(/^http/, 'ws') + '/ws';
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => {
        this.send({ t: 'hello', token: this.token });
        resolve();
      };
      ws.onerror = () => reject(new Error('Could not connect to the race server.'));
      ws.onmessage = (e) => {
        try {
          this.onMessage?.(JSON.parse(String(e.data)) as ServerMessage);
        } catch {
          /* ignore malformed frames */
        }
      };
    });
  }

  send(m: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  queue(trackId?: string): void {
    this.send({ t: 'queue', trackId });
  }

  input(tick: number, bits: number): void {
    this.send({ t: 'input', tick, bits });
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}
