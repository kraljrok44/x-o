import { GameplayConfig, TICK_DT } from '../config/GameplayConfig';
import { ABILITIES, AbilityTuning } from '../abilities/AbilityDefinition';
import { stepBody } from '../player/PlayerMovement';
import { makeBodyInput, type BodyInput, type MovementWorld } from '../physics/PhysicsWorld';
import type { Track } from '../game/Track';
import { bodyHeight, copyBody, makeBody, type RaceEventType, type RacerBody, type SeekerEntity } from '../game/RaceState';
import type { RaceSimulation } from '../game/RaceManager';
import { approach } from '../shared/math';

/** One candidate course of action evaluated by a rollout. */
export interface Plan {
  /** Tick (relative to plan start) to press jump, or -1 for no jump. */
  jumpTick: number;
  /** How many ticks jump is held once pressed. */
  hold: number;
  /** Hold down from the start of the plan: drops through a platform, or slides on solid ground. */
  drop: boolean;
}

export interface PlanScore {
  plan: Plan;
  score: number;
  incidents: number;
  fell: boolean;
}

const FULL_HOLD = 40;
const MID_HOLD = 14;
const SHORT_HOLD = 6;
const JUMP_TICKS = [-1, 0, 3, 7, 12, 18, 26, 36, 48];
const SETTLE_TICKS = 50;
/** Ticks down is held for a drop (on a platform) or a slide (on solid ground). */
export const DROP_TICKS = 4;
export const SLIDE_TICKS = 30;

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
  private readonly seekers: { x: number; y: number; alive: boolean }[] = [];

  reset(sim: RaceSimulation, incoming: readonly SeekerEntity[]): void {
    this.sim = sim;
    this.track = sim.track;
    this.tick = sim.tick;
    this.countdownTicks = sim.countdownTicks;
    this.incidents = 0;
    this.fell = false;
    this.blocked = 0;
    this.seekers.length = 0;
    for (const s of incoming) this.seekers.push({ x: s.x, y: s.y, alive: true });
  }

  get time(): number {
    return (this.tick - this.countdownTicks) / GameplayConfig.tickRate;
  }

  emit(type: RaceEventType): void {
    if (type === 'hit' || type === 'bonk') this.incidents++;
    else if (type === 'shieldBlock') this.blocked++;
    else if (type === 'fall') this.fell = true;
  }

  inSap(racer: number, x: number, y: number): boolean {
    return this.sim.inSap(racer, x, y);
  }

  touchSnare(racer: number, body: RacerBody): number {
    if (body.invuln > 0) return -1;
    const tune = AbilityTuning.snare;
    for (const e of this.sim.entities) {
      if (e.kind !== 'snare' || !e.alive || this.sim.sameTeam(e.owner, racer)) continue;
      if (Math.abs(e.x - body.x) > tune.halfWidth + GameplayConfig.hitbox.halfWidth) continue;
      if (body.y > e.y + tune.height || body.y + GameplayConfig.hitbox.height < e.y) continue;
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
      s.y = approach(s.y, body.y + AbilityTuning.seeker.height, homing * dt);
      s.x += speed * dt;
      if (s.x > body.x + 3 || this.track.solidAt(s.x + r, s.y - 0.3)) {
        s.alive = false;
        continue;
      }
      if (Math.abs(body.x - s.x) > hb.halfWidth + r) continue;
      if (s.y < body.y - r || s.y > body.y + bodyHeight(body) + r) continue;
      s.alive = false;
      if (body.shield > 0) {
        body.shield = 0;
        this.blocked++;
      } else return true;
    }
    return false;
  }
}

/** True when the racer is airborne below the next solid ground and over a pit: it can no longer land. */
function isDoomed(track: Track, b: RacerBody): boolean {
  if (b.grounded || b.vy > 0) return false;
  if (!Number.isNaN(track.groundBelow(b.x, b.y + 0.02, -1, true))) return false;
  for (let x = b.x; x < b.x + 6; x += 0.5) {
    const top = track.solidTop(x);
    if (!Number.isNaN(top)) return b.y < top - 0.05;
  }
  return b.y < -1;
}

/**
 * Look-ahead planner: simulates a handful of candidate action sequences with
 * the real movement code and picks the one that makes the most progress
 * without incidents. Being exact rather than heuristic is what lets the same
 * planner double as the track passability validator.
 */
export class HazardPlanner {
  private readonly world = new PredictionWorld();
  private readonly scratch: RacerBody = makeBody(0, 0);
  private readonly input: BodyInput = makeBodyInput();
  private readonly plans: Plan[] = [];
  private readonly results: PlanScore[] = [];
  private readonly glimmerSeen = new Set<number>();
  evaluations = 0;
  /** How long the current batch of down-plans holds down. */
  downTicks = DROP_TICKS;

  constructor() {
    for (const drop of [false, true]) {
      for (const jumpTick of JUMP_TICKS) {
        if (drop && jumpTick >= 0 && jumpTick < 12) continue;
        this.plans.push({ jumpTick, hold: FULL_HOLD, drop });
        if (jumpTick < 0) continue;
        if (jumpTick <= 18) this.plans.push({ jumpTick, hold: SHORT_HOLD, drop });
        if (jumpTick <= 26) this.plans.push({ jumpTick, hold: MID_HOLD, drop });
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
    const body = sim.racers[racer].body;
    const onPlatform = body.pieceId >= 0 && sim.track.isOneWay(body.pieceId);
    this.downTicks = onPlatform ? DROP_TICKS : SLIDE_TICKS;
    for (const res of this.results) {
      if (res.plan.drop && !body.grounded) {
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
    const track = sim.track;
    const p = res.plan;
    const b = copyBody(r.body, this.scratch);
    const w = this.world;
    w.reset(sim, incoming);
    const startX = b.x;
    let glimmers = 0;
    let box = 0;
    this.glimmerSeen.clear();
    const homing = AbilityTuning.seeker.homing * r.mods.incomingSeekerHomingScale;
    let prevHeld = r.prevJumpHeld;
    let prevDown = r.prevDownHeld;
    let seekerHits = 0;
    let doomed = false;
    const total = horizon + SETTLE_TICKS;
    // After the plan's own decisions, a reflex jumps at gap edges and walls so
    // a plan isn't judged doomed just because its horizon ends before a
    // needed jump. Press/hold bookkeeping mirrors AIController exactly.
    // A plan without a jump gets no reflex inside its horizon, otherwise
    // "do nothing" would look as good as the jump the reflex makes for it.
    const reflexFrom = p.jumpTick >= 0 ? p.jumpTick + p.hold : horizon;
    const stepUp = GameplayConfig.jump.stepUp;
    let holdEnd = heldTicks;
    let pressedK = heldTicks > 0 ? -1 : -1000;
    let pressAt = p.jumpTick;
    let pressHold = p.hold;
    for (let k = 0; k < total; k++) {
      const inPlan = k < horizon;
      if (!inPlan && b.grounded) break;
      // Holding jump on the ground does nothing; the controller lets go on landing.
      if (b.grounded && k > pressedK + 1 && holdEnd > k) holdEnd = k;
      if (pressAt < k && k >= reflexFrom && holdEnd <= k && b.grounded && b.phase === 'run') {
        const ahead = track.groundBelow(b.x + 0.45, b.y + stepUp, b.dropTimer > 0 ? b.dropId : -1, true);
        if (Number.isNaN(ahead) || b.blocked) {
          pressAt = k;
          pressHold = FULL_HOLD;
        }
      }
      if (k === pressAt) {
        if (prevHeld) {
          // A press needs a released key first.
          pressAt = k + 1;
          holdEnd = k;
        } else {
          pressedK = k;
          holdEnd = k + pressHold;
        }
      }
      const held = k < holdEnd;
      const down = p.drop && k < this.downTicks;
      const inp = this.input;
      inp.jumpPressed = held && !prevHeld;
      inp.jumpReleased = !held && prevHeld;
      inp.jumpHeld = held;
      inp.downPressed = down && !prevDown;
      inp.downHeld = down;
      prevHeld = held;
      prevDown = down;
      stepBody(b, inp, r.mods, w, racer, TICK_DT);
      w.tick++;
      if (w.stepSeekers(b, TICK_DT, homing)) seekerHits++;
      if (w.fell || b.phase === 'fall' || isDoomed(track, b)) {
        doomed = true;
        break;
      }
      if (inPlan && greed > 0) {
        glimmers += this.countGlimmers(sim, racer, b);
        if (!r.item && box === 0 && this.touchesBox(sim, b, w.time)) box = 1;
      }
      if (b.x >= track.length) break;
    }
    const incidents = w.incidents + seekerHits;
    res.incidents = incidents;
    res.fell = doomed;
    let score = b.x - startX;
    score -= incidents * 40;
    score -= w.blocked * 6;
    if (doomed) score -= 500;
    if (p.drop) score -= 0.25;
    if (p.jumpTick >= 0) score -= 0.15 + p.jumpTick * 0.002;
    score += greed * (glimmers * 0.6 + box * 3);
    res.score = score;
  }

  private countGlimmers(sim: RaceSimulation, racer: number, b: RacerBody): number {
    const gl = sim.track.data.glimmers;
    const taken = sim.racers[racer].glimmerTaken;
    let n = 0;
    const rad = GameplayConfig.glimmer.pickupRadius;
    const order = sim.glimmerOrder;
    for (let k = sim.firstGlimmerOrderIndex(b.x - rad); k < order.length; k++) {
      const i = order[k];
      const g = gl[i];
      if (g.x > b.x + rad) break;
      if (taken[i] || this.glimmerSeen.has(i)) continue;
      if (g.y < b.y - 0.3 || g.y > b.y + GameplayConfig.hitbox.height + 0.3) continue;
      this.glimmerSeen.add(i);
      n++;
    }
    return n;
  }

  private touchesBox(sim: RaceSimulation, b: RacerBody, t: number): boolean {
    const boxes = sim.track.data.itemBoxes;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (Math.abs(box.x - b.x) > 0.9 || sim.itemBoxReadyAt[i] > t) continue;
      if (box.y < b.y - 0.4 || box.y > b.y + GameplayConfig.hitbox.height + 0.4) continue;
      return true;
    }
    return false;
  }
}

/** Cheap pre-check: is anything that needs a decision within `dist` ahead? */
export function needsPlanning(sim: RaceSimulation, racer: number, dist: number): boolean {
  const b = sim.racers[racer].body;
  const track = sim.track;
  if (b.pieceId >= 0 && track.isOneWay(b.pieceId)) return true;
  const end = b.x + dist;
  let found = false;
  track.forHazardsNear(b.x - 1, end, (h) => {
    if (h.kind !== 'boostPad') found = true;
  });
  if (found) return true;
  for (let x = b.x; x <= end; x += 1) {
    const g = track.solidTop(x);
    if (Number.isNaN(g) || Math.abs(g - b.y) > 0.3) return true;
    // A floating platform above: worth considering for the high route.
    if (track.groundBelow(x, b.y + 3, -1, true) !== g) return true;
  }
  for (const e of sim.entities) {
    if (!e.alive) continue;
    if (e.kind === 'seeker' && e.target === racer) return true;
    if (e.kind === 'snare' && !sim.sameTeam(e.owner, racer) && e.x > b.x - 1 && e.x < end) return true;
    if (e.kind === 'sap' && !sim.sameTeam(e.owner, racer) && e.x1 > b.x - 1 && e.x0 < end) return true;
  }
  return false;
}
