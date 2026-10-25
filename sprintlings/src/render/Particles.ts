import { ellipse, star, type Ctx } from './draw';

export type ParticleKind = 'puff' | 'spark' | 'confetti' | 'ring' | 'leaf' | 'bubble' | 'note' | 'flame' | 'star' | 'line';

interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
  gravity: number;
  drag: number;
}

export interface Emit {
  kind: ParticleKind;
  x: number;
  y: number;
  color: string;
  count?: number;
  speed?: number;
  /** Base direction in radians and spread (default: all around). */
  dir?: number;
  spread?: number;
  size?: number;
  life?: number;
  gravity?: number;
  drag?: number;
}

/**
 * Pooled world-space particles (+y up). Cheap shapes only; the cap scales
 * with graphics quality.
 */
export class Particles {
  private readonly pool: Particle[] = [];
  private readonly live: Particle[] = [];
  private seed = 12345;

  constructor(private readonly cap: number) {}

  private rand(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  emit(e: Emit): void {
    const n = e.count ?? 1;
    for (let i = 0; i < n; i++) {
      if (this.live.length >= this.cap) return;
      const p = this.pool.pop() ?? ({} as Particle);
      const spread = e.spread ?? Math.PI * 2;
      const a = (e.dir ?? 0) + (this.rand() - 0.5) * spread;
      const sp = (e.speed ?? 2) * (0.5 + this.rand() * 0.7);
      p.kind = e.kind;
      p.x = e.x;
      p.y = e.y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.max = p.life = (e.life ?? 0.6) * (0.7 + this.rand() * 0.6);
      p.size = (e.size ?? 0.15) * (0.7 + this.rand() * 0.6);
      p.rot = this.rand() * Math.PI * 2;
      p.vr = (this.rand() - 0.5) * 12;
      p.color = e.color;
      p.gravity = e.gravity ?? 0;
      p.drag = e.drag ?? 2;
      this.live.push(p);
    }
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.live[i] = this.live[this.live.length - 1];
        this.live.pop();
        this.pool.push(p);
        continue;
      }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy = p.vy * d - p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }

  draw(ctx: Ctx, left: number, right: number): void {
    for (const p of this.live) {
      if (p.x < left || p.x > right) continue;
      const k = p.life / p.max;
      ctx.globalAlpha = Math.min(1, k * 1.6);
      switch (p.kind) {
        case 'puff': {
          const r = p.size * (1.6 - k * 0.8);
          ctx.beginPath();
          ellipse(ctx, p.x, p.y, r, r * 0.85);
          ctx.fillStyle = p.color;
          ctx.fill();
          break;
        }
        case 'spark':
        case 'star': {
          ctx.beginPath();
          star(ctx, p.x, p.y, p.size * (p.kind === 'star' ? 1 : 0.7 + k * 0.5), p.kind === 'star' ? 0.45 : 0.35, p.kind === 'star' ? 5 : 4, p.rot);
          ctx.fillStyle = p.color;
          ctx.fill();
          break;
        }
        case 'confetti': {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.scale(1, Math.cos(p.rot * 2));
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
          ctx.restore();
          break;
        }
        case 'ring': {
          ctx.beginPath();
          const r = p.size * (1 + (1 - k) * 3);
          ellipse(ctx, p.x, p.y, r, r);
          ctx.lineWidth = 0.06 * k + 0.01;
          ctx.strokeStyle = p.color;
          ctx.stroke();
          break;
        }
        case 'leaf': {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          ctx.moveTo(-p.size, 0);
          ctx.quadraticCurveTo(0, p.size * 0.8, p.size, 0);
          ctx.quadraticCurveTo(0, -p.size * 0.8, -p.size, 0);
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'bubble': {
          ctx.beginPath();
          ellipse(ctx, p.x, p.y, p.size, p.size);
          ctx.lineWidth = 0.025;
          ctx.strokeStyle = p.color;
          ctx.stroke();
          ctx.beginPath();
          ellipse(ctx, p.x - p.size * 0.35, p.y + p.size * 0.35, p.size * 0.2, p.size * 0.2);
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          ctx.fill();
          break;
        }
        case 'note': {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ellipse(ctx, p.x, p.y, p.size * 0.5, p.size * 0.38, 0.4);
          ctx.fill();
          ctx.fillRect(p.x + p.size * 0.38, p.y, p.size * 0.12, p.size * 1.3);
          break;
        }
        case 'flame': {
          const r = p.size * (0.5 + k * 0.7);
          ctx.beginPath();
          ellipse(ctx, p.x, p.y, r, r * 1.3);
          ctx.fillStyle = k > 0.6 ? '#fff2a8' : k > 0.3 ? p.color : '#ff5a1f';
          ctx.fill();
          break;
        }
        case 'line': {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.size * 4, p.y);
          ctx.lineWidth = 0.05;
          ctx.strokeStyle = p.color;
          ctx.stroke();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    while (this.live.length) this.pool.push(this.live.pop()!);
  }
}
