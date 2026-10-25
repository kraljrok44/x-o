import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../src/persistence/KeyValueStore';
import { ProfileRepository } from '../../src/persistence/ProfileRepository';
import { LocalAuthority } from '../../src/persistence/LocalAuthority';
import { migrateProfile } from '../../src/persistence/SaveMigration';
import { createProfile, PROFILE_SCHEMA_VERSION } from '../../src/economy/Profile';
import { RaceSimulation } from '../../src/game/RaceManager';
import { getTrack } from '../../src/game/TrackManager';
import { InputRecorder } from '../../src/game/RaceReplay';
import { EconomyError } from '../../src/economy/EconomyError';

describe('saves', () => {
  it('round-trips a profile', async () => {
    const repo = new ProfileRepository(new MemoryStore());
    const p = createProfile('x', 1000);
    p.wallet.coins = 1234;
    await repo.saveNow(p);
    const loaded = await repo.load(2000);
    expect(loaded?.wallet.coins).toBe(1234);
  });

  it('falls back to the backup slot when the primary save is corrupted', async () => {
    const store = new MemoryStore();
    const repo = new ProfileRepository(store);
    const p = createProfile('x', 1000);
    p.wallet.coins = 1;
    await repo.saveNow(p);
    p.wallet.coins = 2;
    await repo.saveNow(p);
    await store.set('profile', '{"v":1,"sum":1,"data":"{broken"}');
    const loaded = await repo.load(2000);
    expect(loaded?.wallet.coins).toBe(1);
    expect(repo.lastLoadInfo.source).toBe('backup');
  });

  it('migrates a v1 save to the current schema', () => {
    const v1 = { schemaVersion: 1, id: 'old', name: 'Old', wallet: { coins: 77, gems: 3 }, inventory: ['hat_leaf'], quests: { day: '', list: [] }, ads: { day: '' } };
    const { profile, migratedFrom } = migrateProfile(v1, 5000);
    expect(migratedFrom).toBe(1);
    expect(profile.schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
    expect(profile.wallet.coins).toBe(77);
    expect(profile.seasonHistory).toEqual([]);
    expect(profile.ads.rewardedRaceIds).toEqual([]);
    expect(profile.quests.sweptDay).toBeNull();
  });
});

describe('local authority', () => {
  it('re-simulates the race before paying and refuses a second claim', async () => {
    const auth = new LocalAuthority(new ProfileRepository(new MemoryStore()), 'test');
    await auth.init();
    const ticket = await auth.startRace('mossy_hollow', 'race', 'easy');
    const sim = new RaceSimulation({ track: getTrack(ticket.trackId), seed: ticket.seed, racers: ticket.racers });
    const rec = new InputRecorder();
    let t = 0;
    while (sim.phase !== 'done') {
      const input = { jumpHeld: t++ % 50 < 20, left: false, right: false, use: false };
      rec.record(sim.tick, input);
      sim.step([input]);
    }
    const before = auth.profile.wallet.coins;
    const result = await auth.finishRace(ticket, rec.log);
    expect(auth.profile.wallet.coins).toBe(before + result.breakdown.coins);
    const livePlace = sim.standings.indexOf(0) + 1;
    expect(result.outcome.place).toBe(livePlace);
    await expect(auth.finishRace(ticket, rec.log)).rejects.toBeInstanceOf(EconomyError);
    expect(auth.profile.wallet.coins).toBe(before + result.breakdown.coins);
  });

  it('a failed operation leaves the profile untouched', async () => {
    const auth = new LocalAuthority(new ProfileRepository(new MemoryStore()), 'test');
    await auth.init();
    const snapshot = JSON.stringify(auth.profile.wallet);
    await expect(auth.buyOffer('hat_crown')).rejects.toBeInstanceOf(EconomyError);
    expect(JSON.stringify(auth.profile.wallet)).toBe(snapshot);
  });
});
