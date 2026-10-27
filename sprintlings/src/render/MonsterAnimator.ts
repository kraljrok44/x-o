import { damp, Spring } from './draw';
import { neutralPose, type MonsterPose } from './CharacterRig';

export type EmoteStyle = 'wave' | 'spin' | 'cheer' | 'dance' | 'backflip' | 'flex';

/** Maps cosmetic emote ids (and recolours via `model`) to an animation. */
export function emoteStyle(emoteId: string | undefined): EmoteStyle {
  switch (emoteId) {
    case 'emote_spin':
      return 'spin';
    case 'emote_cheer':
      return 'cheer';
    case 'emote_dance':
    case 'emote_harvest':
      return 'dance';
    case 'emote_backflip':
      return 'backflip';
    case 'emote_flex':
      return 'flex';
    default:
      return 'wave';
  }
}

/** What the animator reads each frame (from the simulation or the menu). */
export interface AnimInput {
  mode: 'race' | 'idle' | 'emote';
  speed: number;
  vy: number;
  grounded: boolean;
  phase: 'grid' | 'run' | 'fall' | 'respawn' | 'finished';
  stun: number;
  boosting: boolean;
  blocked: boolean;
  /** Crouch, ready to go (last second of the countdown). */
  ready: boolean;
  /** Baseball slide under flying trouble. */
  sliding?: boolean;
  /** Scaling a wall. */
  climbing?: boolean;
}

const STRIDE = 1.3;
const TAU = Math.PI * 2;

/**
 * Turns gameplay state into a smooth, lively pose: a speed-synced run
 * cycle, squash and stretch on jumps and landings (springs, so they bounce),
 * jiggling appendages driven by acceleration, blinking, looking where it's
 * going, expressions and victory emotes. Purely visual.
 */
export class MonsterAnimator {
  readonly pose: MonsterPose = neutralPose();
  emote: EmoteStyle = 'wave';
  private runPhase = 0;
  private run = 0;
  private air = 0;
  private readonly squash = new Spring(1, 320, 15);
  private readonly lean = new Spring(0, 90, 14);
  private readonly wobA = new Spring(0, 110, 5);
  private readonly wobB = new Spring(0, 80, 4);
  private readonly look = new Spring(0, 60, 12);
  private blinkIn: number;
  private blinkT = -1;
  private prevVy = 0;
  private hurtT = 0;
  private happyT = 0;
  private landT = 1;
  private emoteT = 0;
  private idleLookT = 2;
  private idleLook = 0.5;
  private readonly rand: () => number;

  constructor(seed = 1) {
    let s = (seed * 2654435761) >>> 0 || 1;
    this.rand = () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return ((s >>> 0) % 10000) / 10000;
    };
    this.blinkIn = 1 + this.rand() * 3;
  }

  onJump(): void {
    this.squash.value = Math.max(this.squash.value, 1.16);
    this.squash.kick(2.5);
    this.wobA.kick(-6);
    this.wobB.kick(-5);
    this.happyT = 0.35;
  }

  onLand(impact: number): void {
    const k = Math.min(0.3, impact * 0.016);
    this.squash.value = Math.min(this.squash.value, 1 - k);
    this.squash.kick(-1.5);
    this.wobA.kick(5 + impact * 0.4);
    this.wobB.kick(4 + impact * 0.3);
    this.landT = 0;
  }

  onHit(): void {
    this.hurtT = 0.6;
    this.squash.value = 0.8;
    this.wobA.kick(9);
    this.wobB.kick(-8);
  }

  onHappy(): void {
    this.happyT = 1.2;
    this.wobA.kick(4);
  }

  startEmote(style: EmoteStyle): void {
    this.emote = style;
    this.emoteT = 0;
  }

  update(dt: number, time: number, s: AnimInput): MonsterPose {
    const p = this.pose;
    p.time = time;
    dt = Math.min(dt, 0.05);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.happyT = Math.max(0, this.happyT - dt);
    this.landT += dt;

    const racing = s.mode === 'race' && (s.phase === 'run' || s.phase === 'respawn');
    const airborne = racing && !s.grounded;
    const runTarget = racing && s.grounded ? Math.min(1, s.speed / 6) : 0;
    this.run += (runTarget - this.run) * damp(10, dt);
    this.air += ((airborne || s.phase === 'fall' ? 1 : 0) - this.air) * damp(16, dt);
    if (s.mode === 'race') this.runPhase = (this.runPhase + (Math.max(s.speed, 0.4) * dt * TAU) / STRIDE) % TAU;

    // --- legs and arms: run cycle blended with the air pose -------------------
    const ph = this.runPhase;
    const run = this.run;
    const stride = 0.2 * run;
    const lift = 0.17 * run;
    // Feet trace smooth ovals: lift eases in and out instead of snapping at contact.
    const footLift = (q: number) => {
      const c = Math.max(0, Math.cos(q));
      return c * c * (3 - 2 * c);
    };
    let nfx = Math.sin(ph) * stride;
    let nfy = footLift(ph) * lift;
    let ffx = Math.sin(ph + Math.PI) * stride;
    let ffy = footLift(ph + Math.PI) * lift;
    // Arms swing opposite to the legs, biased backward so they never cover the face.
    let armN = 0.1 - 0.15 * run + Math.sin(ph + Math.PI) * 0.75 * run;
    let armF = 0.1 - 0.15 * run + Math.sin(ph) * 0.75 * run;
    let bob = run * (0.025 * (1 - Math.cos(2 * ph)) - 0.02);
    let squashTarget = 1 + run * 0.035 * Math.cos(2 * ph);

    const a = this.air;
    if (a > 0.001) {
      const rising = s.vy > 1.5;
      const flail = s.vy < -6 ? Math.sin(time * 22) * 0.25 : 0;
      const tnfx = rising ? 0.12 : 0.15;
      const tnfy = rising ? 0.2 : 0.03;
      const tffx = rising ? -0.12 : -0.04;
      const tffy = rising ? 0.13 : 0.08;
      const tarmN = rising ? -2.3 : -1.5 + flail;
      const tarmF = rising ? -1.9 : -1.1 - flail;
      nfx += (tnfx - nfx) * a;
      nfy += (tnfy - nfy) * a;
      ffx += (tffx - ffx) * a;
      ffy += (tffy - ffy) * a;
      armN += (tarmN - armN) * a;
      armF += (tarmF - armF) * a;
      bob *= 1 - a;
      squashTarget += (1 + Math.max(-0.12, Math.min(0.16, s.vy * 0.018)) - squashTarget) * a;
    }

    // --- idle / ready / emotes ------------------------------------------------
    let rot = 0;
    let flip = 1;
    let spinFacing = -1;
    let hop = 0;
    let reach = 1 + a * 0.35;
    let leanTarget = run * 0.14 + (s.boosting ? 0.12 : 0) + (s.blocked ? 0.28 : 0) + (airborne ? (s.vy > 0 ? -0.04 : 0.08) : 0);
    if (!racing && s.mode !== 'emote') {
      // Idle: breathing and gentle arm sway.
      squashTarget = 1 + Math.sin(time * 2.4) * 0.025;
      armN = 0.12 + Math.sin(time * 1.7) * 0.08;
      armF = 0.05 + Math.sin(time * 1.7 + 1) * 0.06;
      nfx = 0.03;
      ffx = -0.04;
      nfy = ffy = 0;
      bob = 0;
      leanTarget = 0;
      if (s.ready) {
        leanTarget = 0.22;
        squashTarget = 0.92;
        armN = -0.9;
        armF = 0.4;
      }
    }
    if (s.mode === 'emote') {
      this.emoteT += dt;
      const e = this.emoteT;
      nfx = 0.04;
      ffx = -0.05;
      nfy = ffy = 0;
      bob = 0;
      squashTarget = 1 + Math.sin(time * 2.4) * 0.02;
      switch (this.emote) {
        case 'wave':
          reach = 2;
          armN = 2.75 + Math.sin(e * 11) * 0.35;
          armF = 0.3;
          leanTarget = Math.sin(e * 3) * 0.08;
          break;
        case 'spin': {
          // Turn all the way round: face -> right side -> back -> left side -> face.
          const cyc = e % 1.6;
          const yaw = cyc < 0.9 ? (cyc / 0.9) * TAU : 0;
          spinFacing = (1 + Math.cos(yaw)) / 2;
          flip = Math.sin(yaw) >= 0 ? 1 : -1;
          hop = cyc < 0.9 ? Math.sin((cyc / 0.9) * Math.PI) * 0.25 : 0;
          armN = 1.6;
          armF = 1.6;
          reach = 1.5;
          break;
        }
        case 'cheer': {
          const b = Math.abs(Math.sin(e * 5.5));
          hop = b * 0.35;
          squashTarget = 1 + (b < 0.15 ? -0.12 : 0.06);
          reach = 2;
          armN = 2.85 + Math.sin(e * 14) * 0.2;
          armF = 2.75 + Math.sin(e * 14 + 1) * 0.2;
          nfy = ffy = b * 0.05;
          break;
        }
        case 'dance': {
          const side = Math.sin(e * 7);
          hop = Math.abs(side) * 0.12;
          leanTarget = side * 0.18;
          reach = 1.6;
          armN = 1.5 + side * 1.2;
          armF = 1.5 - side * 1.2;
          nfx = 0.04 + Math.max(0, side) * 0.12;
          ffx = -0.05 + Math.min(0, side) * 0.12;
          nfy = Math.max(0, side) * 0.08;
          ffy = Math.max(0, -side) * 0.08;
          break;
        }
        case 'backflip': {
          const cyc = e % 1.8;
          if (cyc < 0.7) {
            const k = cyc / 0.7;
            hop = Math.sin(k * Math.PI) * 0.9;
            rot = -k * TAU;
            armN = armF = 2.6;
            reach = 1.5;
            nfy = ffy = 0.12;
          } else if (cyc < 0.85) squashTarget = 0.85;
          else {
            reach = 1.8;
            armN = 2.8;
            armF = 2.6;
          }
          break;
        }
        case 'flex': {
          const pump = Math.max(0, Math.sin(e * 6));
          reach = 1.7;
          armN = 2.3 + pump * 0.3;
          armF = 2.1 + pump * 0.3;
          squashTarget = 1 - pump * 0.06;
          leanTarget = -0.05;
          break;
        }
      }
    }

    // Stun: wobble on the spot.
    let dizzy = 0;
    if (racing && s.stun > 0) {
      dizzy = Math.min(1, s.stun * 3);
      rot = Math.sin(time * 18) * 0.12 * dizzy;
      leanTarget = -0.15;
      armN = -1.9 + Math.sin(time * 14) * 0.3;
      armF = -1.5 - Math.sin(time * 14) * 0.3;
    }
    if (racing && s.sliding) {
      // Feet first, leaning back, one hand trailing on the ground.
      rot = -0.85;
      hop = -0.26;
      bob = -0.05;
      nfx = 0.32;
      nfy = 0.02;
      ffx = 0.18;
      ffy = 0.0;
      armN = -1.2;
      armF = 2.2;
      leanTarget = -0.1;
      squashTarget = 0.9;
    }
    if (racing && s.climbing) {
      // Hand over hand up the wall, knees stepping.
      const c = time * 11;
      rot = 0;
      hop = 0;
      bob = Math.sin(c * 2) * 0.02;
      reach = 1.6;
      armN = 2.6 + Math.sin(c) * 0.45;
      armF = 2.6 - Math.sin(c) * 0.45;
      nfx = 0.14;
      ffx = 0.1;
      nfy = 0.12 + Math.max(0, Math.sin(c)) * 0.18;
      ffy = 0.12 + Math.max(0, -Math.sin(c)) * 0.18;
      leanTarget = -0.12;
      squashTarget = 1.04;
    }
    if (s.phase === 'fall') {
      armN = -2.8 + Math.sin(time * 25) * 0.3;
      armF = -2.6 - Math.sin(time * 25) * 0.3;
      rot = Math.sin(time * 9) * 0.2;
    }

    // --- springs ----------------------------------------------------------------
    p.squash = this.squash.update(squashTarget, dt);
    p.lean = this.lean.update(leanTarget, dt);
    const accel = (s.vy - this.prevVy) / Math.max(dt, 1e-3);
    this.prevVy = s.vy;
    this.wobA.kick(Math.max(-40, Math.min(40, -accel * 0.012)) * dt * 60 * 0.05 + run * Math.cos(2 * ph) * dt * 9);
    this.wobB.kick(Math.max(-40, Math.min(40, -accel * 0.01)) * dt * 60 * 0.05 + run * Math.sin(2 * ph) * dt * 7);
    p.wobbleA = Math.max(-1.2, Math.min(1.2, this.wobA.update(s.blocked ? 0.2 : 0, dt)));
    p.wobbleB = Math.max(-1.2, Math.min(1.2, this.wobB.update(0, dt)));

    p.footNear.x = nfx;
    p.footNear.y = nfy;
    p.footFar.x = ffx;
    p.footFar.y = ffy;
    p.armNear = armN;
    p.armFar = armF;
    p.armReach += (reach - p.armReach) * damp(12, dt);
    // Turn to the camera for emotes and the menu stage, run side-on otherwise.
    const faceTarget = s.mode === 'emote' || (s.mode === 'idle' && !s.ready) ? 1 : 0;
    if (spinFacing >= 0) p.facing = spinFacing;
    else p.facing += (faceTarget - p.facing) * damp(7, dt);
    p.bob = bob;
    p.rot = rot;
    p.flip = flip;
    p.hop = hop;
    p.dizzy = dizzy;

    // --- face ---------------------------------------------------------------------
    this.blinkIn -= dt;
    if (this.blinkIn <= 0 && this.blinkT < 0) {
      this.blinkT = 0;
      this.blinkIn = 1.6 + this.rand() * 3.4;
    }
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const k = this.blinkT / 0.14;
      p.blink = k < 0.5 ? k * 2 : Math.max(0, 2 - k * 2);
      if (k >= 1) {
        this.blinkT = -1;
        p.blink = 0;
      }
    }
    let lookX = 0.6;
    let lookY = Math.max(-0.8, Math.min(0.8, s.vy * 0.07));
    if (!racing) {
      this.idleLookT -= dt;
      if (this.idleLookT <= 0) {
        this.idleLookT = 1.5 + this.rand() * 2.5;
        this.idleLook = this.rand() < 0.5 ? 0 : this.rand() < 0.5 ? 0.7 : -0.4;
      }
      lookX = s.mode === 'emote' ? 0 : this.idleLook;
      lookY = 0;
    }
    p.lookX = this.look.update(lookX, dt);
    p.lookY = lookY;

    let eyes: MonsterPose['eyes'] = 'normal';
    let mouth: MonsterPose['mouth'] = 'smile';
    let blush = 0.25;
    if (s.mode === 'emote') {
      eyes = this.emoteT % 2.4 < 1.2 ? 'happy' : 'normal';
      mouth = 'happy';
      blush = 1;
    } else if (s.phase === 'fall') {
      eyes = 'wide';
      mouth = 'open';
    } else if (racing && s.stun > 0) {
      eyes = 'dizzy';
      mouth = 'ouch';
    } else if (this.hurtT > 0) {
      eyes = 'squint';
      mouth = 'ouch';
    } else if (airborne && s.vy < -9) {
      eyes = 'wide';
      mouth = 'o';
    } else if (s.boosting) {
      eyes = 'squint';
      mouth = 'grin';
      blush = 0.8;
    } else if (this.happyT > 0 || (airborne && s.vy > 0)) {
      mouth = 'happy';
      blush = 0.6;
    } else if (s.blocked) {
      eyes = 'squint';
      mouth = 'flat';
    } else if (s.ready) {
      eyes = 'squint';
      mouth = 'grin';
    }
    p.eyes = eyes;
    p.mouth = mouth;
    p.blush += (blush - p.blush) * damp(6, dt);
    return p;
  }
}
