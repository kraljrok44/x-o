import { randomInt, randomUUID } from 'node:crypto';
import { RaceSimulation, type RacerSetup } from '../../src/game/RaceManager';
import { getTrack } from '../../src/game/TrackManager';
import { summarizeRace } from '../../src/game/RaceResults';
import type { TickInput } from '../../src/game/RaceState';
import { createTicket } from '../../src/game/RaceVerifier';
import { ABILITY_IDS } from '../../src/abilities/AbilityDefinition';
import { settleRace } from '../../src/economy/EconomyService';
import { PHASE_CODES, type RacerSnap, type ServerMessage } from '../../src/network/ServerMessages';
import type { AccountService } from '../economy/AccountService';
import { simHash } from '../../src/network/simHash';

export interface RoomPlayer {
  accountId: string;
  setup: RacerSetup;
  send(msg: ServerMessage): void;
  /** Input state applied at the current tick; presses latch until a tick consumes them. */
  input: TickInput;
  connected: boolean;
  /** Has loaded the course (or gave up waiting). */
  ready?: boolean;
  /** Inputs scheduled for future ticks (tick -> bits). */
  pending?: Map<number, number>;
}

/** Input delay in ticks: covers the round trip so inputs arrive before their tick. */
export const INPUT_DELAY = 6;
/** Longest wait for every client to finish loading before the race starts anyway. */
const READY_TIMEOUT_MS = 8000;
/** Ticks per input batch sent to clients, and how often a state hash goes out. */
const BATCH = 2;
const HASH_EVERY = 60;

/**
 * Authoritative online race (lockstep). Waits until every client has loaded
 * the course, then runs the deterministic simulation at 60 Hz, applying each
 * player's validated input at the tick it was scheduled for. The applied
 * inputs go out in small batches so every client steps the identical race;
 * a state hash every second lets clients detect drift. Rewards are settled
 * from the server's own result.
 */
export class RaceRoom {
  readonly id = `room_${randomUUID()}`;
  readonly sim: RaceSimulation;
  private timer: ReturnType<typeof setInterval> | null = null;
  private last = 0;
  private acc = 0;
  private ended = false;
  onEnd: (() => void) | null = null;

  constructor(
    readonly trackId: string,
    readonly players: RoomPlayer[],
    private readonly accounts: AccountService,
  ) {
    const seed = randomInt(1, 2 ** 31);
    // Bots fill the remaining slots; the ticket builder picks their lineup.
    const base = createTicket(this.id, trackId, 'race', players[0].setup, 'normal', 5, seed, Date.now());
    const racers: RacerSetup[] = players.map((p) => ({ ...p.setup, isPlayer: true, difficulty: undefined }));
    for (const bot of base.racers.slice(1)) if (racers.length < 4) racers.push(bot);
    this.sim = new RaceSimulation({ track: getTrack(trackId), seed, racers, finishGrace: 12 });
    for (const p of players) p.pending = new Map();
    players.forEach((p, i) => p.send({ t: 'match', room: { roomId: this.id, trackId, seed, racers, yourIndex: i, inputDelay: INPUT_DELAY } }));
  }

  private started = false;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;
  private batchFrom = 0;
  private batch: number[][] = [];

  /** Starts once every connected player is ready, or after a timeout. */
  start(): void {
    this.readyTimer = setTimeout(() => this.go(), READY_TIMEOUT_MS);
    this.checkReady();
  }

  markReady(index: number): void {
    const p = this.players[index];
    if (p) p.ready = true;
    this.checkReady();
  }

  private checkReady(): void {
    if (this.players.every((p) => p.ready || !p.connected)) this.go();
  }

  private go(): void {
    if (this.started || this.ended) return;
    this.started = true;
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.last = performance.now();
    this.timer = setInterval(() => this.pump(), 1000 / 60);
  }

  /** Schedules validated input bits for `tick` (late input lands on the next tick to run). */
  setInput(index: number, bits: number, tick = this.sim.tick): void {
    const p = this.players[index];
    if (!p || !Number.isInteger(bits) || bits < 0 || (bits & ~15) !== 0) return;
    if (!Number.isInteger(tick)) return;
    // Far-future input is clamped (at most 10 s ahead) so a client cannot queue up a whole race.
    const at = Math.max(this.sim.tick, Math.min(tick, this.sim.tick + 600));
    const prev = p.pending!.get(at);
    // Same tick twice: the newest held state wins, presses accumulate.
    p.pending!.set(at, prev === undefined ? bits : (bits & 3) | ((prev | bits) & 12));
  }

  /** Steps as many ticks as wall time allows (bounded). */
  pump(): void {
    const now = performance.now();
    this.acc += Math.min(250, now - this.last);
    this.last = now;
    let steps = 0;
    while (this.acc >= 1000 / 60 && steps < 8 && !this.ended) {
      this.acc -= 1000 / 60;
      steps++;
      this.tick();
    }
  }

  private tick(): void {
    const tick = this.sim.tick;
    const applied = this.sim.racers.map(() => 0);
    this.players.forEach((p, i) => {
      const bits = p.pending!.get(tick);
      if (bits !== undefined) {
        p.pending!.delete(tick);
        p.input.jumpHeld = (bits & 1) !== 0;
        p.input.down = (bits & 2) !== 0;
        p.input.special = (bits & 4) !== 0;
        p.input.use = (bits & 8) !== 0;
      }
      if (!p.connected) p.input.jumpHeld = p.input.down = false;
      applied[i] = (p.input.jumpHeld ? 1 : 0) | (p.input.down ? 2 : 0) | (p.input.special ? 4 : 0) | (p.input.use ? 8 : 0);
    });
    const inputs = this.players.map((p) => ({ ...p.input }));
    for (const p of this.players) p.input.use = p.input.special = false;
    this.sim.step(inputs);
    if (this.batch.length === 0) this.batchFrom = tick;
    this.batch.push(applied);
    if (this.batch.length >= BATCH || this.sim.phase === 'done') {
      this.broadcast({ t: 'ticks', from: this.batchFrom, inputs: this.batch });
      this.batch = [];
    }
    if (this.sim.tick % HASH_EVERY === 0) this.broadcast({ t: 'hash', tick: this.sim.tick, h: simHash(this.sim) });
    if (this.sim.tick % 6 === 0) this.broadcast({ t: 'snap', tick: this.sim.tick, racers: this.snapshot() });
    if (this.sim.phase === 'done') void this.end();
  }

  snapshot(): RacerSnap[] {
    return this.sim.racers.map((r) => [
      Math.round(r.body.x * 1000) / 1000,
      Math.round(r.body.y * 1000) / 1000,
      PHASE_CODES.indexOf(r.body.phase),
      r.body.stun > 0 ? 1 : 0,
      r.item ? ABILITY_IDS.indexOf(r.item) : -1,
      r.finishTime ?? -1,
    ]);
  }

  private broadcast(msg: ServerMessage): void {
    for (const p of this.players) if (p.connected) p.send(msg);
  }

  private async end(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    if (this.timer) clearInterval(this.timer);
    const summary = summarizeRace(this.sim);
    const standings = summary.racers.map((r) => ({ index: r.index, place: r.place, finishTime: r.finishTime }));
    await Promise.all(
      this.players.map(async (p, index) => {
        const me = summary.racers.find((r) => r.index === index)!;
        const ticket = { raceId: `${this.id}:${index}`, trackId: this.trackId, seed: this.sim.setup.seed, mode: 'race' as const, racers: this.sim.setup.racers, issuedAt: 0 };
        try {
          const { result } = await this.accounts.mutate(p.accountId, (prof, now) =>
            settleRace(prof, ticket, { raceId: ticket.raceId, trackId: this.trackId, mode: 'race', place: me.place, racerCount: summary.racers.length, finished: me.finishTime !== null, finishTime: me.finishTime, stats: me.stats }, now),
          );
          if (p.connected) p.send({ t: 'end', standings, coins: result.breakdown.coins, settlement: result });
        } catch {
          if (p.connected) p.send({ t: 'end', standings });
        }
      }),
    );
    this.onEnd?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.ended = true;
  }
}
