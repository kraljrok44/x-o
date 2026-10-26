import type { AppContext } from '../app/AppContext';
import { TRACK_IDS, trackInfo } from '../game/TrackManager';
import type { DifficultyChoice } from '../game/RaceVerifier';
import { dayKey, formatRaceTime } from '../shared/time';
import { h } from './dom';
import { t } from './i18n';
import { topbar } from './Topbar';
import type { Screen } from './UIRoot';

const BIOME_ICON = { forest: '🌲', canyon: '🏜', crystal: '💎' } as const;

export function modeSelect(ctx: AppContext): Screen {
  const bar = topbar(ctx, { back: () => ctx.go('menu'), title: t('Choose a race') });
  const p = ctx.authority.profile;
  const level = p.level;
  const grid = h('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fill,minmax(210px,1fr))' });
  for (const id of TRACK_IDS) {
    const info = trackInfo(id);
    const locked = info.unlockLevel > level;
    const best = p.stats.bestTimes[id];
    grid.append(
      h(
        'button',
        {
          class: `card track-card track-card--${info.biome} ${locked ? 'locked' : ''}`,
          onClick: () => (locked ? ctx.ui.toast(t('Unlocks at level {n}', { n: info.unlockLevel }), 'bad') : ctx.startRace(id, 'race')),
        },
        h('div', { style: 'font-size:44px' }, locked ? '🔒' : BIOME_ICON[info.biome]),
        h('div', { class: 'card__name' }, info.name),
        h('div', { class: 'small' }, info.description),
        h('div', { class: 'small' }, locked ? t('Unlocks at level {n}', { n: info.unlockLevel }) : best ? t('Best: {t}', { t: formatRaceTime(best) }) : ''),
      ),
    );
  }
  const remixLocked = level < 3;
  grid.append(
    h(
      'button',
      {
        class: `card track-card track-card--remix ${remixLocked ? 'locked' : ''}`,
        onClick: () => (remixLocked ? ctx.ui.toast(t('Unlocks at level {n}', { n: 3 }), 'bad') : ctx.startRace(`remix:${dayKey(ctx.authority.now())}`, 'remix')),
      },
      h('div', { style: 'font-size:44px' }, remixLocked ? '🔒' : '🎲'),
      h('div', { class: 'card__name' }, t('Daily Trail')),
      h('div', { class: 'small' }, t('A fresh validated track every day.')),
      remixLocked ? h('div', { class: 'small' }, t('Unlocks at level {n}', { n: 3 })) : null,
    ),
    h(
      'button',
      { class: 'card track-card track-card--practice', onClick: () => ctx.startRace(ctx.settings.value.lastTrack || TRACK_IDS[0], 'practice') },
      h('div', { style: 'font-size:44px' }, '⏱'),
      h('div', { class: 'card__name' }, t('Practice')),
      h('div', { class: 'small' }, t('Solo run, no rivals. Reduced rewards.')),
    ),
  );

  const seg = h('div', { class: 'seg' });
  const options: [DifficultyChoice, string][] = [
    ['auto', t('Auto')],
    ['easy', t('Easy')],
    ['normal', t('Normal')],
    ['hard', t('Hard')],
  ];
  const renderSeg = () => {
    seg.replaceChildren(
      ...options.map(([v, label]) =>
        h('button', { class: ctx.settings.value.difficulty === v ? 'active' : '', onClick: () => (ctx.settings.update({ difficulty: v }), renderSeg()) }, label),
      ),
    );
  };
  renderSeg();

  const el = h(
    'div',
    { class: 'screen' },
    bar.el,
    h(
      'div',
      { class: 'screen__scroll' },
      h('div', { class: 'sheet' }, h('div', { class: 'panel', style: 'padding:14px;margin-bottom:14px' }, h('div', { class: 'row row--between row--wrap' }, h('b', null, t('Difficulty')), seg)), grid),
    ),
  );
  return {
    el,
    onShow() {
      ctx.menu.offsetX = 0;
    },
    onHide: () => bar.dispose(),
    onBack: () => (ctx.go('menu'), true),
  };
}
