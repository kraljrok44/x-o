// Leaderboards: per map best times (all-time + weekly season) and an overall points ranking.
// Weekly seasons reset every Monday 09:00 UTC (same schedule as CrazyGames leaderboards).
// Points give one comparable "higher is better" number across all maps, which is also what
// gets forwarded to the CrazyGames leaderboard (one leaderboard per game).

import { PHYS, PHYSICS_VERSION } from './config.js';
import { MAP_LIST } from './maps/index.js';
import { emptyProfile } from './crate.js';

const WEEK = 7 * 24 * 3600 * 1000;
const SEASON_REF = Date.UTC(2024, 0, 1, 9); // a Monday, 09:00 UTC
export const POINTS_BOARD = '__points';
const KEEP = 500;

export function seasonId(now = Date.now()) { return Math.floor((now - SEASON_REF) / WEEK); }
export function seasonEndsAt(now = Date.now()) { return SEASON_REF + (seasonId(now) + 1) * WEEK; }
const weeklyKey = (board, now) => `${board}__w${seasonId(now)}`;
// Record epoch: bumped when map layouts change, so old times (no longer comparable) are left
// behind and every board starts fresh. Storage keys and the profile field carry the epoch.
const EPOCH = 'e2';
const recKey = (board) => `${board}__${EPOCH}`;
const BEST = `best_${EPOCH}`;

/** Record ghost of a map (the record run's path), if the store keeps ghosts. */
export function loadGhost(store, mapId) { return store.loadGhost ? store.loadGhost(recKey(mapId)) : null; }
export function saveGhost(store, mapId, ghost) { if (store.saveGhost) store.saveGhost(recKey(mapId), ghost); }

/** All-time records of one map (current epoch). */
export function mapRecords(store, mapId) { return store.loadRecords(recKey(mapId)) || []; }

/** Points for one map: 1000 at par time, more when faster (capped at 2000). */
export function mapPoints(mapId, ticks) {
  const m = MAP_LIST.find((x) => x.id === mapId);
  if (!m || !ticks) return 0;
  const secs = ticks / PHYS.tickRate;
  return Math.round(1000 * Math.min(2, m.par / secs));
}

function upsertTime(list, entry) {
  const prev = list.find((r) => r.key === entry.key);
  if (prev && prev.ticks <= entry.ticks) return { list, improved: false, rank: list.indexOf(prev) + 1 };
  const next = list.filter((r) => r.key !== entry.key);
  next.push(entry);
  next.sort((a, b) => a.ticks - b.ticks || a.date - b.date);
  const trimmed = next.slice(0, KEEP);
  return { list: trimmed, improved: true, rank: trimmed.indexOf(entry) + 1 };
}

/**
 * Record a finished run. Returns what improved. The store is the room store
 * ({load, save, loadRecords, saveRecords}).
 */
export function submitTime(store, { key, name, mapId, ticks, mapVersion = '1.0', now = Date.now() }) {
  const entry = { key, name, ticks, date: now, map: mapId, mapVersion, physics: PHYSICS_VERSION };
  const all = upsertTime(store.loadRecords(recKey(mapId)) || [], entry);
  if (all.improved) store.saveRecords(recKey(mapId), all.list);
  const wk = weeklyKey(recKey(mapId), now);
  const week = upsertTime(store.loadRecords(wk) || [], { ...entry });
  if (week.improved) store.saveRecords(wk, week.list);

  // overall points from the player's best time on every map
  const profile = store.load(key) || emptyProfile();
  const best = { ...(profile[BEST] || {}) };
  let points = null;
  if (!best[mapId] || ticks < best[mapId]) {
    best[mapId] = ticks;
    store.save(key, { ...profile, [BEST]: best });
    const total = Object.entries(best).reduce((s, [m, t]) => s + mapPoints(m, t), 0);
    const board = (store.loadRecords(recKey(POINTS_BOARD)) || []).filter((r) => r.key !== key);
    board.push({ key, name, points: total, maps: Object.keys(best).length, date: now });
    board.sort((a, b) => b.points - a.points || a.date - b.date);
    store.saveRecords(recKey(POINTS_BOARD), board.slice(0, KEEP));
    points = total;
  }
  return { allTime: all, weekly: week, points, list: all.list };
}

/** Leaderboard rows for the UI. board = map id or POINTS_BOARD; period = 'all' | 'week'. */
export function queryBoard(store, board, period, key, limit = 50, now = Date.now()) {
  const isPoints = board === POINTS_BOARD;
  const src = store.loadRecords(isPoints || period !== 'week' ? recKey(board) : weeklyKey(recKey(board), now)) || [];
  const row = (r, i) => ({ rank: i + 1, name: r.name, value: isPoints ? r.points : r.ticks, maps: r.maps, me: r.key === key, cg: String(r.key).startsWith('cg:') });
  const list = src.slice(0, limit).map(row);
  const mine = src.findIndex((r) => r.key === key);
  return {
    board, period: isPoints ? 'all' : period, kind: isPoints ? 'points' : 'time', total: src.length,
    list, me: mine >= 0 ? row(src[mine], mine) : null, seasonEndsAt: seasonEndsAt(now),
  };
}
