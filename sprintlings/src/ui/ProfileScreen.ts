import type { AppContext } from '../app/AppContext';
import { CHARACTERS } from '../player/CharacterDefinition';
import { levelProgress } from '../progression/LevelProgression';
import { TRACK_IDS, trackInfo } from '../game/TrackManager';
import { formatRaceTime } from '../shared/time';
import { h, progressBar } from './dom';
import { t } from './i18n';
import { topbar } from './Topbar';
import type { Screen } from './UIRoot';

export function profileScreen(ctx: AppContext): Screen {
  const bar = topbar(ctx, { back: () => ctx.go('menu'), title: t('Profile') });
  const body = h('div', { class: 'stack' });
  const render = () => {
    const p = ctx.authority.profile;
    const lp = levelProgress(p.xp);
    const nameInput = h('input', { value: p.name, maxlength: '16', style: 'font:inherit;font-size:18px;padding:8px 10px;border:3px solid #3a1f10;border-radius:12px;background:#fff8e6;flex:1;min-width:0' }) as HTMLInputElement;
    const st = p.stats;
    const stat = (label: string, v: string | number) => h('div', { class: 'list-item', style: 'padding:8px 12px' }, h('div', { class: 'list-item__body' }, h('div', { class: 'small muted' }, label), h('div', { class: 'list-item__title' }, String(v))));
    body.replaceChildren(
      h(
        'div',
        { class: 'panel', style: 'padding:14px' },
        h('div', { class: 'row' }, h('img', { src: ctx.thumbs.portrait(p.loadout.characterId, p.loadout.variants[p.loadout.characterId] ?? null), style: 'width:96px;height:96px' }), h('div', { style: 'flex:1' }, h('h2', { class: 'panel__title' }, p.name), h('div', { class: 'muted' }, `${t('Level {n}', { n: lp.level })} · ${CHARACTERS[p.loadout.characterId].name}`), progressBar(lp.into, lp.needed || 1, 'progress--xp'), h('div', { class: 'small muted' }, lp.needed ? `${lp.into} / ${lp.needed} XP` : 'MAX'))),
        h(
          'div',
          { class: 'row', style: 'margin-top:12px' },
          nameInput,
          h(
            'button',
            {
              class: 'btn btn--small btn--primary',
              onClick: async () => {
                try {
                  await ctx.authority.setName(nameInput.value);
                  ctx.ui.toast('✓', 'good');
                } catch (e) {
                  ctx.fail(e);
                }
              },
            },
            t('Save'),
          ),
        ),
        h('p', { class: 'small muted' }, '💾 ' + ctx.authority.storageLabel),
      ),
      h(
        'div',
        { class: 'panel', style: 'padding:14px' },
        h('h2', { class: 'panel__title' }, t('Statistics')),
        h(
          'div',
          { class: 'grid', style: 'grid-template-columns:repeat(auto-fill,minmax(140px,1fr));margin-top:8px' },
          stat(t('Races'), st.races),
          stat(t('Wins'), st.wins),
          stat(t('Podiums'), st.podiums),
          stat('Best podium streak', st.bestPodiumStreak),
          stat('Jumps', st.jumps),
          stat('Obstacles cleared', st.hurdles),
          stat(t('Abilities'), st.abilitiesUsed),
          stat('Rocket hits', st.hitsLanded),
          stat('Gold nuggets', st.glimmers),
          stat(t('Quests'), st.questsCompleted),
          stat('Items', p.inventory.length),
          stat('Play time', `${Math.round(st.playSeconds / 60)} min`),
        ),
      ),
      h(
        'div',
        { class: 'panel', style: 'padding:14px' },
        h('h2', { class: 'panel__title' }, t('Best times')),
        ...TRACK_IDS.map((id) => h('div', { class: 'setting' }, h('span', null, trackInfo(id).name), h('b', null, st.bestTimes[id] ? formatRaceTime(st.bestTimes[id]) : '—'))),
      ),
    );
  };
  const off = ctx.authority.onChange(render);
  const el = h('div', { class: 'screen' }, bar.el, h('div', { class: 'screen__scroll' }, h('div', { class: 'sheet sheet--narrow' }, body)));
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
