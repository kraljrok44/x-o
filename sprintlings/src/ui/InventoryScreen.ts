import type { AppContext } from '../app/AppContext';
import { visibleLoadout } from '../economy/InventoryService';
import type { LoadoutSlot } from '../economy/Profile';
import { COSMETIC_BY_ID } from '../shop/CosmeticCatalog';
import { CHARACTERS } from '../player/CharacterDefinition';
import { sidePanelLayout } from './CharacterSelect';
import { h } from './dom';
import { t } from './i18n';
import { itemVisual, rarityLabel } from './ShopScreen';
import { topbar } from './Topbar';
import type { Screen } from './UIRoot';

type Slot = LoadoutSlot | 'variant';
const SLOTS: [Slot, string][] = [
  ['hat', 'Hats'],
  ['eyes', 'Eyewear'],
  ['back', 'Back'],
  ['trail', 'Trails'],
  ['emote', 'Emotes'],
  ['variant', 'Colours'],
];

export function inventoryScreen(ctx: AppContext): Screen {
  const bar = topbar(ctx, { back: () => ctx.go('menu'), title: t('Locker') });
  let slot: Slot = 'hat';
  const tabs = h('div', { class: 'tabs' });
  const grid = h('div', { class: 'grid' });
  const info = h('p', { class: 'small muted' });

  const preview = (emote = false) => {
    const p = ctx.authority.profile;
    ctx.menu.show({ characterId: p.loadout.characterId, variantId: p.loadout.variants[p.loadout.characterId] ?? null, cosmetics: visibleLoadout(p) }, emote, slot === 'back');
  };

  const render = () => {
    const p = ctx.authority.profile;
    tabs.replaceChildren(...SLOTS.map(([s, label]) => h('button', { class: `btn btn--small tab ${slot === s ? 'active' : ''}`, onClick: () => ((slot = s), render(), preview()) }, t(label))));
    const cid = p.loadout.characterId;
    const owned = p.inventory.map((id) => COSMETIC_BY_ID[id]).filter((d) => d && d.slot === slot && (slot !== 'variant' || d.characterId === cid));
    const current = slot === 'variant' ? p.loadout.variants[cid] ?? null : p.loadout[slot];
    const cards: HTMLElement[] = [];
    if (slot === 'hat' || slot === 'eyes' || slot === 'back' || slot === 'variant') {
      cards.push(
        h(
          'button',
          { class: `card ${current === null ? 'selected' : ''}`, onClick: () => equip(null) },
          h('div', { class: 'card__swatch', style: 'background:#eee' }, slot === 'variant' ? '🎨' : '∅'),
          h('div', { class: 'card__name' }, slot === 'variant' ? `${CHARACTERS[cid].name} (classic)` : 'None'),
        ),
      );
    }
    for (const d of owned) {
      cards.push(
        h(
          'button',
          { class: `card ${current === d.id ? 'selected' : ''}`, onClick: () => equip(d.id) },
          itemVisual(ctx, d),
          h('div', { class: 'card__name' }, d.name),
          h('div', { class: 'card__meta' }, rarityLabel(d.rarity)),
          current === d.id ? h('span', { class: 'owned-tag equipped-tag' }, t('Equipped')) : null,
        ),
      );
    }
    grid.replaceChildren(...cards);
    info.textContent = owned.length === 0 && slot !== 'hat' ? 'Nothing here yet — visit the Shop, open chests or climb the season track.' : '';
  };

  const equip = async (id: string | null) => {
    try {
      await ctx.authority.equip(slot, id);
      preview(slot === 'emote');
    } catch (e) {
      ctx.fail(e);
    }
  };

  const off = ctx.authority.onChange(render);
  const el = h(
    'div',
    { class: 'screen' },
    bar.el,
    sidePanelLayout(ctx, h('div', null, tabs, h('div', { class: 'panel', style: 'padding:12px' }, grid, info), h('button', { class: 'btn', style: 'margin-top:12px', onClick: () => ctx.go('shop') }, '🛍 ' + t('Shop')))),
  );
  return {
    el,
    onShow() {
      render();
      preview();
    },
    onHide() {
      off();
      bar.dispose();
      ctx.menu.offsetX = 0;
    },
    onBack: () => (ctx.go('menu'), true),
  };
}
