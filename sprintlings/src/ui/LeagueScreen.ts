import type { AppContext } from '../app/AppContext';
import { LEAGUES, leagueFor, nextLeague } from '../progression/LeagueService';
import { h } from './dom';
import { t } from './i18n';

/** Leagues overview: your trophies, every league and how to climb. */
export function showLeagues(ctx: AppContext): void {
  const p = ctx.authority.profile;
  const cur = leagueFor(p.trophies);
  const nx = nextLeague(p.trophies);
  const rows = [...LEAGUES].reverse().map((l) =>
    h(
      'div',
      { class: `league-row ${l.id === cur.id ? 'current' : ''} ${p.trophies >= l.min ? 'reached' : ''}` },
      h('span', { class: 'league-ico' }, l.icon),
      h('b', { style: `color:${l.color}` }, l.name),
      h('span', { class: 'small' }, `🏆 ${l.min}+`),
    ),
  );
  const body = h(
    'div',
    { class: 'stack' },
    h('div', { class: 'row row--between' }, h('b', null, `${cur.icon} ${cur.name}`), h('span', { class: 'chip' }, `🏆 ${p.trophies}`)),
    nx ? h('div', { class: 'small muted' }, t('{n} trophies to {league}', { n: nx.min - p.trophies, league: nx.name })) : h('div', { class: 'small muted' }, t('Top league reached!')),
    ...rows,
    h('div', { class: 'small muted' }, t('Win races to earn trophies (1st +30, 2nd +16). 3rd and 4th lose a few, leaving a race loses 12. Duos: team win +24. Practice never counts.')),
    h('div', { class: 'small muted' }, t('Best: {n} trophies', { n: p.bestTrophies })),
  );
  ctx.ui.modal(t('Leagues'), body, [{ label: t('Close'), kind: 'good', run: () => {} }]);
}
