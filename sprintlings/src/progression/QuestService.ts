import { Rng, hashString } from '../shared/Rng';
import { DAY_MS, dayKey, startOfUtcDay } from '../shared/time';
import { EconomyConfig } from '../config/EconomyConfig';
import type { RacerStats } from '../game/RaceState';
import { EconomyError } from '../economy/EconomyError';
import type { PlayerProfile, QuestState } from '../economy/Profile';

/** What a finished race contributes to quests, achievements and stats. */
export interface RaceOutcome {
  raceId: string;
  trackId: string;
  mode: 'race' | 'practice' | 'remix';
  /** 1-based place. */
  place: number;
  racerCount: number;
  finished: boolean;
  finishTime: number | null;
  stats: RacerStats;
}

type Metric = 'finishes' | 'hurdles' | 'abilities' | 'glimmers' | 'podiums' | 'wins' | 'hitsLanded' | 'cleanFinishes' | 'shieldBlocks' | 'itemBoxes';

interface QuestTemplate {
  id: string;
  metric: Metric;
  targets: number[];
  text: (n: number) => string;
  coins: number;
  xp: number;
  seasonPoints: number;
}

/** Varied quests that reward different play styles; none require spending. */
export const QUEST_TEMPLATES: QuestTemplate[] = [
  { id: 'q_finish', metric: 'finishes', targets: [3, 5], text: (n) => `Finish ${n} races`, coins: 60, xp: 10, seasonPoints: 40 },
  { id: 'q_hurdles', metric: 'hurdles', targets: [10, 20], text: (n) => `Jump over ${n} obstacles`, coins: 50, xp: 8, seasonPoints: 40 },
  { id: 'q_abilities', metric: 'abilities', targets: [5, 8], text: (n) => `Use abilities ${n} times`, coins: 50, xp: 8, seasonPoints: 40 },
  { id: 'q_glimmers', metric: 'glimmers', targets: [60, 120], text: (n) => `Collect ${n} gold nuggets`, coins: 60, xp: 8, seasonPoints: 40 },
  { id: 'q_podium', metric: 'podiums', targets: [2], text: () => 'Finish in the top 3 twice', coins: 80, xp: 12, seasonPoints: 60 },
  { id: 'q_win', metric: 'wins', targets: [1], text: () => 'Win a race', coins: 100, xp: 15, seasonPoints: 80 },
  { id: 'q_seeker', metric: 'hitsLanded', targets: [2], text: () => 'Hit rivals with Homing Rockets twice', coins: 70, xp: 10, seasonPoints: 50 },
  { id: 'q_clean', metric: 'cleanFinishes', targets: [1, 2], text: (n) => (n === 1 ? 'Finish a race without falling' : `Finish ${n} races without falling`), coins: 60, xp: 10, seasonPoints: 50 },
  { id: 'q_block', metric: 'shieldBlocks', targets: [2], text: () => 'Block 2 hits with a Tin Star Shield', coins: 70, xp: 10, seasonPoints: 50 },
  { id: 'q_boxes', metric: 'itemBoxes', targets: [6, 10], text: (n) => `Open ${n} loot crates`, coins: 50, xp: 8, seasonPoints: 40 },
];

const TEMPLATE_BY_ID = Object.fromEntries(QUEST_TEMPLATES.map((t) => [t.id, t]));

function metricValue(metric: Metric, o: RaceOutcome): number {
  switch (metric) {
    case 'finishes':
      return o.finished ? 1 : 0;
    case 'hurdles':
      return o.stats.hurdlesCleared;
    case 'abilities':
      return o.stats.abilitiesUsed;
    case 'glimmers':
      return o.stats.glimmers;
    case 'podiums':
      return o.finished && o.place <= 3 && o.racerCount > 1 ? 1 : 0;
    case 'wins':
      return o.finished && o.place === 1 && o.racerCount > 1 ? 1 : 0;
    case 'hitsLanded':
      return o.stats.hitsLanded;
    case 'cleanFinishes':
      return o.finished && o.stats.falls === 0 ? 1 : 0;
    case 'shieldBlocks':
      return o.stats.shieldBlocks;
    case 'itemBoxes':
      return o.stats.itemBoxes;
  }
}

function makeQuest(t: QuestTemplate, target: number, day: number, index: number): QuestState {
  return {
    id: `${dayKey(day)}:${t.id}:${index}`,
    templateId: t.id,
    description: t.text(target),
    target,
    progress: 0,
    reward: { coins: t.coins + (target > t.targets[0] ? 20 : 0), xp: t.xp, seasonPoints: t.seasonPoints },
    startsAt: day,
    expiresAt: day + DAY_MS,
    status: 'active',
  };
}

export interface QuestRefreshResult {
  /** Completed-but-unclaimed quests from the previous day, granted automatically. */
  autoClaimed: QuestState[];
}

/**
 * Makes sure today's quests exist. Uses the authority's clock (server time
 * online). Unclaimed completed quests from an expired day are paid out
 * automatically so nothing earned is lost.
 */
export function refreshQuests(profile: PlayerProfile, now: number): QuestRefreshResult {
  const today = dayKey(now);
  const autoClaimed: QuestState[] = [];
  if (profile.quests.day === today && profile.quests.list.length) return { autoClaimed };
  for (const q of profile.quests.list) if (q.status === 'completed') autoClaimed.push(q);
  const dayStart = startOfUtcDay(now);
  const rng = new Rng(hashString(`${profile.id}:${today}`));
  const pool = rng.shuffle([...QUEST_TEMPLATES]);
  const list: QuestState[] = [];
  for (const t of pool) {
    if (list.length >= EconomyConfig.quests.activeCount) break;
    list.push(makeQuest(t, rng.pick(t.targets), dayStart, list.length));
  }
  profile.quests = { day: today, list, rerollsUsed: 0, sweptDay: null };
  return { autoClaimed };
}

/** Adds a race's contribution; returns quests that just became completed. */
export function applyRaceToQuests(profile: PlayerProfile, o: RaceOutcome, now: number): QuestState[] {
  const done: QuestState[] = [];
  for (const q of profile.quests.list) {
    if (q.status !== 'active' || now >= q.expiresAt) continue;
    const t = TEMPLATE_BY_ID[q.templateId];
    if (!t) continue;
    q.progress = Math.min(q.target, q.progress + metricValue(t.metric, o));
    if (q.progress >= q.target) {
      q.status = 'completed';
      done.push(q);
    }
  }
  return done;
}

export function findQuest(profile: PlayerProfile, questId: string): QuestState {
  const q = profile.quests.list.find((x) => x.id === questId);
  if (!q) throw new EconomyError('not_found', 'Quest not found.');
  return q;
}

/** Swaps one active quest for a different one (free once per day). */
export function rerollQuest(profile: PlayerProfile, questId: string, now: number): QuestState {
  const q = findQuest(profile, questId);
  if (q.status !== 'active') throw new EconomyError('not_eligible', 'Only active quests can be swapped.');
  if (profile.quests.rerollsUsed >= EconomyConfig.quests.freeRerolls) throw new EconomyError('limit_reached', 'No quest swaps left today.');
  const used = new Set(profile.quests.list.map((x) => x.templateId));
  const rng = new Rng(hashString(`${profile.id}:${q.id}:reroll`));
  const candidates = QUEST_TEMPLATES.filter((t) => !used.has(t.id));
  const t = rng.pick(candidates);
  const idx = profile.quests.list.indexOf(q);
  const fresh = makeQuest(t, rng.pick(t.targets), startOfUtcDay(now), idx + 10);
  profile.quests.list[idx] = fresh;
  profile.quests.rerollsUsed++;
  return fresh;
}
