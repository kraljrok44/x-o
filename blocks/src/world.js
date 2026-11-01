// Endless chunked voxel world: terrain generation, edits, face-culled chunk meshes.
import * as THREE from 'three';
import { BLOCKS, COLS, ROWS } from './blocks.js';

export const CS = 16;      // chunk size (x, z)
export const CH = 64;      // world height
const SEA = 12;

function hash2(x, z, s) {
  let h = (x * 374761393 + z * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, z, s) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi, s), b = hash2(xi + 1, zi, s), c = hash2(xi, zi + 1, s), d = hash2(xi + 1, zi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z, s) {
  return vnoise(x * 0.012, z * 0.012, s) * 0.55 + vnoise(x * 0.03, z * 0.03, s + 1) * 0.3 + vnoise(x * 0.09, z * 0.09, s + 2) * 0.15;
}

export class World {
  constructor(seed, material) {
    this.seed = seed;
    this.material = material;
    this.chunks = new Map();   // "cx,cz" -> { data, mesh, dirty }
    this.edits = new Map();    // "x,y,z" -> id (persisted)
    this.group = new THREE.Group();
  }

  height(x, z) {
    const n = fbm(x, z, this.seed);
    return Math.max(4, Math.min(CH - 14, Math.floor(11 + n * 32)));
  }

  _key(cx, cz) { return cx + ',' + cz; }

  _gen(cx, cz) {
    const data = new Uint8Array(CS * CH * CS);
    const idx = (x, y, z) => (y * CS + z) * CS + x;
    const x0 = cx * CS, z0 = cz * CS;
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const h = this.height(x0 + x, z0 + z);
      const beach = h <= SEA + 1;
      const snowy = h > 38;
      for (let y = 0; y <= h; y++) {
        let id = 3;
        if (y === h) id = snowy ? 11 : beach ? 4 : 1;
        else if (y > h - 4) id = beach ? 4 : 2;
        data[idx(x, y, z)] = id;
      }
      // low areas are filled with sand lakes shown as flat sand beds (no water yet)
    }
    // trees: origins from the neighbourhood so they cross chunk borders cleanly
    for (let tz = z0 - 3; tz < z0 + CS + 3; tz++) for (let tx = x0 - 3; tx < x0 + CS + 3; tx++) {
      if (hash2(tx, tz, this.seed + 99) > 0.012) continue;
      const th = this.height(tx, tz);
      if (th <= SEA + 1 || th > 36) continue;
      const trunk = 4 + Math.floor(hash2(tx, tz, 5) * 2);
      const put = (x, y, z, id, onlyAir) => {
        const lx = x - x0, lz = z - z0;
        if (lx < 0 || lz < 0 || lx >= CS || lz >= CS || y < 0 || y >= CH) return;
        const i = idx(lx, y, lz);
        if (onlyAir && data[i] !== 0) return;
        data[i] = id;
      };
      for (let y = 1; y <= trunk; y++) put(tx, th + y, tz, 5, false);
      for (let dy = trunk - 1; dy <= trunk + 2; dy++) {
        const r = dy >= trunk + 1 ? 1 : 2;
        for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) === r && Math.abs(dz) === r && (dy > trunk || hash2(tx + dx, tz + dz, dy) < 0.5)) continue;
          put(tx + dx, th + dy, tz + dz, 6, true);
        }
      }
    }
    // saved edits
    for (const [k, id] of this.edits) {
      const [x, y, z] = k.split(',').map(Number);
      const lx = x - x0, lz = z - z0;
      if (lx >= 0 && lz >= 0 && lx < CS && lz < CS && y >= 0 && y < CH) data[idx(lx, y, lz)] = id;
    }
    return data;
  }

  chunk(cx, cz, create = false) {
    const k = this._key(cx, cz);
    let c = this.chunks.get(k);
    if (!c && create) { c = { cx, cz, data: this._gen(cx, cz), mesh: null, dirty: true }; this.chunks.set(k, c); }
    return c;
  }

  get(x, y, z) {
    if (y < 0) return 3;
    if (y >= CH) return 0;
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const c = this.chunks.get(cx + ',' + cz);
    if (!c) return 0;
    return c.data[(y * CS + (z - cz * CS)) * CS + (x - cx * CS)];
  }

  isSolid(x, y, z) { const id = this.get(x, y, z); return id !== 0; }

  set(x, y, z, id, record = true) {
    if (y < 0 || y >= CH) return;
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const c = this.chunk(cx, cz, true);
    const lx = x - cx * CS, lz = z - cz * CS;
    c.data[(y * CS + lz) * CS + lx] = id;
    if (record) this.edits.set(x + ',' + y + ',' + z, id);
    c.dirty = true;
    if (lx === 0) this._dirty(cx - 1, cz); if (lx === CS - 1) this._dirty(cx + 1, cz);
    if (lz === 0) this._dirty(cx, cz - 1); if (lz === CS - 1) this._dirty(cx, cz + 1);
  }
  _dirty(cx, cz) { const c = this.chunks.get(cx + ',' + cz); if (c) c.dirty = true; }

  /** Highest solid block + 1 in a column (for spawning). */
  surface(x, z) {
    this.chunk(Math.floor(x / CS), Math.floor(z / CS), true);
    for (let y = CH - 1; y >= 0; y--) if (this.get(x, y, z) !== 0) return y + 1;
    return 0;
  }

  mesh(c) {
    const pos = [], uv = [], col = [], ind = [];
    const x0 = c.cx * CS, z0 = c.cz * CS;
    const FACES = [
      // normal, shade, 4 corners (x,y,z), face key
      { n: [1, 0, 0], s: 0.8, v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], f: 'side' },
      { n: [-1, 0, 0], s: 0.8, v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], f: 'side' },
      { n: [0, 1, 0], s: 1, v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], f: 'top' },
      { n: [0, -1, 0], s: 0.5, v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], f: 'bottom' },
      { n: [0, 0, 1], s: 0.65, v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], f: 'side' },
      { n: [0, 0, -1], s: 0.65, v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], f: 'side' },
    ];
    const du = 1 / COLS, dv = 1 / ROWS, e = 0.0005;
    for (let y = 0; y < CH; y++) for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const id = c.data[(y * CS + z) * CS + x];
      if (!id) continue;
      const b = BLOCKS[id];
      const wx = x0 + x, wz = z0 + z;
      for (const F of FACES) {
        const nid = this.get(wx + F.n[0], y + F.n[1], wz + F.n[2]);
        if (nid) { const nb = BLOCKS[nid]; if (!(nb.clear && (b.clear ? nid !== id : true))) continue; }
        const tile = b[F.f];
        const tu = (tile % COLS) * du, tv = 1 - (Math.floor(tile / COLS) + 1) * dv;
        const base = pos.length / 3;
        const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
        // a little ambient occlusion from the neighbours of each corner
        for (let i = 0; i < 4; i++) {
          const vx = F.v[i][0], vy = F.v[i][1], vz = F.v[i][2];
          pos.push(wx + vx, y + vy, wz + vz);
          uv.push(tu + (uvs[i][0] ? du - e : e), tv + (uvs[i][1] ? dv - e : e));
          const ao = this._ao(wx, y, wz, F, vx, vy, vz);
          const sh = F.s * ao;
          col.push(sh, sh, sh);
        }
        ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(ind);
    g.computeBoundingSphere();
    if (c.mesh) { this.group.remove(c.mesh); c.mesh.geometry.dispose(); }
    c.mesh = ind.length ? new THREE.Mesh(g, this.material) : null;
    if (c.mesh) { c.mesh.matrixAutoUpdate = false; this.group.add(c.mesh); }
    c.dirty = false;
  }

  _ao(wx, y, wz, F, vx, vy, vz) {
    // sample the three blocks touching this vertex on the face's outer side
    const n = F.n;
    const ax = n[0] === 0 ? (vx ? 1 : -1) : 0, ay = n[1] === 0 ? (vy ? 1 : -1) : 0, az = n[2] === 0 ? (vz ? 1 : -1) : 0;
    const bx = wx + n[0], by = y + n[1], bz = wz + n[2];
    let s1, s2, cc;
    if (n[0] !== 0) { s1 = this.get(bx, by + ay, bz); s2 = this.get(bx, by, bz + az); cc = this.get(bx, by + ay, bz + az); }
    else if (n[1] !== 0) { s1 = this.get(bx + ax, by, bz); s2 = this.get(bx, by, bz + az); cc = this.get(bx + ax, by, bz + az); }
    else { s1 = this.get(bx + ax, by, bz); s2 = this.get(bx, by + ay, bz); cc = this.get(bx + ax, by + ay, bz); }
    const o = (id) => (id && !BLOCKS[id].clear ? 1 : 0);
    const k = o(s1) && o(s2) ? 3 : o(s1) + o(s2) + o(cc);
    return 1 - k * 0.2;
  }

  /** Load/unload chunks around a position; at most `budget` meshes are built per call. */
  update(px, pz, radius, budget = 2) {
    const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS);
    const want = [];
    for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dz * dz <= radius * radius + 1) want.push([pcx + dx, pcz + dz, dx * dx + dz * dz]);
    }
    want.sort((a, b) => a[2] - b[2]);
    let made = 0;
    for (const [cx, cz] of want) {
      const c = this.chunk(cx, cz, false);
      if (!c) { if (made < budget) { this.chunk(cx, cz, true); made++; } }
    }
    for (const [cx, cz] of want) {
      const c = this.chunk(cx, cz, false);
      if (c && c.dirty && made < budget + 2) {
        // mesh only when the 4 neighbours exist, so border faces are not drawn needlessly
        if (this.chunk(cx + 1, cz, false) && this.chunk(cx - 1, cz, false) && this.chunk(cx, cz + 1, false) && this.chunk(cx, cz - 1, false)) { this.mesh(c); made++; }
      }
    }
    for (const [k, c] of this.chunks) {
      if (Math.abs(c.cx - pcx) > radius + 2 || Math.abs(c.cz - pcz) > radius + 2) {
        if (c.mesh) { this.group.remove(c.mesh); c.mesh.geometry.dispose(); }
        this.chunks.delete(k);
      }
    }
  }

  /** DDA ray through the voxels: returns { x, y, z, nx, ny, nz } of the first solid block. */
  raycast(o, d, max = 6) {
    let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
    const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
    const tdx = sx ? Math.abs(1 / d.x) : Infinity, tdy = sy ? Math.abs(1 / d.y) : Infinity, tdz = sz ? Math.abs(1 / d.z) : Infinity;
    let tx = sx > 0 ? (x + 1 - o.x) * tdx : (o.x - x) * tdx;
    let ty = sy > 0 ? (y + 1 - o.y) * tdy : (o.y - y) * tdy;
    let tz = sz > 0 ? (z + 1 - o.z) * tdz : (o.z - z) * tdz;
    let nx = 0, ny = 0, nz = 0, t = 0;
    while (t <= max) {
      if (this.get(x, y, z)) return { x, y, z, nx, ny, nz };
      if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (ty < tz) { y += sy; t = ty; ty += tdy; nx = 0; ny = -sy; nz = 0; }
      else { z += sz; t = tz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
    }
    return null;
  }
}
