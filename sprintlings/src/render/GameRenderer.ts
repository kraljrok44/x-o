import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export type GraphicsQuality = 'low' | 'medium' | 'high';

export function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && canvas.getContext('webgl2')) || !!canvas.getContext('webgl');
  } catch {
    return false;
  }
}

/** Picks a sensible default quality from the device. */
export function detectQuality(): GraphicsQuality {
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1100);
  const cores = navigator.hardwareConcurrency ?? 4;
  if (mobile) return cores >= 8 ? 'medium' : 'low';
  return cores >= 6 ? 'high' : 'medium';
}

/**
 * Owns the single WebGL context. Quality changes pixel ratio, shadows and
 * the bloom pass; anti-aliasing is fixed at context creation (a quality
 * change re-creates the renderer).
 */
export class GameRenderer {
  renderer!: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private renderPass: RenderPass | null = null;
  quality: GraphicsQuality;
  width = 1;
  height = 1;
  private readonly container: HTMLElement;
  onContextLost: (() => void) | null = null;

  constructor(container: HTMLElement, quality: GraphicsQuality) {
    this.container = container;
    this.quality = quality;
    this.create();
    window.addEventListener('resize', () => this.resize());
  }

  private create(): void {
    if (this.renderer) {
      this.renderer.domElement.remove();
      this.renderer.dispose();
    }
    const r = new THREE.WebGLRenderer({
      antialias: this.quality !== 'low',
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = this.quality !== 'low';
    r.shadowMap.type = THREE.PCFShadowMap;
    r.domElement.id = 'game-canvas';
    r.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.onContextLost?.();
    });
    this.container.prepend(r.domElement);
    this.renderer = r;
    this.composer = null;
    this.resize();
  }

  setQuality(q: GraphicsQuality): void {
    if (q === this.quality) return;
    this.quality = q;
    this.create();
  }

  get pixelRatio(): number {
    const dpr = window.devicePixelRatio || 1;
    return this.quality === 'low' ? Math.min(dpr, 1) : this.quality === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
  }

  resize(): void {
    this.width = Math.max(1, this.container.clientWidth || window.innerWidth);
    this.height = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height);
    this.composer?.setSize(this.width, this.height);
    this.composer?.setPixelRatio(this.pixelRatio);
  }

  get aspect(): number {
    return this.width / this.height;
  }

  render(scene: THREE.Scene, camera: THREE.Camera, bloomStrength = 0.55): void {
    if (this.quality === 'high') {
      if (!this.composer) {
        this.composer = new EffectComposer(this.renderer);
        this.renderPass = new RenderPass(scene, camera);
        this.composer.addPass(this.renderPass);
        this.bloom = new UnrealBloomPass(new THREE.Vector2(this.width, this.height), bloomStrength, 0.55, 0.82);
        this.composer.addPass(this.bloom);
        this.composer.addPass(new OutputPass());
        this.composer.setPixelRatio(this.pixelRatio);
        this.composer.setSize(this.width, this.height);
      }
      this.renderPass!.scene = scene;
      this.renderPass!.camera = camera;
      this.bloom!.strength = bloomStrength;
      this.composer.render();
    } else {
      this.renderer.render(scene, camera);
    }
  }
}
