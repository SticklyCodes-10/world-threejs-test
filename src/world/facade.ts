// Procedural facade material (windows, brick, stone, decay, night lighting)
// plus geometry builders (merged + instanced) that feed it.
import * as THREE from 'three';
import { noiseTex } from './textures';

export const facadeUniforms = {
  uNight: { value: 0 },
};

export interface FStyle {
  color?: number;
  bayW?: number;
  floorH?: number;
  winW?: number;
  winH?: number;
  glass?: number; // 0 punched dark, 1 curtain wall, 2 green tint, 3 decayed (hospital)
  decay?: number; // 0..1 grime/rust/moss/peeling + broken windows when glass==3
  wall?: number; // 0 render, 1 brick, 2 precast panel, 3 ashlar stone, 4 shingle roof, 5 metal, 6 concrete roof
  store?: boolean; // glazed ground floor
  uplight?: boolean; // floodlit at night
  seed?: number;
}

const VERT_PARS = /* glsl */ `
attribute vec4 fParams;
attribute vec4 fStyle;
attribute vec4 fExtra;
#ifndef USE_INSTANCING
attribute vec3 fLocal;
attribute vec3 fNrm;
#endif
varying vec4 vFP;
varying vec4 vFS;
varying vec4 vFE;
varying vec3 vFL;
varying vec3 vFN;
varying vec3 vWP;
`;

const VERT_MAIN = /* glsl */ `
vFP = fParams; vFS = fStyle; vFE = fExtra;
#ifdef USE_INSTANCING
  vec3 isc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  vFL = vec3(position.x + 0.5, position.y, position.z + 0.5) * isc;
  vFN = normal;
  vec4 wp4 = instanceMatrix * vec4(transformed, 1.0);
#else
  vFL = fLocal; vFN = fNrm;
  vec4 wp4 = vec4(transformed, 1.0);
#endif
vWP = (modelMatrix * wp4).xyz;
`;

const FRAG_PARS = /* glsl */ `
uniform float uNight;
uniform sampler2D uNoise;
varying vec4 vFP;
varying vec4 vFS;
varying vec4 vFE;
varying vec3 vFL;
varying vec3 vFN;
varying vec3 vWP;

float fh12(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

vec3 fBrick(float u, float v, vec3 base, float fine){
  float rowH = 0.0766; float L = 0.225;
  float row = floor(v / rowH);
  float bu = u / L + mod(row, 2.0) * 0.5;
  float cu = floor(bu);
  vec2 fb = vec2(fract(bu), fract(v / rowH));
  float mortar = clamp(step(fb.x, 0.06) + step(fb.y, 0.14), 0.0, 1.0);
  float tone = 0.62 + 0.7 * fh12(vec2(cu, row));
  vec3 c = mix(base * tone, vec3(0.5, 0.48, 0.44), mortar * 0.85);
  return mix(c, base * 0.95, fine);
}

vec3 fAshlar(float u, float v, vec3 base, float fine, inout float rustic){
  float bh = 0.62; float bw = 1.3;
  float row = floor(v / bh);
  float bu = u / bw + mod(row, 2.0) * 0.5;
  vec2 fb = vec2(fract(bu), fract(v / bh));
  float line = clamp(step(fb.x, 0.012) + step(fb.y, 0.02), 0.0, 1.0);
  float tone = 0.93 + 0.1 * fh12(vec2(floor(bu), row));
  float deep = (1.0 - smoothstep(3.0, 6.0, v));
  float groove = clamp(step(fb.y, 0.05) , 0.0, 1.0) * deep;
  rustic = deep;
  vec3 c = base * tone * (1.0 - 0.28 * line - 0.2 * groove);
  return mix(c, base * 0.97, fine);
}

void facadeShade(vec3 base, out vec3 col, out float rough, out float metal, out vec3 emis){
  vec3 N = normalize(vFN);
  float wallT = vFE.x;
  float decay = vFS.w;
  float dist = distance(cameraPosition, vWP);
  float fine = smoothstep(35.0, 120.0, dist);
  vec4 nzA = texture2D(uNoise, vWP.xz * 0.045 + vec2(vWP.y * 0.031, 0.0));
  vec4 nzB = texture2D(uNoise, vWP.xz * 0.37 + vec2(vWP.y * 0.21, 0.3));
  col = base; rough = 0.88; metal = 0.0; emis = vec3(0.0);

  bool roofFlat = N.y > 0.6 && wallT < 3.5;
  bool slopeRoof = wallT > 3.5 && abs(N.x) < 0.9 && N.y > 0.15;

  if (N.y < -0.6) {
    col = base * 0.3;
  } else if (roofFlat) {
    col = base * (0.5 + 0.35 * nzA.r + 0.25 * nzB.g) * (0.85 + 0.3 * nzB.b);
    rough = 0.95;
    col = mix(col, vec3(0.16, 0.21, 0.11), decay * smoothstep(0.5, 0.72, nzA.g) * 0.85);
    col *= 1.0 - decay * 0.25 * nzB.r;
  } else if (slopeRoof) {
    bool alongX = abs(N.x) > abs(N.z);
    float along = alongX ? vFL.x : vFL.z;
    float across = alongX ? vFL.z : vFL.x;
    if (wallT < 4.5) {
      float rowId = floor(along / 0.34);
      float rf = fract(along / 0.34);
      float ci = floor(across / 0.3 + fh12(vec2(rowId, 3.0)));
      float shade = 0.78 + 0.34 * fh12(vec2(ci, rowId)) - 0.22 * smoothstep(0.82, 1.0, rf);
      col = base * shade * (0.88 + 0.24 * nzB.g);
      col = mix(col, vec3(0.15, 0.2, 0.1), decay * smoothstep(0.45, 0.7, nzA.g) * 0.7);
      rough = 0.92;
    } else {
      float rib = 0.82 + 0.18 * sin(across * 18.0);
      col = base * rib * (0.85 + 0.3 * nzA.g);
      col = mix(col, vec3(0.38, 0.17, 0.08), decay * smoothstep(0.35, 0.65, nzB.r) * 0.75);
      rough = 0.45 + decay * 0.4; metal = 0.55 * (1.0 - decay * 0.6);
    }
  } else {
    bool xf = abs(N.x) > 0.5;
    float u = xf ? vFL.z : vFL.x;
    float v = vFL.y;
    float bw = xf ? vFP.y : vFP.x;
    float fh = max(vFP.z, 0.5);
    float seed = vFP.w + (xf ? 11.0 : 0.0) + ((N.x + N.z) > 0.0 ? 5.0 : 0.0);
    float rustic = 0.0;
    // --- wall pattern
    if (wallT > 0.5 && wallT < 1.5) col = fBrick(u, v, base, fine);
    else if (wallT > 2.5 && wallT < 3.5) col = fAshlar(u, v, base, fine, rustic);
    else if (wallT > 1.5 && wallT < 2.5) {
      float lx = abs(fract(u / 1.6) - 0.5);
      float ly = abs(fract(v / fh) - 0.5);
      float jn = step(0.488, lx) + step(0.494, ly);
      col = base * (1.0 - 0.18 * clamp(jn, 0.0, 1.0)) * (0.92 + 0.16 * nzA.g);
    } else if (wallT > 4.5) {
      col = base * (0.86 + 0.14 * sin(u * 24.0)) * (0.85 + 0.3 * nzA.g);
      rough = 0.5; metal = 0.5;
    } else {
      col = base * (0.88 + 0.22 * nzA.r) * (0.94 + 0.12 * nzB.g);
      float fl = step(fract(v / fh), 0.02);
      col *= 1.0 - 0.1 * fl;
    }
    // --- windows
    float winMask = 0.0;
    vec2 id = vec2(0.0); vec2 f = vec2(0.0);
    float x0 = 0.2, x1 = 0.8, y0 = 0.2, y1 = 0.8;
    float wfw = vFS.x; float wfh = vFS.y; float gt = vFS.z;
    vec3 wcol = vec3(0.05); float wMetal = 0.6; float wRough = 0.1; float lit = 0.0;
    if (wfw > 0.01 && bw > 0.1) {
      vec2 cell = vec2(u / bw, v / fh);
      id = floor(cell); f = fract(cell);
      x0 = 0.5 * (1.0 - wfw); x1 = 1.0 - x0;
      y0 = 0.5 * (1.0 - wfh) + 0.03; y1 = y0 + wfh;
      bool store = vFE.y > 0.5 && id.y < 0.5;
      if (store) { x0 = 0.04; x1 = 0.96; y0 = 0.08; y1 = 0.9; }
      vec2 fw = fwidth(cell) * 1.2 + 1e-4;
      float mx = smoothstep(x0 - fw.x, x0 + fw.x, f.x) - smoothstep(x1 - fw.x, x1 + fw.x, f.x);
      float my = smoothstep(y0 - fw.y, y0 + fw.y, f.y) - smoothstep(y1 - fw.y, y1 + fw.y, f.y);
      winMask = clamp(mx, 0.0, 1.0) * clamp(my, 0.0, 1.0);
      winMask = mix(winMask, wfw * wfh, smoothstep(250.0, 800.0, dist));
      float rnd = fh12(id + vec2(seed, seed * 1.7));
      float rnd2 = fh12(id * 1.31 + vec2(seed * 0.37, 9.0));
      vec3 glass = gt < 0.5 ? vec3(0.07, 0.09, 0.11) : (gt < 1.5 ? vec3(0.17, 0.28, 0.36) : (gt < 2.5 ? vec3(0.09, 0.17, 0.15) : vec3(0.06, 0.07, 0.065)));
      wMetal = gt < 0.5 ? 0.55 : 0.85; wRough = gt < 0.5 ? 0.12 : 0.05;
      glass *= 0.72 + 0.55 * rnd2;
      wcol = glass;
      float litFrac = store ? 0.8 : (gt > 0.5 && gt < 1.5 ? 0.42 : 0.3);
      if (gt < 2.5) lit = step(1.0 - litFrac, rnd);
      if (gt > 2.5) {
        // abandoned building: intact / boarded / broken / open
        if (rnd < 0.36) { wcol = glass * (1.0 + 0.9 * nzB.g); wRough = 0.3; wMetal = 0.3; }
        else if (rnd < 0.62) {
          float pl = step(0.5, fract(f.y * 6.0 + rnd2));
          wcol = vec3(0.37, 0.29, 0.2) * (0.6 + 0.5 * nzB.r) * (0.8 + 0.25 * pl); wRough = 0.95; wMetal = 0.0;
        } else if (rnd < 0.86) {
          float cr = abs(sin((f.x * 7.0 + f.y * 3.0 + rnd2 * 6.0) * 3.0));
          wcol = vec3(0.02) + vec3(0.28) * smoothstep(0.96, 1.0, cr); wRough = 0.2; wMetal = 0.5;
        } else { wcol = vec3(0.008); wRough = 1.0; wMetal = 0.0; }
      }
      wcol *= 1.0 - 0.38 * smoothstep(y1 - 0.14, y1, f.y);
      // sills and lintels on solid wall
      float inX = step(x0 - 0.03, f.x) * step(f.x, x1 + 0.03);
      float sill = inX * step(y0 - 0.06, f.y) * step(f.y, y0) * (1.0 - winMask);
      col = mix(col, base * 1.2 + 0.03, sill * 0.7 * (1.0 - fine));
      // rust runs below windows on decayed walls
      float runs = inX * step(f.y, y0) * smoothstep(y0 - 0.55, y0, f.y) * decay;
      col = mix(col, vec3(0.34, 0.18, 0.1), runs * 0.55 * smoothstep(0.3, 0.6, nzB.r));
    }
    // --- weathering / decay
    float streak = texture2D(uNoise, vec2(u * 0.8 + seed, v * 0.035)).g;
    col *= 1.0 - decay * (0.12 + 0.5 * streak) * (0.5 + 0.5 * smoothstep(0.0, 25.0, v));
    float moss = smoothstep(9.0, 0.0, v) * decay * smoothstep(0.38, 0.7, nzA.r);
    col = mix(col, vec3(0.12, 0.19, 0.08), moss * 0.85);
    float peel = smoothstep(0.58, 0.64, texture2D(uNoise, vec2(u, v) * 0.11 + seed).b) * decay;
    col = mix(col, col * 0.55 + vec3(0.13, 0.12, 0.105), peel * 0.8);
    // contact AO at ground
    col *= mix(0.7, 1.0, smoothstep(0.0, 3.5, v));
    // upward floodlight at night
    if (vFE.z > 0.5) emis += col * 0.55 * (1.0 - smoothstep(0.0, 24.0, v)) * (1.0 - winMask);
    // compose windows
    col = mix(col, wcol, winMask);
    rough = mix(rough, wRough, winMask);
    metal = mix(metal, wMetal, winMask);
    vec3 warm = mix(vec3(1.0, 0.72, 0.4), vec3(0.75, 0.88, 1.0), fh12(id + 7.7));
    emis += warm * lit * winMask * (0.55 + 0.9 * fh12(id + 3.3));
  }
}
`;

const FRAG_MAIN = /* glsl */ `
vec3 fCol; float fRough; float fMetal; vec3 fEmis;
facadeShade(diffuseColor.rgb, fCol, fRough, fMetal, fEmis);
diffuseColor.rgb = fCol;
`;

export function createFacadeMaterial(vertexColors: boolean) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, vertexColors });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = facadeUniforms.uNight;
    shader.uniforms.uNoise = { value: noiseTex() };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_MAIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_MAIN)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = fRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = fMetal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += fEmis * uNight;');
  };
  mat.customProgramCacheKey = () => 'facade' + (vertexColors ? 'V' : 'I');
  return mat;
}

// ---------------------------------------------------------------------------
const _c = new THREE.Color();
function styleFP(st: FStyle, w: number, h: number, d: number): [number, number, number, number] {
  const bayW = st.bayW ?? 3.6;
  const floorH = st.floorH ?? 3.6;
  const bx = w / Math.max(1, Math.round(w / bayW));
  const bz = d / Math.max(1, Math.round(d / bayW));
  const fh = h / Math.max(1, Math.round(h / floorH));
  return [bx, bz, fh, st.seed ?? Math.random() * 100];
}
function styleFS(st: FStyle): [number, number, number, number] {
  return [st.winW ?? 0.55, st.winH ?? 0.55, st.glass ?? 0, st.decay ?? 0];
}
function styleFE(st: FStyle, wallOverride?: number): [number, number, number, number] {
  return [wallOverride ?? st.wall ?? 0, st.store ? 1 : 0, st.uplight ? 1 : 0, 0];
}

// ---------------------------------------------------------------------------
// Merged geometry builder (for hand-modelled landmark buildings)
export class GeoBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  fp: number[] = [];
  fs: number[] = [];
  fe: number[] = [];
  fl: number[] = [];
  fn: number[] = [];
  idx: number[] = [];
  count = 0;

  private vert(
    p: [number, number, number],
    n: [number, number, number],
    color: THREE.Color,
    fp: number[],
    fs: number[],
    fe: number[],
    fl: number[],
    fn: number[]
  ) {
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    this.col.push(color.r, color.g, color.b);
    this.fp.push(...fp);
    this.fs.push(...fs);
    this.fe.push(...fe);
    this.fl.push(...fl);
    this.fn.push(...fn);
    return this.count++;
  }

  private xf(cx: number, y0: number, cz: number, yaw: number) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return (x: number, y: number, z: number): [number, number, number] => [cx + x * c + z * s, y0 + y, cz - x * s + z * c];
  }
  private rot(yaw: number) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return (x: number, y: number, z: number): [number, number, number] => [x * c + z * s, y, -x * s + z * c];
  }

  /** generic convex polygon face given in local coordinates (relative to shape origin) */
  private face(
    T: ReturnType<GeoBuilder['xf']>,
    R: ReturnType<GeoBuilder['rot']>,
    pts: number[][],
    n: number[],
    loc: number[][],
    st: FStyle,
    fp: number[],
    wall?: number,
    color?: THREE.Color
  ) {
    const fs = styleFS(st);
    const fe = styleFE(st, wall);
    const cc = color ?? _c.setHex(st.color ?? 0xcccccc);
    const wn = R(n[0], n[1], n[2]);
    const ids: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      ids.push(this.vert(T(pts[i][0], pts[i][1], pts[i][2]), wn, cc, fp, fs, fe, loc[i], n));
    }
    for (let i = 1; i < pts.length - 1; i++) this.idx.push(ids[0], ids[i], ids[i + 1]);
  }

  box(cx: number, y0: number, cz: number, w: number, h: number, d: number, yaw: number, st: FStyle = {}) {
    const T = this.xf(cx, y0, cz, yaw);
    const R = this.rot(yaw);
    const fp = styleFP(st, w, h, d);
    const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
    const L = (x: number, y: number, z: number) => [x + w / 2, y, z + d / 2];
    // CCW as seen from outside
    const faces: [number[][], number[]][] = [
      [[[x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1]], [0, 0, 1]],
      [[[x1, 0, z0], [x0, 0, z0], [x0, h, z0], [x1, h, z0]], [0, 0, -1]],
      [[[x1, 0, z1], [x1, 0, z0], [x1, h, z0], [x1, h, z1]], [1, 0, 0]],
      [[[x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0]], [-1, 0, 0]],
      [[[x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0]], [0, 1, 0]],
    ];
    for (const [pts, n] of faces) {
      const loc = pts.map((p) => L(p[0], p[1], p[2]));
      this.face(T, R, pts, n, loc, st, fp);
    }
  }

  /** gable roof prism; ridge along local X */
  gable(cx: number, y0: number, cz: number, w: number, h: number, d: number, yaw: number, st: FStyle = {}) {
    const T = this.xf(cx, y0, cz, yaw);
    const R = this.rot(yaw);
    const fp = styleFP(st, w, h, d);
    const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
    const L = (x: number, y: number, z: number) => [x + w / 2, y, z + d / 2];
    const sl = Math.hypot(h, d / 2);
    const ny = (d / 2) / sl;
    const nz = h / sl;
    const wallT = st.wall && st.wall >= 4 ? st.wall : 4;
    const mk = (pts: number[][], n: number[], wall: number) => this.face(T, R, pts, n, pts.map((p) => L(p[0], p[1], p[2])), st, fp, wall);
    mk([[x0, 0, z1], [x1, 0, z1], [x1, h, 0], [x0, h, 0]], [0, ny, nz], wallT);
    mk([[x1, 0, z0], [x0, 0, z0], [x0, h, 0], [x1, h, 0]], [0, ny, -nz], wallT);
    mk([[x1, 0, z1], [x1, 0, z0], [x1, h, 0]], [1, 0, 0], 0);
    mk([[x0, 0, z0], [x0, 0, z1], [x0, h, 0]], [-1, 0, 0], 0);
  }

  hip(cx: number, y0: number, cz: number, w: number, h: number, d: number, yaw: number, st: FStyle = {}) {
    const T = this.xf(cx, y0, cz, yaw);
    const R = this.rot(yaw);
    const fp = styleFP(st, w, h, d);
    const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
    const rl = Math.max(0.15 * w, w / 2 - d / 2);
    const L = (x: number, y: number, z: number) => [x + w / 2, y, z + d / 2];
    const wallT = st.wall && st.wall >= 4 ? st.wall : 4;
    const mk = (pts: number[][], n: number[]) => this.face(T, R, pts, n, pts.map((p) => L(p[0], p[1], p[2])), st, fp, wallT);
    const sl = Math.hypot(h, d / 2);
    const nzs = h / sl;
    const nys = (d / 2) / sl;
    void nzs;
    const run = Math.max(0.01, w / 2 - rl / 2);
    const el = Math.hypot(h, run);
    const hx = rl / 2;
    mk([[x0, 0, z1], [x1, 0, z1], [hx, h, 0], [-hx, h, 0]], [0, nys, h / sl]);
    mk([[x1, 0, z0], [x0, 0, z0], [-hx, h, 0], [hx, h, 0]], [0, nys, -h / sl]);
    mk([[x1, 0, z1], [x1, 0, z0], [hx, h, 0]], [h / el, run / el, 0]);
    mk([[x0, 0, z0], [x0, 0, z1], [-hx, h, 0]], [-h / el, run / el, 0]);
  }

  cyl(cx: number, y0: number, cz: number, r: number, h: number, seg: number, st: FStyle = {}, rTop?: number, cap = true) {
    const T = this.xf(cx, y0, cz, 0);
    const R = this.rot(0);
    const fp = styleFP(st, 2 * Math.PI * r, h, 1);
    const rt = rTop ?? r;
    const fs = styleFS(st);
    const fe = styleFE(st);
    const cc = _c.setHex(st.color ?? 0xcccccc);
    const ids: number[][] = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const slope = (r - rt) / h;
      const nl = Math.hypot(1, slope);
      const n: [number, number, number] = [ca / nl, slope / nl, sa / nl];
      const u = a * r;
      ids.push([
        this.vert(T(ca * r, 0, sa * r), n, cc, fp, fs, fe, [u, 0, 0], [0, 0, 1]),
        this.vert(T(ca * rt, h, sa * rt), n, cc, fp, fs, fe, [u, h, 0], [0, 0, 1]),
      ]);
    }
    for (let i = 0; i < seg; i++) {
      this.idx.push(ids[i][0], ids[i + 1][1], ids[i + 1][0], ids[i][0], ids[i][1], ids[i + 1][1]);
    }
    if (cap && rt > 0.01) {
      const c0 = this.vert(T(0, h, 0), R(0, 1, 0), cc, fp, fs, [6, 0, 0, 0], [0, h, 0], [0, 1, 0]);
      const ring: number[] = [];
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        ring.push(this.vert(T(Math.cos(a) * rt, h, Math.sin(a) * rt), R(0, 1, 0), cc, fp, fs, [6, 0, 0, 0], [0, h, 0], [0, 1, 0]));
      }
      for (let i = 0; i < seg; i++) this.idx.push(c0, ring[i + 1], ring[i]);
    }
  }

  cone(cx: number, y0: number, cz: number, r: number, h: number, seg: number, st: FStyle = {}) {
    this.cyl(cx, y0, cz, r, h, seg, st, 0.001, false);
  }

  dome(cx: number, y0: number, cz: number, r: number, hScale: number, seg: number, st: FStyle = {}) {
    const T = this.xf(cx, y0, cz, 0);
    const fp = styleFP(st, r, r, r);
    const fs = styleFS(st);
    const fe = styleFE(st, st.wall ?? 5);
    const cc = _c.setHex(st.color ?? 0x7a9a8a);
    const rings = Math.max(4, Math.floor(seg / 2));
    const grid: number[][] = [];
    for (let j = 0; j <= rings; j++) {
      const phi = (j / rings) * Math.PI * 0.5;
      const row: number[] = [];
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const x = Math.cos(a) * Math.cos(phi);
        const z = Math.sin(a) * Math.cos(phi);
        const y = Math.sin(phi);
        const nl = Math.hypot(x / 1, y / hScale, z / 1);
        row.push(this.vert(T(x * r, y * r * hScale, z * r), [x / nl, y / hScale / nl, z / nl], cc, fp, fs, fe, [a * r, y * r * hScale, 0], [0, 0, 1]));
      }
      grid.push(row);
    }
    for (let j = 0; j < rings; j++)
      for (let i = 0; i < seg; i++) {
        const a = grid[j][i], b = grid[j][i + 1], c = grid[j + 1][i + 1], d = grid[j + 1][i];
        this.idx.push(a, c, b, a, d, c);
      }
  }

  /** flat horizontal quad (e.g. canopy underside, plates) using the facade shader */
  slab(cx: number, y0: number, cz: number, w: number, d: number, yaw: number, st: FStyle = {}) {
    this.box(cx, y0, cz, w, 0.25, d, yaw, st);
  }

  build(material: THREE.Material, castShadow = true, receiveShadow = true) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('fParams', new THREE.Float32BufferAttribute(this.fp, 4));
    g.setAttribute('fStyle', new THREE.Float32BufferAttribute(this.fs, 4));
    g.setAttribute('fExtra', new THREE.Float32BufferAttribute(this.fe, 4));
    g.setAttribute('fLocal', new THREE.Float32BufferAttribute(this.fl, 3));
    g.setAttribute('fNrm', new THREE.Float32BufferAttribute(this.fn, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    const m = new THREE.Mesh(g, material);
    m.castShadow = castShadow;
    m.receiveShadow = receiveShadow;
    return m;
  }
}

// ---------------------------------------------------------------------------
// Instanced facades (city buildings)
let UNIT: Record<string, THREE.BufferGeometry> | null = null;

function unitGeoms() {
  if (UNIT) return UNIT;
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  // gable: base 1x1, ridge at y=1 along x
  const gp = [
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0,
    0.5, 0, -0.5, -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 1, 0,
    0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, 0,
    -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0,
  ];
  const ny = 0.5 / Math.hypot(1, 0.5);
  const k = 1 / Math.hypot(1, 0.5);
  const gn = [0, ny, k, 0, ny, k, 0, ny, k, 0, ny, k, 0, ny, -k, 0, ny, -k, 0, ny, -k, 0, ny, -k, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0];
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
  gg.setAttribute('normal', new THREE.Float32BufferAttribute(gn, 3));
  gg.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 11, 12, 13]);
  // hip: ridge from x=-0.22..0.22
  const rx = 0.22;
  const hpos = [
    -0.5, 0, 0.5, 0.5, 0, 0.5, rx, 1, 0, -rx, 1, 0, // front
    0.5, 0, -0.5, -0.5, 0, -0.5, -rx, 1, 0, rx, 1, 0, // back
    0.5, 0, 0.5, 0.5, 0, -0.5, rx, 1, 0, // right
    -0.5, 0, -0.5, -0.5, 0, 0.5, -rx, 1, 0, // left
  ];
  const hn: number[] = [];
  const nrm = (x: number, y: number, z: number) => {
    const l = Math.hypot(x, y, z);
    return [x / l, y / l, z / l];
  };
  const f = nrm(0, 0.5, 1);
  const b = nrm(0, 0.5, -1);
  const r = nrm(1, 0.5 * (0.5 - rx) * 0 + 0.3, 0);
  const l = nrm(-1, 0.3, 0);
  for (let i = 0; i < 4; i++) hn.push(...f);
  for (let i = 0; i < 4; i++) hn.push(...b);
  for (let i = 0; i < 3; i++) hn.push(...r);
  for (let i = 0; i < 3; i++) hn.push(...l);
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.Float32BufferAttribute(hpos, 3));
  hg.setAttribute('normal', new THREE.Float32BufferAttribute(hn, 3));
  hg.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 11, 12, 13]);
  const cy = new THREE.CylinderGeometry(0.5, 0.5, 1, 14, 1, false);
  cy.translate(0, 0.5, 0);
  UNIT = { box, gable: gg, hip: hg, cyl: cy };
  return UNIT;
}

interface InstList {
  m: number[];
  c: number[];
  fp: number[];
  fs: number[];
  fe: number[];
  n: number;
}
const newList = (): InstList => ({ m: [], c: [], fp: [], fs: [], fe: [], n: 0 });
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export class FacadeInstances {
  lists: Record<string, InstList> = { box: newList(), gable: newList(), hip: newList(), cyl: newList() };

  private add(kind: string, cx: number, y0: number, cz: number, w: number, h: number, d: number, yaw: number, st: FStyle, wallOverride?: number) {
    const L = this.lists[kind];
    _q.setFromAxisAngle(_up, yaw);
    _m.compose(_p.set(cx, y0, cz), _q, _s.set(w, h, d));
    L.m.push(..._m.elements);
    _c.setHex(st.color ?? 0xcccccc);
    L.c.push(_c.r, _c.g, _c.b);
    L.fp.push(...styleFP(st, w, h, d));
    L.fs.push(...styleFS(st));
    L.fe.push(...styleFE(st, wallOverride));
    L.n++;
  }
  box(cx: number, y0: number, cz: number, w: number, h: number, d: number, yaw: number, st: FStyle = {}) {
    this.add('box', cx, y0, cz, w, h, d, yaw, st);
  }
  gable(cx: number, y0: number, cz: number, w: number, h: number, d: number, yaw: number, st: FStyle = {}) {
    this.add('gable', cx, y0, cz, w, h, d, yaw, st, st.wall && st.wall >= 4 ? st.wall : 4);
  }
  hip(cx: number, y0: number, cz: number, w: number, h: number, d: number, yaw: number, st: FStyle = {}) {
    this.add('hip', cx, y0, cz, w, h, d, yaw, st, st.wall && st.wall >= 4 ? st.wall : 4);
  }
  cyl(cx: number, y0: number, cz: number, r: number, h: number, st: FStyle = {}) {
    this.add('cyl', cx, y0, cz, r * 2, h, r * 2, 0, { ...st, bayW: 100 });
  }

  build(material: THREE.Material, group: THREE.Group, castShadow = true) {
    const U = unitGeoms();
    const out: THREE.InstancedMesh[] = [];
    for (const kind of Object.keys(this.lists)) {
      const L = this.lists[kind];
      if (!L.n) continue;
      const geo = U[kind].clone();
      geo.setAttribute('fParams', new THREE.InstancedBufferAttribute(new Float32Array(L.fp), 4));
      geo.setAttribute('fStyle', new THREE.InstancedBufferAttribute(new Float32Array(L.fs), 4));
      geo.setAttribute('fExtra', new THREE.InstancedBufferAttribute(new Float32Array(L.fe), 4));
      const im = new THREE.InstancedMesh(geo, material, L.n);
      im.instanceMatrix.set(new Float32Array(L.m));
      im.instanceMatrix.needsUpdate = true;
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(L.c), 3);
      im.castShadow = castShadow;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      im.computeBoundingBox();
      group.add(im);
      out.push(im);
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Ground-plane builder with UVs (streets, pavements, lots)
export class GroundBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  n = 0;

  /** horizontal quad centred at (cx,y,cz), size w (local x) by l (local z), rotated by yaw. */
  quad(cx: number, y: number, cz: number, w: number, l: number, yaw: number, u1 = 1, v1 = 1, color = 0xffffff) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    _c.setHex(color);
    const pts = [
      [-w / 2, -l / 2, 0, 0],
      [w / 2, -l / 2, u1, 0],
      [w / 2, l / 2, u1, v1],
      [-w / 2, l / 2, 0, v1],
    ];
    const b = this.n;
    for (const [x, z, u, v] of pts) {
      this.pos.push(cx + x * c + z * s, y, cz - x * s + z * c);
      this.nrm.push(0, 1, 0);
      this.uv.push(u, v);
      this.col.push(_c.r, _c.g, _c.b);
      this.n++;
    }
    this.idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }

  /** axis-aligned raised slab (top + 4 sides) with metric UVs on top */
  slab(cx: number, y0: number, cz: number, w: number, l: number, h: number, uvScale: number, color = 0xffffff) {
    this.quad(cx, y0 + h, cz, w, l, 0, w * uvScale, l * uvScale, color);
    const b = this.n;
    _c.setHex(color).multiplyScalar(0.7);
    const sides: [number, number, number, number, number, number][] = [
      [cx - w / 2, cz + l / 2, cx + w / 2, cz + l / 2, 0, 1],
      [cx + w / 2, cz - l / 2, cx - w / 2, cz - l / 2, 0, -1],
      [cx + w / 2, cz + l / 2, cx + w / 2, cz - l / 2, 1, 0],
      [cx - w / 2, cz - l / 2, cx - w / 2, cz + l / 2, -1, 0],
    ];
    void b;
    for (const [x0, z0, x1, z1, nx, nz] of sides) {
      const bb = this.n;
      for (const [x, z, y] of [[x0, z0, y0], [x1, z1, y0], [x1, z1, y0 + h], [x0, z0, y0 + h]]) {
        this.pos.push(x, y, z);
        this.nrm.push(nx, 0, nz);
        this.uv.push(0.02, 0.02);
        this.col.push(_c.r, _c.g, _c.b);
        this.n++;
      }
      this.idx.push(bb, bb + 1, bb + 2, bb, bb + 2, bb + 3);
    }
  }

  build(material: THREE.Material, receive = true) {
    if (!this.n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = receive;
    return m;
  }
}
