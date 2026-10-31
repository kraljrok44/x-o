import type { IncomingMessage, Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { visibleLoadout } from '../../src/economy/InventoryService';
import type { ClientMessage, ServerMessage } from '../../src/network/ServerMessages';
import { TRACK_IDS } from '../../src/game/TrackManager';
import { hashToken } from '../auth/AuthService';
import type { AccountService } from '../economy/AccountService';
import type { Repository } from '../persistence/Repository';
import { RaceRoom, type RoomPlayer } from './RaceRoom';
import { RateLimiter } from '../api/http';

interface Conn {
  ws: WebSocket;
  accountId: string | null;
  room: RaceRoom | null;
  index: number;
  player: RoomPlayer | null;
}

/**
 * Online matchmaking over WebSocket (/ws). Players queue; a room starts
 * when 4 players are waiting or after a short wait (bots fill the rest).
 */
export class MatchmakingService {
  private readonly wss: WebSocketServer;
  private queue: Conn[] = [];
  private queueTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly rooms = new Set<RaceRoom>();
  private readonly limiter = new RateLimiter(240, 1000);
  readonly waitMs: number;

  constructor(
    server: Server,
    private readonly repo: Repository,
    private readonly accounts: AccountService,
    opts: { waitMs?: number } = {},
  ) {
    this.waitMs = opts.waitMs ?? 6000;
    this.wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
    this.wss.on('connection', (ws, req) => this.onConnection(ws, req));
  }

  private send(c: Conn, msg: ServerMessage): void {
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(msg));
  }

  private onConnection(ws: WebSocket, req: IncomingMessage): void {
    const c: Conn = { ws, accountId: null, room: null, index: -1, player: null };
    const ip = req.socket.remoteAddress ?? '?';
    ws.on('message', async (data) => {
      if (!this.limiter.allow(`${ip}:${c.accountId}`)) return;
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(data)) as ClientMessage;
      } catch {
        return;
      }
      if (msg.t === 'hello') {
        const acc = typeof msg.token === 'string' ? await this.repo.accountByToken(hashToken(msg.token)) : null;
        if (!acc) return this.send(c, { t: 'error', message: 'unauthorized' });
        c.accountId = acc.id;
        this.send(c, { t: 'welcome', accountId: acc.id });
      } else if (!c.accountId) {
        this.send(c, { t: 'error', message: 'say hello first' });
      } else if (msg.t === 'queue') {
        if (c.room || this.queue.includes(c)) return;
        this.queue.push(c);
        this.pumpQueue();
      } else if (msg.t === 'leave') {
        this.queue = this.queue.filter((x) => x !== c);
      } else if (msg.t === 'input' && c.room) {
        c.room.setInput(c.index, msg.bits, msg.tick);
      } else if (msg.t === 'ready' && c.room) {
        c.room.markReady(c.index);
      }
    });
    ws.on('close', () => {
      this.queue = this.queue.filter((x) => x !== c);
      if (c.player) {
        // Disconnected racers keep running with no input; rewards are still settled.
        c.player.connected = false;
        c.player.input.jumpHeld = false;
        c.room?.markReady(c.index);
      }
    });
  }

  private pumpQueue(): void {
    for (const c of this.queue) this.send(c, { t: 'queued', players: this.queue.length, startsInMs: this.waitMs });
    if (this.queue.length >= 4) return void this.startRoom();
    this.queueTimer ??= setTimeout(() => this.startRoom(), this.waitMs);
  }

  private async startRoom(): Promise<void> {
    if (this.queueTimer) clearTimeout(this.queueTimer);
    this.queueTimer = null;
    const group = this.queue.splice(0, 4);
    if (!group.length) return;
    const players: RoomPlayer[] = [];
    for (const c of group) {
      const profile = await this.accounts.read(c.accountId!);
      const player: RoomPlayer = {
        accountId: c.accountId!,
        setup: { id: profile.id, name: profile.name, characterId: profile.loadout.characterId, isPlayer: true, cosmetics: visibleLoadout(profile), variantId: profile.loadout.variants[profile.loadout.characterId] ?? null },
        send: (m) => this.send(c, m),
        input: { jumpHeld: false, down: false, use: false },
        connected: c.ws.readyState === c.ws.OPEN,
      };
      players.push(player);
      c.player = player;
    }
    const room = new RaceRoom(TRACK_IDS[Math.floor(Math.random() * TRACK_IDS.length)], players, this.accounts);
    group.forEach((c, i) => {
      c.room = room;
      c.index = i;
    });
    this.rooms.add(room);
    room.onEnd = () => {
      this.rooms.delete(room);
      for (const c of group) {
        c.room = null;
        c.player = null;
      }
    };
    room.start();
    if (this.queue.length) this.pumpQueue();
  }

  close(): void {
    for (const r of this.rooms) r.stop();
    this.wss.close();
  }
}
