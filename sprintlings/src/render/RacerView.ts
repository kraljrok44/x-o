import * as THREE from 'three';
import type { Racer, RacerBody } from '../game/RaceState';
import { ABILITIES } from '../abilities/AbilityDefinition';
import { createCharacter, paletteFor, type CharacterRig } from './CharacterFactory';
import { animateCosmetics, applyCosmetics } from './CosmeticFactory';
import { PlayerAnimator, type AnimMode } from './PlayerAnimation';
import { flat, glowTexture, toon } from './Materials';
import type { TrackPath } from './TrackPath';

const tmp = new THREE.Vector3();

/** Interpolated snapshot of a body used for rendering between sim ticks. */
export interface BodySnapshot {
  s: number;
  lateral: number;
  y: number;
}

/**
 * Visual representation of one racer: rigged model, cosmetics, shield
 * bubble, stun stars, held-item badge and name tag.
 */
export class RacerView {
  readonly root = new THREE.Group();
  readonly rig: CharacterRig;
  readonly animator: PlayerAnimator;
  private readonly cosmeticParts: THREE.Object3D[];
  private readonly shield: THREE.Mesh;
  private readonly stars: THREE.Group;
  private readonly badge: THREE.Sprite;
  private readonly badgeTextures = new Map<string, THREE.Texture>();
  private readonly blob: THREE.Mesh;
  private readonly dashGlow: THREE.Sprite;
  private mode: AnimMode = 'idle';
  private modeTime = 0;
  private wasGrounded = true;
  readonly prev: BodySnapshot = { s: 0, lateral: 0, y: 0 };
  readonly curr: BodySnapshot = { s: 0, lateral: 0, y: 0 };
  /** Visual-only sideways nudge to avoid overlapping models. */
  nudge = 0;
  readonly worldPos = new THREE.Vector3();

  constructor(
    readonly racer: Racer,
    readonly isLocal: boolean,
    quality: 'low' | 'medium' | 'high',
  ) {
    this.rig = createCharacter(racer.characterId, paletteFor(racer.characterId, racer.variantId), quality !== 'low' || isLocal);
    this.root.add(this.rig.root);
    this.cosmeticParts = applyCosmetics(this.rig, racer.cosmetics, quality !== 'low');
    this.animator = new PlayerAnimator(this.rig);
    if (racer.cosmetics.emote) this.animator.setEmote(racer.cosmetics.emote);

    const shieldMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, color: { value: new THREE.Color(ABILITIES.shield.color) } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float time; uniform vec3 color; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main() {
          float f = pow(1.0 - abs(dot(vN, vV)), 2.2);
          vec3 iri = 0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + vP.y * 4.0 + time * 2.0);
          gl_FragColor = vec4(mix(color, iri, 0.45) * (0.25 + f * 1.4), 0.2 + f * 0.8);
        }`,
    });
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(0.95, 24, 16), shieldMat);
    this.shield.position.y = 0.7;
    this.shield.visible = false;
    this.root.add(this.shield);

    this.stars = new THREE.Group();
    const starMat = toon('#ffe066', { emissive: '#ffcc33', emissiveIntensity: 0.8 });
    for (let i = 0; i < 3; i++) {
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), starMat);
      const a = (i / 3) * Math.PI * 2;
      star.position.set(Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35);
      this.stars.add(star);
    }
    this.stars.position.y = 1.45;
    this.stars.visible = false;
    this.root.add(this.stars);

    this.badge = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    this.badge.scale.setScalar(0.55);
    this.badge.position.y = 1.9;
    this.badge.visible = false;
    if (!isLocal) this.root.add(this.badge);

    this.blob = new THREE.Mesh(new THREE.CircleGeometry(0.45, 16), flat('#000000', 0.28));
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.renderOrder = 1;

    this.dashGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(ABILITIES.dash.color), transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.dashGlow.scale.set(1.6, 1.6, 1);
    this.dashGlow.position.set(0, 0.6, 0.3);
    this.root.add(this.dashGlow);
  }

  /** Blob shadow lives in world space so it can sit on the ground under jumps. */
  get shadow(): THREE.Mesh {
    return this.blob;
  }

  snapshot(body: RacerBody): void {
    this.prev.s = this.curr.s;
    this.prev.lateral = this.curr.lateral;
    this.prev.y = this.curr.y;
    this.curr.s = body.s;
    this.curr.lateral = body.lateral;
    this.curr.y = body.y;
  }

  resetSnapshot(body: RacerBody): void {
    this.prev.s = this.curr.s = body.s;
    this.prev.lateral = this.curr.lateral = body.lateral;
    this.prev.y = this.curr.y = body.y;
  }

  interpolatedS(alpha: number): number {
    return this.prev.s + (this.curr.s - this.prev.s) * alpha;
  }

  update(dt: number, t: number, alpha: number, path: TrackPath, groundY: number | null): void {
    const b = this.racer.body;
    // Teleports (respawn, wall push-back) are not interpolated.
    const jump = Math.abs(this.curr.s - this.prev.s) > 2;
    const a = jump ? 1 : alpha;
    const s = this.prev.s + (this.curr.s - this.prev.s) * a;
    const lat = this.prev.lateral + (this.curr.lateral - this.prev.lateral) * a + this.nudge;
    const y = this.prev.y + (this.curr.y - this.prev.y) * a;
    path.toWorld(s, lat, y, this.worldPos);
    this.root.position.copy(this.worldPos);
    this.root.rotation.y = path.yaw(s);

    // Animation mode from physical state.
    let mode: AnimMode;
    if (b.phase === 'finished') mode = 'celebrate';
    else if (b.phase === 'fall') mode = 'fall';
    else if (b.phase === 'respawn') mode = 'respawn';
    else if (b.phase === 'grid') mode = 'idle';
    else if (b.stun > 0) mode = 'stun';
    else if (!b.grounded) mode = 'air';
    else mode = 'run';
    if (mode !== this.mode) {
      this.mode = mode;
      this.modeTime = 0;
    } else this.modeTime += dt;
    if (b.grounded && !this.wasGrounded && b.phase === 'run') this.animator.onLand(Math.min(1.5, 0.6 + Math.abs(b.vy) * 0.1));
    this.wasGrounded = b.grounded;
    this.animator.update(dt, { mode, speed: b.speed, vy: b.vy, latVel: b.latVel, modeTime: this.modeTime }, t);
    animateCosmetics(this.cosmeticParts, t, b.speed);

    // Invulnerability blink.
    this.rig.root.visible = !(b.invuln > 0 && Math.floor(t * 14) % 2 === 0) && b.phase !== 'respawn';
    if (b.phase === 'respawn') this.rig.root.visible = Math.floor(t * 10) % 2 === 0;

    this.shield.visible = b.shield > 0;
    if (this.shield.visible) {
      (this.shield.material as THREE.ShaderMaterial).uniforms.time.value = t;
      const pulse = b.shield < 1 ? 0.92 + Math.sin(t * 20) * 0.08 : 1;
      this.shield.scale.setScalar(pulse);
    }
    this.stars.visible = b.stun > 0;
    if (this.stars.visible) this.stars.rotation.y = t * 8;

    const dm = this.dashGlow.material as THREE.SpriteMaterial;
    dm.opacity = b.dash > 0 || b.padBoost > 0 ? 0.55 + Math.sin(t * 30) * 0.15 : 0;

    if (!this.isLocal) {
      const item = this.racer.item;
      this.badge.visible = !!item && b.phase !== 'finished';
      if (item) {
        const sm = this.badge.material as THREE.SpriteMaterial;
        sm.map = this.badgeTexture(item);
        sm.needsUpdate = true;
      }
    }

    // Blob shadow on the ground beneath.
    if (groundY !== null) {
      path.toWorld(s, lat, groundY + 0.03, tmp);
      this.blob.position.copy(tmp);
      this.blob.rotation.z = 0;
      const h = Math.max(0, y - groundY);
      this.blob.scale.setScalar(Math.max(0.3, 1 - h * 0.18));
      this.blob.visible = b.phase !== 'fall';
    } else this.blob.visible = false;
  }

  private badgeTexture(item: string): THREE.Texture {
    let t = this.badgeTextures.get(item);
    if (t) return t;
    const def = ABILITIES[item as keyof typeof ABILITIES];
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(27,21,48,0.85)';
    g.beginPath();
    g.arc(32, 32, 30, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = def.color;
    g.lineWidth = 5;
    g.stroke();
    g.fillStyle = def.color;
    g.font = 'bold 34px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(def.icon, 32, 34);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    this.badgeTextures.set(item, t);
    return t;
  }

  dispose(): void {
    for (const t of this.badgeTextures.values()) t.dispose();
  }
}
