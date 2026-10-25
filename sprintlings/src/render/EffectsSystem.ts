import * as THREE from 'three';
import { ABILITIES } from '../abilities/AbilityDefinition';
import { laneToLateral } from '../config/GameplayConfig';
import type { RaceSimulation } from '../game/RaceManager';
import type { RaceEvent } from '../game/RaceState';
import { COSMETIC_BY_ID } from '../shop/CosmeticCatalog';
import type { BiomeTheme } from './BiomeTheme';
import { flat, toon } from './Materials';
import { ParticleSystem } from './ParticleSystem';
import type { RacerView } from './RacerView';
import type { TrackPath } from './TrackPath';
import type { DebrisPhysics } from './DebrisPhysics';

const tmp = new THREE.Vector3();
const rainbow = new THREE.Color();

/**
 * Event-driven visual feedback: dust, sparks, item bursts, confetti,
 * cosmetic trails and the views of seekers / snares / sap puddles.
 */
export class EffectsSystem {
  readonly group = new THREE.Group();
  readonly glow: ParticleSystem;
  readonly soft: ParticleSystem;
  private readonly confetti: THREE.InstancedMesh;
  private readonly confettiState: { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; w: THREE.Vector3; life: number }[] = [];
  private readonly seekerViews = new Map<number, THREE.Object3D>();
  private readonly snareViews = new Map<number, THREE.Object3D>();
  private readonly sapViews = new Map<number, THREE.Object3D>();
  private readonly dummy = new THREE.Object3D();
  private trailTimer = 0;
  shake = 0;

  constructor(
    private readonly path: TrackPath,
    private readonly sim: RaceSimulation,
    private readonly theme: BiomeTheme,
    quality: 'low' | 'medium' | 'high',
    private readonly debris: DebrisPhysics | null,
  ) {
    const cap = quality === 'low' ? 300 : quality === 'medium' ? 700 : 1200;
    this.glow = new ParticleSystem(cap, true);
    this.soft = new ParticleSystem(Math.floor(cap * 0.6), false);
    this.group.add(this.glow.points, this.soft.points);
    const n = quality === 'low' ? 60 : 160;
    this.confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12, 0.2), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), n);
    const palette = ['#ff5a7a', '#ffd23a', '#4cc9ff', '#7ee26b', '#b48cff', '#ffffff'];
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      this.confetti.setColorAt(i, c.set(palette[i % palette.length]));
      this.confettiState.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), life: 0 });
    }
    this.confetti.frustumCulled = false;
    this.group.add(this.confetti);
  }

  setViewportHeight(px: number): void {
    this.glow.setPixelScale(px);
    this.soft.setPixelScale(px);
  }

  private at(s: number, lateral: number, y: number): THREE.Vector3 {
    return this.path.toWorld(s, lateral, y, tmp);
  }

  handle(e: RaceEvent, views: RacerView[], localIndex: number): void {
    const p = this.at(e.s, e.lateral, e.y);
    const isLocal = e.racer === localIndex;
    switch (e.type) {
      case 'jump':
        this.soft.burst(p.x, p.y + 0.05, p.z, 6, 2.5, '#ffffff', 0.5, 0.35, 2, 0.1);
        break;
      case 'land':
        this.soft.burst(p.x, p.y + 0.05, p.z, 10, 3.2, this.theme.groundTop, 0.6, 0.4, 3, 0.15);
        break;
      case 'hit':
      case 'bonk':
        this.glow.burst(p.x, p.y + 0.8, p.z, 14, 6, '#ffe066', 0.45, 0.45, 6);
        if (isLocal) this.shake = Math.max(this.shake, e.type === 'bonk' ? 0.5 : 0.35);
        views[e.racer]?.animator.onHit();
        if (this.debris && isLocal) this.debris.spawn(p.clone().setY(p.y + 0.5), p.y, [this.theme.hazard.primary, this.theme.groundSide], 4, 3.5);
        break;
      case 'seekerHit':
        this.glow.burst(p.x, p.y + 0.6, p.z, 26, 8, ABILITIES.seeker.color, 0.6, 0.55, 4);
        if (isLocal) this.shake = Math.max(this.shake, 0.6);
        views[e.racer]?.animator.onHit();
        break;
      case 'shieldBlock':
        this.glow.burst(p.x, p.y + 0.7, p.z, 22, 6, ABILITIES.shield.color, 0.6, 0.5, 0);
        break;
      case 'fall':
        this.soft.burst(p.x, p.y, p.z, 8, 2, '#ffffff', 0.7, 0.6, -1, 0.5);
        break;
      case 'respawn':
        this.glow.burst(p.x, p.y + 0.6, p.z, 24, 4, '#ffffff', 0.5, 0.6, -2, 0.8);
        break;
      case 'itemPickup': {
        const box = this.sim.track.data.itemBoxes[e.value];
        const g = this.sim.track.groundAtLane(box.s, box.lane) ?? 0;
        const bp = this.at(box.s, laneToLateral(box.lane), g + box.lift + 0.35);
        this.glow.burst(bp.x, bp.y, bp.z, 26, 6, '#ff9bf0', 0.55, 0.5, 2);
        if (this.debris && isLocal) this.debris.spawn(bp.clone(), g, ['#ff7ad9', '#9b6bff', '#4cc9ff'], 5, 3.5);
        break;
      }
      case 'glimmer': {
        const gl = this.sim.track.data.glimmers[e.value];
        const g = this.sim.track.groundAtLane(gl.s, gl.lane) ?? 0;
        const gp = this.at(gl.s, laneToLateral(gl.lane), g + gl.lift + 0.35);
        this.glow.burst(gp.x, gp.y, gp.z, isLocal ? 8 : 3, 3, '#ffe066', 0.35, 0.35, 0);
        break;
      }
      case 'abilityUse': {
        const def = e.ability ? ABILITIES[e.ability] : null;
        if (def) this.glow.burst(p.x, p.y + 0.7, p.z, 18, 5, def.color, 0.5, 0.45, 0);
        break;
      }
      case 'boostPad':
      case 'startBoost':
        this.glow.burst(p.x, p.y + 0.3, p.z, 16, 5, ABILITIES.dash.color, 0.45, 0.4, 0, 0.2);
        break;
      case 'bounce':
        this.soft.burst(p.x, p.y + 0.1, p.z, 14, 4, '#ffffff', 0.6, 0.5, 2, 0.6);
        break;
      case 'finish':
        if (isLocal) this.launchConfetti(p);
        else this.glow.burst(p.x, p.y + 1, p.z, 20, 5, '#ffe066', 0.5, 0.6, 2);
        break;
      default:
        break;
    }
  }

  private launchConfetti(origin: THREE.Vector3): void {
    for (const c of this.confettiState) {
      c.p.set(origin.x + (Math.random() - 0.5) * 3, origin.y + 3.5 + Math.random(), origin.z + (Math.random() - 0.5) * 3);
      c.v.set((Math.random() - 0.5) * 8, Math.random() * 6 + 2, (Math.random() - 0.5) * 8);
      c.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      c.w.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
      c.life = 3 + Math.random() * 1.5;
    }
  }

  /** Cosmetic trail particles behind each running racer. */
  private emitTrails(dt: number, views: RacerView[]): void {
    this.trailTimer += dt;
    if (this.trailTimer < 0.035) return;
    this.trailTimer = 0;
    for (const v of views) {
      const b = v.racer.body;
      if (b.phase !== 'run' && b.phase !== 'finished') continue;
      const trailId = v.racer.cosmetics.trail ?? 'trail_dust';
      const def = COSMETIC_BY_ID[trailId];
      const trail = def?.model ?? trailId;
      const color = def?.color ?? '#ffffff';
      const pos = v.worldPos;
      const back = this.path.heading(b.s);
      const bx = pos.x - Math.sin(back) * 0.35;
      const bz = pos.z + Math.cos(back) * 0.35;
      const fast = b.dash > 0 || b.padBoost > 0;
      if (trail === 'trail_dust') {
        if (b.grounded && b.speed > 3) this.soft.emit(bx, pos.y + 0.08, bz, (Math.random() - 0.5) * 0.8, 0.6, (Math.random() - 0.5) * 0.8, this.theme.groundTop, 0.45, 0.45, 0.5);
      } else if (trail === 'trail_rainbow') {
        const hue = (performance.now() / 600 + v.racer.index * 0.2) % 1;
        this.glow.emit(bx, pos.y + 0.45, bz, 0, 0.1, 0, rainbow.setHSL(hue, 0.9, 0.6), 0.5, 0.6, 0, 0.5);
      } else {
        const additive = trail !== 'trail_leaves' && trail !== 'trail_bubbles';
        const sys = additive ? this.glow : this.soft;
        const up = trail === 'trail_flame' ? 1.4 : trail === 'trail_bubbles' ? 0.9 : 0.4;
        sys.emit(bx + (Math.random() - 0.5) * 0.3, pos.y + 0.3 + Math.random() * 0.4, bz + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.6, up, (Math.random() - 0.5) * 0.6, color, trail === 'trail_bubbles' ? 0.35 : 0.42, 0.55, trail === 'trail_leaves' ? 1.2 : 0, 1);
      }
      if (fast) this.glow.emit(bx, pos.y + 0.5 + Math.random() * 0.4, bz, 0, 0, 0, ABILITIES.dash.color, 0.6, 0.3, 0, 0);
    }
  }

  private syncEntities(t: number): void {
    const seen = new Set<number>();
    for (const e of this.sim.entities) {
      if (!e.alive) continue;
      seen.add(e.id);
      if (e.kind === 'seeker') {
        let v = this.seekerViews.get(e.id);
        if (!v) {
          v = makeSeeker();
          this.seekerViews.set(e.id, v);
          this.group.add(v);
        }
        this.path.toWorld(e.s, e.lateral, e.y, v.position);
        v.rotation.y = this.path.yaw(e.s);
        v.children[0].rotation.x = -t * 14;
        if (Math.random() < 0.6) this.glow.emit(v.position.x, v.position.y, v.position.z, 0, 0.3, 0, ABILITIES.seeker.color, 0.4, 0.35, 0, 1);
      } else if (e.kind === 'snare') {
        let v = this.snareViews.get(e.id);
        if (!v) {
          v = makeSnare();
          this.path.toWorld(e.s, laneToLateral(e.lane), e.y, v.position);
          v.rotation.y = this.path.yaw(e.s);
          this.snareViews.set(e.id, v);
          this.group.add(v);
        }
        const ring = v.children[1] as THREE.Mesh;
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(t * 8) * 0.2;
        v.scale.setScalar(e.ttl < 1 ? e.ttl : 1);
      } else {
        let v = this.sapViews.get(e.id);
        if (!v) {
          v = makeSap(this.path, this.sim, e.s0, e.s1, e.lanes);
          this.sapViews.set(e.id, v);
          this.group.add(v);
        }
        v.visible = true;
        v.scale.y = e.ttl < 0.8 ? e.ttl / 0.8 : 1;
      }
    }
    for (const map of [this.seekerViews, this.snareViews, this.sapViews]) {
      for (const [id, v] of map) {
        if (!seen.has(id)) {
          this.group.remove(v);
          map.delete(id);
        }
      }
    }
  }

  update(dt: number, t: number, views: RacerView[]): void {
    this.emitTrails(dt, views);
    this.syncEntities(t);
    this.glow.update(dt);
    this.soft.update(dt);
    this.debris?.update(dt);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    let any = false;
    this.confettiState.forEach((c, i) => {
      if (c.life <= 0) {
        this.dummy.scale.setScalar(0);
      } else {
        any = true;
        c.life -= dt;
        c.v.y -= 6 * dt;
        c.v.multiplyScalar(Math.exp(-1.2 * dt));
        c.p.addScaledVector(c.v, dt);
        c.r.x += c.w.x * dt;
        c.r.y += c.w.y * dt;
        this.dummy.position.copy(c.p);
        this.dummy.rotation.copy(c.r);
        this.dummy.scale.setScalar(Math.min(1, c.life));
      }
      this.dummy.updateMatrix();
      this.confetti.setMatrixAt(i, this.dummy.matrix);
    });
    this.confetti.visible = any;
    this.confetti.instanceMatrix.needsUpdate = true;
  }
}

function makeSeeker(): THREE.Group {
  const g = new THREE.Group();
  const ball = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), toon(ABILITIES.seeker.color, { emissive: '#ff4a1a', emissiveIntensity: 0.6 }));
  ball.add(core);
  const spikeGeo = new THREE.ConeGeometry(0.07, 0.22, 5);
  const spikeMat = toon('#ffe0b0');
  const dirs = new THREE.IcosahedronGeometry(1, 0).getAttribute('position');
  for (let i = 0; i < dirs.count; i += 3) {
    const d = new THREE.Vector3(dirs.getX(i), dirs.getY(i), dirs.getZ(i)).normalize();
    const sp = new THREE.Mesh(spikeGeo, spikeMat);
    sp.position.copy(d).multiplyScalar(0.3);
    sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    ball.add(sp);
  }
  g.add(ball);
  return g;
}

function makeSnare(): THREE.Group {
  const g = new THREE.Group();
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.32, 0.09, 48, 6, 2, 3), toon('#3f8a3a'));
  knot.position.y = 0.38;
  knot.scale.y = 0.8;
  for (let i = 0; i < 8; i++) {
    const thorn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 4), toon('#e9e2c8'));
    const a = (i / 8) * Math.PI * 2;
    thorn.position.set(Math.cos(a) * 0.4, (i % 2) * 0.15, Math.sin(a) * 0.4);
    thorn.rotation.z = Math.cos(a) * -1;
    thorn.rotation.x = Math.sin(a);
    knot.add(thorn);
  }
  g.add(knot);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 24), new THREE.MeshBasicMaterial({ color: '#ff4d4d', transparent: true, opacity: 0.5, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  g.add(ring);
  return g;
}

function makeSap(path: TrackPath, sim: RaceSimulation, s0: number, s1: number, lanes: number): THREE.Group {
  const g = new THREE.Group();
  const mat = toon(ABILITIES.sap.color, { emissive: '#b86a00', emissiveIntensity: 0.25, opacity: 0.92 });
  const shine = flat('#fff2c0', 0.5);
  for (let lane = -1; lane <= 1; lane++) {
    if (!(lanes & (1 << (lane + 1)))) continue;
    for (let s = s0 + 0.7; s < s1; s += 1.4) {
      const blob = new THREE.Mesh(new THREE.CircleGeometry(1, 14), mat);
      blob.rotation.x = -Math.PI / 2;
      const holder = new THREE.Group();
      const y = (sim.track.groundAtLane(s, lane) ?? sim.track.baseline(s)) + 0.04;
      path.toWorld(s, laneToLateral(lane) + Math.sin(s * 3) * 0.2, y, holder.position);
      holder.rotation.y = path.yaw(s);
      blob.scale.set(1.15, 0.85 + Math.cos(s * 5) * 0.1, 1);
      holder.add(blob);
      const hl = new THREE.Mesh(new THREE.CircleGeometry(0.25, 10), shine);
      hl.rotation.x = -Math.PI / 2;
      hl.position.set(0.3, 0.01, -0.2);
      holder.add(hl);
      g.add(holder);
    }
  }
  return g;
}
