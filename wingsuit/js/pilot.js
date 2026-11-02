// Procedural wingsuit pilot: articulated body, dynamic wing membranes, parachute and pose animation.
import * as THREE from './lib/three.module.min.js';
import { damp, clamp, lerp } from './util.js';

const POSE_KEYS = ['armAbdL', 'armAbdR', 'armSwL', 'armSwR', 'elbL', 'elbR', 'legAbdL', 'legAbdR', 'legSwL', 'legSwR', 'kneeL', 'kneeR', 'head', 'spine'];

function limb(len, r0, r1, mat) {
  const g = new THREE.CapsuleGeometry((r0 + r1) / 2, len - (r0 + r1), 4, 8);
  g.rotateX(Math.PI / 2); g.translate(0, 0, -len / 2);
  const m = new THREE.Mesh(g, mat); m.castShadow = true; return m;
}

export class Pilot {
  constructor(scene, look) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // body frame: X=left, Y=back, Z=head
    this.root.add(this.body);
    scene.add(this.root);
    this.mats = {
      suit: new THREE.MeshStandardMaterial({ color: 0xd23a2a, roughness: 0.65 }),
      suit2: new THREE.MeshStandardMaterial({ color: 0x1d1f24, roughness: 0.7 }),
      wing: new THREE.MeshStandardMaterial({ color: 0xd23a2a, roughness: 0.7, side: THREE.DoubleSide }),
      wing2: new THREE.MeshStandardMaterial({ color: 0x1d1f24, roughness: 0.7, side: THREE.DoubleSide }),
      glove: new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.8 }),
      boot: new THREE.MeshStandardMaterial({ color: 0x25262a, roughness: 0.7 }),
      helmet: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.25, metalness: 0.2 }),
      visor: new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.03, metalness: 1.0 }),
      rig: new THREE.MeshStandardMaterial({ color: 0x2b2d33, roughness: 0.8 }),
    };
    const M = this.mats;
    // torso
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.36, 4, 10), M.suit);
    torso.rotation.x = Math.PI / 2; torso.position.z = 0.26; torso.scale.set(1.25, 1, 0.8); torso.castShadow = true;
    this.spine = new THREE.Group(); this.body.add(this.spine);
    this.spine.add(torso);
    const container = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.42), M.rig); // parachute container on back
    container.position.set(0, 0.16, 0.24); container.castShadow = true; this.spine.add(container);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.02, 0.06), M.suit2); stripe.position.set(0, 0.11, 0.42); this.spine.add(stripe);
    // head
    this.neck = new THREE.Group(); this.neck.position.z = 0.6; this.spine.add(this.neck);
    this.head = new THREE.Group(); this.neck.add(this.head);
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.135, 20, 14), M.helmet);
    helm.position.z = 0.1; helm.scale.set(1, 1.05, 1.12); helm.castShadow = true; this.head.add(helm);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.138, 20, 10, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.38, Math.PI * 0.3), M.visor);
    visor.rotation.x = -Math.PI / 2; visor.position.z = 0.1; visor.scale.set(1.02, 1.12, 1.07);
    this.head.add(visor);
    this.helmetMesh = helm; this.visorMesh = visor;
    // arms
    this.arm = {};
    for (const side of ['L', 'R']) {
      const sg = side === 'L' ? 1 : -1;
      const sh = new THREE.Group(); sh.position.set(0.2 * sg, 0, 0.5); this.spine.add(sh);
      const sw = new THREE.Group(); sh.add(sw);
      sw.add(limb(0.3, 0.06, 0.05, M.suit));
      const el = new THREE.Group(); el.position.z = -0.3; sw.add(el);
      el.add(limb(0.27, 0.05, 0.04, M.suit));
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), M.glove); hand.position.z = -0.3; hand.scale.set(0.8, 0.5, 1.3); el.add(hand);
      const wr = new THREE.Object3D(); wr.position.z = -0.27; el.add(wr);
      this.arm[side] = { sh, sw, el, wr, hand };
    }
    // legs
    this.leg = {};
    for (const side of ['L', 'R']) {
      const sg = side === 'L' ? 1 : -1;
      const hp = new THREE.Group(); hp.position.set(0.1 * sg, 0, 0.0); this.body.add(hp);
      const sw = new THREE.Group(); hp.add(sw);
      sw.add(limb(0.45, 0.08, 0.06, M.suit2));
      const kn = new THREE.Group(); kn.position.z = -0.45; sw.add(kn);
      kn.add(limb(0.44, 0.06, 0.05, M.suit2));
      const an = new THREE.Group(); an.position.z = -0.44; kn.add(an);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.24, 0.08), M.boot); foot.position.set(0, -0.08, -0.03); foot.castShadow = true; an.add(foot);
      this.leg[side] = { hp, sw, kn, an };
    }
    // membranes
    this.wingL = this._membrane(6, 4, M.wing); this.wingR = this._membrane(6, 4, M.wing); this.tail = this._membrane(6, 5, M.wing2);
    this.body.add(this.wingL.mesh, this.wingR.mesh, this.tail.mesh);
    this.armpit = { L: new THREE.Object3D(), R: new THREE.Object3D() };
    this.armpit.L.position.set(0.16, 0, 0.42); this.armpit.R.position.set(-0.16, 0, 0.42);
    this.hipSide = { L: new THREE.Object3D(), R: new THREE.Object3D() };
    this.hipSide.L.position.set(0.14, 0, -0.08); this.hipSide.R.position.set(-0.14, 0, -0.08);
    this.crotch = new THREE.Object3D(); this.crotch.position.set(0, 0, -0.05);
    for (const o of [this.armpit.L, this.armpit.R, this.hipSide.L, this.hipSide.R]) this.spine.add(o);
    this.body.add(this.crotch);

    this.pose = {}; for (const k of POSE_KEYS) this.pose[k] = 0;
    this.target = { ...this.pose };
    this.t = 0; this.flutter = 0; this.tension = 0;
    this.buildCanopy();
    this.trailColor = null;
    if (look) this.setLook(look);
  }

  _membrane(nu, nv, mat) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(nu * nv * 3);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const idx = [];
    for (let i = 0; i < nu - 1; i++) for (let j = 0; j < nv - 1; j++) {
      const a = i * nv + j, b = a + 1, c = a + nv, d = c + 1; idx.push(a, c, b, b, c, d);
    }
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, mat); mesh.castShadow = true; mesh.frustumCulled = false;
    return { mesh, nu, nv, pos };
  }

  buildCanopy() {
    const span = 8.2, chord = 3.0, cells = 9;
    const g = new THREE.BoxGeometry(span, 0.45, chord, cells * 2, 1, 4);
    const p = g.attributes.position;
    const colors = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = (x / span) * 1.25; // arc
      const R = 6.5;
      const nx = Math.sin(a) * (R + y), ny = Math.cos(a) * (R + y) - R;
      // airfoil: thicker at front (+z)
      const th = 1 + 0.6 * Math.max(0, z / chord);
      p.setXYZ(i, nx, ny * th + (z > 0 ? 0.05 : 0), z);
      colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = 1;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    this.canopyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });
    this.canopy = new THREE.Mesh(g, this.canopyMat);
    this.canopy.castShadow = true;
    this.canopyGroup = new THREE.Group();
    this.canopyGroup.add(this.canopy);
    this.canopy.position.y = 5.2;
    // suspension lines
    const lp = [];
    for (let i = 0; i <= 6; i++) {
      const a = ((i / 6) - 0.5) * 1.25 * 1.0;
      const x = Math.sin(a) * 6.5, y = 5.2 + Math.cos(a) * 6.5 - 6.5 - 0.2;
      for (const z of [1.2, -1.2]) { lp.push(x, y, z, Math.sign(x || 0.001) * 0.22, 0.55, 0); }
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    this.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.7 }));
    this.canopyGroup.add(this.lines);
    this.canopyGroup.visible = false;
    this.canopyGroup.rotation.x = Math.PI / 2; // canopy +Y -> body +Z (up), canopy front -> body -Y
    this.root.add(this.canopyGroup);
    this.canopyOpen = 0;
  }

  setLook(look) {
    const M = this.mats;
    M.suit.color.set(look.suit[0]); M.wing.color.set(look.suit[0]);
    M.suit2.color.set(look.suit[1]); M.wing2.color.set(look.suit[1]);
    M.glove.color.set(look.suit[2] || 0x15161a);
    M.helmet.color.set(look.helmet[0]); M.helmet.metalness = look.helmet[2] ?? 0.2; M.helmet.roughness = look.helmet[3] ?? 0.25;
    M.visor.color.set(look.helmet[1]);
    const cols = look.chute.map((c) => new THREE.Color(c));
    const g = this.canopy.geometry, p = g.attributes.position, c = g.attributes.color;
    for (let i = 0; i < p.count; i++) {
      const cell = Math.floor(((Math.atan2(p.getX(i), p.getY(i) + 6.5) / 1.25) + 0.5) * 9);
      const col = cols[((cell % cols.length) + cols.length) % cols.length];
      c.setXYZ(i, col.r, col.g, col.b);
    }
    c.needsUpdate = true;
    this.trailColor = look.trail || null;
  }

  // Compute target pose for a state. s: {state, wing, posture, pitchIn, bankIn, bank, brakeL, brakeR, t}
  _targetPose(s) {
    const T = this.target;
    const t = this.t;
    for (const k of POSE_KEYS) T[k] = 0;
    switch (s.state) {
      case 'idle': {
        const b = Math.sin(t * 1.6) * 0.03;
        T.armAbdL = T.armAbdR = 0.12 + b; T.elbL = T.elbR = 0.25; T.legAbdL = T.legAbdR = 0.06; T.head = Math.sin(t * 0.4) * 0.2;
        T.armSwL = T.armSwR = 0.05;
        break;
      }
      case 'run': {
        const ph = s.runPhase || 0, sp = s.runSpeed || 1;
        const sw = Math.sin(ph) * 0.7 * sp;
        T.armSwL = -sw; T.armSwR = sw; T.elbL = T.elbR = 1.1; T.armAbdL = T.armAbdR = 0.15;
        T.legSwL = sw; T.legSwR = -sw; T.kneeL = 0.3 + Math.max(0, -Math.sin(ph)) * 1.2 * sp; T.kneeR = 0.3 + Math.max(0, Math.sin(ph)) * 1.2 * sp;
        T.spine = 0.15 * sp;
        break;
      }
      case 'jump': {
        T.armAbdL = T.armAbdR = 1.2; T.armSwL = T.armSwR = 0.6; T.elbL = T.elbR = 0.4; T.legSwL = 0.4; T.legSwR = -0.2; T.kneeL = 0.6; T.kneeR = 0.4;
        break;
      }
      case 'flight': {
        const w = s.wing, po = s.posture || 0;
        // freefall box position -> full wing spread
        const abd = lerp(1.2, 1.38 + po * 0.16, w) - Math.max(0, s.pitchIn) * 0.35 * w;
        T.armAbdL = abd + s.bankIn * 0.12; T.armAbdR = abd - s.bankIn * 0.12;
        T.elbL = T.elbR = lerp(1.2, 0.12, w) + (po < 0 ? -po * 0.1 : 0);
        T.armSwL = lerp(0.3, -0.12, w) - s.bankIn * 0.35 * w + Math.min(0, s.pitchIn) * -0.2;
        T.armSwR = lerp(0.3, -0.12, w) + s.bankIn * 0.35 * w + Math.min(0, s.pitchIn) * -0.2;
        const la = lerp(0.35, 0.36 + po * 0.12, w) - Math.max(0, s.pitchIn) * 0.12;
        T.legAbdL = la; T.legAbdR = la;
        T.kneeL = T.kneeR = lerp(1.0, 0.05, w);
        T.legSwL = T.legSwR = lerp(-0.25, 0, w);
        T.head = lerp(0.6, 0.85, w) + s.pitchIn * -0.2;
        T.spine = -0.1 * w;
        break;
      }
      case 'canopy': {
        const bl = s.brakeL || 0, br = s.brakeR || 0;
        T.armAbdL = 2.6 - bl * 1.1; T.armAbdR = 2.6 - br * 1.1; T.elbL = 0.3 + bl * 0.8; T.elbR = 0.3 + br * 0.8;
        T.armSwL = T.armSwR = -0.1;
        T.legSwL = 0.35 + Math.sin(t * 0.9) * 0.05; T.legSwR = 0.25 + Math.sin(t * 0.9 + 1) * 0.05; T.kneeL = T.kneeR = 0.35; T.legAbdL = T.legAbdR = 0.08;
        T.head = 0.1;
        break;
      }
      case 'flare': {
        T.armAbdL = T.armAbdR = 0.6; T.elbL = T.elbR = 0.5; T.armSwL = T.armSwR = -0.3;
        T.legSwL = T.legSwR = 0.7; T.kneeL = T.kneeR = 0.4;
        break;
      }
      case 'landed': {
        T.armAbdL = T.armAbdR = 0.5 + Math.sin(t * 2) * 0.05; T.elbL = T.elbR = 0.6; T.legAbdL = T.legAbdR = 0.1; T.kneeL = T.kneeR = 0.15;
        if (s.celebrate) { T.armAbdL = T.armAbdR = 2.7; T.elbL = T.elbR = 0.2; }
        break;
      }
      case 'crash': {
        const ph = s.crashT || 0;
        T.armAbdL = 1.4 + Math.sin(ph * 7) * 0.8; T.armAbdR = 0.9 + Math.cos(ph * 6) * 0.8; T.elbL = 1.2; T.elbR = 0.4;
        T.legSwL = Math.sin(ph * 5) * 0.8; T.legSwR = Math.cos(ph * 5) * 0.8; T.kneeL = 1.0; T.kneeR = 0.6; T.spine = 0.3;
        break;
      }
    }
  }

  // update pose & membranes. dt real seconds.
  animate(dt, s) {
    this.t += dt;
    this._targetPose(s);
    const rate = s.state === 'run' ? 22 : s.state === 'crash' ? 14 : 7;
    for (const k of POSE_KEYS) this.pose[k] = damp(this.pose[k], this.target[k], rate, dt);
    const P = this.pose, A = this.arm, Lg = this.leg;
    A.L.sh.rotation.set(0, -P.armAbdL, 0); A.R.sh.rotation.set(0, P.armAbdR, 0);
    A.L.sw.rotation.x = -P.armSwL; A.R.sw.rotation.x = -P.armSwR;
    A.L.el.rotation.x = -P.elbL; A.R.el.rotation.x = -P.elbR;
    Lg.L.hp.rotation.set(0, -P.legAbdL, 0); Lg.R.hp.rotation.set(0, P.legAbdR, 0);
    Lg.L.sw.rotation.x = -P.legSwL; Lg.R.sw.rotation.x = -P.legSwR;
    Lg.L.kn.rotation.x = P.kneeL; Lg.R.kn.rotation.x = P.kneeR;
    Lg.L.an.rotation.x = -0.2 - P.kneeL * 0.2; Lg.R.an.rotation.x = -0.2 - P.kneeR * 0.2;
    this.neck.rotation.x = -P.head; this.spine.rotation.x = -P.spine;
    // membrane dynamics
    const speed = s.airspeed || 0;
    this.tension = damp(this.tension, (s.state === 'flight' ? s.wing : 0) * clamp(speed / 40, 0, 1), 4, dt);
    this.flutter += dt * (8 + speed * 0.5);
    this.body.updateMatrixWorld(true);
    this._updateMembranes(speed, s);
    // canopy
    this.canopyGroup.visible = this.canopyOpen > 0.01;
    if (this.canopyGroup.visible) {
      const o = this.canopyOpen;
      this.canopy.scale.set(lerp(0.15, 1, o), lerp(0.3, 1, o), lerp(0.25, 1, Math.min(1, o * 1.3)));
      this.canopy.position.y = lerp(2.5, 5.2, o);
      this.canopy.rotation.z = Math.sin(this.t * 13) * 0.08 * (1 - o) + (s.canopyBank || 0) * 0.3;
      this.canopy.rotation.x = -(s.brake || 0) * 0.12;
      this.lines.visible = o > 0.4;
    }
  }

  _local(obj, out) { obj.getWorldPosition(out); return this.body.worldToLocal(out); }

  _updateMembranes(speed, s) {
    const v = new THREE.Vector3();
    const pts = (objs) => objs.map((o) => this._local(o, new THREE.Vector3()));
    const bil = 0.03 + this.tension * 0.07;
    const fl = 0.006 + 0.01 * clamp(speed / 60, 0, 1.5);
    const fill = (m, edgeA, edgeB, bulgeAxis) => {
      const { nu, nv, pos } = m;
      for (let i = 0; i < nu; i++) {
        const t = i / (nu - 1);
        const a = sampleLine(edgeA, t), b = sampleLine(edgeB, t);
        for (let j = 0; j < nv; j++) {
          const u = j / (nv - 1);
          v.copy(a).lerp(b, u);
          const bulge = Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, t * 1.2 + 0.1)) * bil;
          const fltr = Math.sin(this.flutter + i * 1.3 + j * 0.7) * fl * t;
          v.y += bulge + fltr;
          const o = (i * nv + j) * 3; pos[o] = v.x; pos[o + 1] = v.y; pos[o + 2] = v.z;
        }
      }
      m.mesh.geometry.attributes.position.needsUpdate = true;
      m.mesh.geometry.computeVertexNormals();
    };
    const A = this.arm, Lg = this.leg;
    // arm wings: arm edge shoulder->elbow->wrist ; body edge armpit -> hip side -> knee-ish
    const armL = pts([A.L.sh, A.L.el, A.L.wr]), armR = pts([A.R.sh, A.R.el, A.R.wr]);
    const bodyL = pts([this.armpit.L, this.hipSide.L, Lg.L.kn]), bodyR = pts([this.armpit.R, this.hipSide.R, Lg.R.kn]);
    fill(this.wingL, armL, bodyL);
    fill(this.wingR, armR, bodyR);
    // tail wing between legs
    const legL = pts([Lg.L.hp, Lg.L.kn, Lg.L.an]), legR = pts([Lg.R.hp, Lg.R.kn, Lg.R.an]);
    legL[0] = this._local(this.crotch, new THREE.Vector3()).add(new THREE.Vector3(0.02, 0, 0));
    legR[0] = legL[0].clone().add(new THREE.Vector3(-0.04, 0, 0));
    fill(this.tail, legL, legR);
  }

  setHeadVisible(v) { this.helmetMesh.visible = v; this.visorMesh.visible = v; }
}

function sampleLine(pts, t) {
  const n = pts.length - 1;
  const f = clamp(t * n, 0, n - 1e-6);
  const i = Math.floor(f);
  return pts[i].clone().lerp(pts[i + 1], f - i);
}

// Orientation helpers for non-flight states
const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
export function standingQuat(heading, lean, out) {
  // body Z = up (head), body Y = backward, X = left
  const fx = Math.sin(heading), fz = Math.cos(heading);
  _z.set(fx * Math.sin(lean), Math.cos(lean), fz * Math.sin(lean)).normalize(); // positive lean tilts head forward
  _y.set(-fx, 0, -fz);
  _y.addScaledVector(_z, -_y.dot(_z)).normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}
export function basisQuat(left, up, fwd, out) {
  _m.makeBasis(left, up, fwd);
  return out.setFromRotationMatrix(_m);
}
