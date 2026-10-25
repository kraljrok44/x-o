import * as THREE from 'three';
import { damp } from '../shared/math';
import type { CharacterRig } from './CharacterFactory';
import { COSMETIC_BY_ID } from '../shop/CosmeticCatalog';

export type AnimMode = 'idle' | 'run' | 'air' | 'stun' | 'fall' | 'respawn' | 'celebrate' | 'showcase';

export interface AnimInput {
  mode: AnimMode;
  speed: number;
  vy: number;
  latVel: number;
  /** Seconds the current mode has been active. */
  modeTime: number;
}

/**
 * Procedural animation for critter rigs: run cycle, jump stretch, landing
 * squash, stumble wobble, fall tumble and victory emotes. Short cycles keep
 * readability high at gameplay distance.
 */
export class PlayerAnimator {
  private cycle = 0;
  private squash = 0;
  private hitKick = 0;
  private blinkTimer = 2;
  private blink = 0;
  private emote = 'emote_wave';
  private lean = 0;
  private roll = 0;

  constructor(private readonly rig: CharacterRig) {}

  setEmote(id: string): void {
    this.emote = COSMETIC_BY_ID[id]?.model ?? id;
  }

  onLand(strength = 1): void {
    this.squash = Math.min(1, 0.6 * strength + 0.3);
  }

  onHit(): void {
    this.hitKick = 1;
  }

  update(dt: number, a: AnimInput, t: number): void {
    const r = this.rig;
    const runRate = Math.max(0.5, a.speed / 9);
    this.cycle += dt * 9.5 * runRate;
    this.squash = Math.max(0, this.squash - dt * 6);
    this.hitKick = Math.max(0, this.hitKick - dt * 3);

    // Reset pose each frame (cheap: a handful of nodes).
    r.body.rotation.set(0, 0, 0);
    r.body.position.set(0, 0, 0);
    r.torso.rotation.set(0, 0, 0);
    r.head.rotation.set(0, 0, 0);
    r.legL.rotation.set(0, 0, 0);
    r.legR.rotation.set(0, 0, 0);
    r.armL.rotation.set(0, 0, 0);
    r.armR.rotation.set(0, 0, 0);
    let sx = 1;
    let sy = 1;

    switch (a.mode) {
      case 'run': {
        const s = Math.sin(this.cycle);
        const c = Math.cos(this.cycle);
        r.legL.rotation.x = s * 0.95;
        r.legR.rotation.x = -s * 0.95;
        r.armL.rotation.x = -s * 0.8;
        r.armR.rotation.x = s * 0.8;
        r.body.position.y = Math.abs(c) * 0.07;
        r.torso.rotation.x = -0.18 * runRate;
        r.head.rotation.x = 0.12 * runRate + Math.sin(this.cycle * 2) * 0.04;
        for (const e of r.ears) e.rotation.x = 0.2 + Math.abs(c) * 0.25;
        if (r.tail) r.tail.rotation.y = s * 0.4;
        break;
      }
      case 'air': {
        const rising = a.vy > 0;
        r.legL.rotation.x = rising ? -0.9 : 0.5;
        r.legR.rotation.x = rising ? -0.6 : 0.7;
        r.armL.rotation.z = -1.1;
        r.armR.rotation.z = 1.1;
        r.armL.rotation.x = r.armR.rotation.x = -0.4;
        r.torso.rotation.x = rising ? -0.25 : 0.1;
        const stretch = Math.min(0.18, Math.abs(a.vy) * 0.015);
        sy = 1 + (rising ? stretch : stretch * 0.5);
        sx = 1 - stretch * 0.5;
        for (const e of r.ears) e.rotation.x = rising ? 0.6 : -0.3;
        break;
      }
      case 'stun': {
        const w = Math.sin(t * 22) * 0.25 * (0.4 + this.hitKick);
        r.body.rotation.z = w;
        r.torso.rotation.x = 0.35 * this.hitKick;
        r.head.rotation.y = Math.sin(t * 9) * 0.5;
        r.armL.rotation.z = -1.3;
        r.armR.rotation.z = 1.3;
        r.legL.rotation.x = Math.sin(t * 18) * 0.4;
        r.legR.rotation.x = -Math.sin(t * 18) * 0.4;
        break;
      }
      case 'fall': {
        r.body.rotation.x = a.modeTime * 7;
        r.armL.rotation.z = -2.4 + Math.sin(t * 20) * 0.4;
        r.armR.rotation.z = 2.4 - Math.sin(t * 20) * 0.4;
        r.legL.rotation.x = Math.sin(t * 25) * 0.8;
        r.legR.rotation.x = -Math.sin(t * 25) * 0.8;
        break;
      }
      case 'celebrate':
        this.applyEmote(a.modeTime, t);
        break;
      case 'respawn':
      case 'idle':
      case 'showcase': {
        const breathe = Math.sin(t * 2.2) * 0.02;
        sy = 1 + breathe;
        sx = 1 - breathe * 0.5;
        r.head.rotation.y = Math.sin(t * 0.7) * 0.25;
        r.head.rotation.z = Math.sin(t * 0.9) * 0.05;
        r.armL.rotation.z = -0.15 - Math.sin(t * 2.2) * 0.05;
        r.armR.rotation.z = 0.15 + Math.sin(t * 2.2) * 0.05;
        if (r.tail) r.tail.rotation.y = Math.sin(t * 1.6) * 0.4;
        for (const e of r.ears) e.rotation.x = Math.sin(t * 1.3 + e.id) * 0.12;
        break;
      }
    }

    // Lean into lane changes, and forward with speed.
    this.roll = damp(this.roll, -a.latVel * 0.035, 12, dt);
    this.lean = damp(this.lean, a.mode === 'run' ? -0.05 * runRate : 0, 8, dt);
    r.body.rotation.z += this.roll;
    r.body.rotation.x += this.lean;

    // Landing squash.
    if (this.squash > 0) {
      const k = Math.sin(this.squash * Math.PI) * 0.28;
      sy *= 1 - k;
      sx *= 1 + k * 0.6;
    }
    r.body.scale.set(sx, sy, sx);

    // Blink.
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blink = 0.12;
      this.blinkTimer = 2 + ((t * 1000) % 3);
    }
    if (this.blink > 0) this.blink -= dt;
    const eyeScale = this.blink > 0 ? 0.15 : 1;
    for (const e of r.eyeMeshes) e.scale.y = (e.userData.baseY ??= e.scale.y) * eyeScale;

    for (const x of r.extras) {
      if (x.userData.flame) x.scale.y = (x.userData.baseY ??= x.scale.y) * (1 + Math.sin(t * 28) * 0.3);
    }
  }

  private applyEmote(time: number, t: number, subtle = false): void {
    const r = this.rig;
    const k = subtle ? 0.5 : 1;
    switch (this.emote) {
      case 'emote_spin':
        r.body.rotation.y = time * 9 * k;
        r.armL.rotation.z = -1.4;
        r.armR.rotation.z = 1.4;
        break;
      case 'emote_cheer': {
        const hop = Math.abs(Math.sin(t * 7));
        r.body.position.y = hop * 0.3 * k;
        r.armL.rotation.z = -2.6;
        r.armR.rotation.z = 2.6;
        r.armL.rotation.x = r.armR.rotation.x = Math.sin(t * 14) * 0.3;
        break;
      }
      case 'emote_dance': {
        const beat = t * 6;
        r.body.position.x = Math.sin(beat) * 0.15 * k;
        r.body.position.y = Math.abs(Math.cos(beat)) * 0.15 * k;
        r.body.rotation.y = Math.sin(beat) * 0.4;
        r.legL.rotation.x = Math.max(0, Math.sin(beat)) * 0.8;
        r.legR.rotation.x = Math.max(0, -Math.sin(beat)) * 0.8;
        r.armL.rotation.z = -1 - Math.sin(beat) * 0.6;
        r.armR.rotation.z = 1 - Math.sin(beat) * 0.6;
        break;
      }
      case 'emote_backflip': {
        const p = (time % 1.6) / 1.6;
        if (p < 0.6) {
          const q = p / 0.6;
          r.body.position.y = Math.sin(q * Math.PI) * 0.9 * k;
          r.body.rotation.x = -q * Math.PI * 2;
        }
        r.armL.rotation.z = -1.2;
        r.armR.rotation.z = 1.2;
        break;
      }
      case 'emote_flex':
        r.armL.rotation.z = -1.5;
        r.armR.rotation.z = 1.5;
        r.armL.rotation.x = r.armR.rotation.x = -1.2 + Math.sin(t * 5) * 0.2;
        r.torso.rotation.y = Math.sin(t * 2.5) * 0.3;
        break;
      case 'emote_wave':
      default:
        r.armR.rotation.z = 2.5;
        r.armR.rotation.x = Math.sin(t * 10) * 0.45;
        r.head.rotation.z = Math.sin(t * 3) * 0.12;
        break;
    }
  }
}

/** Utility to tint a rig for invulnerability blinking. */
export function setRigVisible(root: THREE.Object3D, visible: boolean): void {
  root.visible = visible;
}
