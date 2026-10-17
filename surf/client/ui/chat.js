// In-game chat. Kept out of the way while surfing: small, bottom-left, translucent, lines fade
// after a few seconds and it only takes keyboard input after ENTER / T. Players can switch it
// off right in the chat (button or /hide). All moderation happens on the server.

import { $, esc, show } from './dom.js';
import { t } from '../i18n.js';
import { settings, saveSettings } from '../settings.js';
import { audio } from '../audio.js';

const FADE_MS = 9000;
const MAX_LINES = 7;

export class Chat {
  constructor(game) {
    this.game = game;
    this.root = $('#chat');
    this.log = $('#chat-log');
    this.row = $('#chat-row');
    this.input = $('#chat-input');
    this.toggle = $('#chat-toggle');
    this.offPill = $('#chat-off');
    this.lines = [];
    this.open = false;
    this.muted = new Set();
    game.on('chat', (m) => this.add(m));
    window.addEventListener('keydown', (e) => this._key(e), true);
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this._send(); }
      else if (e.key === 'Escape') { this.close(); }
      e.stopPropagation();
    });
    this.toggle.onclick = () => { this.setEnabled(!settings.chat); this.input.focus(); };
    setInterval(() => this._fade(), 500);
    window.addEventListener('gz-settings', () => this._applyEnabled());
    this._applyEnabled();
  }

  setVisible(on) {
    show(this.root, on);
    if (!on) this.close();
  }

  setEnabled(on) {
    saveSettings({ chat: on });
    audio.play('click');
  }

  _applyEnabled() {
    const on = settings.chat !== false;
    this.log.classList.toggle('hidden', !on);
    this.toggle.textContent = on ? t('chatHide') : t('chatShow');
    this.input.disabled = !on;
    this.input.placeholder = on ? t('chatPlaceholder') : t('chatIsOff');
    this.offPill.classList.toggle('hidden', on || this.open);
  }

  _key(e) {
    if (this.game.mode !== 'play' || this.root.classList.contains('hidden')) return;
    if (this.open) return;
    if (document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    if (!this.game.input.locked) return;
    if (e.code === 'Enter' || e.code === 'KeyT') {
      e.preventDefault();
      e.stopPropagation();
      this.openInput();
    }
  }

  openInput() {
    this.open = true;
    this.game.input.keys.clear(); // stop moving while typing
    this.root.classList.add('open');
    show(this.row, true);
    this.offPill.classList.add('hidden');
    for (const l of this.lines) l.el.classList.remove('faded');
    setTimeout(() => this.input.focus(), 0);
  }

  close() {
    this.open = false;
    this.input.value = '';
    this.input.blur();
    this.root.classList.remove('open');
    show(this.row, false);
    this._applyEnabled();
  }

  _send() {
    const text = this.input.value.trim();
    if (text === '/hide' || text === '/chat off') { this.setEnabled(false); this.close(); return; }
    if (text === '/show' || text === '/chat on') { this.setEnabled(true); this.close(); return; }
    const mute = text.match(/^\/(un)?mute\s+(.+)$/i);
    if (mute) {
      const name = mute[2].trim().toLowerCase();
      if (mute[1]) this.muted.delete(name); else this.muted.add(name);
      this.add({ kind: 'system', text: `${mute[1] ? t('unmuted') : t('muted')}: ${mute[2].trim()}` });
      this.close();
      return;
    }
    if (text && settings.chat !== false) this.game.send({ t: 'chat', text: text.slice(0, 120) });
    this.close();
  }

  add(m) {
    if (settings.chat === false && m.kind !== 'self') return;
    if (m.name && this.muted.has(m.name.toLowerCase())) return;
    const el = document.createElement('div');
    el.className = 'chat-line ' + (m.kind || 'player');
    if (m.kind === 'player' || m.kind === 'spec') {
      el.innerHTML = `<b class="chat-name">${esc(m.name)}${m.kind === 'spec' ? ' <span class="dim">(spec)</span>' : ''}:</b> ${esc(m.text)}`;
    } else {
      el.innerHTML = (m.kind === 'knife' ? '🔪 ' : '') + esc(m.text);
    }
    this.log.appendChild(el);
    this.lines.push({ el, at: performance.now() });
    while (this.lines.length > 40) this.lines.shift().el.remove();
    this._fade();
  }

  _fade() {
    const now = performance.now();
    this.lines.forEach((l, i) => {
      const recent = i >= this.lines.length - MAX_LINES;
      l.el.classList.toggle('gone', !this.open && !recent);
      l.el.classList.toggle('faded', !this.open && now - l.at > FADE_MS);
    });
  }
}
