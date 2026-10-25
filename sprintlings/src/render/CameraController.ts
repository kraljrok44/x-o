import * as THREE from 'three';
import { damp } from '../shared/math';
import type { TrackPath } from './TrackPath';

/**
 * Third-person chase camera: slightly raised, behind the racer, looking ahead
 * so upcoming hazards stay visible. Uses damped follow (no snapping), widens
 * the FOV a little with speed and applies only gentle shake.
 */
export class CameraController {
  readonly camera: THREE.PerspectiveCamera;
  private s = 0;
  private lateral = 0;
  private y = 2;
  private fov = 62;
  private readonly target = new THREE.Vector3();
  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private shakeT = 0;
  /** Base field of view; adjusted for portrait screens. */
  baseFov = 62;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(this.fov, aspect, 0.1, 900);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    // Narrow (portrait) screens need a wider vertical FOV to keep all lanes visible.
    this.baseFov = aspect < 1 ? 62 + (1 - aspect) * 34 : 62;
    this.camera.updateProjectionMatrix();
  }

  snap(s: number, lateral: number, y: number): void {
    this.s = s;
    this.lateral = lateral * 0.55;
    this.y = y;
  }

  update(dt: number, path: TrackPath, s: number, lateral: number, y: number, speed: number, shake: number, intro = 0): void {
    this.s = damp(this.s, s, 14, dt);
    this.lateral = damp(this.lateral, lateral * 0.55, 5, dt);
    this.y = damp(this.y, y, y > this.y ? 3.2 : 6, dt);
    const back = 6.4 + intro * 4;
    const height = 3.1 + intro * 1.5;
    path.toWorld(this.s - back, this.lateral, this.y + height, this.pos);
    path.toWorld(this.s + 9, this.lateral * 0.6, this.y + 0.8, this.look);
    if (shake > 0) {
      this.shakeT += dt * 50;
      const k = shake * shake * 0.18;
      this.pos.x += Math.sin(this.shakeT * 1.3) * k;
      this.pos.y += Math.sin(this.shakeT * 1.7) * k;
    }
    this.camera.position.copy(this.pos);
    this.target.copy(this.look);
    this.camera.lookAt(this.target);
    const targetFov = this.baseFov + Math.max(0, speed - 9) * 1.6;
    this.fov = damp(this.fov, targetFov, 4, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
