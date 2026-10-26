import type { AppContext } from '../app/AppContext';
import type { RaceTicket } from '../game/RaceVerifier';
import { trackInfo } from '../game/TrackManager';
import { CHARACTERS } from '../player/CharacterDefinition';
import { h } from './dom';
import { t } from './i18n';
import type { Screen } from './UIRoot';

/** Short lobby: track, rivals and controls, then the race starts by itself. */
export function preRace(ctx: AppContext, ticket: RaceTicket, onGo: () => void, onCancel: () => void): Screen {
  const info = trackInfo(ticket.trackId);
  let left = 3.2;
  let started = false;
  const go = () => {
    if (started) return;
    started = true;
    onGo();
  };
  const timer = h('span', { class: 'chip' });
  const cards = ticket.racers.map((r, i) =>
    h(
      'div',
      { class: 'panel racer-card', style: i === 0 ? 'background:#fff3c4' : '' },
      h('img', { src: ctx.thumbs.portrait(r.characterId, r.variantId ?? null, r.cosmetics ?? {}), alt: '', style: 'width:100%;max-width:120px;aspect-ratio:1' }),
      h('div', { class: 'card__name' }, i === 0 ? `${r.name} (${t('You')})` : r.name),
      h('div', { class: 'small muted' }, CHARACTERS[r.characterId].name),
    ),
  );
  const touch = matchMedia('(pointer: coarse)').matches;
  const el = h(
    'div',
    { class: 'screen', style: 'background:rgba(27,21,48,0.45)' },
    h(
      'div',
      { class: 'screen__center' },
      h(
        'div',
        { class: 'sheet stack', style: 'max-width:760px' },
        h('div', { class: 'row row--between row--wrap' }, h('h1', { class: 'logo', style: 'font-size:clamp(30px,6vw,52px)' }, ticket.mode === 'remix' ? t('Daily Trail') : info.name), timer),
        h('div', { class: 'lobby-racers' }, ...cards),
        h(
          'div',
          { class: 'panel', style: 'padding:10px 14px' },
          h('div', { class: 'row row--wrap small' }, h('span', { class: 'chip' }, `⤒ ${touch ? t('Tap / JUMP (hold = higher)') : t('Space / W / ↑ or tap')}`), h('span', { class: 'chip' }, `⤓ ${touch ? t('▼ / swipe down') : t('S / ↓ or swipe down')}`), h('span', { class: 'chip' }, `✦ ${touch ? t('Ability button') : t('E / right click')}`)),
          h('div', { class: 'small muted', style: 'margin-top:6px' }, t('Press jump right at GO for a start boost!')),
        ),
        h('div', { class: 'row', style: 'justify-content:center' }, h('button', { class: 'btn btn--ghost', onClick: () => ((started = true), onCancel()) }, t('Back')), h('button', { class: 'btn btn--good btn--big', onClick: go }, t('Ready'))),
      ),
    ),
  );
  return {
    el,
    update(dt) {
      left -= dt;
      timer.textContent = `⏱ ${Math.max(0, Math.ceil(left))}`;
      if (left <= 0) go();
    },
    onBack: () => ((started = true), onCancel(), true),
  };
}
