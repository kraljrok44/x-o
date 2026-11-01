import type { RacerSetup } from '../game/RaceManager';
import type { RaceEventType } from '../game/RaceState';
import type { RaceSettlement } from '../economy/EconomyService';

export type ClientMessage =
  | { t: 'hello'; token: string }
  | { t: 'queue'; trackId?: string }
  | { t: 'leave' }
  | { t: 'ready' }
  | { t: 'input'; tick: number; bits: number };

export interface RoomInfo {
  roomId: string;
  trackId: string;
  seed: number;
  racers: RacerSetup[];
  yourIndex: number;
  inputDelay: number;
}

export type RacerSnap = [number, number, number, number, number, number];

export type ServerMessage =
  | { t: 'welcome'; accountId: string }
  | { t: 'queued'; players: number; startsInMs: number }
  | { t: 'match'; room: RoomInfo }
  | { t: 'snap'; tick: number; racers: RacerSnap[] }
  | { t: 'ticks'; from: number; inputs: number[][] }
  | { t: 'hash'; tick: number; h: number }
  | { t: 'events'; tick: number; events: { type: RaceEventType; racer: number; value: number }[] }
  | { t: 'end'; standings: { index: number; place: number; finishTime: number | null }[]; coins?: number; settlement?: RaceSettlement }
  | { t: 'error'; message: string };

export const PHASE_CODES = ['grid', 'run', 'fall', 'respawn', 'finished'] as const;
