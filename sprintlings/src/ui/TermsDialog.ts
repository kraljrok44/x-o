import type { AppContext } from '../app/AppContext';
import { TERMS_VERSION, privacyPolicy, termsOfService, type LegalSection } from '../legal/Terms';
import { h } from './dom';
import { t } from './i18n';

export function termsAccepted(ctx: AppContext): boolean {
  return ctx.authority.profile.terms?.version === TERMS_VERSION;
}

function sections(list: LegalSection[]): HTMLElement {
  return h('div', { class: 'legal' }, ...list.flatMap((s) => [h('h3', null, s.title), ...s.paragraphs.map((p) => h('p', null, p))]));
}

/**
 * Terms of Service and Privacy Policy. In 'accept' mode the player must tick
 * both boxes before Accept is enabled; resolves true once acceptance is
 * recorded by the authority. 'view' just shows the documents.
 */
export function showTerms(ctx: AppContext, mode: 'accept' | 'view' = 'accept'): Promise<boolean> {
  return new Promise((resolve) => {
    let tab: 'terms' | 'privacy' = 'terms';
    const doc = h('div', { class: 'legal-scroll' });
    const tabs = h('div', { class: 'seg' });
    const render = () => {
      doc.replaceChildren(sections(tab === 'terms' ? termsOfService() : privacyPolicy()));
      doc.scrollTop = 0;
      tabs.replaceChildren(
        h('button', { class: tab === 'terms' ? 'active' : '', onClick: () => ((tab = 'terms'), render()) }, t('Terms of Service')),
        h('button', { class: tab === 'privacy' ? 'active' : '', onClick: () => ((tab = 'privacy'), render()) }, t('Privacy Policy')),
      );
    };
    render();
    const readBox = h('input', { type: 'checkbox' }) as HTMLInputElement;
    const ageBox = h('input', { type: 'checkbox' }) as HTMLInputElement;
    const body = h(
      'div',
      { class: 'stack' },
      mode === 'accept' ? h('p', { class: 'small' }, t('Before you race online or buy items, please read and accept our terms.')) : null,
      tabs,
      doc,
      mode === 'accept'
        ? h(
            'div',
            { class: 'stack legal-checks' },
            h('label', { class: 'check' }, readBox, h('span', null, t('I have read and accept the Terms of Service and the Privacy Policy.'))),
            h('label', { class: 'check' }, ageBox, h('span', null, t('I am at least 13 years old, or a parent or guardian has agreed for me.'))),
          )
        : null,
      h('div', { class: 'small muted' }, t('Version {v}', { v: TERMS_VERSION })),
    );
    let done = false;
    const finish = (v: boolean) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    if (mode === 'view') {
      ctx.ui.modal(t('Terms & Privacy'), body, [{ label: t('Close'), kind: 'primary', run: () => finish(false) }], { wide: true });
      return;
    }
    const el = ctx.ui.modal(
      t('Terms & Privacy'),
      body,
      [
        { label: t('Not now'), kind: 'ghost', run: () => finish(false) },
        {
          label: t('Accept'),
          kind: 'good',
          run: async () => {
            if (!readBox.checked || !ageBox.checked) return false;
            try {
              await ctx.authority.acceptTerms(TERMS_VERSION);
            } catch (e) {
              ctx.ui.toast(e instanceof Error ? e.message : String(e), 'bad');
              return false;
            }
            ctx.ui.toast('✓ ' + t('Thanks! Online races are unlocked.'), 'good');
            finish(true);
            return true;
          },
        },
      ],
      { dismissable: false, wide: true },
    );
    const accept = [...el.querySelectorAll<HTMLButtonElement>('.modal__actions .btn')].pop()!;
    const sync = () => (accept.classList.toggle('btn--disabled', !(readBox.checked && ageBox.checked)), accept.setAttribute('aria-disabled', String(!(readBox.checked && ageBox.checked))));
    readBox.addEventListener('change', sync);
    ageBox.addEventListener('change', sync);
    sync();
  });
}

/** Shows the terms if they are not yet accepted; true when accepted (now or before). */
export async function ensureTerms(ctx: AppContext): Promise<boolean> {
  if (termsAccepted(ctx)) return true;
  return showTerms(ctx, 'accept');
}
