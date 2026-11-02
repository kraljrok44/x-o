// Builds the 3D world for a map definition and provides collision / ground queries.
import * as THREE from './lib/three.module.min.js';
import { mulberry32, smoothstep, clamp, lerp, makeNoise } from './util.js';

const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

function noiseTexture(size = 256, seed = 7) {
  const N = makeNoise(seed);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // tileable by sampling on a torus
    const a = (x / size) * Math.PI * 2, b = (y / size) * Math.PI * 2;
    const v = N.fbm(Math.cos(a) * 1.6 + 5, Math.sin(a) * 1.6 + Math.cos(b) * 1.6, 5) * 0.5 +
      N.n2(Math.sin(b) * 9 + Math.cos(a) * 9, Math.cos(b) * 9) * 0.25;
    const g = clamp(128 + v * 140, 0, 255);
    const i = (y * size + x) * 4;
    img.data[i] = g; img.data[i + 1] = clamp(128 + N.n2(x * 0.21, y * 0.21) * 90, 0, 255); img.data[i + 2] = g; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}

let sharedDetail = null;

// Concatenate non-indexed geometries with a flat color per part.
function mergeColored(parts) {
  let count = 0;
  const geos = parts.map(([g, col]) => { const ng = g.index ? g.toNonIndexed() : g; ng.computeVertexNormals(); count += ng.attributes.position.count; return [ng, col]; });
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), colA = new Float32Array(count * 3);
  let o = 0;
  for (const [g, col] of geos) {
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    pos.set(p, o * 3); nor.set(n, o * 3);
    const c = new THREE.Color(col);
    for (let i = 0; i < g.attributes.position.count; i++) { colA[(o + i) * 3] = c.r; colA[(o + i) * 3 + 1] = c.g; colA[(o + i) * 3 + 2] = c.b; }
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(colA, 3));
  return out;
}

function treeGeometry(kind) {
  if (kind === 'pine') {
    const trunk = new THREE.CylinderGeometry(0.03, 0.05, 0.3, 5); trunk.translate(0, 0.15, 0);
    const c1 = new THREE.ConeGeometry(0.32, 0.6, 7); c1.translate(0, 0.45, 0);
    const c2 = new THREE.ConeGeometry(0.22, 0.45, 7); c2.translate(0, 0.78, 0);
    return mergeColored([[trunk, 0x4a3426], [c1, 0x2b4a2a], [c2, 0x335a30]]);
  }
  if (kind === 'palm') {
    const trunk = new THREE.CylinderGeometry(0.025, 0.04, 0.9, 5); trunk.translate(0, 0.45, 0);
    const parts = [[trunk, 0x7a6248]];
    for (let i = 0; i < 6; i++) {
      const l = new THREE.ConeGeometry(0.05, 0.42, 3); l.rotateZ(Math.PI / 2 + 0.5); l.translate(0.2, 0.88, 0); l.rotateY((i / 6) * Math.PI * 2);
      parts.push([l, 0x3f6e2c]);
    }
    return mergeColored(parts);
  }
  if (kind === 'bush') {
    const b = new THREE.IcosahedronGeometry(0.5, 0); b.scale(1, 0.6, 1); b.translate(0, 0.25, 0);
    return mergeColored([[b, 0x6b6a3a]]);
  }
  // broadleaf
  const trunk = new THREE.CylinderGeometry(0.035, 0.05, 0.45, 5); trunk.translate(0, 0.22, 0);
  const crown = new THREE.IcosahedronGeometry(0.33, 0); crown.translate(0, 0.66, 0);
  return mergeColored([[trunk, 0x5a4330], [crown, 0x3d6b2e]]);
}

function makeWaterMaterial(kind) {
  const ocean = kind === 'ocean';
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(1, 1, 1) },
    uSky: { value: new THREE.Color(0.6, 0.7, 0.9) }, uDeep: { value: new THREE.Color(ocean ? 0x0a3355 : 0x123c48) },
    uShallow: { value: new THREE.Color(ocean ? 0x2fc4c0 : 0x3a8a8a) }, uAmp: { value: ocean ? 0.9 : 0.15 }, uFoam: { value: ocean ? 0.8 : 0.15 }, uRipple: { value: ocean ? 0.5 : 0.22 },
  }]);
  return new THREE.ShaderMaterial({
    uniforms, transparent: true, fog: true, depthWrite: true,
    vertexShader: /* glsl */`
      attribute float depth;
      uniform float uTime; uniform float uAmp;
      varying float vDepth; varying vec3 vWorld; varying vec3 vNormal2;
      #include <fog_pars_vertex>
      void main(){
        vec3 p = position;
        vec4 wp = modelMatrix * vec4(p,1.0);
        float k1 = 0.035, k2 = 0.06, k3 = 0.11;
        float a = uAmp * clamp(depth/6.0, 0.15, 1.0);
        float w = sin(wp.x*k1 + uTime*0.9) * a + sin((wp.x*0.6+wp.z*0.8)*k2 + uTime*1.3)*a*0.6 + sin((wp.z - wp.x*0.3)*k3 + uTime*1.9)*a*0.3;
        wp.y += w;
        float dx = cos(wp.x*k1 + uTime*0.9)*a*k1 + cos((wp.x*0.6+wp.z*0.8)*k2 + uTime*1.3)*a*0.6*k2*0.6 - cos((wp.z - wp.x*0.3)*k3 + uTime*1.9)*a*0.3*k3*0.3;
        float dz = cos((wp.x*0.6+wp.z*0.8)*k2 + uTime*1.3)*a*0.6*k2*0.8 + cos((wp.z - wp.x*0.3)*k3 + uTime*1.9)*a*0.3*k3;
        vNormal2 = normalize(vec3(-dx, 1.0, -dz));
        vDepth = depth; vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uSky; uniform vec3 uDeep; uniform vec3 uShallow; uniform float uFoam; uniform float uRipple;
      varying float vDepth; varying vec3 vWorld; varying vec3 vNormal2;
      #include <fog_pars_fragment>
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec2 q = vWorld.xz*0.08;
        float r1 = vn(q + vec2(uTime*0.3, uTime*0.2)), r2 = vn(q*2.3 - vec2(uTime*0.25, -uTime*0.4));
        vec3 n = normalize(vNormal2 + vec3((r1-0.5)*0.35 + (r2-0.5)*0.2, 0.0, (r2-0.5)*0.35 - (r1-0.5)*0.15) * uRipple);
        vec3 v = normalize(cameraPosition - vWorld);
        float fres = 0.04 + 0.96*pow(1.0 - max(dot(n, v), 0.0), 5.0);
        vec3 base = mix(uShallow, uDeep, smoothstep(0.0, 28.0, vDepth));
        vec3 refl = uSky * 1.05;
        vec3 col = mix(base * (0.35 + 0.65*max(uSunDir.y,0.15)), refl, fres*0.85);
        vec3 hv = normalize(uSunDir + v);
        float spec = pow(max(dot(n, hv), 0.0), 220.0) * 1.2 + pow(max(dot(n, hv), 0.0), 40.0)*0.1;
        col += uSunColor * spec;
        float foam = (1.0 - smoothstep(0.0, 1.2, vDepth)) * (0.5 + 0.5*sin(uTime*1.5 + vWorld.x*0.08 + vWorld.z*0.05)) * uFoam;
        col = mix(col, vec3(0.95), clamp(foam,0.0,1.0)*0.8);
        float alpha = mix(0.55, 0.96, smoothstep(0.0, 7.0, vDepth));
        gl_FragColor = vec4(col, max(alpha, foam*0.9));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

function cloudTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const rnd = mulberry32(42);
  for (let i = 0; i < 26; i++) {
    const x = 30 + rnd() * 68, y = 40 + rnd() * 50, r = 14 + rnd() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function beaconTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 128, 0, 0);
  g.addColorStop(0, 'rgba(255,170,60,0.75)'); g.addColorStop(0.4, 'rgba(255,150,50,0.25)'); g.addColorStop(1, 'rgba(255,140,40,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class World {
  constructor(scene, def, quality) {
    this.scene = scene; this.def = def; this.quality = quality;
    this.group = new THREE.Group();
    this.time = 0;
    this.trees = []; this.treeGrid = new Map(); this.boxGrid = new Map(); this.boxes = [];
    this.arches = [];
    this.animated = [];
    scene.add(this.group);
  }

  async build(progress = () => {}) {
    const def = this.def;
    const res = { low: 224, medium: 320, high: 448 }[this.quality] || 320;
    const S = def.size;
    this.N = res; this.S = S; this.cell = (2 * S) / res;
    def.cell = this.cell;
    const n1 = res + 1;
    const H = new Float32Array(n1 * n1);
    for (let j = 0; j < n1; j++) {
      const z = -S + j * this.cell;
      for (let i = 0; i < n1; i++) H[j * n1 + i] = def.height(-S + i * this.cell, z);
      if (j % 24 === 0) { progress(0.05 + 0.5 * j / n1); await yieldFrame(); }
    }
    this.H = H;
    // far ring heights
    const FR = 128, FS = S * 4;
    this.FR = FR; this.FS = FS; this.fcell = (2 * FS) / FR;
    const fn = FR + 1;
    const FH = new Float32Array(fn * fn);
    for (let j = 0; j < fn; j++) for (let i = 0; i < fn; i++) FH[j * fn + i] = def.height(-FS + i * this.fcell, -FS + j * this.fcell) - 20;
    this.FH = FH;
    progress(0.6); await yieldFrame();
    this.buildTerrainMesh();
    progress(0.7); await yieldFrame();
    if (def.water) this.buildWater();
    if (def.trees) this.buildTrees();
    progress(0.8); await yieldFrame();
    if (def.rocks) this.buildRocks();
    if (def.arches) this.buildArches();
    if (def.buildings) this.buildCity();
    this.buildLandingMarker();
    this.buildExitMarker();
    this.buildClouds();
    this.buildBirds();
    progress(0.95); await yieldFrame();
  }

  // ------------------------------------------------------------ queries
  terrainHeight(x, z) {
    const S = this.S;
    if (x > -S && x < S && z > -S && z < S) return this._sample(this.H, this.N, S, this.cell, x, z);
    const FS = this.FS;
    if (x > -FS && x < FS && z > -FS && z < FS) return this._sample(this.FH, this.FR, FS, this.fcell, x, z);
    return -100;
  }
  _sample(H, N, S, cell, x, z) {
    const gx = (x + S) / cell, gz = (z + S) / cell;
    let i = Math.floor(gx), j = Math.floor(gz);
    if (i >= N) i = N - 1; if (j >= N) j = N - 1;
    const fx = gx - i, fz = gz - j, n1 = N + 1;
    const a = H[j * n1 + i], b = H[j * n1 + i + 1], c = H[(j + 1) * n1 + i], d = H[(j + 1) * n1 + i + 1];
    if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
    return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  }
  // Ground including roofs and water surface. Returns {h, water, roof}
  ground(x, z, out = { h: 0, water: false, roof: false }) {
    let h = this.terrainHeight(x, z);
    out.water = false; out.roof = false;
    if (this.def.water && h < this.def.water.y) { h = this.def.water.y; out.water = true; }
    if (this.boxes.length) {
      const arr = this.boxGrid.get(this._key(Math.floor(x / 60), Math.floor(z / 60)));
      if (arr) for (const b of arr) {
        if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.y0 < 5 && b.y1 > h) { h = b.y1; out.roof = true; out.water = false; out.box = b; }
      }
    }
    out.h = h;
    return out;
  }
  _key(cx, cz) { return cx * 92821 + cz * 68917; }

  // Sphere collision test. Returns null or {type}
  collide(p, r) {
    const th = this.terrainHeight(p.x, p.z);
    if (p.y - r < th) return { type: 'terrain', h: th };
    if (this.def.water && p.y - r * 0.5 < this.def.water.y) return { type: 'water', h: this.def.water.y };
    // trees
    const cx = Math.floor(p.x / 40), cz = Math.floor(p.z / 40);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const arr = this.treeGrid.get(this._key(cx + a, cz + b));
      if (!arr) continue;
      for (const t of arr) {
        if (p.y > t.y + t.h + r || p.y < t.y - r) continue;
        const d = Math.hypot(p.x - t.x, p.z - t.z);
        const rad = t.rad * (1 - clamp((p.y - t.y) / t.h, 0, 1)) + 0.4;
        if (d < rad + r) return { type: 'tree' };
      }
    }
    // boxes
    if (this.boxes.length) {
      const arr = this.boxGrid.get(this._key(Math.floor(p.x / 60), Math.floor(p.z / 60)));
      if (arr) for (const b of arr) {
        const qx = clamp(p.x, b.x0, b.x1), qy = clamp(p.y, b.y0, b.y1), qz = clamp(p.z, b.z0, b.z1);
        const dx = p.x - qx, dy = p.y - qy, dz = p.z - qz;
        if (dx * dx + dy * dy + dz * dz < r * r) return { type: b.kind === 'bridge' ? 'bridge' : 'building', box: b, top: b.y1 };
      }
    }
    for (const a of this.arches) {
      const dx = p.x - a.c.x, dy = p.y - a.c.y, dz = p.z - a.c.z;
      if (dy < 0) continue;
      const lx = dx * a.rx + dz * a.rz, lz = dx * a.fx + dz * a.fz;
      const q = Math.hypot(lx, dy) - a.R;
      if (Math.hypot(q, lz) - a.r < r) return { type: 'rock' };
    }
    return null;
  }

  // Approximate clearance to nearest obstacle (downward + forward + lateral probes).
  clearance(p, v) {
    const agl = p.y - this.ground(p.x, p.z).h;
    let best = agl;
    const sp = Math.hypot(v.x, v.y, v.z) || 1;
    const fx = v.x / sp, fy = v.y / sp, fz = v.z / sp;
    // lateral axis
    let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    const dirs = [[fx, fy, fz], [rx, 0, rz], [-rx, 0, -rz], [fx * 0.7 + rx * 0.7, fy * 0.7, fz * 0.7 + rz * 0.7], [fx * 0.7 - rx * 0.7, fy * 0.7, fz * 0.7 - rz * 0.7]];
    const tmp = { x: 0, y: 0, z: 0 };
    for (const d of dirs) {
      for (let t = 3; t < Math.min(best, 45); t += 3) {
        tmp.x = p.x + d[0] * t; tmp.y = p.y + d[1] * t; tmp.z = p.z + d[2] * t;
        if (this.collide(tmp, 0.5)) { best = Math.min(best, t); break; }
      }
    }
    return { agl, clr: Math.max(0, best) };
  }

  // ------------------------------------------------------------ building
  buildTerrainMesh() {
    const def = this.def, N = this.N, S = this.S, n1 = N + 1, H = this.H, cell = this.cell;
    const pos = new Float32Array(n1 * n1 * 3), col = new Float32Array(n1 * n1 * 3), nor = new Float32Array(n1 * n1 * 3), uv = new Float32Array(n1 * n1 * 2);
    const Nz = makeNoise(77);
    for (let j = 0; j < n1; j++) for (let i = 0; i < n1; i++) {
      const k = j * n1 + i, x = -S + i * cell, z = -S + j * cell, h = H[k];
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      const hl = H[j * n1 + Math.max(0, i - 1)], hr = H[j * n1 + Math.min(N, i + 1)];
      const hd = H[Math.max(0, j - 1) * n1 + i], hu = H[Math.min(N, j + 1) * n1 + i];
      const nx = hl - hr, nz = hd - hu, ny = 2 * cell;
      const l = Math.hypot(nx, ny, nz);
      nor[k * 3] = nx / l; nor[k * 3 + 1] = ny / l; nor[k * 3 + 2] = nz / l;
      const slope = 1 - ny / l; // 0 = flat, 0.29 = 45deg, 0.5 = 60deg
      const c = def.color(h, slope, x, z, Nz.fbm(x / 160, z / 160, 3));
      col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
      uv[k * 2] = x / 24; uv[k * 2 + 1] = z / 24;
    }
    this.slopeAt = (x, z) => {
      const i = clamp(Math.round((x + S) / cell), 0, N), j = clamp(Math.round((z + S) / cell), 0, N);
      return 1 - nor[(j * n1 + i) * 3 + 1];
    };
    const idx = new Uint32Array(N * N * 6);
    let o = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * n1 + i, b = a + 1, c = a + n1, d = c + 1;
      idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    if (!sharedDetail) sharedDetail = noiseTexture();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, map: sharedDetail });
    this._terrainShader(mat, !!def.city);
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true; mesh.castShadow = false;
    this.group.add(mesh);
    this.terrainMat = mat;

    // Far terrain (skip the inner region)
    const FR = this.FR, FS = this.FS, fn = FR + 1, FH = this.FH, fc = this.fcell;
    const fp = new Float32Array(fn * fn * 3), fcol = new Float32Array(fn * fn * 3), fuv = new Float32Array(fn * fn * 2);
    for (let j = 0; j < fn; j++) for (let i = 0; i < fn; i++) {
      const k = j * fn + i, x = -FS + i * fc, z = -FS + j * fc, h = FH[k];
      fp[k * 3] = x; fp[k * 3 + 1] = h; fp[k * 3 + 2] = z;
      const c = def.color(h + 20, 0.2, x, z, Nz.fbm(x / 160, z / 160, 3));
      fcol[k * 3] = c[0]; fcol[k * 3 + 1] = c[1]; fcol[k * 3 + 2] = c[2];
      fuv[k * 2] = x / 24; fuv[k * 2 + 1] = z / 24;
    }
    const fidx = [];
    for (let j = 0; j < FR; j++) for (let i = 0; i < FR; i++) {
      const x0 = -FS + i * fc, z0 = -FS + j * fc;
      if (x0 >= -S && x0 + fc <= S && z0 >= -S && z0 + fc <= S) continue;
      const a = j * fn + i, b = a + 1, c = a + fn, d = c + 1;
      fidx.push(a, c, b, b, c, d);
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    fg.setAttribute('color', new THREE.BufferAttribute(fcol, 3));
    fg.setAttribute('uv', new THREE.BufferAttribute(fuv, 2));
    fg.setIndex(fidx);
    fg.computeVertexNormals();
    const fmesh = new THREE.Mesh(fg, mat);
    this.group.add(fmesh);
  }

  _terrainShader(mat, city) {
    const park = this.def.park || { x: 1e6, z: 1e6, r: 0 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uPark = { value: new THREE.Vector3(park.x, park.z, park.r) };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz;');
      let frag = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform vec3 uPark;');
      frag = frag.replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec4 t1 = texture2D(map, vMapUv);
          vec4 t2 = texture2D(map, vMapUv * 0.113);
          vec4 t3 = texture2D(map, vMapUv * 4.1);
          float det = (t1.r - 0.5) * 0.5 + (t2.g - 0.5) * 0.6 + (t3.r - 0.5) * 0.25;
          diffuseColor.rgb *= clamp(1.0 + det, 0.55, 1.5);
        #endif
        ${city ? `
          float sx = abs(vWPos.x - floor(vWPos.x/150.0+0.5)*150.0);
          float sz = abs(vWPos.z - floor(vWPos.z/150.0+0.5)*150.0);
          float road = 1.0 - step(15.0, min(sx, sz));
          float walk = (1.0 - step(18.5, min(sx, sz))) * (1.0 - road);
          vec3 lot = vec3(0.42,0.42,0.43);
          float pk = 1.0 - smoothstep(uPark.z, uPark.z + 6.0, length(vWPos.xz - uPark.xy));
          lot = mix(lot, vec3(0.20,0.36,0.14), pk);
          vec3 c = mix(lot, vec3(0.62,0.62,0.6), walk);
          float lane = (1.0 - step(0.35, min(sx, sz))) * step(0.5, fract((sx < sz ? vWPos.z : vWPos.x) / 12.0));
          vec3 asphalt = vec3(0.16,0.16,0.17) + lane * vec3(0.7,0.65,0.4);
          float cross = step(min(sx,sz), 15.0) * step(max(sx,sz), 15.0);
          asphalt = mix(asphalt, vec3(0.17), cross);
          c = mix(c, asphalt, road * (1.0 - pk));
          diffuseColor.rgb = c * clamp(1.0 + det*0.6, 0.6, 1.4);
        ` : ''}
      `);
      sh.fragmentShader = frag;
    };
  }

  buildWater() {
    const def = this.def, wy = def.water.y;
    const ext = def.water.kind === 'ocean' ? this.FS : this.S;
    const R = def.water.kind === 'ocean' ? 200 : 220;
    const g = new THREE.PlaneGeometry(ext * 2, ext * 2, R, R);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position.array;
    const depth = new Float32Array(p.length / 3);
    for (let i = 0; i < depth.length; i++) depth[i] = Math.max(0, wy - this.terrainHeight(p[i * 3], p[i * 3 + 2]));
    g.setAttribute('depth', new THREE.BufferAttribute(depth, 1));
    // drop triangles fully under terrain to reduce overdraw
    const idx = g.index.array, keep = [];
    for (let i = 0; i < idx.length; i += 3) {
      if (depth[idx[i]] > 0 || depth[idx[i + 1]] > 0 || depth[idx[i + 2]] > 0) keep.push(idx[i], idx[i + 1], idx[i + 2]);
    }
    g.setIndex(keep);
    g.translate(0, wy, 0);
    const mat = makeWaterMaterial(def.water.kind);
    const mesh = new THREE.Mesh(g, mat);
    mesh.renderOrder = 1;
    this.group.add(mesh);
    this.waterMat = mat;
  }

  buildTrees() {
    const def = this.def, T = def.trees;
    const rnd = mulberry32(555);
    const qMul = { low: 0.3, medium: 0.6, high: 1 }[this.quality] || 0.6;
    const N = makeNoise(909);
    const list = [];
    const L = def.landing;
    const ex = def.exit;
    const addTree = (x, z, s, kind) => {
      const y = this.terrainHeight(x, z);
      list.push({ x, y, z, s, kind, h: s, rad: s * (kind === 'pine' ? 0.3 : kind === 'bush' ? 0.5 : 0.36) });
    };
    if (T.park && def.park) {
      const P = def.park;
      for (let i = 0; i < 260; i++) {
        const a = rnd() * Math.PI * 2, r = P.r * Math.sqrt(rnd());
        const x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
        if (Math.hypot(x - L.x, z - L.z) < L.r + 25) continue;
        addTree(x, z, 10 + rnd() * 8, 'broad');
      }
    } else {
      const total = Math.floor(T.count * qMul);
      let tries = 0;
      while (list.length < total && tries < total * 8) {
        tries++;
        const x = (rnd() * 2 - 1) * this.S * 0.98, z = (rnd() * 2 - 1) * this.S * 0.98;
        const h = this.terrainHeight(x, z);
        if (h < T.minH || h > T.maxH + N.n2(x / 300, z / 300) * 120) continue;
        if (def.water && h < def.water.y + 2) continue;
        if (this.slopeAt(x, z) > T.maxSlope * 0.35) continue;
        if (Math.hypot(x - L.x, z - L.z) < T.clearR) continue;
        if (Math.hypot(x - ex.x, z - ex.z) < 60) continue;
        if (N.fbm(x / 500, z / 500, 3) < (T.kind === 'bush' ? 0.0 : -0.15)) continue;
        let kind = T.kind;
        if (T.palms && h < 25) kind = 'palm';
        const sc = (T.kind === 'bush' ? 3 : 14) * (T.scale[0] + rnd() * (T.scale[1] - T.scale[0])) * (kind === 'palm' ? 1.1 : 1);
        addTree(x, z, sc, kind);
      }
      // ring of trees around the landing clearing (forest clearing feel)
      if (T.kind === 'pine' && !T.palms) {
        for (let i = 0; i < 140; i++) {
          const a = rnd() * Math.PI * 2, r = L.r * (1.35 + rnd() * 0.9);
          addTree(L.x + Math.cos(a) * r, L.z + Math.sin(a) * r, 12 + rnd() * 10, 'pine');
        }
      }
    }
    const kinds = {};
    for (const t of list) (kinds[t.kind] ||= []).push(t);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const kind in kinds) {
      const arr = kinds[kind];
      const geo = treeGeometry(kind);
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
      this._swayShader(mat);
      const mesh = new THREE.InstancedMesh(geo, mat, arr.length);
      const tint = new THREE.Color();
      arr.forEach((t, i) => {
        q.setFromAxisAngle(up, rnd() * Math.PI * 2);
        sc.set(t.s * (0.85 + rnd() * 0.3), t.s, t.s * (0.85 + rnd() * 0.3));
        ps.set(t.x, t.y - 0.3, t.z);
        m4.compose(ps, q, sc);
        mesh.setMatrixAt(i, m4);
        const v = 0.75 + rnd() * 0.45;
        tint.setRGB(v * (0.9 + rnd() * 0.2), v, v * (0.85 + rnd() * 0.2));
        mesh.setColorAt(i, tint);
      });
      mesh.castShadow = this.quality !== 'low';
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    for (const t of list) {
      const k = this._key(Math.floor(t.x / 40), Math.floor(t.z / 40));
      let a = this.treeGrid.get(k); if (!a) { a = []; this.treeGrid.set(k, a); }
      a.push(t);
    }
    this.trees = list;
  }

  _swayShader(mat) {
    const world = this;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = { get value() { return world.time; } };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x*0.05 + instanceMatrix[3].z*0.07;
          float sw = (sin(uTime*1.4 + ph) + 0.5*sin(uTime*2.7 + ph*1.7)) * 0.035 * max(position.y, 0.0);
          transformed.x += sw; transformed.z += sw*0.6;
          #endif`);
    };
  }

  buildRocks() {
    const R = this.def.rocks, rnd = mulberry32(31);
    const count = Math.floor(R.count * ({ low: 0.4, medium: 0.7, high: 1 }[this.quality] || 0.7));
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({ color: this.def.id === 'redstone' ? 0x9a5a3a : 0x777370, roughness: 1, flatShading: true });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    let n = 0;
    for (let i = 0; i < count * 5 && n < count; i++) {
      const x = (rnd() * 2 - 1) * this.S, z = (rnd() * 2 - 1) * this.S;
      if (this.slopeAt(x, z) < R.minSlope * 0.2) continue;
      const h = this.terrainHeight(x, z);
      if (this.def.water && h < this.def.water.y) continue;
      if (Math.hypot(x - this.def.landing.x, z - this.def.landing.z) < this.def.landing.r + 10) continue;
      const sz = 1 + rnd() * rnd() * 5;
      e.set(rnd() * 3, rnd() * 3, rnd() * 3); q.setFromEuler(e);
      s.set(sz * (0.8 + rnd() * 0.6), sz * (0.5 + rnd() * 0.5), sz * (0.8 + rnd() * 0.6));
      p.set(x, h + sz * 0.2, z);
      m4.compose(p, q, s); mesh.setMatrixAt(n++, m4);
    }
    mesh.count = n;
    mesh.castShadow = this.quality === 'high';
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  buildArches() {
    const def = this.def, Rt = def.route;
    const N = makeNoise(4242);
    for (const a of def.arches) {
      const s = a.s * Rt.L;
      const p = Rt.line.at(s);
      const ry = Rt.routeY(s);
      const cy = a.sea ? -6 : ry - def.carve.clearance * (1 - smoothstep(0.76 * Rt.L, Rt.L, s));
      const R = ry + a.clearAbove - cy + a.r;
      const geo = new THREE.TorusGeometry(R, a.r, 12, 56, Math.PI);
      const pa = geo.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
        const d = N.fbm(x / 18, y / 18 + z / 18, 3) * 3.0;
        const l = Math.hypot(x, y) || 1;
        pa.setXYZ(i, x + (x / l) * d, y + (y / l) * d * 0.6, z * (1.25 + N.n2(x / 30, y / 30) * 0.25));
      }
      geo.computeVertexNormals();
      const col = def.id === 'redstone' ? 0xb0603a : 0x4a4846;
      const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.95, flatShading: true, map: sharedDetail });
      const mesh = new THREE.Mesh(geo, mat);
      // Torus lies in XY plane with axis Z. Rotate so its axis = route tangent.
      const heading = Math.atan2(p.dx, p.dz);
      mesh.rotation.y = heading;
      mesh.position.set(p.x, cy, p.z);
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.group.add(mesh);
      // local frame for collision: x axis = right, z axis = tangent
      const fx = p.dx, fz = p.dz;
      this.arches.push({ c: new THREE.Vector3(p.x, cy, p.z), R, r: a.r * 1.05, rx: Math.cos(heading), rz: -Math.sin(heading), fx, fz });
    }
  }

  buildCity() {
    const B = this.def.buildings;
    this.boxes = B;
    for (const b of B) {
      const x0 = Math.floor(b.x0 / 60), x1 = Math.floor(b.x1 / 60), z0 = Math.floor(b.z0 / 60), z1 = Math.floor(b.z1 / 60);
      for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
        const k = this._key(i, j); let a = this.boxGrid.get(k); if (!a) { a = []; this.boxGrid.set(k, a); } a.push(b);
      }
    }
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    const groups = { building: [], tower: [], antenna: [], bridge: [] };
    for (const b of B) groups[b.kind].push(b);
    const world = this;
    const facade = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.2 });
    facade.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = { get value() { return world.night || 0; } };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNor;')
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          vec4 wpp = vec4(transformed,1.0);
          #ifdef USE_INSTANCING
          wpp = instanceMatrix * wpp;
          #endif
          vWPos = (modelMatrix * wpp).xyz;
          vWNor = normalize(mat3(modelMatrix) * objectNormal);`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNor; uniform float uNight;\nfloat hh(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}')
        .replace('#include <map_fragment>', `
          float isWall = step(abs(vWNor.y), 0.5);
          float u = abs(vWNor.x) > 0.5 ? vWPos.z : vWPos.x;
          vec2 cellId = vec2(floor(u/3.2), floor(vWPos.y/3.8));
          float wx = fract(u/3.2), wy = fract(vWPos.y/3.8);
          float win = isWall * step(0.1, wx) * step(wx, 0.9) * step(0.18, wy) * step(wy, 0.86) * step(4.0, vWPos.y);
          vec3 glass = vec3(0.10,0.14,0.20);
          diffuseColor.rgb = mix(diffuseColor.rgb * vec3(0.75), glass, win);
          float lit = step(0.8, hh(cellId + floor(vWPos.xz/40.0))) * win * uNight;
        `)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.06, win);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.9, win);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0,0.75,0.45) * lit * 0.55;');
    };
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    const make = (arr, mat, colorFn) => {
      if (!arr.length) return;
      const mesh = new THREE.InstancedMesh(box, mat, arr.length);
      arr.forEach((b, i) => {
        p.set((b.x0 + b.x1) / 2, b.y0, (b.z0 + b.z1) / 2); s.set(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0);
        m4.compose(p, q, s); mesh.setMatrixAt(i, m4);
        if (colorFn) mesh.setColorAt(i, colorFn(b, c));
      });
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    };
    const tones = [0xc9c4ba, 0x8c96a3, 0xd8d2c4, 0x6f7a86, 0xb3a58f, 0x9fb0bf, 0x7d7b78];
    make([...groups.building, ...groups.tower], facade, (b, col) => col.set(tones[Math.floor((b.tone || 0) * tones.length) % tones.length]));
    make(groups.antenna, new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.5, metalness: 0.7 }));
    make(groups.bridge, new THREE.MeshStandardMaterial({ color: 0x9ab8d0, roughness: 0.15, metalness: 0.7 }));
    // helipad marking
    const hp = this.def.helipad;
    if (hp) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(10, 12, 32), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(hp.x, hp.h + 0.15, hp.z); this.group.add(ring);
    }
  }

  buildLandingMarker() {
    const L = this.def.landing;
    this.addTarget(L.x, L.y, L.z, L.r);
  }
  addTarget(x, y, z, r) {
    const T = new THREE.Group();
    const g = new THREE.Group();
    const mk = (r0, r1, color, op) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
      m.rotation.x = -Math.PI / 2; g.add(m);
    };
    mk(r * 0.94, r, 0xffffff, 0.8); mk(r * 0.62, r * 0.68, 0xff8a2a, 0.85); mk(r * 0.28, r * 0.34, 0xffffff, 0.85); mk(0, r * 0.08, 0xff5a1a, 0.95);
    g.position.set(x, y + 0.25, z);
    T.add(g);
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(3, r * 0.12), Math.max(3, r * 0.12), 600, 12, 1, true),
      new THREE.MeshBasicMaterial({ map: beaconTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    beacon.position.set(x, y + 300, z);
    T.add(beacon);
    // windsock
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6, 6), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
    pole.position.set(x + r * 1.1, y + 3, z); T.add(pole);
    const sock = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.5, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0xff6a1a, side: THREE.DoubleSide }));
    sock.geometry.rotateX(-Math.PI / 2); sock.geometry.translate(0, 0, 1.25);
    sock.position.set(x + r * 1.1, y + 5.6, z); T.add(sock);
    this.socks = this.socks || [];
    this.socks.push(sock);
    this.group.add(T);
    return T;
  }

  buildExitMarker() {
    const e = this.def.exit;
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 6), new THREE.MeshStandardMaterial({ color: 0xbbbbbb, metalness: 0.6 }));
    pole.position.y = 1.5; g.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), new THREE.MeshStandardMaterial({ color: 0xff7a1a, side: THREE.DoubleSide }));
    flag.position.set(0.6, 2.6, 0); g.add(flag);
    this.flag = flag;
    const sx = e.x + Math.cos(e.heading) * 4 - Math.sin(e.heading) * 4, sz = e.z - Math.sin(e.heading) * 4 - Math.cos(e.heading) * 4;
    g.position.set(sx, this.ground(sx, sz).h, sz);
    this.group.add(g);
  }

  buildClouds() {
    const def = this.def;
    const tex = cloudTexture();
    this.cloudMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: true, opacity: 0.9 });
    const rnd = mulberry32(77);
    this.clouds = new THREE.Group();
    const n = { low: 40, medium: 80, high: 130 }[this.quality] || 80;
    const top = def.H0 + 500;
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(this.cloudMat);
      const sz = 250 + rnd() * 650;
      s.scale.set(sz, sz * 0.45, 1);
      const low = rnd() < 0.35;
      s.position.set((rnd() * 2 - 1) * this.S * 1.6, low ? def.H0 * (0.45 + rnd() * 0.3) : top + rnd() * 600, (rnd() * 2 - 1) * this.S * 1.6);
      // keep low clouds away from the route corridor at flight altitude
      if (low) { const nr = def.route.line.nearest(s.position.x, s.position.z); if (nr.d < 400) s.position.y = top + rnd() * 400; }
      this.clouds.add(s);
    }
    this.group.add(this.clouds);
  }

  buildBirds() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.3, -1, 0.2, -0.2, 0, 0, -0.3, 0, 0, 0.3, 1, 0.2, -0.2, 0, 0, -0.3], 3));
    g.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide, fog: true });
    const n = 24;
    const mesh = new THREE.InstancedMesh(g, mat, n);
    mesh.frustumCulled = false;
    const rnd = mulberry32(12);
    const R = this.def.route;
    const p = R.line.at(R.L * 0.35);
    this.birds = { mesh, n, data: [], center: new THREE.Vector3(p.x + 250, R.routeY(R.L * 0.35) + 60, p.z) };
    for (let i = 0; i < n; i++) this.birds.data.push({ r: 30 + rnd() * 70, a: rnd() * 6.28, sp: 0.15 + rnd() * 0.1, y: rnd() * 30, ph: rnd() * 6, s: 1.2 + rnd() * 0.6 });
    this.group.add(mesh);
  }

  update(dt, windVec) {
    this.time += dt;
    if (this.waterMat) this.waterMat.uniforms.uTime.value = this.time;
    if (this.clouds) for (const c of this.clouds.children) {
      c.position.x += windVec.x * dt * 2; c.position.z += windVec.z * dt * 2;
      const lim = this.S * 1.6;
      if (c.position.x > lim) c.position.x -= lim * 2; if (c.position.x < -lim) c.position.x += lim * 2;
      if (c.position.z > lim) c.position.z -= lim * 2; if (c.position.z < -lim) c.position.z += lim * 2;
    }
    if (this.birds) {
      const B = this.birds, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
      B.data.forEach((b, i) => {
        b.a += b.sp * dt;
        p.set(B.center.x + Math.cos(b.a) * b.r, B.center.y + b.y + Math.sin(this.time * 0.5 + b.ph) * 4, B.center.z + Math.sin(b.a) * b.r);
        e.set(0, -b.a, Math.sin(this.time * 0.4 + b.ph) * 0.3); q.setFromEuler(e);
        const flap = 0.4 + Math.abs(Math.sin(this.time * 8 + b.ph)) * 0.8;
        s.set(b.s, b.s * flap, b.s);
        m4.compose(p, q, s); B.mesh.setMatrixAt(i, m4);
      });
      B.mesh.instanceMatrix.needsUpdate = true;
    }
    if (this.socks) for (const k of this.socks) k.rotation.y = Math.atan2(windVec.x, windVec.z) + Math.sin(this.time * 3) * 0.08;
    if (this.flag) this.flag.rotation.y = Math.sin(this.time * 4) * 0.25;
  }

  setLighting(sky) {
    if (this.waterMat) {
      this.waterMat.uniforms.uSunDir.value.copy(sky.sunDir);
      this.waterMat.uniforms.uSunColor.value.copy(sky.sunColor);
      this.waterMat.uniforms.uSky.value.copy(sky.horizon).lerp(sky.zenith, 0.35);
    }
    this.night = sky.night;
    if (this.cloudMat) this.cloudMat.color.copy(sky.cloudColor);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { if (m.map && m.map !== sharedDetail) m.map.dispose(); m.dispose(); }); }
    });
  }
}
