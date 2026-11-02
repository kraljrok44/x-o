// Lightweight post-processing: radial speed blur, lens distortion, vignette and danger tint.
import * as THREE from './lib/three.module.min.js';

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.enabled = true;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { samples: 4, type: THREE.HalfFloatType });
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.uniforms = { tDiffuse: { value: this.rt.texture }, uBlur: { value: 0 }, uDanger: { value: 0 }, uDistort: { value: 0.03 }, uFade: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float uBlur, uDanger, uDistort, uFade; varying vec2 vUv;
        void main(){
          vec2 c = vUv - 0.5;
          float r2 = dot(c,c);
          vec2 uv = 0.5 + c * (1.0 - uDistort * r2);
          vec3 col = texture2D(tDiffuse, uv).rgb;
          if (uBlur > 0.001) {
            vec3 acc = col; float w = 1.0;
            for (int i = 1; i <= 6; i++) {
              float k = float(i) / 6.0;
              vec2 o = (uv - 0.5) * (1.0 - uBlur * k * 0.06 * smoothstep(0.02, 0.25, r2));
              acc += texture2D(tDiffuse, 0.5 + o).rgb; w += 1.0;
            }
            col = acc / w;
          }
          float vig = smoothstep(0.85, 0.2, length(c * vec2(1.0, 0.85)));
          col *= mix(0.72, 1.0, vig);
          col = mix(col, vec3(0.9, 0.05, 0.02), uDanger * (1.0 - vig) * 0.55);
          col = mix(col, vec3(0.0), uFade);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }
  setSize(w, h) { this.rt.setSize(w, h); }
  render(scene, camera) {
    const r = this.renderer;
    if (!this.enabled) { r.setRenderTarget(null); r.render(scene, camera); return; }
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.scene, this.cam);
  }
}
