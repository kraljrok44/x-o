import { isCanvasAvailable } from '../render/GameRenderer';
import { h } from '../ui/dom';
import { t } from '../ui/i18n';

/** Friendly full-screen error instead of a blank page. */
export function showFatal(title: string, message: string, detail?: string): void {
  document.querySelector('.fatal')?.remove();
  const box = h(
    'div',
    { class: 'fatal' },
    h(
      'div',
      { class: 'panel', style: 'padding:20px' },
      h('h2', { class: 'panel__title' }, title),
      h('p', null, message),
      detail ? h('p', { class: 'small muted' }, detail) : null,
      h('button', { class: 'btn btn--primary', onClick: () => location.reload() }, t('Reload')),
    ),
  );
  document.body.appendChild(box);
}

export function checkSupport(): boolean {
  if (!isCanvasAvailable()) {
    showFatal(t('Something went wrong'), t('Your browser does not support the canvas this game draws with.'), t('Try updating your browser or playing on another device.'));
    return false;
  }
  return true;
}
