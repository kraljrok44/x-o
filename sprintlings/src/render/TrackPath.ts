import * as THREE from 'three';
import type { Track } from '../game/Track';

const STEP = 0.5;

/**
 * Maps simulation track space (s, lateral, y) to world space. The simulation
 * is straight; the renderer bends it along gentle curves (track curveKeys)
 * so the 3D view feels like a winding path without affecting physics.
 * World forward at s = 0 is -Z, right is +X.
 */
export class TrackPath {
  private readonly xs: Float32Array;
  private readonly zs: Float32Array;
  private readonly headings: Float32Array;
  private readonly start: number;
  readonly count: number;

  constructor(track: Track) {
    this.start = -40;
    const end = track.length + 80;
    this.count = Math.ceil((end - this.start) / STEP) + 1;
    this.xs = new Float32Array(this.count);
    this.zs = new Float32Array(this.count);
    this.headings = new Float32Array(this.count);
    const keys = track.data.curveKeys;
    let x = 0;
    let z = 0;
    let heading = 0;
    // Integrate from s = 0 in both directions so s = 0 is the origin.
    const zeroIndex = Math.round(-this.start / STEP);
    const curvatureAt = (s: number): number => {
      if (keys.length === 0) return 0;
      for (let i = keys.length - 1; i >= 0; i--) {
        if (s >= keys[i].s) {
          const next = keys[i + 1];
          if (!next) return keys[i].k;
          const t = (s - keys[i].s) / (next.s - keys[i].s);
          // Blend curvature across the first quarter of each segment for smooth bends.
          const blend = Math.min(1, t * 4);
          const prev = i > 0 ? keys[i - 1].k : 0;
          return prev + (keys[i].k - prev) * blend;
        }
      }
      return 0;
    };
    for (let i = zeroIndex; i < this.count; i++) {
      this.xs[i] = x;
      this.zs[i] = z;
      this.headings[i] = heading;
      const s = this.start + i * STEP;
      heading += curvatureAt(s) * STEP;
      x += Math.sin(heading) * STEP;
      z -= Math.cos(heading) * STEP;
    }
    x = 0;
    z = 0;
    heading = 0;
    for (let i = zeroIndex - 1; i >= 0; i--) {
      x -= Math.sin(heading) * STEP;
      z += Math.cos(heading) * STEP;
      this.xs[i] = x;
      this.zs[i] = z;
      this.headings[i] = heading;
    }
  }

  /** Heading (radians, 0 = facing -Z, positive turns right) at s. */
  heading(s: number): number {
    const p = (s - this.start) / STEP;
    const i = Math.max(0, Math.min(this.count - 2, Math.floor(p)));
    const f = Math.max(0, Math.min(1, p - i));
    return this.headings[i] + (this.headings[i + 1] - this.headings[i]) * f;
  }

  /** World position for track coordinates; writes into `out`. */
  toWorld(s: number, lateral: number, y: number, out: THREE.Vector3): THREE.Vector3 {
    const p = (s - this.start) / STEP;
    const i = Math.max(0, Math.min(this.count - 2, Math.floor(p)));
    const f = Math.max(0, Math.min(1, p - i));
    const cx = this.xs[i] + (this.xs[i + 1] - this.xs[i]) * f;
    const cz = this.zs[i] + (this.zs[i + 1] - this.zs[i]) * f;
    const h = this.headings[i] + (this.headings[i + 1] - this.headings[i]) * f;
    // Right vector for heading h: (cos h, 0, sin h)
    out.set(cx + Math.cos(h) * lateral, y, cz + Math.sin(h) * lateral);
    return out;
  }

  /** Rotation around Y that makes an object face down the track at s. */
  yaw(s: number): number {
    return -this.heading(s);
  }

  /** Exposed for mesh builders that walk the path. */
  get stepSize(): number {
    return STEP;
  }

  get startS(): number {
    return this.start;
  }
}
