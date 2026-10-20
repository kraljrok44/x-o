// Experience and levels. Same curve as the classic 99-level RPG table: level L needs
// floor(sum_{l=1}^{L-1} floor(l + 300 * 2^(l/7)) / 4) total XP (83, 174, 276, ... 13 034 431).
// Map completions give XP, the reward doubles every 14 levels (so the top levels stay reachable),
// every 10th level unlocks a free crate and every 10 levels the military rank by your name rises.

export const MAX_LEVEL = 99;

export const XP_TABLE = (() => {
  const t = [0, 0]; // t[L] = total XP needed for level L
  let pts = 0;
  for (let l = 1; l < MAX_LEVEL; l++) {
    pts += Math.floor(l + 300 * Math.pow(2, l / 7));
    t[l + 1] = Math.floor(pts / 4);
  }
  return t;
})();

export const XP_REWARD = { first: 40, normal: 80, pb: 160, record: 500 };

// one rank per 10 levels: 1-9, 10-19, ... 90-99
export const RANKS = [
  { short: 'REC', name: 'Recruit' },
  { short: 'PVT', name: 'Private' },
  { short: 'CPL', name: 'Corporal' },
  { short: 'SGT', name: 'Sergeant' },
  { short: 'SSG', name: 'Staff Sergeant' },
  { short: 'LT', name: 'Lieutenant' },
  { short: 'CPT', name: 'Captain' },
  { short: 'MAJ', name: 'Major' },
  { short: 'COL', name: 'Colonel' },
  { short: 'GEN', name: 'General' },
];

export function levelFor(xp) {
  let lv = 1;
  while (lv < MAX_LEVEL && xp >= XP_TABLE[lv + 1]) lv++;
  return lv;
}

export function rankFor(level) { return RANKS[Math.min(RANKS.length - 1, Math.floor(level / 10))]; }

/** Reward multiplier at a level: x1 for levels 1-14, x2 for 15-28, x4 for 29-42, ... */
export function xpMultiplier(level) { return Math.pow(2, Math.floor((level - 1) / 14)); }

/** Progress inside the current level, 0..1 (1 at max level). */
export function levelProgress(xp) {
  const lv = levelFor(xp);
  if (lv >= MAX_LEVEL) return { level: lv, into: 0, need: 0, frac: 1 };
  const a = XP_TABLE[lv], b = XP_TABLE[lv + 1];
  return { level: lv, into: xp - a, need: b - a, frac: (xp - a) / (b - a) };
}

/**
 * Apply a completion to a profile (returns a new profile + what happened).
 * kind: 'first' | 'normal' | 'pb' | 'record'
 */
export function awardXp(profile, kind) {
  const xp0 = profile.xp || 0;
  const lv0 = levelFor(xp0);
  const mult = xpMultiplier(lv0);
  const gained = (XP_REWARD[kind] || 0) * mult;
  const xp = xp0 + gained;
  const lv = levelFor(xp);
  // a free crate for every 10th level crossed (10, 20, ... 90)
  const crates = Math.floor(lv / 10) - Math.floor(lv0 / 10);
  return {
    profile: { ...profile, xp, freeCrates: (profile.freeCrates || 0) + crates },
    gained, mult, xp, level: lv, prevLevel: lv0, freeCrates: crates,
  };
}
