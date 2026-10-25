import { clear, h } from './dom';
import { t } from './i18n';

export interface Screen {
  el: HTMLElement;
  onShow?(): void;
  onHide?(): void;
  /** Called every frame while visible. */
  update?(dt: number): void;
  /** Back / Escape handling. Return true if handled. */
  onBack?(): boolean;
}

export interface ModalAction {
  label: string;
  kind?: 'primary' | 'good' | 'bad' | 'ghost';
  /** Return false to keep the modal open. */
  run?: () => unknown;
}

/** Owns the DOM overlay: one active screen, a modal stack and toasts. */
export class UIRoot {
  private current: Screen | null = null;
  private readonly modals: HTMLElement[] = [];
  private onClick: (() => void) | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly overlay: HTMLElement,
    private readonly toasts: HTMLElement,
  ) {}

  /** Plays the UI click sound for every button. */
  setClickSound(cb: () => void): void {
    this.onClick = cb;
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('button')) this.onClick?.();
    });
  }

  show(screen: Screen): void {
    if (this.current) {
      this.current.onHide?.();
      this.current.el.remove();
    }
    this.current = screen;
    this.root.appendChild(screen.el);
    screen.onShow?.();
  }

  get screen(): Screen | null {
    return this.current;
  }

  update(dt: number): void {
    this.current?.update?.(dt);
  }

  back(): boolean {
    if (this.modals.length) {
      this.closeModal();
      return true;
    }
    return this.current?.onBack?.() ?? false;
  }

  get modalOpen(): boolean {
    return this.modals.length > 0;
  }

  modal(title: string, body: Node | string, actions: ModalAction[], opts: { dismissable?: boolean; wide?: boolean } = {}): HTMLElement {
    const box = h('div', { class: 'panel modal', role: 'dialog', 'aria-modal': 'true', style: opts.wide ? 'width:min(640px,100%)' : undefined });
    const close = () => this.closeModal(backdrop);
    box.append(
      h('div', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, title), opts.dismissable === false ? null : h('button', { class: 'btn btn--icon btn--small', 'aria-label': t('Close'), onClick: close }, '✕')),
      h('div', { class: 'panel__body' }, typeof body === 'string' ? h('p', null, body) : body),
    );
    if (actions.length) {
      const row = h('div', { class: 'modal__actions' });
      for (const a of actions) {
        const btn = h('button', { class: `btn ${a.kind ? `btn--${a.kind}` : ''}` }, a.label);
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            const r = await a.run?.();
            if (r !== false) close();
          } finally {
            btn.disabled = false;
          }
        });
        row.append(btn);
      }
      box.append(row);
    }
    const backdrop = h('div', { class: 'modal-backdrop' }, box);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop && opts.dismissable !== false) close();
    });
    this.overlay.appendChild(backdrop);
    this.modals.push(backdrop);
    (box.querySelector('.modal__actions .btn') as HTMLElement | null)?.focus();
    return backdrop;
  }

  closeModal(el?: HTMLElement): void {
    const target = el ?? this.modals[this.modals.length - 1];
    if (!target) return;
    const i = this.modals.indexOf(target);
    if (i >= 0) this.modals.splice(i, 1);
    target.remove();
  }

  closeAllModals(): void {
    while (this.modals.length) this.closeModal();
  }

  confirm(title: string, body: Node | string, confirmLabel = t('Confirm'), kind: ModalAction['kind'] = 'primary'): Promise<boolean> {
    return new Promise((resolve) => {
      let answered = false;
      const el = this.modal(title, body, [
        { label: t('Cancel'), kind: 'ghost', run: () => ((answered = true), resolve(false)) },
        { label: confirmLabel, kind, run: () => ((answered = true), resolve(true)) },
      ]);
      const obs = new MutationObserver(() => {
        if (!el.isConnected) {
          obs.disconnect();
          if (!answered) resolve(false);
        }
      });
      obs.observe(this.overlay, { childList: true });
    });
  }

  alert(title: string, body: Node | string): Promise<void> {
    return new Promise((resolve) => {
      this.modal(title, body, [{ label: 'OK', kind: 'primary', run: () => resolve() }]);
    });
  }

  toast(text: string, kind: 'good' | 'bad' | 'gold' | '' = '', ms = 2600): void {
    const el = h('div', { class: `toast ${kind ? `toast--${kind}` : ''}` }, text);
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 4) this.toasts.firstChild?.remove();
    setTimeout(() => el.remove(), ms);
  }

  clearOverlay(): void {
    clear(this.overlay);
    this.modals.length = 0;
  }
}
