// Remote player avatars: stylised surfer suit with visor, name tag and their equipped knife.

import * as THREE from 'three';
import { buildCollectible, disposeObject } from './skins.js';
import { DEFAULT_KNIFE } from '../../shared/catalog.js';

const PALETTE = [0x4cc9f0, 0xf72585, 0x80ed99, 0xffd166, 0xb388ff, 0xff8c42, 0x00f5d4, 0xef476f, 0x90e0ef, 0xc77dff];

function nameSprite(name) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  g.font = '600 30px system-ui, sans-serif';
  const w = Math.min(250, g.measureText(name).width + 28);
  g.fillStyle = 'rgba(8,10,20,0.6)';
  g.beginPath();
  g.roundRect((256 - w) / 2, 10, w, 44, 14);
  g.fill();
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(name, 128, 33);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(64, 16, 1);
  s.renderOrder = 10;
  return s;
}

export class Avatar {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.root = new THREE.Group();
    const color = PALETTE[id % PALETTE.length];
    const suit = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.2 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x15171d, roughness: 0.6, metalness: 0.3 });
    const visor = new THREE.MeshStandardMaterial({ color: 0x111122, emissive: color, emissiveIntensity: 0.6, roughness: 0.1, metalness: 0.8 });

    this.body = new THREE.Group();
    this.root.add(this.body);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(13, 26, 6, 12), suit);
    torso.rotation.x = Math.PI / 2;
    torso.position.z = 42;
    this.body.add(torso);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(13.5, 13.5, 5, 16), dark);
    belt.rotation.x = Math.PI / 2;
    belt.position.z = 32;
    this.body.add(belt);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(5.5, 22, 4, 8), dark);
      leg.rotation.x = Math.PI / 2;
      leg.position.set(0, s * 6.5, 15);
      this.body.add(leg);
    }
    this.head = new THREE.Group();
    this.head.position.z = 66;
    this.body.add(this.head);
    this.head.add(new THREE.Mesh(new THREE.SphereGeometry(9.5, 18, 14), suit));
    const v = new THREE.Mesh(new THREE.SphereGeometry(9.7, 18, 10, -Math.PI / 2.6, Math.PI / 1.3, Math.PI / 3, Math.PI / 3.2), visor);
    v.rotation.z = -Math.PI / 2;
    v.rotation.y = 0;
    this.head.add(v);

    this.arm = new THREE.Group();
    this.arm.position.set(4, -14, 50);
    this.body.add(this.arm);
    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(3.6, 16, 4, 8), suit);
    forearm.rotation.z = Math.PI / 2;
    forearm.position.x = 9;
    this.arm.add(forearm);
    this.hand = new THREE.Group();
    this.hand.position.set(20, 0, 0);
    this.arm.add(this.hand);

    this.tag = nameSprite(name);
    this.tag.position.z = 92;
    this.root.add(this.tag);
    this.knifeId = null;
    this.knife = null;
    this.lean = 0;
  }

  setName(name) {
    this.name = name;
    this.root.remove(this.tag);
    this.tag.material.map.dispose();
    this.tag.material.dispose();
    this.tag = nameSprite(name);
    this.tag.position.z = 92;
    this.root.add(this.tag);
  }

  setKnife(collectibleId) {
    const id = collectibleId || DEFAULT_KNIFE;
    if (id === this.knifeId) return;
    if (this.knife) { this.hand.remove(this.knife); disposeObject(this.knife); }
    this.knifeId = id;
    this.knife = buildCollectible(id);
    this.knife.scale.setScalar(0.55);
    this.knife.rotation.set(0, -0.3, 0);
    this.hand.add(this.knife);
  }

  /** @param s interpolated state {x,y,z,vx,vy,vz,yaw,pitch,mode} */
  update(s, dt, showTag) {
    this.root.position.set(s.x, s.y, s.z);
    this.root.rotation.z = s.yaw;
    // lean into turns from lateral velocity in the local frame
    const c = Math.cos(-s.yaw), sn = Math.sin(-s.yaw);
    const lat = c * s.vy + sn * s.vx;
    const target = Math.max(-0.5, Math.min(0.5, -lat / 1600));
    this.lean += (target - this.lean) * Math.min(1, dt * 6);
    this.body.rotation.x = this.lean;
    this.head.rotation.y = -s.pitch * 0.7;
    this.arm.rotation.y = -s.pitch * 0.5 + 0.2;
    this.tag.visible = showTag;
  }

  dispose() {
    disposeObject(this.root);
  }
}
