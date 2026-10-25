import { describe, expect, it } from 'vitest';
import { NoAdsProvider, type AdProvider, type AdResult } from '../../src/ads/AdProvider';
import { RewardedAdService } from '../../src/ads/RewardedAdService';
import { interstitialAllowed } from '../../src/ads/AdEligibility';
import { MemoryStore } from '../../src/persistence/KeyValueStore';
import { ProfileRepository } from '../../src/persistence/ProfileRepository';
import { LocalAuthority } from '../../src/persistence/LocalAuthority';
import { createProfile } from '../../src/economy/Profile';

class FakeProvider implements AdProvider {
  readonly name = 'fake';
  readonly supportsRewarded = true;
  readonly supportsInterstitial = true;
  onAdStart: (() => void) | null = null;
  onAdEnd: (() => void) | null = null;
  starts = 0;
  constructor(
    private readonly result: () => AdResult,
    private readonly available = true,
  ) {}
  rewardedAvailable() {
    return this.available;
  }
  async showRewarded() {
    this.starts++;
    this.onAdStart?.();
    const r = this.result();
    this.onAdEnd?.();
    return r;
  }
  async showInterstitial() {
    return this.result();
  }
}

async function authority() {
  const a = new LocalAuthority(new ProfileRepository(new MemoryStore()), 'test');
  await a.init();
  return a;
}

let n = 0;
const completed = (): AdResult => ({ status: 'completed', token: `tok_${n++}`, verifiedBy: 'provider-callback' });

describe('rewarded ads', () => {
  it('no provider: the game keeps working and nothing is offered', async () => {
    const a = await authority();
    const s = new RewardedAdService(new NoAdsProvider(), a);
    expect(s.canOffer('free_coins').ok).toBe(false);
    const r = await s.run('free_coins');
    expect(r.status).toBe('unavailable');
  });

  it('ad not available / fails to load: no reward', async () => {
    const a = await authority();
    const before = a.profile.wallet.coins;
    const unavailable = new RewardedAdService(new FakeProvider(completed, false), a);
    expect((await unavailable.run('free_coins')).status).toBe('unavailable');
    const failing = new RewardedAdService(new FakeProvider(() => ({ status: 'failed', reason: 'no fill' })), a);
    expect((await failing.run('free_coins')).status).toBe('failed');
    expect(a.profile.wallet.coins).toBe(before);
  });

  it('closed early: no reward', async () => {
    const a = await authority();
    const before = a.profile.wallet.coins;
    const s = new RewardedAdService(new FakeProvider(() => ({ status: 'skipped', reason: 'closed' })), a);
    const r = await s.run('free_coins');
    expect(r.status).toBe('skipped');
    expect(a.profile.wallet.coins).toBe(before);
  });

  it('completed: reward granted exactly once per completion', async () => {
    const a = await authority();
    const before = a.profile.wallet.coins;
    const provider = new FakeProvider(() => ({ status: 'completed', token: 'same_token', verifiedBy: 'provider-callback' }));
    const s = new RewardedAdService(provider, a);
    const r = await s.run('free_coins');
    expect(r.status).toBe('rewardGranted');
    expect(a.profile.wallet.coins).toBe(before + 20);
    // A duplicated completion callback (same token) must not pay again.
    await expect(a.grantAdReward('free_coins', 'same_token')).rejects.toThrow();
    expect(a.profile.wallet.coins).toBe(before + 20);
  });

  it('mutes/pauses hooks fire around the ad', async () => {
    const a = await authority();
    const provider = new FakeProvider(completed);
    let started = 0;
    let ended = 0;
    provider.onAdStart = () => started++;
    provider.onAdEnd = () => ended++;
    await new RewardedAdService(provider, a).run('free_coins');
    expect([started, ended]).toEqual([1, 1]);
  });
});

describe('interstitial rules', () => {
  const now = Date.parse('2026-10-25T10:00:00Z');
  it('never in the first races, then at most every few races with a cool-down', () => {
    const p = createProfile('x', now);
    expect(interstitialAllowed(p, now).allowed).toBe(false);
    p.stats.races = 5;
    p.ads.racesSinceInterstitial = 3;
    expect(interstitialAllowed(p, now).allowed).toBe(true);
    p.ads.lastInterstitialAt = now - 60_000;
    expect(interstitialAllowed(p, now).reason).toBe('interval');
    p.ads.lastInterstitialAt = 0;
    p.ads.lastRewardedAt = now - 30_000;
    expect(interstitialAllowed(p, now).reason).toBe('recent_rewarded');
  });

  it('No Interruptions removes interstitials only', () => {
    const p = createProfile('x', now);
    p.stats.races = 10;
    p.ads.racesSinceInterstitial = 10;
    p.entitlements.push('ad_free');
    expect(interstitialAllowed(p, now)).toEqual({ allowed: false, reason: 'ad_free' });
  });
});
