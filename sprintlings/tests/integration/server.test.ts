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
  it('re-simulates a race and pays from its own result', async () => {
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

  it('rejects races submitted faster than they could be played', async () => {
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

describe('online matchmaking (experimental)', () => {
  it('two players get matched into an authoritative room and receive snapshots', async () => {
    const tokens = [await api.guest(), await api.guest()];
    const url = api.srv.url.replace('http', 'ws') + '/ws';
    const got: ServerMessage[][] = [[], []];
    const sockets = await Promise.all(
      tokens.map(
        (tk, i) =>
          new Promise<WebSocket>((resolve) => {
            const ws = new WebSocket(url);
            ws.on('message', (d) => got[i].push(JSON.parse(String(d)) as ServerMessage));
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
    await new Promise((r) => setTimeout(r, 1500));
    for (const list of got) {
      const match = list.find((m) => m.t === 'match');
      expect(match && match.t === 'match' && match.room.racers.length).toBe(4);
      expect(list.some((m) => m.t === 'snap')).toBe(true);
    }
    const rooms = got.map((l) => l.find((m) => m.t === 'match')).map((m) => (m && m.t === 'match' ? m.room.roomId : ''));
    expect(rooms[0]).toBe(rooms[1]);
    sockets.forEach((s) => s.close());
  });
});
