// Map definitions: terrain height functions, flight routes, landing zones and props.
import { makeNoise, Polyline, smoothPath, smoothstep, clamp, lerp } from './util.js';

const sq = (x) => x * x;

// Builds route + height function shared logic for natural maps.
function buildRoute(def) {
  const pts = smoothPath(def.ctrl, 15);
  const line = new Polyline(pts);
  const L = line.total;
  const { H0, landY } = def;
  const drop0 = def.drop0 ?? 170;
  const routeY = (s) => {
    s = clamp(s, 0, L);
    return H0 - drop0 * smoothstep(0, 380, s) - (H0 - drop0 - landY) * Math.pow(s / L, def.glideExp ?? 1.05);
  };
  const start = line.at(0);
  const end = line.at(L);
  return { line, L, routeY, start, end, heading: Math.atan2(start.dx, start.dz) };
}

function naturalHeight(def, R, N, base) {
  const { line, L, routeY } = R;
  const near = { d: 0, s: 0 };
  const ex = R.start.x, ez = R.start.z;
  // Platform center sits behind the exit lip.
  const cx = ex - R.start.dx * 25, cz = ez - R.start.dz * 25;
  const lx = R.end.x, lz = R.end.z;
  const c = def.carve;
  return function height(x, z) {
    let h = base(x, z);
    const cell = def.cell || 20, lip = cell + 2;
    const fwd = (x - ex) * R.start.dx + (z - ez) * R.start.dz;
    const lat = Math.abs((x - ex) * R.start.dz - (z - ez) * R.start.dx);
    // Summit / exit hill
    const sd = Math.hypot(x - cx, z - cz);
    const cone = def.H0 - (def.summitSlope ?? 0.55) * Math.max(0, sd - 45) - 0.004 * sq(Math.max(0, sd - 45));
    h = Math.max(h, cone + N.fbm(x / 90, z / 90, 3) * 6 * smoothstep(45, 80, sd));
    // Carve route corridor
    line.nearest(x, z, near);
    const s = near.s, d = near.d;
    if (d < 1500) {
      const wcar = smoothstep(lip, lip + 0.5, s);
      if (wcar > 0) {
        let wm = 1;
        if (c.narrows) for (const nw of c.narrows) wm -= nw.k * Math.exp(-sq((s - nw.s * L) / nw.len));
        const clr = c.clearance * (1 - smoothstep(0.76 * L, L, s)) + (def.startDrop ?? 260) * (1 - smoothstep(150, 750, s));
        const floor = routeY(s) - clr + N.fbm(x / 140, z / 140, 3) * c.floorNoise * (1 - smoothstep(0.8 * L, L, s));
        const w0 = c.w0 * wm, w = c.w * wm;
        const wall = c.wallH * Math.pow(Math.max(0, d - w0) / w, c.p);
        const carved = floor + wall + N.ridged(x / 60, z / 60, 3) * c.wallNoise * smoothstep(w0, w0 + w, d);
        h = lerp(h, Math.min(h, carved), wcar);
      }
    }
    // Landing zone flatten
    const dl = Math.hypot(x - lx, z - lz);
    const lr = def.landR;
    h = lerp(h, def.landY, 1 - smoothstep(lr, lr * 2.0, dl));
    // Exit platform: flat up to the lip (grid-aware so the edge is crisp), cliff beyond
    if (fwd <= lip && fwd > -90) h = lerp(h, def.H0, 1 - smoothstep(24, 24 + cell * 1.5, lat));
    if (def.extra) h = def.extra(x, z, h, near);
    return h;
  };
}

// ---------------------------------------------------------------- MAP 01
function skyfall() {
  const N = makeNoise(1101);
  const def = {
    id: 'skyfall', name: 'Skyfall Ridge', subtitle: 'Alpine mountain range',
    size: 3000, H0: 2050, landY: 300, landR: 85,
    ctrl: [[-200, 2400], [-160, 2150], [80, 1750], [-90, 1250], [180, 760], [20, 260], [-230, -260], [-120, -760], [140, -1180]],
    carve: { clearance: 165, w0: 70, w: 300, p: 1.6, wallH: 950, floorNoise: 25, wallNoise: 90,
      narrows: [{ s: 0.42, k: 0.55, len: 170 }, { s: 0.63, k: 0.5, len: 140 }] },
  };
  const R = buildRoute(def);
  const lake = { x: R.end.x + 330, z: R.end.z + 220, r: 260 };
  def.extra = (x, z, h) => {
    const d = Math.hypot(x - lake.x, z - lake.z);
    const bowl = def.landY - 45 + sq(d / lake.r) * 120;
    return Math.min(h, lerp(bowl, h, smoothstep(lake.r * 0.9, lake.r * 1.5, d)));
  };
  const base = (x, z) => {
    const wx = x + N.fbm(x / 2000 + 7, z / 2000, 3) * 500, wz = z + N.fbm(x / 2000, z / 2000 + 7, 3) * 500;
    const r = N.ridged(wx / 3000 + 3.1, wz / 3000 - 1.7, 6);
    const f = N.fbm(x / 1500, z / 1500, 4) * 0.5 + 0.5;
    return 260 + 1900 * Math.pow(r, 1.5) * (0.55 + 0.6 * f) + 140 * N.fbm(x / 500, z / 500, 4);
  };
  def.height = naturalHeight(def, R, N, base);
  def.water = { y: def.landY - 14, kind: 'lake' };
  def.color = (h, slope, x, z, n) => {
    const snowLine = 1500 + n * 200;
    let r = 0.25, g = 0.33, b = 0.17; // alpine meadow / forest floor
    const rock = smoothstep(0.16, 0.3, slope);
    const rr = 0.36 + n * 0.05, rg = 0.32 + n * 0.04, rb = 0.27 + n * 0.04;
    r = lerp(r, rr, rock); g = lerp(g, rg, rock); b = lerp(b, rb, rock);
    const hi = smoothstep(900, 1300, h) * (1 - rock); // scree/alpine
    r = lerp(r, 0.38, hi * 0.6); g = lerp(g, 0.36, hi * 0.6); b = lerp(b, 0.3, hi * 0.6);
    const snow = smoothstep(snowLine - 60, snowLine + 60, h) * (1 - smoothstep(0.22, 0.38, slope));
    r = lerp(r, 0.86, snow); g = lerp(g, 0.89, snow); b = lerp(b, 0.95, snow);
    return [r, g, b];
  };
  def.trees = { kind: 'pine', count: 26000, minH: def.landY - 10, maxH: 1250, maxSlope: 0.75, clearR: def.landR + 40, scale: [0.8, 1.5] };
  def.rocks = { count: 900, minSlope: 0.3 };
  def.particles = 'snow';
  def.ambient = 'mountain';
  def.defaultTime = 'midday';
  def.wind = { dir: 0.6, speed: 5 };
  def.rain = true;
  def.palette = { tint: [1, 1, 1] };
  return finalize(def, R);
}

// ---------------------------------------------------------------- MAP 02
function redstone() {
  const N = makeNoise(2202);
  const def = {
    id: 'redstone', name: 'Redstone Abyss', subtitle: 'Desert canyon',
    size: 2600, H0: 1220, landY: 140, landR: 80, summitSlope: 1.6,
    ctrl: [[-1400, 1300], [-1150, 1150], [-800, 1150], [-500, 900], [-450, 550], [-150, 300], [150, 350], [380, 120]],
    carve: { clearance: 72, w0: 28, w: 76, p: 3.2, wallH: 900, floorNoise: 8, wallNoise: 30,
      narrows: [{ s: 0.5, k: 0.35, len: 120 }, { s: 0.8, k: 0.3, len: 90 }] },
  };
  const R = buildRoute(def);
  const base = (x, z) => {
    const n = N.fbm(x / 1600, z / 1600, 4) * 0.5 + 0.5;
    const t = n * 5;
    const step = (Math.floor(t) + smoothstep(0.82, 1, t - Math.floor(t))) / 5;
    const mesa = 420 + 560 * step;
    const bt = N.fbm(x / 650 + 11, z / 650 - 3, 3);
    const butte = smoothstep(0.32, 0.38, bt) * (220 + 120 * N.fbm(x / 300, z / 300, 2));
    return mesa + butte + N.fbm(x / 120, z / 120, 3) * 6;
  };
  // Canyon opens to a basin at the end
  def.extra = (x, z, h, near) => {
    const dl = Math.hypot(x - R.end.x, z - R.end.z);
    const basin = def.landY + sq(Math.max(0, dl - 160) / 260) * 300;
    return Math.min(h, basin);
  };
  def.height = naturalHeight(def, R, N, base);
  def.water = null;
  def.color = (h, slope, x, z, n) => {
    const band = Math.sin(h * 0.09 + n * 2.2) * 0.5 + 0.5;
    let r = lerp(0.62, 0.80, band), g = lerp(0.25, 0.38, band), b = lerp(0.12, 0.2, band);
    const flat = 1 - smoothstep(0.06, 0.16, slope);
    r = lerp(r, 0.86 + n * 0.04, flat); g = lerp(g, 0.58 + n * 0.04, flat); b = lerp(b, 0.34, flat);
    const low = 1 - smoothstep(def.landY + 30, def.landY + 200, h);
    r = lerp(r, 0.87, low * flat); g = lerp(g, 0.72, low * flat); b = lerp(b, 0.52, low * flat);
    return [r, g, b];
  };
  def.trees = { kind: 'bush', count: 5000, minH: 0, maxH: 2000, maxSlope: 0.35, clearR: def.landR + 20, scale: [0.5, 1.1] };
  def.rocks = { count: 1400, minSlope: 0.1 };
  def.arches = [{ s: 0.56, clearAbove: 30, r: 11 }, { s: 0.74, clearAbove: 24, r: 10 }];
  def.particles = 'dust';
  def.ambient = 'desert';
  def.defaultTime = 'sunset';
  def.wind = { dir: 2.2, speed: 4 };
  def.rain = false;
  return finalize(def, R);
}

// ---------------------------------------------------------------- MAP 03
function tidal() {
  const N = makeNoise(3303);
  const def = {
    id: 'tidal', name: 'Tidal Edge', subtitle: 'Coastal cliffs & ocean',
    size: 2600, H0: 820, landY: 3, landR: 70, summitSlope: 0.9,
    ctrl: [[240, 2200], [120, 1950], [-150, 1650], [-250, 1250], [-200, 850], [20, 620]],
    carve: { clearance: 110, w0: 50, w: 220, p: 2, wallH: 500, floorNoise: 0, wallNoise: 20 },
  };
  const R = buildRoute(def);
  const coast = (z) => 60 + 90 * Math.sin(z / 500) + 250 * Math.exp(-sq((z - 2150) / 260)) + N.fbm(0.5, z / 300, 3) * 50;
  const stacks = [];
  for (const [u, off, hh] of [[0.3, 48, 50], [0.38, -52, 70], [0.47, 40, 40], [0.55, -38, 60], [0.62, 55, 20]]) {
    const p = R.line.at(u * R.L);
    stacks.push({ x: p.x - p.dz * off * 1.25, z: p.z + p.dx * off * 1.25, r: 34, h: R.routeY(u * R.L) + hh });
  }
  const base = (x, z) => {
    const cx = coast(z);
    const inland = x - cx;
    const top = 330 + 260 * (N.fbm(x / 1100, z / 1100, 4) * 0.5 + 0.5) + 60 * N.ridged(x / 300, z / 300, 3);
    const land = top * smoothstep(-10, 70, inland) + Math.min(0, inland) * 0.4;
    let sea = -38 + N.fbm(x / 400, z / 400, 3) * 10;
    const isl = smoothstep(0.42, 0.5, N.fbm(x / 520 + 9, z / 520, 4)) * (45 + 40 * N.fbm(x / 120, z / 120, 2));
    sea += isl * smoothstep(80, 400, -inland);
    return inland > -10 ? Math.max(land, sea) : sea;
  };
  def.extra = (x, z, h) => {
    for (const st of stacks) {
      const d = Math.hypot(x - st.x, z - st.z);
      if (d < st.r * 2.2) {
        const prof = st.h * (1 - smoothstep(st.r * 0.8, st.r * 1.1, d + N.n2(x / 15, z / 15) * 4)) + N.fbm(x / 20, z / 20, 2) * 6;
        h = Math.max(h, prof - 40 * smoothstep(st.r, st.r * 2.2, d));
      }
    }
    // Beach bay around the landing area
    const dl = Math.hypot(x - R.end.x, z - R.end.z);
    const beach = def.landY + Math.max(0, dl - 140) * 0.45;
    const m = 1 - smoothstep(200, 330, dl);
    if (h > beach) h = lerp(h, beach, m);
    if (h < -2 && dl < 150) h = lerp(h, def.landY, 1 - smoothstep(90, 150, dl));
    return h;
  };
  def.height = naturalHeight(def, R, N, base);
  def.water = { y: 0, kind: 'ocean' };
  def.color = (h, slope, x, z, n) => {
    let r = 0.27 + n * 0.03, g = 0.40 + n * 0.04, b = 0.18; // grassy tops
    const rock = smoothstep(0.14, 0.28, slope);
    r = lerp(r, 0.26, rock); g = lerp(g, 0.25, rock); b = lerp(b, 0.26, rock);
    const sand = 1 - smoothstep(4, 12, h);
    r = lerp(r, 0.90, sand); g = lerp(g, 0.82, sand); b = lerp(b, 0.62, sand);
    const under = 1 - smoothstep(-6, -1, h);
    r = lerp(r, 0.78, under); g = lerp(g, 0.74, under); b = lerp(b, 0.58, under);
    return [r, g, b];
  };
  def.trees = { kind: 'pine', count: 9000, minH: 10, maxH: 900, maxSlope: 0.55, clearR: def.landR + 60, scale: [0.6, 1.2], palms: true };
  def.rocks = { count: 600, minSlope: 0.4 };
  def.arches = [{ s: 0.8, clearAbove: 26, r: 10, sea: true }];
  def.particles = 'mist';
  def.ambient = 'coast';
  def.defaultTime = 'morning';
  def.wind = { dir: -1.0, speed: 5 };
  def.rain = true;
  return finalize(def, R);
}

// ---------------------------------------------------------------- MAP 04
function metropolis() {
  const N = makeNoise(4404);
  const def = {
    id: 'metro', name: 'Vertical Metropolis', subtitle: 'Modern urban skyline',
    size: 2400, H0: 880, landY: 2, landR: 70, city: true,
    ctrl: [[0, 1392], [0, 1100], [0, 760], [0, 600], [120, 450], [300, 450], [450, 330], [450, 0], [450, -230]],
  };
  const R = buildRoute(def);
  def.height = (x, z) => {
    const r = Math.hypot(x, z - 300);
    return 2 + smoothstep(1700, 2400, r) * (N.fbm(x / 500, z / 500, 3) * 0.5 + 0.5) * 120;
  };
  def.water = null;
  def.color = () => [0.3, 0.3, 0.3];
  // Buildings
  const rnd = (() => { let a = 99; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();
  const B = [];
  const PITCH = 150, STREET = 30;
  const corr = 27;
  const near = { d: 0, s: 0 };
  const park = { x: R.end.x, z: R.end.z - 20, r: 170 };
  def.park = park;
  const helipad = { x: 675, z: 75, w: 64, d: 64, h: 128 };
  def.helipad = helipad;
  const routeDistBox = (b) => {
    // sample box perimeter for nearest route distance
    let best = 1e9;
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
      if (i > 0 && i < 4 && j > 0 && j < 4) continue;
      const x = lerp(b.x0, b.x1, i / 4), z = lerp(b.z0, b.z1, j / 4);
      R.line.nearest(x, z, near);
      if (near.d < best) best = near.d;
    }
    R.line.nearest((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, near);
    return Math.min(best, near.d);
  };
  for (let i = -16; i < 16; i++) for (let j = -16; j < 16; j++) {
    const bx0 = i * PITCH + STREET / 2, bz0 = j * PITCH + STREET / 2, bs = PITCH - STREET;
    const cxb = bx0 + bs / 2, czb = bz0 + bs / 2;
    const dc = Math.hypot(cxb, czb - 650);
    if (Math.hypot(cxb, czb) > 2300) continue;
    const parkBlock = Math.hypot(cxb - park.x, czb - park.z) < park.r + 40 || rnd() < 0.04;
    if (parkBlock) continue;
    const split = rnd() < 0.5 ? 2 : (rnd() < 0.5 ? 3 : 1);
    const lot = bs / split;
    for (let a = 0; a < split; a++) for (let c = 0; c < split; c++) {
      const b = { x0: bx0 + a * lot + 3, x1: bx0 + (a + 1) * lot - 3, z0: bz0 + c * lot + 3, z1: bz0 + (c + 1) * lot - 3 };
      if (Math.abs((b.x0 + b.x1) / 2 - helipad.x) < 70 && Math.abs((b.z0 + b.z1) / 2 - helipad.z) < 70) continue;
      const down = Math.exp(-sq(dc / 850));
      let h = 25 + 60 * rnd() + down * (120 + 380 * Math.pow(rnd(), 1.4));
      if (rnd() < 0.08) h *= 1.5;
      // keep route corridor clear (shrink the faces nearest to the route)
      let ok = true;
      for (let it = 0; it < 4; it++) {
        const dist = routeDistBox(b);
        if (dist >= corr) break;
        R.line.nearest((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, near);
        const p = R.line.at(near.s);
        const dx = (b.x0 + b.x1) / 2 - p.x, dz = (b.z0 + b.z1) / 2 - p.z;
        const push = corr - dist + 2;
        if (Math.abs(dx) > Math.abs(dz)) { if (dx > 0) b.x0 += push; else b.x1 -= push; }
        else { if (dz > 0) b.z0 += push; else b.z1 -= push; }
        if (b.x1 - b.x0 < 12 || b.z1 - b.z0 < 12) { ok = false; break; }
      }
      if (!ok || routeDistBox(b) < corr - 1) continue;
      // keep the start tower area clear
      if (Math.abs((b.x0 + b.x1) / 2) < 110 && Math.abs((b.z0 + b.z1) / 2 - 1420) < 110) continue;
      B.push({ ...b, y0: 0, y1: h, kind: 'building', tone: rnd() });
      if (h > 300 && rnd() < 0.3) {
        const ax = (b.x0 + b.x1) / 2, az = (b.z0 + b.z1) / 2, ah = 20 + rnd() * 45;
        B.push({ x0: ax - 0.8, x1: ax + 0.8, z0: az - 0.8, z1: az + 0.8, y0: h, y1: h + ah, kind: 'antenna' });
      }
    }
  }
  // The exit tower
  B.push({ x0: -30, x1: 30, z0: 1380, z1: 1450, y0: 0, y1: def.H0, kind: 'tower', tone: 0.5 });
  B.push({ x0: -1.5, x1: 1.5, z0: 1430, z1: 1433, y0: def.H0, y1: def.H0 + 70, kind: 'antenna' });
  // Helipad building
  B.push({ x0: helipad.x - helipad.w / 2, x1: helipad.x + helipad.w / 2, z0: helipad.z - helipad.d / 2, z1: helipad.z + helipad.d / 2, y0: 0, y1: helipad.h, kind: 'building', tone: 0.2, helipad: true });
  // Skybridges across the route
  def.bridgeSpecs = [{ s: 0.2, above: 28 }, { s: 0.33, above: -34 }, { s: 0.76, above: 26 }, { s: 0.86, above: -30 }];
  for (const bs of def.bridgeSpecs) {
    const p = R.line.at(bs.s * R.L);
    const y = R.routeY(bs.s * R.L) + bs.above;
    const alongX = Math.abs(p.dx) > Math.abs(p.dz);
    const half = 60;
    const b = alongX
      ? { x0: p.x - 5, x1: p.x + 5, z0: p.z - half, z1: p.z + half }
      : { x0: p.x - half, x1: p.x + half, z0: p.z - 5, z1: p.z + 5 };
    B.push({ ...b, y0: y - 3, y1: y + 3, kind: 'bridge' });
    // supporting buildings at both ends so bridges look anchored
    const off = half + 10;
    for (const sgn of [-1, 1]) {
      const cx = alongX ? p.x : p.x + sgn * off, cz = alongX ? p.z + sgn * off : p.z;
      B.push({ x0: cx - 16, x1: cx + 16, z0: cz - 16, z1: cz + 16, y0: 0, y1: Math.max(y + 40, 120), kind: 'building', tone: 0.7 });
    }
  }
  def.buildings = B;
  def.trees = { kind: 'broad', count: 0, park: true };
  def.particles = 'none';
  def.ambient = 'city';
  def.defaultTime = 'sunset';
  def.wind = { dir: 1.4, speed: 4 };
  def.rain = true;
  return finalize(def, R);
}

function finalize(def, R) {
  def.route = R;
  def.exit = { x: R.start.x, z: R.start.z, y: def.H0, heading: R.heading };
  def.landing = { x: R.end.x, z: R.end.z, y: def.landY, r: def.landR };
  return def;
}

const builders = { skyfall, redstone, tidal, metro: metropolis };
const cache = {};
export function getMap(id) {
  if (!cache[id]) cache[id] = builders[id]();
  return cache[id];
}
export const MAP_LIST = [
  { id: 'skyfall', name: 'Skyfall Ridge', subtitle: 'Alpine mountain range', color: '#7fb4ff' },
  { id: 'redstone', name: 'Redstone Abyss', subtitle: 'Desert canyon', color: '#ff8a4c' },
  { id: 'tidal', name: 'Tidal Edge', subtitle: 'Coastal cliffs & ocean', color: '#38d6c4' },
  { id: 'metro', name: 'Vertical Metropolis', subtitle: 'Modern urban skyline', color: '#c9a7ff' },
];
