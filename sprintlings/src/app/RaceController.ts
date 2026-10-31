import { SPECIAL_IDS } from '../abilities/SpecialAbility';
import { SPECIALS } from '../player/CharacterDefinition';
import { TICK_DT } from '../config/GameplayConfig';
import { AIController } from '../ai/AIController';
import { ABILITIES, type AbilityId } from '../abilities/AbilityDefinition';
import type { SfxId } from '../audio/AudioManager';
import type { RaceSettlement } from '../economy/EconomyService';
import { RaceSimulation } from '../game/RaceManager';
import { InputRecorder } from '../game/RaceReplay';
import { summarizeRace, type RaceResultSummary } from '../game/RaceResults';
import { NO_INPUT, type RaceEvent } from '../game/RaceState';
import type { RaceTicket } from '../game/RaceVerifier';
import { getTrack } from '../game/TrackManager';
import { BIOME_THEMES } from '../render/BiomeTheme';
import { RaceScene } from '../render/RaceScene';
import { h } from '../ui/dom';
import { t } from '../ui/i18n';
import { EMOTES, RaceHUD } from '../ui/RaceHUD';
import type { Screen } from '../ui/UIRoot';
import type { AppContext } from './AppContext';
import type { OnlineLink } from '../network/OnlineLink';

const ABILITY_SFX: Record<AbilityId, SfxId> = { dash: 'dash', shield: 'shield', seeker: 'seeker', snare: 'snare', sap: 'sap', lasso: 'lasso', thunder: 'thunder', bomb: 'whoosh' };
const MAX_STEPS_PER_FRAME = 5;

export type RacePhaseUI = 'lobby' | 'racing' | 'paused' | 'finishing' | 'results';

/**
 * Runs one race on the client: fixed-step simulation, input recording for
 * verification, rendering, HUD, audio and the pause menu.
 */
export class RaceController {
  readonly sim: RaceSimulation;
  readonly scene: RaceScene;
  readonly hud: RaceHUD;
  readonly recorder = new InputRecorder();
  phase: RacePhaseUI = 'lobby';
  private acc = 0;
  private finishTimer = 0;
  private readonly tutorial: boolean;
  private readonly touch: boolean;
  private pauseModal: HTMLElement | null = null;
  private settled = false;
  private autopilot: AIController | null = null;
  onFinished: ((summary: RaceResultSummary, settlement: Promise<RaceSettlement>) => void) | null = null;
  onQuit: (() => void) | null = null;
  onRestart: (() => void) | null = null;

  /** This player's racer index (0 offline; the server's slot online). */
  readonly me: number;

  constructor(
    private readonly ctx: AppContext,
    readonly ticket: RaceTicket,
    /** Set for online races: inputs come from the server, tick by tick. */
    readonly online: OnlineLink | null = null,
  ) {
    this.me = online?.me ?? 0;
    this.sim = new RaceSimulation({ track: getTrack(ticket.trackId), seed: ticket.seed, racers: ticket.racers, ...(online ? { finishGrace: 12 } : {}) });
    this.scene = new RaceScene(ctx.renderer, this.sim, this.me);
    void this.scene.loadExtras();
    const s = ctx.settings.value;
    const touch = s.touchControls === 'on' || (s.touchControls === 'auto' && matchMedia('(pointer: coarse)').matches);
    this.touch = touch;
    this.hud = new RaceHUD(this.sim, this.me, ctx.input, touch, s.showFps, (r) => ctx.thumbs.portrait(r.characterId, r.variantId, {}, true));
    this.hud.pauseBtn.addEventListener('click', () => this.pause());
    this.hud.onEmote = (slot) => this.emote(this.me, slot);
    ctx.input.onEmote = (slot) => this.emote(this.me, slot);
    this.tutorial = !online && !ctx.authority.profile.tutorialDone;
    this.scene.shakeEnabled = s.cameraShake && !s.reducedMotion;
  }

  private lastEmote = -10;

  /** Quick chat bubble (purely cosmetic, never touches the simulation). */
  private emote(index: number, slot: number): void {
    if (this.phase === 'results' || this.phase === 'lobby') return;
    if (index === this.me) {
      const now = performance.now() / 1000;
      if (now - this.lastEmote < 1.2) return;
      this.lastEmote = now;
    }
    this.scene.say(index, EMOTES[slot]);
    if (index === this.me) this.ctx.audio.play('click');
  }

  /** Bots chat a little: brag after a hit, grumble when hit, GG at the finish. */
  private botChat(e: RaceEvent): void {
    const bot = (i: number) => i !== this.me && !!this.sim.racers[i] && !this.sim.racers[i].isPlayer;
    const roll = (p: number) => Math.random() < p;
    if ((e.type === 'abilityHit' || e.type === 'seekerHit') && e.special !== 'pickpocket') {
      if (bot(e.value) && roll(0.35)) this.emote(e.value, 1);
      else if (bot(e.racer) && roll(0.25)) this.emote(e.racer, 2);
    } else if (e.type === 'finish' && bot(e.racer) && roll(e.value === 1 ? 0.7 : 0.3)) this.emote(e.racer, e.value === 1 ? 1 : 3);
    else if (e.type === 'go') for (const r of this.sim.racers) if (bot(r.index) && roll(0.2)) this.emote(r.index, 0);
  }

  private buzz(ms: number): void {
    try {
      if (this.ctx.settings.value.touchControls !== 'off') navigator.vibrate?.(ms);
    } catch {
      /* not supported */
    }
  }

  /** Screen wrapper so the HUD participates in UIRoot navigation. */
  hudScreen(): Screen {
    return { el: this.hud.el, onBack: () => (this.togglePause(), true) };
  }

  /** Loading screen step: pre-renders the course a slice at a time. Returns progress 0..1. */
  preload(): number {
    return this.scene.preload(8);
  }

  begin(): void {
    this.phase = 'racing';
    this.ctx.input.reset();
    this.ctx.input.enabled = true;
    this.ctx.platform.gameplayStart();
    const th = BIOME_THEMES[this.sim.track.biome];
    this.ctx.audio.playMusic(th.music, this.ticket.seed, 1);
    this.ctx.analytics.track('race_start', { track: this.ticket.trackId, mode: this.ticket.mode });
  }

  togglePause(): void {
    if (this.phase === 'paused') this.resume();
    else this.pause();
  }

  pause(): void {
    if (this.phase !== 'racing') return;
    this.phase = 'paused';
    this.ctx.input.enabled = false;
    this.ctx.platform.gameplayStop();
    this.ctx.audio.setMusicIntensity(0.3);
    const vol = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(this.ctx.settings.value.audio.master) }) as HTMLInputElement;
    vol.addEventListener('input', () => {
      this.ctx.settings.update({ audio: { ...this.ctx.settings.value.audio, master: Number(vol.value) } });
      this.ctx.audio.applySettings(this.ctx.settings.value.audio);
    });
    const body = h('div', { class: 'stack' }, h('div', { class: 'setting' }, h('label', null, t('Master')), vol));
    this.pauseModal = this.ctx.ui.modal(
      t('Paused'),
      body,
      [
        {
          label: t('Quit race'),
          kind: 'bad',
          run: async () => {
            const ok = await this.ctx.ui.confirm(t('Quit race'), t('Leave the race? You will not get rewards for it.'), t('Leave'), 'bad');
            if (!ok) return false;
            this.quit();
            return true;
          },
        },
        ...(this.online ? [] : [{ label: t('Restart'), kind: 'ghost' as const, run: () => this.onRestart?.() }]),
        { label: '▶ ' + t('Resume'), kind: 'good', run: () => this.resume() },
      ],
      { dismissable: false },
    );
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    if (this.pauseModal) this.ctx.ui.closeModal(this.pauseModal);
    this.pauseModal = null;
    this.phase = 'racing';
    this.acc = 0;
    this.ctx.input.reset();
    this.ctx.input.enabled = true;
    this.ctx.platform.gameplayStart();
    this.ctx.audio.setMusicIntensity(1);
  }

  quit(): void {
    this.ctx.input.onEmote = null;
    this.ctx.input.enabled = false;
    this.ctx.platform.gameplayStop();
    this.phase = 'results';
    this.onQuit?.();
  }

  frame(dt: number): void {
    if (this.online) return this.onlineFrame(dt);
    if (this.phase === 'racing' || this.phase === 'finishing') {
      this.acc += Math.min(dt, 0.1);
      let steps = 0;
      while (this.acc >= TICK_DT && steps < MAX_STEPS_PER_FRAME && this.sim.phase !== 'done') {
        this.acc -= TICK_DT;
        steps++;
        const input = this.phase === 'racing' ? this.ctx.input.sample() : NO_INPUT;
        this.recorder.record(this.sim.tick, input);
        const events = this.sim.step([input]);
        this.scene.onTick(events);
        this.handleEvents(events);
      }
      if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
      if (this.phase === 'finishing') {
        this.updateSpectate(dt);
        this.finishTimer -= dt;
        if (this.finishTimer <= 0 || this.sim.phase === 'done') this.settle();
      } else if (this.sim.phase === 'done') this.settle();
      if (this.tutorial && this.phase === 'racing') this.updateTutorial();
    }
    const alpha = this.phase === 'racing' || this.phase === 'finishing' ? this.acc / TICK_DT : 1;
    this.scene.frame(dt, alpha);
    if (this.phase !== 'lobby') this.hud.update(dt);
  }

  /**
   * Online: send this frame's input, then step the simulation through the
   * ticks the server has relayed (a little faster when behind). The race
   * keeps running while the pause menu is open.
   */
  private onlineFrame(dt: number): void {
    const link = this.online!;
    const running = this.phase === 'racing' || this.phase === 'finishing' || this.phase === 'paused';
    if (running) {
      if (this.phase === 'racing') link.sendInput(this.ctx.input.sample());
      this.acc += Math.min(dt, 0.25);
      const behind = link.buffered(this.sim.tick);
      let want = Math.floor(this.acc / TICK_DT) + (behind > 8 ? Math.min(4, behind - 6) : 0);
      let steps = 0;
      while (want-- > 0 && steps < 10 && link.has(this.sim.tick) && this.sim.phase !== 'done') {
        const events = this.sim.step(link.take(this.sim.tick));
        steps++;
        link.check(this.sim);
        this.scene.onTick(events);
        this.handleEvents(events);
      }
      // Starved (waiting for the server): do not bank time and then rush.
      this.acc = Math.min(Math.max(0, this.acc - steps * TICK_DT), TICK_DT * 2);
      if (this.phase === 'finishing') {
        this.updateSpectate(dt);
        this.finishTimer -= dt;
      }
      if ((this.sim.phase === 'done' || (this.phase === 'finishing' && this.finishTimer <= 0)) && link.end) this.settle();
    }
    this.scene.frame(dt, running ? Math.min(1, this.acc / TICK_DT) : 1);
    if (this.phase !== 'lobby') this.hud.update(dt);
  }

  /** Kill feed: who hit whom with which powerup, and who finished. */
  private feed(e: RaceEvent): void {
    const sim = this.sim;
    const victim = sim.racers[e.racer];
    if (!victim) return;
    const mine = (i: number) => sim.sameTeam(i, this.me);
    let owner = -1;
    let icon = '';
    if (e.type === 'seekerHit') {
      owner = e.value;
      icon = ABILITIES.seeker.icon;
    } else if (e.type === 'hit' && e.value >= 200000) {
      const ent = sim.entities.find((x) => x.id === e.value % 100000);
      if (ent) {
        owner = ent.owner;
        icon = ent.kind === 'noose' ? ABILITIES.lasso.icon : ABILITIES.snare.icon;
      }
    } else if (e.type === 'abilityHit') {
      owner = e.value;
      icon = e.special ? SPECIALS[e.special].icon : e.ability ? ABILITIES[e.ability].icon : '💥';
    } else if (e.type === 'finish') {
      this.hud.feed(victim.name, '🏁', t('Finished'), mine(e.racer), mine(e.racer));
      return;
    }
    if (owner < 0) return;
    this.hud.feed(sim.racers[owner].name, icon, victim.name, mine(owner), mine(e.racer));
  }

  private handleEvents(events: readonly RaceEvent[]): void {
    const a = this.ctx.audio;
    const me = this.sim.racers[this.me].body;
    for (const e of events) {
      this.feed(e);
      this.botChat(e);
      if (e.type === 'countdown') {
        if (e.value > 0) a.play('beep');
        continue;
      }
      if (e.type === 'go') {
        a.play('go');
        continue;
      }
      const local = e.racer === this.me;
      const near = Math.abs(e.x - me.x) < 22;
      const vol = local ? 1 : near ? 0.3 : 0;
      if (vol === 0) continue;
      // Rivals ahead sound to the right, behind to the left.
      const pan = local ? 0 : Math.max(-0.7, Math.min(0.7, (e.x - me.x) / 12));
      switch (e.type) {
        case 'jump':
          a.play('jump', vol, pan);
          break;
        case 'land':
          if (local) a.play('land', 0.7);
          break;
        case 'glimmer':
          if (local) a.play('glimmer');
          break;
        case 'itemPickup':
          if (local) a.play('item');
          break;
        case 'abilityUse':
          if (e.ability) a.play(ABILITY_SFX[e.ability], vol, pan);
          break;
        case 'hit':
          a.play('hit', vol, pan);
          if (local) this.buzz(35);
          break;
        case 'seekerHit':
          a.play('hit', vol, pan);
          if (!local && e.value === this.me) this.hud.callout('💥 Hit!');
          break;
        case 'bonk':
          a.play('bonk', vol, pan);
          if (local) this.buzz(50);
          break;
        case 'blast':
          a.play(e.value === 1 ? 'thunder' : 'boom', Math.max(vol, near ? 0.5 : 0), pan);
          if (local) this.buzz(60);
          break;
        case 'itemExpire':
          if (local) this.hud.callout('⌛ ' + t('Powerup fizzled out'));
          break;
        case 'abilityHit':
          if (e.special === 'pickpocket') {
            a.play('item', vol, pan);
            if (local) this.hud.callout('🦝 ' + t('Your powerup was stolen!'));
            if (e.value === this.me) this.hud.callout('🦝 ' + t('Stolen!'));
            break;
          }
          a.play('hit', vol, pan);
          if (local) this.buzz(40);
          break;
        case 'special': {
          const id = SPECIAL_IDS[e.value];
          a.play(id === 'howl' ? 'howl' : id === 'ironHide' ? 'shield' : id === 'doubleHop' ? 'jump' : id === 'pickpocket' ? 'item' : 'dash', vol, pan);
          break;
        }
        case 'shieldBlock':
          a.play('block', vol, pan);
          break;
        case 'fall':
          if (local) a.play('fall');
          break;
        case 'respawn':
          if (local) a.play('respawn');
          break;
        case 'boostPad':
          if (local) a.play('boost');
          break;
        case 'streak':
          if (local) {
            a.play('boost');
            this.hud.callout(`🔥 ${t('Hot streak')} ×${e.value}`);
          }
          break;
        case 'bounce':
          a.play('bounce', vol, pan);
          break;
        case 'startBoost':
          if (local) {
            a.play('boost');
            this.hud.callout('🚀 ' + t('Start boost!'));
          }
          break;
        case 'finish':
          if (local) {
            a.play('finish');
            this.hud.callout(e.value === 1 && this.sim.racers.length > 1 ? '🏆 ' + t('Finished!') : t('Finished!'));
            if (e.value === 1 && this.sim.racers.length > 1) this.ctx.platform.happyTime();
            this.beginFinishing();
          }
          break;
        default:
          break;
      }
    }
  }

  private beginFinishing(): void {
    this.phase = 'finishing';
    this.ctx.input.enabled = false;
    this.ctx.platform.gameplayStop();
    this.finishTimer = 2.6;
    this.hud.setHint(null);
    // Watch the rest of the field run in (up to 20 s), or skip straight to results.
    if (this.sim.racers.some((r) => r.finishTime === null)) this.finishTimer = 20;
    this.spectateDelay = 2.2;
  }

  private spectateDelay = 0;

  /** Follows the best-placed racer still running. */
  private updateSpectate(dt: number): void {
    if (this.spectateDelay > 0) {
      this.spectateDelay -= dt;
      return;
    }
    const sim = this.sim;
    const next = sim.standings.find((i) => sim.racers[i].finishTime === null);
    if (next === undefined) {
      this.finishTimer = Math.min(this.finishTimer, 1.5);
      return;
    }
    if (this.scene.follow !== next) {
      this.scene.follow = next;
      this.hud.showSpectate(sim.racers[next].name, () => this.settle());
    }
  }

  /** Fast-forwards the remaining racers, then hands the race to the authority for verification. */
  private settle(): void {
    if (this.settled) return;
    if (this.online) return this.settleOnline();
    this.settled = true;
    this.hud.showSpectate(null, () => {});
    this.ctx.input.onEmote = null;
    this.ctx.input.enabled = false;
    this.ctx.platform.gameplayStop();
    const idle = NO_INPUT;
    let guard = 0;
    while (this.sim.phase !== 'done' && guard++ < 60 * 30) {
      this.recorder.record(this.sim.tick, idle);
      this.scene.onTick(this.sim.step([idle]));
    }
    this.phase = 'results';
    this.ctx.audio.setMusicIntensity(0.5);
    const summary = summarizeRace(this.sim);
    const settlement = this.ctx.authority.finishRace(this.ticket, this.recorder.log);
    if (this.tutorial) void settlement.then(() => this.ctx.authority.completeTutorial()).catch(() => {});
    const me = summary.racers.find((r) => r.isPlayer);
    this.ctx.analytics.track('race_finish', { track: this.ticket.trackId, place: me?.place ?? 0, finished: me?.finishTime !== null });
    this.onFinished?.(summary, settlement);
  }

  /** Online results come from the server's own simulation and settlement. */
  private settleOnline(): void {
    const link = this.online!;
    if (!link.end) return;
    this.settled = true;
    this.hud.showSpectate(null, () => {});
    this.ctx.input.onEmote = null;
    this.ctx.input.enabled = false;
    this.ctx.platform.gameplayStop();
    this.phase = 'results';
    if (this.pauseModal) this.ctx.ui.closeModal(this.pauseModal);
    this.pauseModal = null;
    this.ctx.audio.setMusicIntensity(0.5);
    const summary = summarizeRace(this.sim);
    // The server's standings are authoritative (they match unless this client drifted).
    for (const s of link.end.standings) {
      const r = summary.racers.find((x) => x.index === s.index);
      if (r) {
        r.place = s.place;
        r.finishTime = s.finishTime;
      }
    }
    summary.racers.sort((a, b) => a.place - b.place);
    const end = link.end;
    const settlement = (async () => {
      await this.ctx.authority.refresh?.();
      if (!end.settlement) throw new Error(t('The race server could not record this race.'));
      return end.settlement;
    })();
    link.close();
    this.ctx.analytics.track('race_finish', { track: this.ticket.trackId, place: summary.racers.find((r) => r.index === this.me)?.place ?? 0, online: true, desync: link.desynced });
    this.onFinished?.(summary, settlement);
  }

  private updateTutorial(): void {
    const sim = this.sim;
    const r = sim.racers[this.me];
    const b = r.body;
    if (sim.phase === 'countdown') {
      this.hud.setHint(t('Press jump right at GO for a start boost!'));
      return;
    }
    if (sim.time < 1.2) {
      this.hud.setHint(null);
      return;
    }
    let hint: string | null = null;
    sim.track.forHazardsNear(b.x, b.x + 9, (h) => {
      if (hint) return;
      const d = h.x - b.x;
      if (d < 0) return;
      if ((h.kind === 'log' || h.kind === 'spikes' || h.kind === 'saw') && d < 7) hint = `${t('Jump!')} (${this.touch ? t('tap JUMP') : t('Space / W / ↑ or tap')})`;
      else if ((h.kind === 'crusher' || h.kind === 'flame') && d < 8) hint = t('Watch the timing: jump over it or wait for it to open.');
      else if (h.kind === 'spring' && d < 6) hint = t('Springs launch you across wide gaps!');
    });
    if (!hint) {
      for (let x = b.x + 1; x < b.x + 8; x += 0.5) {
        const g = sim.track.solidTop(x);
        if (Number.isNaN(g)) {
          hint = `${t('Jump!')} · ${t('Hold jump to jump higher')}`;
          break;
        }
        // A real ledge face (a sudden rise), not a hill you simply run up.
        const before = sim.track.solidTop(x - 0.1);
        if (g - b.y > 0.35 && !Number.isNaN(before) && g - before > 0.3) {
          hint = `${t('Jump up the step!')} · ${t('Hold jump to jump higher')}`;
          break;
        }
      }
    }
    if (!hint && b.grounded && b.pieceId >= 0 && sim.track.isOneWay(b.pieceId)) hint = `${t('Drop down')}: ${this.touch ? t('▼ / swipe down') : t('S / ↓ or swipe down')}`;
    if (!hint && r.item) hint = `${t('Use your ability!')} (${this.touch ? t('tap the ability button') : t('E / right click')})`;
    this.hud.setHint(hint);
  }

  /**
   * Test helper (used by the end-to-end tests, where software rendering is
   * slow): simulates `ticks` ticks without rendering, driving the player with
   * an autopilot that produces ordinary inputs. Inputs are recorded, so the
   * authority's verification still applies.
   */
  fastForward(ticks: number, skill: 'rookie' | 'perfect' = 'perfect'): void {
    if (this.online) return;
    this.autopilot ??= new AIController(0, skill, 12345);
    for (let i = 0; i < ticks && this.phase === 'racing' && this.sim.phase !== 'done'; i++) {
      const input = this.sim.phase === 'countdown' ? this.autopilot.decideCountdown(this.sim) : this.autopilot.decide(this.sim);
      this.recorder.record(this.sim.tick, input);
      const events = this.sim.step([input]);
      this.scene.onTick(events);
      this.handleEvents(events);
    }
  }

  dispose(): void {
    this.online?.close();
    this.ctx.input.enabled = false;
    this.scene.dispose();
    document.body.classList.remove('touch-on');
  }
}
