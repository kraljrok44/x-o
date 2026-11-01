// Leaderboard panel: overall points ranking + per map best times, all-time and weekly season.

import { $, $$, esc, html, show } from './dom.js';
import { t } from '../i18n.js';
import { audio } from '../audio.js';
import { formatTime } from '../../shared/sim.js';
import { MAP_LIST } from '../../shared/maps/index.js';
import { POINTS_BOARD } from '../../shared/leaderboard.js';

export class Leaderboard {
  constructor(hooks) {
    this.hooks = hooks; // { query(board, period) -> Promise<data|null>, close(), currentMap() }
    this.el = $('#leaderboard');
    this.board = POINTS_BOARD;
    this.period = 'all';
  }

  open(board) {
    show(this.el, true);
    if (board) this.board = board;
    this.load();
  }

  close() { show(this.el, false); }

  async load() {
    this.render(null, true);
    const data = await this.hooks.query(this.board, this.period);
    if (!this.el.classList.contains('hidden')) this.render(data, false);
  }

  render(data, loading) {
    const isPoints = this.board === POINTS_BOARD;
    const fmt = (r) => (isPoints ? `${r.value.toLocaleString()} <span class="dim small">pts · ${r.maps || 0} ${t('mapsDone')}</span>` : formatTime(r.value));
    const row = (r) => `<tr class="${r.me ? 'me' : ''}"><td class="rank r${r.rank}">${r.rank}</td><td>${esc(r.name)}${r.cg ? ' <span class="cg-badge" title="CrazyGames">CG</span>' : ''}</td><td class="val">${fmt(r)}</td></tr>`;
    let body;
    if (loading) body = `<div class="lb-empty"><div class="spinner"></div></div>`;
    else if (!data) body = `<div class="lb-empty dim">${t('lbOffline')}</div>`;
    else if (!data.list.length) body = `<div class="lb-empty dim">${t('lbEmpty')}</div>`;
    else {
      body = `<table class="lb-table"><thead><tr><th>#</th><th>${t('name')}</th><th>${isPoints ? t('points') : t('time')}</th></tr></thead><tbody>${data.list.map(row).join('')}</tbody></table>`;
      if (data.me && !data.list.some((r) => r.me)) body += `<table class="lb-table mine"><tbody>${row(data.me)}</tbody></table>`;
    }
    const left = data ? Math.max(0, data.seasonEndsAt - Date.now()) : 0;
    const dur = `${Math.floor(left / 86400000)}d ${Math.floor((left % 86400000) / 3600000)}h`;
    const season = data && !isPoints && this.period === 'week' ? `<span class="dim small">· ${t('seasonEnds')} ${dur}</span>` : '';
    html(this.el, `
      <div class="panel-head">
        <div><div class="panel-title">${t('leaderboard')}</div><div class="dim small">${isPoints ? t('pointsHelp') : esc((MAP_LIST.find((m) => m.id === this.board) || {}).display_name || '')} ${season}</div></div>
        <button class="btn ghost" id="lb-close">✕ ${t('close')}</button>
      </div>
      <div class="lb-layout">
        <div class="lb-boards">
          <button class="lb-board ${isPoints ? 'on' : ''}" data-b="${POINTS_BOARD}">★ ${t('overall')}</button>
          ${MAP_LIST.map((m) => `<button class="lb-board ${this.board === m.id ? 'on' : ''}" data-b="${m.id}"><span>${esc(m.display_name)}</span><span class="diff d${m.difficulty}">${t('difficulty')[m.difficulty]}</span></button>`).join('')}
        </div>
        <div class="lb-main">
          ${isPoints ? '' : `<div class="tabs lb-period"><button class="tab ${this.period === 'all' ? 'on' : ''}" data-p="all">${t('allTime')}</button><button class="tab ${this.period === 'week' ? 'on' : ''}" data-p="week">${t('thisWeek')}</button></div>`}
          <div class="lb-list">${body}</div>
          ${data ? `<div class="dim small">${data.total} ${t('players')}</div>` : ''}
        </div>
      </div>`);
    $('#lb-close').onclick = () => { audio.play('click'); this.hooks.close(); };
    $$('.lb-board', this.el).forEach((b) => (b.onclick = () => { audio.play('click'); this.board = b.dataset.b; this.load(); }));
    $$('.lb-period .tab', this.el).forEach((b) => (b.onclick = () => { audio.play('click'); this.period = b.dataset.p; this.load(); }));
  }
}
