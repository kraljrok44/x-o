import { TRACK_IDS } from '../game/TrackManager';
import { EconomyError } from '../economy/EconomyError';
import type { PlayerProfile } from '../economy/Profile';

export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  target: number;
  /** Reads current progress from the profile. */
  progress: (p: PlayerProfile) => number;
  reward: { coins: number; gems: number; xp: number };
}

/**
 * Milestones with clear conditions. Each one points at a different part of
 * the game rather than asking for mindless repetition.
 */
export const ACHIEVEMENTS: AchievementDefinition[] = [
  { id: 'ach_first_finish', name: 'First Steps', description: 'Finish your first race.', target: 1, progress: (p) => p.stats.finishes, reward: { coins: 50, gems: 0, xp: 5 } },
  { id: 'ach_first_win', name: 'Front Runner', description: 'Win a race.', target: 1, progress: (p) => p.stats.wins, reward: { coins: 100, gems: 10, xp: 10 } },
  { id: 'ach_wins_25', name: 'Trophy Shelf', description: 'Win 25 races.', target: 25, progress: (p) => p.stats.wins, reward: { coins: 400, gems: 30, xp: 30 } },
  { id: 'ach_jumps_100', name: 'Springy', description: 'Jump 100 times.', target: 100, progress: (p) => p.stats.jumps, reward: { coins: 60, gems: 0, xp: 5 } },
  { id: 'ach_jumps_1000', name: 'Pogo Pro', description: 'Jump 1,000 times.', target: 1000, progress: (p) => p.stats.jumps, reward: { coins: 250, gems: 15, xp: 20 } },
  { id: 'ach_abilities_50', name: 'Trickster', description: 'Use 50 abilities.', target: 50, progress: (p) => p.stats.abilitiesUsed, reward: { coins: 120, gems: 0, xp: 10 } },
  { id: 'ach_abilities_500', name: 'Trick Shot', description: 'Use 500 abilities.', target: 500, progress: (p) => p.stats.abilitiesUsed, reward: { coins: 400, gems: 25, xp: 30 } },
  { id: 'ach_podium_streak', name: 'Consistent', description: 'Finish in the top 3 in 3 races in a row.', target: 3, progress: (p) => p.stats.bestPodiumStreak, reward: { coins: 150, gems: 0, xp: 10 } },
  { id: 'ach_daily_sweep', name: 'Busy Day', description: 'Complete all daily quests in one day.', target: 1, progress: (p) => p.stats.dailyQuestSweeps, reward: { coins: 100, gems: 5, xp: 10 } },
  { id: 'ach_level_5', name: 'Rising Star', description: 'Reach account level 5.', target: 5, progress: (p) => p.level, reward: { coins: 100, gems: 10, xp: 0 } },
  { id: 'ach_level_10', name: 'Seasoned Sprinter', description: 'Reach account level 10.', target: 10, progress: (p) => p.level, reward: { coins: 200, gems: 20, xp: 0 } },
  { id: 'ach_level_20', name: 'Legend of the Lanes', description: 'Reach account level 20.', target: 20, progress: (p) => p.level, reward: { coins: 400, gems: 40, xp: 0 } },
  { id: 'ach_collector_10', name: 'Collector', description: 'Own 10 cosmetic items.', target: 10, progress: (p) => p.inventory.length, reward: { coins: 150, gems: 0, xp: 10 } },
  { id: 'ach_collector_25', name: 'Curator', description: 'Own 25 cosmetic items.', target: 25, progress: (p) => p.inventory.length, reward: { coins: 300, gems: 20, xp: 20 } },
  { id: 'ach_glimmers_1000', name: 'Gold Rush', description: 'Collect 1,000 gold nuggets.', target: 1000, progress: (p) => p.stats.glimmers, reward: { coins: 200, gems: 10, xp: 15 } },
  { id: 'ach_all_tracks', name: 'Explorer', description: 'Finish every hand-made track.', target: TRACK_IDS.length, progress: (p) => p.stats.tracksFinished.filter((t) => TRACK_IDS.includes(t)).length, reward: { coins: 150, gems: 10, xp: 10 } },
  { id: 'ach_seeker_hits', name: 'Sharpshooter', description: 'Hit rivals with 25 Homing Rockets.', target: 25, progress: (p) => p.stats.hitsLanded, reward: { coins: 200, gems: 0, xp: 15 } },
];

export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Re-evaluates all achievements; returns those that just became complete. */
export function updateAchievements(profile: PlayerProfile, now: number): AchievementDefinition[] {
  const done: AchievementDefinition[] = [];
  for (const a of ACHIEVEMENTS) {
    const st = (profile.achievements[a.id] ??= { progress: 0, completedAt: null, claimed: false });
    st.progress = Math.min(a.target, a.progress(profile));
    if (st.completedAt === null && st.progress >= a.target) {
      st.completedAt = now;
      done.push(a);
    }
  }
  return done;
}

export function assertClaimable(profile: PlayerProfile, id: string): AchievementDefinition {
  const def = ACHIEVEMENT_BY_ID[id];
  if (!def) throw new EconomyError('not_found', 'Achievement not found.');
  const st = profile.achievements[id];
  if (!st || st.completedAt === null) throw new EconomyError('not_eligible', 'Achievement not completed yet.');
  if (st.claimed) throw new EconomyError('already_claimed', 'Reward already claimed.');
  return def;
}
