export const EconomyConfig = {
  startingWallet: { coins: 150, gems: 0 },

  race: {
    finishCoins: 25,
    participationCoins: 10,
    placeBonusCoins: [20, 12, 6, 0] as readonly number[],
    finishXp: 5,
    winXp: 3,
    teamWinCoins: 15,
    glimmersPerCoin: 5,
    glimmerCoinCap: 15,
    seasonPoints: { finish: 20, podium: 5, win: 10 },
    practiceMultiplier: 0.4,
  },

  level: {
    cap: 50,
    xpToNext: (level: number): number => 10 + 5 * level,
    coinsPerLevel: (level: number): number => 40 + 10 * level,
    gemsEveryNLevels: 5,
    gemsAmount: 20,
  },

  quests: {
    activeCount: 3,
    freeRerolls: 1,
  },

  daily: {
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
      duplicateRefundShare: 0.5,
      duplicateRefundMin: 40,
      contents: 'Cosmetics normally sold for Coins (no premium or season items).',
    },
  },

  shop: {
    bundleOwnedDiscount: true,
  },

  season: {
    pointsPerTier: 100,
    premiumPriceGems: 600,
  },

  balancingTargets: {
    racesToFirstShopPurchase: 6,
    averageRacesPerDay: 12,
    coinsPerAverageRace: 45,
  },
} as const;

export type ChestId = keyof typeof EconomyConfig.chests;
