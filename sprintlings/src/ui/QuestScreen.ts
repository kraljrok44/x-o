import type { AppContext } from '../app/AppContext';
import { EconomyConfig } from '../config/EconomyConfig';
import { dailyInfo } from '../progression/DailyRewardService';
import { formatDuration, msUntilNextUtcDay } from '../shared/time';
import { offerRewardedAd } from './AdRewardDialog';
import { coinChip, gemChip, h, progressBar } from './dom';
import { t } from './i18n';
import { topbar } from './Topbar';
import type { Screen } from './UIRoot';

export function questScreen(ctx: AppContext): Screen {
  const bar = topbar(ctx, { back: () => ctx.go('menu'), title: t('Quests') });
  const questList = h('div', { class: 'stack' });
  const timer = h('span', { class: 'chip' });
  const calendar = h('div', { class: 'calendar' });
  const dailyBtnRow = h('div', { class: 'row row--wrap', style: 'margin-top:10px' });
  const videoRow = h('div', { class: 'row row--wrap' });

  const render = () => {
    const p = ctx.authority.profile;
    const now = ctx.authority.now();
    timer.textContent = '⏳ ' + t('New quests in {t}', { t: formatDuration(msUntilNextUtcDay(now)) });
    questList.replaceChildren(
      ...p.quests.list.map((q) => {
        const action =
          q.status === 'completed'
            ? h(
                'button',
                {
                  class: 'btn btn--good btn--small',
                  onClick: async () => {
                    try {
                      const g = await ctx.authority.claimQuest(q.id);
                      ctx.audio.play('coin');
                      ctx.ui.toast(`+${g.coins} Coins · +${g.xp} XP`, 'gold');
                    } catch (e) {
                      ctx.fail(e);
                    }
                  },
                },
                t('Claim'),
              )
            : q.status === 'claimed'
              ? h('span', { class: 'chip' }, '✓ ' + t('Claimed'))
              : h(
                  'button',
                  {
                    class: 'btn btn--small btn--ghost',
                    disabled: p.quests.rerollsUsed >= EconomyConfig.quests.freeRerolls,
                    title: 'Swap this quest for another one (once per day)',
                    onClick: async () => {
                      try {
                        await ctx.authority.rerollQuest(q.id);
                      } catch (e) {
                        ctx.fail(e);
                      }
                    },
                  },
                  '⟳ ' + t('Swap'),
                );
        return h(
          'div',
          { class: 'list-item' },
          h('div', { style: 'font-size:30px' }, q.status === 'claimed' ? '✅' : '📜'),
          h(
            'div',
            { class: 'list-item__body' },
            h('div', { class: 'list-item__title' }, q.description),
            h('div', { class: 'row small' }, coinChip(q.reward.coins), h('span', { class: 'chip chip--xp' }, `+${q.reward.xp} XP`), h('span', { class: 'chip' }, `+${q.reward.seasonPoints} SP`)),
            progressBar(q.progress, q.target),
            h('div', { class: 'small muted' }, `${q.progress} / ${q.target}`),
          ),
          action,
        );
      }),
    );

    const info = dailyInfo(p, now);
    calendar.replaceChildren(
      ...EconomyConfig.daily.cycle.map((r, i) => {
        const cycleStart = p.daily.claims - (p.daily.claims % EconomyConfig.daily.cycle.length);
        const claimedInCycle = p.daily.claims - cycleStart;
        const done = i < claimedInCycle;
        return h(
          'div',
          { class: `day ${done ? 'done' : ''} ${i === info.index && info.available ? 'today' : ''}` },
          h('div', { class: 'small' }, t('Day {n}', { n: i + 1 })),
          h('div', { style: 'font-size:22px' }, r.chest ? '🧰' : r.gems ? '💎' : '🪙'),
          h('div', { class: 'small' }, r.coins ? `${r.coins}` : `${r.gems}`),
          done ? h('div', null, '✓') : null,
        );
      }),
    );
    dailyBtnRow.replaceChildren(
      info.available
        ? h(
            'button',
            {
              class: 'btn btn--good',
              onClick: async () => {
                try {
                  const g = await ctx.authority.claimDaily();
                  ctx.audio.play('coin');
                  ctx.ui.toast(`+${g.coins} Coins${g.gems ? ` · +${g.gems} Gems` : ''}${g.items.length ? ' · new item!' : ''}`, 'gold');
                } catch (e) {
                  ctx.fail(e);
                }
              },
            },
            '🎁 ' + t('Claim'),
            info.reward.coins ? coinChip(info.reward.coins) : null,
            info.reward.gems ? gemChip(info.reward.gems) : null,
          )
        : h('span', { class: 'chip' }, '✓ ' + t('Claimed') + ' · ' + formatDuration(msUntilNextUtcDay(now))),
      h('span', { class: 'small muted' }, t('Missing a day never resets your progress.')),
    );

    videoRow.replaceChildren();
    if (ctx.rewarded.supported) {
      for (const placement of ['daily_bonus', 'free_coins'] as const) {
        const can = ctx.rewarded.canOffer(placement);
        videoRow.append(
          h(
            'button',
            { class: 'btn', disabled: !can.ok, title: can.reason ?? '', onClick: () => void offerRewardedAd(ctx, placement) },
            '🎬 ',
            placement === 'daily_bonus' ? 'Daily video bonus' : t('Free Coins'),
            coinChip(placement === 'daily_bonus' ? 30 : 20),
          ),
        );
      }
    }
  };

  const off = ctx.authority.onChange(render);
  let acc = 0;
  const el = h(
    'div',
    { class: 'screen' },
    bar.el,
    h(
      'div',
      { class: 'screen__scroll' },
      h(
        'div',
        { class: 'sheet sheet--narrow stack' },
        h('div', { class: 'panel' }, h('div', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, t('Daily quests')), timer), h('div', { class: 'panel__body' }, questList)),
        h('div', { class: 'panel' }, h('div', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, t('Daily calendar'))), h('div', { class: 'panel__body' }, calendar, dailyBtnRow)),
        ctx.rewarded.supported ? h('div', { class: 'panel' }, h('div', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, t('Free Coins'))), h('div', { class: 'panel__body' }, videoRow)) : null,
      ),
    ),
  );
  return {
    el,
    onShow: render,
    onHide() {
      off();
      bar.dispose();
    },
    update(dt) {
      acc += dt;
      if (acc > 1) {
        acc = 0;
        timer.textContent = '⏳ ' + t('New quests in {t}', { t: formatDuration(msUntilNextUtcDay(ctx.authority.now())) });
      }
    },
    onBack: () => (ctx.go('menu'), true),
  };
}
