import type { AppContext } from '../app/AppContext';
import { CHARACTERS } from '../player/CharacterDefinition';
import { claimableCounts } from '../economy/EconomyService';
import { visibleLoadout } from '../economy/InventoryService';
import { dailyInfo } from '../progression/DailyRewardService';
import { TRACK_IDS, trackInfo } from '../game/TrackManager';
import { coinChip, gemChip, h } from './dom';
import { t } from './i18n';
import { topbar } from './Topbar';
import type { Screen } from './UIRoot';

let dailyPromptShown = false;

export function showcaseLoadout(ctx: AppContext) {
  const p = ctx.authority.profile;
  return { characterId: p.loadout.characterId, variantId: p.loadout.variants[p.loadout.characterId] ?? null, cosmetics: visibleLoadout(p) };
}

/** Next hand-made track the player has unlocked, rotating through them. */
export function quickRaceTrack(ctx: AppContext): string {
  const level = ctx.authority.profile.level;
  const unlocked = TRACK_IDS.filter((id) => trackInfo(id).unlockLevel <= level);
  const last = ctx.settings.value.lastTrack;
  const i = unlocked.indexOf(last);
  return unlocked[(i + 1) % unlocked.length] ?? TRACK_IDS[0];
}

export function mainMenu(ctx: AppContext): Screen {
  const bar = topbar(ctx);
  const badges: Record<string, HTMLElement> = {};
  const tile = (icon: string, label: string, onClick: () => void, badgeKey?: string) => {
    const btn = h('button', { class: 'btn menu-tile', onClick }, h('span', { class: 'tile-ico' }, icon), h('span', { class: 'tile-label' }, label));
    if (badgeKey) {
      const b = h('span', { class: 'badge hidden' });
      badges[badgeKey] = b;
      btn.append(b);
    }
    return btn;
  };
  const charName = h('b');
  const charSub = h('div', { class: 'small muted' });
  const plate = h('button', { class: 'char-plate', style: 'cursor:pointer', onClick: () => ctx.go('characters') }, charName, charSub);

  const play = h(
    'button',
    {
      class: 'btn btn--good btn--huge',
      onClick: () => ctx.startRace(quickRaceTrack(ctx), 'race'),
    },
    '▶ ' + t('Play'),
  );
  const el = h(
    'div',
    { class: 'screen' },
    bar.el,
    h('div', { class: 'menu-title' }, h('div', { class: 'logo' }, 'Sprint', h('span', null, 'lings'))),
    h(
      'div',
      { class: 'menu-main' },
      h('div', { class: 'menu-side' }, tile('🛍', t('Shop'), () => ctx.go('shop')), tile('🎩', t('Locker'), () => ctx.go('locker')), tile('🦔', t('Characters'), () => ctx.go('characters'))),
      h(
        'div',
        { class: 'menu-center' },
        plate,
        play,
        h('button', { class: 'btn btn--primary', onClick: () => ctx.go('modes') }, '🗺 ' + t('Choose a race')),
        h('div', { class: 'storage-note' }, ctx.authority.storageLabel),
      ),
      h(
        'div',
        { class: 'menu-side menu-side--right' },
        tile('📜', t('Quests'), () => ctx.go('quests'), 'quests'),
        tile('🍂', t('Season'), () => ctx.go('season'), 'season'),
        tile('🏆', t('Achievements'), () => ctx.go('achievements'), 'achievements'),
        tile('🙂', t('Profile'), () => ctx.go('profile')),
      ),
    ),
  );

  const render = () => {
    const p = ctx.authority.profile;
    const c = CHARACTERS[p.loadout.characterId];
    charName.textContent = c.name;
    charSub.textContent = c.species;
    const counts = claimableCounts(p, ctx.authority.now());
    const set = (k: string, n: number) => {
      badges[k].textContent = String(n);
      badges[k].classList.toggle('hidden', n <= 0);
    };
    set('quests', counts.quests + (counts.daily ? 1 : 0));
    set('season', counts.season);
    set('achievements', counts.achievements);
    ctx.menu.show(showcaseLoadout(ctx));
  };

  let off: (() => void) | null = null;
  return {
    el,
    onShow() {
      ctx.menu.offsetX = 0;
      render();
      off = ctx.authority.onChange(render);
      const now = ctx.authority.now();
      if (!dailyPromptShown && ctx.authority.profile.tutorialDone && dailyInfo(ctx.authority.profile, now).available) {
        dailyPromptShown = true;
        setTimeout(() => dailyPopup(ctx), 400);
      }
    },
    onHide() {
      off?.();
      bar.dispose();
    },
  };
}

export function dailyPopup(ctx: AppContext): void {
  const info = dailyInfo(ctx.authority.profile, ctx.authority.now());
  if (!info.available) return;
  const r = info.reward;
  const body = h(
    'div',
    { class: 'stack', style: 'align-items:center;text-align:center' },
    h('div', { style: 'font-size:56px' }, '🎁'),
    h('div', { class: 'row' }, r.coins ? coinChip(r.coins) : null, r.gems ? gemChip(r.gems) : null, r.chest ? h('span', { class: 'chip' }, '🧰 Acorn Chest') : null),
    h('p', { class: 'muted small' }, t('Missing a day never resets your progress.')),
  );
  ctx.ui.modal(`${t('Daily calendar')} · ${t('Day {n}', { n: info.index + 1 })}`, body, [
    {
      label: t('Claim'),
      kind: 'good',
      run: async () => {
        try {
          const g = await ctx.authority.claimDaily();
          ctx.audio.play('coin');
          ctx.ui.toast(`+${g.coins} Coins${g.gems ? ` · +${g.gems} Gems` : ''}${g.items.length ? ' · new item!' : ''}`, 'gold');
        } catch (e) {
          ctx.fail(e);
        }
      },
    },
  ]);
}
