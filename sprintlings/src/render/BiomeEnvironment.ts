import * as THREE from 'three';
import { Rng } from '../shared/Rng';
import type { Track } from '../game/Track';
import { BIOME_THEMES, type BiomeTheme } from './BiomeTheme';
import { glowTexture, toon } from './Materials';
import type { TrackPath } from './TrackPath';

export type Quality = 'low' | 'medium' | 'high';

const tmpV = new THREE.Vector3();

/**
 * Sky, lighting, fog and scenery for a biome. Scenery is instanced and placed
 * on floating islands along both sides of the track, never inside the lanes.
 */
export class BiomeEnvironment {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly theme: BiomeTheme;
  private readonly sky: THREE.Mesh;
  /** Far scenery that follows the camera horizontally (parallax-free backdrop). */
  private readonly distant = new THREE.Group();
  private readonly particles: THREE.Points | null = null;
  private readonly particleBase: Float32Array | null = null;
  private readonly animated: { obj: THREE.Object3D; kind: 'float' | 'spin' | 'cloud'; phase: number; base: number }[] = [];

  constructor(
    track: Track | null,
    path: TrackPath | null,
    private readonly quality: Quality,
    biome = track?.biome ?? 'forest',
  ) {
    const th = (this.theme = BIOME_THEMES[biome]);
    this.sky = this.makeSky(th);
    this.group.add(this.sky);

    this.hemi = new THREE.HemisphereLight(th.hemiSky, th.hemiGround, th.hemiIntensity);
    this.group.add(this.hemi);
    this.sun = new THREE.DirectionalLight(th.sunColor, th.sunIntensity);
    this.sun.position.set(18, 30, 12);
    if (quality !== 'low') {
      this.sun.castShadow = true;
      const size = quality === 'high' ? 2048 : 1024;
      this.sun.shadow.mapSize.set(size, size);
      const cam = this.sun.shadow.camera;
      cam.left = -22;
      cam.right = 22;
      cam.top = 22;
      cam.bottom = -22;
      cam.near = 1;
      cam.far = 90;
      this.sun.shadow.bias = -0.0008;
      this.sun.shadow.normalBias = 0.03;
    }
    this.group.add(this.sun);
    this.group.add(this.sun.target);

    this.makeAbyss(th);
    this.makeDistant(th, biome);
    this.group.add(this.distant);
    if (track && path) this.scatterScenery(track, path, th, biome);
    if (quality !== 'low') {
      const p = this.makeParticles(th);
      this.particles = p.points;
      this.particleBase = p.base;
      this.group.add(p.points);
    }
  }

  applyFog(scene: THREE.Scene): void {
    const th = this.theme;
    scene.fog = new THREE.Fog(th.fogColor, th.fogNear, th.fogFar * (this.quality === 'low' ? 0.8 : 1));
    scene.background = new THREE.Color(th.fogColor);
  }

  private makeSky(th: BiomeTheme): THREE.Mesh {
    const geom = new THREE.SphereGeometry(400, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(th.skyTop) },
        horizon: { value: new THREE.Color(th.skyHorizon) },
        bottom: { value: new THREE.Color(th.skyBottom) },
        sunDir: { value: new THREE.Vector3(0.5, 0.35, -0.8).normalize() },
        sunColor: { value: new THREE.Color(th.sunColor) },
        stars: { value: th.night ? 1 : 0 },
        time: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor;
        uniform float stars; uniform float time;
        varying vec3 vDir;
        float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        void main() {
          float h = vDir.y;
          vec3 col = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, pow(-h, 0.4));
          float sd = max(dot(vDir, sunDir), 0.0);
          col += sunColor * (pow(sd, 400.0) * 1.6 + pow(sd, 18.0) * 0.25);
          if (stars > 0.5 && h > 0.05) {
            vec3 cell = floor(vDir * 180.0);
            float r = hash(cell);
            float tw = 0.6 + 0.4 * sin(time * 2.0 + r * 40.0);
            col += vec3(step(0.996, r)) * tw * smoothstep(0.05, 0.4, h);
            // Soft aurora band.
            float band = sin(vDir.x * 4.0 + time * 0.15) * 0.08 + 0.45;
            col += vec3(0.25, 0.9, 0.8) * smoothstep(0.12, 0.0, abs(h - band)) * 0.25;
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(geom, mat);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    return sky;
  }

  private makeAbyss(th: BiomeTheme): void {
    const mat = new THREE.MeshBasicMaterial({ color: th.abyssColor, fog: true });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -22;
    this.distant.add(plane);
    // Glow haze just above the floor.
    const glowMat = new THREE.MeshBasicMaterial({ color: th.abyssGlow, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending });
    const haze = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), glowMat);
    haze.rotation.x = -Math.PI / 2;
    haze.position.y = -14;
    this.distant.add(haze);
  }

  private makeDistant(th: BiomeTheme, biome: string): void {
    const rng = new Rng(77);
    const count = this.quality === 'low' ? 18 : 34;
    const mats = th.decorPalette.slice(0, 3).map((c) => toon(new THREE.Color(c).lerp(new THREE.Color(th.fogColor), 0.45).getStyle()));
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rng.range(-0.08, 0.08);
      const r = rng.range(170, 260);
      const h = rng.range(30, 85);
      let geom: THREE.BufferGeometry;
      if (biome === 'canyon') geom = new THREE.CylinderGeometry(rng.range(14, 28), rng.range(18, 34), h, 7);
      else if (biome === 'crystal') geom = new THREE.OctahedronGeometry(1, 0);
      else geom = new THREE.ConeGeometry(rng.range(20, 36), h, 7);
      const mesh = new THREE.Mesh(geom, mats[i % mats.length]);
      if (biome === 'crystal') mesh.scale.set(rng.range(10, 18), h * 0.7, rng.range(10, 18));
      mesh.position.set(Math.cos(a) * r, -18 + h / 2, Math.sin(a) * r);
      mesh.rotation.y = rng.range(0, 3);
      this.distant.add(mesh);
    }
    // Clouds (day biomes) as instanced puffs.
    if (!th.night) {
      const puff = new THREE.SphereGeometry(1, 10, 8);
      const mat = toon('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.25 });
      for (let i = 0; i < (this.quality === 'low' ? 8 : 16); i++) {
        const cloud = new THREE.Group();
        for (let j = 0; j < 5; j++) {
          const p = new THREE.Mesh(puff, mat);
          p.scale.setScalar(rng.range(3, 6));
          p.position.set(j * 4 - 8, rng.range(-1, 1.5), rng.range(-2, 2));
          cloud.add(p);
        }
        cloud.position.set(rng.range(-220, 220), rng.range(40, 75), rng.range(-220, 220));
        this.distant.add(cloud);
        this.animated.push({ obj: cloud, kind: 'cloud', phase: rng.range(0, 10), base: cloud.position.x });
      }
    }
  }

  private scatterScenery(track: Track, path: TrackPath, th: BiomeTheme, biome: string): void {
    const rng = new Rng(track.data.seed * 31 + 5);
    const density = this.quality === 'low' ? 0.45 : this.quality === 'medium' ? 0.75 : 1;
    const kinds = sceneryKinds(biome, th);
    const transforms: THREE.Matrix4[][] = kinds.map(() => []);
    const islandTransforms: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();
    for (let s = -35; s < track.length + 70; s += rng.range(3.5, 7) / density) {
      for (const side of [-1, 1]) {
        if (!rng.chance(0.8)) continue;
        const lateral = side * rng.range(6.5, 26);
        const baseY = track.baseline(s) + (Math.abs(lateral) < 10 ? rng.range(-1.6, -0.4) : rng.range(-7, 1));
        path.toWorld(s, lateral, baseY, tmpV);
        // Island under the cluster.
        const islandR = rng.range(2.2, 4.2);
        dummy.position.copy(tmpV);
        dummy.rotation.set(0, rng.range(0, 6.28), 0);
        dummy.scale.set(islandR, islandR * rng.range(0.9, 1.5), islandR);
        dummy.updateMatrix();
        islandTransforms.push(dummy.matrix.clone());
        const items = rng.int(1, 3);
        for (let k = 0; k < items; k++) {
          const ki = rng.int(0, kinds.length - 1);
          const kind = kinds[ki];
          dummy.position.set(tmpV.x + rng.range(-1.4, 1.4), tmpV.y, tmpV.z + rng.range(-1.4, 1.4));
          dummy.rotation.set(0, rng.range(0, 6.28), 0);
          const sc = rng.range(kind.minScale, kind.maxScale);
          dummy.scale.setScalar(sc);
          dummy.updateMatrix();
          transforms[ki].push(dummy.matrix.clone());
        }
      }
    }
    // Islands.
    const islandGeom = islandGeometry();
    const islandMat = [toon(th.groundTop), toon(th.groundSide)];
    const islands = new THREE.InstancedMesh(islandGeom, islandMat, islandTransforms.length);
    islandTransforms.forEach((m, i) => islands.setMatrixAt(i, m));
    islands.receiveShadow = true;
    this.group.add(islands);
    kinds.forEach((kind, i) => {
      if (transforms[i].length === 0) return;
      for (const part of kind.parts) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, transforms[i].length);
        transforms[i].forEach((m, j) => mesh.setMatrixAt(j, m));
        mesh.castShadow = this.quality === 'high';
        mesh.receiveShadow = false;
        this.group.add(mesh);
      }
    });
    // A few big floating landmarks.
    for (let i = 0; i < 6; i++) {
      const s = (track.length / 6) * (i + 0.5);
      const lm = landmark(biome, th, rng);
      path.toWorld(s, (i % 2 ? 1 : -1) * rng.range(38, 60), track.baseline(s) + rng.range(4, 14), lm.position);
      this.group.add(lm);
      this.animated.push({ obj: lm, kind: 'float', phase: rng.range(0, 6), base: lm.position.y });
    }
  }

  private makeParticles(th: BiomeTheme): { points: THREE.Points; base: Float32Array } {
    const n = this.quality === 'high' ? 260 : 140;
    const pos = new Float32Array(n * 3);
    const rng = new Rng(9);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rng.range(-30, 30);
      pos[i * 3 + 1] = rng.range(-2, 12);
      pos[i * 3 + 2] = rng.range(-50, 10);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos.slice(), 3));
    const mat = new THREE.PointsMaterial({
      color: th.particleColor,
      size: 0.35,
      map: glowTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.85,
    });
    const points = new THREE.Points(g, mat);
    points.frustumCulled = false;
    return { points, base: pos };
  }

  /** Per-frame: keeps the shadow camera and ambient particles around the focus point. */
  update(t: number, focus: THREE.Vector3, heading: number): void {
    (this.sky.material as THREE.ShaderMaterial).uniforms.time.value = t;
    this.sky.position.copy(focus);
    this.distant.position.set(focus.x, 0, focus.z);
    this.sun.position.set(focus.x + 14, focus.y + 26, focus.z + 10);
    this.sun.target.position.set(focus.x - Math.sin(heading) * -6, focus.y, focus.z - Math.cos(heading) * 6);
    if (this.particles && this.particleBase) {
      this.particles.position.copy(focus);
      this.particles.rotation.y = -heading;
      const attr = this.particles.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      const base = this.particleBase;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] = base[i] + Math.sin(t * 0.6 + i) * 0.6;
        arr[i + 1] = base[i + 1] + Math.sin(t * 0.9 + i * 0.37) * 0.5;
      }
      attr.needsUpdate = true;
    }
    for (const a of this.animated) {
      if (a.kind === 'float') a.obj.position.y = a.base + Math.sin(t * 0.5 + a.phase) * 1.2;
      else if (a.kind === 'cloud') a.obj.position.x = a.base + Math.sin(t * 0.03 + a.phase) * 25;
    }
  }
}

interface SceneryKind {
  minScale: number;
  maxScale: number;
  parts: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
}

function translated(g: THREE.BufferGeometry, x: number, y: number, z: number): THREE.BufferGeometry {
  g.translate(x, y, z);
  return g;
}

function sceneryKinds(biome: string, th: BiomeTheme): SceneryKind[] {
  const p = th.decorPalette;
  if (biome === 'forest') {
    return [
      {
        minScale: 0.9,
        maxScale: 1.6,
        parts: [
          { geometry: translated(new THREE.CylinderGeometry(0.18, 0.26, 1.6, 6), 0, 0.8, 0), material: toon('#7a5230') },
          { geometry: translated(new THREE.ConeGeometry(1.2, 2.0, 7), 0, 2.2, 0), material: toon(p[0]) },
          { geometry: translated(new THREE.ConeGeometry(0.9, 1.6, 7), 0, 3.2, 0), material: toon(p[1]) },
        ],
      },
      {
        minScale: 0.8,
        maxScale: 1.4,
        parts: [
          { geometry: translated(new THREE.CylinderGeometry(0.2, 0.3, 1.8, 6), 0, 0.9, 0), material: toon('#8a5a36') },
          { geometry: translated(new THREE.IcosahedronGeometry(1.25, 1), 0, 2.5, 0), material: toon(p[2]) },
        ],
      },
      {
        minScale: 0.6,
        maxScale: 1.2,
        parts: [
          { geometry: translated(new THREE.CylinderGeometry(0.12, 0.16, 0.6, 8), 0, 0.3, 0), material: toon('#f6e7c8') },
          { geometry: translated(new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.55, 0), material: toon(p[3]) },
        ],
      },
      {
        minScale: 0.6,
        maxScale: 1.3,
        parts: [{ geometry: translated(new THREE.IcosahedronGeometry(0.7, 0), 0, 0.4, 0), material: toon(p[1]) }],
      },
      {
        minScale: 0.5,
        maxScale: 1.0,
        parts: [{ geometry: translated(new THREE.DodecahedronGeometry(0.5, 0), 0, 0.3, 0), material: toon('#9aa0a8') }],
      },
    ];
  }
  if (biome === 'canyon') {
    return [
      {
        minScale: 0.8,
        maxScale: 1.8,
        parts: [
          { geometry: translated(new THREE.CylinderGeometry(1.2, 1.5, 3.2, 7), 0, 1.6, 0), material: toon(p[0]) },
          { geometry: translated(new THREE.CylinderGeometry(1.25, 1.25, 0.4, 7), 0, 2.4, 0), material: toon(p[1]) },
        ],
      },
      {
        minScale: 0.7,
        maxScale: 1.3,
        parts: [
          { geometry: translated(new THREE.CapsuleGeometry(0.28, 1.6, 4, 8), 0, 1.0, 0), material: toon(p[3]) },
          { geometry: translated(new THREE.CapsuleGeometry(0.17, 0.5, 4, 8).rotateZ(1.2), 0.45, 1.3, 0), material: toon(p[3]) },
          { geometry: translated(new THREE.CapsuleGeometry(0.15, 0.4, 4, 8).rotateZ(-1.1), -0.4, 1.0, 0), material: toon(p[3]) },
        ],
      },
      {
        minScale: 0.6,
        maxScale: 1.4,
        parts: [{ geometry: translated(new THREE.DodecahedronGeometry(0.8, 0), 0, 0.5, 0), material: toon(p[2]) }],
      },
      {
        // Hoodoo: stacked sandstone rocks.
        minScale: 0.6,
        maxScale: 1.3,
        parts: [
          { geometry: translated(new THREE.CylinderGeometry(0.45, 0.6, 1.0, 7), 0, 0.5, 0), material: toon(p[1]) },
          { geometry: translated(new THREE.CylinderGeometry(0.32, 0.42, 0.8, 7), 0, 1.4, 0), material: toon(p[0]) },
          { geometry: translated(new THREE.CylinderGeometry(0.55, 0.3, 0.35, 7), 0, 1.95, 0), material: toon(p[2]) },
        ],
      },
    ];
  }
  return [
    {
      minScale: 0.7,
      maxScale: 1.6,
      parts: [
        { geometry: translated(new THREE.OctahedronGeometry(0.5, 0).scale(1, 2.6, 1), 0, 1.2, 0), material: toon(p[0], { emissive: p[0], emissiveIntensity: 0.7 }) },
        { geometry: translated(new THREE.OctahedronGeometry(0.35, 0).scale(1, 2.2, 1).rotateZ(0.5), 0.5, 0.7, 0), material: toon(p[1], { emissive: p[1], emissiveIntensity: 0.7 }) },
        { geometry: translated(new THREE.OctahedronGeometry(0.3, 0).scale(1, 2.0, 1).rotateZ(-0.6), -0.45, 0.6, 0.1), material: toon(p[2], { emissive: p[2], emissiveIntensity: 0.6 }) },
      ],
    },
    {
      minScale: 0.6,
      maxScale: 1.2,
      parts: [
        { geometry: translated(new THREE.CylinderGeometry(0.1, 0.14, 0.9, 8), 0, 0.45, 0), material: toon('#e9e2ff') },
        { geometry: translated(new THREE.SphereGeometry(0.55, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.85, 0), material: toon(p[3], { emissive: p[3], emissiveIntensity: 0.9 }) },
      ],
    },
    {
      minScale: 0.6,
      maxScale: 1.3,
      parts: [{ geometry: translated(new THREE.DodecahedronGeometry(0.7, 0), 0, 0.4, 0), material: toon(p[5]) }],
    },
  ];
}

function islandGeometry(): THREE.BufferGeometry {
  // A grassy top disc with a rocky cone underneath (two groups for two materials).
  const top = new THREE.CylinderGeometry(1, 0.95, 0.35, 9);
  top.translate(0, -0.17, 0);
  const bottom = new THREE.ConeGeometry(0.95, 1.8, 9);
  bottom.rotateX(Math.PI);
  bottom.translate(0, -1.25, 0);
  const merged = new THREE.BufferGeometry();
  const geoms = [top, bottom].map((g) => g.toNonIndexed());
  const total = geoms.reduce((n, g) => n + g.getAttribute('position').count, 0);
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  let offset = 0;
  geoms.forEach((g, i) => {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    pos.set(p.array as Float32Array, offset * 3);
    nor.set(n.array as Float32Array, offset * 3);
    merged.addGroup(offset, p.count, i);
    offset += p.count;
  });
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return merged;
}

function landmark(biome: string, th: BiomeTheme, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const island = new THREE.Mesh(islandGeometry(), [toon(th.groundTop), toon(th.groundSide)]);
  island.scale.set(7, 6, 7);
  g.add(island);
  if (biome === 'forest') {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 9, 8), toon('#7a5230'));
    trunk.position.y = 4.5;
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(5, 1), toon(th.decorPalette[rng.int(0, 2)]));
    crown.position.y = 11;
    g.add(trunk, crown);
  } else if (biome === 'canyon') {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(5, 1.4, 6, 12, Math.PI), toon(th.decorPalette[0]));
    arch.position.y = 0.5;
    g.add(arch);
  } else {
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(3, 0), toon(th.decorPalette[rng.int(0, 2)], { emissive: th.decorPalette[0], emissiveIntensity: 0.8 }));
    crystal.scale.set(1, 2.4, 1);
    crystal.position.y = 7;
    g.add(crystal);
  }
  return g;
}
