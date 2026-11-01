import type { RaceSettlement } from '../economy/EconomyService';
import type { RaceSimulation } from '../game/RaceManager';
import type { TickInput } from '../game/RaceState';
import type { RaceTicket } from '../game/RaceVerifier';
import type { MatchmakingClient } from './MatchmakingClient';
import type { RoomInfo, ServerMessage } from './ServerMessages';
import { simHash } from './simHash';

export interface OnlineEnd {
  standings: { index: number; place: number; finishTime: number | null }[];
  settlement: RaceSettlement | null;
}

export class OnlineLink {
  readonly me: number;
  readonly delay: number;
  readonly ticket: RaceTicket;
  private readonly inputs = new Map<number, number[]>();
  private readonly hashes = new Map<number, number>();
  private latest = -1;
  private lastSentTick = -1;
  private lastBits = -1;
  started = false;
  desynced = false;
  end: OnlineEnd | null = null;
  onEnd: ((e: OnlineEnd) => void) | null = null;
  onDisconnect: (() => void) | null = null;

  constructor(
    private readonly client: MatchmakingClient,
    readonly room: RoomInfo,
  ) {
    this.me = room.yourIndex;
    this.delay = room.inputDelay;
    this.ticket = { raceId: room.roomId, trackId: room.trackId, seed: room.seed, mode: 'race', racers: room.racers, issuedAt: 0 };
    client.onMessage = (m) => this.handle(m);
    client.onClose = () => {
      if (!this.end) this.onDisconnect?.();
    };
  }

  private handle(m: ServerMessage): void {
    if (m.t === 'ticks') {
      m.inputs.forEach((bits, k) => this.inputs.set(m.from + k, bits));
      this.latest = Math.max(this.latest, m.from + m.inputs.length - 1);
      this.started = true;
    } else if (m.t === 'hash') this.hashes.set(m.tick, m.h);
    else if (m.t === 'end') {
      this.end = { standings: m.standings, settlement: m.settlement ?? null };
      this.onEnd?.(this.end);
    }
  }

  ready(): void {
    this.client.send({ t: 'ready' });
  }

  has(tick: number): boolean {
    return this.inputs.has(tick);
  }

  buffered(simTick: number): number {
    return this.latest - simTick + 1;
  }

  take(tick: number): TickInput[] {
    const bits = this.inputs.get(tick)!;
    this.inputs.delete(tick);
    return bits.map((b) => ({ jumpHeld: (b & 1) !== 0, down: (b & 2) !== 0, special: (b & 4) !== 0, use: (b & 8) !== 0 }));
  }

  sendInput(input: TickInput): void {
    const bits = (input.jumpHeld ? 1 : 0) | (input.down ? 2 : 0) | (input.special ? 4 : 0) | (input.use ? 8 : 0);
    if (bits === this.lastBits && (bits & 12) === 0) return;
    const tick = Math.max(this.latest + 1 + this.delay, this.lastSentTick + 1);
    this.lastSentTick = tick;
    this.lastBits = bits;
    this.client.send({ t: 'input', tick, bits });
  }

  check(sim: RaceSimulation): void {
    const h = this.hashes.get(sim.tick);
    if (h === undefined) return;
    this.hashes.delete(sim.tick);
    if (h !== simHash(sim) && !this.desynced) {
      this.desynced = true;
      console.warn('[online] race state drifted from the server at tick', sim.tick);
    }
  }

  close(): void {
    this.client.close();
  }
}
