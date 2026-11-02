// Sky dome, sun & ambient light, time-of-day presets, weather and atmospheric particles.
import * as THREE from './lib/three.module.min.js';
import { lerp, clamp } from './util.js';

export const TIMES = {
  morning: { label: 'Morning', elev: 11, az: 95, sun: [1.0, 0.82, 0.66], sunI: 2.0, hemiSky: [0.5, 0.62, 0.9], hemiGr: [0.22, 0.22, 0.26], hemiI: 1.0, zenith: [0.22, 0.42, 0.78], horizon: [0.78, 0.8, 0.86], fog: 1.0, exposure: 1.0, night: 0 },
  midday: { label: 'Midday', elev: 62, az: 160, sun: [1.0, 0.97, 0.92], sunI: 2.3, hemiSky: [0.6, 0.7, 0.88], hemiGr: [0.3, 0.27, 0.22], hemiI: 0.8, zenith: [0.16, 0.38, 0.82], horizon: [0.68, 0.79, 0.93], fog: 0.85, exposure: 0.9, night: 0 },
  sunset: { label: 'Sunset', elev: 5, az: 255, sun: [1.0, 0.52, 0.22], sunI: 2.3, hemiSky: [0.5, 0.42, 0.58], hemiGr: [0.28, 0.18, 0.14], hemiI: 0.8, zenith: [0.17, 0.2, 0.45], horizon: [1.0, 0.58, 0.32], fog: 1.1, exposure: 1.05, night: 0.6 },
  overcast: { label: 'Overcast', elev: 38, az: 140, sun: [0.85, 0.87, 0.9], sunI: 0.75, hemiSky: [0.66, 0.69, 0.74], hemiGr: [0.3, 0.3, 0.3], hemiI: 1.7, zenith: [0.46, 0.49, 0.54], horizon: [0.64, 0.66, 0.69], fog: 1.7, exposure: 1.0, night: 0.2, cloud: 0.9 },
};
export const WEATHERS = {
  clear: { label: 'Clear', fog: 1, wind: 1, gust: 0.6, cloud: 0.25 },
  lightfog: { label: 'Light Fog', fog: 3.2, wind: 0.7, gust: 0.4, cloud: 0.4 },
  heavyfog: { label: 'Heavy Fog', fog: 7.5, wind: 0.5, gust: 0.3, cloud: 0.6 },
  windy: { label: 'Wind Gusts', fog: 1.2, wind: 1.5, gust: 2.0, cloud: 0.45 },
  clouds: { label: 'Cloud Layers', fog: 1.6, wind: 1.2, gust: 1.0, cloud: 0.85 },
  rain: { label: 'Light Rain', fog: 3.0, wind: 1.4, gust: 1.3, cloud: 0.95, rain: true },
};

const v3 = (a) => new THREE.Color(a[0], a[1], a[2]);

export class Sky {
  constructor(scene, renderer, quality) {
    this.scene = scene; this.renderer = renderer; this.quality = quality;
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.sunColor = new THREE.Color(); this.zenith = new THREE.Color(); this.horizon = new THREE.Color(); this.cloudColor = new THREE.Color();
    this.uniforms = {
      uZenith: { value: this.zenith }, uHorizon: { value: this.horizon }, uSunDir: { value: this.sunDir }, uSunColor: { value: this.sunColor },
      uCloud: { value: 0.3 }, uTime: { value: 0 }, uGround: { value: new THREE.Color(0.3, 0.3, 0.32) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `
        uniform vec3 uZenith, uHorizon, uSunDir, uSunColor, uGround; uniform float uCloud, uTime;
        varying vec3 vDir;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*vn(p); p*=2.03; a*=0.5; } return s; }
        void main(){
          vec3 d = normalize(vDir);
          float y = d.y;
          vec3 col = mix(uHorizon, uZenith, pow(clamp(y,0.0,1.0), 0.55));
          col = mix(col, uHorizon*0.92, smoothstep(0.0,-0.25,y));
          float sd = max(dot(d, uSunDir), 0.0);
          col += uSunColor * (pow(sd, 8.0)*0.25 + pow(sd, 64.0)*0.45) * (1.0 - uCloud*0.6);
          col += uSunColor * smoothstep(0.9993, 0.9997, sd) * 6.0 * (1.0 - uCloud*0.85);
          // horizon glow from low sun
          col += uSunColor * pow(1.0-abs(y), 6.0) * pow(sd, 2.0) * 0.25 * clamp(1.0-uSunDir.y*2.0,0.0,1.0);
          if (y > 0.0) {
            vec2 uv = d.xz / (y + 0.12) * 1.4 + vec2(uTime*0.004, uTime*0.0025);
            float c = fbm(uv);
            float cov = smoothstep(1.0-uCloud*0.95, 1.25-uCloud*0.7, c + 0.15);
            vec3 cc = mix(uHorizon*1.05, vec3(1.0), 0.5) * (0.75 + 0.35*pow(sd,4.0)) + uSunColor*0.15;
            cc = mix(cc, cc*0.65, uCloud*0.6);
            col = mix(col, cc, cov * smoothstep(0.0, 0.18, y) * 0.92);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(20000, 32, 16), mat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = quality !== 'low';
    const ss = quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(ss, ss);
    const c = this.sun.shadow.camera; c.left = -90; c.right = 90; c.top = 90; c.bottom = -90; c.near = 10; c.far = 1600;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun); scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xaabbcc, 0.0002);
    this.weather = WEATHERS.clear;
    this.envRT = null;
  }

  apply(timeKey, weatherKey, mapDef) {
    const T = TIMES[timeKey] || TIMES.midday, W = WEATHERS[weatherKey] || WEATHERS.clear;
    this.time = T; this.weather = W; this.timeKey = timeKey; this.weatherKey = weatherKey;
    const el = THREE.MathUtils.degToRad(T.elev), az = THREE.MathUtils.degToRad(T.az);
    this.sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
    const overcastish = clamp(Math.max(T.cloud || 0, W.cloud) - 0.6, 0, 0.4) / 0.4;
    this.sunColor.copy(v3(T.sun));
    this.zenith.copy(v3(T.zenith)).lerp(new THREE.Color(0.5, 0.52, 0.56), overcastish * 0.7);
    this.horizon.copy(v3(T.horizon)).lerp(new THREE.Color(0.66, 0.68, 0.7), overcastish * 0.6);
    if (mapDef && mapDef.id === 'redstone') this.horizon.lerp(new THREE.Color(0.95, 0.75, 0.55), 0.25);
    if (mapDef && mapDef.id === 'metro') this.horizon.lerp(new THREE.Color(0.75, 0.72, 0.7), 0.15);
    this.uniforms.uCloud.value = Math.max(T.cloud || 0, W.cloud);
    this.sun.color.copy(this.sunColor);
    this.sun.intensity = T.sunI * (1 - overcastish * 0.65);
    this.hemi.color.copy(v3(T.hemiSky)); this.hemi.groundColor.copy(v3(T.hemiGr));
    this.hemi.intensity = T.hemiI * (1 + overcastish * 0.4);
    const fogBase = 0.00013 * T.fog * W.fog;
    this.scene.fog.density = fogBase;
    this.scene.fog.color.copy(this.horizon).lerp(this.zenith, 0.12);
    this.cloudColor.copy(this.horizon).lerp(new THREE.Color(1, 1, 1), 0.55).lerp(this.sunColor, 0.15);
    this.night = T.night;
    this.exposure = T.exposure;
    this.renderer.toneMappingExposure = T.exposure;
    this.updateEnv();
  }

  updateEnv() {
    const pm = new THREE.PMREMGenerator(this.renderer);
    const s = new THREE.Scene();
    const d = this.dome.clone(); d.material = this.dome.material;
    d.scale.setScalar(0.004); d.position.set(0, 0, 0);
    s.add(d);
    if (this.envRT) this.envRT.dispose();
    this.envRT = pm.fromScene(s, 0, 0.1, 200);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.8;
    pm.dispose();
  }

  update(dt, camera, focus) {
    this.uniforms.uTime.value += dt;
    this.dome.position.copy(camera.position);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 800);
    this.sun.target.position.copy(focus);
  }
}

// Weather + speed particles around the camera.
export class Particles {
  constructor(scene) {
    this.scene = scene;
    const n = 1400;
    this.n = n;
    const pos = new Float32Array(n * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.seg = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, fog: false }));
    this.seg.frustumCulled = false;
    scene.add(this.seg);
    this.pts = new Float32Array(n * 3);
    this.box = 60;
    for (let i = 0; i < n; i++) { this.pts[i * 3] = (Math.random() * 2 - 1) * this.box; this.pts[i * 3 + 1] = (Math.random() * 2 - 1) * this.box; this.pts[i * 3 + 2] = (Math.random() * 2 - 1) * this.box; }
    this.kind = 'none';
    this.rain = false;
    this.center = new THREE.Vector3();
    this.enabled = true;
  }
  configure(kind, rain) {
    this.kind = kind; this.rain = rain;
    const m = this.seg.material;
    if (rain) { m.color.set(0xb8c8d8); m.opacity = 0.45; }
    else if (kind === 'snow') { m.color.set(0xffffff); m.opacity = 0.8; }
    else if (kind === 'dust') { m.color.set(0xe8b080); m.opacity = 0.45; }
    else { m.color.set(0xffffff); m.opacity = 0.35; }
  }
  // camPos: camera position, rel: velocity of air relative to camera (m/s)
  update(dt, camPos, playerVel, wind, speedFx) {
    const n = this.n, P = this.pts, B = this.box, pos = this.seg.geometry.attributes.position.array;
    const fall = this.rain ? 9 : this.kind === 'snow' ? 1.6 : this.kind === 'dust' ? 0.2 : 0.3;
    // particle world velocity = wind + fall; relative to camera = that - playerVel
    const rx = wind.x - playerVel.x, ry = -fall - playerVel.y, rz = wind.z - playerVel.z;
    const sp = Math.hypot(rx, ry, rz);
    const active = this.enabled && (this.rain || this.kind === 'snow' || this.kind === 'dust' || (speedFx && sp > 20));
    this.seg.visible = active;
    if (!active) return;
    const count = this.rain ? n : this.kind === 'snow' ? 900 : this.kind === 'dust' ? 500 : Math.min(n, Math.floor(sp * 4));
    // shift particles by camera motion so they stay fixed in world, then wrap in box
    const dx = camPos.x - this.center.x, dy = camPos.y - this.center.y, dz = camPos.z - this.center.z;
    this.center.copy(camPos);
    const streak = this.rain ? 0.06 : 0.025 + Math.min(sp, 90) * 0.0006;
    for (let i = 0; i < n; i++) {
      let x = P[i * 3] + (wind.x) * dt - dx, y = P[i * 3 + 1] - fall * dt - dy, z = P[i * 3 + 2] + wind.z * dt - dz;
      if (this.kind === 'snow') { x += Math.sin(i + y * 0.3) * dt; }
      if (x > B) x -= 2 * B; else if (x < -B) x += 2 * B;
      if (y > B) y -= 2 * B; else if (y < -B) y += 2 * B;
      if (z > B) z -= 2 * B; else if (z < -B) z += 2 * B;
      P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
      const o = i * 6;
      if (i < count) {
        pos[o] = camPos.x + x; pos[o + 1] = camPos.y + y; pos[o + 2] = camPos.z + z;
        const l = this.kind === 'snow' && sp < 15 ? 0.04 : streak;
        pos[o + 3] = pos[o] - rx * l; pos[o + 4] = pos[o + 1] - ry * l; pos[o + 5] = pos[o + 2] - rz * l;
      } else { pos[o] = pos[o + 3] = 0; pos[o + 1] = pos[o + 4] = -1e5; pos[o + 2] = pos[o + 5] = 0; }
    }
    this.seg.geometry.attributes.position.needsUpdate = true;
  }
}

// Short-lived puff particles (impact dust, splash, smoke trail)
export class Puffs {
  constructor(scene) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    this.tex = new THREE.CanvasTexture(c);
    this.max = 400;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 3); this.col = new Float32Array(this.max * 4); this.size = new Float32Array(this.max);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.tex }, scale: { value: 600 } }, transparent: true, depthWrite: false,
      vertexShader: `attribute float size; attribute vec4 color; varying vec4 vC; uniform float scale;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / max(-mv.z, 0.5); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec4 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC.rgb, vC.a * t.a); }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.parts = [];
  }
  emit(p, v, color, size, life, grow = 1) {
    if (this.parts.length >= this.max) this.parts.shift();
    this.parts.push({ x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z, c: color, s: size, life, t: 0, grow });
  }
  burst(p, color, n, speed, size) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, b = Math.random() * 1.4;
      this.emit(p, { x: Math.cos(a) * Math.cos(b) * speed * Math.random(), y: Math.sin(b) * speed * Math.random(), z: Math.sin(a) * Math.cos(b) * speed * Math.random() }, color, size * (0.6 + Math.random() * 0.8), 1.2 + Math.random() * 1.2, 2.5);
    }
  }
  clear() { this.parts.length = 0; }
  update(dt) {
    const P = this.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const q = P[i]; q.t += dt;
      if (q.t > q.life) { P.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      const k = Math.exp(-1.5 * dt); q.vx *= k; q.vy = q.vy * k - 1.0 * dt; q.vz *= k;
    }
    for (let i = 0; i < this.max; i++) {
      const q = P[i];
      if (q) {
        const f = q.t / q.life;
        this.pos[i * 3] = q.x; this.pos[i * 3 + 1] = q.y; this.pos[i * 3 + 2] = q.z;
        this.col[i * 4] = q.c[0]; this.col[i * 4 + 1] = q.c[1]; this.col[i * 4 + 2] = q.c[2]; this.col[i * 4 + 3] = (1 - f) * (q.c[3] ?? 0.8);
        this.size[i] = q.s * (1 + f * q.grow);
      } else { this.size[i] = 0; this.col[i * 4 + 3] = 0; }
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.size.needsUpdate = true;
  }
}
