// Block types and the procedurally drawn texture atlas (no external assets).
import * as THREE from 'three';

export const TILE = 16, COLS = 8, ROWS = 2;
// tile indices
const T = { grassTop: 0, grassSide: 1, dirt: 2, stone: 3, sand: 4, logSide: 5, logTop: 6, leaves: 7, planks: 8, brick: 9, glass: 10, lamp: 11, snow: 12, cobble: 13, wool: 14 };

/** id 0 is air. top/side/bottom are tile indices. */
export const BLOCKS = [
  null,
  { name: 'Grass', top: T.grassTop, side: T.grassSide, bottom: T.dirt },
  { name: 'Dirt', top: T.dirt, side: T.dirt, bottom: T.dirt },
  { name: 'Stone', top: T.stone, side: T.stone, bottom: T.stone },
  { name: 'Sand', top: T.sand, side: T.sand, bottom: T.sand },
  { name: 'Log', top: T.logTop, side: T.logSide, bottom: T.logTop },
  { name: 'Leaves', top: T.leaves, side: T.leaves, bottom: T.leaves, clear: true },
  { name: 'Planks', top: T.planks, side: T.planks, bottom: T.planks },
  { name: 'Bricks', top: T.brick, side: T.brick, bottom: T.brick },
  { name: 'Glass', top: T.glass, side: T.glass, bottom: T.glass, clear: true },
  { name: 'Lamp', top: T.lamp, side: T.lamp, bottom: T.lamp },
  { name: 'Snow', top: T.snow, side: T.snow, bottom: T.snow },
  { name: 'Cobblestone', top: T.cobble, side: T.cobble, bottom: T.cobble },
  { name: 'Wool', top: T.wool, side: T.wool, bottom: T.wool },
];
export const HOTBAR = [1, 2, 3, 4, 5, 7, 8, 9, 10];

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const hex = (r, g, b) => `rgb(${r | 0},${g | 0},${b | 0})`;

function noisy(g, x0, y0, base, amp) {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const n = (rnd() - 0.5) * amp;
    g.fillStyle = hex(base[0] + n, base[1] + n, base[2] + n);
    g.fillRect(x0 + x, y0 + y, 1, 1);
  }
}

export function makeAtlas() {
  const cv = document.createElement('canvas');
  cv.width = TILE * COLS; cv.height = TILE * ROWS;
  const g = cv.getContext('2d');
  seed = 7;
  const at = (i) => [(i % COLS) * TILE, Math.floor(i / COLS) * TILE];
  const fill = (i, base, amp) => { const [x, y] = at(i); noisy(g, x, y, base, amp); };
  fill(T.grassTop, [92, 168, 70], 36);
  fill(T.dirt, [134, 96, 62], 30);
  fill(T.stone, [128, 128, 130], 34);
  fill(T.sand, [222, 205, 150], 22);
  fill(T.logSide, [102, 78, 46], 26);
  { const [x, y] = at(T.logSide); g.fillStyle = 'rgba(40,28,14,.45)'; for (let i = 2; i < TILE; i += 4) g.fillRect(x + i, y, 1, TILE); }
  fill(T.logTop, [160, 128, 80], 22);
  { const [x, y] = at(T.logTop); g.strokeStyle = 'rgba(90,64,32,.8)'; g.strokeRect(x + 2.5, y + 2.5, 11, 11); g.strokeRect(x + 5.5, y + 5.5, 5, 5); }
  fill(T.planks, [182, 142, 84], 18);
  { const [x, y] = at(T.planks); g.fillStyle = 'rgba(80,52,22,.55)'; for (let i = 0; i < TILE; i += 4) g.fillRect(x, y + i, TILE, 1); }
  fill(T.brick, [168, 74, 58], 22);
  { const [x, y] = at(T.brick); g.fillStyle = 'rgba(220,210,200,.8)'; for (let r = 0; r < 4; r++) { g.fillRect(x, y + r * 4, TILE, 1); for (let c = (r % 2) * 4; c < TILE; c += 8) g.fillRect(x + c, y + r * 4, 1, 4); } }
  fill(T.snow, [240, 244, 250], 10);
  fill(T.cobble, [112, 112, 114], 40);
  { const [x, y] = at(T.cobble); g.fillStyle = 'rgba(30,30,32,.5)'; for (let i = 0; i < 9; i++) g.fillRect(x + ((rnd() * 14) | 0), y + ((rnd() * 14) | 0), 3, 1); }
  fill(T.wool, [225, 225, 230], 10);
  { const [x, y] = at(T.wool); g.fillStyle = 'rgba(0,0,0,.08)'; for (let i = 0; i < TILE; i += 2) g.fillRect(x + i, y, 1, TILE); }
  // grass side: dirt with a green fringe
  { const [x, y] = at(T.grassSide); noisy(g, x, y, [134, 96, 62], 30); for (let i = 0; i < TILE; i++) { const h = 3 + ((rnd() * 3) | 0); for (let j = 0; j < h; j++) { const n = (rnd() - 0.5) * 30; g.fillStyle = hex(92 + n, 168 + n, 70 + n); g.fillRect(x + i, y + j, 1, 1); } } }
  // leaves: cut-out pattern
  { const [x, y] = at(T.leaves); g.clearRect(x, y, TILE, TILE); for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) { if (rnd() < 0.18) continue; const n = (rnd() - 0.5) * 40; g.fillStyle = hex(52 + n, 132 + n, 48 + n); g.fillRect(x + i, y + j, 1, 1); } }
  // glass: pale tint with a frame
  { const [x, y] = at(T.glass); g.clearRect(x, y, TILE, TILE); g.fillStyle = 'rgba(190,230,255,.28)'; g.fillRect(x, y, TILE, TILE); g.fillStyle = 'rgba(235,248,255,.95)'; g.fillRect(x, y, TILE, 1); g.fillRect(x, y + 15, TILE, 1); g.fillRect(x, y, 1, TILE); g.fillRect(x + 15, y, 1, TILE); g.fillRect(x + 3, y + 3, 4, 1); g.fillRect(x + 3, y + 4, 1, 3); }
  // lamp: glowing
  { const [x, y] = at(T.lamp); noisy(g, x, y, [255, 214, 120], 24); g.strokeStyle = 'rgba(150,100,30,.8)'; g.strokeRect(x + .5, y + .5, 15, 15); g.beginPath(); g.moveTo(x + 8, y); g.lineTo(x + 8, y + 16); g.moveTo(x, y + 8); g.lineTo(x + 16, y + 8); g.stroke(); }
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, canvas: cv };
}

/** A small icon of a block for the hotbar. */
export function blockIcon(atlasCanvas, id) {
  const b = BLOCKS[id];
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const draw = (tile, dx, dy, dw, dh, shade) => {
    g.save(); g.globalAlpha = 1;
    g.drawImage(atlasCanvas, (tile % COLS) * TILE, Math.floor(tile / COLS) * TILE, TILE, TILE, dx, dy, dw, dh);
    if (shade) { g.fillStyle = `rgba(0,0,0,${shade})`; g.fillRect(dx, dy, dw, dh); }
    g.restore();
  };
  // isometric-ish cube: top rhombus approximated by a squashed top + two sides
  g.save(); g.translate(16, 4); g.transform(1, 0.5, -1, 0.5, 0, 0); g.drawImage(atlasCanvas, (b.top % COLS) * TILE, Math.floor(b.top / COLS) * TILE, TILE, TILE, 0, 0, 12, 12); g.restore();
  g.save(); g.translate(4, 10); g.transform(1, 0.5, 0, 1, 0, 0); g.drawImage(atlasCanvas, (b.side % COLS) * TILE, Math.floor(b.side / COLS) * TILE, TILE, TILE, 0, 0, 12, 14); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 0, 12, 14); g.restore();
  g.save(); g.translate(16, 16); g.transform(1, -0.5, 0, 1, 0, 0); g.drawImage(atlasCanvas, (b.side % COLS) * TILE, Math.floor(b.side / COLS) * TILE, TILE, TILE, 0, 0, 12, 14); g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 0, 12, 14); g.restore();
  return c;
}
