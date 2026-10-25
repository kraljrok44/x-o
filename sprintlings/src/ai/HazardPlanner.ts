import { GameplayConfig, TICK_DT, laneToLateral } from '../config/GameplayConfig';
import { ABILITIES, AbilityTuning } from '../abilities/AbilityDefinition';
import { stepBody } from '../player/PlayerMovement';
import { makeBodyInput, type BodyInput, type MovementWorld } from '../physics/PhysicsWorld';
import { laneOfLateral, type Track } from '../game/Track';
import { copyBody, makeBody, type RaceEventType, type RacerBody, type SeekerEntity } from '../game/RaceState';
import type { RaceSimulation } from '../game/RaceManager';
import { approach } from '../shared/math';

/** One candidate course of action evaluated by a rollout. */
export interface Plan {
  /** Lane change relative to the current target lane (-2..2). */
  laneDelta: number;
  /** Tick (relative to plan start) to press jump, or -1 for no jump. */
  jumpTick: number;
  /** How many ticks jump is held once pressed. */
  hold: number;
}

export interface PlanScore {
  plan: Plan;
  score: number;
  incidents: number;
  fell: boolean;
}

const FULL_HOLD = 40;
const SHORT_HOLD = 6;
const JUMP_TICKS = [-1, 0, 3, 7, 12, 18, 26, 36, 48];
const SETTLE_TICKS = 50;

/** Side-effect-free MovementWorld used for look-ahead rollouts. */
class PredictionWorld implements MovementWorld {
  track!: Track;
  /** Tick being simulated. Time is derived from it exactly as the race does, so timed hazards match bit for bit. */
  tick = 0;
  private countdownTicks = 0;
  incidents = 0;
  fell = false;
  blocked = 0;
  private sim!: RaceSimulation;
  private racer = 0;
  private readonly seekers: { s: number; lateral: number; y: number; alive: boolean }[] = [];

  reset(sim: RaceSimulation, racer: number, incoming: readonly SeekerEntity[]): void {
    this.sim = sim;
    this.track = sim.track;
    this.racer = racer;
    this.tick = sim.tick;
    this.countdownTicks = sim.countdownTicks;
    this.incidents = 0;
    this.fell = false;
    this.blocked = 0;
    this.seekers.length = 0;
    for (const s of incoming) this.seekers.push({ s: s.s, lateral: s.lateral, y: s.y, alive: true });
  }

  get time(): number {
    return (this.tick - this.countdownTicks) / GameplayConfig.tickRate;
  }

  emit(type: RaceEventType): void {
    if (type === 'hit' || type === 'bonk') this.incidents++;
    else if (type === 'shieldBlock') this.blocked++;
    else if (type === 'fall') this.fell = true;
  }

  inSap(racer: number, s: number, lateral: number): boolean {
    return this.sim.inSap(racer, s, lateral);
  }

  touchSnare(racer: number, body: RacerBody): number {
    if (body.invuln > 0) return -1;
    const lane = laneOfLateral(body.lateral);
    for (const e of this.sim.entities) {
      if (e.kind !== 'snare' || !e.alive || e.owner === racer || e.lane !== lane) continue;
      if (Math.abs(e.s - body.s) > 0.45 + GameplayConfig.hitbox.halfDepth) continue;
      if (body.y > e.y + 0.7) continue;
      return 200000 + e.id;
    }
    return -1;
  }

  /** Advances predicted seekers aimed at this racer and reports a hit. */
  stepSeekers(body: RacerBody, dt: number, homing: number): boolean {
    const speed = ABILITIES.seeker.speed;
    const r = AbilityTuning.seeker.radius;
    const hb = GameplayConfig.hitbox;
    for (const s of this.seekers) {
      if (!s.alive) continue;
      s.lateral = approach(s.lateral, body.lateral, homing * dt);
      s.s += speed * dt;
      const g = this.track.groundAt(s.s, s.lateral);
      if (g !== null) s.y = g + AbilityTuning.seeker.height;
      if (s.s > body.s + 3) {
        s.alive = false;
        continue;
      }
      if (Math.abs(body.s - s.s) > hb.halfDepth + r) continue;
      if (Math.abs(body.lateral - s.lateral) > hb.halfWidth + r) continue;
      if (body.y > s.y + r || body.y + hb.height < s.y - r) continue;
      s.alive = false;
      if (body.shield > 0) {
        body.shield = 0;
        this.blocked++;
      } else return true;
    }
    return false;
  }
}

/**
 * Look-ahead planner: simulates a handful of candidate action sequences with
 * the real movement code and picks the one that makes the most progress
 * without incidents. Being exact rather than heuristic is what lets the same
 * planner double as the track passability validator.
 */
export class HazardPlanner {
  private readonly world = new PredictionWorld();
  private readonly scratch: RacerBody = makeBody(0, 0, 0);
  private readonly input: BodyInput = makeBodyInput();
  private readonly plans: Plan[] = [];
  private readonly results: PlanScore[] = [];
  private readonly glimmerSeen = new Set<number>();
  evaluations = 0;

  constructor() {
    for (const laneDelta of [0, -1, 1, -2, 2]) {
      for (const jumpTick of JUMP_TICKS) {
        this.plans.push({ laneDelta, jumpTick, hold: FULL_HOLD });
        if (jumpTick === 0 || jumpTick === 7) this.plans.push({ laneDelta, jumpTick, hold: SHORT_HOLD });
      }
    }
    for (let i = 0; i < this.plans.length; i++) this.results.push({ plan: this.plans[i], score: 0, incidents: 0, fell: false });
  }

  /**
   * Evaluates all plans for `racer` and returns them sorted best first.
   * `heldTicks` is how much longer the racer's current jump will be held.
   */
  plan(
    sim: RaceSimulation,
    racer: number,
    horizon: number,
    heldTicks: number,
    greed: number,
    incoming: readonly SeekerEntity[],
  ): PlanScore[] {
    const r = sim.racers[racer];
    const body = r.body;
    for (const res of this.results) {
      if (body.targetLane + res.plan.laneDelta < -1 || body.targetLane + res.plan.laneDelta > 1) {
        res.score = -Infinity;
        res.incidents = 99;
        res.fell = true;
        continue;
      }
      this.rollout(sim, racer, res, horizon, heldTicks, greed, incoming);
    }
    this.results.sort((a, b) => b.score - a.score);
    return this.results;
  }

  private rollout(
    sim: RaceSimulation,
    racer: number,
    res: PlanScore,
    horizon: number,
    heldTicks: number,
    greed: number,
    incoming: readonly SeekerEntity[],
  ): void {
    this.evaluations++;
    const r = sim.racers[racer];
    const p = res.plan;
    const b = copyBody(r.body, this.scratch);
    const w = this.world;
    w.reset(sim, racer, incoming);
    const startS = b.s;
    let glimmers = 0;
    let box = 0;
    this.glimmerSeen.clear();
    const dir = Math.sign(p.laneDelta);
    const presses = Math.abs(p.laneDelta);
    const homing = AbilityTuning.seeker.lateralHoming * r.mods.incomingSeekerHomingScale;
    let prevHeld = r.prevJumpHeld;
    let seekerHits = 0;
    let doomed = false;
    const total = horizon + SETTLE_TICKS;
    // After the plan's own decisions, a reflex jumps at gap edges so a plan
    // isn't judged doomed just because its horizon ends before a needed jump.
    const reflexFrom = p.jumpTick >= 0 ? p.jumpTick + p.hold : 20;
    let reflexUntil = -1;
    for (let k = 0; k < total; k++) {
      const inPlan = k < horizon;
      let held = k < heldTicks || k < reflexUntil;
      if (inPlan && p.jumpTick >= 0 && k >= p.jumpTick && k < p.jumpTick + p.hold) held = true;
      if (k >= reflexFrom && !held && b.grounded && b.phase === 'run' && sim.track.groundAt(b.s + 0.45, b.lateral) === null) {
        reflexUntil = k + FULL_HOLD;
        held = true;
      }
      if (!inPlan && b.grounded) break;
      const inp = this.input;
      inp.jumpPressed = held && !prevHeld;
      inp.jumpReleased = !held && prevHeld;
      inp.jumpHeld = held;
      inp.left = inPlan && dir < 0 && (k === 0 || (presses === 2 && k === 3));
      inp.right = inPlan && dir > 0 && (k === 0 || (presses === 2 && k === 3));
      prevHeld = held;
      stepBody(b, inp, r.mods, w, racer, TICK_DT);
      w.tick++;
      if (w.stepSeekers(b, TICK_DT, homing)) seekerHits++;
      if (w.fell || b.phase === 'fall') {
        doomed = true;
        break;
      }
      if (!b.grounded && b.y < sim.track.baseline(b.s) - 0.4 && sim.track.groundAt(b.s, b.lateral) === null) {
        doomed = true;
        break;
      }
      if (inPlan && greed > 0) {
        glimmers += this.countGlimmers(sim, racer, b);
        if (!r.item && box === 0 && this.touchesBox(sim, b, w.time)) box = 1;
      }
      if (b.s >= sim.track.length) break;
    }
    const incidents = w.incidents + seekerHits;
    res.incidents = incidents;
    res.fell = doomed;
    let score = b.s - startS;
    score -= incidents * 40;
    score -= w.blocked * 6;
    if (doomed) score -= 500;
    score -= Math.abs(p.laneDelta) * 0.35;
    if (p.jumpTick >= 0) score -= 0.15 + p.jumpTick * 0.002;
    score += greed * (glimmers * 0.6 + box * 3);
    // Mild preference for the centre lane: more escape options.
    if (b.targetLane === 0) score += 0.1;
    res.score = score;
  }

  private countGlimmers(sim: RaceSimulation, racer: number, b: RacerBody): number {
    const gl = sim.track.data.glimmers;
    const taken = sim.racers[racer].glimmerTaken;
    let n = 0;
    const rad = GameplayConfig.glimmer.pickupRadius;
    const order = sim.glimmerOrder;
    for (let k = sim.firstGlimmerOrderIndex(b.s - rad); k < order.length; k++) {
      const i = order[k];
      const g = gl[i];
      if (g.s > b.s + rad) break;
      if (taken[i]) continue;
      if (Math.abs(laneToLateral(g.lane) - b.lateral) > rad) continue;
      const gy = (sim.track.groundAtLane(g.s, g.lane) ?? 0) + g.lift;
      if (gy < b.y - 0.3 || gy > b.y + GameplayConfig.hitbox.height + 0.3) continue;
      if (this.glimmerSeen.has(i)) continue;
      this.glimmerSeen.add(i);
      n++;
    }
    return n;
  }

  private touchesBox(sim: RaceSimulation, b: RacerBody, t: number): boolean {
    const boxes = sim.track.data.itemBoxes;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (Math.abs(box.s - b.s) > 0.9 || sim.itemBoxReadyAt[i] > t) continue;
      if (Math.abs(laneToLateral(box.lane) - b.lateral) > 0.9) continue;
      return true;
    }
    return false;
  }
}

/** Cheap pre-check: is anything that needs a decision within `dist` ahead? */
export function needsPlanning(sim: RaceSimulation, racer: number, dist: number): boolean {
  const b = sim.racers[racer].body;
  const track = sim.track;
  const hz = track.data.hazards;
  const end = b.s + dist;
  for (let i = track.firstHazardIndex(b.s - 1); i < hz.length && hz[i].s - track.maxHazardReach <= end; i++) {
    const h = hz[i];
    if (h.kind === 'ice' || h.kind === 'boostPad') continue;
    const lo = h.kind === 'boulder' ? h.s - h.travel / 3 - 2 : h.s - ('halfDepth' in h ? h.halfDepth : 1);
    const hi = h.kind === 'boulder' ? h.s + h.travel + 2 : h.s + ('halfDepth' in h ? h.halfDepth : 1);
    if (hi >= b.s - 1 && lo <= end) return true;
  }
  for (let lane = -1; lane <= 1; lane++) {
    for (let s = b.s; s <= end; s += 1) {
      const g = track.groundAtLane(s, lane);
      if (g === null || g - track.baseline(s) > 0.1) return true;
    }
  }
  for (const e of sim.entities) {
    if (!e.alive) continue;
    if (e.kind === 'seeker' && e.target === racer) return true;
    if (e.kind === 'snare' && e.owner !== racer && e.s > b.s - 1 && e.s < end) return true;
    if (e.kind === 'sap' && e.owner !== racer && e.s1 > b.s - 1 && e.s0 < end) return true;
  }
  return false;
}
