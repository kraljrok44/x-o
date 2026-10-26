import type { AppContext } from '../app/AppContext';
import { CHARACTERS, CHARACTER_IDS, PASSIVES, SPECIALS, type CharacterId } from '../player/CharacterDefinition';
import { visibleLoadout } from '../economy/InventoryService';
import { animalLevel } from '../progression/LeagueService';
import { h, priceChip } from './dom';
import { t } from './i18n';
import { topbar } from './Topbar';
import type { Screen } from './UIRoot';

/** Wide screens show the monster stage on the left and panels on the right. */
export function sidePanelLayout(ctx: AppContext, content: HTMLElement): HTMLElement {
  const wide = ctx.renderer.aspect > 1.15;
  ctx.menu.offsetX = wide ? -1.9 : 0;
  return h(
    'div',
    { class: 'screen__scroll', style: wide ? 'display:flex;justify-content:flex-end' : '' },
    wide ? h('div', { style: 'width:min(560px,56vw)' }, content) : h('div', null, h('div', { class: 'preview-spacer' }), content),
  );
}

export function characterSelect(ctx: AppContext): Screen {
  const bar = topbar(ctx, { back: () => ctx.go('menu'), title: t('Choose your monster') });
  let selected: CharacterId = ctx.authority.profile.loadout.characterId;
  const grid = h('div', { class: 'grid', style: 'grid-template-columns:repeat(3,minmax(0,1fr))' });
  const detail = h('div', { class: 'panel', style: 'padding:14px;margin-top:12px' });

  const preview = () => {
    const p = ctx.authority.profile;
    ctx.menu.show({ characterId: selected, variantId: p.loadout.variants[selected] ?? null, cosmetics: visibleLoadout(p) }, true);
  };

  const render = () => {
    const p = ctx.authority.profile;
    grid.replaceChildren(
      ...CHARACTER_IDS.map((id) => {
        const c = CHARACTERS[id];
        const owned = p.characters.includes(id);
        const card = h(
          'button',
          { class: `card ${id === selected ? 'selected' : ''} ${owned ? '' : 'locked'}`, onClick: () => ((selected = id), render(), preview()) },
          h('img', { src: ctx.thumbs.portrait(id, p.loadout.variants[id] ?? null), alt: c.name, style: 'width:100%;aspect-ratio:1;object-fit:contain' }),
          h('div', { class: 'card__name' }, c.name),
          p.characters.includes(id) ? h('div', { class: 'small muted' }, t('Animal Level {n}', { n: animalLevel(p, id) })) : null,
          owned ? (p.loadout.characterId === id ? h('span', { class: 'owned-tag equipped-tag' }, t('Selected')) : null) : h('span', { class: 'owned-tag', style: 'background:#9aa7b8' }, '🔒'),
        );
        return card;
      }),
    );
    const c = CHARACTERS[selected];
    const owned = p.characters.includes(selected);
    const passive = PASSIVES[c.passive];
    const actions = h('div', { class: 'row row--wrap', style: 'margin-top:10px' });
    if (owned) {
      actions.append(
        h(
          'button',
          {
            class: 'btn btn--good',
            disabled: p.loadout.characterId === selected,
            onClick: async () => {
              try {
                await ctx.authority.equip('character', selected);
                ctx.ui.toast(`${c.name} ✓`, 'good');
              } catch (e) {
                ctx.fail(e);
              }
            },
          },
          p.loadout.characterId === selected ? t('Selected') : t('Select'),
        ),
      );
    } else if (c.unlock !== 'starter') {
      const price = c.unlock.coins;
      actions.append(
        h(
          'button',
          {
            class: 'btn btn--primary',
            onClick: async () => {
              const ok = await ctx.ui.confirm(t('Confirm purchase'), h('div', { class: 'stack' }, h('div', null, `${t('You are about to buy')}: `, h('b', null, c.name)), h('div', { class: 'row' }, t('Price'), priceChip('coins', price))), t('Buy'));
              if (!ok) return;
              try {
                await ctx.authority.buyOffer(`char_${selected}`);
                ctx.audio.play('unlock');
                ctx.ui.toast(`${c.name} ${t('Owned')}!`, 'good');
              } catch (e) {
                ctx.fail(e);
              }
            },
          },
          `${t('Unlock')} `,
          priceChip('coins', price),
        ),
        h('span', { class: 'muted small' }, t('or reach level {n}', { n: c.unlock.level })),
      );
    }
    detail.replaceChildren(
      h('div', { class: 'row row--between' }, h('h2', { class: 'panel__title' }, c.name), h('span', { class: 'chip' }, c.species)),
      h('p', { class: 'muted', style: 'margin:4px 0 10px' }, c.tagline),
      h('div', { class: 'list-item' }, h('div', { style: 'font-size:28px' }, '✨'), h('div', { class: 'list-item__body' }, h('div', { class: 'list-item__title' }, `${t('Passive')}: ${passive.name}`), h('div', { class: 'small muted' }, passive.description))),
      h(
        'div',
        { class: 'list-item' },
        h('div', { style: 'font-size:28px' }, SPECIALS[c.special].icon),
        h(
          'div',
          { class: 'list-item__body' },
          h('div', { class: 'list-item__title' }, `${t('Special')}: ${SPECIALS[c.special].name}`),
          h('div', { class: 'small muted' }, `${SPECIALS[c.special].description} ${t('Cooldown {n} s', { n: SPECIALS[c.special].cooldown })}`),
        ),
      ),
      h('p', { class: 'small muted' }, t('All monsters share the same speed and jump. Passives are small, situational perks.')),
      actions,
    );
  };

  const off = ctx.authority.onChange(render);
  const el = h('div', { class: 'screen' }, bar.el, sidePanelLayout(ctx, h('div', null, grid, detail)));
  return {
    el,
    onShow() {
      render();
      preview();
    },
    onHide() {
      off();
      bar.dispose();
    },
    onBack: () => (ctx.go('menu'), true),
  };
}
