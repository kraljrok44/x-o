// Optional forwarding of scores to the CrazyGames leaderboard (server-side API).
// CrazyGames allows one leaderboard per game, so we submit the overall GLIDE points
// (higher is better) of players who are logged in with a CrazyGames account.
// Enable with CG_LEADERBOARD_API_KEY (from the CrazyGames developer portal; leaderboards are
// invite-only). The endpoint can be overridden with CG_LEADERBOARD_URL.

const URL_DEFAULT = 'https://leaderboard.crazygames.com/leaderboard/scores';

export function createCrazyLeaderboard({ apiKey = process.env.CG_LEADERBOARD_API_KEY, url = process.env.CG_LEADERBOARD_URL || URL_DEFAULT, log = console.log, fetchImpl = globalThis.fetch } = {}) {
  const queue = new Map(); // userId -> latest score (only the newest matters)
  let timer = null;

  async function flush() {
    if (!queue.size) return;
    const scores = [...queue.entries()].slice(0, 100).map(([userId, s]) => ({ userId, score: s.score, timestamp: new Date(s.at).toISOString() }));
    for (const s of scores) queue.delete(s.userId);
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({ scores }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) log('CrazyGames leaderboard error', res.status, JSON.stringify(body).slice(0, 300));
      else if (body.failureCount) log('CrazyGames leaderboard partial failure', JSON.stringify(body.errors || []).slice(0, 300));
    } catch (e) {
      // network problem: put the scores back and retry on the next flush
      for (const s of scores) if (!queue.has(s.userId)) queue.set(s.userId, { score: s.score, at: Date.parse(s.timestamp) });
      log('CrazyGames leaderboard unreachable', e.message);
    }
  }

  function schedule() {
    if (timer) return;
    timer = setTimeout(async () => { timer = null; await flush(); if (queue.size) schedule(); }, 10000);
    if (timer.unref) timer.unref();
  }

  return {
    enabled: !!apiKey,
    /** Called by rooms whenever a player's overall points improve. */
    submit(key, points) {
      if (!apiKey || !String(key).startsWith('cg:')) return;
      queue.set(String(key).slice(3), { score: points, at: Date.now() });
      schedule();
    },
    flush,
  };
}
