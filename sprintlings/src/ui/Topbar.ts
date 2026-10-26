import type { AppContext } from '../app/AppContext';
import { levelProgress } from '../progression/LevelProgression';
import { h } from './dom';
import { t } from './i18n';

/** Wallet + level header shared by menu screens. Re-renders on profile changes. */
export function topbar(ctx: AppContext, opts: { back?: () => void; title?: string } = {}): { el: HTMLElement; dispose: () => void } {
  const coins = h('span');
  const gems = h('span');
  const lvlNum = h('div', { class: 'levelchip__num' });
  const lvlBar = h('div');
  const render = () => {
    const p = ctx.authority.profile;
    coins.textContent = p.wallet.coins.toLocaleString();
    gems.textContent = p.wallet.gems.toLocaleString();
    const lp = levelProgress(p.xp);
    lvlNum.textContent = String(lp.level);
    lvlBar.style.width = `${lp.needed ? (lp.into / lp.needed) * 100 : 100}%`;
  };
  const left = h('div', { class: 'topbar__left' });
  if (opts.back) left.append(h('button', { class: 'btn btn--icon backbtn', 'aria-label': t('Back'), onClick: opts.back }, '←'));
  if (opts.title) left.append(h('h1', { class: 'panel__title', style: 'color:#ffe7b0;-webkit-text-stroke:4px #3a1f10;paint-order:stroke fill;margin:0' }, opts.title));
  else left.append(h('div', { class: 'levelchip', title: t('Level {n}', { n: '' }) }, lvlNum, h('div', { class: 'levelchip__bar' }, lvlBar)));
  const el = h(
    'div',
    { class: 'topbar' },
    left,
    h(
      'div',
      { class: 'topbar__right' },
      h('div', { class: 'wallet' }, h('span', { class: 'chip chip--coin' }, h('i', { class: 'ico-coin' }), coins), h('button', { class: 'chip chip--gem', style: 'cursor:pointer', onClick: () => ctx.go('shop', { tab: 'gems' }) }, h('i', { class: 'ico-gem' }), gems)),
      h('button', { class: 'btn btn--icon', 'aria-label': t('Settings'), onClick: () => ctx.go('settings') }, '⚙'),
    ),
  );
  render();
  const off = ctx.authority.onChange(render);
  return { el, dispose: off };
}
