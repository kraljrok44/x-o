import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { testServer, type Api } from '../helpersServer';
import { RaceSimulation } from '../../src/game/RaceManager';
import { getTrack } from '../../src/game/TrackManager';
import { InputRecorder } from '../../src/game/RaceReplay';
import { AIController } from '../../src/ai/AIController';
import type { RaceTicket } from '../../src/game/RaceVerifier';
import type { PlayerProfile } from '../../src/economy/Profile';
import type { ServerMessage } from '../../src/network/ServerMessages';
import { simHash } from '../../src/network/simHash';

let api: Api;
beforeAll(async () => {
  api = await testServer();
});
afterAll(async () => {
  await api.srv.close();
});

/** Plays the ticket's race locally with an autopilot and returns the input log. */
function play(ticket: RaceTicket) {
  const sim = new RaceSimulation({ track: getTrack(ticket.trackId), seed: ticket.seed, racers: ticket.racers });
  const pilot = new AIController(0, 'racer', 99);
  const rec = new InputRecorder();
  while (sim.phase !== 'done') {
    const input = sim.phase === 'countdown' ? pilot.decideCountdown(sim) : pilot.decide(sim);
    rec.record(sim.tick, input);
    sim.step([input]);
  }
  return { log: rec.log, place: sim.standings.indexOf(0) + 1, finishTime: sim.racers[0].finishTime };
}

describe('server races', () => {
  it('re-simulates a race and pays from its own result', { timeout: 60000 }, async () => {
    const token = await api.guest();
    const start = await api.call<{ ticket: RaceTicket }>('POST', '/api/race/start', { trackId: 'mossy_hollow', mode: 'race' }, token);
    expect(start.status).toBe(200);
    const ticket = start.json.ticket;
    const local = play(ticket);
    api.clock.t += 120_000;
    const r = await api.call<{ result: { outcome: { place: number }; breakdown: { coins: number } }; profile: PlayerProfile }>('POST', '/api/race/finish', { raceId: ticket.raceId, log: local.log }, token);
    expect(r.status).toBe(200);
    expect(r.json.result.outcome.place).toBe(local.place);
    expect(r.json.profile.wallet.coins).toBeGreaterThanOrEqual(150 + r.json.result.breakdown.coins);
    // Same race again: rejected.
    const again = await api.call('POST', '/api/race/finish', { raceId: ticket.raceId, log: local.log }, token);
    expect(again.status).toBe(404);
  });

  it('rejects races submitted faster than they could be played', { timeout: 60000 }, async () => {
    const token = await api.guest();
    const { json } = await api.call<{ ticket: RaceTicket }>('POST', '/api/race/start', { trackId: 'mossy_hollow', mode: 'race' }, token);
    const local = play(json.ticket);
    api.clock.t += 5_000;
    const r = await api.call<{ message: string }>('POST', '/api/race/finish', { raceId: json.ticket.raceId, log: local.log }, token);
    expect(r.status).toBe(422);
    expect(r.json.message).toContain('too_fast');
  });

  it('rejects garbage input logs and locked tracks', async () => {
    const token = await api.guest();
    const { json } = await api.call<{ ticket: RaceTicket }>('POST', '/api/race/start', { trackId: 'mossy_hollow', mode: 'race' }, token);
    api.clock.t += 60_000;
    expect((await api.call('POST', '/api/race/finish', { raceId: json.ticket.raceId, log: [[1, 99]] }, token)).status).toBe(422);
    expect((await api.call('POST', '/api/race/start', { trackId: 'glimmerdeep_vale', mode: 'race' }, token)).status).toBe(403);
  });

  it('requires authentication and validates economy calls', async () => {
    expect((await api.call('GET', '/api/profile')).status).toBe(401);
    const token = await api.guest();
    const buy = await api.call<{ error: string }>('POST', '/api/shop/buy', { offerId: 'hat_crown' }, token);
    expect(buy.status).toBe(409);
    expect(buy.json.error).toBe('insufficient_funds');
    const ok = await api.call<{ profile: PlayerProfile }>('POST', '/api/shop/buy', { offerId: 'hat_acorn' }, token);
    expect(ok.json.profile.inventory).toContain('hat_acorn');
  });

  it('daily reward uses server time, once per day', async () => {
    const token = await api.guest();
    expect((await api.call('POST', '/api/daily/claim', {}, token)).status).toBe(200);
    expect((await api.call('POST', '/api/daily/claim', {}, token)).status).toBe(409);
    api.clock.t += 24 * 3600_000;
    expect((await api.call('POST', '/api/daily/claim', {}, token)).status).toBe(200);
  });

  it('ad rewards: one payout per token and daily limits on the server', async () => {
    const token = await api.guest();
    expect((await api.call('POST', '/api/ads/reward', { placement: 'free_coins', token: 'v1' }, token)).status).toBe(200);
    expect((await api.call('POST', '/api/ads/reward', { placement: 'free_coins', token: 'v1' }, token)).status).toBe(409);
  });
});

describe('online matchmaking', () => {
  it('matches two players into one room and keeps their lockstep simulations identical to the server', async () => {
    const tokens = [await api.guest(), await api.guest()];
    const url = api.srv.url.replace('http', 'ws') + '/ws';
    const got: ServerMessage[][] = [[], []];
    const sockets = await Promise.all(
      tokens.map(
        (tk, i) =>
          new Promise<WebSocket>((resolve) => {
            const ws = new WebSocket(url);
            ws.on('message', (d) => {
              const m = JSON.parse(String(d)) as ServerMessage;
              got[i].push(m);
              // Loaded instantly; player 0 taps jump a few times and fires a powerup.
              if (m.t === 'match') {
                ws.send(JSON.stringify({ t: 'ready' }));
                for (const [tick, bits] of [[200, 1], [205, 0], [260, 1], [262, 0], [300, 8], [301, 0]]) if (i === 0) ws.send(JSON.stringify({ t: 'input', tick, bits }));
              }
            });
            ws.on('open', () => {
              ws.send(JSON.stringify({ t: 'hello', token: tk }));
              setTimeout(() => {
                ws.send(JSON.stringify({ t: 'queue' }));
                resolve(ws);
              }, 50);
            });
          }),
      ),
    );
    await new Promise((r) => setTimeout(r, 7500));
    sockets.forEach((s) => s.close());
    const matches = got.map((l) => l.find((m) => m.t === 'match'));
    for (const m of matches) expect(m && m.t === 'match' && m.room.racers.length).toBe(4);
    const room0 = matches[0]!.t === 'match' ? matches[0]!.room : null;
    const room1 = matches[1]!.t === 'match' ? matches[1]!.room : null;
    expect(room0!.roomId).toBe(room1!.roomId);
    expect(new Set([room0!.yourIndex, room1!.yourIndex]).size).toBe(2);
    // Replay what one client received, exactly as OnlineLink does, and compare fingerprints.
    for (const list of got) {
      const room = (list.find((m) => m.t === 'match') as Extract<ServerMessage, { t: 'match' }>).room;
      const inputs = new Map<number, number[]>();
      const hashes = new Map<number, number>();
      for (const m of list) {
        if (m.t === 'ticks') m.inputs.forEach((b, k) => inputs.set(m.from + k, b));
        if (m.t === 'hash') hashes.set(m.tick, m.h);
      }
      expect(inputs.size).toBeGreaterThan(300);
      expect(hashes.size).toBeGreaterThan(4);
      const sim = new RaceSimulation({ track: getTrack(room.trackId), seed: room.seed, racers: room.racers, finishGrace: 12 });
      let compared = 0;
      while (inputs.has(sim.tick)) {
        const bits = inputs.get(sim.tick)!;
        sim.step(bits.map((b) => ({ jumpHeld: (b & 1) !== 0, down: (b & 2) !== 0, special: (b & 4) !== 0, use: (b & 8) !== 0 })));
        const h = hashes.get(sim.tick);
        if (h !== undefined) {
          expect(simHash(sim)).toBe(h);
          compared++;
        }
      }
      expect(compared).toBeGreaterThan(4);
      // Player 0's taps reached the server and were relayed at their ticks.
      expect(inputs.get(200)?.[room0!.yourIndex]).toBe(1);
      expect(inputs.get(205)?.[room0!.yourIndex]).toBe(0);
      expect(inputs.get(300)?.[room0!.yourIndex]).toBe(8);
    }
  }, 20000);
});
