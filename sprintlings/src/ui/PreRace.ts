import type { AppContext } from '../app/AppContext';
import type { RaceTicket } from '../game/RaceVerifier';
import { trackInfo } from '../game/TrackManager';
import { CHARACTERS } from '../player/CharacterDefinition';
import { h } from './dom';
import { Rng } from '../shared/Rng';
import { animalLevel, leagueFor } from '../progression/LeagueService';
import { t } from './i18n';
import type { Screen } from './UIRoot';

const TIPS = [
  'Slide (hold down) to duck under rockets and low swings!',
  'Jumping has a small speed penalty: stay on the ground when you can.',
  'Every animal has its own special ability and a passive. Try them all!',
  'Thunder Cloud always strikes the leader: a Tin Star Shield blocks it.',
  'Pickpocket steals a rival powerup: use yours before a raccoon gets close.',
  'Press jump right at GO for a start boost!',
  'In Duos your powerups never hurt your partner.',
  'Wins earn trophies: climb from Tenderfoot to Legend of the West.',
  'Press 1-4 for quick chat.',
] as const;

/**
 * Loading lobby: every racer's card (animal, level, trophies) while the
 * course is prepared in the background; the race starts once it is ready.
 */
export function preRace(ctx: AppContext, ticket: RaceTicket, onGo: () => void, onCancel: () => void, load: () => number = () => 1): Screen {
  const info = trackInfo(ticket.trackId);
  let left = 4.2;
  let started = false;
  let loaded = 0;
  const go = () => {
    if (started || loaded < 1) return;
    started = true;
    onGo();
  };
  const timer = h('span', { class: 'drop-timer' });
  const barFill = h('div', { class: 'load-bar__fill' });
  const barText = h('div', { class: 'load-bar__text' }, t('Loading track…'));
  const bar = h('div', { class: 'load-bar' }, barFill, barText);
  const p = ctx.authority.profile;
  // Bots get a trophy count and animal level close to yours (display only).
  const rng = new Rng(ticket.seed ^ 0x5eed);
  const card = (r: RaceTicket['racers'][number], i: number) => {
    const trophies = i === 0 ? p.trophies : Math.max(0, p.trophies + rng.int(-120, 120));
    const lvl = i === 0 ? animalLevel(p, r.characterId) : Math.max(1, Math.min(20, animalLevel(p, p.loadout.characterId) + rng.int(-2, 3)));
    const lg = leagueFor(trophies);
    const mate = ticket.mode === 'duos' && (r.team ?? i) === (ticket.racers[0].team ?? 0);
    return h(
      'div',
      { class: `panel racer-card ${i === 0 ? 'me' : mate ? 'mate' : 'rival'}`, style: `animation-delay:${0.15 + i * 0.35}s` },
      h('img', { src: ctx.thumbs.portrait(r.characterId, r.variantId ?? null, r.cosmetics ?? {}), alt: '', style: 'width:100%;max-width:120px;aspect-ratio:1' }),
      h('div', { class: 'card__name' }, i === 0 ? `${r.name} (${t('You')})` : r.name),
      h('div', { class: 'small muted' }, `${CHARACTERS[r.characterId].name} · ${t('Lv {n}', { n: lvl })}`),
      h('div', { class: 'small', style: `color:${lg.color};font-weight:700;-webkit-text-stroke:0.4px #3a1f10` }, `${lg.icon} ${trophies}`),
    );
  };
  const all = ticket.racers.map(card);
  const cards: HTMLElement[] =
    ticket.mode === 'duos'
      ? [...all.filter((_, i) => (ticket.racers[i].team ?? i) === (ticket.racers[0].team ?? 0)), h('div', { class: 'lobby-vs' }, 'VS'), ...all.filter((_, i) => (ticket.racers[i].team ?? i) !== (ticket.racers[0].team ?? 0))]
      : all;
  const tip = TIPS[Math.floor(rng.next() * TIPS.length)];
  const touch = matchMedia('(pointer: coarse)').matches;
  const readyBtn = h('button', { class: 'btn btn--good btn--big', onClick: go, disabled: true }, t('Ready')) as HTMLButtonElement;
  const el = h(
    'div',
    { class: 'screen', style: 'background:rgba(27,21,48,0.45)' },
    h(
      'div',
      { class: 'screen__center' },
      h(
        'div',
        { class: 'sheet stack', style: 'max-width:760px' },
        h('div', { class: 'drop-title' }, t('Riding into {track} in…', { track: ticket.mode === 'remix' ? t('Daily Trail') : info.name }), timer),
        h('div', { class: `lobby-racers ${ticket.mode === 'duos' ? 'lobby-racers--duos' : ''}` }, ...cards),
        bar,
        h('div', { class: 'tip-box' }, h('b', null, '💡 ' + t('Tip') + ': '), tip),
        h(
          'div',
          { class: 'panel', style: 'padding:10px 14px' },
          h('div', { class: 'row row--wrap small' }, h('span', { class: 'chip' }, `⤒ ${touch ? t('Tap / JUMP (hold = higher)') : t('Space / W / ↑ or tap')}`), h('span', { class: 'chip' }, `⤓ ${touch ? t('▼ / swipe down') : t('S / ↓ or swipe down')}`), h('span', { class: 'chip' }, `✦ ${touch ? t('Ability button') : t('E / right click')}`)),
          h('div', { class: 'small muted', style: 'margin-top:6px' }, t('Press jump right at GO for a start boost!')),
        ),
        h('div', { class: 'row', style: 'justify-content:center' }, h('button', { class: 'btn btn--ghost', onClick: () => ((started = true), onCancel()) }, t('Back')), readyBtn),
      ),
    ),
  );
  return {
    el,
    update(dt) {
      if (loaded < 1) {
        loaded = Math.min(1, load());
        barFill.style.width = `${Math.round(loaded * 100)}%`;
        barText.textContent = loaded < 1 ? `${t('Loading track…')} ${Math.round(loaded * 100)}%` : '✓ ' + t('Track ready');
        if (loaded >= 1) {
          readyBtn.disabled = false;
          bar.classList.add('done');
        }
      }
      left -= dt;
      timer.textContent = String(Math.max(0, Math.ceil(left)));
      if (left <= 0) go();
    },
    onBack: () => ((started = true), onCancel(), true),
  };
}
