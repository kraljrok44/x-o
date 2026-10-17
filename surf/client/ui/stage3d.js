// Shared WebGL renderer for menu 3D views (vault, knife viewer, inventory thumbnails).

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildCollectible, disposeObject } from '../render/skins.js';

class Stage3D {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'stage3d';
    this.renderer = null;
    this.thumbCache = new Map();
  }

  init() {
    if (this.renderer) return;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true }));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const pm = new THREE.PMREMGenerator(r);
    this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    // thumbnail scene
    this.tScene = new THREE.Scene();
    this.tScene.environment = this.env;
    const k = new THREE.DirectionalLight(0xffffff, 1.6);
    k.position.set(2, 4, 6);
    this.tScene.add(k, new THREE.AmbientLight(0xffffff, 0.3));
    this.tCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);
  }

  attach(container) {
    this.init();
    container.appendChild(this.canvas);
    this.fit();
  }

  fit() {
    const p = this.canvas.parentElement;
    if (!p) return;
    const w = p.clientWidth || 300, h = p.clientHeight || 200;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    return { w, h };
  }

  /** Render a knife thumbnail and return it as a data URL (cached). */
  thumbnail(collectibleId, w = 240, h = 120) {
    if (this.thumbCache.has(collectibleId)) return this.thumbCache.get(collectibleId);
    this.init();
    const r = this.renderer;
    const prevParent = this.canvas.parentElement;
    const size = new THREE.Vector2();
    r.getSize(size);
    r.setSize(w, h, false);
    const knife = buildCollectible(collectibleId);
    knife.rotation.set(0.35, 0.25, 0.32);
    knife.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(knife);
    const c = box.getCenter(new THREE.Vector3());
    knife.position.sub(c);
    const sx = (box.max.x - box.min.x) / 2, sy = (box.max.y - box.min.y) / 2;
    const aspect = w / h;
    const half = Math.max(sx / aspect, sy) * 1.12;
    this.tCam.left = -half * aspect; this.tCam.right = half * aspect; this.tCam.top = half; this.tCam.bottom = -half;
    this.tCam.updateProjectionMatrix();
    this.tScene.add(knife);
    r.setClearColor(0x000000, 0);
    r.render(this.tScene, this.tCam);
    const url = this.canvas.toDataURL('image/png');
    this.tScene.remove(knife);
    disposeObject(knife);
    if (prevParent) r.setSize(size.x, size.y, false);
    this.thumbCache.set(collectibleId, url);
    return url;
  }
}

export const stage3d = new Stage3D();
