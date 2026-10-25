import * as THREE from 'three';
import type { RaceSimulation } from '../game/RaceManager';
import type { RaceEvent } from '../game/RaceState';
import { BiomeEnvironment } from './BiomeEnvironment';
import { CameraController } from './CameraController';
import { DebrisPhysics } from './DebrisPhysics';
import { EffectsSystem } from './EffectsSystem';
import type { GameRenderer } from './GameRenderer';
import { RacerView } from './RacerView';
import { TrackPath } from './TrackPath';
import { TrackView } from './TrackView';

const tmp = new THREE.Vector3();

/** Everything visual for one race. Reads the simulation, never writes it. */
export class RaceScene {
  readonly scene = new THREE.Scene();
  readonly path: TrackPath;
  readonly env: BiomeEnvironment;
  readonly trackView: TrackView;
  readonly views: RacerView[];
  readonly effects: EffectsSystem;
  readonly cameraCtl: CameraController;
  private readonly debris: DebrisPhysics | null;
  private time = 0;
  private outroT = 0;

  constructor(
    private readonly gr: GameRenderer,
    private readonly sim: RaceSimulation,
    readonly localIndex: number,
  ) {
    const q = gr.quality;
    this.path = new TrackPath(sim.track);
    this.env = new BiomeEnvironment(sim.track, this.path, q);
    this.env.applyFog(this.scene);
    this.scene.add(this.env.group);
    this.trackView = new TrackView(sim.track, this.path, q);
    this.scene.add(this.trackView.group);
    this.views = sim.racers.map((r) => new RacerView(r, r.index === localIndex, q));
    for (const v of this.views) {
      this.scene.add(v.root);
      this.scene.add(v.shadow);
      v.resetSnapshot(v.racer.body);
    }
    this.debris = q === 'low' ? null : new DebrisPhysics(this.scene);
    this.effects = new EffectsSystem(this.path, sim, this.env.theme, q, this.debris);
    this.effects.setViewportHeight(gr.height * gr.pixelRatio);
    this.scene.add(this.effects.group);
    this.cameraCtl = new CameraController(gr.aspect);
    this.cameraCtl.resize(gr.aspect);
    const me = sim.racers[localIndex].body;
    this.cameraCtl.snap(me.s, me.lateral, me.y);
  }

  /** Loads optional heavy extras (Rapier debris). Never blocks the race. */
  async loadExtras(): Promise<void> {
    if (this.debris) await this.debris.load();
  }

  resize(): void {
    this.cameraCtl.resize(this.gr.aspect);
    this.effects.setViewportHeight(this.gr.height * this.gr.pixelRatio);
  }

  /** Call after every simulation tick. */
  onTick(events: readonly RaceEvent[]): void {
    for (const v of this.views) v.snapshot(v.racer.body);
    for (const e of events) {
      if (e.type === 'glimmer' && e.racer === this.localIndex) this.trackView.hideGlimmer(e.value);
      if (e.type === 'bounce') this.trackView.bounce(e.value);
      this.effects.handle(e, this.views, this.localIndex);
    }
  }

  frame(dt: number, alpha: number): void {
    this.time += dt;
    const t = this.sim.time + alpha / 60;
    this.computeNudges(alpha);
    for (const v of this.views) {
      const s = v.interpolatedS(alpha);
      const g = this.sim.track.groundAt(s, v.racer.body.lateral);
      v.update(dt, this.time, alpha, this.path, g);
    }
    const me = this.views[this.localIndex];
    const body = me.racer.body;
    const s = me.interpolatedS(alpha);
    for (const v of this.views) {
      if (v === me) continue;
      const vs = v.interpolatedS(alpha);
      const blocking = body.phase !== 'finished' && vs > s - 6.2 && vs < s - 0.4 && Math.abs(v.racer.body.lateral - body.lateral) < 1.7;
      v.setGhost(blocking ? 0.28 : 1, dt);
    }
    this.trackView.update(Math.max(0, t), dt, this.sim.itemBoxReadyAt, s);
    // Camera follows the ground-ish height so jumps feel big but stay readable.
    const groundY = this.sim.track.groundAt(s, body.lateral) ?? this.sim.track.baseline(s);
    const camY = body.phase === 'fall' ? this.sim.track.baseline(s) : Math.max(groundY, me.prev.y + (me.curr.y - me.prev.y) * alpha - 0.6);
    const intro = this.sim.phase === 'countdown' ? Math.max(0, 1 - this.sim.tick / this.sim.countdownTicks) : 0;
    if (body.phase === 'finished') {
      // Orbit around the celebrating racer.
      this.outroT += dt;
      const ang = this.outroT * 0.35;
      this.path.toWorld(s, body.lateral, body.y + 1.2, tmp);
      const cam = this.cameraCtl.camera;
      const a = this.path.heading(s) + ang;
      // Starts in front of the racer (seeing its face) and slowly circles.
      cam.position.set(tmp.x + Math.sin(a) * 5, tmp.y + 1.4, tmp.z - Math.cos(a) * 5);
      cam.lookAt(tmp);
    } else {
      this.cameraCtl.update(dt, this.path, s, body.lateral, camY, body.speed, this.effects.shake, intro);
    }
    this.path.toWorld(s, 0, this.sim.track.baseline(s), tmp);
    this.env.update(this.time, tmp, this.path.heading(s));
    this.effects.update(dt, this.time, this.views);
    this.gr.render(this.scene, this.cameraCtl.camera, this.sim.track.biome === 'crystal' ? 0.85 : 0.45);
  }

  /** Visual-only: push overlapping racers apart sideways. */
  private computeNudges(alpha: number): void {
    for (const v of this.views) v.nudge *= 0.85;
    for (let i = 0; i < this.views.length; i++) {
      for (let j = i + 1; j < this.views.length; j++) {
        const a = this.views[i];
        const b = this.views[j];
        const ds = a.interpolatedS(alpha) - b.interpolatedS(alpha);
        const dl = a.racer.body.lateral - b.racer.body.lateral;
        if (Math.abs(ds) < 1.1 && Math.abs(dl) < 0.8) {
          const push = (0.8 - Math.abs(dl)) * 0.5;
          const dir = dl >= 0 ? 1 : -1;
          a.nudge = Math.max(-0.45, Math.min(0.45, a.nudge + dir * push * 0.2));
          b.nudge = Math.max(-0.45, Math.min(0.45, b.nudge - dir * push * 0.2));
        }
      }
    }
  }

  dispose(): void {
    this.debris?.dispose();
    for (const v of this.views) v.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh || (o as THREE.Points).isPoints) {
        m.geometry?.dispose();
      }
    });
  }
}
