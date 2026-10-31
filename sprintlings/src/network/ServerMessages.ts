import type { RacerSetup } from '../game/RaceManager';
import type { RaceEventType } from '../game/RaceState';
import type { RaceSettlement } from '../economy/EconomyService';

/**
 * WebSocket protocol for online races (server/matchmaking). Lockstep: the
 * server runs the authoritative RaceSimulation and relays, tick by tick,
 * the input every player had at that tick; each client steps the same
 * deterministic simulation with exactly those inputs, so all screens show
 * the same race. A periodic state hash detects drift.
 */
export type ClientMessage =
  | { t: 'hello'; token: string }
  | { t: 'queue'; trackId?: string }
  | { t: 'leave' }
  /** The course is loaded on this client; the room starts when everyone is ready. */
  | { t: 'ready' }
  /** bits: 1 jump held, 2 down held, 4 special, 8 use (same as RaceReplay). Applied at `tick` (or as soon as possible). */
  | { t: 'input'; tick: number; bits: number };

export interface RoomInfo {
  roomId: string;
  trackId: string;
  seed: number;
  racers: RacerSetup[];
  yourIndex: number;
  /** Ticks between sampling an input and the tick it is applied at. */
  inputDelay: number;
}

/** Compact racer state: [x, y, phaseCode, stun>0, item index or -1, finishTime or -1]. */
export type RacerSnap = [number, number, number, number, number, number];

export type ServerMessage =
  | { t: 'welcome'; accountId: string }
  | { t: 'queued'; players: number; startsInMs: number }
  | { t: 'match'; room: RoomInfo }
  | { t: 'snap'; tick: number; racers: RacerSnap[] }
  /** Inputs applied at ticks from, from+1, ...: one bits value per racer (bots 0). */
  | { t: 'ticks'; from: number; inputs: number[][] }
  | { t: 'hash'; tick: number; h: number }
  | { t: 'events'; tick: number; events: { type: RaceEventType; racer: number; value: number }[] }
  | { t: 'end'; standings: { index: number; place: number; finishTime: number | null }[]; coins?: number; settlement?: RaceSettlement }
  | { t: 'error'; message: string };

export const PHASE_CODES = ['grid', 'run', 'fall', 'respawn', 'finished'] as const;
