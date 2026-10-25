import * as THREE from 'three';
import { GameplayConfig, laneToLateral } from '../config/GameplayConfig';
import type { Track, GroundSpan } from '../game/Track';
import {
  boulderPosition,
  lanesOf,
  pendulumLateral,
  periodicState,
  type Hazard,
  type PeriodicHazard,
} from '../obstacles/ObstacleBase';
import { BIOME_THEMES, type BiomeTheme } from './BiomeTheme';
import { flat, glowTexture, stripeTexture, toon, toonGradient } from './Materials';
import type { TrackPath } from './TrackPath';

const LANE_W = GameplayConfig.lanes.width;
const tmp = new THREE.Vector3();

interface HazardView {
  hazard: Hazard;
  root: THREE.Object3D;
  update(t: number, dt: number): void;
}

/** Builds and animates every static thing on the track. */
export class TrackView {
  readonly group = new THREE.Group();
  private readonly hazardViews: HazardView[] = [];
  private readonly boxViews: { root: THREE.Object3D; index: number; s: number }[] = [];
  private glimmerMesh: THREE.InstancedMesh | null = null;
  private readonly glimmerHidden: Uint8Array;
  private readonly glimmerBase: THREE.Matrix4[] = [];
  private readonly theme: BiomeTheme;
  private readonly bouncePads = new Map<number, THREE.Object3D>();
  private readonly dummy = new THREE.Object3D();
  private readonly spinM = new THREE.Matrix4();
  private readonly tmpM = new THREE.Matrix4();
  private readonly zeroM = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(
    private readonly track: Track,
    private readonly path: TrackPath,
    quality: 'low' | 'medium' | 'high',
  ) {
    this.theme = BIOME_THEMES[track.biome];
    this.glimmerHidden = new Uint8Array(track.data.glimmers.length);
    this.buildGround(quality);
    this.buildGates();
    for (const h of track.data.hazards) this.addHazard(h);
    this.buildItemBoxes();
    this.buildGlimmers();
  }

  // --- ground ---------------------------------------------------------------

  private buildGround(quality: string): void {
    const th = this.theme;
    const topTex = laneTexture(th.groundTop, th.groundTopAlt, th.groundEdge);
    const topMats = [-1, 0, 1].map((lane) => {
      return new THREE.MeshToonMaterial({ map: topTex, color: new THREE.Color(lane === 0 ? '#ffffff' : '#eeeeee'), gradientMap: toonGradient() });
    });
    const sideMat = new THREE.MeshToonMaterial({ color: new THREE.Color(th.groundSide), gradientMap: toonGradient(), side: THREE.DoubleSide });
    const step = quality === 'low' ? 1.5 : 1;
    for (let lane = -1; lane <= 1; lane++) {
      for (const span of this.track.data.laneGround[lane + 1]) {
        const mesh = this.slab(span, lane, step, topMats[lane + 1], sideMat);
        this.group.add(mesh);
      }
    }
  }

  /** One lane span: top surface, two side walls and end caps, following the curved path. */
  private slab(span: GroundSpan, lane: number, step: number, topMat: THREE.Material, sideMat: THREE.Material): THREE.Mesh {
    const s0 = Math.max(span.s0, this.path.startS + 1);
    const s1 = Math.min(span.s1, this.track.length + 70);
    const n = Math.max(2, Math.ceil((s1 - s0) / step) + 1);
    const half = LANE_W / 2;
    const depth = 2.2 + span.raise;
    const top: number[] = [];
    const topUv: number[] = [];
    const side: number[] = [];
    const topIdx: number[] = [];
    const sideIdx: number[] = [];
    const cx = laneToLateral(lane);
    for (let i = 0; i < n; i++) {
      const s = s0 + ((s1 - s0) * i) / (n - 1);
      const y = this.track.baseline(s) + span.raise;
      this.path.toWorld(s, cx - half, y, tmp);
      top.push(tmp.x, tmp.y, tmp.z);
      const lx = tmp.x, lz = tmp.z;
      this.path.toWorld(s, cx + half, y, tmp);
      top.push(tmp.x, tmp.y, tmp.z);
      topUv.push(0, s / 4, 1, s / 4);
      // Side walls: left top, left bottom, right top, right bottom.
      side.push(lx, y, lz, lx, y - depth, lz, tmp.x, y, tmp.z, tmp.x, y - depth, tmp.z);
      if (i < n - 1) {
        const a = i * 2;
        topIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        const b = i * 4;
        sideIdx.push(b, b + 1, b + 4, b + 4, b + 1, b + 5); // left wall
        sideIdx.push(b + 2, b + 6, b + 3, b + 3, b + 6, b + 7); // right wall
      }
    }
    // End caps.
    const capStart = n * 4;
    const sLast = (n - 1) * 4;
    side.push(...side.slice(0, 12), ...side.slice(sLast * 3, sLast * 3 + 12));
    sideIdx.push(capStart, capStart + 2, capStart + 1, capStart + 1, capStart + 2, capStart + 3);
    sideIdx.push(capStart + 4, capStart + 5, capStart + 6, capStart + 6, capStart + 5, capStart + 7);

    const g = new THREE.BufferGeometry();
    const topCount = top.length / 3;
    const positions = new Float32Array(top.length + side.length);
    positions.set(top, 0);
    positions.set(side, top.length);
    const uvs = new Float32Array((positions.length / 3) * 2);
    uvs.set(topUv, 0);
    for (let i = topCount; i < positions.length / 3; i++) {
      uvs[i * 2] = (i % 2) * 0.5;
      uvs[i * 2 + 1] = i * 0.1;
    }
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setIndex([...topIdx, ...sideIdx.map((x) => x + topCount)]);
    g.addGroup(0, topIdx.length, 0);
    g.addGroup(topIdx.length, sideIdx.length, 1);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, [topMat, sideMat]);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    return mesh;
  }

  private buildGates(): void {
    const th = this.theme;
    const checker = checkerTexture();
    // Start line and finish strip.
    for (const s of [0, this.track.length]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W * 3, 1.2), new THREE.MeshBasicMaterial({ map: checker }));
      strip.rotation.x = -Math.PI / 2;
      strip.position.y = 0.03;
      const holder = new THREE.Group();
      this.path.toWorld(s, 0, this.track.baseline(s), holder.position);
      holder.rotation.y = this.path.yaw(s);
      holder.add(strip);
      holder.add(this.arch(s === 0 ? th.hazard.secondary : '#ffffff', s !== 0, checker));
      this.group.add(holder);
    }
  }

  private arch(color: string, finish: boolean, checker: THREE.Texture): THREE.Group {
    const g = new THREE.Group();
    const postMat = toon(finish ? '#ffffff' : color);
    const span = LANE_W * 3 + 1.4;
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 5, 10), postMat);
      post.position.set((side * span) / 2, 2.5, 0);
      post.castShadow = true;
      g.add(post);
      const flag = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 4), toon(finish ? '#ff4f6a' : '#4cc9ff'));
      flag.position.set((side * span) / 2, 5.3, 0);
      g.add(flag);
    }
    const banner = new THREE.Mesh(new THREE.BoxGeometry(span, 0.9, 0.2), finish ? new THREE.MeshBasicMaterial({ map: checker }) : toon(color));
    banner.position.y = 4.6;
    banner.castShadow = true;
    g.add(banner);
    return g;
  }

  // --- hazards --------------------------------------------------------------

  private place(obj: THREE.Object3D, s: number, lateral: number, y: number): void {
    this.path.toWorld(s, lateral, y, obj.position);
    obj.rotation.y = this.path.yaw(s);
  }

  private addHazard(h: Hazard): void {
    const view = this.createHazardView(h);
    if (!view) return;
    this.group.add(view.root);
    this.hazardViews.push(view);
  }

  private createHazardView(h: Hazard): HazardView | null {
    const th = this.theme;
    const biome = this.track.biome;
    const groundY = (lane: number) => this.track.groundAtLane(h.s, lane) ?? this.track.baseline(h.s);
    switch (h.kind) {
      case 'hurdle': {
        const root = new THREE.Group();
        for (const lane of lanesOf(h.lanes)) {
          const g = new THREE.Group();
          if (biome === 'forest') {
            const log = new THREE.Mesh(new THREE.CylinderGeometry(h.height / 2, h.height / 2, LANE_W - 0.3, 12), toon(th.hazard.primary));
            log.rotation.z = Math.PI / 2;
            log.position.y = h.height / 2;
            g.add(log);
            for (const side of [-1, 1]) {
              const ring = new THREE.Mesh(new THREE.CircleGeometry(h.height / 2 - 0.02, 12), toon('#e6c48a'));
              ring.position.set((side * (LANE_W - 0.3)) / 2 + side * 0.01, h.height / 2, 0);
              ring.rotation.y = (side * Math.PI) / 2;
              g.add(ring);
            }
            const moss = new THREE.Mesh(new THREE.BoxGeometry(LANE_W - 0.5, 0.08, 0.35), toon('#78c850'));
            moss.position.y = h.height;
            g.add(moss);
          } else if (biome === 'canyon') {
            const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), toon(th.hazard.primary));
            rock.scale.set((LANE_W - 0.3) / 2, h.height / 1.6, 0.42);
            rock.position.y = h.height / 2.2;
            g.add(rock);
          } else {
            for (let i = 0; i < 5; i++) {
              const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), toon(th.hazard.secondary, { emissive: th.hazard.secondary, emissiveIntensity: 0.5 }));
              shard.scale.set(0.8, (h.height / 0.28) * 0.55 * (0.8 + (i % 2) * 0.3), 0.8);
              shard.position.set(-0.85 + i * 0.42, h.height / 2, 0);
              g.add(shard);
            }
          }
          // Readability: bright stripe on top.
          const stripe = new THREE.Mesh(new THREE.BoxGeometry(LANE_W - 0.4, 0.05, 0.12), flat(th.hazard.warn));
          stripe.position.y = h.height + 0.03;
          g.add(stripe);
          g.traverse((o) => (o.castShadow = true));
          this.place(g, h.s, laneToLateral(lane), groundY(lane));
          root.add(g);
        }
        return { hazard: h, root, update() {} };
      }
      case 'wall': {
        const root = new THREE.Group();
        const stripes = stripeTexture(th.hazard.danger, '#ffffff');
        for (const lane of lanesOf(h.lanes)) {
          const g = new THREE.Group();
          const body = new THREE.Mesh(
            biome === 'crystal' ? new THREE.CylinderGeometry(0.9, 1.1, h.height, 6) : new THREE.BoxGeometry(LANE_W - 0.25, h.height, h.halfDepth * 2),
            toon(th.hazard.primary, biome === 'crystal' ? { emissive: th.hazard.secondary, emissiveIntensity: 0.25 } : {}),
          );
          body.position.y = h.height / 2;
          body.castShadow = true;
          g.add(body);
          const band = new THREE.Mesh(new THREE.BoxGeometry(LANE_W - 0.15, 0.55, h.halfDepth * 2 + 0.06), new THREE.MeshBasicMaterial({ map: stripes }));
          band.position.y = 1.0;
          g.add(band);
          if (biome === 'forest') {
            for (const side of [-1, 1]) {
              const root2 = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 6), toon('#6b4a2a'));
              root2.position.set(side * 0.9, 0.5, -h.halfDepth);
              root2.rotation.z = side * 0.5;
              g.add(root2);
            }
            const leaves = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), toon('#4f9a3a'));
            leaves.position.y = h.height + 0.3;
            leaves.scale.set(1.1, 0.6, 0.8);
            g.add(leaves);
          }
          this.place(g, h.s, laneToLateral(lane), groundY(lane));
          root.add(g);
        }
        return { hazard: h, root, update() {} };
      }
      case 'spikes':
      case 'flame':
        return this.periodicView(h, groundY);
      case 'pendulum': {
        const root = new THREE.Group();
        const y0 = this.track.baseline(h.s);
        const top = 7.2;
        const frame = new THREE.Group();
        const postMat = toon(th.hazard.primary);
        for (const side of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, top, 8), postMat);
          post.position.set(side * (LANE_W * 1.5 + 0.9), top / 2, 0);
          post.castShadow = true;
          frame.add(post);
        }
        const beam = new THREE.Mesh(new THREE.BoxGeometry(LANE_W * 3 + 2.4, 0.4, 0.5), postMat);
        beam.position.y = top;
        frame.add(beam);
        this.place(frame, h.s, 0, y0);
        root.add(frame);
        const arm = new THREE.Group();
        this.place(arm, h.s, 0, y0 + top);
        const armLen = top - (h.height + 1.3);
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, armLen, 6), toon('#d9c7a0'));
        rope.position.y = -armLen / 2;
        arm.add(rope);
        let bob: THREE.Mesh;
        if (biome === 'forest') {
          bob = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), toon('#b07a3a'));
          bob.scale.set(0.85, 1.05, 0.8);
          const cap = new THREE.Mesh(new THREE.SphereGeometry(0.95, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon('#6b4424'));
          cap.position.y = 0.25;
          bob.add(cap);
        } else if (biome === 'canyon') {
          bob = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), toon('#9a5a3a'));
          bob.scale.setScalar(0.95);
        } else {
          bob = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), toon('#b48cff', { emissive: '#7e5bff', emissiveIntensity: 0.6 }));
          bob.scale.set(0.8, 1.1, 0.8);
        }
        bob.position.y = -armLen - 0.4;
        bob.castShadow = true;
        arm.add(bob);
        root.add(arm);
        const L = armLen + 0.4;
        const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.9, 16), flat('#000000', 0.25));
        shadow.rotation.x = -Math.PI / 2;
        root.add(shadow);
        return {
          hazard: h,
          root,
          update: (t: number) => {
            const p = pendulumLateral(h, t);
            arm.rotation.z = Math.asin(Math.max(-1, Math.min(1, p / L)));
            this.path.toWorld(h.s, p, y0 + 0.03, shadow.position);
          },
        };
      }
      case 'boulder': {
        const lane = lanesOf(h.lanes)[0];
        const ball = new THREE.Mesh(
          biome === 'forest' ? new THREE.SphereGeometry(h.radius, 12, 10) : new THREE.DodecahedronGeometry(h.radius, 0),
          toon(biome === 'forest' ? '#8a6a3a' : biome === 'canyon' ? '#a0603a' : '#7e6bd6'),
        );
        ball.castShadow = true;
        const root = new THREE.Group();
        root.add(ball);
        let roll = 0;
        return {
          hazard: h,
          root,
          update: (t: number, dt: number) => {
            const bs = boulderPosition(h, t);
            ball.visible = bs !== null;
            if (bs === null) return;
            const g = this.track.groundAtLane(bs, lane) ?? this.track.baseline(bs);
            this.place(ball, bs, laneToLateral(lane), g + h.radius);
            roll += (h.speed / h.radius) * dt;
            ball.rotateX(-(h.speed / h.radius) * dt);
            void roll;
          },
        };
      }
      case 'mud':
      case 'ice': {
        const root = new THREE.Group();
        const color = h.kind === 'mud' ? (biome === 'crystal' ? '#5a3fa8' : biome === 'canyon' ? '#c9935a' : '#5a3a22') : '#d8f4ff';
        const mat =
          h.kind === 'ice'
            ? new THREE.MeshToonMaterial({ color: new THREE.Color(color), emissive: new THREE.Color('#9fe8ff'), emissiveIntensity: 0.25, transparent: true, opacity: 0.88 })
            : toon(color);
        for (const lane of lanesOf(h.lanes)) {
          const len = h.halfDepth * 2;
          const n = Math.max(2, Math.ceil(len / 2));
          for (let i = 0; i < n; i++) {
            const s = h.s - h.halfDepth + (len * (i + 0.5)) / n;
            const patch = new THREE.Mesh(new THREE.BoxGeometry(LANE_W - 0.2, 0.04, len / n + 0.05), mat);
            this.place(patch, s, laneToLateral(lane), (this.track.groundAtLane(s, lane) ?? this.track.baseline(s)) + 0.03);
            patch.receiveShadow = true;
            root.add(patch);
          }
        }
        const bubbles: THREE.Mesh[] = [];
        if (h.kind === 'mud') {
          for (let i = 0; i < 6 * lanesOf(h.lanes).length; i++) {
            const lanes = lanesOf(h.lanes);
            const lane = lanes[i % lanes.length];
            const s = h.s - h.halfDepth + ((i * 7.31) % (h.halfDepth * 2));
            const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), toon(color));
            this.place(b, s, laneToLateral(lane) + (((i * 3.7) % 1.6) - 0.8), this.track.baseline(s) + 0.05);
            b.userData.phase = i * 1.3;
            bubbles.push(b);
            root.add(b);
          }
        }
        return {
          hazard: h,
          root,
          update: (t: number) => {
            for (const b of bubbles) {
              const k = (t * 0.8 + b.userData.phase) % 1;
              b.scale.setScalar(0.4 + k * 1.2);
              b.visible = k < 0.9;
            }
          },
        };
      }
      case 'boostPad': {
        const root = new THREE.Group();
        const tex = arrowTexture(th.hazard.secondary);
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
        for (const lane of lanesOf(h.lanes)) {
          const pad = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W - 0.5, h.halfDepth * 2 + 0.6), mat);
          pad.rotation.x = -Math.PI / 2;
          const holder = new THREE.Group();
          this.place(holder, h.s, laneToLateral(lane), (this.track.groundAtLane(h.s, lane) ?? 0) + 0.04);
          holder.add(pad);
          root.add(holder);
        }
        return {
          hazard: h,
          root,
          update: (t: number) => {
            tex.offset.y = -t * 1.8;
          },
        };
      }
      case 'bouncePad': {
        const root = new THREE.Group();
        for (const lane of lanesOf(h.lanes)) {
          const g = new THREE.Group();
          if (biome === 'forest') {
            const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.3, 10), toon('#f6e7c8'));
            stem.position.y = 0.15;
            const cap = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon('#ff5a6e'));
            cap.scale.y = 0.35;
            cap.position.y = 0.25;
            g.add(stem, cap);
            for (let i = 0; i < 5; i++) {
              const dot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), toon('#ffffff'));
              const a = (i / 5) * Math.PI * 2;
              dot.position.set(Math.cos(a) * 0.5, 0.48, Math.sin(a) * 0.5);
              dot.scale.y = 0.4;
              g.add(dot);
            }
          } else {
            const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.25, 16), toon(biome === 'canyon' ? '#d9d2c4' : '#7ef2ff', { emissive: biome === 'crystal' ? '#4cf2ff' : '#ff9a3c', emissiveIntensity: 0.4 }));
            pad.position.y = 0.12;
            g.add(pad);
          }
          g.traverse((o) => (o.castShadow = true));
          this.place(g, h.s, laneToLateral(lane), this.track.groundAtLane(h.s, lane) ?? this.track.baseline(h.s));
          root.add(g);
        }
        this.bouncePads.set(h.id, root);
        return {
          hazard: h,
          root,
          update: (_t: number, dt: number) => {
            const k = root.userData.squash ?? 0;
            if (k > 0) root.userData.squash = Math.max(0, k - dt * 4);
            for (const c of root.children) c.scale.set(1 + k * 0.3, 1 - k * 0.5, 1 + k * 0.3);
          },
        };
      }
    }
  }

  private periodicView(h: PeriodicHazard, groundY: (lane: number) => number): HazardView {
    const th = this.theme;
    const biome = this.track.biome;
    const root = new THREE.Group();
    const moving: THREE.Object3D[] = [];
    const warnMats: THREE.MeshBasicMaterial[] = [];
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(th.hazard.warn), transparent: true, opacity: 0, depthWrite: false });
    warnMats.push(glow);
    for (const lane of lanesOf(h.lanes)) {
      const g = new THREE.Group();
      const plate = new THREE.Mesh(new THREE.BoxGeometry(LANE_W - 0.3, 0.08, h.halfDepth * 2), toon(th.hazard.primary));
      plate.position.y = 0.04;
      plate.receiveShadow = true;
      g.add(plate);
      const warn = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W - 0.2, h.halfDepth * 2 + 0.3), glow);
      warn.rotation.x = -Math.PI / 2;
      warn.position.y = 0.1;
      g.add(warn);
      const mover = new THREE.Group();
      if (h.kind === 'spikes') {
        const spikeMat = toon(biome === 'crystal' ? '#7ef2ff' : biome === 'canyon' ? '#6aa84f' : '#e9e2c8', biome === 'crystal' ? { emissive: '#4cf2ff', emissiveIntensity: 0.5 } : {});
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 2; j++) {
            const spike = new THREE.Mesh(new THREE.ConeGeometry(0.17, h.height, 6), spikeMat);
            spike.position.set(-0.85 + i * 0.56 + j * 0.28, h.height / 2, -0.25 + j * 0.5);
            spike.castShadow = true;
            mover.add(spike);
          }
        }
      } else {
        const colorA = biome === 'canyon' ? '#ffb23a' : biome === 'crystal' ? '#a8f6ff' : '#c8ff8a';
        const colorB = biome === 'canyon' ? '#ff4a1a' : biome === 'crystal' ? '#4cc9ff' : '#6ad15a';
        const core = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.65, h.height, 10, 1, true), flat(colorA, 0.85, true));
        core.position.y = h.height / 2;
        const outer = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, h.height * 0.85, 10, 1, true), flat(colorB, 0.5, true));
        outer.position.y = (h.height * 0.85) / 2;
        mover.add(core, outer);
        const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.3, 10), toon('#3a2a2a'));
        vent.position.y = 0.15;
        g.add(vent);
      }
      g.add(mover);
      moving.push(mover);
      this.place(g, h.s, laneToLateral(lane), groundY(lane));
      root.add(g);
    }
    return {
      hazard: h,
      root,
      update: (t: number) => {
        const state = periodicState(h, t);
        const local = (((t + h.phase) % h.period) + h.period) % h.period;
        for (const m of moving) {
          if (h.kind === 'spikes') {
            // Spikes pop up fast, retract smoothly.
            const up = state === 'active' ? Math.min(1, local / 0.06) * (local > h.activeTime - 0.12 ? (h.activeTime - local) / 0.12 : 1) : 0;
            m.position.y = (up - 1) * h.height * 0.98;
            m.visible = up > 0.01 || state === 'warn';
            if (state === 'warn') m.position.y = -h.height * 0.82 + Math.sin(t * 60) * 0.03;
          } else {
            m.visible = state === 'active';
            m.scale.set(1 + Math.sin(t * 40) * 0.06, 1, 1 + Math.cos(t * 37) * 0.06);
          }
        }
        glow.opacity = state === 'warn' ? 0.35 + Math.sin(t * 30) * 0.25 : state === 'active' ? 0.25 : 0;
        glow.color.set(state === 'active' ? th.hazard.danger : th.hazard.warn);
      },
    };
  }

  // --- pickups ----------------------------------------------------------------

  private buildItemBoxes(): void {
    const tex = runeTexture();
    const mat = new THREE.MeshToonMaterial({ map: tex, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.55, gradientMap: toon('#fff').gradientMap });
    const geom = new THREE.BoxGeometry(0.75, 0.75, 0.75);
    const halo = new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color('#ffd9ff'), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    this.track.data.itemBoxes.forEach((box, index) => {
      const root = new THREE.Group();
      const cube = new THREE.Mesh(geom, mat);
      cube.castShadow = true;
      root.add(cube);
      const sprite = new THREE.Sprite(halo);
      sprite.scale.setScalar(1.8);
      root.add(sprite);
      const g = this.track.groundAtLane(box.s, box.lane) ?? 0;
      this.path.toWorld(box.s, laneToLateral(box.lane), g + box.lift + 0.35, root.position);
      root.userData.baseY = root.position.y;
      this.group.add(root);
      this.boxViews.push({ root, index, s: box.s });
    });
  }

  private buildGlimmers(): void {
    const gl = this.track.data.glimmers;
    if (gl.length === 0) return;
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 0.26 : 0.12;
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const geom = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 });
    geom.center();
    const mat = toon('#ffd23a', { emissive: '#ffb000', emissiveIntensity: 0.55 });
    const mesh = new THREE.InstancedMesh(geom, mat, gl.length);
    mesh.castShadow = false;
    gl.forEach((g, i) => {
      const y = (this.track.groundAtLane(g.s, g.lane) ?? this.track.baseline(g.s)) + g.lift + 0.35;
      this.path.toWorld(g.s, laneToLateral(g.lane), y, this.dummy.position);
      this.dummy.rotation.set(0, this.path.yaw(g.s), 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.glimmerBase.push(this.dummy.matrix.clone());
      mesh.setMatrixAt(i, this.dummy.matrix);
    });
    mesh.frustumCulled = false;
    this.glimmerMesh = mesh;
    this.group.add(mesh);
  }

  /** Hides a glimmer the local player collected. */
  hideGlimmer(index: number): void {
    this.glimmerHidden[index] = 1;
  }

  bounce(hazardId: number): void {
    const pad = this.bouncePads.get(hazardId);
    if (pad) pad.userData.squash = 1;
  }

  update(t: number, dt: number, boxReadyAt: Float64Array, cameraS: number): void {
    for (const v of this.hazardViews) {
      // Only animate hazards near the camera.
      if (Math.abs(v.hazard.s - cameraS) < 90) {
        v.root.visible = true;
        v.update(t, dt);
      } else v.root.visible = Math.abs(v.hazard.s - cameraS) < 160;
    }
    for (const b of this.boxViews) {
      const ready = boxReadyAt[b.index] <= t;
      b.root.visible = ready;
      if (!ready) continue;
      const cube = b.root.children[0];
      cube.rotation.y = t * 1.6 + b.index;
      cube.rotation.x = Math.sin(t * 1.2 + b.index) * 0.4;
      b.root.position.y = b.root.userData.baseY + Math.sin(t * 2.4 + b.index) * 0.12;
    }
    if (this.glimmerMesh) {
      const spin = this.spinM.makeRotationY(t * 3);
      const m = this.tmpM;
      const zero = this.zeroM;
      const gl = this.track.data.glimmers;
      for (let i = 0; i < gl.length; i++) {
        if (this.glimmerHidden[i] || Math.abs(gl[i].s - cameraS) > 70) this.glimmerMesh.setMatrixAt(i, zero);
        else this.glimmerMesh.setMatrixAt(i, m.multiplyMatrices(this.glimmerBase[i], spin));
      }
      this.glimmerMesh.instanceMatrix.needsUpdate = true;
    }
  }
}

// --- textures -------------------------------------------------------------------

function laneTexture(a: string, b: string, edge: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = a;
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = b;
  g.fillRect(0, 0, 64, 64);
  g.globalAlpha = 0.25;
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 40; i++) g.fillRect((i * 37) % 60, (i * 53) % 124, 2, 3);
  g.globalAlpha = 1;
  g.fillStyle = edge;
  g.fillRect(0, 0, 4, 128);
  g.fillRect(60, 0, 4, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function checkerTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const g = c.getContext('2d')!;
  for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) {
    g.fillStyle = (x + y) % 2 ? '#1b1530' : '#ffffff';
    g.fillRect(x * 8, y * 8, 8, 8);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

function arrowTexture(color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 64, 64);
  g.fillStyle = color;
  g.globalAlpha = 0.9;
  g.beginPath();
  g.moveTo(32, 6);
  g.lineTo(58, 32);
  g.lineTo(46, 32);
  g.lineTo(32, 18);
  g.lineTo(18, 32);
  g.lineTo(6, 32);
  g.closePath();
  g.fill();
  g.globalAlpha = 0.35;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function runeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 128, 128);
  grad.addColorStop(0, '#ff7ad9');
  grad.addColorStop(0.5, '#9b6bff');
  grad.addColorStop(1, '#4cc9ff');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 8;
  g.strokeRect(6, 6, 116, 116);
  // Original swirl rune glyph.
  g.lineWidth = 9;
  g.lineCap = 'round';
  g.beginPath();
  for (let i = 0; i <= 40; i++) {
    const a = i * 0.32;
    const r = 6 + i * 0.95;
    const x = 64 + Math.cos(a) * r;
    const y = 64 + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
