import type { AppContext } from '../app/AppContext';
import type { GrantResult } from '../economy/EconomyService';
import { COSMETIC_BY_ID, RARITY_COLORS } from '../shop/CosmeticCatalog';
import { coinChip, gemChip, h } from './dom';
import { itemVisual, rarityLabel } from './ShopScreen';
import { t } from './i18n';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Inline SVG of a banded wooden strongbox; the lid is a separate group so it can swing open. */
function chestSvg(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 200 170');
  svg.setAttribute('class', 'chest-svg');
  svg.innerHTML = `
    <g class="chest-base">
      <rect x="22" y="78" width="156" height="82" rx="10" fill="#9a5b2e" stroke="#2a1a1e" stroke-width="6"/>
      <path d="M26 104h148M26 130h148" stroke="#7a4220" stroke-width="5"/>
      <rect x="40" y="78" width="16" height="82" fill="#8f97a3" stroke="#2a1a1e" stroke-width="4"/>
      <rect x="144" y="78" width="16" height="82" fill="#8f97a3" stroke="#2a1a1e" stroke-width="4"/>
      <circle cx="48" cy="94" r="3" fill="#2a1a1e"/><circle cx="48" cy="146" r="3" fill="#2a1a1e"/>
      <circle cx="152" cy="94" r="3" fill="#2a1a1e"/><circle cx="152" cy="146" r="3" fill="#2a1a1e"/>
      <rect x="86" y="84" width="28" height="34" rx="6" fill="#f2c14e" stroke="#2a1a1e" stroke-width="4"/>
      <path d="M100 96v10" stroke="#2a1a1e" stroke-width="5" stroke-linecap="round"/>
    </g>
    <g class="chest-lid">
      <path d="M22 82v-22c0-26 34-42 78-42s78 16 78 42v22z" fill="#b06a34" stroke="#2a1a1e" stroke-width="6" stroke-linejoin="round"/>
      <path d="M40 82V40M160 82V40" stroke="#8f97a3" stroke-width="16"/>
      <path d="M40 82V40M160 82V40" stroke="#2a1a1e" stroke-width="2" stroke-dasharray="0 0" opacity=".35"/>
      <path d="M34 50c20-14 112-14 132 0" stroke="#d58a4c" stroke-width="5" fill="none" stroke-linecap="round"/>
      <rect x="88" y="64" width="24" height="20" rx="4" fill="#f2c14e" stroke="#2a1a1e" stroke-width="4"/>
    </g>`;
  return svg;
}

/**
 * Full-screen chest reveal: the strongbox drops in, rattles, bursts open
 * with light rays and flying coins, then the prize rises out with its
 * rarity glow. Tapping skips straight to the reveal. `grant` is what the
 * authority actually awarded, so the animation never shows something else.
 */
export function showChestOpening(ctx: AppContext, grant: GrantResult, title = 'Strongbox'): Promise<void> {
  return new Promise((resolve) => {
    const id = grant.items[0] ?? grant.duplicates[0]?.id;
    const def = id ? COSMETIC_BY_ID[id] : undefined;
    const color = def ? RARITY_COLORS[def.rarity] : '#ffcf33';
    const reduced = ctx.settings.value.reducedMotion;

    const rays = h('div', { class: 'chest-rays', style: `--glow:${color}` });
    const sparks = h('div', { class: 'chest-sparks' });
    const chest = h('div', { class: 'chest-box' });
    chest.append(chestSvg());
    const dup = grant.duplicates[0];
    const extras = h(
      'div',
      { class: 'row', style: 'justify-content:center' },
      grant.coins ? coinChip(grant.coins) : null,
      grant.gems ? gemChip(grant.gems) : null,
    );
    const prize = h(
      'div',
      { class: 'chest-prize', style: `--glow:${color}` },
      def ? itemVisual(ctx, def) : h('div', { class: 'card__swatch' }, '🪙'),
      h('div', { class: 'card__name' }, def?.name ?? t('Coins')),
      def ? rarityLabel(def.rarity) : null,
      dup ? h('p', { class: 'small' }, `${t('Duplicate')} → +${dup.coins} ${t('Coins')}`) : def ? h('p', { class: 'small' }, '✨ ' + t('New item!')) : null,
      extras,
    );
    const collect = h('button', { class: 'btn btn--good btn--huge chest-collect' }, t('Collect'));
    const stage = h('div', { class: 'chest-stage' }, h('div', { class: 'chest-title' }, title), rays, sparks, chest, prize, collect);
    const overlay = h('div', { class: 'chest-overlay', role: 'dialog', 'aria-modal': 'true' }, stage);
    document.body.appendChild(overlay);

    let opened = false;
    const timers: number[] = [];
    const open = () => {
      if (opened) return;
      opened = true;
      timers.forEach((x) => clearTimeout(x));
      overlay.classList.add('is-open');
      ctx.audio.play('unlock');
      if (!reduced) {
        const icons = ['🪙', '✨', '⭐', '🪙', '💥'];
        for (let i = 0; i < 18; i++) {
          const s = h('span', { class: 'chest-spark' }, icons[i % icons.length]);
          const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
          const d = 120 + Math.random() * 160;
          s.style.setProperty('--dx', `${Math.cos(a) * d}px`);
          s.style.setProperty('--dy', `${Math.sin(a) * d}px`);
          s.style.setProperty('--rot', `${(Math.random() - 0.5) * 720}deg`);
          s.style.animationDelay = `${Math.random() * 0.15}s`;
          sparks.append(s);
        }
      }
      timers.push(window.setTimeout(() => collect.focus(), 400));
    };
    const close = () => {
      timers.forEach((x) => clearTimeout(x));
      overlay.remove();
      resolve();
    };
    if (reduced) open();
    else {
      ctx.audio.play('whoosh');
      timers.push(window.setTimeout(() => overlay.classList.add('is-shaking'), 450));
      timers.push(window.setTimeout(open, 1350));
    }
    overlay.addEventListener('click', (e) => {
      if (!opened) open();
      else if (e.target === collect) close();
    });
    collect.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
  });
}
