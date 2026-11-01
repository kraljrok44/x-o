import { GameplayConfig } from '../config/GameplayConfig';
import { hazardExtent, type Hazard } from '../obstacles/ObstacleBase';

export type Biome = 'forest' | 'canyon' | 'crystal' | 'sunset' | 'snow';

export interface GroundPiece {
  id: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  oneWay: boolean;
  style?: 'cloud';
}

export interface ItemBoxDef {
  id: number;
  x: number;
  y: number;
}

export interface GlimmerDef {
  id: number;
  x: number;
  y: number;
}

export interface PlacedSegment {
  templateId: string;
  x0: number;
  x1: number;
  difficulty: number;
}

export interface TrackData {
  id: string;
  name: string;
  biome: Biome;
  seed: number;
  length: number;
  pieces: GroundPiece[];
  hazards: Hazard[];
  itemBoxes: ItemBoxDef[];
  glimmers: GlimmerDef[];
  segments: PlacedSegment[];
}

const BUCKET = 4;

export function surfaceAt(p: GroundPiece, x: number): number {
  if (p.x1 === p.x0) return p.y0;
  return p.y0 + ((p.y1 - p.y0) * (x - p.x0)) / (p.x1 - p.x0);
}

export class Track {
  readonly data: TrackData;
  readonly length: number;
  readonly maxHazardReach: number;
  private readonly buckets: Int32Array[];
  lastPiece = -1;
  private readonly oneWayIds = new Set<number>();

  constructor(data: TrackData) {
    this.data = data;
    this.length = data.length;
    data.pieces.sort((a, b) => a.x0 - b.x0);
    const count = Math.ceil((data.length + 80) / BUCKET) + 4;
    const lists: number[][] = Array.from({ length: count }, () => []);
    data.pieces.forEach((p, i) => {
      const b0 = Math.max(0, Math.floor((p.x0 + 20) / BUCKET));
      const b1 = Math.min(count - 1, Math.floor((p.x1 + 20) / BUCKET));
      for (let b = b0; b <= b1; b++) lists[b].push(i);
    });
    this.buckets = lists.map((l) => Int32Array.from(l));
    for (const p of data.pieces) if (p.oneWay) this.oneWayIds.add(p.id);
    for (const h of data.hazards) {
      const g = this.groundBelow(h.x, h.onTop ? h.onTop : 50, -1, !!h.onTop);
      h.y = Number.isNaN(g) ? 0 : g;
    }
    data.hazards.sort((a, b) => a.x - b.x);
    let reach = 0;
    for (const h of data.hazards) {
      const [lo, hi] = hazardExtent(h);
      reach = Math.max(reach, h.x - lo, hi - h.x);
    }
    this.maxHazardReach = reach;
  }

  isOneWay(pieceId: number): boolean {
    return this.oneWayIds.has(pieceId);
  }

  get biome(): Biome {
    return this.data.biome;
  }

  private bucket(x: number): Int32Array {
    const b = Math.floor((x + 20) / BUCKET);
    return this.buckets[b < 0 ? 0 : b >= this.buckets.length ? this.buckets.length - 1 : b];
  }

  groundBelow(x: number, maxY: number, ignoreId: number, oneWayOk = true): number {
    const list = this.bucket(x);
    let best = Number.NaN;
    this.lastPiece = -1;
    for (let i = 0; i < list.length; i++) {
      const p = this.data.pieces[list[i]];
      if (x < p.x0 || x > p.x1) continue;
      if (p.oneWay && (!oneWayOk || p.id === ignoreId)) continue;
      const top = surfaceAt(p, x);
      if (top > maxY) continue;
      if (Number.isNaN(best) || top > best) {
        best = top;
        this.lastPiece = p.id;
      }
    }
    return best;
  }

  solidAt(x: number, y0: number): boolean {
    const list = this.bucket(x);
    for (let i = 0; i < list.length; i++) {
      const p = this.data.pieces[list[i]];
      if (p.oneWay || x < p.x0 || x > p.x1) continue;
      if (surfaceAt(p, x) > y0 + GameplayConfig.jump.stepUp) return true;
    }
    return false;
  }

  solidTop(x: number): number {
    return this.groundBelow(x, 1e9, -1, false);
  }

  firstHazardIndex(x0: number): number {
    const hz = this.data.hazards;
    const target = x0 - this.maxHazardReach;
    let lo = 0;
    let hi = hz.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (hz[mid].x < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  forHazardsNear(x0: number, x1: number, visit: (h: Hazard) => void): void {
    const hz = this.data.hazards;
    const end = x1 + this.maxHazardReach;
    for (let i = this.firstHazardIndex(x0); i < hz.length && hz[i].x <= end; i++) {
      const [lo, hi] = hazardExtent(hz[i]);
      if (hi >= x0 && lo <= x1) visit(hz[i]);
    }
  }

  findRespawn(fromX: number): { x: number; y: number } {
    for (let x = Math.max(0, fromX); x < this.length + 20; x += 0.5) {
      const y = this.solidTop(x);
      if (Number.isNaN(y)) continue;
      let ok = true;
      for (let d = 0.5; d <= 2.5 && ok; d += 0.5) {
        const y2 = this.solidTop(x + d);
        if (Number.isNaN(y2) || Math.abs(y2 - y) > 0.4) ok = false;
      }
      if (!ok) continue;
      let blocked = false;
      this.forHazardsNear(x - 1, x + 3, (h) => {
        if (h.kind !== 'mud' && h.kind !== 'boostPad') blocked = true;
      });
      if (!blocked) return { x: x + GameplayConfig.fall.respawnOffset, y };
    }
    return { x: fromX, y: 0 };
  }
}
