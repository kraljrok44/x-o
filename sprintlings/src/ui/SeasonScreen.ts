import type { AppContext } from '../app/AppContext';
import { EconomyConfig } from '../config/EconomyConfig';
import { premiumEntitlement, seasonAt, tierForPoints, type SeasonReward } from '../progression/SeasonPassService';
import { COSMETIC_BY_ID } from '../shop/CosmeticCatalog';
import { formatDuration } from '../shared/time';
import { offerRewardedAd } from './AdRewardDialog';
import { gemChip, h, priceChip, progressBar } from './dom';
import { t } from './i18n';
import { topbar } from './Topbar';
import type { Screen } from './UIRoot';

function rewardLabel(r: SeasonReward): HTMLElement {
  if (r.cosmetic) return h('div', null, h('div', { style: 'font-size:24px' }, '🎁'), h('b', { class: 'small' }, COSMETIC_BY_ID[r.cosmetic]?.name ?? r.cosmetic));
  if (r.chest) return h('div', null, h('div', { style: 'font-size:24px' }, '🧰'), h('span', { class: 'small' }, 'Acorn Chest'));
  if (r.gems) return h('div', null, h('div', { style: 'font-size:24px' }, '💎'), h('span', { class: 'small' }, `${r.gems}`));
  return h('div', null, h('div', { style: 'font-size:24px' }, '🪙'), h('span', { class: 'small' }, `${r.coins ?? 0}`));
}

export function seasonScreen(ctx: AppContext): Screen {
  const bar = topbar(ctx, { back: () => ctx.go('menu'), title: t('Season') });
  const content = h('div', { class: 'stack' });

  const claim = async (tier: number, track: 'free' | 'premium') => {
    try {
      const g = await ctx.authority.claimSeasonTier(tier, track);
      ctx.audio.play('coin');
      ctx.ui.toast(`${t('Tier')} ${tier}: ${g.coins ? `+${g.coins} Coins ` : ''}${g.gems ? `+${g.gems} Gems ` : ''}${g.items.map((i) => COSMETIC_BY_ID[i]?.name).join(', ')}`, 'gold');
    } catch (e) {
      ctx.fail(e);
    }
  };

  const render = () => {
    const p = ctx.authority.profile;
    const now = ctx.authority.now();
    const season = seasonAt(now);
    if (!season || season.id !== p.season.seasonId) {
      content.replaceChildren(h('div', { class: 'panel', style: 'padding:18px' }, t('No active season right now.')));
      return;
    }
    const premium = p.entitlements.includes(premiumEntitlement(season.id));
    const reached = tierForPoints(p.season.points);
    const per = EconomyConfig.season.pointsPerTier;
    const track = h('div', { class: 'season-track' });
    for (const tier of season.tiers) {
      const isReached = tier.tier <= reached;
      const freeClaimed = p.season.claimedFree.includes(tier.tier);
      const premClaimed = p.season.claimedPremium.includes(tier.tier);
      track.append(
        h(
          'div',
          { class: 'tier' },
          h('div', { class: 'tier__num' }, `${tier.tier}`),
          h(
            'div',
            { class: `tier__cell ${isReached ? '' : 'locked'} ${freeClaimed ? 'claimed' : ''}` },
            rewardLabel(tier.free),
            isReached && !freeClaimed ? h('button', { class: 'btn btn--good', onClick: () => claim(tier.tier, 'free') }, t('Claim')) : null,
          ),
          h(
            'div',
            { class: `tier__cell premium ${isReached && premium ? '' : 'locked'} ${premClaimed ? 'claimed' : ''}` },
            rewardLabel(tier.premium),
            premium && isReached && !premClaimed ? h('button', { class: 'btn btn--good', onClick: () => claim(tier.tier, 'premium') }, t('Claim')) : !premium ? h('span', { class: 'small' }, '🔒') : null,
          ),
        ),
      );
    }
    const into = p.season.points - reached * per;
    const unlock = premium
      ? h('span', { class: 'chip' }, '⭐ ' + t('Premium track'))
      : h(
          'button',
          {
            class: 'btn btn--primary',
            onClick: async () => {
              const price = EconomyConfig.season.premiumPriceGems;
              if (p.wallet.gems < price) {
                ctx.ui.modal(t('Not enough Gems.'), h('p', null, 'Gems come from achievements, levels, the daily calendar and the free season track.'), [{ label: t('Get Gems'), kind: 'primary', run: () => ctx.go('shop', { tab: 'gems' }) }, { label: 'OK', kind: 'ghost' }]);
                return;
              }
              const ok = await ctx.ui.confirm(
                t('Unlock premium'),
                h('div', { class: 'stack' }, h('p', null, `${season.name}: unlocks the premium reward row for this season, including tiers you already reached.`), h('div', { class: 'row' }, `${t('Price')}:`, priceChip('gems', price)), h('p', { class: 'small muted' }, `${t('Ends in {t}', { t: formatDuration(Date.parse(season.end) - now) })}. Premium rewards are cosmetic only.`)),
                t('Buy'),
              );
              if (!ok) return;
              try {
                await ctx.authority.buySeasonPremium();
                ctx.audio.play('unlock');
              } catch (e) {
                ctx.fail(e);
              }
            },
          },
          '⭐ ' + t('Unlock premium') + ' ',
          gemChip(EconomyConfig.season.premiumPriceGems),
        );
    content.replaceChildren(
      h(
        'div',
        { class: 'panel', style: 'padding:14px' },
        h('div', { class: 'row row--between row--wrap' }, h('h2', { class: 'panel__title' }, `🍂 ${season.name}`), h('span', { class: 'chip' }, '⏳ ' + t('Ends in {t}', { t: formatDuration(Date.parse(season.end) - now) }))),
        h('div', { class: 'row row--between row--wrap', style: 'margin-top:8px' }, h('div', { style: 'flex:1;min-width:200px' }, h('b', null, `${t('Tier')} ${reached} / 30`), progressBar(reached >= 30 ? per : into, per, 'progress--xp'), h('div', { class: 'small muted' }, `${t('Season points')}: ${p.season.points}`)), unlock),
        ctx.rewarded.supported ? h('button', { class: 'btn btn--small', style: 'margin-top:10px', disabled: !ctx.rewarded.canOffer('event_bonus').ok, onClick: () => void offerRewardedAd(ctx, 'event_bonus') }, '🎬 +50 SP') : null,
      ),
      h('div', { class: 'panel', style: 'padding:12px' }, h('div', { class: 'row small muted' }, `▲ ${t('Free track')} · ▼ ${t('Premium track')}`), track),
      h('p', { class: 'small muted', style: 'color:#fff' }, season.endRule),
    );
  };
  const off = ctx.authority.onChange(render);
  const el = h('div', { class: 'screen' }, bar.el, h('div', { class: 'screen__scroll' }, h('div', { class: 'sheet' }, content)));
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
