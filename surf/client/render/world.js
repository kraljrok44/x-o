// Map renderer: builds visual meshes from the same brush data the physics uses (visual and
// collision stay in sync, spec 9.1) plus sky, fog, lights, zones, flow rings and themed decor.

import * as THREE from 'three';
import { rng32, hashString } from '../../shared/vec.js';
import { skyDome } from './skybox.js';

const ZONE_COLORS = { start: '#2bff88', checkpoint: '#3ab7ff', end: '#b06bff', finish: '#ffcc33' };

function gridTexture(lineAlpha = 0.22, panel = true) {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, s, s);
  if (panel) {
    const rnd = rng32(42);
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = `rgba(0,0,0,${rnd() * 0.035})`;
      g.fillRect(rnd() * s, rnd() * s, 2 + rnd() * 6, 2 + rnd() * 6);
    }
  }
  g.strokeStyle = `rgba(0,0,0,${lineAlpha})`;
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, s - 3, s - 3);
  g.strokeStyle = `rgba(0,0,0,${lineAlpha * 0.45})`;
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.moveTo(0, s / 2); g.lineTo(s, s / 2);
  g.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function emissiveGridTexture() {
  const s = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, s, s);
  g.strokeStyle = '#fff';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, s - 3, s - 3);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function faceKey(verts) {
  return verts.map((v) => `${Math.round(v.x * 4)},${Math.round(v.y * 4)},${Math.round(v.z * 4)}`).sort().join('|');
}

/** Merge brush faces per material into BufferGeometries, dropping faces shared by two brushes. */
function buildSurfaces(map, theme) {
  const counts = new Map();
  for (const b of map.brushes) for (const f of b.faces) {
    const k = faceKey(f.idx.map((i) => b.verts[i]));
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const groups = {};
  const rampCols = theme.ramp.map((c) => new THREE.Color(c));
  const col = new THREE.Color();
  for (const b of map.brushes) {
    const gname = b.mat === 'ramp' ? 'ramp' : b.mat;
    const G = (groups[gname] ||= { pos: [], nor: [], uv: [], col: [] });
    for (const f of b.faces) {
      const vs = f.idx.map((i) => b.verts[i]);
      if (counts.get(faceKey(vs)) > 1) continue;
      const n = f.n;
      // face basis for world-space UVs
      let u;
      if (Math.abs(n.z) > 0.95) u = { x: 1, y: 0, z: 0 };
      else { const l = Math.hypot(n.y, n.x); u = { x: -n.y / l, y: n.x / l, z: 0 }; }
      const v = { x: n.y * u.z - n.z * u.y, y: n.z * u.x - n.x * u.z, z: n.x * u.y - n.y * u.x };
      const scale = b.mat === 'ramp' ? 1 / 192 : 1 / 256;
      if (b.mat === 'ramp') {
        col.copy(rampCols[(b.rampIndex || 0) % rampCols.length]);
        if (n.z < -0.2) col.multiplyScalar(0.35); // underside
        else if (n.z < 0.2) col.multiplyScalar(0.6); // caps / walls
      } else {
        if (b.mat === 'pad') col.set(theme.accent).multiplyScalar(0.6);
        else col.set(theme[b.mat] || theme.platform);
        col.offsetHSL(0, 0, n.z > 0.7 ? 0.1 : 0.05);
      }
      for (let i = 1; i < vs.length - 1; i++) {
        for (const p of [vs[0], vs[i], vs[i + 1]]) {
          G.pos.push(p.x, p.y, p.z);
          G.nor.push(n.x, n.y, n.z);
          G.uv.push((p.x * u.x + p.y * u.y + p.z * u.z) * scale, (p.x * v.x + p.y * v.y + p.z * v.z) * scale);
          G.col.push(col.r, col.g, col.b);
        }
      }
    }
  }
  const out = {};
  for (const [k, G] of Object.entries(groups)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(G.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(G.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(G.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(G.col, 3));
    g.computeBoundingSphere();
    out[k] = g;
  }
  return out;
}

function zoneMesh(z) {
  const color = new THREE.Color(ZONE_COLORS[z.type] || '#ffffff');
  const hgt = z.type === 'finish' || z.type === 'end' ? 260 : 150;
  const [hx, hy] = z.h;
  const pts = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]];
  const pos = [], uv = [];
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4];
    const q = [[a[0], a[1], 0, 0], [b[0], b[1], 0, 0], [b[0], b[1], hgt, 1], [a[0], a[1], 0, 0], [b[0], b[1], hgt, 1], [a[0], a[1], hgt, 1]];
    for (const p of q) { pos.push(p[0], p[1], p[2]); uv.push(0, p[3]); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { color: { value: color }, time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 color; uniform float time; varying vec2 vUv;
      void main(){ float a = pow(1.0 - vUv.y, 2.2) * 0.55; a += step(0.97, fract(vUv.y * 6.0 - time * 0.6)) * 0.25 * (1.0 - vUv.y);
      gl_FragColor = vec4(color * a, a); }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.position.set(z.c[0], z.c[1], z.c[2]);
  m.rotation.z = z.yaw;
  m.userData.zone = z;
  // floor outline
  const line = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p[0], p[1], 1))),
    new THREE.LineBasicMaterial({ color, toneMapped: false }),
  );
  m.add(line);
  return m;
}

function routeSamples(map) {
  const s = [];
  for (const r of map.ramps) for (const p of r.points) s.push(p);
  for (const st of map.stages) s.push(st.spawn.pos);
  for (const z of map.zones) s.push(z.c);
  return s;
}

function buildDecor(map, theme, group) {
  const rnd = rng32(hashString(map.id));
  const pts = routeSamples(map);
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity, minz = Infinity, maxz = -Infinity;
  for (const p of pts) {
    minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]);
    miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]);
    minz = Math.min(minz, p[2]); maxz = Math.max(maxz, p[2]);
  }
  const pad = 14000;
  const clear = (x, y, z) => {
    for (const p of pts) {
      const dx = p[0] - x, dy = p[1] - y;
      if (dx * dx + dy * dy < 4200 * 4200 && z > p[2] - 3000 && z < p[2] + 2400) return false;
    }
    return true;
  };
  const place = (n, zlo, zhi) => {
    const out = [];
    let guard = 0;
    while (out.length < n && guard++ < n * 30) {
      const x = minx - pad + rnd() * (maxx - minx + pad * 2);
      const y = miny - pad + rnd() * (maxy - miny + pad * 2);
      const z = zlo + rnd() * (zhi - zlo);
      if (clear(x, y, z)) out.push([x, y, z]);
    }
    return out;
  };
  const accent = new THREE.Color(theme.accent);
  const base = new THREE.Color(theme.platform);
  const dummy = new THREE.Object3D();
  const inst = (geo, mat, list, fn) => {
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((p, i) => { dummy.position.set(p[0], p[1], p[2]); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); fn(dummy, i); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); });
    m.instanceMatrix.needsUpdate = true;
    group.add(m);
    return m;
  };

  switch (theme.decor) {
    case 'pillars': {
      const list = place(140, minz - 9000, maxz + 1500);
      inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: base.clone().offsetHSL(0, 0, 0.08), roughness: 0.8 }), list, (d) => {
        const w = 400 + rnd() * 900, h = 3000 + rnd() * 9000;
        d.scale.set(w, w, h); d.position.z -= h / 2; d.rotation.z = rnd() * Math.PI;
      });
      inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: accent, toneMapped: false }), list, (d) => {
        d.scale.set(60, 60, 60); d.position.z += 200 + rnd() * 600;
      });
      break;
    }
    case 'crystals': {
      const list = place(180, minz - 8000, maxz + 3000);
      inst(new THREE.OctahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xbfe9ff, emissive: 0x1a5f8a, emissiveIntensity: 0.6, roughness: 0.15, metalness: 0.1, flatShading: true }), list, (d) => {
        const s = 200 + rnd() * 900;
        d.scale.set(s * 0.45, s * 0.45, s * (1.2 + rnd())); d.rotation.set(rnd() * 0.5, rnd() * 0.5, rnd() * 3);
      });
      break;
    }
    case 'lanterns': {
      const islands = place(70, minz - 7000, maxz + 1000);
      inst(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x55603f, roughness: 0.9, flatShading: true }), islands, (d) => {
        const s = 500 + rnd() * 1300; d.scale.set(s, s, s * 0.45); d.rotation.z = rnd() * 3;
      });
      inst(new THREE.ConeGeometry(1, 1, 7), new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.8, flatShading: true }), islands, (d, i) => {
        const s = 260 + rnd() * 380; d.scale.set(s, s, s * 2.4); d.rotation.x = Math.PI / 2; d.position.z += s * 1.2 + 200;
      });
      const lan = place(260, minz - 3000, maxz + 2500);
      inst(new THREE.BoxGeometry(1, 1, 1.6), new THREE.MeshBasicMaterial({ color: 0xffc46b, toneMapped: false }), lan, (d) => {
        d.scale.setScalar(40 + rnd() * 30); d.rotation.z = rnd() * 3;
      });
      break;
    }
    case 'rocks': {
      const list = place(160, minz - 7000, maxz + 1000);
      inst(new THREE.DodecahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x241510, roughness: 0.95, flatShading: true, emissive: 0x3a0a00, emissiveIntensity: 0.4 }), list, (d) => {
        const s = 300 + rnd() * 1400; d.scale.set(s, s * (0.6 + rnd() * 0.6), s * (0.5 + rnd())); d.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      });
      break;
    }
    case 'asteroids': {
      const list = place(220, minz - 9000, maxz + 6000);
      inst(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x3c2a5c, roughness: 0.9, flatShading: true }), list, (d) => {
        const s = 150 + rnd() * 1100; d.scale.set(s, s * (0.7 + rnd() * 0.5), s * (0.7 + rnd() * 0.5)); d.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      });
      break;
    }
    case 'grid':
    default: {
      const list = place(120, minz - 6000, maxz + 2500);
      const m = inst(new THREE.TetrahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: accent, wireframe: true, toneMapped: false }), list, (d) => {
        const s = 300 + rnd() * 900; d.scale.setScalar(s); d.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      });
      m.userData.spin = true;
      break;
    }
  }

  // ground plane far below (lava, neon grid, haze)
  const floorZ = minz - 9500;
  const size = Math.max(maxx - minx, maxy - miny) + pad * 4;
  const floorMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { time: { value: 0 }, c1: { value: new THREE.Color(theme.lava ? '#ff5a00' : theme.neon ? theme.edge : theme.fog) }, c2: { value: new THREE.Color(theme.lava ? '#5a0a00' : theme.sky[2]) }, mode: { value: theme.lava ? 1 : theme.neon ? 2 : 0 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float time; uniform vec3 c1, c2; uniform int mode; varying vec2 vP;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      void main(){
        float d = length(vP) / ${(size / 2).toFixed(1)};
        float fade = 1.0 - smoothstep(0.35, 1.0, d);
        vec3 c; float a;
        if (mode == 1) { float v = n(vP * 0.0006 + time * 0.03) * 0.6 + n(vP * 0.002 - time * 0.05) * 0.4; c = mix(c2, c1, smoothstep(0.35, 0.8, v)) * 1.6; a = fade; }
        else if (mode == 2) { vec2 g = abs(fract(vP / 1500.0) - 0.5); float l = 1.0 - smoothstep(0.0, 0.02, min(g.x, g.y)); c = c1 * l * 1.5 + c2 * 0.15; a = fade * (0.25 + l * 0.75); }
        else { c = mix(c2, c1, 0.5); a = fade * 0.6; }
        gl_FragColor = vec4(c, a);
      }`,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), floorMat);
  floor.position.set((minx + maxx) / 2, (miny + maxy) / 2, floorZ);
  floor.userData.animated = floorMat;
  group.add(floor);
  return { bounds: { minx, maxx, miny, maxy, minz, maxz } };
}

export function buildWorld(map, opts = {}) {
  const theme = map.theme;
  const group = new THREE.Group();
  const animated = [];

  const surfaces = buildSurfaces(map, theme);
  const albedo = gridTexture(theme.neon ? 0.15 : 0.22);
  const emiss = theme.neon ? emissiveGridTexture() : null;
  for (const [name, geo] of Object.entries(surfaces)) {
    const mat = new THREE.MeshStandardMaterial({
      map: albedo, vertexColors: true,
      roughness: name === 'ramp' ? 0.55 : 0.8, metalness: name === 'ramp' ? 0.15 : 0.05,
      emissive: emiss ? new THREE.Color(theme.edge) : new THREE.Color(0x000000),
      emissiveMap: emiss, emissiveIntensity: emiss ? 0.35 : 0,
      side: THREE.FrontSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.surface = name;
    group.add(mesh);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, 25),
      new THREE.LineBasicMaterial({ color: new THREE.Color(name === 'ramp' ? theme.edge : theme.accent), transparent: true, opacity: name === 'ramp' ? 0.9 : 0.55, toneMapped: false }),
    );
    group.add(edges);
  }

  for (const z of map.zones) {
    const m = zoneMesh(z);
    group.add(m);
    animated.push(m.material);
  }

  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.accent).multiplyScalar(1.6), toneMapped: false });
  const ringMeshes = [];
  for (const r of map.rings) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r.r, 10, 10, 64), ringMat);
    m.position.set(r.c[0], r.c[1], r.c[2]);
    m.rotation.order = 'ZYX';
    m.rotation.z = r.yaw;
    m.rotation.y = Math.PI / 2;
    group.add(m);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(r.r * 0.86, 3, 6, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, toneMapped: false }));
    m.add(inner);
    ringMeshes.push(m);
  }

  const decor = buildDecor(map, theme, group);
  group.traverse((o) => { if (o.userData.animated) animated.push(o.userData.animated); });

  const sky = skyDome(map); // painted panorama in the map's theme (stars are part of the painting)
  const stars = null;

  const lights = new THREE.Group();
  const hemi = new THREE.HemisphereLight(new THREE.Color(theme.sky[1]).lerp(new THREE.Color(0xffffff), 0.35), new THREE.Color(theme.platform).lerp(new THREE.Color(0xffffff), 0.2), 2.0);
  hemi.up.set(0, 0, 1);
  hemi.position.set(0, 0, 1);
  lights.add(hemi);
  const sun = new THREE.DirectionalLight(new THREE.Color(theme.sunColor), 2.6);
  sun.position.set(...theme.sun).normalize();
  lights.add(sun);
  lights.add(new THREE.AmbientLight(0xffffff, 0.45));
  // fill light opposite the sun so faces in shadow keep readable shape (spec 9.3)
  const fill = new THREE.DirectionalLight(new THREE.Color(theme.sky[1]).lerp(new THREE.Color(0xffffff), 0.5), 0.9);
  fill.position.set(-theme.sun[0], -theme.sun[1], 0.4).normalize();
  lights.add(fill);

  return {
    group, sky, stars, lights, ringMeshes, theme, bounds: decor.bounds,
    fog: new THREE.FogExp2(new THREE.Color(theme.fog), theme.fogDensity),
    update(t, camPos) {
      for (const m of animated) if (m.uniforms && m.uniforms.time) m.uniforms.time.value = t;
      for (const r of ringMeshes) r.children[0].rotation.z = t * 1.5;
      sky.position.copy(camPos);
      if (stars) stars.position.copy(camPos);
    },
    dispose() {
      group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      });
      albedo.dispose();
      if (emiss) emiss.dispose();
      sky.geometry.dispose(); sky.material.dispose(); // panorama texture stays cached per map
      if (stars) { stars.geometry.dispose(); stars.material.dispose(); }
    },
  };
}
