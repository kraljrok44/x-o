import type { AppContext } from '../app/AppContext';
import { EconomyConfig, type ChestId } from '../config/EconomyConfig';
import { bundlePrice } from '../economy/EconomyService';
import { visibleLoadout } from '../economy/InventoryService';
import type { CharacterId } from '../player/CharacterDefinition';
import { COSMETIC_BY_ID, RARITY_COLORS, type CosmeticDefinition } from '../shop/CosmeticCatalog';
import { chestPool, shopOffers, type ShopCategory, type ShopOffer } from '../shop/ShopCatalog';
import type { ProductOffer } from '../shop/PurchaseService';
import { formatDuration } from '../shared/time';
import { sidePanelLayout } from './CharacterSelect';
import { h, priceChip } from './dom';
import { t } from './i18n';
import { showChestOpening } from './ChestOpening';
import { topbar } from './Topbar';
import type { Screen } from './UIRoot';

type Tab = ShopCategory | 'gems';

const TABS: [Tab, string][] = [
  ['hats', 'Hats'],
  ['eyes', 'Eyewear'],
  ['back', 'Back'],
  ['trails', 'Trails'],
  ['emotes', 'Emotes'],
  ['colours', 'Colours'],
  ['characters', 'Characters'],
  ['chests', 'Chests'],
  ['bundles', 'Bundles'],
  ['premium', 'Premium'],
  ['seasonal', 'Seasonal'],
  ['gems', 'Gem Store'],
];

export const TRAIL_ICONS: Record<string, string> = {
  trail_dust: '💨',
  trail_sparkle: '✨',
  trail_leaves: '🍃',
  trail_bubbles: '🫧',
  trail_notes: '🎵',
  trail_flame: '🔥',
  trail_rainbow: '🌈',
  trail_harvest: '🍁',
  trail_frostbite: '❄',
};
export const EMOTE_ICONS: Record<string, string> = {
  emote_wave: '👋',
  emote_spin: '🌀',
  emote_cheer: '🙌',
  emote_dance: '💃',
  emote_backflip: '🤸',
  emote_flex: '💪',
  emote_harvest: '🍂',
};

export function itemVisual(ctx: AppContext, def: CosmeticDefinition): HTMLElement {
  const icon = def.slot === 'trail' ? TRAIL_ICONS[def.id] : def.slot === 'emote' ? EMOTE_ICONS[def.id] : null;
  if (icon) return h('div', { class: 'card__swatch', style: `background:${def.color}33` }, icon);
  const src = ctx.thumbs.item(def.id);
  return h('div', { class: 'card__swatch', style: `background:linear-gradient(${def.color}44,#fff);padding:0;overflow:hidden;height:90px` }, src ? h('img', { src, alt: def.name, style: 'height:100%' }) : '🎁');
}

export function rarityLabel(r: CosmeticDefinition['rarity']): HTMLElement {
  return h('span', { class: 'rarity', style: `color:${RARITY_COLORS[r]}` }, t(r[0].toUpperCase() + r.slice(1)));
}

export function shopScreen(ctx: AppContext, params: { tab?: Tab } = {}): Screen {
  const bar = topbar(ctx, { back: () => ctx.go('menu'), title: t('Shop') });
  let tab: Tab = params.tab ?? 'hats';
  let selected: string | null = null;
  const tabs = h('div', { class: 'tabs' });
  const grid = h('div', { class: 'grid' });
  const detail = h('div', { class: 'panel', style: 'padding:14px;margin-top:12px' });

  const previewWith = (id: string | null) => {
    const p = ctx.authority.profile;
    const base = { characterId: p.loadout.characterId, variantId: p.loadout.variants[p.loadout.characterId] ?? null, cosmetics: visibleLoadout(p) };
    const def = id ? COSMETIC_BY_ID[id] : undefined;
    if (def) {
      if (def.slot === 'variant') {
        base.characterId = def.characterId as CharacterId;
        base.variantId = def.id;
      } else base.cosmetics = { ...base.cosmetics, [def.slot]: def.id };
    } else if (id?.startsWith('char_')) {
      base.characterId = id.slice(5) as CharacterId;
      base.variantId = null;
    }
    ctx.menu.show(base, def?.slot === 'emote');
  };

  const renderTabs = () =>
    tabs.replaceChildren(...TABS.map(([id, label]) => h('button', { class: `btn btn--small tab ${tab === id ? 'active' : ''}`, onClick: () => ((tab = id), (selected = null), render()) }, t(label))));

  const owns = (o: ShopOffer) => {
    const p = ctx.authority.profile;
    if (o.kind === 'cosmetic') return p.inventory.includes(o.id);
    if (o.kind === 'character') return p.characters.includes(o.characterId!);
    if (o.kind === 'bundle') return o.items!.every((i) => p.inventory.includes(i));
    return false;
  };

  const render = () => {
    renderTabs();
    if (tab === 'gems') {
      void renderGems();
      return;
    }
    const p = ctx.authority.profile;
    const offers = shopOffers(ctx.authority.now()).filter((o) => o.category === tab);
    if (!selected && offers.length) selected = offers[0].id;
    grid.replaceChildren(
      ...offers.map((o) => {
        const def = COSMETIC_BY_ID[o.id];
        const owned = owns(o);
        const equipped = def && (p.loadout[def.slot as 'hat'] === def.id || (def.slot === 'variant' && p.loadout.variants[def.characterId as CharacterId] === def.id));
        return h(
          'button',
          { class: `card ${selected === o.id ? 'selected' : ''}`, onClick: () => ((selected = o.id), render(), previewWith(o.id)) },
          def
            ? itemVisual(ctx, def)
            : o.kind === 'character'
              ? h('img', { src: ctx.thumbs.portrait(o.characterId!), style: 'width:100%;aspect-ratio:1;object-fit:contain' })
              : h('div', { class: 'card__swatch', style: 'background:#ffe9b0' }, o.kind === 'chest' ? '🧰' : '🎁'),
          h('div', { class: 'card__name' }, o.name),
          h('div', { class: 'card__meta' }, o.rarity ? rarityLabel(o.rarity) : h('span'), owned ? null : priceChip(o.price.currency, o.kind === 'bundle' ? bundlePrice(p, o.id) : o.price.amount)),
          owned ? h('span', { class: `owned-tag ${equipped ? 'equipped-tag' : ''}` }, equipped ? t('Equipped') : t('Owned')) : null,
        );
      }),
    );
    if (!offers.length) grid.replaceChildren(h('p', { class: 'muted' }, t('Coming soon')));
    renderDetail(offers.find((o) => o.id === selected) ?? null);
  };

  const renderDetail = (o: ShopOffer | null) => {
    if (!o) {
      detail.replaceChildren();
      return;
    }
    const p = ctx.authority.profile;
    const owned = owns(o);
    const def = COSMETIC_BY_ID[o.id];
    const price = o.kind === 'bundle' ? bundlePrice(p, o.id) : o.price.amount;
    const body: (HTMLElement | null)[] = [
      h('div', { class: 'row row--between' }, h('h2', { class: 'panel__title' }, o.name), o.rarity ? rarityLabel(o.rarity) : null),
      h('p', { class: 'muted', style: 'margin:4px 0 8px' }, o.description),
    ];
    if (o.requiresLevel && p.level < o.requiresLevel) body.push(h('p', { class: 'chip' }, '🔒 ' + t('Unlocks at level {n}', { n: o.requiresLevel })));
    if (o.availableUntil) body.push(h('p', { class: 'chip' }, '⏳ ' + formatDuration(Date.parse(o.availableUntil) - ctx.authority.now())));
    if (o.kind === 'bundle') {
      body.push(h('div', { class: 'row row--wrap' }, ...o.items!.map((i) => h('span', { class: 'chip' }, (p.inventory.includes(i) ? '✓ ' : '') + COSMETIC_BY_ID[i].name))));
      if (price < o.price.amount) body.push(h('p', { class: 'small muted' }, 'Price reduced for items you already own.'));
    }
    if (o.kind === 'chest') body.push(chestOdds(o.id as ChestId));
    const actions = h('div', { class: 'row row--wrap', style: 'margin-top:10px' });
    if (!owned || o.kind === 'chest') {
      actions.append(h('button', { class: 'btn btn--primary', onClick: () => buy(o, price) }, `${t('Buy for')} `, priceChip(o.price.currency, price)));
    } else if (def && def.slot !== 'variant') {
      const slot = def.slot as 'hat' | 'eyes' | 'back' | 'trail' | 'emote';
      const isOn = p.loadout[slot] === def.id;
      actions.append(
        h(
          'button',
          {
            class: `btn ${isOn ? 'btn--ghost' : 'btn--good'}`,
            onClick: async () => {
              try {
                await ctx.authority.equip(slot, isOn ? null : def.id);
                previewWith(null);
              } catch (e) {
                ctx.fail(e);
              }
            },
          },
          isOn ? t('Unequip') : t('Equip'),
        ),
      );
    } else if (def && def.slot === 'variant') {
      const cid = def.characterId as CharacterId;
      const isOn = p.loadout.variants[cid] === def.id;
      actions.append(
        h(
          'button',
          {
            class: `btn ${isOn ? 'btn--ghost' : 'btn--good'}`,
            onClick: async () => {
              try {
                await ctx.authority.equip('variant', isOn ? null : def.id);
              } catch (e) {
                ctx.fail(e);
              }
            },
          },
          isOn ? t('Unequip') : t('Equip'),
        ),
      );
    } else actions.append(h('span', { class: 'chip' }, t('Owned')));
    body.push(actions);
    body.push(h('p', { class: 'small muted', style: 'margin-top:10px' }, 'Cosmetics never change speed, jumps or hitboxes.'));
    detail.replaceChildren(...body.filter(Boolean) as HTMLElement[]);
  };

  const buy = async (o: ShopOffer, price: number) => {
    const p = ctx.authority.profile;
    if (p.wallet[o.price.currency] < price) {
      const isGems = o.price.currency === 'gems';
      ctx.ui.modal(
        isGems ? t('Not enough Gems.') : t('Not enough Coins.'),
        h('p', null, isGems ? 'Gems come from achievements, levels, the daily calendar and the season track.' : 'Race, complete quests and claim daily rewards to earn more Coins.'),
        isGems ? [{ label: t('Get Gems'), kind: 'primary', run: () => ((tab = 'gems'), render()) }, { label: 'OK', kind: 'ghost' }] : [{ label: 'OK', kind: 'primary' }],
      );
      ctx.audio.play('error');
      return;
    }
    const ok = await ctx.ui.confirm(
      t('Confirm purchase'),
      h('div', { class: 'stack' }, h('div', null, `${t('You are about to buy')}: `, h('b', null, o.name)), h('div', { class: 'row' }, `${t('Price')}:`, priceChip(o.price.currency, price))),
      t('Buy'),
    );
    if (!ok) return;
    try {
      const r = await ctx.authority.buyOffer(o.id);
      ctx.audio.play('buy');
      if (o.kind === 'chest') {
        await showChestOpening(ctx, r, o.name);
      } else ctx.ui.toast(`${t('Purchased!')} ${o.name}`, 'good');
      render();
    } catch (e) {
      ctx.fail(e);
    }
  };

  const chestOdds = (id: ChestId) => {
    const c = EconomyConfig.chests[id];
    const pool = chestPool(id);
    const rows = (Object.entries(c.odds) as [CosmeticDefinition['rarity'], number][]).filter(([, v]) => v > 0);
    return h(
      'div',
      null,
      h('b', null, t('Odds')),
      h('table', { class: 'odds' }, ...rows.map(([r, v]) => h('tr', null, h('td', null, rarityLabel(r)), h('td', null, `${v}%`), h('td', { class: 'muted' }, `${pool.filter((x) => x.rarity === r).length} items`)))),
      h('p', { class: 'small muted' }, `${c.contents} ${t('Duplicates are converted to Coins.')} (${Math.round(c.duplicateRefundShare * 100)}% of the item price, min ${c.duplicateRefundMin})`),
    );
  };

  const renderGems = async () => {
    const svc = ctx.purchases;
    grid.replaceChildren(h('div', { class: 'spinner' }));
    detail.replaceChildren();
    let offers: ProductOffer[] = [];
    try {
      offers = await svc.loadOffers();
    } catch {
      offers = [];
    }
    if (tab !== 'gems') return;
    grid.replaceChildren(
      ...offers.map((o) =>
        h(
          'div',
          { class: 'card', style: 'cursor:default' },
          h('div', { class: 'card__swatch', style: 'background:#d6f6ff' }, o.product.grants.gems ? '💎' : o.product.id === 'ad_free' ? '🚫' : '🎁'),
          h('div', { class: 'card__name' }, o.product.name),
          h('div', { class: 'small muted' }, o.product.description),
          o.product.highlight ? h('span', { class: 'chip' }, o.product.highlight) : null,
          svc.available
            ? o.owned
              ? h('span', { class: 'chip' }, t('Owned'))
              : h(
                  'button',
                  { class: 'btn btn--primary btn--small', disabled: !o.priceLabel, onClick: () => buyProduct(o) },
                  o.priceLabel || t('Not available'),
                  o.test ? h('span', { class: 'chip chip--test' }, t('TEST')) : null,
                )
            : h('span', { class: 'chip' }, t('Not available')),
        ),
      ),
    );
    detail.replaceChildren(
      h('h2', { class: 'panel__title' }, t('Gem Store')),
      svc.available
        ? h('p', { class: 'small muted' }, t('Prices are shown by the payment provider.'))
        : h('div', null, h('p', null, svc.unavailableReason || t('Purchases with real money are not available in this version of the game.')), h('p', { class: 'muted' }, t('You can still earn Gems from achievements, levels, the daily calendar and the season track.'))),
      svc.available
        ? h(
            'button',
            {
              class: 'btn btn--small',
              onClick: async () => {
                const n = await svc.restore();
                ctx.ui.toast(`${t('Restore purchases')}: ${n}`, 'good');
              },
            },
            t('Restore purchases'),
          )
        : '',
    );
  };

  const buyProduct = async (o: ProductOffer) => {
    const ok = await ctx.ui.confirm(
      t('Confirm purchase'),
      h('div', { class: 'stack' }, h('div', null, h('b', null, o.product.name), ' – ', o.product.description), h('div', { class: 'row' }, `${t('Price')}: `, h('b', null, o.priceLabel), o.test ? h('span', { class: 'chip chip--test' }, 'TEST – sandbox, no real money') : null)),
      t('Buy'),
    );
    if (!ok) return;
    ctx.ui.toast(t('Payment pending…'));
    const r = await ctx.purchases.buy(o.product.id);
    if (r.status === 'granted') {
      ctx.audio.play('unlock');
      ctx.ui.toast(`${t('Purchased!')} ${o.product.name}`, 'good');
    } else if (r.status === 'cancelled') ctx.ui.toast(t('Payment cancelled.'));
    else if (r.status === 'pending') ctx.ui.toast(r.message);
    else ctx.ui.alert(t('Something went wrong'), r.message || t('Payment failed. You were not charged.'));
    void renderGems();
  };

  const off = ctx.authority.onChange(() => tab !== 'gems' && render());
  const el = h('div', { class: 'screen' }, bar.el, sidePanelLayout(ctx, h('div', null, tabs, grid, detail)));
  return {
    el,
    onShow() {
      render();
      previewWith(selected);
      ctx.analytics.track('shop_open');
    },
    onHide() {
      off();
      bar.dispose();
      ctx.menu.offsetX = 0;
    },
    onBack: () => (ctx.go('menu'), true),
  };
}
