// In-game HUD (spec 11): speed, run timer, stage, PB / server best, map timer, vote panel,
// event feed, spectator banner, key hints, scoreboard and the physics debug readout.

import { $, esc, show, html, fmtClock } from './dom.js';
import { t } from '../i18n.js';
import { formatTime } from '../../shared/sim.js';
import { MAP_LIST } from '../../shared/maps/index.js';
import { EXTEND } from '../../shared/vote.js';
import { getCollectible } from '../../shared/catalog.js';
import { settings } from '../settings.js';

const mapName = (id) => (MAP_LIST.find((m) => m.id === id) || { display_name: id }).display_name;

export class Hud {
  constructor(game) {
    this.game = game;
    this.root = $('#hud');
    this.feedItems = [];
    this.lastSpeed = 0;
    this.toastTimer = null;
    game.on('hud', (h) => this.update(h));
    game.on('feed', (m) => this.feed(m.text, m.kind));
    game.on('vote', (v) => this.renderVote(v));
    game.on('checkpoint', (e) => this.toast(`${t('stage')} ${e.stage + 1} · ${formatTime(e.ticks)}`, 'cp'));
    game.on('finish', (e) => this.toast(`${t('finished')} · ${formatTime(e.ticks)}`, 'finish'));
    game.on('boost', () => this.flash());
    game.on('roster', () => this.renderScoreboard());
    game.on('records', () => this.renderScoreboard());
    game.on('map', (m) => { $('#hud-map').textContent = m.display_name; this.renderScoreboard(); });
    window.addEventListener('gz-settings', () => this.applyScale());
    this.applyScale();
    setInterval(() => this.tickSlow(), 250);
  }

  applyScale() {
    document.documentElement.style.setProperty('--hud-scale', String(settings.hudScale));
    show('#hud-keys', settings.showKeys);
  }

  setVisible(on) { show(this.root, on); }

  update(h) {
    const g = this.game;
    // speed
    const sp = Math.round(h.speed || 0);
    $('#hud-speed-num').textContent = sp;
    const pct = Math.min(100, (sp / 3000) * 100);
    $('#hud-speed-bar').style.width = pct + '%';
    const delta = sp - this.lastSpeed;
    this.lastSpeed = sp;
    $('#hud-speed').classList.toggle('gain', delta > 1);
    $('#hud-speed').classList.toggle('loss', delta < -3);

    // timer
    const total = g.map ? g.map.stages.length : 1;
    let state = '';
    if (h.runState === 'running') state = t('running');
    else if (h.runState === 'ready') state = t('ready');
    else if (h.runState === 'finished') state = t('finished');
    else state = t('startZone');
    $('#hud-time').textContent = h.runState === 'finished' && h.finishTicks ? formatTime(h.finishTicks) : formatTime(Math.floor(h.runTicks || 0));
    $('#hud-time').classList.toggle('done', h.runState === 'finished');
    $('#hud-state').textContent = state;
    $('#hud-stage').textContent = `${t('stage')} ${Math.min(total, (h.stage || 0) + 1)}/${total}`;

    // spectator banner
    if (h.spec) {
      show('#hud-spec', true);
      const modeName = h.spec.mode === 'first' ? t('firstPerson') : h.spec.mode === 'chase' ? t('chase') : t('freeCam');
      html('#hud-spec', `<div class="spec-title">${t('spectating')} ${h.name ? '<b>' + esc(h.name) + '</b>' : ''} <span class="pill">${modeName}</span></div><div class="spec-hint">${h.spec.hasTarget || h.spec.mode === 'free' ? t('specHint') : t('noPlayers') + ' · ' + t('specHint')}</div>`);
      show('#hud-speed', !!h.name && h.spec.mode !== 'free');
      show('#hud-timer', !!h.name && h.spec.mode !== 'free');
    } else {
      show('#hud-spec', false);
      show('#hud-speed', true);
      show('#hud-timer', true);
    }
    show('#crosshair', !h.spec || h.spec.mode === 'first');

    // debug
    if (h.debug) {
      const d = h.debug;
      show('#hud-debug', true);
      const f = (v) => v ? `${v.x.toFixed(1)} ${v.y.toFixed(1)} ${v.z.toFixed(1)}` : '-';
      html('#hud-debug', `<b>PHYSICS DEBUG</b><br>mode ${d.mode} · ground ${d.onGround}<br>pos ${f(d.pos)}<br>vel ${f(d.vel)} (${Math.hypot(d.vel.x, d.vel.y, d.vel.z).toFixed(0)})<br>normal ${f(d.normal)}<br>traces/frame ${d.traces} · pending ${d.pending}<br>rtt ${d.rtt.toFixed(0)} ms · cmd ${d.tick}<br><span style="color:#00ff88">■</span> velocity <span style="color:#ff3366">■</span> surface normal <span style="color:#33aaff">■</span> wish dir`);
    } else show('#hud-debug', false);
  }

  tickSlow() {
    const g = this.game;
    if (g.mode !== 'play') return;
    const v = g.vote;
    if (v && v.state === 'changing') $('#hud-timeleft').textContent = `${t('changing')} ${mapName(v.map)} · ${fmtClock(v.at - performance.now())}`;
    else $('#hud-timeleft').textContent = g.voting === false ? '' : `${t('timeLeft')} ${fmtClock(g.getTimeLeft())}`;
    const me = g.roster.get(g.myId);
    $('#hud-pb').textContent = me && me.best ? `${t('pb')} ${formatTime(me.best)}` : '';
    $('#hud-best').textContent = g.records && g.records[0] ? `${t('best')} ${formatTime(g.records[0].ticks)} · ${g.records[0].name}` : '';
    $('#hud-net').textContent = `${g.room || ''} · ${Math.round(g.rtt)} ms`;
    if (v && v.state === 'voting') this.renderVoteTimer(v);
    // feed expiry
    const now = performance.now();
    let changed = false;
    this.feedItems = this.feedItems.filter((f) => { if (now - f.at > 9000) { f.el.remove(); changed = true; return false; } return true; });
    if (changed) { /* nothing else */ }
  }

  feed(text, kind = 'info') {
    const el = document.createElement('div');
    el.className = 'feed-item ' + kind;
    el.textContent = text;
    $('#hud-feed').appendChild(el);
    this.feedItems.push({ el, at: performance.now() });
    while (this.feedItems.length > 6) this.feedItems.shift().el.remove();
  }

  toast(text, kind = '') {
    const el = $('#hud-toast');
    el.className = 'toast show ' + kind;
    el.textContent = text;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { el.className = 'toast'; }, 2200);
  }

  flash() {
    if (settings.reduceMotion) return;
    const el = $('#hud-flash');
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
  }

  renderVote(v) {
    const box = $('#hud-vote');
    if (!v || v.state === 'playing') {
      const g = this.game;
      if (v && v.rtv && g.voting !== false) {
        show(box, true);
        html(box, `<div class="vote-mini">${t('rtvStatus')}: <b>${v.rtv}/${v.needed || '?'}</b> <span class="key">V</span></div>`);
      } else show(box, false);
      return;
    }
    show(box, true);
    if (v.state === 'changing') {
      html(box, `<div class="vote-title">${t('changing')}</div><div class="vote-result">${esc(mapName(v.map))}</div>`);
      return;
    }
    const total = v.counts.reduce((a, b) => a + b, 0) || 1;
    const rows = v.options.map((o, i) => {
      const name = o === EXTEND ? t('extend') : mapName(o);
      const won = v.state === 'ended' && v.result === o;
      return `<div class="vote-row ${v.mine === i ? 'mine' : ''} ${won ? 'won' : ''}"><span class="key">${i + 1}</span><span class="vote-name">${esc(name)}</span><span class="vote-count">${v.counts[i]}</span><div class="vote-bar" style="width:${(v.counts[i] / total) * 100}%"></div></div>`;
    }).join('');
    html(box, `<div class="vote-title">${t('voteTitle')} <span id="vote-timer"></span></div>${rows}<div class="vote-hint">${t('voteHint')}</div>`);
    this.renderVoteTimer(v);
  }

  renderVoteTimer(v) {
    const el = $('#vote-timer');
    if (el && v.endsAt) el.textContent = fmtClock(v.endsAt - performance.now());
  }

  renderScoreboard() {
    const g = this.game;
    if (!g.roster) return;
    const players = [...g.roster.values()];
    const surfers = players.filter((p) => !p.spec).sort((a, b) => (a.best ?? 1e12) - (b.best ?? 1e12));
    const specs = players.filter((p) => p.spec);
    const rows = surfers.map((p, i) => {
      const col = p.knife ? getCollectible(p.knife) : null;
      return `<tr class="${p.id === g.myId ? 'me' : ''}"><td>${i + 1}</td><td>${esc(p.name)}</td><td>${p.best ? formatTime(p.best) : '-'}</td><td class="dim">${col ? esc(col.display_name) : 'Ranger | Factory'}</td><td>${p.ping ?? '-'}</td></tr>`;
    }).join('');
    const recs = (g.records || []).slice(0, 5).map((r, i) => `<li><span>${i + 1}. ${esc(r.name)}</span><b>${formatTime(r.ticks)}</b></li>`).join('');
    html('#scoreboard', `<div class="sb-head"><div><div class="sb-title">${esc(g.map ? g.map.display_name : '')}</div><div class="dim">${esc(g.room || '')}</div></div><div class="dim">${players.length} ${t('players')}</div></div>
      <div class="sb-body"><table><thead><tr><th>#</th><th>${t('name')}</th><th>${t('pb')}</th><th>${t('knife')}</th><th>${t('ping')}</th></tr></thead><tbody>${rows || `<tr><td colspan="5" class="dim">${t('noPlayers')}</td></tr>`}</tbody></table>
      <div class="sb-side"><div class="sb-sub">TOP 5</div><ol class="records">${recs || '<li class="dim">-</li>'}</ol>
      ${specs.length ? `<div class="sb-sub">${t('spectateMode')}</div><div class="dim">${specs.map((s) => esc(s.name)).join(', ')}</div>` : ''}</div></div>`);
  }
}
