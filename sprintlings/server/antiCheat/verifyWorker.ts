import { parentPort } from 'node:worker_threads';
import { verifyRace, type RaceTicket } from '../../src/game/RaceVerifier';

parentPort?.on('message', (msg: { id: number; ticket: RaceTicket; log: unknown }) => {
  try {
    parentPort!.postMessage({ id: msg.id, result: verifyRace(msg.ticket, msg.log) });
  } catch (e) {
    parentPort!.postMessage({ id: msg.id, result: { ok: false, reason: `error: ${(e as Error).message}` } });
  }
});
