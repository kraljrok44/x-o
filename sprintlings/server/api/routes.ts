import type { RewardedPlacement } from '../../src/config/AdConfig';
import { AdConfig } from '../../src/config/AdConfig';
import {
  buyOffer,
  buySeasonPremium,
  claimAchievement,
  claimDaily,
  claimQuest,
  claimSeasonTier,
  grantAdReward,
} from '../../src/economy/EconomyService';
import { EconomyError } from '../../src/economy/EconomyError';
import { equip } from '../../src/economy/InventoryService';
import { rerollQuest } from '../../src/progression/QuestService';
import { serverRng, type AccountService } from '../economy/AccountService';
import type { AuthService } from '../auth/AuthService';
import type { PurchaseService } from '../purchases/PurchaseService';
import type { RaceService } from '../rewards/RaceService';
import type { Repository } from '../persistence/Repository';
import { HttpError, RateLimiter, type Request, type Router } from './http';
import { randomUUID } from 'node:crypto';

const str = (v: unknown, name: string, max = 200): string => {
  if (typeof v !== 'string' || !v || v.length > max) throw new HttpError(400, 'invalid', `Bad ${name}`);
  return v;
};

export interface Services {
  repo: Repository;
  auth: AuthService;
  accounts: AccountService;
  races: RaceService;
  purchases: PurchaseService;
}

/** All JSON endpoints. Every response that changes the profile returns it. */
export function registerRoutes(r: Router, s: Services): void {
  const perAccount = new RateLimiter(120, 60_000);
  const perIp = new RateLimiter(20, 60_000);

  const authed = (fn: (accountId: string, req: Request) => Promise<unknown>) => async (req: Request) => {
    const acc = await s.auth.authenticate(req);
    if (!perAccount.allow(acc.id)) throw new HttpError(429, 'rate_limited', 'Too many requests');
    return fn(acc.id, req);
  };

  /** Runs an EconomyService operation and returns { result, profile }. */
  const op = <T>(fn: (p: Parameters<Parameters<AccountService['mutate']>[1]>[0], now: number, body: Record<string, unknown>) => T) =>
    authed(async (id, req) => {
      try {
        return await s.accounts.mutate(id, (p, now) => fn(p, now, (req.body ?? {}) as Record<string, unknown>));
      } catch (e) {
        if (e instanceof EconomyError) throw new HttpError(409, e.code, e.message);
        throw e;
      }
    });

  r.add('GET', '/api/health', () => ({ ok: true, storage: s.repo.kind, payments: s.purchases.provider?.id ?? 'none', time: Date.now() }));

  r.add('POST', '/api/auth/guest', async (req) => {
    if (!perIp.allow(req.ip)) throw new HttpError(429, 'rate_limited', 'Too many new accounts');
    return s.auth.createGuest(Date.now());
  });

  r.add('GET', '/api/profile', authed(async (id) => ({ profile: await s.accounts.read(id), serverTime: s.accounts.now() })));
  r.add('GET', '/api/ledger', authed(async (id) => ({ ledger: await s.repo.ledger(id, 200) })));

  r.add(
    'POST',
    '/api/race/start',
    authed(async (id, req) => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      return { ticket: await s.races.start(id, str(b.trackId, 'trackId'), b.mode as never, (b.difficulty ?? 'auto') as never) };
    }),
  );
  r.add(
    'POST',
    '/api/race/finish',
    authed(async (id, req) => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const settlement = await s.races.finish(id, str(b.raceId, 'raceId'), b.log);
      return { result: settlement, profile: await s.accounts.read(id) };
    }),
  );

  r.add('POST', '/api/quests/claim', op((p, now, b) => claimQuest(p, str(b.questId, 'questId'), now, serverRng())));
  r.add('POST', '/api/quests/reroll', op((p, now, b) => void rerollQuest(p, str(b.questId, 'questId'), now)));
  r.add('POST', '/api/achievements/claim', op((p, now, b) => claimAchievement(p, str(b.id, 'id'), now, serverRng())));
  r.add('POST', '/api/daily/claim', op((p, now) => claimDaily(p, now, serverRng())));
  r.add('POST', '/api/season/claim', op((p, now, b) => claimSeasonTier(p, Number(b.tier), b.track === 'premium' ? 'premium' : 'free', now, serverRng())));
  r.add('POST', '/api/season/premium', op((p, now) => buySeasonPremium(p, now, `buy_${randomUUID()}`)));
  r.add('POST', '/api/shop/buy', op((p, now, b) => buyOffer(p, str(b.offerId, 'offerId'), now, `buy_${randomUUID()}`, serverRng())));
  r.add('POST', '/api/inventory/equip', op((p, _now, b) => equip(p, str(b.slot, 'slot') as never, b.id === null ? null : str(b.id, 'id'))));
  r.add(
    'POST',
    '/api/profile/name',
    op((p, _now, b) => {
      const clean = str(b.name, 'name', 40).replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 16);
      if (clean.length < 2) throw new EconomyError('invalid', 'Name must be 2–16 letters or numbers.');
      p.name = clean;
    }),
  );
  r.add('POST', '/api/profile/tutorial', op((p) => void (p.tutorialDone = true)));
  r.add(
    'POST',
    '/api/ads/interstitial',
    op((p, now) => {
      p.ads.lastInterstitialAt = now;
      p.ads.racesSinceInterstitial = 0;
    }),
  );
  // Portal ad SDKs offer no server-to-server confirmation, so this relies on the
  // client callback; limits, cool-downs and one-time tokens are enforced here.
  r.add(
    'POST',
    '/api/ads/reward',
    op((p, now, b) => {
      const placement = str(b.placement, 'placement') as RewardedPlacement;
      if (!(placement in AdConfig.rewarded)) throw new EconomyError('invalid', 'Unknown placement');
      const token = str(b.token, 'token', 100);
      return grantAdReward(p, placement, now, `ad:${token}`, typeof b.raceId === 'string' ? b.raceId : undefined);
    }),
  );

  r.add('GET', '/api/purchases/offers', authed(async (id) => ({ offers: await s.purchases.offers(id) })));
  r.add('POST', '/api/purchases/checkout', authed(async (id, req) => s.purchases.checkout(id, str((req.body as Record<string, unknown>)?.productId, 'productId'))));
  r.add('GET', '/api/purchases/:id', authed(async (id, req) => ({ purchase: await s.purchases.status(id, req.params.id), profile: await s.accounts.read(id) })));
  r.add('POST', '/api/purchases/restore', authed(async (id) => ({ ...(await s.purchases.restore(id)), profile: await s.accounts.read(id) })));
  r.add('POST', '/api/purchases/webhook/:provider', async (req) => ({ changed: await s.purchases.webhook(req.params.provider, req.rawBody, req.headers) }), { raw: true });

  r.add('POST', '/api/analytics', async (req) => {
    if (!perIp.allow(`a:${req.ip}`)) return { ok: false };
    // Anonymous, consented gameplay events. Stored nowhere sensitive; extend as needed.
    const events = ((req.body as { events?: unknown[] })?.events ?? []).length;
    return { ok: true, received: events };
  });
}
