// Aerodynamic flight model for the wingsuit pilot + parachute descent.
// Runs on a fixed timestep (see game.js) so behaviour is identical at 60/144/165 Hz.
import * as THREE from './lib/three.module.min.js';
import { clamp, lerp, damp } from './util.js';
import { basisQuat, standingQuat } from './pilot.js';

const G = 9.81, MASS = 85, RHO0 = 1.225;
const _v = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3(), _up = new THREE.Vector3();
const _l = new THREE.Vector3(), _q = new THREE.Quaternion(), _Y = new THREE.Vector3(0, 1, 0), _air = new THREE.Vector3(), _F = new THREE.Vector3();
const _bf = new THREE.Vector3(), _bu = new THREE.Vector3(), _bl = new THREE.Vector3();

export const STATE = { READY: 0, RUN: 1, FREEFALL: 2, WINGSUIT: 3, DEPLOY: 4, CANOPY: 5, LANDED: 6, CRASHED: 7 };

export class FlightModel {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.reset({ x: 0, y: 0, z: 0, heading: 0 });
  }

  reset(start, mode = 'ready') {
    this.state = STATE.READY;
    this.heading = start.heading;
    this.pos.set(start.x, start.y, start.z);
    this.vel.set(0, 0, 0);
    standingQuat(this.heading, 0, this.q);
    this.wing = 0; this.wingTarget = 0;
    this.alpha = 0.22; this.alphaV = 0; this.bank = 0; this.bankV = 0;
    this.posture = 0;
    this.stability = 100; this.instab = 0; this.wobA = 0; this.wobB = 0;
    this.time = 0; this.stateTime = 0;
    this.runDist = 0; this.runPhase = 0;
    this.deployT = 0; this.canopyOpen = 0;
    this.cHeading = start.heading; this.cBank = 0; this.brake = 0; this.brakeL = 0; this.brakeR = 0; this.flareT = 0; this.brakeHold = 0;
    this.hardOpening = false;
    this.airspeed = 0; this.aoa = 0;
    this.lastIn = { pitch: 0, turn: 0, roll: 0 };
    this.autoSpreadAt = 1.8;
    this.gust = new THREE.Vector3();
    if (mode === 'canopy') {
      this.state = STATE.CANOPY; this.canopyOpen = 1; this.vel.set(Math.sin(this.heading) * 10, -4.5, Math.cos(this.heading) * 10);
      standingQuat(this.heading, 0, this.q);
    }
  }

  setState(s) { this.state = s; this.stateTime = 0; }
  startRun() { if (this.state === STATE.READY) this.setState(STATE.RUN); }
  spreadWings() { if (this.state === STATE.FREEFALL) { this.wingTarget = 1; this.setState(STATE.WINGSUIT); } }
  deploy() {
    if (this.state === STATE.WINGSUIT || this.state === STATE.FREEFALL) {
      this.hardOpening = this.vel.length() > 62;
      this.setState(STATE.DEPLOY); this.deployT = 0;
      const f = _f.set(this.vel.x, 0, this.vel.z);
      this.cHeading = f.lengthSq() > 1 ? Math.atan2(f.x, f.z) : this.heading;
      return true;
    }
    return false;
  }

  // inp: {pitch,turn,roll,stab,tuck,spread} wind: Vector3 (world, m/s), world: World
  step(dt, inp, wind, world) {
    this.time += dt; this.stateTime += dt;
    switch (this.state) {
      case STATE.READY: return null;
      case STATE.RUN: return this._run(dt, world);
      case STATE.FREEFALL:
      case STATE.WINGSUIT: return this._fly(dt, inp, wind, world);
      case STATE.DEPLOY:
      case STATE.CANOPY: return this._canopy(dt, inp, wind, world);
      default: return null;
    }
  }

  _run(dt, world) {
    const sp = clamp(1.5 + this.stateTime * 4.5, 0, 6.5);
    this.runPhase += sp * dt * 2.2;
    const dx = Math.sin(this.heading) * sp * dt, dz = Math.cos(this.heading) * sp * dt;
    this.pos.x += dx; this.pos.z += dz;
    this.runDist += sp * dt;
    const gh = world.ground(this.pos.x, this.pos.z).h;
    if (gh < this.pos.y - 1.2 || this.runDist > 40) {
      // leave the edge
      this.vel.set(Math.sin(this.heading) * (sp + 1), 2.6, Math.cos(this.heading) * (sp + 1));
      this.pos.y += 0.3;
      this.setState(STATE.FREEFALL);
      return 'exit';
    }
    this.pos.y = gh + 0.95;
    standingQuat(this.heading, 0.18 * sp / 6.5, this.q);
    return null;
  }

  _fly(dt, inp, wind, world) {
    // wing activation
    if (this.state === STATE.FREEFALL && this.stateTime > this.autoSpreadAt) this.spreadWings();
    this.wing = damp(this.wing, this.wingTarget, 3.2, dt);
    const w = this.wing;
    // air-relative velocity incl. gusts
    _air.copy(this.vel).sub(wind);
    const V = Math.max(_air.length(), 0.01);
    this.airspeed = V;
    _v.copy(_air).divideScalar(V);
    // posture
    const postT = inp.tuck ? -1 : inp.spread ? 1 : 0;
    this.posture = damp(this.posture, postT, 3, dt);
    // control targets
    const stab = inp.stab ? 1 : 0;
    const p = inp.pitch, t = inp.turn, r = inp.roll;
    let aT = 0.22 - (p > 0 ? p * 0.19 : p * 0.24);
    let bT = t * 0.72 + r * 0.7;
    if (stab) { bT *= 0.6; if (Math.abs(t) + Math.abs(r) < 0.1) bT = 0; aT = lerp(aT, 0.22, 0.4); }
    // wobble from instability / turbulence
    const wob = (1 - this.stability / 100);
    this.wobA += ((Math.random() - 0.5) * 2 * wob - this.wobA * 2) * dt * 3;
    this.wobB += ((Math.random() - 0.5) * 2 * wob - this.wobB * 2) * dt * 3;
    aT += this.wobA * 0.12 + this.gust.y * 0.004;
    bT += this.wobB * 0.25;
    // 2nd-order response gives inertia; stabilization adds damping
    const kA = 26, cA = 9 + stab * 3, kB = (Math.abs(r) > 0.1 ? 30 : 18), cB = 7.5 + stab * 4;
    this.alphaV += (kA * (aT - this.alpha) - cA * this.alphaV) * dt;
    this.alpha += this.alphaV * dt;
    this.bankV += (kB * (bT - this.bank) - cB * this.bankV) * dt;
    this.bank += this.bankV * dt;
    this.bank = clamp(this.bank, -1.45, 1.45);
    // flight-path frame
    _r.crossVectors(_v, _Y);
    if (_r.lengthSq() < 0.0025) { _r.set(1, 0, 0).applyQuaternion(this.q).negate(); } // body right = -left
    _r.normalize();
    _u.crossVectors(_r, _v).normalize();
    const cb = Math.cos(this.bank), sb = Math.sin(this.bank);
    // bank right (positive) tilts lift toward +r
    const ux = _u.x * cb + _r.x * sb, uy = _u.y * cb + _r.y * sb, uz = _u.z * cb + _r.z * sb;
    const rx = _r.x * cb - _u.x * sb, ry = _r.y * cb - _u.y * sb, rz = _r.z * cb - _u.z * sb;
    _u.set(ux, uy, uz); _r.set(rx, ry, rz);
    let tgtAlpha = this.alpha;
    let fwdTgt, upTgt;
    if (this.state === STATE.FREEFALL || w < 0.5) {
      // belly-to-earth, head along heading, blended with wingsuit target
      const hx = Math.sin(this.heading), hz = Math.cos(this.heading);
      const ff = 1 - clamp(w * 2, 0, 1);
      _f.set(hx, -0.35, hz).normalize();
      _up.set(0, 1, 0).addScaledVector(_f, -_f.y).normalize();
      const fx = _v.x * Math.cos(tgtAlpha) + _u.x * Math.sin(tgtAlpha), fy = _v.y * Math.cos(tgtAlpha) + _u.y * Math.sin(tgtAlpha), fz = _v.z * Math.cos(tgtAlpha) + _u.z * Math.sin(tgtAlpha);
      _bf.set(fx, fy, fz).lerp(_f, ff).normalize();
      _bu.copy(_u).lerp(_up, ff);
      _bu.addScaledVector(_bf, -_bu.dot(_bf)).normalize();
      fwdTgt = _bf; upTgt = _bu;
      // steering during freefall rotates heading
      this.heading -= (t + r * 0.5) * dt * 1.3; // heading = atan2(x,z): right turn decreases it
    } else {
      const ca = Math.cos(tgtAlpha), sa = Math.sin(tgtAlpha);
      _bf.set(_v.x * ca + _u.x * sa, _v.y * ca + _u.y * sa, _v.z * ca + _u.z * sa);
      _bu.set(_u.x * ca - _v.x * sa, _u.y * ca - _v.y * sa, _u.z * ca - _v.z * sa);
      fwdTgt = _bf; upTgt = _bu;
      this.heading = Math.atan2(this.vel.x, this.vel.z);
    }
    _bl.crossVectors(upTgt, fwdTgt).normalize();
    basisQuat(_bl, upTgt, fwdTgt, _q);
    const follow = lerp(2.5, 9 + stab * 3, w);
    this.q.slerp(_q, 1 - Math.exp(-follow * dt));
    // actual aerodynamic state from body orientation
    _f.set(0, 0, 1).applyQuaternion(this.q);
    _up.set(0, 1, 0).applyQuaternion(this.q);
    const aoa = Math.atan2(-_v.dot(_up), _v.dot(_f));
    this.aoa = aoa;
    const rho = RHO0 * Math.exp(-this.pos.y / 8500);
    const S = lerp(0.62, 1.8 * (1 + 0.16 * this.posture), w);
    const a = aoa;
    let CL;
    if (a < 0.48) CL = 1.5 * a; else CL = Math.max(0.12, 0.72 - (a - 0.48) * 1.1);
    CL = CL * w + 0.12 * Math.sin(2 * a) * (1 - w);
    let CD = (0.055 - 0.015 * Math.min(0, this.posture) + 0.02 * Math.max(0, this.posture)) + 1.2 * a * a;
    if (a > 0.6) CD = 0.055 + 1.2 * 0.36 + (a - 0.6) * 0.9;
    CD = CD * w + (0.95 + 0.25 * Math.sin(a) ** 2) * (1 - w);
    const q = 0.5 * rho * V * V * S;
    // lift direction: perpendicular to airflow toward body up
    _l.copy(_up).addScaledVector(_v, -_up.dot(_v));
    if (_l.lengthSq() > 1e-6) _l.normalize();
    _F.set(0, -G * MASS, 0);
    _F.addScaledVector(_l, q * CL);
    _F.addScaledVector(_v, -q * CD);
    // sideslip damping
    _bl.set(1, 0, 0).applyQuaternion(this.q);
    _F.addScaledVector(_bl, -_v.dot(_bl) * q * 0.25);
    this.vel.addScaledVector(_F, dt / MASS);
    this.pos.addScaledVector(this.vel, dt);
    // stability metric
    const dIn = Math.abs(p - this.lastIn.pitch) + Math.abs(t - this.lastIn.turn) + Math.abs(r - this.lastIn.roll);
    this.lastIn.pitch = p; this.lastIn.turn = t; this.lastIn.roll = r;
    let inst = dIn * 6 + Math.max(0, Math.abs(this.bank) - 0.95) * 1.6 + Math.max(0, a - 0.46) * 4 * w * w + Math.abs(this.bankV) * 0.22 * w + this.gust.length() * 0.05 + Math.abs(r) * 0.25;
    this.instab = damp(this.instab, inst, 3, dt);
    const recover = stab ? 55 : 22;
    this.stability = clamp(this.stability + (recover * (1 - clamp(this.instab, 0, 1)) - this.instab * 70) * dt, 0, 100);
    return this._checkCollision(world);
  }

  _canopy(dt, inp, wind, world) {
    if (this.state === STATE.DEPLOY) {
      this.deployT += dt;
      this.canopyOpen = clamp((this.deployT - 0.4) / 1.6, 0, 1);
      // opening shock: strong drag ramp
      const k = this.canopyOpen;
      _air.copy(this.vel).sub(wind);
      const V = _air.length();
      const drag = (0.6 + 9 * k * k) * V * 0.02;
      this.vel.addScaledVector(_air, -drag * dt);
      this.vel.y -= G * dt * (1 - k * 0.8);
      // pendulum upright
      standingQuat(this.cHeading, lerp(-1.2, 0.05, k), _q);
      this.q.slerp(_q, 1 - Math.exp(-4 * dt));
      this.pos.addScaledVector(this.vel, dt);
      if (this.deployT >= 2.0) { this.setState(STATE.CANOPY); if (this.hardOpening) this.stability = Math.max(20, this.stability - 35); }
      this.airspeed = V;
      return this._checkCollision(world);
    }
    const t = inp.turn + inp.roll * 0.6;
    // toggles: A/D pull one side, S both (brakes), W front risers
    this.brakeL = damp(this.brakeL, clamp(-t, 0, 1) + (inp.pitch < 0 ? -inp.pitch : 0), 6, dt);
    this.brakeR = damp(this.brakeR, clamp(t, 0, 1) + (inp.pitch < 0 ? -inp.pitch : 0), 6, dt);
    const brake = clamp(Math.min(this.brakeL, this.brakeR), 0, 1);
    const prev = this.brake;
    this.brake = brake;
    // flare: rapid brake application converts speed into lift briefly
    if (brake - prev > 0.02) this.flareT = Math.min(1.6, this.flareT + (brake - prev) * 3.5);
    this.flareT = Math.max(0, this.flareT - dt);
    this.brakeHold = brake > 0.85 ? this.brakeHold + dt : Math.max(0, this.brakeHold - dt * 2);
    const risers = Math.max(0, inp.pitch);
    const turnRate = (this.brakeR - this.brakeL) * 0.95 * (1 + risers * 0.5);
    this.cHeading -= turnRate * dt;
    this.cBank = damp(this.cBank, -turnRate * 0.35, 3, dt);
    let fwd = lerp(11, 5.5, brake) + risers * 4.5;
    let sink = lerp(4.6, 2.6, brake) + risers * 2.4 + Math.abs(turnRate) * 2.2;
    if (this.flareT > 0) sink -= Math.min(3.2, this.flareT * 3.0);
    if (this.brakeHold > 3) sink += 4; // stall
    if (inp.stab) this.cBank = damp(this.cBank, 0, 4, dt);
    const tvx = Math.sin(this.cHeading) * fwd + wind.x, tvz = Math.cos(this.cHeading) * fwd + wind.z;
    this.vel.x = damp(this.vel.x, tvx, 1.4, dt);
    this.vel.z = damp(this.vel.z, tvz, 1.4, dt);
    this.vel.y = damp(this.vel.y, -sink + this.gust.y * 0.3, 1.8, dt);
    this.pos.addScaledVector(this.vel, dt);
    standingQuat(this.cHeading, 0.05 - brake * 0.15, _q);
    this.q.slerp(_q, 1 - Math.exp(-5 * dt));
    this.airspeed = Math.hypot(fwd, sink);
    this.stability = clamp(this.stability + 20 * dt, 0, 100);
    return this._checkCollision(world);
  }

  _checkCollision(world) {
    const canopy = this.state === STATE.CANOPY || this.state === STATE.DEPLOY;
    const r = canopy ? 0.5 : 0.75;
    const p = canopy ? _f.copy(this.pos).setY(this.pos.y - 0.6) : this.pos;
    const hit = world.collide(p, r);
    if (!hit) return null;
    const gnd = world.ground(this.pos.x, this.pos.z);
    // Under an open canopy a contact from above is a landing (terrain, roof or water)
    if (this.state === STATE.CANOPY && (hit.type === 'terrain' || hit.type === 'water' || (hit.type === 'building' && this.pos.y > hit.top - 0.5))) {
      const vs = -this.vel.y, hs = Math.hypot(this.vel.x, this.vel.z);
      const onRoof = hit.type === 'building';
      this.pos.y = (onRoof ? hit.top : gnd.h) + 0.95;
      const res = { type: 'land', vs, hs, water: hit.type === 'water' || gnd.water, roof: onRoof, surface: hit.type };
      res.hard = vs > 4.2 || hs > 9;
      res.crash = vs > 7.5 || hs > 15;
      this.vel.set(0, 0, 0);
      this.setState(res.crash || res.water ? STATE.CRASHED : STATE.LANDED);
      return res;
    }
    const sp = this.vel.length();
    this.setState(STATE.CRASHED);
    return { type: 'crash', what: hit.type, speed: sp };
  }
}
