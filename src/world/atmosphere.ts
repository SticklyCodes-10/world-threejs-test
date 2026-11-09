// Sky dome, sun/moon, fog, clouds, stars, IBL and time-of-day control.
import * as THREE from 'three';
import { clamp, lerp, mulberry32, smoothstep } from './noise';

type Key = { e: number; h: number[]; z: number[]; s: number[]; amb: number };
const KEYS: Key[] = [
  { e: -18, h: [0.02, 0.028, 0.055], z: [0.004, 0.008, 0.024], s: [0.4, 0.5, 1.0], amb: 0 },
  { e: -8, h: [0.07, 0.075, 0.14], z: [0.02, 0.03, 0.08], s: [0.6, 0.5, 0.8], amb: 0.05 },
  { e: -3, h: [0.42, 0.3, 0.36], z: [0.1, 0.14, 0.3], s: [1.0, 0.5, 0.35], amb: 0.22 },
  { e: 0.5, h: [0.95, 0.58, 0.36], z: [0.24, 0.34, 0.58], s: [1.0, 0.55, 0.28], amb: 0.42 },
  { e: 7, h: [0.9, 0.74, 0.6], z: [0.27, 0.44, 0.72], s: [1.0, 0.76, 0.5], amb: 0.72 },
  { e: 22, h: [0.76, 0.82, 0.88], z: [0.22, 0.42, 0.78], s: [1.0, 0.92, 0.8], amb: 0.95 },
  { e: 60, h: [0.7, 0.79, 0.89], z: [0.18, 0.38, 0.78], s: [1.0, 0.96, 0.9], amb: 1 },
];

function palette(e: number) {
  let a = KEYS[0];
  let b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (e >= KEYS[i].e && e <= KEYS[i + 1].e) {
      a = KEYS[i];
      b = KEYS[i + 1];
      break;
    }
  }
  if (e <= KEYS[0].e) b = a;
  if (e >= KEYS[KEYS.length - 1].e) a = b;
  const t = a === b ? 0 : (e - a.e) / (b.e - a.e);
  const mix = (x: number[], y: number[]) => x.map((v, i) => lerp(v, y[i], t));
  return { h: mix(a.h, b.h), z: mix(a.z, b.z), s: mix(a.s, b.s), amb: lerp(a.amb, b.amb, t) };
}

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w * 0.99999;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uSun; uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uSunCol;
uniform float uNight; uniform float uTime; uniform float uToLinear; uniform float uAmb; uniform float uCloud;
varying vec3 vDir;
float hs(vec2 p){ p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hs(i), hs(i+vec2(1,0)), f.x), mix(hs(i+vec2(0,1)), hs(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0; float a = 0.5; for(int i=0;i<5;i++){ s += vn(p)*a; p = p*2.03 + 7.1; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  float t = pow(clamp(h, 0.0, 1.0), 0.5);
  vec3 col = mix(uHorizon, uZenith, t);
  if (h < 0.0) col = mix(uHorizon, uHorizon * 0.7, clamp(-h * 4.0, 0.0, 1.0));
  float sd = max(dot(d, uSun), 0.0);
  float vis = 1.0 - uNight * 0.9;
  col += uSunCol * (pow(sd, 5.0) * 0.22 + pow(sd, 48.0) * 0.45) * vis;
  col += uSunCol * smoothstep(0.99955, 0.99985, sd) * 6.0 * step(0.0, uSun.y + 0.02);
  col = mix(col, uHorizon, exp(-max(h, 0.0) * 8.0) * 0.5);
  float md = dot(d, -uSun);
  col += vec3(0.85, 0.9, 1.0) * smoothstep(0.99935, 0.9996, md) * uNight * 0.9;
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.14) * 0.6 + uTime * vec2(0.004, 0.0015);
    float c = fbm(uv * 1.25);
    float cov = smoothstep(0.5 - uCloud * 0.12, 0.78, c);
    float fade = smoothstep(0.0, 0.16, h);
    float c2 = fbm(uv * 1.25 + uSun.xz * 0.1);
    float shade = clamp(0.62 + (c - c2) * 3.2, 0.35, 1.1);
    vec3 cc = mix(vec3(0.52, 0.56, 0.64), vec3(1.0, 0.98, 0.96), shade);
    cc *= mix(vec3(1.0), uSunCol, 0.45) * mix(0.05, 1.0, uAmb);
    cc += uSunCol * pow(sd, 8.0) * 0.25 * cov * uAmb;
    col = mix(col, cc, cov * fade * 0.92);
  }
  if (uToLinear > 0.5) col = pow(col, vec3(2.2));
  gl_FragColor = vec4(col, 1.0);
}`;

export class Atmosphere {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  sky: THREE.Mesh;
  envSky: THREE.Mesh;
  envScene = new THREE.Scene();
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  stars: THREE.Points;
  fog: THREE.FogExp2;
  pmrem: THREE.PMREMGenerator;
  envTarget: THREE.WebGLRenderTarget | null = null;
  uniforms: Record<string, { value: any }>;
  timeOfDay = 15.2;
  speed = 0; // hours per real second
  night = 0;
  amb = 1;
  elevDeg = 40;
  sunDir = new THREE.Vector3(0, 1, 0);
  lightDir = new THREE.Vector3(0, 1, 0);
  private lastEnvT = -99;
  private clock = 0;
  shadowRes = 4096;
  fogBase = 0.0001;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.uniforms = {
      uSun: { value: new THREE.Vector3(0, 1, 0) },
      uHorizon: { value: new THREE.Color() },
      uZenith: { value: new THREE.Color() },
      uSunCol: { value: new THREE.Color() },
      uNight: { value: 0 },
      uTime: { value: 0 },
      uAmb: { value: 1 },
      uCloud: { value: 0.35 },
    };
    const mk = (toLinear: number) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
        uniforms: { ...this.uniforms, uToLinear: { value: toLinear } },
      });
      mat.toneMapped = false;
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20), mat);
      m.frustumCulled = false;
      m.renderOrder = -100;
      return m;
    };
    this.sky = mk(0);
    this.sky.scale.setScalar(20000);
    scene.add(this.sky);
    this.envSky = mk(1);
    this.envSky.scale.setScalar(50);
    this.envScene.add(this.envSky);

    this.fog = new THREE.FogExp2(0xb8c8d8, this.fogBase);
    scene.fog = this.fog;

    this.hemi = new THREE.HemisphereLight(0xaac4ff, 0x4a4235, 0.5);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2e0, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.shadowRes, this.shadowRes);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.9;
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 7000;
    scene.add(this.sun);
    scene.add(this.sun.target);

    const r = mulberry32(5);
    const sp = new Float32Array(2200 * 3);
    for (let i = 0; i < 2200; i++) {
      const u = r() * 2 - 1;
      const a = r() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      sp[i * 3] = Math.cos(a) * s * 18000;
      sp[i * 3 + 1] = Math.abs(u) * 18000 * 0.98 + 200;
      sp[i * 3 + 2] = Math.sin(a) * s * 18000;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -90;
    scene.add(this.stars);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.apply(true);
  }

  setShadowRes(n: number) {
    this.shadowRes = n;
    this.sun.shadow.mapSize.set(n, n);
    this.sun.shadow.map?.dispose();
    (this.sun.shadow as any).map = null;
  }

  setTime(t: number) {
    this.timeOfDay = ((t % 24) + 24) % 24;
    this.apply(false);
  }

  private apply(force: boolean) {
    const a = ((this.timeOfDay - 6) / 12) * Math.PI;
    this.sunDir.set(Math.cos(a), Math.sin(a), 0.35 * Math.sin(a) + 0.1).normalize();
    this.elevDeg = (Math.asin(this.sunDir.y) * 180) / Math.PI;
    const pal = palette(this.elevDeg);
    const U = this.uniforms;
    U.uSun.value.copy(this.sunDir);
    U.uHorizon.value.setRGB(pal.h[0], pal.h[1], pal.h[2], THREE.LinearSRGBColorSpace);
    U.uZenith.value.setRGB(pal.z[0], pal.z[1], pal.z[2], THREE.LinearSRGBColorSpace);
    U.uSunCol.value.setRGB(pal.s[0], pal.s[1], pal.s[2], THREE.LinearSRGBColorSpace);
    this.night = 1 - smoothstep(-6, 4, this.elevDeg);
    this.amb = pal.amb;
    U.uNight.value = this.night;
    U.uAmb.value = pal.amb;
    this.fog.color.setRGB(pal.h[0], pal.h[1], pal.h[2], THREE.LinearSRGBColorSpace);
    this.fog.density = this.fogBase * (this.night > 0.5 ? 0.8 : 1);

    const sunI = smoothstep(-3, 8, this.elevDeg) * 3.4;
    const moonI = (1 - smoothstep(-9, -1, this.elevDeg)) * 0.5;
    const useSun = sunI >= moonI;
    this.lightDir.copy(this.sunDir);
    if (!useSun) this.lightDir.negate();
    if (useSun) {
      this.sun.color.setRGB(pal.s[0], pal.s[1] * 0.97 + 0.03, pal.s[2] * 0.95 + 0.05, THREE.LinearSRGBColorSpace);
      this.sun.intensity = sunI;
    } else {
      this.sun.color.setRGB(0.55, 0.65, 1.0, THREE.LinearSRGBColorSpace);
      this.sun.intensity = moonI;
    }
    this.hemi.intensity = lerp(0.1, 0.45, pal.amb);
    this.hemi.color.setRGB(lerp(0.15, 0.62, pal.amb), lerp(0.2, 0.74, pal.amb), lerp(0.4, 0.95, pal.amb), THREE.LinearSRGBColorSpace);
    this.hemi.groundColor.setRGB(0.3, 0.27, 0.22, THREE.LinearSRGBColorSpace);
    (this.stars.material as THREE.PointsMaterial).opacity = clamp(this.night * 1.3 - 0.3, 0, 1);
    this.renderer.toneMappingExposure = lerp(1.25, 0.92, pal.amb);
    this.scene.environmentIntensity = lerp(0.12, 0.85, pal.amb);

    if (force || Math.abs(this.timeOfDay - this.lastEnvT) > 0.12) {
      this.lastEnvT = this.timeOfDay;
      const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 100);
      if (this.envTarget) this.envTarget.dispose();
      this.envTarget = rt;
      this.scene.environment = rt.texture;
    }
  }

  update(dt: number, camPos: THREE.Vector3, camAlt: number) {
    this.clock += dt;
    this.uniforms.uTime.value = this.clock;
    if (this.speed > 0) {
      this.timeOfDay = (this.timeOfDay + dt * this.speed) % 24;
      this.apply(false);
    }
    this.sky.position.copy(camPos);
    this.stars.position.copy(camPos);

    // shadow frustum that follows the camera, texel-snapped
    const s = clamp(camAlt * 1.15 + 150, 170, 1900);
    const cam = this.sun.shadow.camera as THREE.OrthographicCamera;
    cam.left = -s;
    cam.right = s;
    cam.top = s;
    cam.bottom = -s;
    cam.updateProjectionMatrix();
    const c = new THREE.Vector3(camPos.x, Math.max(0, camPos.y - camAlt), camPos.z);
    // look a bit ahead of the camera is not needed; centre on ground under it
    const L = this.lightDir;
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), L.clone().negate(), new THREE.Vector3(0, 1, 0));
    const right = new THREE.Vector3().setFromMatrixColumn(m, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(m, 1);
    const texel = (2 * s) / this.shadowRes;
    const px = c.dot(right);
    const py = c.dot(up);
    c.addScaledVector(right, Math.round(px / texel) * texel - px);
    c.addScaledVector(up, Math.round(py / texel) * texel - py);
    this.sun.target.position.copy(c);
    this.sun.position.copy(c).addScaledVector(L, 3500);
    this.sun.target.updateMatrixWorld();
  }
}
