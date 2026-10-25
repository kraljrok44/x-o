import { ABILITIES } from '../abilities/AbilityDefinition';
import type { RaceSimulation } from '../game/RaceManager';
import type { InputManager } from '../input/InputManager';
import { keyLabel } from '../input/InputManager';
import { CHARACTERS } from '../player/CharacterDefinition';
import { formatRaceTime } from '../shared/time';
import { h } from './dom';
import { ordinal, t } from './i18n';

/**
 * Minimal in-race HUD: position, progress, held ability, hazard warnings.
 * No ads or purchase prompts ever appear here.
 */
export class RaceHUD {
  readonly el: HTMLElement;
  private readonly place = h('div', { class: 'hud-place' });
  private readonly time = h('div', { class: 'hud-time' });
  private readonly glimmers = h('div', { class: 'chip chip--coin hud-glimmers' });
  private readonly progress = h('div', { class: 'hud-progress' }, h('span', { class: 'finish' }, '🏁'));
  private readonly dots: HTMLElement[] = [];
  private readonly ability = h('div', { class: 'hud-ability empty' });
  private readonly abilityIcon = h('span');
  private readonly abilityName = h('span', { class: 'name' });
  private readonly countdown = h('div', { class: 'hud-countdown hidden' });
  private readonly warning = h('div', { class: 'hud-warning hidden' });
  private readonly hint = h('div', { class: 'hud-hint hidden' });
  private readonly fps = h('div', { class: 'hud-fps hidden' });
  private readonly touch: HTMLElement;
  readonly pauseBtn: HTMLButtonElement;
  private last = { place: '', time: '', glim: -1, item: 'x', cd: '', warn: false, hint: '' };
  private fpsAcc = 0;
  private fpsFrames = 0;

  constructor(
    private readonly sim: RaceSimulation,
    private readonly localIndex: number,
    input: InputManager,
    touchMode: boolean,
    private readonly showFps: boolean,
  ) {
    for (const r of sim.racers) {
      const dot = h('div', { class: `hud-dot ${r.index === localIndex ? 'me' : ''}`, style: `background:${CHARACTERS[r.characterId].palette.body}`, title: r.name });
      this.dots.push(dot);
      this.progress.append(dot);
    }
    const abilityKey = keyLabel(input.getBindings().ability[0]);
    this.ability.append(this.abilityName, this.abilityIcon, h('span', { class: 'key' }, touchMode ? '' : abilityKey));
    this.pauseBtn = h('button', { class: 'btn btn--icon interactive hud-pause', 'aria-label': t('Paused') }, '⏸');
    this.touch = h('div', { class: `touch interactive ${touchMode ? '' : 'hidden'}` });
    const btn = (cls: string, label: string) => h('div', { class: `touch-btn ${cls}` }, label);
    const left = btn('touch-left', '◀');
    const right = btn('touch-right', '▶');
    const jump = btn('touch-jump', 'JUMP');
    this.touch.append(left, right, jump);
    input.bindTouchButton(left, 'left');
    input.bindTouchButton(right, 'right');
    input.bindTouchButton(jump, 'jump');
    if (touchMode) {
      this.ability.classList.add('interactive');
      input.bindTouchButton(this.ability, 'ability');
    }
    document.body.classList.toggle('touch-on', touchMode);
    if (showFps) this.fps.classList.remove('hidden');
    this.el = h(
      'div',
      { class: 'hud' },
      h('div', { class: 'hud-top' }, h('div', null, this.place, this.time, this.glimmers), h('div')),
      this.progress,
      this.pauseBtn,
      this.touch,
      this.ability,
      this.countdown,
      this.warning,
      this.hint,
      this.fps,
    );
  }

  callout(text: string): void {
    const c = h('div', { class: 'hud-callout' }, text);
    this.el.append(c);
    setTimeout(() => c.remove(), 1200);
  }

  setHint(text: string | null): void {
    const v = text ?? '';
    if (v === this.last.hint) return;
    this.last.hint = v;
    this.hint.textContent = v;
    this.hint.classList.toggle('hidden', !v);
  }

  update(dt: number): void {
    const sim = this.sim;
    const me = sim.racers[this.localIndex];
    const n = sim.racers.length;
    const placeIdx = sim.placeOf(this.localIndex) + 1;
    const placeStr = n > 1 ? `${ordinal(placeIdx)}/${n}` : '';
    if (placeStr !== this.last.place) {
      this.last.place = placeStr;
      this.place.replaceChildren(n > 1 ? ordinal(placeIdx) : '⏱', h('small', null, n > 1 ? `/${n}` : ''));
    }
    const tm = me.finishTime ?? Math.max(0, sim.time);
    const timeStr = formatRaceTime(tm);
    if (timeStr !== this.last.time) {
      this.last.time = timeStr;
      this.time.textContent = timeStr;
    }
    if (me.stats.glimmers !== this.last.glim) {
      this.last.glim = me.stats.glimmers;
      this.glimmers.textContent = `✦ ${me.stats.glimmers}`;
    }
    const len = sim.track.length;
    for (const r of sim.racers) {
      const pct = Math.max(0, Math.min(1, r.body.s / len)) * 100;
      this.dots[r.index].style.left = `${pct}%`;
    }
    const item = me.item ?? '';
    if (item !== this.last.item) {
      this.last.item = item;
      if (me.item) {
        const def = ABILITIES[me.item];
        this.abilityIcon.textContent = def.icon;
        this.abilityIcon.style.color = def.color;
        this.abilityName.textContent = def.name;
        this.ability.classList.remove('empty');
        this.ability.classList.add('ready');
        this.ability.style.borderColor = def.color;
      } else {
        this.abilityIcon.textContent = '?';
        this.abilityIcon.style.color = '#9aa7b8';
        this.abilityName.textContent = '';
        this.ability.classList.add('empty');
        this.ability.classList.remove('ready');
        this.ability.style.borderColor = '';
      }
    }
    // Countdown.
    let cd = '';
    if (sim.phase === 'countdown') cd = String(Math.ceil((sim.countdownTicks - sim.tick) / 60));
    else if (sim.time < 0.7) cd = t('GO');
    if (cd !== this.last.cd) {
      this.last.cd = cd;
      this.countdown.textContent = cd;
      this.countdown.classList.toggle('hidden', !cd);
      this.countdown.classList.remove('pop');
      void this.countdown.offsetWidth;
      if (cd) this.countdown.classList.add('pop');
    }
    // Incoming seeker warning.
    let warn = false;
    for (const e of sim.entities) if (e.kind === 'seeker' && e.alive && e.target === this.localIndex && e.s > me.body.s - 25) warn = true;
    if (warn !== this.last.warn) {
      this.last.warn = warn;
      this.warning.textContent = '⚠ ' + t('Incoming seeker!');
      this.warning.classList.toggle('hidden', !warn);
    }
    if (this.showFps) {
      this.fpsAcc += dt;
      this.fpsFrames++;
      if (this.fpsAcc > 0.5) {
        this.fps.textContent = `${Math.round(this.fpsFrames / this.fpsAcc)} FPS`;
        this.fpsAcc = 0;
        this.fpsFrames = 0;
      }
    }
  }
}
