import type { AppContext } from '../app/AppContext';
import { AdConfig, type RewardedPlacement } from '../config/AdConfig';
import { describeAdReward, placementLimits } from '../ads/AdRewardService';
import { h } from './dom';
import { t } from './i18n';

/**
 * Explains a rewarded video before anything plays (what plays, how long,
 * what you get, limits, and what happens if it can't play). The ad starts
 * only after the player presses "Watch video".
 */
export async function offerRewardedAd(ctx: AppContext, placement: RewardedPlacement, raceId?: string): Promise<boolean> {
  const can = ctx.rewarded.canOffer(placement, raceId);
  if (!can.ok) {
    ctx.ui.toast(can.reason ?? t('Not available'), 'bad');
    return false;
  }
  const cfg = AdConfig.rewarded[placement];
  return new Promise((resolve) => {
    let started = false;
    const body = h(
      'div',
      { class: 'stack' },
      h('p', null, t('A short video ad will play.'), ' ', cfg.description),
      h('div', { class: 'row' }, h('b', null, `${t('Reward')}:`), h('span', { class: 'chip chip--coin' }, describeAdReward(placement))),
      h('p', { class: 'small muted' }, placementLimits(placement)),
      h('p', { class: 'small muted' }, t('If no video is available, nothing is lost: just try again later.')),
    );
    const modal = ctx.ui.modal(t('Video reward'), body, [
      { label: t('No thanks'), kind: 'ghost', run: () => resolve(false) },
      {
        label: '▶ ' + t('Watch video'),
        kind: 'good',
        run: async () => {
          started = true;
          const r = await ctx.rewarded.run(placement, raceId);
          if (r.status === 'rewardGranted') {
            ctx.audio.play('coin');
            ctx.ui.toast(`${t('Reward')}: ${describeAdReward(placement)}`, 'gold');
            ctx.analytics.track('rewarded_complete', { placement });
            resolve(true);
          } else {
            ctx.ui.toast(r.message, 'bad', 3500);
            resolve(false);
          }
        },
      },
    ]);
    const obs = new MutationObserver(() => {
      if (!modal.isConnected && !started) {
        obs.disconnect();
        resolve(false);
      }
    });
    obs.observe(modal.parentElement ?? document.body, { childList: true });
  });
}
