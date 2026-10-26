import { GameplayConfig } from '../config/GameplayConfig';
import type { Track, GroundPiece } from '../game/Track';
import type { Entity } from '../game/RaceState';
import {
  CRUSHER_BLOCK,
  boulderPosition,
  crusherLift,
  crusherWarning,
  flameState,
  pendulumBall,
  sawCenter,
  type Hazard,
  type Point,
} from '../obstacles/ObstacleBase';
import type { GraphicsQuality } from './GameRenderer';
import type { BiomeTheme } from './BiomeTheme';
import { ellipse, hash, mix, rgba, roundRect, shade, star, tint, type Ctx } from './draw';

/**
 * Paints the course in world space (+y up): terrain runs with grass caps,
 * floating platforms, decorations, every hazard in its current state,
 * pickups and ability entities. Reads the track and the race clock only.
 */

const OL_W = 0.055;

interface Run {
  /** Polyline of the walkable top, including vertical step faces. */
  pts: number[];
  x0: number;
  x1: number;
  minY: number;
}

interface Decor {
  x: number;
  y: number;
  kind: number;
  size: number;
}

const tmp: Point = { x: 0, y: 0 };

export class WorldPainter {
  private readonly runs: Run[] = [];
  private readonly platforms: GroundPiece[] = [];
  private readonly decor: Decor[] = [];
  /** Time each spring was last bounced on (for its squash animation). */
  private readonly springBounce = new Map<number, number>();
  /** Item boxes popped this session: when (for the pop/respawn animation). */
  private readonly boxPopped = new Map<number, number>();

  constructor(
    private readonly track: Track,
    private readonly th: BiomeTheme,
    private readonly quality: GraphicsQuality,
  ) {
    this.buildRuns();
    this.buildDecor();
  }

  private buildRuns(): void {
    const solid = this.track.data.pieces.filter((p) => !p.oneWay).sort((a, b) => a.x0 - b.x0);
    this.platforms.push(...this.track.data.pieces.filter((p) => p.oneWay));
    let cur: Run | null = null;
    for (const p of solid) {
      if (cur && Math.abs(p.x0 - cur.x1) < 1e-6) {
        const lastY = cur.pts[cur.pts.length - 1];
        if (Math.abs(lastY - p.y0) > 1e-6) cur.pts.push(p.x0, p.y0);
        cur.pts.push(p.x1, p.y1);
        cur.x1 = p.x1;
        cur.minY = Math.min(cur.minY, p.y0, p.y1);
      } else {
        cur = { pts: [p.x0, p.y0, p.x1, p.y1], x0: p.x0, x1: p.x1, minY: Math.min(p.y0, p.y1) };
        this.runs.push(cur);
      }
    }
  }

  private buildDecor(): void {
    const len = this.track.length + 60;
    const step = this.quality === 'low' ? 2.6 : 1.5;
    for (let x = -18; x < len; x += step) {
      const jx = x + hash(x * 1.7) * step * 0.8;
      const y = this.track.solidTop(jx);
      if (Number.isNaN(y)) continue;
      // Keep decorations off hazards so they never hide a threat.
      let clear = true;
      this.track.forHazardsNear(jx - 0.8, jx + 0.8, () => (clear = false));
      if (!clear) continue;
      // Skip slopes' steep parts and edges.
      const yl = this.track.solidTop(jx - 0.3);
      const yr = this.track.solidTop(jx + 0.3);
      if (Number.isNaN(yl) || Number.isNaN(yr) || Math.abs(yl - yr) > 0.25) continue;
      this.decor.push({ x: jx, y, kind: Math.floor(hash(jx * 3.3) * 6), size: 0.7 + hash(jx * 5.1) * 0.6 });
    }
  }

  onBounce(hazardId: number, time: number): void {
    this.springBounce.set(hazardId, time);
  }

  onBoxPicked(index: number, time: number): void {
    this.boxPopped.set(index, time);
  }

  // --- terrain ---------------------------------------------------------------------

  drawPitShade(ctx: Ctx, left: number, right: number, bottom: number): void {
    const top = -0.4;
    const g = ctx.createLinearGradient(0, top, 0, Math.min(bottom, top - 3));
    g.addColorStop(0, rgba(this.th.pit, 0));
    g.addColorStop(1, rgba(this.th.pit, 0.97));
    ctx.fillStyle = g;
    ctx.fillRect(left, bottom, right - left, top - bottom);
  }

  drawTerrain(ctx: Ctx, left: number, right: number, bottom: number): void {
    const th = this.th;
    const flat = this.quality === 'low';
    for (const run of this.runs) {
      if (run.x1 < left || run.x0 > right) continue;
      const pts = run.pts;
      // Soil body.
      ctx.beginPath();
      ctx.moveTo(pts[0], bottom);
      for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.lineTo(pts[pts.length - 2], bottom);
      ctx.closePath();
      if (flat) ctx.fillStyle = th.soil;
      else {
        const g = ctx.createLinearGradient(0, run.minY, 0, run.minY - 4);
        g.addColorStop(0, th.soil);
        g.addColorStop(1, th.soilDeep);
        ctx.fillStyle = g;
      }
      ctx.fill();

      ctx.save();
      ctx.clip();
      // Specks (pebbles, roots, gems) at deterministic world positions.
      if (!flat) {
        const x0 = Math.max(run.x0, left);
        const x1 = Math.min(run.x1, right);
        for (let x = Math.floor(x0 * 1.25) / 1.25; x < x1; x += 0.8) {
          const top = this.track.solidTop(x);
          if (Number.isNaN(top)) continue;
          for (let k = 0; k < 2; k++) {
            const sx = x + hash(x * 7.1 + k) * 0.8;
            const sy = top - 0.55 - hash(x * 3.7 + k * 11) * 3.2;
            const r = 0.05 + hash(x * 9.3 + k) * 0.08;
            ctx.beginPath();
            ellipse(ctx, sx, sy, r * 1.3, r);
            ctx.fillStyle = th.speck[(k + Math.floor(x * 5)) % th.speck.length];
            ctx.fill();
          }
        }
      }
      // Grass cap: a thick band along non-vertical segments, scalloped underneath.
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i + 3 < pts.length; i += 2) {
        if (Math.abs(pts[i + 2] - pts[i]) < 1e-6) continue;
        ctx.moveTo(pts[i] - 0.05, pts[i + 1]);
        ctx.lineTo(pts[i + 2] + 0.05, pts[i + 3]);
      }
      ctx.lineWidth = 0.56;
      ctx.strokeStyle = th.grass;
      ctx.stroke();
      if (!flat) {
        // Scallops hanging under the cap.
        ctx.fillStyle = th.grass;
        for (let i = 0; i + 3 < pts.length; i += 2) {
          const ax = pts[i];
          const bx = pts[i + 2];
          if (Math.abs(bx - ax) < 1e-6) continue;
          const sx0 = Math.max(ax, left);
          const sx1 = Math.min(bx, right);
          for (let x = Math.ceil(sx0 / 0.42) * 0.42; x < sx1; x += 0.42) {
            const k = (x - ax) / (bx - ax);
            const y = pts[i + 1] + (pts[i + 3] - pts[i + 1]) * k;
            ctx.beginPath();
            ellipse(ctx, x, y - 0.26, 0.17, 0.12);
            ctx.fill();
          }
        }
        // Light strip on top of the grass.
        ctx.beginPath();
        for (let i = 0; i + 3 < pts.length; i += 2) {
          if (Math.abs(pts[i + 2] - pts[i]) < 1e-6) continue;
          ctx.moveTo(pts[i], pts[i + 1] - 0.08);
          ctx.lineTo(pts[i + 2], pts[i + 3] - 0.08);
        }
        ctx.lineWidth = 0.08;
        ctx.strokeStyle = th.grassLight;
        ctx.stroke();
      }
      ctx.restore();

      // Outline: top polyline and both ends down to the bottom.
      ctx.beginPath();
      ctx.moveTo(pts[0], bottom);
      for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.lineTo(pts[pts.length - 2], bottom);
      ctx.lineWidth = OL_W;
      ctx.strokeStyle = th.outline;
      ctx.stroke();
    }
  }

  drawPlatforms(ctx: Ctx, left: number, right: number): void {
    const th = this.th;
    for (const p of this.platforms) {
      if (p.x1 < left || p.x0 > right) continue;
      const y = p.y0;
      const h = 0.32;
      // Hanging vines/ropes for floaty charm.
      ctx.strokeStyle = shade(th.plankEdge, 0.2);
      ctx.lineWidth = 0.04;
      for (let x = p.x0 + 0.6; x < p.x1 - 0.3; x += 2.2) {
        ctx.beginPath();
        ctx.moveTo(x, y - h);
        ctx.quadraticCurveTo(x + 0.1, y - h - 0.35, x - 0.05, y - h - 0.6 - hash(x) * 0.3);
        ctx.stroke();
      }
      ctx.beginPath();
      roundRect(ctx, p.x0, y - h, p.x1 - p.x0, h, 0.12);
      ctx.fillStyle = th.plank;
      ctx.fill();
      ctx.lineWidth = OL_W;
      ctx.strokeStyle = th.outline;
      ctx.stroke();
      // Plank seams.
      ctx.beginPath();
      for (let x = p.x0 + 1.1; x < p.x1 - 0.3; x += 1.1) {
        ctx.moveTo(x, y - 0.04);
        ctx.lineTo(x, y - h + 0.04);
      }
      ctx.lineWidth = 0.03;
      ctx.strokeStyle = th.plankEdge;
      ctx.stroke();
      // Moss/grass lip so it reads as a surface to land on.
      ctx.beginPath();
      ctx.moveTo(p.x0 + 0.08, y - 0.02);
      ctx.lineTo(p.x1 - 0.08, y - 0.02);
      ctx.lineWidth = 0.12;
      ctx.lineCap = 'round';
      ctx.strokeStyle = th.grass;
      ctx.stroke();
    }
  }

  drawDecor(ctx: Ctx, left: number, right: number, time: number): void {
    const th = this.th;
    for (const d of this.decor) {
      if (d.x < left - 1 || d.x > right + 1) continue;
      const s = d.size;
      const sway = Math.sin(time * 2 + d.x) * 0.06;
      switch (d.kind) {
        case 0:
        case 1: {
          // Grass tuft.
          ctx.beginPath();
          for (let k = -1; k <= 1; k++) {
            ctx.moveTo(d.x + k * 0.07 * s, d.y);
            ctx.quadraticCurveTo(d.x + k * 0.1 * s + sway, d.y + 0.18 * s, d.x + k * 0.16 * s + sway * 2, d.y + (0.3 - Math.abs(k) * 0.08) * s);
          }
          ctx.lineWidth = 0.05;
          ctx.lineCap = 'round';
          ctx.strokeStyle = shade(th.grass, 0.15);
          ctx.stroke();
          break;
        }
        case 2: {
          if (th.night) {
            // Small crystal.
            ctx.beginPath();
            ctx.moveTo(d.x - 0.09 * s, d.y);
            ctx.lineTo(d.x - 0.04 * s, d.y + 0.32 * s);
            ctx.lineTo(d.x + 0.06 * s, d.y + 0.38 * s);
            ctx.lineTo(d.x + 0.1 * s, d.y);
            ctx.closePath();
            ctx.fillStyle = th.decor[Math.floor(d.x) % th.decor.length];
            ctx.fill();
            ctx.lineWidth = 0.03;
            ctx.strokeStyle = th.outline;
            ctx.stroke();
          } else {
            // Flower.
            ctx.beginPath();
            ctx.moveTo(d.x, d.y);
            ctx.quadraticCurveTo(d.x + sway, d.y + 0.15 * s, d.x + sway * 1.5, d.y + 0.3 * s);
            ctx.lineWidth = 0.035;
            ctx.strokeStyle = shade(th.grass, 0.25);
            ctx.stroke();
            const fx = d.x + sway * 1.5;
            const fy = d.y + 0.32 * s;
            ctx.fillStyle = th.decor[Math.floor(d.x * 3) % th.decor.length];
            for (let k = 0; k < 5; k++) {
              const a = (k / 5) * Math.PI * 2;
              ctx.beginPath();
              ellipse(ctx, fx + Math.cos(a) * 0.06 * s, fy + Math.sin(a) * 0.06 * s, 0.05 * s, 0.05 * s);
              ctx.fill();
            }
            ctx.beginPath();
            ellipse(ctx, fx, fy, 0.04 * s, 0.04 * s);
            ctx.fillStyle = '#ffcf33';
            ctx.fill();
          }
          break;
        }
        case 3: {
          // Pebble.
          ctx.beginPath();
          ellipse(ctx, d.x, d.y + 0.05 * s, 0.14 * s, 0.09 * s);
          ctx.fillStyle = mix(th.hazard.stone, '#ffffff', 0.15);
          ctx.fill();
          ctx.lineWidth = 0.03;
          ctx.strokeStyle = th.outline;
          ctx.stroke();
          break;
        }
        case 4: {
          // Little barrel cactus with a flower.
          ctx.beginPath();
          ellipse(ctx, d.x, d.y + 0.1 * s, 0.1 * s, 0.11 * s);
          ctx.fillStyle = '#5aa040';
          ctx.fill();
          ctx.lineWidth = 0.025;
          ctx.strokeStyle = th.outline;
          ctx.stroke();
          ctx.beginPath();
          ellipse(ctx, d.x, d.y + 0.22 * s, 0.035 * s, 0.03 * s);
          ctx.fillStyle = '#ff6f8a';
          ctx.fill();
          break;
        }
        case 5: {
          // Bleached longhorn skull (prairie and canyon) or a gold-flecked rock at the mine.
          if (th.night) {
            ctx.beginPath();
            ellipse(ctx, d.x, d.y + 0.06 * s, 0.13 * s, 0.08 * s);
            ctx.fillStyle = th.hazard.stone;
            ctx.fill();
            ctx.fillStyle = '#f2c14e';
            ctx.fillRect(d.x - 0.03, d.y + 0.07 * s, 0.04, 0.03);
          } else if (Math.floor(d.x) % 3 === 0) {
            ctx.beginPath();
            ellipse(ctx, d.x, d.y + 0.07 * s, 0.07 * s, 0.06 * s);
            ctx.fillStyle = '#f6ead2';
            ctx.fill();
            ctx.lineWidth = 0.02;
            ctx.strokeStyle = th.outline;
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(d.x - 0.06 * s, d.y + 0.1 * s);
            ctx.quadraticCurveTo(d.x - 0.2 * s, d.y + 0.12 * s, d.x - 0.22 * s, d.y + 0.2 * s);
            ctx.moveTo(d.x + 0.06 * s, d.y + 0.1 * s);
            ctx.quadraticCurveTo(d.x + 0.2 * s, d.y + 0.12 * s, d.x + 0.22 * s, d.y + 0.2 * s);
            ctx.lineWidth = 0.03 * s + 0.01;
            ctx.strokeStyle = '#f6ead2';
            ctx.stroke();
          }
          break;
        }
        default:
          break;
      }
    }
  }

  drawStartFinish(ctx: Ctx, left: number, right: number, time: number): void {
    const len = this.track.length;
    if (left < 3 && right > -3) {
      const y = this.track.solidTop(1.2);
      drawSign(ctx, 1.2, y, 'START', time, this.th.outline);
    }
    if (len > left - 4 && len < right + 4) {
      const y = this.track.solidTop(len);
      const h = 3.3;
      // Ranch gate: two posts and a carved crossbar.
      for (const dx of [-1.7, 1.7]) {
        ctx.beginPath();
        roundRect(ctx, len + dx - 0.13, y, 0.26, h, 0.05);
        ctx.fillStyle = '#9a5b2e';
        ctx.fill();
        ctx.lineWidth = OL_W;
        ctx.strokeStyle = this.th.outline;
        ctx.stroke();
      }
      ctx.beginPath();
      roundRect(ctx, len - 2.1, y + h - 0.1, 4.2, 0.62, 0.1);
      ctx.fillStyle = '#c07a3c';
      ctx.fill();
      ctx.lineWidth = OL_W;
      ctx.stroke();
      worldText(ctx, 'FINISH', len, y + h + 0.2, 0.42, '#fff1cf', this.th.outline);
      // Chequered bunting under the bar.
      for (let i = 0; i < 10; i++) {
        const x = len - 1.55 + (i / 10) * 3.1;
        const wave = Math.sin(time * 4 + i * 0.7) * 0.04;
        ctx.beginPath();
        ctx.moveTo(x, y + h - 0.1);
        ctx.lineTo(x + 0.31, y + h - 0.1);
        ctx.lineTo(x + 0.155, y + h - 0.45 + wave);
        ctx.closePath();
        ctx.fillStyle = i % 2 ? '#ffffff' : '#2a1d2e';
        ctx.fill();
      }
      // Gold horseshoe for luck.
      ctx.beginPath();
      ctx.arc(len, y + h + 0.75, 0.16, Math.PI * 1.15, Math.PI * 1.85, true);
      ctx.lineWidth = 0.07;
      ctx.strokeStyle = '#f2c14e';
      ctx.stroke();
    }
  }

  // --- hazards -----------------------------------------------------------------------

  drawHazards(ctx: Ctx, left: number, right: number, time: number): void {
    const track = this.track;
    const hz = track.data.hazards;
    const end = right + track.maxHazardReach;
    for (let i = track.firstHazardIndex(left); i < hz.length && hz[i].x <= end; i++) this.drawHazard(ctx, hz[i], Math.max(0, time));
  }

  private drawHazard(ctx: Ctx, h: Hazard, t: number): void {
    const th = this.th;
    const ol = th.outline;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = OL_W;
    ctx.strokeStyle = ol;
    switch (h.kind) {
      case 'log': {
        // A sturdy wooden barrel to hop over.
        drawBarrel(ctx, h.x, h.y, h.halfWidth + 0.06, h.height, th.hazard.wood, ol, 0);
        break;
      }
      case 'spikes': {
        // Prickly cactus patch: two or three squat cacti with needles.
        const n = Math.max(2, Math.round(h.halfWidth / 0.3));
        for (let i = 0; i < n; i++) {
          const cx = h.x - h.halfWidth + ((i + 0.5) / n) * h.halfWidth * 2;
          const ch = h.height * (i % 2 ? 0.85 : 1.05);
          const cw = (h.halfWidth / n) * 0.85;
          ctx.beginPath();
          ctx.moveTo(cx - cw, h.y);
          ctx.lineTo(cx - cw, h.y + ch - cw);
          ctx.quadraticCurveTo(cx - cw, h.y + ch, cx, h.y + ch);
          ctx.quadraticCurveTo(cx + cw, h.y + ch, cx + cw, h.y + ch - cw);
          ctx.lineTo(cx + cw, h.y);
          ctx.closePath();
          ctx.fillStyle = '#4f9a3a';
          ctx.fill();
          ctx.lineWidth = 0.035;
          ctx.strokeStyle = ol;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx, h.y + 0.04);
          ctx.lineTo(cx, h.y + ch - 0.05);
          ctx.lineWidth = 0.02;
          ctx.strokeStyle = '#3a7a2a';
          ctx.stroke();
          // Needles.
          ctx.strokeStyle = '#fff4c8';
          ctx.lineWidth = 0.014;
          ctx.beginPath();
          for (let k = 0; k < 4; k++) {
            const yy = h.y + 0.08 + (k / 4) * (ch - 0.1);
            ctx.moveTo(cx - cw, yy);
            ctx.lineTo(cx - cw - 0.06, yy + 0.03);
            ctx.moveTo(cx + cw, yy + 0.04);
            ctx.lineTo(cx + cw + 0.06, yy + 0.07);
          }
          ctx.moveTo(cx, h.y + ch);
          ctx.lineTo(cx, h.y + ch + 0.06);
          ctx.stroke();
          if (i === 0) {
            ctx.beginPath();
            ellipse(ctx, cx, h.y + ch + 0.02, 0.04, 0.035);
            ctx.fillStyle = '#ff6f8a';
            ctx.fill();
          }
        }
        break;
      }
      case 'saw': {
        const c = sawCenter(h, t, tmp);
        if (h.axis !== 'none') {
          ctx.beginPath();
          if (h.axis === 'x') {
            ctx.moveTo(h.x - h.amplitude, h.y + h.lift);
            ctx.lineTo(h.x + h.amplitude, h.y + h.lift);
          } else {
            ctx.moveTo(h.x, h.y + h.lift - h.amplitude);
            ctx.lineTo(h.x, h.y + h.lift + h.amplitude);
          }
          ctx.lineWidth = 0.12;
          ctx.strokeStyle = rgba(ol, 0.5);
          ctx.stroke();
          ctx.strokeStyle = ol;
        }
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(-t * 14);
        const teeth = 14;
        ctx.beginPath();
        for (let i = 0; i < teeth * 2; i++) {
          const a = (i / (teeth * 2)) * Math.PI * 2;
          const r = i % 2 === 0 ? h.radius : h.radius * 0.82;
          if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fillStyle = th.hazard.metal;
        ctx.fill();
        ctx.lineWidth = 0.04;
        ctx.stroke();
        ctx.beginPath();
        ellipse(ctx, 0, 0, h.radius * 0.55, h.radius * 0.55);
        ctx.fillStyle = tint(th.hazard.metal, 0.3);
        ctx.fill();
        ctx.beginPath();
        ellipse(ctx, 0, 0, h.radius * 0.18, h.radius * 0.18);
        ctx.fillStyle = th.hazard.danger;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        // Half-buried saws sit in a dark slot.
        if (h.lift < h.radius) {
          ctx.beginPath();
          roundRect(ctx, h.x - h.radius - 0.1 - (h.axis === 'x' ? h.amplitude : 0), h.y - 0.06, (h.radius + 0.1 + (h.axis === 'x' ? h.amplitude : 0)) * 2, 0.1, 0.05);
          ctx.fillStyle = shade(th.soilDeep, 0.3);
          ctx.fill();
        }
        break;
      }
      case 'crusher': {
        const lift = crusherLift(h, t);
        const warn = crusherWarning(h, t);
        const shake = warn ? Math.sin(t * 70) * 0.04 : 0;
        const x0 = h.x - h.halfWidth + shake;
        const yb = h.y + lift;
        // Rails up to the sky.
        ctx.fillStyle = shade(th.hazard.metal, 0.4);
        for (const dx of [0.15, h.halfWidth * 2 - 0.25]) ctx.fillRect(h.x - h.halfWidth + dx, yb + CRUSHER_BLOCK, 0.1, 12);
        // Danger zone on the ground when about to slam.
        if (warn || lift < 0.4) {
          ctx.fillStyle = rgba(th.hazard.danger, warn ? 0.25 + 0.2 * Math.abs(Math.sin(t * 12)) : 0.15);
          ctx.fillRect(h.x - h.halfWidth, h.y - 0.02, h.halfWidth * 2, 0.06);
        }
        ctx.beginPath();
        roundRect(ctx, x0, yb, h.halfWidth * 2, CRUSHER_BLOCK, 0.12);
        ctx.fillStyle = th.hazard.stone;
        ctx.fill();
        ctx.stroke();
        // Angry carved face.
        const fx = x0 + h.halfWidth;
        const fy = yb + CRUSHER_BLOCK * 0.55;
        ctx.fillStyle = shade(th.hazard.stone, 0.55);
        for (const dx of [-0.28, 0.28]) {
          ctx.beginPath();
          ellipse(ctx, fx + dx, fy, 0.11, warn ? 0.06 : 0.09);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.moveTo(fx - 0.45, fy + 0.2);
        ctx.lineTo(fx - 0.12, fy + 0.12);
        ctx.moveTo(fx + 0.45, fy + 0.2);
        ctx.lineTo(fx + 0.12, fy + 0.12);
        ctx.lineWidth = 0.06;
        ctx.strokeStyle = shade(th.hazard.stone, 0.55);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(fx - 0.25, fy - 0.3);
        ctx.quadraticCurveTo(fx, fy - (warn ? 0.2 : 0.36), fx + 0.25, fy - 0.3);
        ctx.stroke();
        // Rivets.
        ctx.fillStyle = shade(th.hazard.metal, 0.1);
        for (const [dx, dy] of [
          [0.15, 0.15],
          [h.halfWidth * 2 - 0.15, 0.15],
          [0.15, CRUSHER_BLOCK - 0.15],
          [h.halfWidth * 2 - 0.15, CRUSHER_BLOCK - 0.15],
        ]) {
          ctx.beginPath();
          ellipse(ctx, x0 + dx, yb + dy, 0.05, 0.05);
          ctx.fill();
        }
        break;
      }
      case 'flame': {
        const st = flameState(h, t);
        // Stone fire ring with crossed logs.
        ctx.strokeStyle = shade(th.hazard.wood, 0.25);
        ctx.lineWidth = 0.09;
        ctx.beginPath();
        ctx.moveTo(h.x - h.halfWidth, h.y + 0.05);
        ctx.lineTo(h.x + h.halfWidth, h.y + 0.17);
        ctx.moveTo(h.x - h.halfWidth, h.y + 0.17);
        ctx.lineTo(h.x + h.halfWidth, h.y + 0.05);
        ctx.stroke();
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ellipse(ctx, h.x - h.halfWidth - 0.08 + (i / 4) * (h.halfWidth * 2 + 0.16), h.y + 0.05, 0.1, 0.07);
          ctx.fillStyle = mix(th.hazard.stone, '#ffffff', 0.1);
          ctx.fill();
          ctx.lineWidth = 0.025;
          ctx.strokeStyle = ol;
          ctx.stroke();
        }
        // Embers glow even when idle so the vent is recognisable.
        ctx.beginPath();
        ellipse(ctx, h.x, h.y + 0.14, h.halfWidth * 0.7, 0.06);
        ctx.fillStyle = st === 'idle' ? '#a8401f' : '#ff8a1f';
        ctx.fill();
        if (st === 'warn') {
          // Sputtering sparks and smoke: the tell.
          for (let i = 0; i < 4; i++) {
            const k = (t * 1.8 + i / 4) % 1;
            ctx.beginPath();
            ellipse(ctx, h.x + Math.sin(i * 2 + t * 3) * 0.14, h.y + 0.25 + k * 0.8, 0.07 + k * 0.1, 0.07 + k * 0.1);
            ctx.fillStyle = `rgba(90,80,80,${0.45 * (1 - k)})`;
            ctx.fill();
          }
          ctx.fillStyle = '#ffcf33';
          for (let i = 0; i < 3; i++) {
            const k = (t * 3 + i / 3) % 1;
            ctx.fillRect(h.x + Math.sin(t * 9 + i * 2) * 0.2, h.y + 0.2 + k * 0.6, 0.04, 0.04);
          }
        } else if (st === 'active') {
          const flick = Math.sin(t * 40) * 0.08;
          const layers: [number, string][] = [
            [1, '#ff4a1a'],
            [0.72, '#ffa51f'],
            [0.42, '#fff2a8'],
          ];
          for (const [k, col] of layers) {
            const w = h.halfWidth * (0.75 + k * 0.45);
            const top = h.y + 0.12 + (h.height + flick) * (0.6 + 0.4 * k);
            ctx.beginPath();
            ctx.moveTo(h.x - w, h.y + 0.12);
            ctx.bezierCurveTo(h.x - w * 1.1, h.y + h.height * 0.45 * k + 0.3, h.x - w * 0.2 + flick, top - 0.2, h.x + flick, top);
            ctx.bezierCurveTo(h.x + w * 0.2 + flick, top - 0.2, h.x + w * 1.1, h.y + h.height * 0.45 * k + 0.3, h.x + w, h.y + 0.12);
            ctx.closePath();
            ctx.fillStyle = col;
            ctx.fill();
          }
        }
        break;
      }
      case 'pendulum': {
        const px = h.x;
        const py = h.y + h.pivotLift;
        const b = pendulumBall(h, t, tmp);
        ctx.beginPath();
        roundRect(ctx, px - 0.5, py - 0.08, 1, 0.22, 0.08);
        ctx.fillStyle = th.hazard.wood;
        ctx.fill();
        ctx.stroke();
        // Chain links.
        const links = 9;
        ctx.lineWidth = 0.05;
        ctx.strokeStyle = shade(th.hazard.metal, 0.3);
        for (let i = 0; i < links; i++) {
          const k = (i + 0.5) / links;
          ctx.beginPath();
          ellipse(ctx, px + (b.x - px) * k, py + (b.y - py) * k, 0.06, 0.09, Math.atan2(b.y - py, b.x - px));
          ctx.stroke();
        }
        ctx.strokeStyle = ol;
        ctx.lineWidth = 0.04;
        // Spiked ball.
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(t * 2);
        ctx.beginPath();
        star(ctx, 0, 0, h.radius * 1.28, 0.72, 10);
        ctx.fillStyle = shade(th.hazard.metal, 0.15);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ellipse(ctx, 0, 0, h.radius * 0.9, h.radius * 0.9);
        ctx.fillStyle = shade(th.hazard.metal, 0.35);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ellipse(ctx, -h.radius * 0.3, h.radius * 0.3, h.radius * 0.25, h.radius * 0.18, 0.6);
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'boulder': {
        const bx = boulderPosition(h, t);
        if (bx === null) break;
        const r = h.radius;
        const fade = Math.min(1, (h.x + h.travel - bx) / 1.2, (bx - (h.x - h.travel / 3)) / 0.8 + 0.2);
        ctx.save();
        ctx.globalAlpha *= Math.max(0, Math.min(1, fade));
        // A barrel rolling on its side, seen end-on: hoops and staves spin.
        ctx.translate(bx, h.y + r);
        ctx.rotate((h.x + h.travel - bx) / r);
        ctx.beginPath();
        ellipse(ctx, 0, 0, r, r);
        ctx.fillStyle = th.hazard.wood;
        ctx.fill();
        ctx.lineWidth = 0.05;
        ctx.strokeStyle = ol;
        ctx.stroke();
        ctx.beginPath();
        ellipse(ctx, 0, 0, r * 0.78, r * 0.78);
        ctx.lineWidth = 0.06;
        ctx.strokeStyle = th.hazard.metal;
        ctx.stroke();
        ctx.lineWidth = 0.02;
        ctx.strokeStyle = shade(th.hazard.wood, 0.35);
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI;
          ctx.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7);
          ctx.lineTo(-Math.cos(a) * r * 0.7, -Math.sin(a) * r * 0.7);
        }
        ctx.stroke();
        ctx.beginPath();
        ellipse(ctx, 0, 0, r * 0.14, r * 0.14);
        ctx.fillStyle = shade(th.hazard.wood, 0.4);
        ctx.fill();
        ctx.restore();
        // Dust kicked up under it.
        ctx.beginPath();
        ellipse(ctx, bx + r * 0.6, h.y + 0.08, 0.16, 0.08);
        ctx.fillStyle = 'rgba(230,200,150,0.5)';
        ctx.fill();
        break;
      }
      case 'mud': {
        const w = h.halfWidth;
        ctx.beginPath();
        ctx.moveTo(h.x - w, h.y + 0.01);
        ctx.quadraticCurveTo(h.x - w + 0.15, h.y + 0.14, h.x - w + 0.5, h.y + 0.1);
        for (let x = h.x - w + 0.5; x < h.x + w - 0.5; x += 0.6) ctx.quadraticCurveTo(x + 0.3, h.y + 0.16, x + 0.6, h.y + 0.1);
        ctx.quadraticCurveTo(h.x + w - 0.15, h.y + 0.14, h.x + w, h.y + 0.01);
        ctx.closePath();
        ctx.fillStyle = this.th.night ? '#5a3f7a' : '#7a4a2a';
        ctx.fill();
        ctx.lineWidth = 0.035;
        ctx.stroke();
        for (let i = 0; i < Math.floor(w * 2); i++) {
          const k = (t * 0.6 + hash(h.id + i)) % 1;
          const bx = h.x - w + 0.3 + hash(i * 3.3 + h.id) * (w * 2 - 0.6);
          ctx.beginPath();
          ellipse(ctx, bx, h.y + 0.12 + k * 0.05, 0.04 + k * 0.05, 0.03 + k * 0.04);
          ctx.strokeStyle = `rgba(255,230,200,${0.5 * (1 - k)})`;
          ctx.lineWidth = 0.02;
          ctx.stroke();
        }
        break;
      }
      case 'boostPad': {
        ctx.beginPath();
        roundRect(ctx, h.x - h.halfWidth, h.y - 0.02, h.halfWidth * 2, 0.12, 0.05);
        ctx.fillStyle = '#2a3a5a';
        ctx.fill();
        ctx.lineWidth = 0.035;
        ctx.stroke();
        for (let i = 0; i < 3; i++) {
          const k = (t * 2.5 + i / 3) % 1;
          const x = h.x - h.halfWidth + 0.2 + k * (h.halfWidth * 2 - 0.5);
          ctx.beginPath();
          ctx.moveTo(x, h.y + 0.02);
          ctx.lineTo(x + 0.18, h.y + 0.05);
          ctx.lineTo(x, h.y + 0.08);
          ctx.lineWidth = 0.05;
          ctx.strokeStyle = `rgba(79,214,255,${0.4 + 0.6 * Math.sin(k * Math.PI)})`;
          ctx.stroke();
        }
        ctx.strokeStyle = ol;
        break;
      }
      case 'spring': {
        const since = t - (this.springBounce.get(h.id) ?? -10);
        const squash = since < 0.5 ? Math.exp(-since * 8) * Math.cos(since * 30) : 0;
        const hgt = 0.32 * (1 - squash * 0.5);
        // Steel coil under a painted wooden springboard.
        ctx.beginPath();
        for (let i = 0; i <= 6; i++) ctx.lineTo(h.x + (i % 2 ? 0.2 : -0.2), h.y + (i / 6) * hgt);
        ctx.lineWidth = 0.06;
        ctx.strokeStyle = th.hazard.metal;
        ctx.stroke();
        ctx.beginPath();
        roundRect(ctx, h.x - h.halfWidth - 0.15, h.y + hgt, (h.halfWidth + 0.15) * 2, 0.14, 0.05);
        ctx.fillStyle = '#e8473b';
        ctx.fill();
        ctx.lineWidth = OL_W;
        ctx.strokeStyle = ol;
        ctx.stroke();
        ctx.fillStyle = '#fff1cf';
        for (const dx of [-0.25, 0, 0.25]) {
          ctx.beginPath();
          ctx.moveTo(h.x + dx - 0.07, h.y + hgt + 0.04);
          ctx.lineTo(h.x + dx, h.y + hgt + 0.11);
          ctx.lineTo(h.x + dx + 0.07, h.y + hgt + 0.04);
          ctx.fill();
        }
        break;
      }
    }
  }

  // --- pickups & entities ------------------------------------------------------------

  drawItemBoxes(ctx: Ctx, left: number, right: number, time: number, readyAt: Float64Array, raceTime: number): void {
    const boxes = this.track.data.itemBoxes;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.x < left || b.x > right) continue;
      const ready = readyAt[i] <= raceTime;
      let scale = 1;
      if (!ready) {
        const k = 1 - (readyAt[i] - raceTime) / GameplayConfig.itemBox.respawnSeconds;
        scale = Math.max(0, (k - 0.6) / 0.4);
      }
      if (scale <= 0.01) continue;
      const bob = Math.sin(time * 3 + i) * 0.07;
      const s = 0.34 * scale;
      ctx.save();
      ctx.translate(b.x, b.y + 0.1 + bob);
      ctx.rotate(Math.sin(time * 2 + i) * 0.1);
      // Glow so loot reads against any backdrop.
      ctx.beginPath();
      ellipse(ctx, 0, 0, s * 1.7, s * 1.7);
      ctx.fillStyle = 'rgba(255,220,90,0.25)';
      ctx.fill();
      // Wooden loot crate.
      ctx.beginPath();
      roundRect(ctx, -s, -s, s * 2, s * 2, s * 0.15);
      ctx.fillStyle = '#c98a4b';
      ctx.fill();
      ctx.lineWidth = 0.045;
      ctx.strokeStyle = '#3a1f10';
      ctx.stroke();
      ctx.strokeStyle = '#8a5428';
      ctx.lineWidth = 0.035;
      ctx.beginPath();
      ctx.moveTo(-s, -s * 0.33);
      ctx.lineTo(s, -s * 0.33);
      ctx.moveTo(-s, s * 0.33);
      ctx.lineTo(s, s * 0.33);
      ctx.stroke();
      ctx.beginPath();
      roundRect(ctx, -s * 0.55, -s * 0.55, s * 1.1, s * 1.1, s * 0.2);
      ctx.fillStyle = '#f2c14e';
      ctx.fill();
      ctx.lineWidth = 0.03;
      ctx.strokeStyle = '#3a1f10';
      ctx.stroke();
      worldText(ctx, '?', 0, -s * 0.42, s * 1.05, '#ffffff', '#3a1f10');
      ctx.restore();
    }
  }

  drawGlimmers(ctx: Ctx, left: number, right: number, time: number, taken: Uint8Array): void {
    const gl = this.track.data.glimmers;
    for (let i = 0; i < gl.length; i++) {
      const g = gl[i];
      if (g.x < left || g.x > right || taken[i]) continue;
      const s = 0.15;
      ctx.save();
      ctx.translate(g.x, g.y + Math.sin(time * 3 + g.x * 0.7) * 0.05);
      ctx.rotate(Math.sin(time * 2 + g.x) * 0.25);
      // Gold nugget: a lumpy polygon with a shine.
      ctx.beginPath();
      const pts = 7;
      for (let k = 0; k < pts; k++) {
        const a = (k / pts) * Math.PI * 2;
        const r = s * (0.8 + hash(i * 7 + k) * 0.35);
        if (k === 0) ctx.moveTo(Math.cos(a) * r * 1.15, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r * 1.15, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fillStyle = '#f2c14e';
      ctx.fill();
      ctx.lineWidth = 0.03;
      ctx.strokeStyle = '#7a4a00';
      ctx.stroke();
      ctx.beginPath();
      ellipse(ctx, -s * 0.3, s * 0.3, s * 0.3, s * 0.18, -0.5);
      ctx.fillStyle = '#fff6c0';
      ctx.fill();
      if ((time * 2 + i * 0.37) % 3 < 0.25) {
        ctx.beginPath();
        star(ctx, s * 0.5, s * 0.6, s * 0.6, 0.25, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /**
   * Rival-placed traps are drawn loud on purpose: saturated colours, a
   * white rim, a pulsing danger ring and a warning sign above, so they never
   * blend into the scenery.
   */
  drawEntities(ctx: Ctx, entities: readonly Entity[], time: number): void {
    for (const e of entities) {
      if (!e.alive) continue;
      const pulse = 0.5 + 0.5 * Math.sin(time * 10);
      if (e.kind === 'seeker') {
        // Smoke trail.
        for (let k = 1; k <= 6; k++) {
          ctx.beginPath();
          ellipse(ctx, e.x - 0.3 - k * 0.2, e.y + Math.sin(time * 20 + k) * 0.03, 0.08 + k * 0.03, 0.08 + k * 0.03);
          ctx.fillStyle = `rgba(220,220,220,${0.6 - k * 0.09})`;
          ctx.fill();
        }
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(Math.sin(time * 14) * 0.08);
        // Exhaust flame.
        ctx.beginPath();
        ctx.moveTo(-0.32, 0.08);
        ctx.lineTo(-0.55 - pulse * 0.15, 0);
        ctx.lineTo(-0.32, -0.08);
        ctx.fillStyle = '#ffb020';
        ctx.fill();
        // White rim then the body.
        rocketPath(ctx);
        ctx.lineWidth = 0.12;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        rocketPath(ctx);
        ctx.fillStyle = '#e8473b';
        ctx.fill();
        ctx.lineWidth = 0.035;
        ctx.strokeStyle = '#2a1a1e';
        ctx.stroke();
        ctx.fillStyle = '#fff1cf';
        ctx.fillRect(-0.1, -0.13, 0.05, 0.26);
        ctx.beginPath();
        ellipse(ctx, 0.12, 0.0, 0.05, 0.05);
        ctx.fillStyle = pulse > 0.5 ? '#ffe14d' : '#ff2e2e';
        ctx.fill();
        ctx.restore();
      } else if (e.kind === 'snare') {
        ctx.save();
        ctx.translate(e.x, e.y);
        // Danger ring on the ground.
        ctx.beginPath();
        ctx.ellipse(0, 0.02, 0.75 + pulse * 0.08, 0.14, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,46,46,${0.25 + pulse * 0.3})`;
        ctx.fill();
        ctx.lineWidth = 0.04;
        ctx.strokeStyle = '#ff2e2e';
        ctx.stroke();
        // Dynamite bundle: three red sticks, a tape band, a timer and a lit fuse.
        for (const [dx, h] of [
          [-0.16, 0.58],
          [0, 0.66],
          [0.16, 0.58],
        ]) {
          ctx.beginPath();
          roundRect(ctx, dx - 0.085, 0.02, 0.17, h, 0.05);
          ctx.lineWidth = 0.1;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
        }
        for (const [dx, h] of [
          [-0.16, 0.58],
          [0, 0.66],
          [0.16, 0.58],
        ]) {
          ctx.beginPath();
          roundRect(ctx, dx - 0.085, 0.02, 0.17, h, 0.05);
          ctx.fillStyle = '#e8322a';
          ctx.fill();
          ctx.lineWidth = 0.03;
          ctx.strokeStyle = '#2a1a1e';
          ctx.stroke();
          ctx.beginPath();
          ellipse(ctx, dx, 0.02 + h, 0.06, 0.025);
          ctx.fillStyle = '#ffe08a';
          ctx.fill();
        }
        ctx.fillStyle = '#c8ccd8';
        ctx.fillRect(-0.27, 0.2, 0.54, 0.09);
        ctx.beginPath();
        roundRect(ctx, -0.12, 0.3, 0.24, 0.14, 0.03);
        ctx.fillStyle = '#1f1a26';
        ctx.fill();
        ctx.fillStyle = pulse > 0.5 ? '#ff3d2e' : '#ffcf33';
        ctx.fillRect(-0.08, 0.34, 0.16, 0.06);
        // Fuse with a spark.
        ctx.beginPath();
        ctx.moveTo(0, 0.68);
        ctx.quadraticCurveTo(0.12, 0.82, 0.05, 0.92);
        ctx.lineWidth = 0.025;
        ctx.strokeStyle = '#3a1f10';
        ctx.stroke();
        ctx.beginPath();
        star(ctx, 0.05, 0.93, 0.07 + pulse * 0.04, 0.4, 6, time * 8);
        ctx.fillStyle = '#ffd23f';
        ctx.fill();
        drawWarning(ctx, 0, 1.25 + Math.sin(time * 6) * 0.05);
        ctx.restore();
      } else {
        const fade = Math.min(1, e.ttl / 0.6);
        ctx.save();
        ctx.globalAlpha *= fade;
        // Hazard-striped border makes the tar pool pop.
        const x0 = e.x0;
        const x1 = e.x1;
        ctx.beginPath();
        ctx.moveTo(x0 - 0.1, e.y + 0.01);
        for (let x = x0; x <= x1; x += 0.35) ctx.lineTo(x, e.y + 0.17 + Math.sin(x * 5 + time * 2) * 0.03);
        ctx.lineTo(x1 + 0.1, e.y + 0.01);
        ctx.closePath();
        ctx.lineWidth = 0.14;
        ctx.strokeStyle = '#ffcf33';
        ctx.stroke();
        ctx.fillStyle = '#1f1a2a';
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.fillStyle = '#ffcf33';
        for (let x = x0 - 0.2; x < x1 + 0.2; x += 0.4) {
          ctx.beginPath();
          ctx.moveTo(x, e.y - 0.1);
          ctx.lineTo(x + 0.15, e.y - 0.1);
          ctx.lineTo(x + 0.3, e.y + 0.2);
          ctx.lineTo(x + 0.15, e.y + 0.2);
          ctx.fill();
        }
        ctx.restore();
        ctx.beginPath();
        ctx.moveTo(x0, e.y + 0.08);
        for (let x = x0; x <= x1; x += 0.35) ctx.lineTo(x, e.y + 0.14 + Math.sin(x * 5 + time * 2) * 0.03);
        ctx.lineTo(x1, e.y + 0.02);
        ctx.lineTo(x0, e.y + 0.02);
        ctx.closePath();
        ctx.fillStyle = '#2a2238';
        ctx.fill();
        // Bubbles and shine.
        for (let k = 0; k < 4; k++) {
          const ph = (time * 0.8 + k * 0.27) % 1;
          ctx.beginPath();
          ellipse(ctx, x0 + 0.4 + ((k * 1.13) % 1) * (x1 - x0 - 0.8), e.y + 0.09 + ph * 0.06, 0.04 + ph * 0.05, 0.03 + ph * 0.04);
          ctx.lineWidth = 0.02;
          ctx.strokeStyle = `rgba(190,160,255,${0.8 * (1 - ph)})`;
          ctx.stroke();
        }
        // Tipped-over barrel at the far end.
        ctx.save();
        ctx.translate(x1 + 0.2, e.y);
        ctx.rotate(-Math.PI / 2 + 0.25);
        drawBarrel(ctx, 0, -0.3, 0.26, 0.6, '#5a3a6a', '#2a1a1e', 0);
        ctx.restore();
        drawWarning(ctx, (x0 + x1) / 2, e.y + 0.9 + Math.sin(time * 6) * 0.05);
        ctx.restore();
      }
    }
  }
}

/** Upright wooden barrel standing at (x, y) in world space. */
export function drawBarrel(ctx: Ctx, x: number, y: number, hw: number, height: number, wood: string, ol: string, _t: number): void {
  ctx.beginPath();
  ctx.moveTo(x - hw * 0.85, y);
  ctx.quadraticCurveTo(x - hw * 1.12, y + height / 2, x - hw * 0.85, y + height);
  ctx.lineTo(x + hw * 0.85, y + height);
  ctx.quadraticCurveTo(x + hw * 1.12, y + height / 2, x + hw * 0.85, y);
  ctx.closePath();
  ctx.fillStyle = wood;
  ctx.fill();
  ctx.lineWidth = 0.045;
  ctx.strokeStyle = ol;
  ctx.stroke();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 0.02;
  ctx.beginPath();
  for (let k = -1; k <= 1; k++) {
    ctx.moveTo(x + k * hw * 0.45, y);
    ctx.quadraticCurveTo(x + k * hw * 0.55, y + height / 2, x + k * hw * 0.45, y + height);
  }
  ctx.stroke();
  ctx.fillStyle = '#8f97a3';
  for (const k of [0.18, 0.82]) ctx.fillRect(x - hw * 1.2, y + height * k - 0.035, hw * 2.4, 0.07);
  ctx.restore();
}

function rocketPath(ctx: Ctx): void {
  ctx.beginPath();
  ctx.moveTo(0.36, 0);
  ctx.quadraticCurveTo(0.22, 0.14, -0.22, 0.13);
  ctx.lineTo(-0.34, 0.22);
  ctx.lineTo(-0.3, 0.0);
  ctx.lineTo(-0.34, -0.22);
  ctx.lineTo(-0.22, -0.13);
  ctx.quadraticCurveTo(0.22, -0.14, 0.36, 0);
  ctx.closePath();
}

/** Yellow warning triangle with "!" (world space). */
function drawWarning(ctx: Ctx, x: number, y: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + 0.24);
  ctx.lineTo(x + 0.24, y - 0.16);
  ctx.lineTo(x - 0.24, y - 0.16);
  ctx.closePath();
  ctx.fillStyle = '#ffcf33';
  ctx.fill();
  ctx.lineWidth = 0.04;
  ctx.strokeStyle = '#2a1a1e';
  ctx.stroke();
  worldText(ctx, '!', x, y - 0.13, 0.3, '#2a1a1e', null);
}

/** Text in world space (+y up): flips locally so it reads correctly. */
export function worldText(ctx: Ctx, text: string, x: number, y: number, size: number, fill: string, stroke: string | null): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, -1);
  ctx.font = `400 ${size}px Rye, Fredoka, Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  if (stroke) {
    ctx.lineWidth = size * 0.16;
    ctx.strokeStyle = stroke;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, 0, 0);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** Wooden arrow sign on a post (world space). */
function drawSign(ctx: Ctx, x: number, y: number, label: string, time: number, ol: string): void {
  ctx.beginPath();
  roundRect(ctx, x - 0.06, y, 0.12, 1.5, 0.03);
  ctx.fillStyle = '#8a5428';
  ctx.fill();
  ctx.lineWidth = 0.035;
  ctx.strokeStyle = ol;
  ctx.stroke();
  const sway = Math.sin(time * 2) * 0.02;
  ctx.save();
  ctx.translate(x, y + 1.35);
  ctx.rotate(sway);
  ctx.beginPath();
  ctx.moveTo(-0.7, -0.2);
  ctx.lineTo(0.6, -0.2);
  ctx.lineTo(0.85, 0.05);
  ctx.lineTo(0.6, 0.3);
  ctx.lineTo(-0.7, 0.3);
  ctx.closePath();
  ctx.fillStyle = '#c98a4b';
  ctx.fill();
  ctx.lineWidth = 0.045;
  ctx.stroke();
  worldText(ctx, label, -0.02, -0.07, 0.3, '#fff1cf', ol);
  ctx.restore();
}
