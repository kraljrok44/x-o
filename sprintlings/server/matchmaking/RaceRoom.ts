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

export interface RoomPlayer {
  accountId: string;
  setup: RacerSetup;
  send(msg: ServerMessage): void;
  /** Latest input state; presses latch until the next tick consumes them. */
  input: TickInput;
  connected: boolean;
}

/**
 * Authoritative online race. Runs the same deterministic simulation as the
 * client at 60 Hz, applies only validated input bits, broadcasts snapshots
 * at 20 Hz and settles rewards from its own result.
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
    players.forEach((p, i) => p.send({ t: 'match', room: { roomId: this.id, trackId, seed, racers, yourIndex: i } }));
  }

  start(): void {
    this.last = performance.now();
    this.timer = setInterval(() => this.pump(), 1000 / 60);
  }

  setInput(index: number, bits: number): void {
    const p = this.players[index];
    if (!p || !Number.isInteger(bits) || bits < 0 || bits > 15) return;
    p.input.jumpHeld = (bits & 1) !== 0;
    p.input.left ||= (bits & 2) !== 0;
    p.input.right ||= (bits & 4) !== 0;
    p.input.use ||= (bits & 8) !== 0;
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
    const inputs = this.players.map((p) => ({ ...p.input }));
    for (const p of this.players) p.input.left = p.input.right = p.input.use = false;
    const events = this.sim.step(inputs);
    if (events.length) {
      const list = events.map((e) => ({ type: e.type, racer: e.racer, value: e.value }));
      this.broadcast({ t: 'events', tick: this.sim.tick, events: list });
    }
    if (this.sim.tick % 3 === 0) this.broadcast({ t: 'snap', tick: this.sim.tick, racers: this.snapshot() });
    if (this.sim.phase === 'done') void this.end();
  }

  snapshot(): RacerSnap[] {
    return this.sim.racers.map((r) => [
      Math.round(r.body.s * 1000) / 1000,
      Math.round(r.body.lateral * 1000) / 1000,
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
          if (p.connected) p.send({ t: 'end', standings, coins: result.breakdown.coins });
        } catch {
          if (p.connected) p.send({ t: 'end', standings });
        }
      }),
    );
    this.onEnd?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.ended = true;
  }
}
