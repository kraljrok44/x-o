import { SPECIAL_IDS } from '../abilities/SpecialAbility';
import { ABILITIES } from '../abilities/AbilityDefinition';
import { CHARACTERS } from '../player/CharacterDefinition';
import type { RaceSimulation } from '../game/RaceManager';
import { NOOSE_HIT, SNARE_HIT, type RaceEvent, type Racer } from '../game/RaceState';
import { GameplayConfig } from '../config/GameplayConfig';
import { Background } from './Background';
import { BIOME_THEMES } from './BiomeTheme';
import { Camera2D } from './Camera2D';
import { cosmeticLayers, paletteFor, trailStyle, mountKind, mountedHeight } from './Cosmetics2D';
import { ellipse, rgba, roundRect, type Ctx } from './draw';
import type { GameRenderer } from './GameRenderer';
import { MonsterAnimator, emoteStyle } from './MonsterAnimator';
import { drawMonster, makeAnchors, monsterHeight, type RigAnchors } from './CharacterRig';
import { Particles } from './Particles';
import { WorldPainter } from './WorldPainter';

class RacerVisual {
  readonly anim: MonsterAnimator;
  readonly palette;
  readonly plan;
  readonly layers;
  readonly anchors: RigAnchors = makeAnchors();
  readonly trail;
  readonly height: number;
  prevX = 0;
  prevY = 0;
  currX = 0;
  currY = 0;
  x = 0;
  y = 0;
  trailT = 0;
  celebrating = false;
  readonly ribbon: number[] = [];
  bubble = '';
  bubbleT = 0;
  readonly mount: ReturnType<typeof mountKind>;
  readonly holding: boolean;
  ko: KoKind | null = null;
  koT = 0;
  koDur = 0;

  constructor(readonly racer: Racer) {
    const def = CHARACTERS[racer.characterId];
    this.plan = def.bodyPlan;
    this.palette = paletteFor(def.palette, def.variants, racer.variantId);
    this.layers = cosmeticLayers(racer.cosmetics);
    this.trail = trailStyle(racer.cosmetics.trail);
    this.anim = new MonsterAnimator(racer.index * 31 + 7);
    this.anim.emote = emoteStyle(racer.cosmetics.emote);
    this.height = mountedHeight(racer.cosmetics.mount, monsterHeight(this.plan));
    this.mount = mountKind(racer.cosmetics.mount);
    this.holding = !!racer.cosmetics.hand;
    this.reset();
  }

  reset(): void {
    const b = this.racer.body;
    this.prevX = this.currX = this.x = b.x;
    this.prevY = this.currY = this.y = b.y;
  }

  snapshot(): void {
    const b = this.racer.body;
    this.prevX = this.currX;
    this.prevY = this.currY;
    this.currX = b.x;
    this.currY = b.y;
    if (Math.abs(this.currX - this.prevX) > 3 || Math.abs(this.currY - this.prevY) > 3) {
      this.prevX = this.currX;
      this.prevY = this.currY;
    }
  }

  interpolate(alpha: number): void {
    this.x = this.prevX + (this.currX - this.prevX) * alpha;
    this.y = this.prevY + (this.currY - this.prevY) * alpha;
  }
}

const SHADOW_SKIP = 1e9;

type KoKind = 'blast' | 'shock' | 'rope' | 'squash' | 'burn' | 'cut' | 'bonk' | 'fall';

const KO_FOR_HAZARD: Record<string, KoKind> = {
  log: 'bonk',
  beam: 'bonk',
  pendulum: 'bonk',
  spikes: 'cut',
  saw: 'cut',
  crusher: 'squash',
  boulder: 'squash',
  flame: 'burn',
};

const PRELOAD_AHEAD = 90;

export class RaceScene {
  readonly camera = new Camera2D();
  private readonly bg: Background;
  private readonly world: WorldPainter;
  private readonly visuals: RacerVisual[];
  private readonly particles: Particles;
  private time = 0;
  private groundRef = 0;
  private readonly ropes: { from: number; to: number; life: number }[] = [];
  private readonly bolts: { x: number; y: number; life: number }[] = [];
  private readonly hazardKind = new Map<number, string>();

  private knockOut(v: RacerVisual | null, kind: KoKind): void {
    if (!v) return;
    v.ko = kind;
    v.koT = 0;
    v.koDur = Math.max(0.55, Math.min(1.1, v.racer.body.stun || 0.7));
    const b = v.racer.body;
    const p = this.particles;
    switch (kind) {
      case 'blast':
        p.emit({ kind: 'puff', x: b.x, y: b.y + 0.6, color: 'rgba(60,52,50,0.85)', count: 12, speed: 2.8, dir: Math.PI / 2, spread: 2.2, size: 0.26, life: 0.9 });
        p.emit({ kind: 'flame', x: b.x, y: b.y + 0.5, color: '#ffb020', count: 8, speed: 3.5, size: 0.16, life: 0.4 });
        break;
      case 'shock':
        p.emit({ kind: 'spark', x: b.x, y: b.y + 0.7, color: '#bfe8ff', count: 16, speed: 4, size: 0.1, life: 0.5 });
        break;
      case 'burn':
        p.emit({ kind: 'flame', x: b.x, y: b.y + 0.3, color: '#ff8a1c', count: 10, speed: 2.2, dir: Math.PI / 2, spread: 0.8, size: 0.16, life: 0.5 });
        break;
      case 'squash':
        p.emit({ kind: 'puff', x: b.x, y: b.y + 0.05, color: 'rgba(230,210,170,0.9)', count: 10, speed: 2.6, dir: 0, spread: Math.PI * 2, size: 0.16, life: 0.45 });
        break;
      case 'cut':
        p.emit({ kind: 'spark', x: b.x, y: b.y + 0.4, color: '#ffffff', count: 8, speed: 3, size: 0.08, life: 0.35 });
        break;
      default:
        break;
    }
  }

  private koPose(ctx: Ctx, v: RacerVisual, dt: number): string {
    const b = v.racer.body;
    if (b.phase === 'fall') {
      const k = 1 - Math.max(0, b.phaseTimer) / GameplayConfig.fall.fallDuration;
      ctx.translate(0, 0.55);
      ctx.rotate(k * Math.PI * 2.5);
      ctx.scale(1 - k * 0.45, 1 - k * 0.45);
      ctx.translate(0, -0.55);
      return '';
    }
    if (!v.ko) return '';
    v.koT += dt;
    const t = v.koT;
    const k = Math.min(1, t / v.koDur);
    if (k >= 1 || b.phase !== 'run') {
      v.ko = null;
      return '';
    }
    const fade = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    const soot = (a: number) => `brightness(${(1 - 0.65 * a * fade).toFixed(2)}) saturate(${(1 - 0.6 * a * fade).toFixed(2)})`;
    switch (v.ko) {
      case 'blast': {
        const s = Math.min(1, t / 0.45);
        ctx.translate(0, Math.sin(s * Math.PI) * 0.7 + 0.55);
        ctx.rotate(-s * Math.PI * 2);
        ctx.translate(0, -0.55);
        if (Math.floor(t * 12) % 3 === 0) this.particles.emit({ kind: 'puff', x: b.x, y: b.y + 1.1, color: 'rgba(70,62,60,0.6)', count: 1, speed: 0.8, dir: Math.PI / 2, spread: 0.6, size: 0.14, life: 0.6 });
        return soot(1);
      }
      case 'shock': {
        ctx.translate((Math.floor(t * 40) % 2 ? 1 : -1) * 0.04, 0);
        if (t < 0.45) return Math.floor(t * 16) % 2 ? 'brightness(2.4) contrast(1.3)' : soot(1);
        return soot(1);
      }
      case 'rope': {
        const up = Math.min(1, t / 0.15);
        ctx.translate(0, 0.55 + up * 0.5);
        ctx.rotate(Math.PI * up + Math.sin(t * 9) * 0.25 * up);
        ctx.translate(0, -0.55);
        return '';
      }
      case 'squash': {
        const sq = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
        const wob = k >= 0.6 ? Math.sin((k - 0.6) * 30) * 0.12 * (1 - k) : 0;
        ctx.scale(1 + 0.5 * sq + wob, 1 - 0.68 * sq - wob);
        return '';
      }
      case 'burn': {
        ctx.translate(0, Math.abs(Math.sin(t * 16)) * 0.18 * fade);
        if (Math.floor(t * 10) % 2 === 0) this.particles.emit({ kind: 'puff', x: b.x, y: b.y + 1.2, color: 'rgba(80,72,70,0.55)', count: 1, speed: 0.7, dir: Math.PI / 2, spread: 0.4, size: 0.12, life: 0.7 });
        return soot(0.8);
      }
      case 'cut': {
        const j = Math.sin(Math.min(1, t / 0.3) * Math.PI);
        ctx.translate(-j * 0.15, j * 0.25 + 0.55);
        ctx.rotate(j * 0.5);
        ctx.translate(0, -0.55);
        return '';
      }
      case 'bonk': {
        const s = Math.max(0, 1 - t / 0.25);
        ctx.scale(1 + 0.25 * s, 1 - 0.25 * s);
        return '';
      }
      default:
        return '';
    }
  }
  follow: number;
  shakeEnabled = true;
  private readonly lowQ: boolean;

  constructor(
    private readonly gr: GameRenderer,
    private readonly sim: RaceSimulation,
    readonly localIndex: number,
  ) {
    this.follow = localIndex;
    this.lowQ = gr.quality === 'low';
    this.bg = new Background(sim.track.biome, gr.quality);
    this.world = new WorldPainter(sim.track, BIOME_THEMES[sim.track.biome], gr.quality);
    this.visuals = sim.racers.map((r) => new RacerVisual(r));
    for (const h of sim.track.data.hazards) this.hazardKind.set(h.id, h.kind);
    this.particles = new Particles(gr.quality === 'low' ? 140 : gr.quality === 'medium' ? 320 : 600);
    this.resize();
    const me = sim.racers[localIndex].body;
    this.groundRef = me.y;
    this.camera.snap(me.x + 1.5, me.y + 1.2);
  }

  async loadExtras(): Promise<void> {}

  preload(budgetMs: number): number {
    this.resize();
    return this.world.prepareChunks(this.camera.left, PRELOAD_AHEAD, this.camera.scale * this.gr.pixelRatio, budgetMs);
  }

  resize(): void {
    this.camera.resize(this.gr.width, this.gr.height);
  }

  onTick(events: readonly RaceEvent[]): void {
    for (const v of this.visuals) v.snapshot();
    for (const e of events) this.handle(e);
  }

  private handle(e: RaceEvent): void {
    const p = this.particles;
    const v = e.racer >= 0 ? this.visuals[e.racer] : null;
    const local = e.racer === this.localIndex;
    switch (e.type) {
      case 'jump':
        v?.anim.onJump();
        p.emit({ kind: 'puff', x: e.x - 0.1, y: e.y + 0.05, color: 'rgba(255,255,255,0.8)', count: 3, speed: 1.2, dir: Math.PI, spread: 1.6, size: 0.12, life: 0.35 });
        break;
      case 'land': {
        const impact = e.value / 10;
        v?.anim.onLand(impact);
        if (impact > 4) p.emit({ kind: 'puff', x: e.x, y: e.y + 0.05, color: 'rgba(255,255,255,0.85)', count: Math.min(8, Math.round(impact / 2)), speed: 1.8, dir: Math.PI / 2, spread: Math.PI, size: 0.13, life: 0.4 });
        if (local && impact > 12) this.camera.shake(0.04);
        break;
      }
      case 'hit':
      case 'bonk':
      case 'seekerHit':
        v?.anim.onHit();
        this.knockOut(
          v,
          e.type === 'seekerHit' ? 'blast' : e.type === 'bonk' ? 'bonk' : e.value >= NOOSE_HIT ? 'rope' : e.value >= SNARE_HIT ? 'blast' : (KO_FOR_HAZARD[this.hazardKind.get(e.value) ?? ''] ?? 'bonk'),
        );
        p.emit({ kind: 'star', x: e.x, y: e.y + 0.8, color: '#ffe14d', count: 6, speed: 3, size: 0.14, life: 0.6, gravity: 4 });
        if (e.type === 'seekerHit') {
          p.emit({ kind: 'puff', x: e.x, y: e.y + 0.6, color: '#ff7a3d', count: 8, speed: 3, size: 0.18, life: 0.4 });
          this.world.addScorch(e.x, e.y);
        }
        if (local) this.camera.shake(0.12);
        break;
      case 'abilityHit': {
        if (e.special === 'pickpocket') {
          p.emit({ kind: 'spark', x: e.x, y: e.y + 0.9, color: '#ffe14d', count: 8, speed: 2.5, size: 0.1, life: 0.5 });
          break;
        }
        v?.anim.onHit();
        this.knockOut(v, e.ability === 'bomb' ? 'blast' : e.ability === 'thunder' ? 'shock' : e.ability === 'lasso' ? 'rope' : 'bonk');
        p.emit({ kind: 'star', x: e.x, y: e.y + 0.8, color: '#ffe14d', count: 6, speed: 3, size: 0.14, life: 0.6, gravity: 4 });
        if (e.ability === 'lasso') {
          const from = this.sim.racers[e.value]?.body;
          if (from) this.ropes.push({ from: e.value, to: e.racer, life: 0.45 });
        }
        if (local) this.camera.shake(0.12);
        break;
      }
      case 'special':
        switch (SPECIAL_IDS[e.value]) {
          case 'quickDash':
          case 'stampede':
            p.emit({ kind: 'line', x: e.x - 0.3, y: e.y + 0.5, color: 'rgba(255,214,120,0.95)', count: 8, speed: 4, dir: Math.PI, spread: 0.3, size: 0.22, life: 0.4 });
            p.emit({ kind: 'puff', x: e.x - 0.2, y: e.y + 0.1, color: 'rgba(210,170,110,0.85)', count: 8, speed: 2, dir: Math.PI, spread: 1, size: 0.18, life: 0.5 });
            break;
          case 'doubleHop':
            p.emit({ kind: 'ring', x: e.x, y: e.y, color: '#ffffff', count: 1, speed: 0, size: 0.45, life: 0.35 });
            p.emit({ kind: 'puff', x: e.x, y: e.y, color: 'rgba(255,255,255,0.9)', count: 6, speed: 2, dir: -Math.PI / 2, spread: 1.4, size: 0.12, life: 0.35 });
            break;
          case 'ironHide':
            p.emit({ kind: 'ring', x: e.x, y: e.y + 0.6, color: '#b8c4d8', count: 1, speed: 0, size: 0.6, life: 0.45 });
            break;
          case 'howl':
            for (let k = 0; k < 3; k++) p.emit({ kind: 'ring', x: e.x + 0.2, y: e.y + 1.0, color: '#cfe0ff', count: 1, speed: 0, size: 1 + k * 1.2, life: 0.5 + k * 0.15 });
            p.emit({ kind: 'note', x: e.x + 0.3, y: e.y + 1.2, color: '#cfe0ff', count: 3, speed: 1.2, dir: Math.PI / 2, spread: 1, size: 0.18, life: 0.8 });
            break;
          default:
            break;
        }
        break;
      case 'blast':
        if (e.value === 1) {
          this.bolts.push({ x: e.x, y: e.y, life: 0.35 });
          p.emit({ kind: 'spark', x: e.x, y: e.y + 0.4, color: '#ffe14d', count: 14, speed: 5, size: 0.12, life: 0.5 });
        } else {
          p.emit({ kind: 'ring', x: e.x, y: e.y + 0.3, color: '#ffb020', count: 1, speed: 0, size: 0.7, life: 0.35 });
          p.emit({ kind: 'puff', x: e.x, y: e.y + 0.3, color: '#ff7a3d', count: 14, speed: 5, size: 0.24, life: 0.5 });
          p.emit({ kind: 'puff', x: e.x, y: e.y + 0.4, color: 'rgba(70,60,60,0.8)', count: 10, speed: 2.5, dir: Math.PI / 2, spread: 1.4, size: 0.3, life: 0.9 });
          this.world.addScorch(e.x, e.y);
        }
        if (Math.abs(e.x - this.sim.racers[this.localIndex].body.x) < 10) this.camera.shake(0.1);
        break;
      case 'shieldBlock':
        p.emit({ kind: 'ring', x: e.x, y: e.y + 0.6, color: '#9b8cff', count: 1, speed: 0, size: 0.5, life: 0.45 });
        p.emit({ kind: 'spark', x: e.x, y: e.y + 0.6, color: '#d8d0ff', count: 8, speed: 3.5, size: 0.1, life: 0.4 });
        break;
      case 'respawn':
        p.emit({ kind: 'spark', x: e.x, y: e.y + 0.6, color: '#ffffff', count: 10, speed: 2.5, size: 0.12, life: 0.5 });
        p.emit({ kind: 'ring', x: e.x, y: e.y + 0.6, color: '#ffffff', count: 1, speed: 0, size: 0.4, life: 0.4 });
        if (local) this.groundRef = e.y;
        v?.reset();
        break;
      case 'itemPickup': {
        const box = this.sim.track.data.itemBoxes[e.value];
        this.world.onBoxPicked(e.value, this.time);
        if (box) p.emit({ kind: 'confetti', x: box.x, y: box.y + 0.1, color: ['#ffe066', '#ff9f1c', '#ffffff'][e.value % 3], count: 10, speed: 3.5, size: 0.07, life: 0.6, gravity: 6 });
        break;
      }
      case 'abilityUse':
        if (e.ability === 'dash') p.emit({ kind: 'line', x: e.x - 0.3, y: e.y + 0.5, color: 'rgba(79,214,255,0.9)', count: 6, speed: 4, dir: Math.PI, spread: 0.3, size: 0.2, life: 0.35 });
        else if (e.ability === 'shield') p.emit({ kind: 'ring', x: e.x, y: e.y + 0.6, color: '#c8bfff', count: 1, speed: 0, size: 0.3, life: 0.35 });
        else p.emit({ kind: 'puff', x: e.x, y: e.y + 0.4, color: e.ability ? ABILITIES[e.ability].color : '#ffffff', count: 5, speed: 1.6, size: 0.12, life: 0.4 });
        break;
      case 'seekerExpire':
        p.emit({ kind: 'puff', x: e.x, y: e.y, color: 'rgba(255,170,120,0.8)', count: 5, speed: 1.5, size: 0.12, life: 0.35 });
        break;
      case 'glimmer':
        if (local) p.emit({ kind: 'spark', x: e.x + 0.2, y: e.y + 0.9, color: '#7ef2ff', count: 4, speed: 2.2, size: 0.1, life: 0.35 });
        break;
      case 'boostPad':
        p.emit({ kind: 'spark', x: e.x, y: e.y + 0.2, color: '#4fd6ff', count: 6, speed: 3, dir: Math.PI * 0.75, spread: 1, size: 0.1, life: 0.35 });
        break;
      case 'bounce':
        this.world.onBounce(e.value, Math.max(0, this.sim.time));
        v?.anim.onJump();
        p.emit({ kind: 'puff', x: e.x, y: e.y + 0.3, color: 'rgba(255,200,230,0.9)', count: 5, speed: 2, size: 0.12, life: 0.35 });
        break;
      case 'drop':
        p.emit({ kind: 'puff', x: e.x, y: e.y, color: 'rgba(255,255,255,0.6)', count: 3, speed: 1, size: 0.1, life: 0.3 });
        break;
      case 'streak':
        p.emit({ kind: 'ring', x: e.x, y: e.y + 0.6, color: '#ff8a1c', count: 1, speed: 0, size: 0.5, life: 0.45 });
        p.emit({ kind: 'spark', x: e.x, y: e.y + 0.5, color: '#ffb020', count: 10, speed: 3.5, dir: Math.PI, spread: 1.2, size: 0.12, life: 0.45 });
        if (local) this.camera.shake(0.05);
        break;
      case 'startBoost':
        p.emit({ kind: 'ring', x: e.x, y: e.y + 0.5, color: '#ffe14d', count: 1, speed: 0, size: 0.4, life: 0.5 });
        p.emit({ kind: 'spark', x: e.x, y: e.y + 0.5, color: '#ffe14d', count: 8, speed: 3, size: 0.12, life: 0.45 });
        break;
      case 'finish':
        v?.anim.onHappy();
        if (local || e.value === 1) {
          const colors = ['#ff5a8a', '#ffe14d', '#4fd6ff', '#5bd16b', '#b46bff', '#ffffff'];
          for (let i = 0; i < 6; i++) p.emit({ kind: 'confetti', x: this.sim.track.length, y: e.y + 3, color: colors[i], count: local ? 8 : 3, speed: 5, dir: Math.PI / 2, spread: 2.4, size: 0.08, life: 1.6, gravity: 5, drag: 1.2 });
        }
        break;
      default:
        break;
    }
  }

  frame(dt: number, alpha: number): void {
    this.time += dt;
    const sim = this.sim;
    const gr = this.gr;
    const ctx = gr.begin();
    const pr = gr.pixelRatio;
    const w = gr.width;
    const h = gr.height;
    const cam = this.camera;
    const raceTime = sim.time + alpha / 60;

    for (const v of this.visuals) v.interpolate(alpha);
    const me = this.visuals[this.localIndex];
    const fv = this.visuals[this.follow] ?? me;
    const mb = fv.racer.body;

    if (mb.grounded && mb.phase === 'run') this.groundRef = fv.y;
    const above = Math.max(0, fv.y - this.groundRef - 1.2);
    const targetY = this.groundRef + 1.0 + above * 0.7;
    const lead = mb.phase === 'finished' ? 0 : 1.2 + Math.min(1.2, mb.speed * 0.08);
    cam.follow(dt, fv.x + lead, targetY);
    cam.updateShake(dt, this.shakeEnabled);

    ctx.setTransform(pr, 0, 0, pr, 0, 0);
    this.bg.draw(ctx, w, h, pr, cam.x, cam.y, cam.scale, this.time);

    cam.applyWorld(ctx, pr);
    const L = cam.left;
    const R = cam.right;
    const B = cam.bottom - 1;
    this.world.drawPitShade(ctx, L, R, B);
    this.world.drawTerrain(ctx, L, R, B, cam, pr);
    if (!this.lowQ) this.world.drawDecor(ctx, L, R, this.time);
    this.world.drawStartFinish(ctx, L, R, this.time);
    this.world.drawPlatforms(ctx, L, R);
    this.world.drawDecals(ctx, L, R);
    this.world.drawHazards(ctx, L, R, raceTime, me.racer.body);
    this.world.drawItemBoxes(ctx, L, R, this.time, sim.itemBoxReadyAt, raceTime);
    this.world.drawGlimmers(ctx, L, R, this.time, me.racer.glimmerTaken);
    this.world.drawEntities(ctx, sim.entities, this.time);

    for (const v of this.visuals) this.updateTrail(v, dt);
    this.particles.update(dt);
    this.particles.draw(ctx, L, R);
    for (const v of this.visuals) if (v !== me) this.drawRacer(ctx, v, dt, false);
    this.drawRacer(ctx, me, dt, true);
    this.drawStrikes(ctx, dt);

    cam.applyScreen(ctx, pr);
    this.bg.drawOverlay(ctx, w, h, cam.x, cam.scale, this.time);
    for (const v of this.visuals) this.drawTag(ctx, v, v === me);
    for (const v of this.visuals) this.drawBubble(ctx, v, dt);
    this.drawOffscreen(ctx, fv);
  }

  private drawStrikes(ctx: Ctx, dt: number): void {
    for (let i = this.ropes.length - 1; i >= 0; i--) {
      const r = this.ropes[i];
      r.life -= dt;
      if (r.life <= 0) {
        this.ropes.splice(i, 1);
        continue;
      }
      const a = this.visuals[r.from];
      const b = this.visuals[r.to];
      const ax = a.x + 0.3;
      const ay = a.y + 0.9;
      const bx = b.x;
      const by = b.y + 0.7;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo((ax + bx) / 2, Math.max(ay, by) + 0.9 * r.life, bx, by);
      ctx.lineWidth = 0.07;
      ctx.strokeStyle = '#c9a063';
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(bx, by, 0.32, 0.14, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const s = this.bolts[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.bolts.splice(i, 1);
        continue;
      }
      const top = s.y + 4;
      ctx.save();
      ctx.globalAlpha = Math.min(1, s.life / 0.2);
      for (const [w, c] of [
        [0.32, 'rgba(255,240,140,0.5)'],
        [0.1, '#ffffff'],
      ] as const) {
        ctx.beginPath();
        ctx.moveTo(s.x, top);
        let x = s.x;
        for (let k = 1; k <= 6; k++) {
          x = s.x + (((k * 37 + Math.floor(this.time * 30)) % 7) / 7 - 0.5) * 0.7;
          ctx.lineTo(k === 6 ? s.x : x, top - ((top - s.y) * k) / 6);
        }
        ctx.lineWidth = w;
        ctx.strokeStyle = c;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private updateTrail(v: RacerVisual, dt: number): void {
    const b = v.racer.body;
    if (b.phase !== 'run' && b.phase !== 'finished') {
      v.ribbon.length = 0;
      return;
    }
    if (v.trail.kind === 'ribbon') {
      v.ribbon.push(v.x - 0.3, v.y + 0.45);
      while (v.ribbon.length > 4 && (v.ribbon.length > 40 || v.ribbon[0] < v.x - 3.2)) v.ribbon.splice(0, 2);
      return;
    }
    const running = b.grounded && b.speed > 3;
    const fancy = v.trail.kind !== 'dust';
    if (!running && !fancy) return;
    v.trailT -= dt;
    if (v.trailT > 0) return;
    v.trailT = this.lowQ ? 0.12 : fancy ? 0.06 : 0.09;
    const t = v.trail;
    const x = v.x - 0.35;
    const y = v.y + (fancy ? 0.4 : 0.06);
    switch (t.kind) {
      case 'dust':
        this.particles.emit({ kind: 'puff', x, y, color: rgba(t.color, 0.7), speed: 0.6, dir: Math.PI * 0.8, spread: 0.6, size: 0.09, life: 0.35 });
        break;
      case 'sparkle':
        this.particles.emit({ kind: 'spark', x, y, color: t.color, speed: 0.8, size: 0.09, life: 0.45 });
        break;
      case 'leaf':
        this.particles.emit({ kind: 'leaf', x, y, color: t.color, speed: 1.2, dir: Math.PI * 0.85, spread: 0.8, size: 0.1, life: 0.7, gravity: 1 });
        break;
      case 'bubble':
        this.particles.emit({ kind: 'bubble', x, y, color: t.color, speed: 0.8, dir: Math.PI / 2, spread: 1.2, size: 0.08, life: 0.8, gravity: -0.6 });
        break;
      case 'note':
        this.particles.emit({ kind: 'note', x, y: y + 0.2, color: t.color, speed: 0.8, dir: Math.PI * 0.6, spread: 0.6, size: 0.16, life: 0.8 });
        break;
      case 'flame':
        this.particles.emit({ kind: 'flame', x, y, color: t.color, speed: 0.8, dir: Math.PI, spread: 0.6, size: 0.12, life: 0.35, gravity: -2 });
        break;
      default:
        break;
    }
  }

  private drawRacer(ctx: Ctx, v: RacerVisual, dt: number, local: boolean): void {
    const b = v.racer.body;
    const cam = this.camera;
    if (v.x < cam.left - 2 || v.x > cam.right + 2) {
      v.anim.update(dt, this.time, this.animInput(v));
      return;
    }
    if (v.ribbon.length > 4) {
      const colors = ['#ff5a8a', '#ffb020', '#ffe14d', '#5bd16b', '#4fd6ff', '#b46bff'];
      for (let c = 0; c < colors.length; c++) {
        ctx.beginPath();
        for (let i = 0; i < v.ribbon.length; i += 2) {
          const x = v.ribbon[i];
          const y = v.ribbon[i + 1] + (c - 2.5) * 0.045;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.lineWidth = 0.05;
        ctx.strokeStyle = colors[c];
        ctx.globalAlpha = 0.8;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    const input = this.animInput(v);
    if (b.phase === 'finished' && !v.celebrating && b.speed < 4.5) {
      v.celebrating = true;
      v.anim.startEmote(v.anim.emote);
    }
    const pose = v.anim.update(dt, this.time, input);

    ctx.save();
    ctx.translate(v.x, v.y);
    if (b.phase === 'respawn') {
      const k = Math.max(0.05, 1 - b.phaseTimer / GameplayConfig.fall.respawnDelay);
      ctx.translate(0, 0.6);
      ctx.scale(k, k);
      ctx.translate(0, -0.6);
    }
    if (b.invuln > 0 && b.phase === 'run' && Math.floor(this.time * 14) % 2 === 0) ctx.globalAlpha = 0.45;
    if (!local) ctx.globalAlpha *= 0.92;
    const ground = this.sim.track.groundBelow(v.x, v.y + 0.05, b.dropTimer > 0 ? b.dropId : -1, true);
    const drop = Number.isNaN(ground) ? -SHADOW_SKIP : ground - v.y;
    const tint = this.koPose(ctx, v, dt);
    if (tint && !this.lowQ) ctx.filter = tint;
    drawMonster(ctx, v.plan, v.palette, pose, { flat: this.lowQ, shadow: drop > -3.5 && !v.ko, shadowDrop: drop }, v.layers, v.anchors);
    ctx.filter = 'none';
    ctx.restore();

    if (b.shield > 0) {
      const r = 0.85 + Math.sin(this.time * 6) * 0.03;
      ctx.save();
      ctx.globalAlpha = b.shield < 1 && Math.floor(this.time * 10) % 2 === 0 ? 0.3 : 0.6;
      ctx.beginPath();
      ellipse(ctx, v.x + 0.05, v.y + 0.62, r, r);
      const g = ctx.createRadialGradient(v.x - 0.2, v.y + 0.9, 0.1, v.x, v.y + 0.62, r);
      g.addColorStop(0, 'rgba(255,255,255,0.5)');
      g.addColorStop(0.7, 'rgba(255,210,90,0.15)');
      g.addColorStop(1, 'rgba(255,190,60,0.55)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 0.04;
      ctx.strokeStyle = 'rgba(255,220,120,0.95)';
      ctx.stroke();
      ctx.restore();
    }
    if ((b.dash > 0 || b.padBoost > 0) && b.phase === 'run') {
      ctx.save();
      ctx.strokeStyle = b.dash > 0 ? 'rgba(79,214,255,0.8)' : 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 0.05;
      for (let i = 0; i < 4; i++) {
        const k = (this.time * 4 + i * 0.27) % 1;
        const y = v.y + 0.25 + i * 0.22;
        ctx.globalAlpha = 1 - k;
        ctx.beginPath();
        ctx.moveTo(v.x - 0.6 - k * 1.2, y);
        ctx.lineTo(v.x - 1.2 - k * 1.2, y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private animInput(v: RacerVisual) {
    const b = v.racer.body;
    const sim = this.sim;
    const countdownLeft = sim.phase === 'countdown' ? (sim.countdownTicks - sim.tick) / 60 : 0;
    return {
      mode: (v.celebrating ? 'emote' : b.phase === 'grid' ? 'idle' : 'race') as 'race' | 'idle' | 'emote',
      speed: b.speed,
      vy: b.vy,
      grounded: b.grounded,
      phase: b.phase,
      stun: b.stun,
      boosting: b.dash > 0 || b.padBoost > 0,
      blocked: b.blocked,
      ready: b.phase === 'grid' && countdownLeft < 1.1,
      sliding: b.sliding,
      climbing: b.climbing,
      mount: v.mount,
      holding: v.holding,
    };
  }

  private drawTag(ctx: Ctx, v: RacerVisual, local: boolean): void {
    const cam = this.camera;
    const r = v.racer;
    if (r.body.phase === 'fall') return;
    const x = cam.sx(v.x);
    const y = cam.sy(v.y + v.height + 0.25);
    if (x < -50 || x > cam.width + 50) return;
    const fs = Math.max(11, Math.min(16, cam.scale * 0.17));
    ctx.font = `600 ${fs}px Fredoka, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    if (local && this.sim.time < 2) {
      const label = r.name;
      const tw = ctx.measureText(label).width + 14;
      ctx.beginPath();
      roundRect(ctx, x - tw / 2, y - fs - 30, tw, fs + 6, 8);
      ctx.fillStyle = 'rgba(200,120,30,0.9)';
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x, y - 26);
    }
    if (local) {
      const bob = Math.sin(this.time * 5) * 3;
      ctx.beginPath();
      ctx.moveTo(x - 8, y - 14 + bob);
      ctx.lineTo(x + 8, y - 14 + bob);
      ctx.lineTo(x, y - 4 + bob);
      ctx.closePath();
      ctx.fillStyle = '#ffe14d';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#2a1d2e';
      ctx.stroke();
    } else {
      const mate = this.sim.isTeamRace && this.sim.sameTeam(r.index, this.localIndex);
      const label = r.name;
      const tw = ctx.measureText(label).width + 12;
      ctx.beginPath();
      roundRect(ctx, x - tw / 2, y - fs - 8, tw, fs + 6, 8);
      ctx.fillStyle = mate ? 'rgba(40,100,190,0.75)' : 'rgba(42,22,11,0.6)';
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x, y - 4);
      ctx.beginPath();
      ctx.moveTo(x - 5, y + 2);
      ctx.lineTo(x + 5, y + 2);
      ctx.lineTo(x, y + 9);
      ctx.closePath();
      ctx.fillStyle = mate ? '#7cdc4a' : '#ff4a3a';
      ctx.fill();
    }
    if (r.item && r.body.phase === 'run') {
      const ab = ABILITIES[r.item];
      const bx = x + (local ? 0 : 0);
      const by = y - (local ? 30 : fs + 22);
      ctx.beginPath();
      ellipse(ctx, bx, by, 12, 12);
      ctx.fillStyle = ab.color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 14px Fredoka, system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(ab.icon, bx, by + 1);
    }
  }

  say(index: number, text: string): void {
    const v = this.visuals[index];
    if (!v) return;
    v.bubble = text;
    v.bubbleT = 2;
    v.anim.onHappy();
  }

  private drawBubble(ctx: Ctx, v: RacerVisual, dt: number): void {
    if (v.bubbleT <= 0) return;
    v.bubbleT -= dt;
    const cam = this.camera;
    const x = cam.sx(v.x);
    if (x < -80 || x > cam.width + 80) return;
    const pop = Math.min(1, (2 - v.bubbleT) * 8);
    const y = cam.sy(v.y + v.height + 0.25) - 52;
    ctx.save();
    ctx.globalAlpha = Math.min(1, v.bubbleT * 3);
    ctx.font = `700 ${15 * pop}px Rye, Fredoka, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(v.bubble).width + 18;
    ctx.beginPath();
    roundRect(ctx, x - tw / 2, y - 15 * pop, tw, 30 * pop, 12);
    ctx.moveTo(x - 6, y + 14 * pop);
    ctx.lineTo(x, y + 24 * pop);
    ctx.lineTo(x + 6, y + 14 * pop);
    ctx.fillStyle = '#fff6de';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#3a1f10';
    ctx.stroke();
    ctx.fillStyle = '#3a1f10';
    ctx.fillText(v.bubble, x, y + 1);
    ctx.restore();
  }

  private drawOffscreen(ctx: Ctx, me: RacerVisual): void {
    const cam = this.camera;
    for (const v of this.visuals) {
      if (v === me || v.racer.body.phase === 'finished') continue;
      const sx = cam.sx(v.x);
      const ahead = sx > cam.width + 10;
      const behind = sx < -10;
      if (!ahead && !behind) continue;
      const sy = Math.max(40, Math.min(cam.height - 60, cam.sy(v.y + 0.6)));
      const x = ahead ? cam.width - 26 : 26;
      const dir = ahead ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(x + dir * 14, sy);
      ctx.lineTo(x - dir * 6, sy - 12);
      ctx.lineTo(x - dir * 6, sy + 12);
      ctx.closePath();
      ctx.fillStyle = v.palette.body;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.font = '600 12px Fredoka, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(30,20,45,0.8)';
      ctx.lineWidth = 3;
      const label = `${Math.round(Math.abs(v.x - me.x))}m`;
      ctx.strokeText(label, x - dir * 4, sy + 15);
      ctx.fillText(label, x - dir * 4, sy + 15);
    }
  }

  dispose(): void {
    this.particles.clear();
  }
}
