export type GraphicsQuality = 'low' | 'medium' | 'high';

/** Picks a sensible default quality from the device. */
export function detectQuality(): GraphicsQuality {
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1100);
  const cores = navigator.hardwareConcurrency ?? 4;
  // Keep small devices light, but let current phones use the same rich pass
  // as desktop. The backing-store cap still protects very high-DPR displays.
  if (mobile) return cores >= 8 ? 'high' : cores >= 6 ? 'medium' : 'low';
  return cores >= 6 ? 'high' : 'medium';
}

export function isCanvasAvailable(): boolean {
  try {
    return !!document.createElement('canvas').getContext('2d');
  } catch {
    return false;
  }
}

/**
 * Owns the main 2D canvas. Quality sets the backing-store resolution and
 * how much decoration/particles the painters draw. All drawing happens in
 * CSS pixels; the device-pixel scale is applied by begin().
 */
export class GameRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  quality: GraphicsQuality;
  width = 1;
  height = 1;
  private readonly container: HTMLElement;
  onContextLost: (() => void) | null = null;
  /** Bumped on every resize so painters can rebuild cached layers. */
  generation = 0;

  constructor(container: HTMLElement, quality: GraphicsQuality) {
    this.container = container;
    this.quality = quality;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'game-canvas';
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas not available');
    this.ctx = ctx;
    this.canvas.addEventListener('contextlost', () => this.onContextLost?.());
    container.prepend(this.canvas);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(q: GraphicsQuality): void {
    if (q === this.quality) return;
    this.quality = q;
    this.resize();
  }

  get pixelRatio(): number {
    const dpr = window.devicePixelRatio || 1;
    return this.quality === 'low' ? Math.min(dpr, 1) : this.quality === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
  }

  resize(): void {
    this.width = Math.max(1, this.container.clientWidth || window.innerWidth);
    this.height = Math.max(1, this.container.clientHeight || window.innerHeight);
    const pr = this.pixelRatio;
    this.canvas.width = Math.round(this.width * pr);
    this.canvas.height = Math.round(this.height * pr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.generation++;
  }

  get aspect(): number {
    return this.width / this.height;
  }

  /** Resets the transform to CSS pixels and returns the context. */
  begin(): CanvasRenderingContext2D {
    const c = this.ctx;
    c.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = this.quality === 'high' ? 'high' : 'medium';
    return c;
  }
}
