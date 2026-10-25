import { EconomyConfig } from '../config/EconomyConfig';
import { CHARACTERS, CHARACTER_IDS, type CharacterId } from '../player/CharacterDefinition';

/** Total XP required to reach `level` from level 1. */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += EconomyConfig.level.xpToNext(l);
  return total;
}

export function levelForXp(xp: number): number {
  let level = 1;
  let need = EconomyConfig.level.xpToNext(1);
  let rest = xp;
  while (rest >= need && level < EconomyConfig.level.cap) {
    rest -= need;
    level++;
    need = EconomyConfig.level.xpToNext(level);
  }
  return level;
}

export function levelProgress(xp: number): { level: number; into: number; needed: number } {
  const level = levelForXp(xp);
  const into = xp - totalXpForLevel(level);
  return { level, into, needed: level >= EconomyConfig.level.cap ? 0 : EconomyConfig.level.xpToNext(level) };
}

export interface LevelReward {
  level: number;
  coins: number;
  gems: number;
  characters: CharacterId[];
}

/** What reaching `level` grants. */
export function rewardForLevel(level: number): LevelReward {
  const cfg = EconomyConfig.level;
  return {
    level,
    coins: cfg.coinsPerLevel(level),
    gems: level % cfg.gemsEveryNLevels === 0 ? cfg.gemsAmount : 0,
    characters: CHARACTER_IDS.filter((c) => {
      const u = CHARACTERS[c].unlock;
      return u !== 'starter' && u.level === level;
    }),
  };
}
