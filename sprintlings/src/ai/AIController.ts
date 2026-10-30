import { Rng } from '../shared/Rng';
import { GameplayConfig } from '../config/GameplayConfig';
import { findSeekerTarget, incomingSeekers, nearestRivalAhead } from '../abilities/ProjectileSystem';
import { AbilityTuning } from '../abilities/AbilityDefinition';
import { specialOf, specialReady } from '../abilities/SpecialAbility';
import type { RaceSimulation } from '../game/RaceManager';
import type { SeekerEntity, TickInput } from '../game/RaceState';
import { DIFFICULTIES, type DifficultyId, type DifficultyProfile } from './DifficultyProfile';
import { DROP_TICKS, HazardPlanner, needsPlanning, type Plan } from './HazardPlanner';

const NOOP: Plan = { jumpTick: -1, hold: 0, drop: false };

/**
 * Drives one computer racer. Produces the same TickInput a human would, so
 * bots obey exactly the same rules as players.
 */
export class AIController {
  readonly profile: DifficultyProfile;
  private readonly planner = new HazardPlanner();
  private readonly rng: Rng;
  private readonly out: TickInput = { jumpHeld: false, down: false, use: false, special: false };
  private readonly incoming: SeekerEntity[] = [];
  private plan: Plan = NOOP;
  private planStart = -1000;
  private jitter = 0;
  private holdUntil = -1;
  private pressAt = -1;
  private pressHold = 0;
  private pressTick = -1000;
  private blockedTicks = 0;
  private downTicks = DROP_TICKS;
  private mistakeUntil = -1;
  private lastIncidents = 0;
  private itemSince = -1;
  private specialSince = -1;
  private groundY = 0;
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
    o.down = o.use = false;
    o.jumpHeld = this.countdownPressTick >= 0 && sim.tick >= this.countdownPressTick && sim.tick < this.countdownPressTick + 4;
    return o;
  }

  decide(sim: RaceSimulation): TickInput {
    const o = this.out;
    o.down = o.use = o.special = false;
    const racer = sim.racers[this.index];
    const body = racer.body;
    const tick = sim.tick;
    if (body.phase !== 'run') {
      o.jumpHeld = false;
      this.holdUntil = -1;
      this.pressAt = -1;
      this.planStart = -1000;
      return o;
    }

    // Holding jump on the ground does nothing: let go once landed.
    if (body.grounded && tick > this.pressTick + 1 && this.holdUntil > tick) this.holdUntil = tick;
    if (tick - this.planStart >= this.profile.replanInterval) this.replan(sim, tick);

    const k = tick - this.planStart;
    const p = this.plan;
    o.down = p.drop && k < this.downTicks;
    if (p.jumpTick >= 0 && k === Math.max(0, p.jumpTick + this.jitter)) {
      this.pressAt = tick;
      this.pressHold = p.hold;
    }
    // Safety net: never stand pressed against a wall.
    if (body.blocked && body.grounded && this.pressAt < tick && tick >= this.holdUntil) {
      this.blockedTicks++;
      if (this.blockedTicks > 8) {
        this.pressAt = tick;
        this.pressHold = 40;
        this.blockedTicks = 0;
      }
    } else if (!body.blocked) this.blockedTicks = 0;
    if (this.pressAt === tick) {
      if (racer.prevJumpHeld) {
        // Let go for one tick so the press registers as a new edge.
        this.pressAt = tick + 1;
        this.holdUntil = tick;
      } else {
        this.pressTick = tick;
        this.holdUntil = tick + this.pressHold;
      }
    }
    o.jumpHeld = tick < this.holdUntil;
    o.use = this.decideItem(sim);
    o.special = !o.use && this.decideSpecial(sim);
    return o;
  }

  /** Animal specials, used with the same reaction delay as powerups. */
  private decideSpecial(sim: RaceSimulation): boolean {
    const racer = sim.racers[this.index];
    if (!specialReady(sim, racer)) {
      this.specialSince = -1;
      return false;
    }
    if (this.specialSince < 0) this.specialSince = sim.time;
    if (sim.time - this.specialSince < this.profile.itemDelay) return false;
    const b = racer.body;
    if (b.grounded) this.groundY = b.y;
    const rivals = sim.racers.filter((r) => !sim.sameTeam(r.index, this.index) && r.body.phase === 'run');
    let use = false;
    switch (specialOf(racer)) {
      case 'quickDash':
        use = this.lastIncidents === 0 && !needsPlanning(sim, this.index, 12);
        break;
      case 'stampede':
        use = !needsPlanning(sim, this.index, 10) && rivals.some((r) => r.body.x - b.x > 0.3 && r.body.x - b.x < 5 && Math.abs(r.body.y - b.y) < 1);
        break;
      case 'doubleHop': {
        // Save a fall: falling with no ground close below a little ahead.
        // Only when clearly dropping into a pit (well below take-off, nothing underneath).
        if (b.vy < -2 && b.y < this.groundY - 2) {
          const g0 = sim.track.groundBelow(b.x, b.y, -1, true);
          const g1 = sim.track.groundBelow(b.x + 1.5, b.y, -1, true);
          use = Number.isNaN(g0) && Number.isNaN(g1);
        }
        break;
      }
      case 'ironHide': {
        const storm = sim.entities.some((e) => e.alive && e.kind === 'thunder' && e.target === this.index);
        use = storm || this.incoming.some((s) => s.x > b.x - 10) || needsPlanning(sim, this.index, 4);
        break;
      }
      case 'pickpocket':
        use = true;
        break;
      case 'howl':
        use = rivals.some((r) => Math.hypot(r.body.x - b.x, r.body.y - b.y) < 8);
        break;
    }
    if (use) this.specialSince = -1;
    return use;
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
    this.downTicks = this.planner.downTicks;
    const best = results[0];
    const noop = results.find((r) => !r.plan.drop && r.plan.jumpTick < 0) ?? best;
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
        const d = boxes[i].x - b.x;
        if (d > 0 && d < dist && sim.itemBoxReadyAt[i] <= sim.time + d / 9) return true;
      }
    }
    const gl = sim.track.data.glimmers;
    const order = sim.glimmerOrder;
    for (let k = sim.firstGlimmerOrderIndex(b.x); k < order.length; k++) {
      const g = gl[order[k]];
      if (g.x > b.x + dist) break;
      if (!r.glimmerTaken[order[k]] && g.y > b.y + 1.2) return true;
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
        const storm = sim.entities.some((e) => e.alive && e.kind === 'thunder' && e.target === this.index);
        const threat = storm || this.incoming.some((s) => s.x > b.x - 12);
        use = threat || this.lastIncidents > 0 || heldFor > 14;
        break;
      }
      case 'seeker': {
        const t = findSeekerTarget(sim, this.index);
        use = b.stun <= 0 && t >= 0 && sim.racers[t].body.x - b.x < 40;
        break;
      }
      case 'lasso': {
        // Rope a rival ahead, or lay a trap for one close behind.
        const behind = sim.racers.some((r) => !sim.sameTeam(r.index, this.index) && r.body.phase === 'run' && b.x - r.body.x > 2.5 && b.x - r.body.x < 14 && Math.abs(r.body.y - b.y) < 1);
        use = b.stun <= 0 && (nearestRivalAhead(sim, this.index, AbilityTuning.lasso.range) >= 0 || behind || heldFor > 6);
        break;
      }
      case 'thunder': {
        const leader = sim.standings.find((i) => sim.racers[i].body.phase !== 'finished');
        use = leader !== undefined && !sim.sameTeam(leader, this.index);
        break;
      }
      case 'bomb': {
        // Lob it at a rival a few units ahead on the same level.
        use =
          b.stun <= 0 &&
          (sim.racers.some((r) => !sim.sameTeam(r.index, this.index) && r.body.phase === 'run' && r.body.x - b.x > 1.5 && r.body.x - b.x < 7 && Math.abs(r.body.y - b.y) < 1.5) ||
            heldFor > 12);
        break;
      }
      case 'snare':
      case 'sap': {
        const behind = sim.racers.some((r) => {
          if (sim.sameTeam(r.index, this.index) || r.body.phase !== 'run') return false;
          const gap = b.x - r.body.x;
          // Only worth it when the chaser runs on the same level as us.
          return gap > 2.5 && gap < 13 && Math.abs(r.body.y - b.y) < 1;
        });
        use = behind || heldFor > 10;
        break;
      }
    }
    if (use) this.itemSince = -1;
    return use;
  }
}
