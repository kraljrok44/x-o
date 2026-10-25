import type { AppContext } from '../app/AppContext';
import type { RaceSettlement } from '../economy/EconomyService';
import type { RaceResultSummary } from '../game/RaceResults';
import { CHARACTERS } from '../player/CharacterDefinition';
import { levelProgress } from '../progression/LevelProgression';
import { formatRaceTime } from '../shared/time';
import { offerRewardedAd } from './AdRewardDialog';
import { coinChip, h, progressBar } from './dom';
import { ordinal, t } from './i18n';
import type { Screen } from './UIRoot';

/**
 * Race results: classification immediately (from the live simulation), then
 * the authority-verified rewards as separate animated lines.
 */
export function resultsScreen(
  ctx: AppContext,
  summary: RaceResultSummary,
  settlement: Promise<RaceSettlement>,
  actions: { again: () => void; done: () => void },
): Screen & { settled: Promise<RaceSettlement | null> } {
  const standings = h('div');
  for (const r of summary.racers) {
    standings.append(
      h(
        'div',
        { class: `standing ${r.isPlayer ? 'me' : ''}` },
        h('span', { class: 'pos' }, r.finishTime !== null ? ordinal(r.place) : '—'),
        h('img', { src: ctx.thumbs.portrait(r.characterId), style: 'width:44px;height:44px' }),
        h('span', { class: 'name' }, r.isPlayer ? `${r.name} (${t('You')})` : r.name, h('div', { class: 'small muted' }, CHARACTERS[r.characterId].name)),
        h('b', null, r.finishTime !== null ? formatRaceTime(r.finishTime) : t('DNF')),
      ),
    );
  }
  const me = summary.racers.find((r) => r.isPlayer)!;
  const rewards = h('div', { class: 'stack' }, h('div', { class: 'row' }, h('div', { class: 'spinner' }), h('span', { class: 'muted' }, t('Verifying race…'))));
  const extra = h('div', { class: 'stack' });
  const buttons = h(
    'div',
    { class: 'row row--wrap', style: 'justify-content:flex-end;margin-top:12px' },
    h('button', { class: 'btn btn--primary', onClick: () => actions.again() }, '↻ ' + t('Race again')),
    h('button', { class: 'btn btn--good btn--big', onClick: () => actions.done() }, t('Continue') + ' ▶'),
  );
  const title = me.finishTime === null ? t('Time up!') : summary.racers.length > 1 ? `${ordinal(me.place)} ${me.place === 1 ? '🏆' : me.place <= 3 ? '🥉' : ''}` : formatRaceTime(me.finishTime);
  const el = h(
    'div',
    { class: 'screen', style: 'background:linear-gradient(90deg,rgba(27,21,48,0.0),rgba(27,21,48,0.55))' },
    h(
      'div',
      { class: 'screen__scroll', style: 'padding-top:calc(16px + var(--safe-top))' },
      h(
        'div',
        { class: 'sheet' },
        h('h1', { class: 'logo', style: 'font-size:clamp(40px,8vw,72px);text-align:center;margin:6px 0 14px' }, title),
        h(
          'div',
          { class: 'results' },
          h('div', { class: 'panel', style: 'padding:14px' }, h('h2', { class: 'panel__title', style: 'margin-bottom:8px' }, t('Results')), standings),
          h('div', { class: 'panel', style: 'padding:14px' }, h('h2', { class: 'panel__title', style: 'margin-bottom:8px' }, t('Your rewards')), rewards, extra, buttons),
        ),
      ),
    ),
  );

  const settled = settlement
    .then((s) => {
      renderRewards(s);
      return s;
    })
    .catch((err: unknown) => {
      rewards.replaceChildren(h('p', { class: 'muted' }, `${t('Race could not be verified.')} ${err instanceof Error ? err.message : ''}`));
      return null;
    });

  const renderRewards = (s: RaceSettlement) => {
    const lines = s.breakdown.lines.map((l, i) =>
      h('div', { class: 'reward-line', style: `animation-delay:${0.15 + i * 0.22}s` }, h('span', null, l.label), h('span', { class: 'row' }, l.coins ? coinChip(`+${l.coins}`) : null, l.xp ? h('span', { class: 'chip chip--xp' }, `+${l.xp} XP`) : null)),
    );
    const p = ctx.authority.profile;
    const lp = levelProgress(p.xp);
    rewards.replaceChildren(
      ...lines,
      h('div', { class: 'reward-total row row--between', style: `opacity:0;animation:lineIn .3s ${0.2 + lines.length * 0.22}s forwards` }, h('span', null, t('Total')), h('span', { class: 'row' }, coinChip(`+${s.breakdown.coins}`), h('span', { class: 'chip chip--xp' }, `+${s.breakdown.xp} XP`), h('span', { class: 'chip' }, `+${s.breakdown.seasonPoints} SP`))),
      h('div', null, h('div', { class: 'small muted' }, `${t('Level {n}', { n: lp.level })} · ${lp.into}/${lp.needed} XP`), progressBar(lp.into, lp.needed || 1, 'progress--xp')),
    );
    setTimeout(() => ctx.audio.play('coin'), 300 + lines.length * 220);
    const notes: HTMLElement[] = [];
    if (s.newBest) notes.push(h('div', { class: 'chip chip--coin' }, '⏱ ' + t('New best time!')));
    for (const l of s.levelUps) notes.push(h('div', { class: 'levelup' }, `⬆ ${t('Level up!')} ${t('Level {n}', { n: l.level })}: +${l.coins} Coins${l.gems ? ` · +${l.gems} Gems` : ''}${l.characters.length ? ` · ${l.characters.map((c) => CHARACTERS[c].name).join(', ')} unlocked!` : ''}`));
    for (const q of s.questsCompleted) notes.push(h('div', { class: 'chip', style: 'background:#dcffe4' }, `📜 ${q.description} ✓`));
    for (const a of s.achievements) notes.push(h('div', { class: 'chip', style: 'background:#fff3c4' }, `🏆 ${t('Achievement unlocked')}: ${a.name}`));
    if (s.seasonTierAfter > s.seasonTierBefore) notes.push(h('div', { class: 'chip' }, `🍂 ${t('Season')}: ${t('Tier')} ${s.seasonTierAfter}`));
    if (s.levelUps.length) ctx.audio.play('unlock');
    const active = p.quests.list.filter((q) => q.status === 'active').slice(0, 3);
    const questBox = active.length ? h('div', null, h('div', { class: 'small muted' }, t('Quest progress')), ...active.map((q) => h('div', { class: 'small' }, `${q.description}: ${q.progress}/${q.target}`, progressBar(q.progress, q.target)))) : null;
    extra.replaceChildren(h('div', { class: 'row row--wrap' }, ...notes), questBox ?? '');
    if (ctx.rewarded.supported && ctx.rewarded.canOffer('post_race_bonus', s.raceId).ok) {
      const btn = h('button', { class: 'btn btn--warn' }, '🎬 ' + t('Watch a video: +{n} Coins', { n: 15 }));
      btn.addEventListener('click', async () => {
        const ok = await offerRewardedAd(ctx, 'post_race_bonus', s.raceId);
        if (ok) btn.remove();
      });
      extra.append(btn);
    }
  };

  return {
    el,
    settled,
    onBack: () => (actions.done(), true),
  };
}
