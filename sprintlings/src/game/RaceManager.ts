import { GameplayConfig, TICK_DT, laneToLateral } from '../config/GameplayConfig';
import { Rng } from '../shared/Rng';
import { passiveModifiers } from '../player/CharacterAbilities';
import type { CharacterId } from '../player/CharacterDefinition';
import { stepBody } from '../player/PlayerMovement';
import { enterFinished, startRunning } from '../player/PlayerStateMachine';
import { collectItemBoxes, tryUseAbility } from '../abilities/AbilityController';
import { stepSeekers } from '../abilities/ProjectileSystem';
import type { AbilityId } from '../abilities/AbilityDefinition';
import { maskHasLane } from '../obstacles/ObstacleBase';
import type { MovementWorld, BodyInput } from '../physics/PhysicsWorld';
import { makeBodyInput } from '../physics/PhysicsWorld';
import { AIController } from '../ai/AIController';
import type { DifficultyId } from '../ai/DifficultyProfile';
import { laneOfLateral, type Track } from './Track';
import {
  NO_INPUT,
  emptyStats,
  makeBody,
  type Entity,
  type RaceEvent,
  type RaceEventType,
  type Racer,
  type RacerBody,
  type TickInput,
} from './RaceState';

export interface RacerSetup {
  id: string;
  name: string;
  characterId: CharacterId;
  isPlayer: boolean;
  cosmetics?: Record<string, string>;
  variantId?: string | null;
  /** Present for computer-controlled racers. */
  difficulty?: DifficultyId;
}

export interface RaceSetup {
  track: Track;
  seed: number;
  racers: RacerSetup[];
  /** Ends the race this many seconds after the first human finishes (default from config). */
  finishGrace?: number;
}

export type RacePhase = 'countdown' | 'racing' | 'done';

const START_SLOTS: { lane: number; back: number }[] = [
  { lane: 0, back: 0 },
  { lane: -1, back: 1.2 },
  { lane: 1, back: 1.2 },
  { lane: -1, back: 2.8 },
];

/**
 * Authoritative race simulation. Deterministic: given the same setup and the
 * same human input per tick it produces identical results, which is what the
 * server uses to verify submitted races (game/RaceReplay.ts).
 */
export class RaceSimulation implements MovementWorld {
  readonly track: Track;
  readonly setup: RaceSetup;
  readonly rng: Rng;
  readonly racers: Racer[];
  readonly entities: Entity[] = [];
  readonly itemBoxReadyAt: Float64Array;
  readonly countdownTicks = GameplayConfig.race.countdownSeconds * GameplayConfig.tickRate;
  readonly maxTicks: number;
  tick = 0;
  phase: RacePhase = 'countdown';
  nextEntityId = 1;
  /** Racer indices ordered by current race position. */
  readonly standings: number[];
  firstHumanFinishTime: number | null = null;

  /** Events produced by the last step(). Reused between steps. */
  readonly events: RaceEvent[] = [];
  private readonly eventPool: RaceEvent[] = [];
  private readonly ai: (AIController | null)[];
  private readonly bodyInputs: BodyInput[];
  private readonly countdownPresses: { early: boolean; lastTick: number }[];
  /** Glimmer indices sorted by s (glimmers are stored in construction order). */
  readonly glimmerOrder: number[];

  constructor(setup: RaceSetup) {
    this.setup = setup;
    this.track = setup.track;
    this.rng = new Rng(setup.seed);
    this.maxTicks = this.countdownTicks + GameplayConfig.race.maxDurationSeconds * GameplayConfig.tickRate;
    this.itemBoxReadyAt = new Float64Array(this.track.data.itemBoxes.length);
    this.racers = setup.racers.map((r, index) => {
      const slot = START_SLOTS[index % START_SLOTS.length];
      const s = -slot.back;
      const y = this.track.groundAtLane(s, slot.lane) ?? 0;
      const racer: Racer = {
        index,
        id: r.id,
        name: r.name,
        characterId: r.characterId,
        isPlayer: r.isPlayer,
        cosmetics: r.cosmetics ?? {},
        variantId: r.variantId ?? null,
        mods: passiveModifiers(r.characterId),
        body: makeBody(s, slot.lane, y),
        item: null,
        abilityCooldown: 0,
        finishTime: null,
        stats: emptyStats(),
        glimmerTaken: new Uint8Array(this.track.data.glimmers.length),
        prevJumpHeld: false,
        startBoostArmed: false,
      };
      racer.body.lateral = laneToLateral(slot.lane);
      return racer;
    });
    this.ai = setup.racers.map((r, i) => (r.difficulty ? new AIController(i, r.difficulty, this.setup.seed ^ (i * 7919)) : null));
    this.bodyInputs = setup.racers.map(() => makeBodyInput());
    this.countdownPresses = setup.racers.map(() => ({ early: false, lastTick: -1000 }));
    this.standings = setup.racers.map((_, i) => i);
    const gl = this.track.data.glimmers;
    this.glimmerOrder = gl.map((_, i) => i).sort((a, b) => gl[a].s - gl[b].s);
  }

  /** Race clock in seconds; negative during the countdown. */
  get time(): number {
    return (this.tick - this.countdownTicks) / GameplayConfig.tickRate;
  }

  isAI(index: number): boolean {
    return this.ai[index] !== null;
  }

  placeOf(index: number): number {
    return this.standings.indexOf(index);
  }

  // --- MovementWorld ----------------------------------------------------------

  emit(type: RaceEventType, racer: number, value: number, body: RacerBody): void {
    this.emitAt(type, racer, value, body.s, body.lateral, body.y);
  }

  emitAt(type: RaceEventType, racer: number, value: number, s: number, lateral: number, y: number): void {
    const e = this.eventPool.pop() ?? { type, racer, value, ability: null, s, lateral, y };
    e.type = type;
    e.racer = racer;
    e.value = value;
    e.ability = null;
    e.s = s;
    e.lateral = lateral;
    e.y = y;
    this.events.push(e);
    const r = this.racers[racer];
    if (!r) return;
    switch (type) {
      case 'jump':
        r.stats.jumps++;
        break;
      case 'hurdleCleared':
        r.stats.hurdlesCleared++;
        break;
      case 'hit':
      case 'bonk':
      case 'seekerHit':
        r.stats.hitsTaken++;
        break;
      case 'shieldBlock':
        r.stats.shieldBlocks++;
        break;
      case 'fall':
        r.stats.falls++;
        break;
      default:
        break;
    }
  }

  emitAbility(racer: number, ability: AbilityId): void {
    const b = this.racers[racer].body;
    this.emit('abilityUse', racer, 0, b);
    this.events[this.events.length - 1].ability = ability;
  }

  inSap(racer: number, s: number, lateral: number): boolean {
    const lane = laneOfLateral(lateral);
    for (const e of this.entities) {
      if (e.kind === 'sap' && e.alive && e.owner !== racer && s >= e.s0 && s <= e.s1 && maskHasLane(e.lanes, lane)) return true;
    }
    return false;
  }

  touchSnare(racer: number, body: RacerBody): number {
    if (body.invuln > 0) return -1;
    const lane = laneOfLateral(body.lateral);
    for (const e of this.entities) {
      if (e.kind !== 'snare' || !e.alive || e.owner === racer || e.lane !== lane) continue;
      if (Math.abs(e.s - body.s) > 0.45 + GameplayConfig.hitbox.halfDepth) continue;
      if (body.y > e.y + 0.7) continue;
      e.alive = false;
      return 200000 + e.id;
    }
    return -1;
  }

  // --- stepping ---------------------------------------------------------------

  /**
   * Advances the race by one tick. `inputs[i]` is used for human racers;
   * computer racers decide for themselves. Returns this tick's events.
   */
  step(inputs: readonly (TickInput | undefined)[]): RaceEvent[] {
    for (const e of this.events) this.eventPool.push(e);
    this.events.length = 0;
    if (this.phase === 'done') return this.events;

    if (this.phase === 'countdown') {
      this.stepCountdown(inputs);
      return this.events;
    }

    const dt = TICK_DT;
    for (const racer of this.racers) {
      const ai = this.ai[racer.index];
      const input = ai ? ai.decide(this) : inputs[racer.index] ?? NO_INPUT;
      const bi = this.bodyInputs[racer.index];
      bi.jumpPressed = input.jumpHeld && !racer.prevJumpHeld;
      bi.jumpReleased = !input.jumpHeld && racer.prevJumpHeld;
      bi.jumpHeld = input.jumpHeld;
      bi.left = input.left;
      bi.right = input.right;
      racer.prevJumpHeld = input.jumpHeld;
      if (racer.abilityCooldown > 0) racer.abilityCooldown = Math.max(0, racer.abilityCooldown - dt);

      stepBody(racer.body, bi, racer.mods, this, racer.index, dt);
      if (input.use) tryUseAbility(this, racer);
    }

    stepSeekers(this, dt);
    for (const e of this.entities) {
      if (e.kind === 'seeker' || !e.alive) continue;
      e.ttl -= dt;
      if (e.ttl <= 0) e.alive = false;
    }
    if (this.tick % 120 === 0) this.compactEntities();

    collectItemBoxes(this);
    this.collectGlimmers();
    this.checkFinishes();
    this.updateStandings();

    this.tick++;
    const allDone = this.racers.every((r) => r.finishTime !== null);
    const graceOver =
      this.firstHumanFinishTime !== null &&
      this.time - this.firstHumanFinishTime > (this.setup.finishGrace ?? GameplayConfig.race.finishGraceSeconds);
    if (allDone || graceOver || this.tick >= this.maxTicks) this.phase = 'done';
    return this.events;
  }

  private stepCountdown(inputs: readonly (TickInput | undefined)[]): void {
    const tps = GameplayConfig.tickRate;
    const window = GameplayConfig.movement.startBoostWindowTicks;
    if (this.tick % tps === 0) this.emitAt('countdown', -1, GameplayConfig.race.countdownSeconds - this.tick / tps, 0, 0, 0);
    for (const racer of this.racers) {
      const ai = this.ai[racer.index];
      const input = ai ? ai.decideCountdown(this) : inputs[racer.index] ?? NO_INPUT;
      const pressed = input.jumpHeld && !racer.prevJumpHeld;
      racer.prevJumpHeld = input.jumpHeld;
      if (!pressed) continue;
      const press = this.countdownPresses[racer.index];
      // Mashing jump during the last second is a false start: no boost.
      if (this.tick >= this.countdownTicks - tps && this.tick < this.countdownTicks - window) press.early = true;
      press.lastTick = this.tick;
    }
    this.tick++;
    if (this.tick === this.countdownTicks) {
      this.phase = 'racing';
      for (const racer of this.racers) {
        startRunning(racer.body);
        const press = this.countdownPresses[racer.index];
        racer.startBoostArmed = !press.early && press.lastTick >= this.countdownTicks - window;
        if (racer.startBoostArmed) {
          racer.body.padBoost = GameplayConfig.movement.startBoostDuration;
          racer.body.speed = GameplayConfig.movement.startBoostSpeed;
          this.emit('startBoost', racer.index, 0, racer.body);
        }
      }
      this.emitAt('go', -1, 0, 0, 0, 0);
    }
  }

  private collectGlimmers(): void {
    const gl = this.track.data.glimmers;
    const radius = GameplayConfig.glimmer.pickupRadius;
    for (const racer of this.racers) {
      const b = racer.body;
      if (b.phase !== 'run') continue;
      const idx = this.glimmerOrder;
      for (let k = this.firstGlimmerOrderIndex(b.s - radius - 0.5); k < idx.length; k++) {
        const i = idx[k];
        const g = gl[i];
        if (g.s > b.s + radius + 0.5) break;
        if (racer.glimmerTaken[i]) continue;
        if (Math.abs(g.s - b.s) > radius) continue;
        if (Math.abs(laneToLateral(g.lane) - b.lateral) > radius) continue;
        const gy = (this.track.groundAtLane(g.s, g.lane) ?? this.track.baseline(g.s)) + g.lift;
        if (gy < b.y - 0.3 || gy > b.y + GameplayConfig.hitbox.height + 0.3) continue;
        racer.glimmerTaken[i] = 1;
        racer.stats.glimmers++;
        this.emit('glimmer', racer.index, i, b);
      }
    }
  }

  /** Index of the first entry in glimmerOrder whose glimmer has s >= sMin. */
  firstGlimmerOrderIndex(sMin: number): number {
    const gl = this.track.data.glimmers;
    const idx = this.glimmerOrder;
    let lo = 0;
    let hi = idx.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (gl[idx[mid]].s < sMin) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private checkFinishes(): void {
    const len = this.track.length;
    for (const racer of this.racers) {
      const b = racer.body;
      if (racer.finishTime !== null || b.s < len) continue;
      if (b.phase !== 'run' && b.phase !== 'respawn') continue;
      const over = b.s - len;
      const t = this.time + TICK_DT - over / Math.max(b.speed, 0.1);
      racer.finishTime = Math.round(t * 1000) / 1000;
      enterFinished(b);
      if (!this.isAI(racer.index) && this.firstHumanFinishTime === null) this.firstHumanFinishTime = racer.finishTime;
      const place = this.racers.filter((r) => r.finishTime !== null).length;
      this.emit('finish', racer.index, place, b);
    }
  }

  private updateStandings(): void {
    const rs = this.racers;
    this.standings.sort((a, b) => {
      const fa = rs[a].finishTime;
      const fb = rs[b].finishTime;
      if (fa !== null && fb !== null) return fa - fb || a - b;
      if (fa !== null) return -1;
      if (fb !== null) return 1;
      return rs[b].body.s - rs[a].body.s || a - b;
    });
  }

  private compactEntities(): void {
    let w = 0;
    for (let r = 0; r < this.entities.length; r++) {
      if (this.entities[r].alive) this.entities[w++] = this.entities[r];
    }
    this.entities.length = w;
  }

  /** Runs the race to completion with no human input (tests, validation, fast-forward). */
  runToEnd(inputFor?: (sim: RaceSimulation, racer: number) => TickInput | undefined): void {
    const inputs: (TickInput | undefined)[] = new Array(this.racers.length);
    while (this.phase !== 'done') {
      if (inputFor) for (let i = 0; i < inputs.length; i++) inputs[i] = inputFor(this, i);
      this.step(inputs);
    }
  }
}
