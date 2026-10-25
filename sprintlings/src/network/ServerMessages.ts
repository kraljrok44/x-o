import type { RacerSetup } from '../game/RaceManager';
import type { RaceEventType } from '../game/RaceState';

/**
 * WebSocket protocol for online races (server/matchmaking). The server runs
 * the authoritative RaceSimulation; clients only send inputs and render
 * snapshots.
 */
export type ClientMessage =
  | { t: 'hello'; token: string }
  | { t: 'queue'; trackId?: string }
  | { t: 'leave' }
  /** bits: 1 jump held, 2 left, 4 right, 8 use (same as RaceReplay). */
  | { t: 'input'; tick: number; bits: number };

export interface RoomInfo {
  roomId: string;
  trackId: string;
  seed: number;
  racers: RacerSetup[];
  yourIndex: number;
}

/** Compact racer state: [x, y, phaseCode, stun>0, item index or -1, finishTime or -1]. */
export type RacerSnap = [number, number, number, number, number, number];

export type ServerMessage =
  | { t: 'welcome'; accountId: string }
  | { t: 'queued'; players: number; startsInMs: number }
  | { t: 'match'; room: RoomInfo }
  | { t: 'snap'; tick: number; racers: RacerSnap[] }
  | { t: 'events'; tick: number; events: { type: RaceEventType; racer: number; value: number }[] }
  | { t: 'end'; standings: { index: number; place: number; finishTime: number | null }[]; coins?: number }
  | { t: 'error'; message: string };

export const PHASE_CODES = ['grid', 'run', 'fall', 'respawn', 'finished'] as const;
