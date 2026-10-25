import { CHARACTERS, type CharacterId } from '../player/CharacterDefinition';
import type { Biome } from '../game/Track';
import { Background } from './Background';
import { BIOME_THEMES } from './BiomeTheme';
import { cosmeticLayers, paletteFor } from './Cosmetics2D';
import { ellipse, shade, type Ctx } from './draw';
import type { GameRenderer } from './GameRenderer';
import { MonsterAnimator, emoteStyle } from './MonsterAnimator';
import { drawMonster, makeAnchors } from './MonsterRig';

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

  show(loadout: ShowcaseLoadout, playEmote = false): void {
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
    });
    pose.lean += this.nudge * 0.25;
    ctx.save();
    ctx.translate(cx, groundY);
    ctx.scale(scale, -scale);
    drawMonster(ctx, def.bodyPlan, pal, pose, { flat: false, shadow: true, shadowDrop: 0 }, this.layers, this.anchors);
    ctx.restore();
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
