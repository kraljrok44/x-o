import { CHARACTERS } from '../player/CharacterDefinition';
import { credit } from '../economy/Wallet';
import type { PlayerProfile } from '../economy/Profile';
import { levelForXp, rewardForLevel, type LevelReward } from './LevelProgression';

/**
 * Adds XP and applies level-up rewards. XP is never sold: it only comes
 * from playing, quests and achievements.
 */
export function addXp(profile: PlayerProfile, amount: number): LevelReward[] {
  if (amount <= 0) return [];
  const before = profile.level;
  profile.xp += Math.floor(amount);
  const after = levelForXp(profile.xp);
  const rewards: LevelReward[] = [];
  for (let l = before + 1; l <= after; l++) {
    const r = rewardForLevel(l);
    credit(profile, 'coins', r.coins);
    if (r.gems) credit(profile, 'gems', r.gems);
    for (const c of r.characters) if (!profile.characters.includes(c)) profile.characters.push(c);
    rewards.push(r);
  }
  profile.level = after;
  // Characters whose unlock level was passed (e.g. after a config change) are granted too.
  for (const c of Object.values(CHARACTERS)) {
    if (c.unlock !== 'starter' && profile.level >= c.unlock.level && !profile.characters.includes(c.id)) profile.characters.push(c.id);
  }
  return rewards;
}
