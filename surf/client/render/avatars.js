// Remote player avatars: stylised surfer suit with visor, name tag and their equipped knife.

import * as THREE from 'three';
import { buildCollectible, disposeObject } from './skins.js';
import { DEFAULT_KNIFE } from '../../shared/catalog.js';
import { skinForId, cleanSkin } from '../../shared/skin.js';
import { buildBlockPlayer, animateBlockPlayer, disposeBlockPlayer } from './mcavatar.js';

const PALETTE = [0x4cc9f0, 0xf72585, 0x80ed99, 0xffd166, 0xb388ff, 0xff8c42, 0x00f5d4, 0xef476f, 0x90e0ef, 0xc77dff];

function nameSprite(name) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  g.font = '700 30px "Courier New", monospace';
  const w = Math.min(250, g.measureText(name).width + 28);
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect((256 - w) / 2, 10, w, 44);
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

const SCALE = 40; // the block model is 1.8 tall, the player 72 units

export class Avatar {
  constructor(id, name, skin) {
    this.id = id;
    this.name = name;
    this.root = new THREE.Group();
    this.knifeId = null;
    this.knife = null;
    this.skinKey = '';
    this.setSkin(skin || skinForId(id));
    this.tag = nameSprite(name);
    this.tag.position.z = 90;
    this.root.add(this.tag);
  }

  setSkin(skin) {
    if (skin && skin === this.skinSrc) return; // same object as last time: nothing changed
    this.skinSrc = skin;
    const clean = cleanSkin(skin || skinForId(this.id));
    const key = JSON.stringify(clean);
    if (key === this.skinKey) return;
    this.skinKey = key;
    if (this.model) { this.root.remove(this.model); if (this.knife) { this.hand.remove(this.knife); } disposeBlockPlayer(this.model); }
    // world is Z-up and the player faces +X at yaw 0; the model is Y-up and faces +Z
    this.model = new THREE.Group();
    this.model.rotation.z = Math.PI / 2;
    this.inner = buildBlockPlayer(clean);
    this.inner.rotation.x = Math.PI / 2;
    this.inner.scale.setScalar(SCALE);
    this.model.add(this.inner);
    this.root.add(this.model);
    this.hand = this.inner.userData.hand;
    this.head = this.inner.userData.head;
    this.arm = this.inner.userData.armR;
    if (this.knife) { this.hand.add(this.knife); }
  }

  setName(name) {
    this.name = name;
    this.root.remove(this.tag);
    this.tag.material.map.dispose();
    this.tag.material.dispose();
    this.tag = nameSprite(name);
    this.tag.position.z = 90;
    this.root.add(this.tag);
  }

  setKnife(collectibleId) {
    const id = collectibleId || DEFAULT_KNIFE;
    if (id === this.knifeId && this.knife) return;
    if (this.knife) { this.hand.remove(this.knife); disposeObject(this.knife); }
    this.knifeId = id;
    this.knife = buildCollectible(id);
    // knives are modelled in world units: shrink into the model's 1.8-tall space and point forward
    this.knife.scale.setScalar(0.5 / SCALE);
    this.knife.rotation.set(0, Math.PI / 2, 0);
    this.hand.add(this.knife);
  }

  /** @param s interpolated state {x,y,z,vx,vy,vz,yaw,pitch,mode} */
  update(s, dt, showTag) {
    this.root.position.set(s.x, s.y, s.z);
    this.root.rotation.z = s.yaw;
    const speed = Math.hypot(s.vx || 0, s.vy || 0) / 52; // blocks per second
    const swing = animateBlockPlayer(this.inner, Math.min(speed, 9), dt);
    this.inner.userData.armR.rotation.x = -swing - 0.9 + Math.max(-0.6, Math.min(0.6, -s.pitch * 0.5)); // knife arm held forward
    this.head.rotation.x = -s.pitch * 0.7;
    this.tag.visible = showTag;
  }

  dispose() {
    disposeObject(this.root);
  }
}
