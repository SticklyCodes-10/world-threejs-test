// Chunked, LOD-streamed terrain with a splat-style procedural shader.
import * as THREE from 'three';
import { HALF, SITES } from './config';
import { farmland, forestDensity, height, lakeDist, riverEdgeDist, roadEdgeDist, urbanness } from './heightfield';
import { fbm, lerp, noise2, smoothstep } from './noise';
import { terrainDetailTex } from './textures';

export const CHUNK = 500;
const NC = (HALF * 2) / CHUNK;
const LOD_SEG = [64, 40, 24, 16];
const LOD_DIST = [650, 1500, 3200];

const GRASS_A = new THREE.Color(0.17, 0.28, 0.085);
const GRASS_B = new THREE.Color(0.27, 0.34, 0.12);
const FOREST = new THREE.Color(0.055, 0.1, 0.04);
const ALPINE = new THREE.Color(0.24, 0.27, 0.14);
const ROCK_A = new THREE.Color(0.2, 0.185, 0.17);
const ROCK_B = new THREE.Color(0.32, 0.29, 0.25);
const SNOW = new THREE.Color(0.9, 0.92, 0.95);
const URBAN = new THREE.Color(0.16, 0.165, 0.155);
const FARM = new THREE.Color(0.4, 0.4, 0.2);
const BED = new THREE.Color(0.38, 0.35, 0.29);
const SHOULDER = new THREE.Color(0.33, 0.3, 0.26);
const CITYSITE = () => SITES[0];
function cityBlend(x: number, z: number) {
  const c = CITYSITE();
  return 1 - smoothstep(1800, 2300, Math.hypot(x - c.x, z - c.z));
}
const _c = new THREE.Color();
const _t = new THREE.Color();

export const terrainUniforms = {
  uDetail: { value: null as THREE.Texture | null },
};

function createTerrainMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    terrainUniforms.uDetail.value = terrainDetailTex();
    shader.uniforms.uDetail = terrainUniforms.uDetail;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aInfo;\nvarying vec2 vInfo;\nvarying vec3 vTWP;\nvarying vec3 vTN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInfo = aInfo; vTWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vTN = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D uDetail;
varying vec2 vInfo; varying vec3 vTWP; varying vec3 vTN;
float th12(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec3 wn = normalize(vTN);
  float slope = 1.0 - wn.y;
  float dC = distance(cameraPosition, vTWP);
  float nearW = 1.0 - smoothstep(80.0, 600.0, dC);
  vec4 d1 = texture2D(uDetail, vTWP.xz * 0.31);
  vec4 d2 = texture2D(uDetail, vTWP.xz * 0.043 + 0.3);
  vec4 d3 = texture2D(uDetail, vTWP.xz * 0.0057 + 0.7);
  // steep faces: project rock detail on the other axes to avoid stretching
  vec4 rx = texture2D(uDetail, vTWP.zy * 0.11);
  vec4 ry = texture2D(uDetail, vTWP.xy * 0.11 + 0.5);
  float rk = mix(ry.g, rx.g, smoothstep(0.3, 0.7, abs(wn.x)));
  float rockW = smoothstep(0.12, 0.34, slope);
  float grassDet = mix(0.5, d1.r * 0.55 + d2.r * 0.45, 0.35 + 0.65 * nearW);
  float rockDet = mix(0.5, rk * 0.6 + d2.g * 0.4, 0.4 + 0.6 * nearW);
  float det = mix(grassDet, rockDet, rockW);
  float macro = 0.82 + 0.36 * d3.r;
  diffuseColor.rgb *= (0.55 + 0.95 * det) * macro;
  if (vInfo.x > 0.01) {
    vec2 q = vTWP.xz;
    vec2 cell = floor(q / vec2(170.0, 120.0) + vec2(0.0, 0.0));
    float h1 = th12(cell);
    float h2 = th12(cell + 7.0);
    float ang = h2 * 3.14159;
    float stripe = 0.5 + 0.5 * sin((q.x * cos(ang) + q.y * sin(ang)) * 2.1);
    vec3 fc;
    if (h1 < 0.2) fc = vec3(0.28, 0.4, 0.13);
    else if (h1 < 0.4) fc = vec3(0.6, 0.53, 0.24);
    else if (h1 < 0.55) fc = vec3(0.32, 0.24, 0.16);
    else if (h1 < 0.8) fc = vec3(0.38, 0.48, 0.2);
    else fc = vec3(0.17, 0.29, 0.11);
    fc *= (0.86 + 0.14 * mix(1.0, stripe, nearW * 0.8 + 0.2)) * (0.8 + 0.4 * d2.r);
    vec2 fe = abs(fract(q / vec2(170.0, 120.0)) - 0.5) * vec2(170.0, 120.0);
    float hedge = 1.0 - smoothstep(0.0, 3.0, min(85.0 - fe.x, 60.0 - fe.y));
    fc = mix(fc, vec3(0.09, 0.15, 0.06), hedge * 0.9);
    diffuseColor.rgb = mix(diffuseColor.rgb, fc, vInfo.x);
  }
}`
      );
  };
  return mat;
}

interface Chunk {
  cx: number;
  cz: number;
  lod: number;
  mesh: THREE.Mesh | null;
}

export class TerrainSystem {
  group = new THREE.Group();
  material = createTerrainMaterial();
  chunks: Chunk[] = [];
  queue: Chunk[] = [];
  private tmp = new Float32Array(0);

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    for (let j = 0; j < NC; j++)
      for (let i = 0; i < NC; i++) this.chunks.push({ cx: -HALF + (i + 0.5) * CHUNK, cz: -HALF + (j + 0.5) * CHUNK, lod: -1, mesh: null });
  }

  lodFor(d: number, cur: number) {
    // hysteresis
    const k = cur >= 0 ? 1 : 0;
    let l = 3;
    for (let i = 0; i < 3; i++) {
      const th = LOD_DIST[i] * (cur >= 0 && cur <= i ? 1.12 : 1) ;
      if (d < th) {
        l = i;
        break;
      }
    }
    void k;
    return l;
  }

  build(ch: Chunk, lod: number) {
    const seg = LOD_SEG[lod];
    const step = CHUNK / seg;
    const x0 = ch.cx - CHUNK / 2;
    const z0 = ch.cz - CHUNK / 2;
    const n = seg + 3; // 1 sample border for normals
    if (this.tmp.length < n * n) this.tmp = new Float32Array(n * n);
    const H = this.tmp;
    const widen = lod === 0 ? 3 : lod === 1 ? 6 : lod === 2 ? 11 : 17;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) H[j * n + i] = height(x0 + (i - 1) * step, z0 + (j - 1) * step, widen);

    const vs = seg + 1;
    const skirt = 14 + lod * 10;
    const nv = vs * vs + 4 * vs;
    const pos = new Float32Array(nv * 3);
    const nor = new Float32Array(nv * 3);
    const col = new Float32Array(nv * 3);
    const info = new Float32Array(nv * 2);
    const set = (vi: number, x: number, y: number, z: number, nx: number, ny: number, nz: number, c: THREE.Color, f: number, u: number) => {
      pos[vi * 3] = x;
      pos[vi * 3 + 1] = y;
      pos[vi * 3 + 2] = z;
      nor[vi * 3] = nx;
      nor[vi * 3 + 1] = ny;
      nor[vi * 3 + 2] = nz;
      col[vi * 3] = c.r;
      col[vi * 3 + 1] = c.g;
      col[vi * 3 + 2] = c.b;
      info[vi * 2] = f;
      info[vi * 2 + 1] = u;
    };
    const idxArr: number[] = [];
    for (let j = 0; j < vs; j++)
      for (let i = 0; i < vs; i++) {
        const k = (j + 1) * n + (i + 1);
        const h = H[k];
        const dx = (H[k + 1] - H[k - 1]) / (2 * step);
        const dz = (H[k + n] - H[k - n]) / (2 * step);
        const il = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
        const x = x0 + i * step;
        const z = z0 + j * step;
        const slope = Math.sqrt(dx * dx + dz * dz);
        const farm = farmland(x, z, h) * (1 - smoothstep(0.08, 0.2, slope));
        const urb = urbanness(x, z);
        this.colorAt(x, z, h, slope, farm, urb, lod);
        set(j * vs + i, x, h, z, -dx * il, il, -dz * il, _c, farm, urb);
      }
    for (let j = 0; j < seg; j++)
      for (let i = 0; i < seg; i++) {
        const a = j * vs + i;
        idxArr.push(a, a + vs, a + 1, a + 1, a + vs, a + vs + 1);
      }
    // skirts
    let vi = vs * vs;
    const edge = (getIdx: (t: number) => number, flip: boolean) => {
      const base = vi;
      for (let t = 0; t < vs; t++) {
        const s = getIdx(t);
        set(vi++, pos[s * 3], pos[s * 3 + 1] - skirt, pos[s * 3 + 2], nor[s * 3], nor[s * 3 + 1], nor[s * 3 + 2], _c.setRGB(col[s * 3], col[s * 3 + 1], col[s * 3 + 2]), info[s * 2], info[s * 2 + 1]);
      }
      for (let t = 0; t < seg; t++) {
        const a = getIdx(t);
        const b = getIdx(t + 1);
        const c2 = base + t;
        const d2 = base + t + 1;
        if (flip) idxArr.push(a, b, c2, b, d2, c2);
        else idxArr.push(a, c2, b, b, c2, d2);
      }
    };
    edge((t) => t, true); // z = z0
    edge((t) => seg * vs + t, false);
    edge((t) => t * vs, false);
    edge((t) => t * vs + seg, true);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aInfo', new THREE.BufferAttribute(info, 2));
    g.setIndex(new THREE.Uint16BufferAttribute(idxArr, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();

    if (ch.mesh) {
      ch.mesh.geometry.dispose();
      ch.mesh.geometry = g;
    } else {
      const m = new THREE.Mesh(g, this.material);
      m.receiveShadow = true;
      m.castShadow = true;
      this.group.add(m);
      ch.mesh = m;
    }
    ch.lod = lod;
  }

  private colorAt(x: number, z: number, h: number, slope: number, farm: number, urb: number, lod: number) {
    const n1 = 0.5 + 0.5 * fbm(x * 0.0023 + 3, z * 0.0023, 3);
    const n2 = noise2(x * 0.017, z * 0.017);
    _c.copy(GRASS_A).lerp(GRASS_B, n1);
    // meadows in valley, alpine meadow above
    const alp = smoothstep(750, 1150, h);
    _c.lerp(ALPINE, alp);
    const fd = forestDensity(x, z, h, slope, farm, urb);
    _c.lerp(FOREST, smoothstep(0.15, 0.7, fd) * 0.92);
    // rock
    const rock = Math.max(smoothstep(0.8, 1.35, slope), smoothstep(1150, 1700, h + 120 * n2) * 0.6);
    if (rock > 0) {
      _t.copy(ROCK_A).lerp(ROCK_B, 0.5 + 0.5 * n2);
      _c.lerp(_t, Math.min(1, rock));
    }
    const snow = smoothstep(1380, 1560, h + 110 * n1) * (1 - smoothstep(1.0, 1.7, slope) * 0.75);
    if (snow > 0) _c.lerp(SNOW, snow);
    if (farm > 0.01) _c.lerp(FARM, farm);
    const cu = cityBlend(x, z);
    if (cu > 0.01) _c.lerp(URBAN, cu * 0.9);
    // beds & shoulders
    const rd = riverEdgeDist(x, z);
    if (rd < 10) _c.lerp(BED, 1 - smoothstep(-2, 10, rd));
    const ld = lakeDist(x, z);
    if (ld < 14) _c.lerp(BED, (1 - smoothstep(-6, 14, ld)) * 0.9);
    const re = roadEdgeDist(x, z);
    if (re < 6 + lod * 3) _c.lerp(SHOULDER, (1 - smoothstep(0, 6 + lod * 3, re)) * 0.8);
    void lerp;
  }

  /** build every chunk at coarse LOD (used during loading); calls progress */
  async buildAll(cam: THREE.Vector3, progress: (p: number) => void) {
    const order = this.chunks.slice().sort((a, b) => Math.hypot(a.cx - cam.x, a.cz - cam.z) - Math.hypot(b.cx - cam.x, b.cz - cam.z));
    let t0 = performance.now();
    for (let i = 0; i < order.length; i++) {
      const ch = order[i];
      const d = Math.hypot(ch.cx - cam.x, ch.cz - cam.z);
      this.build(ch, Math.min(this.lodFor(d, -1), d < 2200 ? 1 : 3));
      if (performance.now() - t0 > 40) {
        progress(i / order.length);
        await new Promise((r) => setTimeout(r, 0));
        t0 = performance.now();
      }
    }
  }

  update(cam: THREE.Vector3, budgetMs = 8) {
    const need: { ch: Chunk; lod: number; d: number }[] = [];
    for (const ch of this.chunks) {
      const d = Math.max(0, Math.hypot(ch.cx - cam.x, ch.cz - cam.z) - CHUNK * 0.5);
      const lod = this.lodFor(d, ch.lod);
      if (lod !== ch.lod) need.push({ ch, lod, d });
    }
    if (!need.length) return;
    need.sort((a, b) => a.d - b.d);
    const t0 = performance.now();
    for (const nd of need) {
      this.build(nd.ch, nd.lod);
      if (performance.now() - t0 > budgetMs) break;
    }
  }
}
