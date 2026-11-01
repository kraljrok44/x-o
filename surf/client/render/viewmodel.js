// First-person knife viewmodel. Rendered in its own scene and camera on top of the world
// (separate FOV and lighting) so it never clips into geometry and never changes physics (spec 8.4).

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { buildCollectible, disposeObject } from './skins.js';
import { DEFAULT_KNIFE } from '../../shared/catalog.js';

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export class ViewModel {
  constructor(renderer) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.5, 200);
    const pm = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-2, 3, 4);
    this.scene.add(key, new THREE.AmbientLight(0xffffff, 0.35));

    this.rig = new THREE.Group();   // sway / bob
    this.anim = new THREE.Group();  // draw / inspect / slash
    this.scene.add(this.rig);
    this.rig.add(this.anim);
    this.hand = this._buildHand();
    this.anim.add(this.hand);
    this.knife = null;
    this.knifeId = null;
    this.state = { kind: 'draw', t: 0 };
    // resting pose in view space (camera looks down -Z): bottom right, blade forward-left
    this.pose = { x: 8.8, y: -8.2, z: -27, rx: 0.18, ry: 2.2, rz: 0.4, scale: 0.78 };
    this.sway = new THREE.Vector2();
    this.bobT = 0;
    this.visible = true;
  }

  _buildHand() {
    // gloved right hand wrapped around the grip (knuckles and thumb face the camera)
    const g = new THREE.Group();
    const glove = new THREE.MeshStandardMaterial({ color: 0x1d2027, roughness: 0.7, metalness: 0.05 });
    const knuckle = new THREE.MeshStandardMaterial({ color: 0x2c313b, roughness: 0.55, metalness: 0.1 });
    const cuff = new THREE.MeshStandardMaterial({ color: 0x00b8d4, roughness: 0.4, metalness: 0.2, emissive: 0x00363f });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x343a48, roughness: 0.85 });
    const palm = new THREE.Mesh(new RoundedBoxGeometry(5.0, 4.6, 3.8, 3, 1.1), glove);
    palm.position.set(-4.2, 0.6, 0.6);
    g.add(palm);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.78, 1.6, 4, 8), i % 2 ? glove : knuckle);
      f.rotation.x = Math.PI / 2;
      f.position.set(-2.4 - i * 1.3, -0.9 + Math.sin(i * 0.9) * 0.15, -1.55);
      g.add(f);
    }
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.85, 2.6, 4, 8), knuckle);
    thumb.rotation.z = Math.PI / 2 - 0.35;
    thumb.position.set(-2.0, 2.0, -0.9);
    g.add(thumb);
    const wrist = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.5, 2.2, 16), cuff);
    wrist.rotation.z = Math.PI / 2 + 0.3;
    wrist.position.set(-7.6, -0.4, 0.6);
    g.add(wrist);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.4, 20, 14), sleeve);
    arm.rotation.z = Math.PI / 2 + 0.3;
    arm.position.set(-17.5, -3.6, 0.8);
    g.add(arm);
    return g;
  }

  setKnife(collectibleId) {
    const id = collectibleId || DEFAULT_KNIFE;
    if (id === this.knifeId) return;
    if (this.knife) { this.hand.remove(this.knife); disposeObject(this.knife); }
    this.knifeId = id;
    this.knife = buildCollectible(id);
    this.knife.position.set(-1.6, 0, 0);
    this.hand.add(this.knife);
    this.play('draw');
  }

  play(kind) {
    if (kind === 'slash' && this.state.kind === 'inspect') return;
    this.state = { kind, t: 0 };
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * @param dt seconds
   * @param o {speed, onGround, mouseDX, mouseDY, bob:boolean, reduceMotion:boolean}
   */
  update(dt, o) {
    // base pose: bottom right, blade pointing forward-left (camera looks down -Z in view space)
    const base = this.pose;
    this.sway.x += (-o.mouseDX * 0.0018 - this.sway.x) * Math.min(1, dt * 10);
    this.sway.y += (o.mouseDY * 0.0018 - this.sway.y) * Math.min(1, dt * 10);
    this.sway.x = Math.max(-0.12, Math.min(0.12, this.sway.x));
    this.sway.y = Math.max(-0.12, Math.min(0.12, this.sway.y));
    const sp = Math.min(1, o.speed / 260);
    if (o.bob && o.onGround) this.bobT += dt * (4 + sp * 6);
    const bob = o.bob && !o.reduceMotion ? sp * (o.onGround ? 1 : 0.15) : 0;
    this.rig.position.set(base.x + Math.sin(this.bobT) * 0.35 * bob + this.sway.x * 6, base.y + Math.abs(Math.cos(this.bobT)) * 0.4 * bob + this.sway.y * 6, base.z);
    this.rig.rotation.set(base.rx + this.sway.y * 0.6, base.ry + this.sway.x, base.rz);
    this.rig.scale.setScalar(base.scale);

    // animation layer
    const s = this.state;
    s.t += dt;
    this.anim.position.set(0, 0, 0);
    this.anim.rotation.set(0, 0, 0);
    if (s.kind === 'draw') {
      const k = ease(Math.min(1, s.t / 0.55));
      this.anim.position.y = -12 * (1 - k);
      this.anim.rotation.z = -1.2 * (1 - k);
      this.anim.rotation.x = 0.8 * (1 - k);
      if (s.t > 0.55) this.state = { kind: 'idle', t: 0 };
    } else if (s.kind === 'inspect') {
      const T = 2.6, t = s.t / T;
      if (t >= 1) this.state = { kind: 'idle', t: 0 };
      else {
        const up = Math.sin(Math.min(1, t * 3) * Math.PI / 2) * (1 - ease(Math.max(0, (t - 0.85) / 0.15)));
        this.anim.position.set(-8 * up, 5 * up, 3 * up);
        this.anim.rotation.y = 1.15 * up;
        // flip to show both flats of the blade
        this.anim.rotation.x = ease(Math.max(0, Math.min(1, (t - 0.35) / 0.3))) * Math.PI * (1 - ease(Math.max(0, (t - 0.75) / 0.2)));
        this.anim.rotation.z = Math.sin(t * Math.PI) * 0.25;
      }
    } else if (s.kind === 'slash') {
      const T = 0.38, t = s.t / T;
      if (t >= 1) this.state = { kind: 'idle', t: 0 };
      else {
        const a = Math.sin(t * Math.PI);
        this.anim.position.set(-6 * a, 3 * a, -4 * a);
        this.anim.rotation.y = 0.9 * a;
        this.anim.rotation.z = -0.6 * Math.sin(t * Math.PI * 2) * (1 - t);
      }
    }
  }

  render(renderer) {
    if (!this.visible || !this.knife) return;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}
