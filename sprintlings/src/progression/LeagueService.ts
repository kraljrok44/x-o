import { CHARACTER_IDS, type CharacterId } from '../player/CharacterDefinition';
import type { PlayerProfile } from '../economy/Profile';
import type { RaceOutcome } from './QuestService';

/** Trophy leagues (Fun Run style ranked ladder). Trophies never cost money. */
export interface League {
  id: string;
  name: string;
  icon: string;
  min: number;
  color: string;
}

export const LEAGUES: readonly League[] = [
  { id: 'tenderfoot', name: 'Tenderfoot', icon: '🥉', min: 0, color: '#b87333' },
  { id: 'wrangler', name: 'Wrangler', icon: '🥈', min: 250, color: '#a8b4c4' },
  { id: 'deputy', name: 'Deputy', icon: '🥇', min: 700, color: '#f2c14e' },
  { id: 'sheriff', name: 'Sheriff', icon: '⭐', min: 1400, color: '#ffe066' },
  { id: 'marshal', name: 'Marshal', icon: '💎', min: 2400, color: '#7fd8ff' },
  { id: 'legend', name: 'Legend of the West', icon: '👑', min: 4000, color: '#ff8a5c' },
];

export function leagueFor(trophies: number): League {
  let out = LEAGUES[0];
  for (const l of LEAGUES) if (trophies >= l.min) out = l;
  return out;
}

export function nextLeague(trophies: number): League | null {
  return LEAGUES.find((l) => l.min > trophies) ?? null;
}

/**
 * Trophy change for a verified race. Practice never counts. Solo races pay
 * by place, Duos by the team result; leaving early always costs a little.
 */
export function trophyDelta(outcome: RaceOutcome): number {
  if (outcome.mode === 'practice' || outcome.racerCount < 2) return 0;
  if (!outcome.finished) return -12;
  if (outcome.mode === 'duos') return outcome.teamWin ? 24 + (outcome.place === 1 ? 4 : 0) : -8;
  const table = outcome.racerCount >= 4 ? [30, 16, -4, -10] : outcome.racerCount === 3 ? [26, 6, -8] : [20, -6];
  return table[Math.min(outcome.place, table.length) - 1];
}

/** Animal Level from the XP earned while racing with that animal. */
export const MAX_ANIMAL_LEVEL = 20;

export function animalLevelForXp(xp: number): number {
  let level = 1;
  while (level < MAX_ANIMAL_LEVEL && xp >= animalXpForLevel(level + 1)) level++;
  return level;
}

/** Total XP needed to reach `level` with one animal. */
export function animalXpForLevel(level: number): number {
  return 40 * (level - 1) * level;
}

export function animalLevel(profile: PlayerProfile, id: CharacterId): number {
  return animalLevelForXp(profile.animalXp?.[id] ?? 0);
}

export interface RankChange {
  characterId: CharacterId;
  trophiesBefore: number;
  trophiesAfter: number;
  animalXpBefore: number;
  animalXpAfter: number;
}

/** Applies trophies and animal XP for a settled race. */
export function applyRank(profile: PlayerProfile, characterId: CharacterId, outcome: RaceOutcome, xp: number): RankChange {
  const trophiesBefore = profile.trophies;
  profile.trophies = Math.max(0, trophiesBefore + trophyDelta(outcome));
  profile.bestTrophies = Math.max(profile.bestTrophies, profile.trophies);
  const id = CHARACTER_IDS.includes(characterId) ? characterId : profile.loadout.characterId;
  const animalXpBefore = profile.animalXp[id] ?? 0;
  profile.animalXp[id] = animalXpBefore + Math.max(0, Math.floor(xp));
  return { characterId: id, trophiesBefore, trophiesAfter: profile.trophies, animalXpBefore, animalXpAfter: profile.animalXp[id] };
}
