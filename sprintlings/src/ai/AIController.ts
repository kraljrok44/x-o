import { Rng } from '../shared/Rng';
import { GameplayConfig } from '../config/GameplayConfig';
import { findSeekerTarget, incomingSeekers } from '../abilities/ProjectileSystem';
import { laneOfLateral } from '../game/Track';
import type { RaceSimulation } from '../game/RaceManager';
import type { SeekerEntity, TickInput } from '../game/RaceState';
import { DIFFICULTIES, type DifficultyId, type DifficultyProfile } from './DifficultyProfile';
import { HazardPlanner, needsPlanning, type Plan } from './HazardPlanner';

const NOOP: Plan = { laneDelta: 0, jumpTick: -1, hold: 0 };

/**
 * Drives one computer racer. Produces the same TickInput a human would, so
 * bots obey exactly the same rules as players.
 */
export class AIController {
  readonly profile: DifficultyProfile;
  private readonly planner = new HazardPlanner();
  private readonly rng: Rng;
  private readonly out: TickInput = { jumpHeld: false, left: false, right: false, use: false };
  private readonly incoming: SeekerEntity[] = [];
  private plan: Plan = NOOP;
  private planStart = -1000;
  private jitter = 0;
  private holdUntil = -1;
  private mistakeUntil = -1;
  private lastIncidents = 0;
  private itemSince = -1;
  private countdownPressTick: number;

  constructor(
    private readonly index: number,
    difficulty: DifficultyId,
    seed: number,
  ) {
    this.profile = DIFFICULTIES[difficulty];
    this.rng = new Rng(seed);
    // Start-boost attempt: better bots hit the window more often.
    const hitChance = { rookie: 0.2, racer: 0.45, ace: 0.7, perfect: 1 }[difficulty];
    const cd = GameplayConfig.race.countdownSeconds * GameplayConfig.tickRate;
    this.countdownPressTick = this.rng.chance(hitChance) ? cd - this.rng.int(2, GameplayConfig.movement.startBoostWindowTicks - 1) : -1;
    // Stagger the first plan so bots don't all think on the same tick.
    this.planStart = cd - this.profile.replanInterval + 1 + ((index * 3) % this.profile.replanInterval);
  }

  decideCountdown(sim: RaceSimulation): TickInput {
    const o = this.out;
    o.left = o.right = o.use = false;
    o.jumpHeld = this.countdownPressTick >= 0 && sim.tick >= this.countdownPressTick && sim.tick < this.countdownPressTick + 4;
    return o;
  }

  decide(sim: RaceSimulation): TickInput {
    const o = this.out;
    o.left = o.right = o.use = false;
    const racer = sim.racers[this.index];
    const body = racer.body;
    const tick = sim.tick;
    if (body.phase !== 'run') {
      o.jumpHeld = false;
      this.holdUntil = -1;
      this.planStart = -1000;
      return o;
    }

    if (tick - this.planStart >= this.profile.replanInterval) this.replan(sim, tick);

    const k = tick - this.planStart;
    const p = this.plan;
    const dir = Math.sign(p.laneDelta);
    if (dir !== 0 && (k === 0 || (Math.abs(p.laneDelta) === 2 && k === 3))) {
      if (dir < 0) o.left = true;
      else o.right = true;
    }
    if (p.jumpTick >= 0 && k === Math.max(0, p.jumpTick + this.jitter)) {
      this.holdUntil = Math.max(this.holdUntil, tick + p.hold);
    }
    o.jumpHeld = tick < this.holdUntil;
    o.use = this.decideItem(sim);
    return o;
  }

  private replan(sim: RaceSimulation, tick: number): void {
    const racer = sim.racers[this.index];
    this.planStart = tick;
    this.jitter = this.profile.jumpJitter ? this.rng.int(-this.profile.jumpJitter, this.profile.jumpJitter) : 0;
    incomingSeekers(sim, this.index, this.incoming);
    const wantsPickups = this.profile.greed > 0 && this.pickupsAhead(sim, 10);
    if (!needsPlanning(sim, this.index, 13) && !wantsPickups) {
      this.plan = NOOP;
      this.lastIncidents = 0;
      return;
    }
    const heldTicks = Math.max(0, this.holdUntil - tick);
    const results = this.planner.plan(sim, this.index, this.profile.horizon, heldTicks, this.profile.greed, this.incoming);
    const best = results[0];
    const noop = results.find((r) => r.plan.laneDelta === 0 && r.plan.jumpTick < 0) ?? best;
    this.lastIncidents = best.incidents + (best.fell ? 1 : 0);

    const evasive = noop.incidents > 0 || noop.fell;
    if (evasive && tick > this.mistakeUntil && this.rng.chance(this.profile.mistakeChance)) {
      this.mistakeUntil = tick + this.profile.mistakeTicks;
    }
    if (tick < this.mistakeUntil && !racer.body.stun) {
      this.plan = NOOP;
      return;
    }
    this.plan = best.plan;
  }

  private pickupsAhead(sim: RaceSimulation, dist: number): boolean {
    const r = sim.racers[this.index];
    const b = r.body;
    if (!r.item) {
      const boxes = sim.track.data.itemBoxes;
      for (let i = 0; i < boxes.length; i++) {
        const d = boxes[i].s - b.s;
        if (d > 0 && d < dist && sim.itemBoxReadyAt[i] <= sim.time + d / 9) return true;
      }
    }
    const gl = sim.track.data.glimmers;
    const order = sim.glimmerOrder;
    for (let k = sim.firstGlimmerOrderIndex(b.s); k < order.length; k++) {
      const g = gl[order[k]];
      if (g.s > b.s + dist) break;
      if (!r.glimmerTaken[order[k]] && g.lane !== laneOfLateral(b.lateral)) return true;
      if (!r.glimmerTaken[order[k]] && g.lift > 1.2) return true;
    }
    return false;
  }

  private decideItem(sim: RaceSimulation): boolean {
    const racer = sim.racers[this.index];
    if (!racer.item || racer.abilityCooldown > 0) {
      if (!racer.item) this.itemSince = -1;
      return false;
    }
    if (this.itemSince < 0) this.itemSince = sim.time;
    const heldFor = sim.time - this.itemSince;
    if (heldFor < this.profile.itemDelay) return false;
    const b = racer.body;
    let use = false;
    switch (racer.item) {
      case 'dash':
        use = b.stun <= 0 && this.lastIncidents === 0 && !needsPlanning(sim, this.index, 15);
        break;
      case 'shield': {
        const threat = this.incoming.some((s) => s.s > b.s - 12);
        use = threat || this.lastIncidents > 0 || heldFor > 14;
        break;
      }
      case 'seeker': {
        const t = findSeekerTarget(sim, this.index);
        use = b.stun <= 0 && t >= 0 && sim.racers[t].body.s - b.s < 40;
        break;
      }
      case 'snare':
      case 'sap': {
        const lane = laneOfLateral(b.lateral);
        const behind = sim.racers.some((r) => {
          if (r.index === this.index || r.body.phase !== 'run') return false;
          const gap = b.s - r.body.s;
          return gap > 2.5 && gap < 13 && (racer.item === 'sap' || laneOfLateral(r.body.lateral) === lane);
        });
        use = behind || heldFor > 10;
        break;
      }
    }
    if (use) this.itemSince = -1;
    return use;
  }
}
