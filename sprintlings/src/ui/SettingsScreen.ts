import type { AppContext } from '../app/AppContext';
import { ACTION_LABELS, DEFAULT_BINDINGS, keyLabel, type InputAction } from '../input/InputManager';
import type { Settings } from '../persistence/LocalSettings';
import { h } from './dom';
import { setLanguage, t } from './i18n';
import { topbar } from './Topbar';
import type { Screen } from './UIRoot';

export function settingsScreen(ctx: AppContext, params: { from?: 'race' } = {}): Screen {
  const bar = topbar(ctx, { back: () => back(), title: t('Settings') });
  const body = h('div', { class: 'stack' });
  const s = () => ctx.settings.value;
  const back = () => (params.from === 'race' ? ctx.ui.closeAllModals() : ctx.go('menu'));

  const seg = <K extends keyof Settings>(key: K, options: [Settings[K], string][], after?: () => void) => {
    const wrap = h('div', { class: 'seg' });
    const draw = () =>
      wrap.replaceChildren(
        ...options.map(([v, label]) =>
          h(
            'button',
            {
              class: s()[key] === v ? 'active' : '',
              onClick: () => {
                ctx.settings.update({ [key]: v } as Partial<Settings>);
                draw();
                after?.();
              },
            },
            label,
          ),
        ),
      );
    draw();
    return wrap;
  };

  const slider = (key: 'master' | 'music' | 'sfx') => {
    const input = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(s().audio[key]), 'aria-label': key }) as HTMLInputElement;
    input.addEventListener('input', () => {
      ctx.settings.update({ audio: { ...s().audio, [key]: Number(input.value) } });
      ctx.audio.applySettings(s().audio);
    });
    input.addEventListener('change', () => ctx.audio.play(key === 'music' ? 'coin' : 'jump'));
    return input;
  };

  const setting = (label: string, control: HTMLElement) => h('div', { class: 'setting' }, h('label', null, label), control);

  const bindingRows = h('div');
  const drawBindings = () => {
    const b = ctx.input.getBindings();
    bindingRows.replaceChildren(
      ...(Object.keys(ACTION_LABELS) as InputAction[]).map((action) => {
        const keys = h('div', { class: 'row row--wrap' });
        b[action].forEach((code, i) => {
          const btn = h('button', { class: 'btn btn--small keycap' }, keyLabel(code));
          btn.addEventListener('click', () => {
            btn.classList.add('listening');
            btn.textContent = t('Press a key…');
            ctx.input.captureNext((newCode) => {
              const next = { ...ctx.input.getBindings() };
              // Remove the key from any other action to avoid conflicts.
              for (const a of Object.keys(next) as InputAction[]) next[a] = next[a].filter((c) => c !== newCode || a === action);
              const list = [...next[action]];
              list[i] = newCode;
              next[action] = [...new Set(list)];
              for (const a of Object.keys(next) as InputAction[]) if (next[a].length === 0) next[a] = [...DEFAULT_BINDINGS[a]];
              ctx.input.setBindings(next);
              ctx.settings.update({ bindings: ctx.input.getBindings() });
              drawBindings();
            });
          });
          keys.append(btn);
        });
        return setting(ACTION_LABELS[action], keys);
      }),
    );
  };

  const render = () => {
    drawBindings();
    const mute = h('input', { type: 'checkbox', 'aria-label': t('Mute') }) as HTMLInputElement;
    mute.checked = s().audio.muted;
    mute.addEventListener('change', () => {
      ctx.settings.update({ audio: { ...s().audio, muted: mute.checked } });
      ctx.audio.applySettings(s().audio);
    });
    const name = (v: boolean) => (v ? t('On') : t('Off'));
    body.replaceChildren(
      h(
        'div',
        { class: 'panel', style: 'padding:4px 16px 12px' },
        h('h2', { class: 'panel__title', style: 'margin:12px 0 4px' }, t('Audio')),
        setting(t('Master'), slider('master')),
        setting(t('Music'), slider('music')),
        setting(t('Sound effects'), slider('sfx')),
        setting(t('Mute'), mute),
      ),
      h(
        'div',
        { class: 'panel', style: 'padding:4px 16px 12px' },
        h('h2', { class: 'panel__title', style: 'margin:12px 0 4px' }, t('Graphics')),
        setting(
          t('Graphics'),
          seg('graphics', [
            ['low', t('Low')],
            ['medium', t('Medium')],
            ['high', t('High')],
          ], () => ctx.renderer.setQuality(s().graphics)),
        ),
        setting(t('Camera shake'), seg('cameraShake', [[true, name(true)], [false, name(false)]])),
        setting(t('Reduced motion'), seg('reducedMotion', [[true, name(true)], [false, name(false)]], () => document.body.classList.toggle('reduced-motion', s().reducedMotion))),
        setting(t('Show FPS'), seg('showFps', [[true, name(true)], [false, name(false)]])),
      ),
      h(
        'div',
        { class: 'panel', style: 'padding:4px 16px 12px' },
        h('h2', { class: 'panel__title', style: 'margin:12px 0 4px' }, t('Controls')),
        setting(t('Touch controls'), seg('touchControls', [['auto', t('Auto')], ['on', t('On')], ['off', t('Off')]])),
        bindingRows,
        h(
          'button',
          {
            class: 'btn btn--small',
            style: 'margin-top:10px',
            onClick: () => {
              ctx.input.setBindings(DEFAULT_BINDINGS);
              ctx.settings.update({ bindings: { ...DEFAULT_BINDINGS } });
              drawBindings();
            },
          },
          t('Reset to defaults'),
        ),
        h('p', { class: 'small muted' }, t('Mouse: left click = jump, right click = ability. Gamepad: A = jump, D-pad down / stick down = drop, X/RB = ability, Start = pause. Touch: tap = jump, swipe down = drop, swipe forward = ability.')),
      ),
      h(
        'div',
        { class: 'panel', style: 'padding:4px 16px 12px' },
        h('h2', { class: 'panel__title', style: 'margin:12px 0 4px' }, t('Language')),
        setting(t('Language'), seg('language', [['en', 'English'], ['sl', 'Slovenščina']], () => {
          setLanguage(s().language);
          ctx.go('settings');
        })),
      ),
      h(
        'div',
        { class: 'panel', style: 'padding:4px 16px 12px' },
        h('h2', { class: 'panel__title', style: 'margin:12px 0 4px' }, t('Data')),
        setting('Anonymous gameplay statistics', seg('analyticsConsent', [['granted', t('On')], ['denied', t('Off')]])),
        h('p', { class: 'small muted' }, ctx.authority.storageLabel),
        params.from === 'race'
          ? null
          : h(
              'button',
              {
                class: 'btn btn--bad btn--small',
                onClick: async () => {
                  const ok = await ctx.ui.confirm(t('Delete local progress'), t('This deletes your progress saved on this device. This cannot be undone.'), t('Delete'), 'bad');
                  if (!ok) return;
                  try {
                    indexedDB.deleteDatabase('sprintlings');
                  } catch {
                    /* ignore */
                  }
                  try {
                    for (const k of Object.keys(localStorage)) if (k.startsWith('sprintlings')) localStorage.removeItem(k);
                  } catch {
                    /* ignore */
                  }
                  location.reload();
                },
              },
              t('Delete local progress'),
            ),
        h('p', { class: 'small muted' }, `Sprintlings · build ${__BUILD_TIME__.slice(0, 10)} · ${ctx.platform.displayName}`),
      ),
    );
  };

  const el = h('div', { class: 'screen' }, bar.el, h('div', { class: 'screen__scroll' }, h('div', { class: 'sheet sheet--narrow' }, body)));
  return {
    el,
    onShow: render,
    onHide: () => bar.dispose(),
    onBack: () => (back(), true),
  };
}

declare const __BUILD_TIME__: string;
