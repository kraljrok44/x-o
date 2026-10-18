// Authoritative game room (spec 17). Transport agnostic: the Node server wraps it with
// WebSockets, the browser can run the very same room locally for offline practice.

import { PHYS, NET, GAME, PHYSICS_VERSION, CATALOG_VERSION } from './config.js';
import { getMap, MAP_LIST, isMapId } from './maps/index.js';
import { CollisionWorld } from './collision.js';
import { createPlayerState, stepPlayer, restartRun, copyState, EV, formatTime } from './sim.js';
import { MapVote, EXTEND } from './vote.js';
import { openCrate, equipKnife, emptyProfile, CRATE_STATUS } from './crate.js';
import { CATALOG_TOTAL, getCollectible } from './catalog.js';
import { submitTime, queryBoard, mapRecords, loadGhost, saveGhost, POINTS_BOARD } from './leaderboard.js';
import { awardXp, levelFor, rankFor } from './xp.js';

export const GHOST_EVERY = 5; // ghost samples every 5 ticks (20 per second)
import { filterChat, badName } from './chatfilter.js';
import { isMapId as isMap } from './maps/index.js';

const RUN_STATE = { idle: 0, ready: 1, running: 2, finished: 3 };
const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;

export function sanitizeName(name) {
  let n = String(name || '').replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, GAME.maxNameLength);
  if (n.length < 2 || badName(n)) n = 'Surfer' + Math.floor(Math.random() * 9000 + 1000);
  return n;
}

export class Room {
  /**
   * @param {object} o
   * @param {{load(k):object|null, save(k,p):void, loadRecords(m):Array, saveRecords(m,l):void}} o.store
   * @param {(hello:object)=>Promise<{key:string,name:string}>|{key:string,name:string}} o.auth
   * @param {string[]} [o.mapIds]
   * @param {string} [o.startMap]
   * @param {()=>number} [o.clock] milliseconds
   * @param {boolean} [o.voting] enable the 10 minute vote cycle (off for offline practice)
   */
  constructor(o) {
    this.store = o.store;
    this.auth = o.auth;
    this.clock = o.clock || (() => Date.now());
    this.log = o.log || (() => {});
    this.mapIds = o.mapIds || MAP_LIST.map((m) => m.id);
    this.voting = o.voting !== false;
    this.onPoints = o.onPoints || (() => {}); // e.g. forward to the CrazyGames leaderboard
    // server-wide announcements (knife unlocks); default: only this room's chat
    this.onAnnounce = o.onAnnounce || ((text, kind) => this.chatSystem(text, kind));
    this.maxPlayers = o.maxPlayers || NET.maxPlayersPerRoom;
    this.name = o.name || 'GLIDEZONE #1';
    this.clients = new Map();
    this.nextId = 1;
    this.tickNo = 0;
    this.vote = new MapVote({ mapIds: this.mapIds, currentMap: o.startMap || this.mapIds[0], now: this.clock() });
    this._loadMap(this.vote.current);
    this.lastAdvance = null;
  }

  _loadMap(id) {
    this.map = getMap(id);
    this.world = new CollisionWorld(this.map.brushes);
    this.records = this.store.loadRecords ? mapRecords(this.store, id) : [];
    this.ghost = loadGhost(this.store, id);
    for (const c of this.clients.values()) {
      c.ps = createPlayerState(this.map);
      c.cmdQueue.length = 0;
      c.rtvd = false;
    }
  }

  // ---------------------------------------------------------------- connections
  addClient(conn) {
    const c = {
      id: this.nextId++, conn, name: null, key: null, ready: false, spectator: false,
      ps: null, cmdQueue: [], budget: 0, lastSeq: -1, profile: null, joinedAt: this.clock(), ping: 0,
      msgCount: 0, msgWindow: this.clock(),
    };
    this.clients.set(c.id, c);
    return c;
  }

  removeClient(c) {
    if (!this.clients.has(c.id)) return;
    this.clients.delete(c.id);
    if (c.ready) {
      const out = [];
      this.vote.removePlayer(c.id, this.clock(), this.playerCount(), out);
      this._applyVoteActions(out);
      this.broadcast({ t: 'left', id: c.id });
      this.feed(`${c.name} left`);
    }
  }

  playerCount() {
    let n = 0;
    for (const c of this.clients.values()) if (c.ready) n++;
    return n;
  }

  send(c, msg) {
    try { c.conn.send(msg); } catch (e) { /* connection gone */ }
  }

  broadcast(msg, except) {
    for (const c of this.clients.values()) if (c.ready && c !== except) this.send(c, msg);
  }

  feed(text, kind = 'info') {
    this.broadcast({ t: 'feed', text, kind });
  }

  rosterEntry(c) {
    const best = this.records.find((r) => r.key === c.key);
    const prof = c.profile || emptyProfile();
    const lvl = levelFor(prof.xp || 0);
    return { id: c.id, name: c.name, spec: c.spectator, knife: prof.equipped, best: best ? best.ticks : null, ping: c.ping, lvl, rank: rankFor(lvl).short };
  }

  async handleMessage(c, msg) {
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
    // crude flood protection
    const now = this.clock();
    if (now - c.msgWindow > 1000) { c.msgWindow = now; c.msgCount = 0; }
    if (++c.msgCount > 400) return;

    if (msg.t === 'hello') return this._hello(c, msg);
    if (!c.ready) return;
    switch (msg.t) {
      case 'cmds': return this._cmds(c, msg);
      case 'ping': c.ping = Math.max(0, Math.min(999, msg.rtt | 0)); return this.send(c, { t: 'pong', t0: msg.t0, tick: this.tickNo });
      case 'spectate': return this._spectate(c, !!msg.on);
      case 'rtv': return this._rtv(c);
      case 'vote': {
        if (this.vote.castVote(c.id, msg.i | 0)) this.broadcast({ t: 'vote_update', counts: this.vote.tally() });
        return;
      }
      case 'equip': {
        const id = msg.id === null ? null : String(msg.id);
        if (equipKnife(this.store, c.key, id)) {
          c.profile = this.store.load(c.key) || emptyProfile();
          this.send(c, { t: 'inventory', owned: c.profile.owned, equipped: c.profile.equipped, total: CATALOG_TOTAL, xp: c.profile.xp || 0, freeCrates: c.profile.freeCrates || 0 });
          this.broadcast({ t: 'pinfo', p: this.rosterEntry(c) });
        }
        return;
      }
      case 'crate': return this._crate(c, msg);
      case 'chat': return this._chat(c, msg);
      case 'inventory':
        c.profile = this.store.load(c.key) || emptyProfile();
        return this.send(c, { t: 'inventory', owned: c.profile.owned, equipped: c.profile.equipped, total: CATALOG_TOTAL, xp: c.profile.xp || 0, freeCrates: c.profile.freeCrates || 0 });
      case 'leaderboard': {
        const board = msg.board === POINTS_BOARD ? POINTS_BOARD : isMap(msg.board) ? msg.board : this.map.id;
        const period = msg.period === 'week' ? 'week' : 'all';
        return this.send(c, { t: 'leaderboard', req: msg.req, ...queryBoard(this.store, board, period, c.key) });
      }
      case 'records':
        return this.send(c, { t: 'records', map: this.map.id, list: this.records.slice(0, 10).map((r) => ({ name: r.name, ticks: r.ticks })) });
      default:
        return;
    }
  }

  async _hello(c, msg) {
    if (c.ready || c.authing) return;
    if (this.playerCount() >= this.maxPlayers) { this.send(c, { t: 'full' }); return; }
    c.authing = true;
    let who;
    try { who = await this.auth(msg); } catch (e) { who = null; }
    c.authing = false;
    if (!who || !this.clients.has(c.id)) { this.send(c, { t: 'error', text: 'auth failed' }); return; }
    // one connection per profile: drop the older session
    for (const o of this.clients.values()) {
      if (o !== c && o.ready && o.key === who.key) { this.send(o, { t: 'kicked', text: 'Logged in elsewhere' }); this.removeClient(o); try { o.conn.close(); } catch (e) { /* */ } }
    }
    c.key = who.key;
    c.name = sanitizeName(who.name || msg.name);
    c.profile = this.store.load(c.key) || emptyProfile();
    c.spectator = !!msg.spectate;
    c.ps = createPlayerState(this.map);
    c.ready = true;
    this.send(c, this._welcome(c));
    if (this.ghost) this.send(c, { t: 'ghost', map: this.map.id, ...this.ghost });
    this.broadcast({ t: 'joined', p: this.rosterEntry(c) }, c);
    this.feed(`${c.name} joined`);
  }

  _welcome(c) {
    const now = this.clock();
    return {
      t: 'welcome', id: c.id, room: this.name, tick: this.tickNo, tickRate: PHYS.tickRate,
      physics: PHYSICS_VERSION, catalog: CATALOG_VERSION,
      map: this.map.id, maps: this.mapIds, timeLeft: Math.max(0, this.vote.mapEndsAt - now), voting: this.voting,
      roster: [...this.clients.values()].filter((o) => o.ready).map((o) => this.rosterEntry(o)),
      inventory: { owned: c.profile.owned, equipped: c.profile.equipped, total: CATALOG_TOTAL, xp: c.profile.xp || 0, freeCrates: c.profile.freeCrates || 0 },
      vote: this._voteState(now),
      records: this.records.slice(0, 10).map((r) => ({ name: r.name, ticks: r.ticks })),
      me: copyState(c.ps), spectator: c.spectator,
    };
  }

  _voteState(now) {
    const v = this.vote;
    if (v.state === 'voting') return { state: 'voting', options: v.options, counts: v.tally(), endsIn: v.voteEndsAt - now, reason: v.voteReason };
    if (v.state === 'changing') return { state: 'changing', map: v.nextMap, in: v.changeAt - now };
    return { state: 'playing', rtv: v.rtv.size, needed: v.rtvNeeded(this.playerCount()) };
  }

  _cmds(c, msg) {
    if (!Array.isArray(msg.c)) return;
    for (const a of msg.c.slice(0, 16)) {
      if (!Array.isArray(a) || a.length < 6) continue;
      const seq = a[0] | 0;
      if (seq <= c.lastSeq) continue;
      const cmd = {
        seq,
        fwd: Math.max(-1, Math.min(1, a[1] | 0)),
        side: Math.max(-1, Math.min(1, a[2] | 0)),
        buttons: a[3] & 3,
        yaw: Number.isFinite(a[4]) ? a[4] : 0,
        pitch: Number.isFinite(a[5]) ? a[5] : 0,
      };
      c.lastSeq = seq;
      if (c.cmdQueue.length < 120) c.cmdQueue.push(cmd);
    }
  }

  _spectate(c, on) {
    if (c.spectator === on) return;
    c.spectator = on;
    c.cmdQueue.length = 0;
    restartRun(c.ps, this.map);
    this.broadcast({ t: 'pinfo', p: this.rosterEntry(c) });
    this.feed(on ? `${c.name} is now spectating` : `${c.name} joined the surf`);
  }

  _rtv(c) {
    if (!this.voting) return;
    const out = [];
    const res = this.vote.requestRtv(c.id, this.clock(), this.playerCount(), out);
    if (res.blocked) return;
    if (!c.rtvd) {
      c.rtvd = true;
      this.feed(`${c.name} wants to change the map (${res.count}/${res.needed})`, 'vote');
    }
    this.broadcast({ t: 'rtv', count: res.count, needed: res.needed });
    this._applyVoteActions(out);
  }

  /** System line in the chat (knife unlocks, server notices). */
  chatSystem(text, kind = 'system') {
    this.broadcast({ t: 'chat', kind, text: String(text).slice(0, 160) });
  }

  _chat(c, msg) {
    const now = this.clock();
    if (c.mutedUntil && now < c.mutedUntil) {
      return this.send(c, { t: 'chat', kind: 'system', text: `Chat paused for ${Math.ceil((c.mutedUntil - now) / 1000)} s (too many messages).` });
    }
    // rate limit: at most 1 message per 1.2 s and 5 per 10 s, repeating the same text is ignored
    c.chatTimes = (c.chatTimes || []).filter((t) => now - t < 10000);
    if (c.chatTimes.length && now - c.chatTimes[c.chatTimes.length - 1] < 1200) return;
    if (c.chatTimes.length >= 5) { c.mutedUntil = now + 30000; return this._chat(c, msg); }
    const raw = String(msg.text || '');
    const cmd = raw.trim().toLowerCase();
    if (cmd === 'rtv' || cmd === '!rtv' || cmd === '/rtv') return this._rtv(c);
    const { text, empty } = filterChat(raw);
    if (empty) return;
    if (text === c.lastChat) return;
    c.lastChat = text;
    c.chatTimes.push(now);
    this.broadcast({ t: 'chat', kind: c.spectator ? 'spec' : 'player', id: c.id, name: c.name, rank: rankFor(levelFor((c.profile && c.profile.xp) || 0)).short, text });
  }

  _crate(c, msg) {
    const res = openCrate(this.store, c.key, String(msg.key || ''), { now: this.clock(), free: !!msg.free });
    c.profile = this.store.load(c.key) || emptyProfile();
    this.send(c, { t: 'crate', key: msg.key, ...res });
    if (res.status === CRATE_STATUS.SUCCESS && !res.replay) {
      const col = getCollectible(res.collectible_id);
      this.onAnnounce(`${c.name} opened the Glide Vault and unlocked ${col ? col.display_name : 'a knife'}!`, 'knife');
    }
  }

  _applyVoteActions(actions) {
    const now = this.clock();
    for (const a of actions) {
      switch (a.type) {
        case 'vote_start':
          this.broadcast({ t: 'vote_start', options: a.options, endsIn: a.endsAt - now, reason: a.reason });
          this.feed(a.reason === 'rtv' ? 'Map vote started (players requested it)' : 'Time is up - vote for the next map', 'vote');
          break;
        case 'vote_end':
          this.broadcast({ t: 'vote_end', result: a.result, counts: a.counts });
          break;
        case 'extend':
          this.broadcast({ t: 'extend', timeLeft: a.mapEndsAt - now });
          this.feed('Map extended by 5 minutes', 'vote');
          break;
        case 'change':
          this.broadcast({ t: 'change', map: a.mapId, in: a.at - now });
          this.feed(`Changing map to ${a.mapId}`, 'vote');
          break;
        case 'load':
          this._loadMap(a.mapId);
          for (const c of this.clients.values()) {
            if (!c.ready) continue;
            c.profile = this.store.load(c.key) || c.profile;
            this.send(c, { t: 'map', map: this.map.id, timeLeft: a.mapEndsAt - now, me: copyState(c.ps), records: this.records.slice(0, 10).map((r) => ({ name: r.name, ticks: r.ticks })) });
            this.send(c, this.ghost ? { t: 'ghost', map: this.map.id, ...this.ghost } : { t: 'ghost', map: this.map.id, frames: null });
          }
          this.broadcast({ t: 'roster', roster: [...this.clients.values()].filter((o) => o.ready).map((o) => this.rosterEntry(o)) });
          break;
        default:
          break;
      }
    }
  }

  /** Offline practice: switch map immediately (local room only). */
  forceMap(id) {
    if (!isMapId(id)) return;
    this.vote.current = id;
    this.vote.state = 'playing';
    this.vote.mapEndsAt = this.clock() + GAME.mapTimeSec * 1000;
    this._applyVoteActions([{ type: 'load', mapId: id, mapEndsAt: this.vote.mapEndsAt }]);
  }

  _onFinish(c, ev) {
    const ticks = ev.ticks;
    const time = formatTime(ticks);
    const prevAll = mapRecords(this.store, this.map.id).find((r) => r.key === c.key);
    const res = submitTime(this.store, { key: c.key, name: c.name, mapId: this.map.id, ticks, mapVersion: this.map.version, now: Date.now() });
    this.records = res.list;
    if (res.allTime.improved) {
      const rank = res.allTime.rank;
      this.feed(`${c.name} finished in ${time} - new personal best! (#${rank})`, rank === 1 ? 'record' : 'pb');
      // a new map record is announced in the chat of every server room
      if (rank === 1) {
        this.onAnnounce(`🏆 ${c.name} set a new record on ${this.map.display_name}: ${time}`, 'record');
        if (c.path && c.path.length > 10) {
          this.ghost = { name: c.name, ticks, every: GHOST_EVERY, frames: c.path };
          saveGhost(this.store, this.map.id, this.ghost);
          this.broadcast({ t: 'ghost', map: this.map.id, ...this.ghost });
        }
      }
      this.broadcast({ t: 'pinfo', p: this.rosterEntry(c) });
      this.broadcast({ t: 'records', map: this.map.id, list: this.records.slice(0, 10).map((r) => ({ name: r.name, ticks: r.ticks })) });
    } else {
      this.feed(`${c.name} finished in ${time} (+${formatTime(ticks - prevAll.ticks)})${res.weekly.improved ? ' - weekly best!' : ''}`, 'finish');
    }
    if (res.points !== null) this.onPoints(c.key, res.points, c.name);
    this._awardXp(c, res);
  }

  /** XP for a completion: first time on the map, plain run, personal best or map record. */
  _awardXp(c, res) {
    const prof = this.store.load(c.key) || emptyProfile();
    const doneKey = `${this.map.id}@${this.map.version}`;
    const done = prof.completed || {};
    const record = res.allTime.improved && res.allTime.rank === 1;
    const kind = record ? 'record' : !done[doneKey] ? 'first' : res.allTime.improved ? 'pb' : 'normal';
    const aw = awardXp({ ...prof, completed: { ...done, [doneKey]: (done[doneKey] || 0) + 1 } }, kind);
    this.store.save(c.key, aw.profile);
    c.profile = aw.profile;
    this.send(c, { t: 'xp', kind, gained: aw.gained, mult: aw.mult, xp: aw.xp, level: aw.level, prevLevel: aw.prevLevel, freeCrates: aw.profile.freeCrates || 0, newCrates: aw.freeCrates });
    if (aw.level > aw.prevLevel) {
      const r0 = rankFor(aw.prevLevel), r1 = rankFor(aw.level);
      this.feed(`${c.name} reached level ${aw.level}${r1 !== r0 ? ` and was promoted to ${r1.name}!` : '!'}`, 'pb');
      this.broadcast({ t: 'pinfo', p: this.rosterEntry(c) });
    }
  }

  // ---------------------------------------------------------------- simulation
  tick() {
    this.tickNo++;
    if (this.voting) {
      const actions = this.vote.update(this.clock(), this.playerCount());
      if (actions.length) this._applyVoteActions(actions);
    }
    const ctx = { world: this.world, map: this.map };
    const events = [];
    for (const c of this.clients.values()) {
      if (!c.ready || c.spectator) continue;
      c.budget = Math.min(NET.maxCmdBudget, c.budget + 1);
      c.alive = (c.alive || 0) + 1;
      c.processed = c.processed || 0;
      // Drain a growing backlog (client clock slightly fast / bursty network) instead of letting
      // latency grow until commands get dropped (= rubber banding). The total is still capped
      // by wall time, so a speed hack gains at most ~0.3 s.
      if (c.cmdQueue.length > 6 && c.processed < c.alive + 30) c.budget += 1;
      while (c.budget >= 1 && c.cmdQueue.length) {
        const cmd = c.cmdQueue.shift();
        c.budget -= 1;
        c.processed++;
        events.length = 0;
        stepPlayer(c.ps, cmd, ctx, events);
        // record the run's path for a possible record ghost
        if (events.some((e) => e.type === EV.START)) c.path = [];
        if (c.ps.runState === 'running' && c.path && c.ps.runTicks % GHOST_EVERY === 0) {
          const p = c.ps.pos;
          c.path.push([Math.round(p.x), Math.round(p.y), Math.round(p.z), Math.round(c.ps.yaw * 100) / 100]);
        }
        c.ack = cmd.seq;
        for (const e of events) if (e.type === EV.FINISH) this._onFinish(c, e);
      }
    }
    if (this.tickNo % NET.snapshotEveryTicks === 0) this._snapshot();
  }

  _snapshot() {
    const list = [];
    for (const c of this.clients.values()) {
      if (!c.ready || c.spectator) continue;
      const p = c.ps;
      list.push([c.id, r1(p.pos.x), r1(p.pos.y), r1(p.pos.z), r1(p.vel.x), r1(p.vel.y), r1(p.vel.z),
        r3(p.yaw), r3(p.pitch), p.mode, p.stage, RUN_STATE[p.runState] ?? 0, p.runTicks, p.tpSeq]);
    }
    const now = this.clock();
    const timeLeft = this.vote.state === 'playing' ? Math.max(0, this.vote.mapEndsAt - now) : 0;
    for (const c of this.clients.values()) {
      if (!c.ready) continue;
      const msg = { t: 's', k: this.tickNo, p: list, tl: timeLeft };
      if (!c.spectator) { msg.a = c.ack ?? -1; msg.me = copyState(c.ps); }
      this.send(c, msg);
    }
  }

  /** Run as many fixed ticks as wall time requires (host loop helper). */
  advance(nowMs) {
    const step = 1000 / PHYS.tickRate;
    if (this.lastAdvance === null) this.lastAdvance = nowMs;
    let n = 0;
    while (nowMs - this.lastAdvance >= step && n < 25) {
      this.tick();
      this.lastAdvance += step;
      n++;
    }
    if (nowMs - this.lastAdvance > 250) this.lastAdvance = nowMs; // host stalled, drop time
  }
}

export { EXTEND };
