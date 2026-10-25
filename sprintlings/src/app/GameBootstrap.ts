import { isWebGLAvailable } from '../render/GameRenderer';
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
  if (!isWebGLAvailable()) {
    showFatal(t('Something went wrong'), t('Your browser or device does not support WebGL, which this 3D game needs.'), t('Try updating your browser, enabling hardware acceleration, or playing on another device.'));
    return false;
  }
  return true;
}
