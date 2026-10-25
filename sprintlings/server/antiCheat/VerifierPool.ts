import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { verifyRace, type RaceTicket, type VerifyResult } from '../../src/game/RaceVerifier';

/**
 * Re-simulates submitted races off the main thread (a race takes a few
 * hundred ms of CPU). Falls back to inline verification when workers are
 * disabled (tests) or cannot start.
 */
export class VerifierPool {
  private readonly workers: Worker[] = [];
  private readonly pending = new Map<number, { resolve: (r: VerifyResult) => void; worker: Worker; ticket: RaceTicket; log: unknown }>();
  private next = 0;
  private seq = 0;

  constructor(useWorkers: boolean, size = Math.max(1, Math.min(4, availableParallelism() - 1))) {
    if (!useWorkers) return;
    try {
      for (let i = 0; i < size; i++) {
        // The boot file registers tsx's loader inside the worker (the server runs on tsx).
        const w = new Worker(new URL('./verifyWorkerBoot.mjs', import.meta.url));
        w.on('message', (m: { id: number; result: VerifyResult }) => {
          const p = this.pending.get(m.id);
          this.pending.delete(m.id);
          p?.resolve(m.result);
        });
        const fail = (err: unknown) => {
          console.error('[verifier] worker failed, verifying inline instead', err);
          this.workers.splice(this.workers.indexOf(w), 1);
          for (const [id, p] of this.pending) {
            if (p.worker !== w) continue;
            this.pending.delete(id);
            p.resolve(verifyRace(p.ticket, p.log));
          }
        };
        w.on('error', fail);
        w.on('exit', (code) => code !== 0 && this.workers.includes(w) && fail(new Error(`exit ${code}`)));
        w.unref();
        this.workers.push(w);
      }
    } catch (err) {
      console.warn('[verifier] workers unavailable, verifying inline', err);
      this.workers.length = 0;
    }
  }

  verify(ticket: RaceTicket, log: unknown): Promise<VerifyResult> {
    if (!this.workers.length) return Promise.resolve(verifyRace(ticket, log));
    const id = ++this.seq;
    const w = this.workers[this.next++ % this.workers.length];
    return new Promise((resolve) => {
      this.pending.set(id, { resolve, worker: w, ticket, log });
      w.postMessage({ id, ticket, log });
    });
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()));
  }
}
