import type { Biome } from '../game/Track';
import type { GraphicsQuality } from './GameRenderer';
import { BIOME_THEMES, type BiomeTheme } from './BiomeTheme';
import { ellipse, hash, mix, rgba, shade, star, tint, type Ctx } from './draw';

/**
 * Parallax backdrop drawn in screen space: sky gradient, sun or moon,
 * drifting clouds and three silhouette layers (far, mid, near) with biome
 * motifs. Layers are pre-rendered into seamless tiles once per resize so a
 * frame is just a handful of drawImage calls.
 *
 * The look is painterly: every layer is lit from above, fogged toward its
 * feet and textured with soft brush dabs; sun rays and drifting light motes
 * add depth. The course itself stays crisp so hazards always read first.
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
  private mote: HTMLCanvasElement | null = null;
  private vignette: CanvasGradient | null = null;
  private vignetteCanvas: HTMLCanvasElement | null = null;
  private rays: HTMLCanvasElement | null = null;
  private sky: HTMLCanvasElement | null = null;
  private haze: CanvasGradient | null = null;

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
    g.addColorStop(0, shade(th.sky[0], 0.08));
    g.addColorStop(0.3, th.sky[0]);
    g.addColorStop(0.62, th.sky[1]);
    g.addColorStop(1, th.sky[2]);
    this.skyGrad = g;
    const hz = ctx.createLinearGradient(0, 0, 0, h);
    hz.addColorStop(0, rgba(th.sky[2], 0));
    hz.addColorStop(0.45, rgba(th.sky[2], th.night ? 0.08 : 0.12));
    hz.addColorStop(0.68, rgba(th.sky[2], th.night ? 0.24 : 0.38));
    hz.addColorStop(1, rgba(th.sky[2], th.night ? 0.12 : 0.2));
    this.haze = hz;
    const vg = ctx.createRadialGradient(w / 2, h * 0.48, Math.min(w, h) * 0.45, w / 2, h * 0.5, Math.hypot(w, h) * 0.62);
    vg.addColorStop(0, rgba(th.outline, 0));
    vg.addColorStop(1, rgba(th.outline, th.night ? 0.42 : 0.26));
    this.vignette = vg;
    this.rays = this.quality === 'low' || th.night ? null : this.buildRays(w, h);
    this.sky = this.buildSky(w, h, pr);
    this.vignetteCanvas = this.quality === 'high' ? this.buildVignette(w, h, pr) : null;
    const m = document.createElement('canvas');
    m.width = m.height = 64;
    const mc = m.getContext('2d')!;
    const mg = mc.createRadialGradient(32, 32, 0, 32, 32, 32);
    mg.addColorStop(0, rgba(tint(th.particle, 0.4), 0.95));
    mg.addColorStop(0.35, rgba(th.particle, 0.45));
    mg.addColorStop(1, rgba(th.particle, 0));
    mc.fillStyle = mg;
    mc.fillRect(0, 0, 64, 64);
    this.mote = m;
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
      { canvas: mk((c, lh) => (this.drawFar(c, lh, unit), this.paint(c, lh, lh * 0.45 - unit * 1.7, unit, 1, 11))), px: 0.12, py: 0.04, offset: -h * 0.36 },
      { canvas: mk((c, lh) => (this.drawMid(c, lh, unit), this.paint(c, lh, lh * 0.5 - unit * 2.2, unit, 0.6, 23))), px: 0.3, py: 0.1, offset: -h * 0.26 },
    ];
    if (this.quality !== 'low')
      this.layers.push({ canvas: mk((c, lh) => (this.drawNear(c, lh, unit), this.paint(c, lh, lh * 0.58 - unit * 1.2, unit, 0.25, 37))), px: 0.55, py: 0.2, offset: -h * 0.12 });
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
    // Sunlit rim along the ridge line.
    c.save();
    c.globalCompositeOperation = 'source-atop';
    c.beginPath();
    for (let i = 0; i < tops.length; i++) c.lineTo(i * 8, tops[i] + 1.5);
    c.lineWidth = 3;
    c.strokeStyle = rgba(this.theme.sun, this.theme.night ? 0.22 : 0.5);
    c.stroke();
    c.restore();
    return tops;
  }

  /**
   * Painterly finish for a layer tile, touching only what is already drawn:
   * warm light from above, fog toward the feet and soft brush dabs.
   */
  private paint(c: Ctx, lh: number, top: number, unit: number, fog: number, seed: number): void {
    const th = this.theme;
    c.save();
    c.globalCompositeOperation = 'source-atop';
    const g = c.createLinearGradient(0, top, 0, lh);
    g.addColorStop(0, rgba(th.sun, th.night ? 0.1 : 0.3));
    g.addColorStop(0.3, rgba(th.sun, 0));
    g.addColorStop(0.55, rgba(th.sky[2], 0));
    g.addColorStop(1, rgba(th.sky[2], 0.2 + fog * 0.35));
    c.fillStyle = g;
    c.fillRect(0, 0, TILE_W, lh);
    if (this.quality !== 'low') {
      const n = 180;
      for (let i = 0; i < n; i++) {
        const x = hash(seed * 31 + i * 1.7) * TILE_W;
        const y = top + hash(seed * 17 + i * 2.3) * (lh - top);
        const r = unit * (0.1 + hash(seed + i * 4.1) * 0.3);
        const rot = (hash(i * 5.5 + seed) - 0.5) * 0.7;
        c.fillStyle = hash(seed * 7 + i * 0.9) > 0.5 ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.045)';
        c.beginPath();
        for (const dx of [-TILE_W, 0, TILE_W]) ellipse(c, x + dx, y, r * 1.7, r * 0.65, rot);
        c.fill();
      }
    }
    c.restore();
  }

  private drawFar(c: Ctx, lh: number, unit: number): void {
    const th = this.theme;
    const base = lh * 0.45;
    if (this.biome === 'forest' || this.biome === 'snow') {
      // Distant ranges over the prairie / snowy peaks.
      this.silhouette(c, lh, base, unit * 1.3, 2, [1, 3, 7], th.far);
      c.save();
      c.globalAlpha = 0.45;
      this.silhouette(c, lh, base - unit * 0.05, unit * 1.3, 2, [1, 3, 7], tint(th.far, 0.4));
      c.restore();
    } else {
      // Flat-topped mesas and buttes.
      this.silhouette(c, lh, base, unit * 1.7, this.biome === 'canyon' ? 1 : 4, [2, 5, 9], th.far, true);
    }
    this.silhouette(c, lh, base + unit * 0.45, unit * 0.9, 3, [2, 4, 9], mix(th.far, th.mid, 0.4), this.biome !== 'forest' && this.biome !== 'snow');
  }

  private drawMid(c: Ctx, lh: number, unit: number): void {
    const th = this.theme;
    const base = lh * 0.5;
    const tops = this.silhouette(c, lh, base, unit * 0.55, 5, [2, 4, 6], th.mid);
    const at = (x: number) => tops[Math.max(0, Math.min(tops.length - 1, Math.round(x / 8)))];
    const col = shade(th.mid, 0.28);
    const glow = th.night ? '#ffcf5a' : null;
    // A few landmarks per tile, the rest small fillers.
    const marks =
      this.biome === 'forest'
        ? ['windmill', 'barn', 'fence', 'tree', 'fence', 'windmill', 'tree', 'fence']
        : this.biome === 'canyon'
          ? ['saloon', 'tower', 'cactus', 'saloon', 'cactus', 'rock', 'tower', 'cactus']
          : this.biome === 'sunset'
            ? ['saloon', 'shack', 'cactus', 'saloon', 'tower', 'shack', 'cactus', 'rock']
            : this.biome === 'snow'
              ? ['shack', 'pine', 'fence', 'pine', 'tower', 'shack', 'pine', 'fence']
              : ['mine', 'cactus', 'shack', 'cactus', 'tower', 'mine', 'cactus', 'rock'];
    for (let i = 0; i < marks.length; i++) {
      const x = ((i + 0.3 + hash(i * 4.4) * 0.4) / marks.length) * TILE_W;
      const y = at(x) + 3;
      const s = unit * (0.75 + hash(i * 2.2) * 0.35);
      c.fillStyle = col;
      c.strokeStyle = col;
      c.lineCap = 'round';
      switch (marks[i]) {
        case 'pine':
          drawPine(c, x, y, s * 1.6, col);
          break;
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
          drawCanopy(c, x, y, s * 1.15, mix(col, '#4f6a32', 0.45), i);
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
      if (this.biome === 'snow') {
        // Snowy pines and drifts.
        if (kind !== 1) drawPine(c, x, y, s * 1.5, shade(th.near, 0.1));
        else {
          c.beginPath();
          ellipse(c, x, y - s * 0.15, s * 0.6, s * 0.25);
          c.fillStyle = '#f4f8ff';
          c.fill();
        }
      } else if (this.biome === 'forest') {
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
        } else if (kind === 1) {
          drawCanopy(c, x, y + s * 0.3, s * 0.75, mix(th.near, '#6f8a4a', 0.55), i, true);
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
    const th = this.theme;
    const cy = unit * 1.7;
    const parts = [
      [0.55, 0.12, 0.5],
      [1.05, -0.22, 0.66],
      [1.65, -0.08, 0.6],
      [2.15, 0.12, 0.45],
      [1.3, 0.25, 0.6],
    ];
    const puffs = (dx: number, dy: number, k: number) => {
      c.beginPath();
      for (const [x, y, r] of parts) ellipse(c, (x + dx) * unit, cy + (y + dy) * unit, r * k * unit, r * k * unit * 0.78);
    };
    c.globalAlpha = th.night ? 0.3 : 0.95;
    // Shaded belly, sunlit body, then a bright crown: soft painted volume.
    puffs(0, 0.04, 1);
    c.fillStyle = mix(th.cloud, th.sky[0], th.night ? 0.2 : 0.32);
    c.fill();
    puffs(-0.04, -0.06, 0.92);
    c.fillStyle = th.cloud;
    c.fill();
    puffs(-0.1, -0.16, 0.6);
    c.fillStyle = tint(th.cloud, 0.5);
    c.globalAlpha *= 0.7;
    c.fill();
    c.globalAlpha = 1;
  }

  draw(ctx: Ctx, w: number, h: number, pr: number, camX: number, camY: number, scale: number, time: number): void {
    this.build(ctx, w, h, pr);
    const th = this.theme;
    // Sky, sun or moon, rays and horizon haze come pre-rendered in one opaque copy.
    ctx.drawImage(this.sky!, 0, 0, w, h);
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
      // Whole device pixels: a 1:1 copy skips the costly resampling of a fractional offset.
      const top = Math.round((horizon + l.offset + camY * scale * l.py) * pr) / pr;
      let x0 = Math.round((-(((camX * scale * l.px) % lw) + lw) % lw) * pr) / pr;
      for (; x0 < w; x0 += lw) ctx.drawImage(l.canvas, x0, top, lw, lh);
      if (top + lh < h) {
        ctx.fillStyle = l === this.layers[this.layers.length - 1] ? th.near : th.mid;
        ctx.fillRect(0, top + lh - 1, w, h - top - lh + 1);
      }
    }
  }

  /**
   * Screen-space finish drawn over the world: drifting light motes and a soft
   * vignette. Both stay clear of the middle of the screen where racing happens.
   */
  drawOverlay(ctx: Ctx, w: number, h: number, camX: number, scale: number, time: number): void {
    if (this.quality === 'low' || !this.mote) return;
    const u = h / 720;
    for (let i = 0; i < 16; i++) {
      const depth = 0.4 + hash(i * 9.7) * 0.8;
      const span = w + 80;
      const x = ((((hash(i * 4.3) * span - camX * scale * depth * 0.5 - time * (6 + i)) % span) + span) % span) - 40;
      const y = h * (0.08 + hash(i * 2.9) * 0.8) + Math.sin(time * (0.5 + hash(i) * 0.6) + i) * 14 * u;
      const r = (4 + hash(i * 6.1) * 10) * u * depth;
      ctx.globalAlpha = (0.25 + 0.35 * Math.abs(Math.sin(time * 0.9 + i * 2.1))) * (this.theme.night ? 1 : 0.7);
      ctx.drawImage(this.mote, x - r, y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    if (this.vignetteCanvas) ctx.drawImage(this.vignetteCanvas, 0, 0, w, h);
  }

  /** The static sky: gradient, horizon haze, sun glow and disc (or moon) and sun rays. */
  private buildSky(w: number, h: number, pr: number): HTMLCanvasElement {
    const th = this.theme;
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * pr);
    c.height = Math.ceil(h * pr);
    const ctx = c.getContext('2d')!;
    ctx.scale(pr, pr);
    ctx.fillStyle = this.skyGrad!;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = this.haze!;
    ctx.fillRect(0, 0, w, h);
    const sunX = w * 0.78;
    const sunY = h * 0.2;
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
      // Soft painted sun: a bright core melting into its halo.
      const sg = ctx.createRadialGradient(sunX - h * 0.01, sunY - h * 0.01, 0, sunX, sunY, h * 0.085);
      sg.addColorStop(0, tint(th.sun, 0.7));
      sg.addColorStop(0.75, th.sun);
      sg.addColorStop(1, rgba(th.sun, 0));
      ctx.beginPath();
      ellipse(ctx, sunX, sunY, h * 0.085, h * 0.085);
      ctx.fillStyle = sg;
      ctx.fill();
    }
    if (this.rays) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.rays, 0, 0, w, h);
    }
    return c;
  }

  /** Quarter-resolution canvas: full-screen soft effects are fill-rate heavy on phones. */
  private lowRes(w: number, h: number, draw: (c: Ctx) => void): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w / 4));
    c.height = Math.max(1, Math.ceil(h / 4));
    const cx = c.getContext('2d')!;
    cx.scale(c.width / w, c.height / h);
    draw(cx);
    return c;
  }

  private buildVignette(w: number, h: number, pr: number): HTMLCanvasElement {
    // Full resolution: a 1:1 copy is far cheaper than a scaled one every frame.
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * pr);
    c.height = Math.ceil(h * pr);
    const cx = c.getContext('2d')!;
    cx.scale(pr, pr);
    cx.fillStyle = this.vignette!;
    cx.fillRect(0, 0, w, h);
    return c;
  }

  private buildRays(w: number, h: number): HTMLCanvasElement {
    const th = this.theme;
    const sunX = w * 0.78;
    const sunY = h * 0.2;
    return this.lowRes(w, h, (c) => {
      const len = Math.hypot(w, h);
      const rg = c.createRadialGradient(sunX, sunY, h * 0.04, sunX, sunY, len * 0.85);
      rg.addColorStop(0, rgba(th.sun, 0.04));
      rg.addColorStop(0.6, rgba(th.sun, 0.018));
      rg.addColorStop(1, rgba(th.sun, 0));
      c.fillStyle = rg;
      const r0 = h * 0.12;
      for (let i = 0; i < 4; i++) {
        const a = Math.PI * 0.68 + (i - 1.5) * 0.22 + (hash(i * 7.7) - 0.5) * 0.06;
        const half = 0.06 + hash(i * 3.3) * 0.05;
        // Nested wedges give each ray soft edges.
        for (const k of [1, 0.75, 0.5, 0.25]) {
          c.beginPath();
          c.moveTo(sunX + Math.cos(a) * r0, sunY + Math.sin(a) * r0);
          c.lineTo(sunX + Math.cos(a - half * k) * len, sunY + Math.sin(a - half * k) * len);
          c.lineTo(sunX + Math.cos(a + half * k) * len, sunY + Math.sin(a + half * k) * len);
          c.closePath();
          c.fill();
        }
      }
    });
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

/**
 * Rounded painted tree (or bush when `bush`): a clump of leafy blobs, darker
 * underneath and lit on top, standing on (x, y) in screen space.
 */
function drawCanopy(c: Ctx, x: number, y: number, s: number, color: string, seed: number, bush = false): void {
  if (!bush) {
    c.fillStyle = shade(color, 0.45);
    c.beginPath();
    c.moveTo(x - s * 0.08, y);
    c.quadraticCurveTo(x - s * 0.04, y - s * 0.5, x - s * 0.02, y - s * 0.9);
    c.lineTo(x + s * 0.05, y - s * 0.9);
    c.quadraticCurveTo(x + s * 0.06, y - s * 0.5, x + s * 0.1, y);
    c.fill();
  }
  const cy = bush ? y - s * 0.35 : y - s * 1.15;
  const blobs = bush ? 4 : 6;
  const pts: number[][] = [];
  for (let k = 0; k < blobs; k++) {
    const a = (k / blobs) * Math.PI * 2 + hash(seed * 3 + k);
    const d = s * (bush ? 0.28 : 0.32) * (0.6 + hash(seed + k * 1.3) * 0.5);
    pts.push([x + Math.cos(a) * d * 1.25, cy + Math.sin(a) * d * 0.75, s * (bush ? 0.3 : 0.36) * (0.75 + hash(seed * 5 + k) * 0.4)]);
  }
  c.fillStyle = shade(color, 0.22);
  c.beginPath();
  for (const [px, py, r] of pts) ellipse(c, px, py, r, r * 0.9);
  c.fill();
  c.fillStyle = color;
  c.beginPath();
  for (const [px, py, r] of pts) ellipse(c, px - r * 0.08, py - r * 0.14, r * 0.85, r * 0.75);
  c.fill();
  c.fillStyle = tint(color, 0.22);
  c.beginPath();
  for (const [px, py, r] of pts) if (py < cy + s * 0.05) ellipse(c, px - r * 0.18, py - r * 0.32, r * 0.45, r * 0.35);
  c.fill();
}

/** Pine tree silhouette with snow on each tier. */
function drawPine(c: Ctx, x: number, y: number, s: number, color: string): void {
  c.fillStyle = color;
  c.fillRect(x - s * 0.05, y - s * 0.25, s * 0.1, s * 0.25);
  for (let k = 0; k < 3; k++) {
    const by = y - s * (0.2 + k * 0.28);
    const w = s * (0.42 - k * 0.1);
    c.beginPath();
    c.moveTo(x - w, by);
    c.lineTo(x, by - s * 0.42);
    c.lineTo(x + w, by);
    c.closePath();
    c.fillStyle = color;
    c.fill();
    c.beginPath();
    c.moveTo(x - w * 0.45, by - s * 0.24);
    c.lineTo(x, by - s * 0.42);
    c.lineTo(x + w * 0.45, by - s * 0.24);
    c.closePath();
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.fill();
  }
}
