import { damp } from './draw';

/**
 * Side-scrolling camera. World units are metres-ish with +y up; the camera
 * keeps the followed racer about a third from the left so you can see what
 * is coming, and eases vertically so jumps feel big but stay readable.
 */
export class Camera2D {
  /** World point mapped to the anchor on screen. */
  x = 0;
  y = 0;
  /** Pixels per world unit. */
  scale = 80;
  width = 1;
  height = 1;
  anchorX = 0.32;
  anchorY = 0.64;
  shakeX = 0;
  shakeY = 0;
  private shakeT = 0;
  private shakeAmp = 0;
  zoom = 1;

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    // Portrait phones trade look-ahead for bigger monsters and sit the
    // action lower, above the touch buttons.
    const portrait = width < height;
    const wUnits = portrait ? 9.5 : 19;
    this.scale = Math.min(width / wUnits, height / 9.5) * this.zoom;
    this.anchorX = portrait ? 0.24 : 0.32;
    this.anchorY = portrait ? 0.62 : 0.64;
  }

  snap(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  /** Eases toward a target (x follows tightly, y lazily). */
  follow(dt: number, tx: number, ty: number): void {
    this.x += (tx - this.x) * damp(14, dt);
    this.y += (ty - this.y) * damp(4.5, dt);
  }

  shake(amount: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
  }

  updateShake(dt: number, enabled: boolean): void {
    this.shakeT += dt;
    this.shakeAmp *= Math.exp(-dt * 7);
    if (!enabled || this.shakeAmp < 0.002) {
      this.shakeX = this.shakeY = 0;
      return;
    }
    this.shakeX = Math.sin(this.shakeT * 61) * this.shakeAmp * this.scale;
    this.shakeY = Math.cos(this.shakeT * 47) * this.shakeAmp * this.scale;
  }

  sx(wx: number): number {
    return (wx - this.x) * this.scale + this.width * this.anchorX + this.shakeX;
  }

  sy(wy: number): number {
    return this.height * this.anchorY - (wy - this.y) * this.scale + this.shakeY;
  }

  /** Visible world bounds (with margin). */
  get left(): number {
    return this.x - (this.width * this.anchorX) / this.scale - 1;
  }
  get right(): number {
    return this.x + (this.width * (1 - this.anchorX)) / this.scale + 1;
  }
  get bottom(): number {
    return this.y - (this.height * (1 - this.anchorY)) / this.scale - 1;
  }
  get top(): number {
    return this.y + (this.height * this.anchorY) / this.scale + 1;
  }

  /** Switches the context to world space (+y up). `pr` is the device pixel ratio. */
  applyWorld(ctx: CanvasRenderingContext2D, pr: number): void {
    const s = this.scale * pr;
    ctx.setTransform(s, 0, 0, -s, pr * (this.width * this.anchorX - this.x * this.scale + this.shakeX), pr * (this.height * this.anchorY + this.y * this.scale + this.shakeY));
  }

  applyScreen(ctx: CanvasRenderingContext2D, pr: number): void {
    ctx.setTransform(pr, 0, 0, pr, 0, 0);
  }
}
