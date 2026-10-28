import { CHARACTERS, type CharacterId } from '../player/CharacterDefinition';
import type { Biome } from '../game/Track';
import { Background } from './Background';
import { BIOME_THEMES } from './BiomeTheme';
import { cosmeticLayers, mountKind, paletteFor, trailStyle } from './Cosmetics2D';
import { Particles } from './Particles';
import { ellipse, shade, type Ctx } from './draw';
import type { GameRenderer } from './GameRenderer';
import { MonsterAnimator, emoteStyle } from './MonsterAnimator';
import { drawMonster, makeAnchors } from './CharacterRig';

export interface ShowcaseLoadout {
  characterId: CharacterId;
  variantId: string | null;
  cosmetics: Record<string, string>;
}

/** Menu backdrop: the parallax biome scrolling gently and the player's monster on a floating island. */
export class MenuScene {
  private bg: Background;
  private biome: Biome;
  private anim = new MonsterAnimator(3);
  private loadout: ShowcaseLoadout | null = null;
  private layers: ReturnType<typeof cosmeticLayers> = {};
  private readonly anchors = makeAnchors();
  private time = 0;
  private emoteTime = 0;
  /** Turn side-on to show off a back item ('cycle' alternates front and side). */
  private sideView: boolean | 'cycle' = false;
  /** Shop preview of a trail: particles stream from the monster on the stage. */
  private trail: ReturnType<typeof trailStyle> | null = null;
  private trailT = 0;
  private readonly particles = new Particles(160);
  private key = '';
  private nudge = 0;
  /** Horizontal offset of the monster (roughly in monster heights), so UI panels can sit beside it. */
  offsetX = 0;
  private shownX = 0;

  constructor(
    private readonly gr: GameRenderer,
    biome: Biome = 'forest',
  ) {
    this.biome = biome;
    this.bg = new Background(biome, gr.quality === 'high' ? 'medium' : gr.quality);
  }

  setBiome(biome: Biome): void {
    if (biome === this.biome) return;
    this.biome = biome;
    this.bg = new Background(biome, this.gr.quality === 'high' ? 'medium' : this.gr.quality);
  }

  show(loadout: ShowcaseLoadout, playEmote = false, sideView: boolean | 'cycle' = false, showTrail = false): void {
    this.sideView = sideView;
    this.trail = showTrail && loadout.cosmetics.trail ? trailStyle(loadout.cosmetics.trail) : null;
    const key = JSON.stringify(loadout);
    if (key !== this.key) {
      const charChanged = !this.loadout || this.loadout.characterId !== loadout.characterId;
      this.loadout = loadout;
      this.layers = cosmeticLayers(loadout.cosmetics);
      this.anim.emote = emoteStyle(loadout.cosmetics.emote);
      if (charChanged) this.anim.onLand(10);
      this.key = key;
    }
    if (playEmote) {
      this.emoteTime = 2.4;
      this.anim.startEmote(this.anim.emote);
    }
  }

  /** Dragging the stage gives the monster a playful wobble. */
  drag(dx: number): void {
    this.nudge = Math.max(-1, Math.min(1, this.nudge + dx * 0.01));
    if (Math.abs(dx) > 4) this.anim.onLand(Math.min(8, Math.abs(dx) * 0.3));
  }

  resize(): void {}

  frame(dt: number): void {
    this.time += dt;
    this.emoteTime = Math.max(0, this.emoteTime - dt);
    this.nudge *= Math.exp(-dt * 3);
    const gr = this.gr;
    const ctx = gr.begin();
    const pr = gr.pixelRatio;
    const w = gr.width;
    const h = gr.height;
    const unit = Math.min(w / 19, h / 9.5);
    this.bg.draw(ctx, w, h, pr, this.time * 1.2, 0, unit, this.time);
    if (!this.loadout) return;

    const portrait = w < h;
    const scale = Math.min(h / (portrait ? 5.2 : 4.3), w / 3.2);
    this.shownX += (this.offsetX - this.shownX) * (1 - Math.exp(-dt * 6));
    const cx = w / 2 + this.shownX * scale * 0.8;
    const groundY = h * (portrait ? 0.56 : 0.66) + Math.sin(this.time * 0.9) * 4;
    this.drawIsland(ctx, cx, groundY, scale);

    const def = CHARACTERS[this.loadout.characterId];
    const pal = paletteFor(def.palette, def.variants, this.loadout.variantId);
    const pose = this.anim.update(dt, this.time, {
      mode: this.emoteTime > 0 ? 'emote' : 'idle',
      speed: 0,
      vy: 0,
      grounded: true,
      phase: 'grid',
      stun: 0,
      boosting: false,
      blocked: false,
      ready: false,
      // A rider stays side-on so the mount can be seen.
      faceSide: this.emoteTime <= 0 && (!!this.loadout.cosmetics.mount || (this.sideView === 'cycle' ? Math.floor(this.time / 2.6) % 2 === 1 : this.sideView)),
      mount: mountKind(this.loadout.cosmetics.mount),
      holding: !!this.loadout.cosmetics.hand,
    });
    pose.lean += this.nudge * 0.25;
    ctx.save();
    ctx.translate(cx, groundY);
    ctx.scale(scale, -scale);
    this.drawTrail(ctx, dt);
    drawMonster(ctx, def.bodyPlan, pal, pose, { flat: false, shadow: true, shadowDrop: 0 }, this.layers, this.anchors);
    ctx.restore();
  }

  /** Trail preview drifting away behind the monster, as it looks while racing. */
  private drawTrail(ctx: Ctx, dt: number): void {
    const tr = this.trail;
    this.particles.update(dt);
    if (tr) {
      if (tr.kind === 'ribbon') {
        const colors = ['#ff5a8a', '#ffb020', '#ffe14d', '#5bd16b', '#4fd6ff', '#b46bff'];
        for (let c = 0; c < colors.length; c++) {
          ctx.beginPath();
          for (let k = 0; k <= 24; k++) {
            const x = -0.25 - k * 0.09;
            const y = 0.5 + (c - 2.5) * 0.045 + Math.sin(this.time * 6 + k * 0.45) * 0.05 * (k / 24);
            if (k === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.lineWidth = 0.05;
          ctx.strokeStyle = colors[c];
          ctx.globalAlpha = 0.85;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else {
        this.trailT -= dt;
        if (this.trailT <= 0) {
          this.trailT = 0.07;
          const x = -0.3;
          const y = tr.kind === 'dust' ? 0.06 : 0.35 + Math.random() * 0.3;
          const base = { x, y, color: tr.color, count: 1, life: 0.9 };
          switch (tr.kind) {
            case 'dust':
              this.particles.emit({ ...base, kind: 'puff', speed: 1, dir: Math.PI * 0.9, spread: 0.5, size: 0.1 });
              break;
            case 'sparkle':
              this.particles.emit({ ...base, kind: 'spark', speed: 1.2, dir: Math.PI, spread: 0.8, size: 0.1 });
              break;
            case 'leaf':
              this.particles.emit({ ...base, kind: 'leaf', speed: 1.4, dir: Math.PI * 0.95, spread: 0.6, size: 0.11, gravity: 0.6 });
              break;
            case 'bubble':
              this.particles.emit({ ...base, kind: 'bubble', speed: 1, dir: Math.PI * 0.8, spread: 0.8, size: 0.09, gravity: -0.6 });
              break;
            case 'note':
              this.particles.emit({ ...base, kind: 'note', speed: 1, dir: Math.PI * 0.75, spread: 0.6, size: 0.17 });
              break;
            case 'flame':
              this.particles.emit({ ...base, kind: 'flame', speed: 1.2, dir: Math.PI, spread: 0.5, size: 0.13, gravity: -2, life: 0.5 });
              break;
          }
        }
      }
    }
    this.particles.draw(ctx, -4, 4);
  }

  private drawIsland(ctx: Ctx, cx: number, gy: number, s: number): void {
    const th = BIOME_THEMES[this.biome];
    const rw = s * 1.25;
    ctx.save();
    ctx.lineJoin = 'round';
    // Rocky underside.
    ctx.beginPath();
    ctx.moveTo(cx - rw, gy);
    ctx.quadraticCurveTo(cx - rw * 0.7, gy + s * 0.55, cx - rw * 0.2, gy + s * 0.7);
    ctx.lineTo(cx, gy + s * 1.05);
    ctx.lineTo(cx + rw * 0.25, gy + s * 0.68);
    ctx.quadraticCurveTo(cx + rw * 0.75, gy + s * 0.5, cx + rw, gy);
    ctx.closePath();
    ctx.fillStyle = th.soil;
    ctx.fill();
    ctx.lineWidth = Math.max(2, s * 0.04);
    ctx.strokeStyle = th.outline;
    ctx.stroke();
    // Grass top.
    ctx.beginPath();
    ellipse(ctx, cx, gy, rw, s * 0.18);
    ctx.fillStyle = th.grass;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ellipse(ctx, cx - rw * 0.15, gy - s * 0.04, rw * 0.7, s * 0.08);
    ctx.fillStyle = th.grassLight;
    ctx.fill();
    // Flowers / crystals on the rim.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      const x = cx + Math.cos(a) * rw * 0.85;
      const y = gy + Math.sin(a) * s * 0.12;
      ctx.beginPath();
      ellipse(ctx, x, y, s * 0.05, s * 0.05);
      ctx.fillStyle = th.decor[i % th.decor.length];
      ctx.fill();
      ctx.lineWidth = Math.max(1, s * 0.015);
      ctx.strokeStyle = shade(th.decor[i % th.decor.length], 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }
}
