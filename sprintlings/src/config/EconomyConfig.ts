/**
 * Every economy number in one place (design doc section 7). These are
 * starting test values, tuned by time-to-first-purchase and races per day,
 * and can be changed without touching game code.
 */
export const EconomyConfig = {
  startingWallet: { coins: 150, gems: 0 },

  race: {
    /** Paid for any finished race, last place included. */
    finishCoins: 25,
    /** Paid when the race times out before the racer crosses the line. */
    participationCoins: 10,
    placeBonusCoins: [20, 12, 6, 0] as readonly number[],
    finishXp: 5,
    winXp: 3,
    /** Duos: bonus for the whole team when it wins. */
    teamWinCoins: 15,
    /** One coin per this many glimmers collected, capped. */
    glimmersPerCoin: 5,
    glimmerCoinCap: 15,
    seasonPoints: { finish: 20, podium: 5, win: 10 },
    /** Practice / time-trial races pay this fraction. */
    practiceMultiplier: 0.4,
  },

  level: {
    cap: 50,
    /** XP needed to go from level n to n + 1. */
    xpToNext: (level: number): number => 10 + 5 * level,
    coinsPerLevel: (level: number): number => 40 + 10 * level,
    gemsEveryNLevels: 5,
    gemsAmount: 20,
  },

  quests: {
    activeCount: 3,
    /** Free rerolls of one quest per day. */
    freeRerolls: 1,
  },

  daily: {
    /** Cycle of login rewards. Missing a day never resets progress. */
    cycle: [
      { coins: 50 },
      { coins: 75 },
      { coins: 100 },
      { gems: 10 },
      { coins: 150 },
      { coins: 200 },
      { gems: 25, chest: 'chest_acorn' },
    ] as readonly { coins?: number; gems?: number; chest?: string }[],
  },

  chests: {
    chest_acorn: {
      id: 'chest_acorn',
      name: 'Strongbox',
      price: { currency: 'coins' as const, amount: 250 },
      odds: { common: 70, rare: 25, epic: 5, legendary: 0 },
      /** Duplicate cosmetics are converted to coins at this share of their coin price. */
      duplicateRefundShare: 0.5,
      duplicateRefundMin: 40,
      contents: 'Cosmetics normally sold for Coins (no premium or season items).',
    },
  },

  shop: {
    /** Bundles are discounted by the value of items you already own. */
    bundleOwnedDiscount: true,
  },

  season: {
    pointsPerTier: 100,
    premiumPriceGems: 600,
  },

  /** Rough targets used while balancing (documentation for designers). */
  balancingTargets: {
    racesToFirstShopPurchase: 6,
    averageRacesPerDay: 12,
    coinsPerAverageRace: 45,
  },
} as const;

export type ChestId = keyof typeof EconomyConfig.chests;
