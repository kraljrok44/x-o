import type { Biome } from '../game/Track';
import type { GraphicsQuality } from './GameRenderer';
import { BIOME_THEMES, type BiomeTheme } from './BiomeTheme';
import { ellipse, hash, mix, rgba, shade, star, tint, type Ctx } from './draw';

/**
 * Parallax backdrop drawn in screen space: sky gradient, sun or moon,
 * drifting clouds and three silhouette layers (far, mid, near) with biome
 * motifs. Layers are pre-rendered into seamless tiles once per resize so a
 * frame is just a handful of drawImage calls.
 */

interface Layer {
  canvas: HTMLCanvasElement;
  /** Horizontal and vertical parallax factors (0 = fixed, 1 = moves with the world). */
  px: number;
  py: number;
  /** Tile top relative to the horizon line (px). */
  offset: number;
}

const TILE_W = 1600;

/** Periodic noise over one tile so tiles wrap seamlessly. */
function ridge(x: number, seed: number, octaves: number[]): number {
  let v = 0;
  let norm = 0;
  for (let i = 0; i < octaves.length; i++) {
    const f = octaves[i];
    const ph = hash(seed * 13 + i) * Math.PI * 2;
    const amp = 1 / (i + 1);
    v += Math.sin((x / TILE_W) * Math.PI * 2 * f + ph) * amp;
    norm += amp;
  }
  return v / norm;
}

export class Background {
  readonly theme: BiomeTheme;
  private layers: Layer[] = [];
  private cloud: HTMLCanvasElement | null = null;
  private skyGrad: CanvasGradient | null = null;
  private builtFor = '';
  private stars: { x: number; y: number; r: number; tw: number }[] = [];

  constructor(
    readonly biome: Biome,
    private readonly quality: GraphicsQuality,
  ) {
    this.theme = BIOME_THEMES[biome];
    for (let i = 0; i < 90; i++) this.stars.push({ x: hash(i * 3.1), y: hash(i * 7.7) * 0.6, r: 0.6 + hash(i * 1.9) * 1.6, tw: hash(i * 5.3) * 6 });
  }

  private build(ctx: Ctx, w: number, h: number, pr: number): void {
    const key = `${w}x${h}@${pr}`;
    if (key === this.builtFor) return;
    this.builtFor = key;
    const th = this.theme;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, th.sky[0]);
    g.addColorStop(0.55, th.sky[1]);
    g.addColorStop(1, th.sky[2]);
    this.skyGrad = g;
    const layerH = Math.ceil(h * 0.75);
    const mk = (draw: (c: Ctx, lh: number) => void, lh = layerH): HTMLCanvasElement => {
      const c = document.createElement('canvas');
      c.width = Math.ceil(TILE_W * pr);
      c.height = Math.ceil(lh * pr);
      const cx = c.getContext('2d')!;
      cx.scale(pr, pr);
      draw(cx, lh);
      return c;
    };
    const unit = Math.min(w / 19, h / 9.5);
    this.layers = [
      { canvas: mk((c, lh) => this.drawFar(c, lh, unit)), px: 0.12, py: 0.04, offset: -h * 0.36 },
      { canvas: mk((c, lh) => this.drawMid(c, lh, unit)), px: 0.3, py: 0.1, offset: -h * 0.26 },
    ];
    if (this.quality !== 'low') this.layers.push({ canvas: mk((c, lh) => this.drawNear(c, lh, unit)), px: 0.55, py: 0.2, offset: -h * 0.12 });
    this.cloud = mk((c) => this.drawCloud(c, unit), unit * 3);
  }

  private silhouette(c: Ctx, lh: number, base: number, amp: number, seed: number, octaves: number[], color: string, flatTops = false): number[] {
    const tops: number[] = [];
    c.beginPath();
    c.moveTo(0, lh);
    for (let x = 0; x <= TILE_W; x += 8) {
      let n = ridge(x, seed, octaves);
      if (flatTops) n = Math.round(n * 2.2) / 2.2;
      const y = base - n * amp;
      tops.push(y);
      c.lineTo(x, y);
    }
    c.lineTo(TILE_W, lh);
    c.closePath();
    c.fillStyle = color;
    c.fill();
    return tops;
  }

  private drawFar(c: Ctx, lh: number, unit: number): void {
    const th = this.theme;
    const base = lh * 0.45;
    if (this.biome === 'forest') {
      // Distant blue ranges over the prairie.
      this.silhouette(c, lh, base, unit * 1.3, 2, [1, 3, 7], th.far);
      c.save();
      c.globalAlpha = 0.45;
      this.silhouette(c, lh, base - unit * 0.05, unit * 1.3, 2, [1, 3, 7], tint(th.far, 0.4));
      c.restore();
    } else {
      // Flat-topped mesas and buttes.
      this.silhouette(c, lh, base, unit * 1.7, this.biome === 'canyon' ? 1 : 4, [2, 5, 9], th.far, true);
    }
    this.silhouette(c, lh, base + unit * 0.45, unit * 0.9, 3, [2, 4, 9], mix(th.far, th.mid, 0.4), this.biome !== 'forest');
  }

  private drawMid(c: Ctx, lh: number, unit: number): void {
    const th = this.theme;
    const base = lh * 0.5;
    const tops = this.silhouette(c, lh, base, unit * 0.55, 5, [2, 4, 6], th.mid);
    const at = (x: number) => tops[Math.max(0, Math.min(tops.length - 1, Math.round(x / 8)))];
    const col = shade(th.mid, 0.28);
    const glow = th.night ? '#ffcf5a' : null;
    // A few landmarks per tile, the rest small fillers.
    const marks = this.biome === 'forest' ? ['windmill', 'barn', 'fence', 'tree', 'fence', 'windmill', 'tree', 'fence'] : this.biome === 'canyon' ? ['saloon', 'tower', 'cactus', 'saloon', 'cactus', 'rock', 'tower', 'cactus'] : ['mine', 'cactus', 'shack', 'cactus', 'tower', 'mine', 'cactus', 'rock'];
    for (let i = 0; i < marks.length; i++) {
      const x = ((i + 0.3 + hash(i * 4.4) * 0.4) / marks.length) * TILE_W;
      const y = at(x) + 3;
      const s = unit * (0.75 + hash(i * 2.2) * 0.35);
      c.fillStyle = col;
      c.strokeStyle = col;
      c.lineCap = 'round';
      switch (marks[i]) {
        case 'windmill': {
          c.fillRect(x - s * 0.06, y - s * 1.9, s * 0.12, s * 1.9);
          c.beginPath();
          c.moveTo(x - s * 0.35, y);
          c.lineTo(x - s * 0.05, y - s * 1.9);
          c.lineTo(x + s * 0.05, y - s * 1.9);
          c.lineTo(x + s * 0.35, y);
          c.lineWidth = s * 0.06;
          c.stroke();
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            c.beginPath();
            c.moveTo(x, y - s * 1.95);
            c.lineTo(x + Math.cos(a) * s * 0.55, y - s * 1.95 + Math.sin(a) * s * 0.55);
            c.lineWidth = s * 0.09;
            c.stroke();
          }
          break;
        }
        case 'barn':
          c.beginPath();
          c.moveTo(x - s * 0.7, y);
          c.lineTo(x - s * 0.7, y - s * 0.7);
          c.lineTo(x - s * 0.45, y - s * 1.05);
          c.lineTo(x + s * 0.45, y - s * 1.05);
          c.lineTo(x + s * 0.7, y - s * 0.7);
          c.lineTo(x + s * 0.7, y);
          c.fill();
          break;
        case 'fence':
          c.lineWidth = s * 0.06;
          c.beginPath();
          for (let k = 0; k < 6; k++) {
            c.moveTo(x + k * s * 0.35, y);
            c.lineTo(x + k * s * 0.35, y - s * 0.4);
          }
          c.moveTo(x, y - s * 0.32);
          c.lineTo(x + s * 1.75, y - s * 0.32);
          c.moveTo(x, y - s * 0.16);
          c.lineTo(x + s * 1.75, y - s * 0.16);
          c.stroke();
          break;
        case 'tree':
          c.fillRect(x - s * 0.06, y - s * 0.8, s * 0.12, s * 0.85);
          c.beginPath();
          ellipse(c, x, y - s * 1.0, s * 0.45, s * 0.35);
          c.fill();
          break;
        case 'saloon':
        case 'shack': {
          const w = marks[i] === 'saloon' ? s * 1.5 : s * 0.9;
          const hgt = marks[i] === 'saloon' ? s * 1.25 : s * 0.75;
          // False-front facade.
          c.fillRect(x - w / 2, y - hgt, w, hgt);
          c.fillRect(x - w * 0.35, y - hgt - s * 0.25, w * 0.7, s * 0.3);
          if (glow) {
            c.fillStyle = glow;
            for (const dx of [-0.25, 0.15]) c.fillRect(x + dx * w, y - hgt * 0.65, w * 0.14, hgt * 0.22);
          } else {
            c.fillStyle = shade(col, 0.25);
            c.fillRect(x - w * 0.12, y - hgt * 0.5, w * 0.24, hgt * 0.5);
          }
          break;
        }
        case 'tower': {
          c.lineWidth = s * 0.06;
          c.beginPath();
          c.moveTo(x - s * 0.35, y);
          c.lineTo(x - s * 0.25, y - s * 1.2);
          c.moveTo(x + s * 0.35, y);
          c.lineTo(x + s * 0.25, y - s * 1.2);
          c.moveTo(x - s * 0.3, y - s * 0.6);
          c.lineTo(x + s * 0.3, y - s * 0.6);
          c.stroke();
          c.beginPath();
          roundRectPath(c, x - s * 0.4, y - s * 1.75, s * 0.8, s * 0.6, s * 0.1);
          c.fill();
          c.beginPath();
          c.moveTo(x - s * 0.45, y - s * 1.75);
          c.lineTo(x, y - s * 2.05);
          c.lineTo(x + s * 0.45, y - s * 1.75);
          c.fill();
          break;
        }
        case 'mine': {
          c.beginPath();
          c.moveTo(x - s * 0.9, y);
          c.quadraticCurveTo(x, y - s * 1.8, x + s * 0.9, y);
          c.fill();
          c.fillStyle = shade(col, 0.6);
          c.beginPath();
          c.moveTo(x - s * 0.35, y);
          c.lineTo(x - s * 0.35, y - s * 0.5);
          c.quadraticCurveTo(x, y - s * 0.8, x + s * 0.35, y - s * 0.5);
          c.lineTo(x + s * 0.35, y);
          c.fill();
          if (glow) {
            const g = c.createRadialGradient(x, y - s * 0.3, 0, x, y - s * 0.3, s * 0.6);
            g.addColorStop(0, rgba(glow, 0.7));
            g.addColorStop(1, rgba(glow, 0));
            c.fillStyle = g;
            c.fillRect(x - s * 0.6, y - s * 0.9, s * 1.2, s * 0.9);
          }
          break;
        }
        case 'cactus':
          drawCactus(c, x, y, s * 0.9, col);
          break;
        case 'rock':
          c.beginPath();
          c.moveTo(x - s * 0.5, y);
          c.lineTo(x - s * 0.3, y - s * 0.9);
          c.lineTo(x + s * 0.2, y - s * 1.1);
          c.lineTo(x + s * 0.5, y);
          c.fill();
          break;
      }
    }
  }

  private drawNear(c: Ctx, lh: number, unit: number): void {
    const th = this.theme;
    const base = lh * 0.58;
    const tops = this.silhouette(c, lh, base, unit * 0.4, 8, [3, 7, 11], th.near);
    const at = (x: number) => tops[Math.max(0, Math.min(tops.length - 1, Math.round(x / 8)))];
    for (let i = 0; i < 22; i++) {
      const x = (i / 22) * TILE_W + hash(i * 9.1) * 40;
      const y = at(x) + 2;
      const s = unit * (0.3 + hash(i * 3.3) * 0.3);
      const kind = i % 3;
      if (this.biome === 'forest') {
        if (kind === 0) {
          // Round hay bale.
          c.beginPath();
          ellipse(c, x, y - s * 0.4, s * 0.55, s * 0.42);
          c.fillStyle = '#d9b45a';
          c.fill();
          c.strokeStyle = shade('#d9b45a', 0.3);
          c.lineWidth = 2;
          c.beginPath();
          ellipse(c, x, y - s * 0.4, s * 0.3, s * 0.22);
          c.stroke();
        } else {
          c.beginPath();
          for (let k = -2; k <= 2; k++) {
            c.moveTo(x + k * s * 0.12, y);
            c.quadraticCurveTo(x + k * s * 0.15, y - s * 0.4, x + k * s * 0.25, y - s * (0.6 - Math.abs(k) * 0.1));
          }
          c.strokeStyle = shade(th.near, 0.15);
          c.lineWidth = 3;
          c.stroke();
        }
      } else if (kind === 0) drawCactus(c, x, y, s * 1.2, shade(th.near, this.theme.night ? 0.35 : 0.2));
      else if (kind === 1) {
        // Tumbleweed / boulder.
        c.beginPath();
        ellipse(c, x, y - s * 0.3, s * 0.35, s * 0.3);
        c.fillStyle = shade(th.near, 0.15);
        c.fill();
      } else if (this.theme.night) {
        // Lantern post.
        c.fillStyle = shade(th.near, 0.4);
        c.fillRect(x - 2, y - s * 1.4, 4, s * 1.4);
        const g = c.createRadialGradient(x, y - s * 1.4, 0, x, y - s * 1.4, s * 0.6);
        g.addColorStop(0, 'rgba(255,207,90,0.9)');
        g.addColorStop(1, 'rgba(255,207,90,0)');
        c.fillStyle = g;
        c.fillRect(x - s * 0.6, y - s * 2, s * 1.2, s * 1.2);
      }
    }
  }

  private drawCloud(c: Ctx, unit: number): void {
    const cy = unit * 1.6;
    c.fillStyle = this.theme.cloud;
    c.globalAlpha = this.theme.night ? 0.25 : 0.9;
    c.beginPath();
    const parts = [
      [0.6, 0.0, 0.55],
      [1.2, -0.25, 0.7],
      [1.9, 0.0, 0.55],
      [1.25, 0.2, 0.6],
    ];
    for (const [x, y, r] of parts) ellipse(c, x * unit, cy + y * unit, r * unit, r * unit * 0.75);
    c.fill();
    c.globalAlpha = 1;
  }

  draw(ctx: Ctx, w: number, h: number, pr: number, camX: number, camY: number, scale: number, time: number): void {
    this.build(ctx, w, h, pr);
    const th = this.theme;
    ctx.fillStyle = this.skyGrad!;
    ctx.fillRect(0, 0, w, h);

    // Sun / moon and stars.
    const sunX = w * 0.78;
    const sunY = h * 0.2;
    if (th.night) {
      for (const s of this.stars) {
        ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(time * 0.8 + s.tw));
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        star(ctx, s.x * w, s.y * h, s.r * 1.6, 0.4, 4, time * 0.2 + s.tw);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, h * 0.25);
    glow.addColorStop(0, rgba(th.sun, 0.7));
    glow.addColorStop(1, rgba(th.sun, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - h * 0.25, sunY - h * 0.25, h * 0.5, h * 0.5);
    if (th.night) {
      // Crescent moon: the disc minus an offset disc (even-odd fill inside a clip).
      ctx.save();
      ctx.beginPath();
      ellipse(ctx, sunX, sunY, h * 0.07, h * 0.07);
      ctx.clip();
      ctx.beginPath();
      ellipse(ctx, sunX, sunY, h * 0.07, h * 0.07);
      ellipse(ctx, sunX + h * 0.03, sunY - h * 0.015, h * 0.06, h * 0.06);
      ctx.fillStyle = th.sun;
      ctx.fill('evenodd');
      ctx.restore();
    } else {
      ctx.beginPath();
      ellipse(ctx, sunX, sunY, h * 0.07, h * 0.07);
      ctx.fillStyle = th.sun;
      ctx.fill();
    }

    // Clouds drift on their own and with a little parallax.
    if (this.cloud) {
      const cw = this.cloud.width / pr;
      const ch = this.cloud.height / pr;
      for (let i = 0; i < 5; i++) {
        const span = w + cw * 2;
        const x = ((((hash(i * 2.7) * span - camX * scale * 0.04 - time * (8 + i * 3)) % span) + span) % span) - cw;
        const y = h * (0.06 + hash(i * 5.1) * 0.28);
        const s = 0.6 + hash(i * 1.3) * 0.7;
        ctx.drawImage(this.cloud, x, y, cw * s, ch * s);
      }
    }

    // Silhouette layers, tiled.
    const horizon = h * 0.62;
    for (const l of this.layers) {
      const lw = l.canvas.width / pr;
      const lh = l.canvas.height / pr;
      const top = horizon + l.offset + camY * scale * l.py;
      let x0 = -(((camX * scale * l.px) % lw) + lw) % lw;
      for (; x0 < w; x0 += lw) ctx.drawImage(l.canvas, x0, top, lw, lh);
      if (top + lh < h) {
        ctx.fillStyle = l === this.layers[this.layers.length - 1] ? th.near : th.mid;
        ctx.fillRect(0, top + lh - 1, w, h - top - lh + 1);
      }
    }
  }
}

function roundRectPath(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Saguaro silhouette standing on (x, y) in screen space (y down). */
export function drawCactus(c: Ctx, x: number, y: number, s: number, color: string): void {
  c.strokeStyle = color;
  c.lineCap = 'round';
  c.lineWidth = s * 0.22;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x, y - s * 1.3);
  c.moveTo(x, y - s * 0.55);
  c.quadraticCurveTo(x - s * 0.38, y - s * 0.55, x - s * 0.38, y - s * 0.95);
  c.moveTo(x, y - s * 0.75);
  c.quadraticCurveTo(x + s * 0.34, y - s * 0.75, x + s * 0.34, y - s * 1.08);
  c.stroke();
}
