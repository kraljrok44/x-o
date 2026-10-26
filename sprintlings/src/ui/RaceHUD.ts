import { ABILITIES } from '../abilities/AbilityDefinition';
import type { RaceSimulation } from '../game/RaceManager';
import type { Racer } from '../game/RaceState';
import type { InputManager } from '../input/InputManager';
import { keyLabel } from '../input/InputManager';
import { CHARACTERS, SPECIALS } from '../player/CharacterDefinition';
import { specialReady } from '../abilities/SpecialAbility';
import { formatRaceTime } from '../shared/time';
import { h } from './dom';
import { ordinal, t } from './i18n';

/** Quick-chat lines (keys 1-4). */
export const EMOTES = ['Howdy!', 'Yeehaw!', 'Oops!', 'GG!'] as const;

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
  /** Animal special button with a cooldown ring. */
  private readonly special = h('div', { class: 'hud-special' });
  private readonly specialRing = h('div', { class: 'ring' });
  private readonly countdown = h('div', { class: 'hud-countdown hidden' });
  private readonly trackTitle = h('div', { class: 'hud-track-title hidden' });
  private readonly emotes = h('div', { class: 'hud-emotes interactive' });
  private readonly spectate = h('div', { class: 'hud-spectate interactive hidden' });
  /** Called with the quick-chat slot (0-3) when an emote button is pressed. */
  onEmote: ((slot: number) => void) | null = null;
  private readonly warning = h('div', { class: 'hud-warning hidden' });
  private readonly hint = h('div', { class: 'hud-hint hidden' });
  private readonly fps = h('div', { class: 'hud-fps hidden' });
  private readonly feedEl = h('div', { class: 'hud-feed' });
  private readonly teamsEl = h('div', { class: 'hud-teams' });
  private readonly teamSlots: HTMLElement[] = [];
  private readonly touch: HTMLElement;
  readonly pauseBtn: HTMLButtonElement;
  private last = { place: '', time: '', glim: -1, item: 'x', cd: '', warn: false, hint: '', ring: '' };
  private fpsAcc = 0;
  private fpsFrames = 0;

  constructor(
    private readonly sim: RaceSimulation,
    private readonly localIndex: number,
    input: InputManager,
    touchMode: boolean,
    private readonly showFps: boolean,
    portrait?: (r: Racer) => string,
  ) {
    // Fun Run-style header: your side vs the rivals, finishers turn into flags.
    const mine = sim.racers.filter((r) => r.team === sim.racers[localIndex].team);
    const rivals = sim.racers.filter((r) => r.team !== sim.racers[localIndex].team);
    const slot = (r: Racer) => {
      const el = h('div', { class: `hud-team-slot ${r.team === sim.racers[localIndex].team ? 'mine' : 'rival'}`, title: r.name }, portrait ? h('img', { src: portrait(r), alt: '' }) : r.name.slice(0, 1));
      this.teamSlots[r.index] = el;
      return el;
    };
    if (sim.racers.length > 1) this.teamsEl.append(...mine.map(slot), h('b', { class: 'hud-vs' }, 'VS'), ...rivals.map(slot));
    for (const r of sim.racers) {
      const dot = h('div', { class: `hud-dot ${r.index === localIndex ? 'me' : ''}`, style: `background:${CHARACTERS[r.characterId].palette.body}`, title: r.name });
      this.dots.push(dot);
      this.progress.append(dot);
    }
    const abilityKey = keyLabel(input.getBindings().ability[0]);
    this.ability.append(this.abilityName, this.abilityIcon, h('span', { class: 'key' }, touchMode ? '' : abilityKey));
    const sp = SPECIALS[CHARACTERS[sim.racers[localIndex].characterId].special];
    this.special.title = `${sp.name}: ${sp.description}`;
    this.special.append(this.specialRing, h('span', { class: 'icon' }, sp.icon), h('span', { class: 'name' }, sp.name), h('span', { class: 'key' }, touchMode ? '' : keyLabel(input.getBindings().special[0])));
    if (touchMode) {
      this.special.classList.add('interactive');
      input.bindTouchButton(this.special, 'special');
    }
    this.trackTitle.textContent = sim.track.data.name;
    EMOTES.forEach((em, i) => {
      const b = h('button', { class: 'hud-emote', title: em }, h('span', null, em), touchMode ? null : h('span', { class: 'key' }, String(i + 1)));
      b.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.onEmote?.(i);
      });
      this.emotes.append(b);
    });
    this.pauseBtn = h('button', { class: 'btn btn--icon interactive hud-pause', 'aria-label': t('Paused') }, '⏸');
    this.touch = h('div', { class: `touch interactive ${touchMode ? '' : 'hidden'}` });
    const btn = (cls: string, label: string) => h('div', { class: `touch-btn ${cls}` }, label);
    const down = btn('touch-down', '▼');
    const jump = btn('touch-jump', t('JUMP'));
    this.touch.append(down, jump);
    input.bindTouchButton(down, 'down');
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
      this.teamsEl,
      this.feedEl,
      this.touch,
      this.ability,
      this.special,
      this.countdown,
      this.trackTitle,
      this.emotes,
      this.spectate,
      this.warning,
      this.hint,
      this.fps,
    );
  }

  /** Kill feed line, newest on top: "attacker 🚀 victim" (or a finish notice). */
  feed(left: string, icon: string, right: string, leftMine: boolean, rightMine: boolean): void {
    const line = h(
      'div',
      { class: 'hud-feed-line' },
      h('span', { class: leftMine ? 'mine' : 'rival' }, left),
      h('span', { class: 'ico' }, icon),
      h('span', { class: rightMine ? 'mine' : 'rival' }, right),
    );
    this.feedEl.prepend(line);
    while (this.feedEl.children.length > 6) this.feedEl.lastElementChild?.remove();
    setTimeout(() => line.classList.add('fade'), 4500);
    setTimeout(() => line.remove(), 5200);
  }

  callout(text: string): void {
    const c = h('div', { class: 'hud-callout' }, text);
    this.el.append(c);
    setTimeout(() => c.remove(), 1200);
  }

  /** After finishing: "Spectating <name>" with a skip button (null hides it). */
  showSpectate(name: string | null, onSkip: () => void): void {
    if (name === null) {
      this.spectate.classList.add('hidden');
      return;
    }
    const skip = h('button', { class: 'btn btn--primary' }, t('Skip') + ' ▶');
    skip.addEventListener('click', onSkip);
    this.spectate.replaceChildren(h('span', null, '👁 ' + t('Spectating {name}', { name })), skip);
    this.spectate.classList.remove('hidden');
    this.emotes.classList.add('hidden');
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
    for (const r of sim.racers) {
      const s = this.teamSlots[r.index];
      if (s && r.finishTime !== null && !s.classList.contains('done')) s.classList.add('done');
    }
    const len = sim.track.length;
    for (const r of sim.racers) {
      const pct = Math.max(0, Math.min(1, r.body.x / len)) * 100;
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
    // Special cooldown ring.
    const spDef = SPECIALS[CHARACTERS[me.characterId].special];
    const frac = me.specialCooldown > 0 ? me.specialCooldown / spDef.cooldown : 0;
    const ringKey = `${Math.round(frac * 60)}|${specialReady(sim, me) ? 1 : 0}`;
    if (ringKey !== this.last.ring) {
      this.last.ring = ringKey;
      this.specialRing.style.background = frac > 0 ? `conic-gradient(rgba(42,22,11,0.72) ${frac * 360}deg, transparent 0)` : 'none';
      this.special.classList.toggle('ready', frac === 0);
      this.special.classList.toggle('usable', specialReady(sim, me));
    }
    // Countdown.
    let cd = '';
    if (sim.phase === 'countdown') cd = String(Math.ceil((sim.countdownTicks - sim.tick) / 60));
    else if (sim.time < 0.7) cd = t('GO');
    this.trackTitle.classList.toggle('hidden', sim.phase !== 'countdown');
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
    for (const e of sim.entities) if (e.kind === 'seeker' && e.alive && e.target === this.localIndex && e.x > me.body.x - 25) warn = true;
    if (warn !== this.last.warn) {
      this.last.warn = warn;
      this.warning.textContent = '⚠ ' + t('Incoming rocket!');
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
