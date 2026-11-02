// Camera system: Chase, Pilot (helmet) and Cinema views + orbit for launch prep / replay.
import * as THREE from './lib/three.module.min.js';
import { damp, clamp, lerp } from './util.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Euler();
export const VIEWS = ['chase', 'pilot', 'cinema'];
export const VIEW_LABEL = { chase: 'Chase View', pilot: 'Pilot View', cinema: 'Cinema View', orbit: 'Orbit' };

export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.view = 'chase';
    this.lookYaw = 0; this.lookPitch = 0; // user look offsets
    this.pos = new THREE.Vector3(); this.target = new THREE.Vector3();
    this.dist = 7; this.fov = 70; this.shakeT = 0;
    this.roll = 0;
    this.cine = { shot: 0, t: 0, anchor: new THREE.Vector3(), kind: 'orbit' };
    this.orbit = { yaw: 0, pitch: 0.25, dist: 14 };
    this.settings = { shake: 1, fov: 70 };
    this.impulse = 0;
    this.lastInput = 0;
  }

  setView(v) { this.view = v; this.cine.t = 99; }
  cycle() { const i = VIEWS.indexOf(this.view); this.setView(VIEWS[(i + 1) % VIEWS.length]); return this.view; }
  look(dx, dy) { this.lookYaw = clamp(this.lookYaw - dx, -Math.PI, Math.PI); this.lookPitch = clamp(this.lookPitch - dy, -1.2, 1.2); this.lastInput = 0; }
  kick(a) { this.impulse = Math.max(this.impulse, a); }

  // focus: {pos, vel, q, state, speed, turbulence}; dt real
  update(dt, f, world, mode) {
    this.lastInput += dt;
    if (this.lastInput > 1.2 && mode !== 'orbit') { this.lookYaw = damp(this.lookYaw, 0, 2.5, dt); this.lookPitch = damp(this.lookPitch, 0, 2.5, dt); }
    const speed = f.vel.length();
    const view = mode === 'orbit' ? 'orbit' : this.view;
    let fovT = this.settings.fov + clamp((speed - 25) / 60, 0, 1) * 10;
    const cam = this.cam;
    const vdir = _v.copy(f.vel);
    if (vdir.lengthSq() < 1) vdir.set(Math.sin(f.heading), 0, Math.cos(f.heading));
    vdir.normalize();
    if (view === 'orbit') {
      const o = this.orbit;
      o.yaw += dt * 0.06 * (this.lastInput > 2 ? 1 : 0);
      const yaw = (f.heading || 0) + Math.PI + o.yaw + this.lookYaw;
      const pitch = clamp(o.pitch + this.lookPitch * 0.5, -0.2, 1.3);
      const tp = _v2.copy(f.pos); tp.y += 0.6;
      this.target.lerp(tp, 1 - Math.exp(-6 * dt));
      cam.position.set(this.target.x + Math.sin(yaw) * Math.cos(pitch) * o.dist, this.target.y + Math.sin(pitch) * o.dist, this.target.z + Math.cos(yaw) * Math.cos(pitch) * o.dist);
      const gh = world.ground(cam.position.x, cam.position.z).h;
      if (cam.position.y < gh + 1.5) cam.position.y = gh + 1.5;
      cam.up.set(0, 1, 0);
      cam.lookAt(this.target);
      fovT = this.settings.fov;
    } else if (view === 'chase') {
      const canopy = f.canopy;
      const back = canopy ? 13 : lerp(4.6, 6.2, clamp((speed - 20) / 50, 0, 1));
      const up = canopy ? 2.5 : 1.1;
      // heading-yaw based chase (stable horizon) with slight pitch follow
      const yaw = Math.atan2(vdir.x, vdir.z) + this.lookYaw;
      const pitch = clamp(Math.asin(clamp(vdir.y, -1, 1)) * 0.75 - this.lookPitch * 0.8, -1.25, 0.9);
      const dx = Math.sin(yaw) * Math.cos(pitch), dy = Math.sin(pitch), dz = Math.cos(yaw) * Math.cos(pitch);
      const want = _v2.set(f.pos.x - dx * back, f.pos.y - dy * back + up, f.pos.z - dz * back);
      // keep camera out of terrain
      const gh = world.ground(want.x, want.z).h;
      if (want.y < gh + 2) want.y = gh + 2;
      const k = 1 - Math.exp(-(canopy ? 3 : 7) * dt);
      if (this.pos.distanceToSquared(want) > 2500) this.pos.copy(want); else this.pos.lerp(want, k);
      cam.position.copy(this.pos);
      const tgt = _v3.copy(f.pos).addScaledVector(vdir, canopy ? 2 : 8);
      tgt.y += canopy ? 2.5 : 0.8;
      if (this.target.distanceToSquared(tgt) > 900) this.target.copy(tgt); else this.target.lerp(tgt, 1 - Math.exp(-12 * dt));
      // natural banking: roll with the pilot's bank a bit
      this.roll = damp(this.roll, (f.bank || 0) * 0.35, 3, dt);
      cam.up.set(0, 1, 0);
      cam.lookAt(this.target);
      cam.rotateZ(-this.roll);
    } else if (view === 'pilot') {
      // helmet cam: head position, oriented along flight direction with body roll
      const head = _v2.set(0, 0.08, 0.72).applyQuaternion(f.q).add(f.pos);
      cam.position.copy(head);
      const bodyUp = _v.set(0, 1, 0).applyQuaternion(f.q);
      let fwd;
      if (f.canopy || f.standing) {
        fwd = new THREE.Vector3(Math.sin(f.heading), -0.25, Math.cos(f.heading)).normalize();
        bodyUp.set(0, 1, 0);
      } else {
        fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(f.q).lerp(new THREE.Vector3().copy(f.vel).normalize(), 0.6).normalize();
      }
      // apply look offsets
      _q.setFromAxisAngle(bodyUp, this.lookYaw); fwd.applyQuaternion(_q);
      const side = new THREE.Vector3().crossVectors(fwd, bodyUp).normalize();
      _q.setFromAxisAngle(side, this.lookPitch); fwd.applyQuaternion(_q);
      cam.up.copy(bodyUp);
      cam.lookAt(_v.copy(head).add(fwd));
      fovT += 6;
    } else if (view === 'cinema') {
      const C = this.cine;
      C.t += dt;
      if (C.t > 5 || C.force) {
        C.force = false;
        C.t = 0; C.shot = (C.shot + 1) % 4;
        C.kind = ['side', 'tripod', 'orbit', 'high'][C.shot];
        if (C.kind === 'tripod') {
          // place camera ahead along flight path, offset laterally
          const side = new THREE.Vector3(-vdir.z, 0, vdir.x).normalize();
          C.anchor.copy(f.pos).addScaledVector(f.vel, 3.2).addScaledVector(side, 18 * (Math.random() < 0.5 ? -1 : 1));
          C.anchor.y += 6;
          const gh = world.ground(C.anchor.x, C.anchor.z).h; if (C.anchor.y < gh + 3) C.anchor.y = gh + 3;
        }
        C.seed = Math.random() < 0.5 ? -1 : 1;
      }
      let p;
      if (C.kind === 'side') {
        const side = new THREE.Vector3(-vdir.z, 0, vdir.x).normalize().multiplyScalar(9 * C.seed);
        p = _v2.copy(f.pos).add(side).addScaledVector(vdir, 2 - C.t * 0.6); p.y += 1.5;
      } else if (C.kind === 'tripod') {
        p = _v2.copy(C.anchor);
      } else if (C.kind === 'orbit') {
        const a = C.t * 0.5 * C.seed;
        p = _v2.set(f.pos.x + Math.sin(a) * 11, f.pos.y + 3, f.pos.z + Math.cos(a) * 11);
      } else {
        p = _v2.copy(f.pos).addScaledVector(vdir, -30).add(new THREE.Vector3(0, 22, 0));
      }
      const gh = world.ground(p.x, p.z).h; if (p.y < gh + 2) p.y = gh + 2;
      if (C.t < 0.05) this.pos.copy(p); else this.pos.lerp(p, 1 - Math.exp(-5 * dt));
      cam.position.copy(this.pos);
      if (this.target.distanceToSquared(f.pos) > 900) this.target.copy(f.pos); else this.target.lerp(f.pos, 1 - Math.exp(-10 * dt));
      cam.up.set(0, 1, 0);
      cam.lookAt(this.target);
      fovT = C.kind === 'tripod' ? 40 + clamp(this.pos.distanceTo(f.pos) / 4, 0, 30) : 60;
    }
    // camera shake from speed + turbulence
    const sh = this.settings.shake * (clamp((speed - 35) / 50, 0, 1) * 0.006 + (f.turbulence || 0) * 0.004 + this.impulse * 0.05);
    this.impulse = damp(this.impulse, 0, 4, dt);
    if (sh > 0 && view !== 'orbit') {
      this.shakeT += dt * 30;
      cam.rotateX(Math.sin(this.shakeT * 1.3) * sh + Math.sin(this.shakeT * 2.9) * sh * 0.5);
      cam.rotateY(Math.sin(this.shakeT * 1.7 + 1) * sh);
    }
    this.fov = damp(this.fov, fovT, 3, dt);
    if (Math.abs(cam.fov - this.fov) > 0.05) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    const near = view === 'pilot' ? 0.12 : 0.8;
    if (cam.near !== near) { cam.near = near; cam.updateProjectionMatrix(); }
  }

  // Flyover along the route for launch preview. u in [0,1]
  flyover(u, def, world) {
    const R = def.route;
    const s = u * R.L;
    const p = R.line.at(s);
    const y = R.routeY(s) + 60 + Math.sin(u * Math.PI) * 120;
    const side = 80;
    this.cam.position.set(p.x - p.dz * side, y, p.z + p.dx * side);
    const gh = world.ground(this.cam.position.x, this.cam.position.z).h;
    if (this.cam.position.y < gh + 20) this.cam.position.y = gh + 20;
    const ahead = R.line.at(s + 220);
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(ahead.x, R.routeY(s + 220), ahead.z);
    if (this.cam.near !== 0.8) { this.cam.near = 0.8; this.cam.updateProjectionMatrix(); }
  }
}
