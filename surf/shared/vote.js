// Map vote / rock-the-vote logic. Pure and clock-injected so it is unit-testable.
// Rules: a vote starts after GAME.mapTimeSec on a map, or early when >= 50% of the
// current players request it. Options: other maps + "extend" (+5 min).

import { GAME } from './config.js';

export const EXTEND = '__extend__';

export class MapVote {
  constructor({ mapIds, currentMap, now, rng = Math.random, cfg = GAME }) {
    this.mapIds = mapIds.slice();
    this.current = currentMap;
    this.rng = rng;
    this.cfg = cfg;
    this.state = 'playing';
    this.mapStartedAt = now;
    this.mapEndsAt = now + cfg.mapTimeSec * 1000;
    this.rtv = new Set();
    this.votes = new Map();
    this.options = [];
    this.voteEndsAt = 0;
    this.voteReason = null;
    this.nextMap = null;
    this.changeAt = 0;
    this.extendCount = 0;
  }

  rtvNeeded(playerCount) {
    return Math.max(1, Math.ceil(playerCount * this.cfg.rtvRatio));
  }

  _pickOptions() {
    const others = this.mapIds.filter((m) => m !== this.current);
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]];
    }
    return [...others.slice(0, this.cfg.voteMapOptions), EXTEND];
  }

  _startVote(now, reason, out) {
    this.state = 'voting';
    this.voteReason = reason;
    this.options = this._pickOptions();
    this.votes.clear();
    this.voteEndsAt = now + this.cfg.voteDurationSec * 1000;
    out.push({ type: 'vote_start', options: this.options.slice(), endsAt: this.voteEndsAt, reason });
  }

  _beginChange(now, mapId, out) {
    this.state = 'changing';
    this.nextMap = mapId;
    this.changeAt = now + this.cfg.mapChangeDelaySec * 1000;
    out.push({ type: 'change', mapId, at: this.changeAt });
  }

  tally() {
    const counts = this.options.map(() => 0);
    for (const v of this.votes.values()) if (v >= 0 && v < counts.length) counts[v]++;
    return counts;
  }

  /** Request an early vote. Returns {count, needed, started}. */
  requestRtv(playerId, now, playerCount, out = []) {
    if (this.state !== 'playing') return { count: this.rtv.size, needed: this.rtvNeeded(playerCount), started: false, blocked: true };
    this.rtv.add(playerId);
    const needed = this.rtvNeeded(playerCount);
    let started = false;
    if (this.rtv.size >= needed) { this._startVote(now, 'rtv', out); started = true; }
    return { count: this.rtv.size, needed, started };
  }

  castVote(playerId, option) {
    if (this.state !== 'voting') return false;
    if (!Number.isInteger(option) || option < 0 || option >= this.options.length) return false;
    this.votes.set(playerId, option);
    return true;
  }

  removePlayer(playerId, now, playerCount, out = []) {
    this.rtv.delete(playerId);
    this.votes.delete(playerId);
    // leaving players can push the remaining RTV share over the threshold
    if (this.state === 'playing' && this.rtv.size > 0 && playerCount > 0 && this.rtv.size >= this.rtvNeeded(playerCount)) {
      this._startVote(now, 'rtv', out);
    }
  }

  /** Advance timers. Returns a list of actions for the room to broadcast/apply. */
  update(now, playerCount) {
    const out = [];
    if (this.state === 'playing') {
      if (now >= this.mapEndsAt) {
        if (playerCount === 0) {
          const i = this.mapIds.indexOf(this.current);
          this._beginChange(now, this.mapIds[(i + 1) % this.mapIds.length], out);
        } else this._startVote(now, 'time', out);
      }
    } else if (this.state === 'voting') {
      if (now >= this.voteEndsAt) {
        const counts = this.tally();
        const max = Math.max(...counts);
        let winners;
        if (max === 0) winners = this.options.map((o, i) => i).filter((i) => this.options[i] !== EXTEND);
        else winners = counts.map((c, i) => i).filter((i) => counts[i] === max);
        const pick = winners[Math.floor(this.rng() * winners.length) % winners.length];
        const result = this.options[pick];
        out.push({ type: 'vote_end', result, counts });
        this.rtv.clear();
        this.votes.clear();
        if (result === EXTEND) {
          this.state = 'playing';
          this.extendCount++;
          this.mapEndsAt = Math.max(now, this.mapEndsAt) + this.cfg.extendSec * 1000;
          out.push({ type: 'extend', mapEndsAt: this.mapEndsAt });
        } else {
          this._beginChange(now, result, out);
        }
      }
    } else if (this.state === 'changing') {
      if (now >= this.changeAt) {
        this.current = this.nextMap;
        this.state = 'playing';
        this.mapStartedAt = now;
        this.mapEndsAt = now + this.cfg.mapTimeSec * 1000;
        this.extendCount = 0;
        this.rtv.clear();
        out.push({ type: 'load', mapId: this.current, mapEndsAt: this.mapEndsAt });
      }
    }
    return out;
  }
}
