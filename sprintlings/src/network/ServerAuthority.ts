import type { AuthoritySetup } from '../app/createAuthority';
import type { GameAuthority } from '../app/GameAuthority';
import type { RewardedPlacement } from '../config/AdConfig';
import { rewardedEligibility, type AdEligibility, type GrantResult, type PurchaseResult, type RaceSettlement } from '../economy/EconomyService';
import { EconomyError, type EconomyErrorCode } from '../economy/EconomyError';
import { cloneProfile, type LoadoutSlot, type PlayerProfile } from '../economy/Profile';
import type { InputLog } from '../game/RaceReplay';
import type { DifficultyChoice, RaceMode, RaceTicket } from '../game/RaceVerifier';
import type { ProductOffer, PurchaseOutcome, PurchaseService } from '../shop/PurchaseService';
import { t } from '../ui/i18n';

const TOKEN_KEY = 'sprintlings:token';

/** HTTP client for the Sprintlings server (server/). */
export class NetworkClient {
  constructor(
    readonly baseUrl: string,
    private token: string | null,
  ) {}

  setToken(token: string): void {
    this.token = token;
  }

  async call<T>(method: 'GET' | 'POST', path: string, body?: unknown, timeoutMs = 15000): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...(this.token ? { authorization: `Bearer ${this.token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new EconomyError((json.error as EconomyErrorCode) ?? 'invalid', String(json.message ?? `Server error ${res.status}`));
      return json as T;
    } catch (e) {
      if (e instanceof EconomyError) throw e;
      throw new EconomyError('invalid', 'Connection problem. Please check your internet and try again.');
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Authority backed by our server: every economic change is validated and
 * stored server side; the client only mirrors the returned profile.
 */
export class ServerAuthority implements GameAuthority {
  readonly kind = 'server' as const;
  readonly storageLabel = t('Saved to your account on our server.');
  readonly purchasesAvailable = true;
  private p!: PlayerProfile;
  private clockOffset = 0;
  private readonly listeners = new Set<(p: PlayerProfile) => void>();

  constructor(readonly net: NetworkClient) {}

  async init(): Promise<PlayerProfile> {
    const r = await this.net.call<{ profile: PlayerProfile; serverTime: number }>('GET', '/api/profile');
    this.clockOffset = r.serverTime - Date.now();
    this.p = r.profile;
    return this.p;
  }

  get profile(): PlayerProfile {
    return this.p;
  }

  now(): number {
    return Date.now() + this.clockOffset;
  }

  onChange(cb: (p: PlayerProfile) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  setProfile(p: PlayerProfile): void {
    this.p = p;
    for (const l of this.listeners) l(p);
  }

  private async op<T>(path: string, body: unknown = {}): Promise<T> {
    const r = await this.net.call<{ result: T; profile: PlayerProfile }>('POST', path, body);
    this.setProfile(r.profile);
    return r.result;
  }

  async startRace(trackId: string, mode: RaceMode, difficulty: DifficultyChoice): Promise<RaceTicket> {
    return (await this.net.call<{ ticket: RaceTicket }>('POST', '/api/race/start', { trackId, mode, difficulty })).ticket;
  }

  async finishRace(ticket: RaceTicket, log: InputLog): Promise<RaceSettlement> {
    return this.op<RaceSettlement>('/api/race/finish', { raceId: ticket.raceId, log });
  }

  claimQuest(questId: string) {
    return this.op<GrantResult>('/api/quests/claim', { questId });
  }
  async rerollQuest(questId: string) {
    await this.op('/api/quests/reroll', { questId });
  }
  claimAchievement(id: string) {
    return this.op<GrantResult>('/api/achievements/claim', { id });
  }
  claimDaily() {
    return this.op<GrantResult & { index: number }>('/api/daily/claim');
  }
  claimSeasonTier(tier: number, track: 'free' | 'premium') {
    return this.op<GrantResult>('/api/season/claim', { tier, track });
  }
  async buySeasonPremium() {
    await this.op('/api/season/premium');
  }
  buyOffer(offerId: string) {
    return this.op<PurchaseResult>('/api/shop/buy', { offerId });
  }
  async equip(slot: LoadoutSlot | 'variant' | 'character', id: string | null) {
    await this.op('/api/inventory/equip', { slot, id });
  }
  async setName(name: string) {
    await this.op('/api/profile/name', { name });
  }
  async completeTutorial() {
    await this.op('/api/profile/tutorial');
  }

  adEligibility(placement: RewardedPlacement, raceId?: string): AdEligibility {
    return rewardedEligibility(cloneProfile(this.p), placement, this.now(), raceId);
  }

  grantAdReward(placement: RewardedPlacement, completionToken: string, raceId?: string) {
    return this.op<GrantResult>('/api/ads/reward', { placement, token: completionToken, raceId });
  }

  noteInterstitial(): void {
    void this.op('/api/ads/interstitial').catch(() => {});
  }

  async flush(): Promise<void> {}
}

/** Real-money purchases through the server and its payment provider. */
export class ServerPurchaseService implements PurchaseService {
  readonly available = true;
  readonly unavailableReason = '';

  constructor(
    private readonly net: NetworkClient,
    private readonly authority: ServerAuthority,
  ) {}

  async loadOffers(): Promise<ProductOffer[]> {
    return (await this.net.call<{ offers: ProductOffer[] }>('GET', '/api/purchases/offers')).offers;
  }

  async buy(productId: string): Promise<PurchaseOutcome> {
    let checkout: { purchaseId: string; url: string };
    try {
      checkout = await this.net.call('POST', '/api/purchases/checkout', { productId });
    } catch (e) {
      return { status: 'failed', message: e instanceof Error ? e.message : String(e) };
    }
    // Note: 'noopener' would make window.open return null, so detach the opener manually.
    const win = window.open(checkout.url, '_blank');
    if (win) win.opener = null;
    else return { status: 'pending', message: 'Please allow pop-ups to open the secure checkout, then try again.' };
    // The grant happens server side on the provider's webhook; we only poll for the result.
    const deadline = Date.now() + 5 * 60_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const r = await this.net.call<{ purchase: { status: string }; profile: PlayerProfile }>('GET', `/api/purchases/${checkout.purchaseId}`);
        if (r.purchase.status === 'paid') {
          this.authority.setProfile(r.profile);
          return { status: 'granted', productId };
        }
        if (r.purchase.status === 'cancelled') return { status: 'cancelled' };
        if (r.purchase.status === 'failed') return { status: 'failed', message: t('Payment failed. You were not charged.') };
      } catch {
        /* keep polling through brief connection drops */
      }
    }
    return { status: 'pending', message: 'Your payment is still being processed. Items appear automatically once it completes.' };
  }

  async restore(): Promise<number> {
    const r = await this.net.call<{ purchases: unknown[]; profile: PlayerProfile }>('POST', '/api/purchases/restore');
    this.authority.setProfile(r.profile);
    return r.purchases.length;
  }
}

function serverUrl(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env.replace(/\/$/, '');
  return import.meta.env.DEV ? `${location.protocol}//${location.hostname}:8787` : location.origin;
}

/** Connects to the server if it is reachable; null means "fall back to local". */
export async function connectServerAuthority(): Promise<AuthoritySetup | null> {
  const base = serverUrl();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const ok = await fetch(`${base}/api/health`, { signal: ctrl.signal }).then((r) => r.ok);
    clearTimeout(timer);
    if (!ok) return null;
  } catch {
    return null;
  }
  let token: string | null = null;
  try {
    token = localStorage.getItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  const net = new NetworkClient(base, token);
  if (!token) {
    const g = await net.call<{ token: string }>('POST', '/api/auth/guest');
    net.setToken(g.token);
    try {
      localStorage.setItem(TOKEN_KEY, g.token);
    } catch {
      /* ignore */
    }
  }
  const authority = new ServerAuthority(net);
  try {
    await authority.init();
  } catch {
    // Stale token (e.g. server data reset): start a fresh guest account.
    const g = await net.call<{ token: string }>('POST', '/api/auth/guest');
    net.setToken(g.token);
    try {
      localStorage.setItem(TOKEN_KEY, g.token);
    } catch {
      /* ignore */
    }
  }
  return { authority, purchases: new ServerPurchaseService(net, authority), serverUrl: base };
}
