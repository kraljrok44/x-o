import type { AppContext } from '../app/AppContext';
import { ACHIEVEMENTS } from '../progression/AchievementService';
import { coinChip, gemChip, h, progressBar } from './dom';
import { t } from './i18n';
import { topbar } from './Topbar';
import type { Screen } from './UIRoot';

export function achievementsScreen(ctx: AppContext): Screen {
  const bar = topbar(ctx, { back: () => ctx.go('menu'), title: t('Achievements') });
  const list = h('div', { class: 'stack' });
  const render = () => {
    const p = ctx.authority.profile;
    const sorted = [...ACHIEVEMENTS].sort((a, b) => {
      const sa = p.achievements[a.id];
      const sb = p.achievements[b.id];
      const rank = (s: typeof sa) => (s?.completedAt && !s.claimed ? 0 : s?.claimed ? 2 : 1);
      return rank(sa) - rank(sb);
    });
    list.replaceChildren(
      ...sorted.map((a) => {
        const st = p.achievements[a.id] ?? { progress: 0, completedAt: null, claimed: false };
        const claimable = st.completedAt !== null && !st.claimed;
        return h(
          'div',
          { class: 'list-item', style: st.claimed ? 'opacity:0.7' : '' },
          h('div', { style: 'font-size:32px' }, st.claimed ? '🏅' : st.completedAt ? '🏆' : '🔒'),
          h(
            'div',
            { class: 'list-item__body' },
            h('div', { class: 'list-item__title' }, a.name),
            h('div', { class: 'small muted' }, a.description),
            progressBar(st.progress, a.target),
            h('div', { class: 'row small', style: 'margin-top:4px' }, `${Math.min(st.progress, a.target)} / ${a.target}`, a.reward.coins ? coinChip(a.reward.coins) : null, a.reward.gems ? gemChip(a.reward.gems) : null),
          ),
          claimable
            ? h(
                'button',
                {
                  class: 'btn btn--good btn--small',
                  onClick: async () => {
                    try {
                      const g = await ctx.authority.claimAchievement(a.id);
                      ctx.audio.play('unlock');
                      ctx.ui.toast(`🏆 ${a.name}: +${g.coins} Coins${g.gems ? ` · +${g.gems} Gems` : ''}`, 'gold');
                    } catch (e) {
                      ctx.fail(e);
                    }
                  },
                },
                t('Claim'),
              )
            : st.claimed
              ? h('span', { class: 'chip' }, '✓')
              : null,
        );
      }),
    );
  };
  const off = ctx.authority.onChange(render);
  const el = h('div', { class: 'screen' }, bar.el, h('div', { class: 'screen__scroll' }, h('div', { class: 'sheet sheet--narrow' }, list)));
  return {
    el,
    onShow: render,
    onHide() {
      off();
      bar.dispose();
    },
    onBack: () => (ctx.go('menu'), true),
  };
}
