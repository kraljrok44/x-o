import { EconomyConfig } from '../config/EconomyConfig';
import type { RaceOutcome } from '../progression/QuestService';

export interface RaceRewardBreakdown {
  lines: { label: string; coins: number; xp: number; seasonPoints: number }[];
  coins: number;
  xp: number;
  seasonPoints: number;
}

/**
 * Pure race reward formula. Participation always pays something, results
 * pay more. Inputs come from a verified (re-simulated) race only.
 */
export function calculateRaceReward(o: RaceOutcome): RaceRewardBreakdown {
  const cfg = EconomyConfig.race;
  const lines: RaceRewardBreakdown['lines'] = [];
  const multiplayerish = o.racerCount > 1 && o.mode !== 'practice';
  if (o.finished) lines.push({ label: 'Race finished', coins: cfg.finishCoins, xp: cfg.finishXp, seasonPoints: cfg.seasonPoints.finish });
  else lines.push({ label: 'Participation', coins: cfg.participationCoins, xp: 1, seasonPoints: Math.floor(cfg.seasonPoints.finish / 2) });
  if (o.finished && multiplayerish) {
    const bonus = cfg.placeBonusCoins[o.place - 1] ?? 0;
    if (bonus > 0) {
      lines.push({
        label: o.place === 1 ? '1st place' : o.place === 2 ? '2nd place' : '3rd place',
        coins: bonus,
        xp: o.place === 1 ? cfg.winXp : 0,
        seasonPoints: o.place === 1 ? cfg.seasonPoints.win : cfg.seasonPoints.podium,
      });
    }
  }
  const glimmerCoins = Math.min(cfg.glimmerCoinCap, Math.floor(o.stats.glimmers / cfg.glimmersPerCoin));
  if (glimmerCoins > 0) lines.push({ label: `Glimmers ×${o.stats.glimmers}`, coins: glimmerCoins, xp: 0, seasonPoints: 0 });
  if (o.mode === 'practice') {
    for (const l of lines) {
      l.coins = Math.floor(l.coins * cfg.practiceMultiplier);
      l.seasonPoints = Math.floor(l.seasonPoints * cfg.practiceMultiplier);
    }
  }
  return {
    lines,
    coins: lines.reduce((n, l) => n + l.coins, 0),
    xp: lines.reduce((n, l) => n + l.xp, 0),
    seasonPoints: lines.reduce((n, l) => n + l.seasonPoints, 0),
  };
}
