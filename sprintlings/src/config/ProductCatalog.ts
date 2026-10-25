/**
 * Real-money products (design doc section 12). Prices are NOT defined here:
 * the UI shows only the localized price returned by the payment provider.
 * `testPriceLabel` is used exclusively by the sandbox provider and is always
 * rendered with a "TEST" marker.
 */
export type ProductKind = 'consumable' | 'permanent';

export interface ProductDefinition {
  id: string;
  kind: ProductKind;
  name: string;
  description: string;
  grants: { gems?: number; cosmetics?: string[]; entitlements?: string[] };
  /** Can only be bought once per account even though it contains currency. */
  oncePerAccount?: boolean;
  testPriceLabel: string;
  highlight?: string;
}

export const PRODUCTS: ProductDefinition[] = [
  {
    id: 'starter_pack',
    kind: 'permanent',
    name: 'Starter Pack',
    description: '300 Gems plus the exclusive Golden Sprout hat and Frostbite Sparks trail.',
    grants: { gems: 300, cosmetics: ['hat_goldleaf', 'trail_frostbite'], entitlements: ['starter_pack'] },
    oncePerAccount: true,
    testPriceLabel: '1.99',
    highlight: 'One time',
  },
  { id: 'gems_500', kind: 'consumable', name: 'Small Gems', description: '500 Gems', grants: { gems: 500 }, testPriceLabel: '4.99' },
  { id: 'gems_1200', kind: 'consumable', name: 'Medium Gems', description: '1,200 Gems', grants: { gems: 1200 }, testPriceLabel: '9.99', highlight: 'Popular' },
  { id: 'gems_3000', kind: 'consumable', name: 'Large Gems', description: '3,000 Gems', grants: { gems: 3000 }, testPriceLabel: '19.99' },
  { id: 'gems_7000', kind: 'consumable', name: 'Mega Gems', description: '7,000 Gems', grants: { gems: 7000 }, testPriceLabel: '39.99', highlight: 'Best value' },
  {
    id: 'bundle_wanderer',
    kind: 'permanent',
    name: 'Wanderer Cosmetic Bundle',
    description: 'Starry Wizard Hat, Hero Cape and Melody Trail.',
    grants: { cosmetics: ['hat_wizard', 'back_cape', 'trail_notes'], entitlements: ['bundle_wanderer'] },
    testPriceLabel: '6.99',
  },
  {
    id: 'ad_free',
    kind: 'permanent',
    name: 'No Interruptions',
    description: 'Removes interstitial ads between races. Optional reward videos stay available if you want them.',
    grants: { entitlements: ['ad_free'] },
    testPriceLabel: '3.99',
  },
];

export const PRODUCT_BY_ID: Record<string, ProductDefinition> = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
