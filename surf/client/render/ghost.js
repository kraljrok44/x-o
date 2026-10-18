// Record ghost: replays the map record's path in sync with your own run timer, as a see-through
// surfer with a glowing trail you can follow. Purely visual - it never collides with anything.

import * as THREE from 'three';
import { Avatar } from './avatars.js';
import { formatTime } from '../../shared/sim.js';

const TRAIL = 70; // samples behind the ghost (~3.5 s)

export class Ghost {
  constructor(scene) {
    this.scene = scene;
    this.data = null;
    this.av = null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(TRAIL * 3), 3));
    const col = new Float32Array(TRAIL * 3);
    for (let i = 0; i < TRAIL; i++) { const a = i / (TRAIL - 1); col[i * 3] = 0.3 * a; col[i * 3 + 1] = 0.85 * a; col[i * 3 + 2] = 1.0 * a; }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.trail = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.trail.frustumCulled = false;
    this.trail.visible = false;
    scene.add(this.trail);
  }

  /** @param d {name, ticks, every, frames:[[x,y,z,yaw],...]} or null */
  set(d) {
    this.data = d && d.frames && d.frames.length > 1 ? d : null;
    if (this.av) { this.scene.remove(this.av.root); this.av.dispose(); this.av = null; }
    if (!this.data) { this.trail.visible = false; return; }
    this.av = new Avatar(9, `WR ${formatTime(d.ticks)} · ${d.name}`);
    this.av.root.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material = o.material.clone();
        o.material.transparent = true;
        o.material.opacity = 0.38;
        o.material.depthWrite = false;
        if (o.material.emissive) { o.material.emissive.set(0x4fd8ff); o.material.emissiveIntensity = 0.6; }
      }
    });
    this.scene.add(this.av.root);
  }

  _at(f) {
    const F = this.data.frames;
    const i = Math.max(0, Math.min(F.length - 1, Math.floor(f)));
    const j = Math.min(F.length - 1, i + 1);
    const k = Math.max(0, Math.min(1, f - i));
    const a = F[i], b = F[j];
    let dy = b[3] - a[3];
    if (dy > Math.PI) dy -= Math.PI * 2;
    if (dy < -Math.PI) dy += Math.PI * 2;
    return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, z: a[2] + (b[2] - a[2]) * k, yaw: a[3] + dy * k, vx: 0, vy: 0, vz: 0, pitch: 0 };
  }

  /** runTicks: your own run time in ticks (0 while waiting in the start zone). */
  update(runTicks, dt, visible) {
    if (!this.data || !this.av) return;
    const show = !!visible;
    this.av.root.visible = show;
    this.trail.visible = show;
    if (!show) return;
    const f = runTicks / (this.data.every || 5);
    const s = this._at(f);
    this.av.update(s, dt, true);
    const pos = this.trail.geometry.attributes.position;
    for (let i = 0; i < TRAIL; i++) {
      const p = this._at(f - (TRAIL - 1 - i));
      pos.setXYZ(i, p.x, p.y, p.z + 36);
    }
    pos.needsUpdate = true;
  }

  dispose() {
    this.set(null);
    this.scene.remove(this.trail);
    this.trail.geometry.dispose();
    this.trail.material.dispose();
  }
}
