// Streamed forests, bushes and rocks (instanced, 2 LOD rings) + reusable tree kit.
import * as THREE from 'three';
import { colorize, merged } from './props';
import { farmland, forestDensity, height, lakeDist, riverEdgeDist, roadEdgeDist, urbanness } from './heightfield';
import { hash2, mulberry32, smoothstep } from './noise';
import { LAKE } from './config';

const CELL = 250;
const R0 = 800;
const R1 = 2500;

function disp(g: THREE.BufferGeometry, amt: number, seed: number) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453;
    const f = 1 + ((n - Math.floor(n)) - 0.5) * amt;
    p.setXYZ(i, x * f, y * f, z * f);
  }
  return g;
}
function gradient(g: THREE.BufferGeometry, lo: number[], hi: number[], y0: number, y1: number, jitter = 0.08, seed = 1) {
  const p = g.attributes.position;
  const a = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0)));
    const n = Math.sin(p.getX(i) * 91.7 + p.getZ(i) * 31.3 + seed) * 4375.5;
    const j = 1 + ((n - Math.floor(n)) - 0.5) * jitter * 2;
    a[i * 3] = (lo[0] + (hi[0] - lo[0]) * t) * j;
    a[i * 3 + 1] = (lo[1] + (hi[1] - lo[1]) * t) * j;
    a[i * 3 + 2] = (lo[2] + (hi[2] - lo[2]) * t) * j;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

export interface TreeKit {
  spruce: THREE.BufferGeometry[];
  broad: THREE.BufferGeometry[];
  bush: THREE.BufferGeometry;
  rock: THREE.BufferGeometry;
  mat: THREE.MeshStandardMaterial;
}
let kit: TreeKit | null = null;

export function getTreeKit(): TreeKit {
  if (kit) return kit;
  const trunkCol = 0x3d2c1f;
  // ---------- spruce
  const spruce = (tiers: number, seg: number) => {
    const parts: THREE.BufferGeometry[] = [colorize(new THREE.CylinderGeometry(0.16, 0.3, 4.2, 6).translate(0, 2.1, 0), trunkCol)];
    for (let t = 0; t < tiers; t++) {
      const f = t / tiers;
      const r = 3.1 * (1 - f * 0.82) + 0.4;
      const h = 4.2 - f * 1.2;
      const c = new THREE.ConeGeometry(r, h, seg, 1, true).translate(0, 2.4 + f * 11.5 + h / 2, 0);
      c.rotateY(t * 1.9);
      disp(c, 0.22, t * 3.1);
      gradient(c, [0.05, 0.14, 0.07], [0.13, 0.27, 0.12], 2.4 + f * 11.5, 2.4 + f * 11.5 + h, 0.12, t);
      parts.push(c);
    }
    return merged(parts);
  };
  const broad = (blobs: number, detail: number) => {
    const parts: THREE.BufferGeometry[] = [colorize(new THREE.CylinderGeometry(0.28, 0.5, 6.2, 6).translate(0, 3.1, 0), 0x4a3b2c)];
    const offs = [
      [0, 8.2, 0, 3.6],
      [-2.2, 7, 0.8, 2.7],
      [2.1, 7.2, -0.7, 2.8],
      [0.6, 6.6, 2.3, 2.5],
      [-0.5, 10.2, -0.4, 2.3],
    ];
    for (let b = 0; b < blobs; b++) {
      const o = offs[b];
      const g = new THREE.IcosahedronGeometry(o[3], detail);
      disp(g, 0.34, b * 7.3);
      g.translate(o[0], o[1], o[2]);
      gradient(g, [0.08, 0.16, 0.05], [0.26, 0.42, 0.11], o[1] - o[3], o[1] + o[3], 0.14, b);
      parts.push(g);
    }
    return merged(parts);
  };
  const bush = merged([
    gradient(disp(new THREE.IcosahedronGeometry(1, 1), 0.4, 3).scale(1.4, 0.85, 1.4).translate(0, 0.7, 0), [0.07, 0.15, 0.05], [0.2, 0.33, 0.1], 0, 1.6, 0.15, 5),
  ]);
  const rock = merged([gradient(disp(new THREE.IcosahedronGeometry(1, 1), 0.7, 9).scale(1.3, 0.75, 1).translate(0, 0.35, 0), [0.28, 0.27, 0.25], [0.55, 0.53, 0.5], 0, 1, 0.12, 2)]);
  kit = {
    spruce: [spruce(7, 8), spruce(3, 6)],
    broad: [broad(5, 1), broad(2, 0)],
    bush,
    rock,
    mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }),
  };
  return kit;
}

interface Inst {
  x: number;
  y: number;
  z: number;
  r: number;
  s: number;
  sy: number;
  c: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _sc = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _col = new THREE.Color();

export function instancedFrom(geo: THREE.BufferGeometry, mat: THREE.Material, list: Inst[], cast: boolean) {
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    _q.setFromAxisAngle(_up, it.r);
    _m.compose(_p.set(it.x, it.y, it.z), _q, _sc.set(it.s, it.sy, it.s));
    im.setMatrixAt(i, _m);
    _col.setRGB(it.c, it.c * (0.96 + (i % 5) * 0.015), it.c * (0.92 + (i % 3) * 0.04));
    im.setColorAt(i, _col);
  }
  im.castShadow = cast;
  im.receiveShadow = true;
  im.computeBoundingSphere();
  return im;
}

export class VegetationSystem {
  group = new THREE.Group();
  cells = new Map<number, { lod: number; g: THREE.Group }>();
  kit = getTreeKit();
  enabled = true;
  density = 1;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  private key(ix: number, iz: number) {
    return (ix + 100) * 1000 + (iz + 100);
  }

  buildCell(ix: number, iz: number, lod: number) {
    const x0 = ix * CELL;
    const z0 = iz * CELL;
    const rnd = mulberry32((ix * 73856093) ^ (iz * 19349663) ^ 0x5bd1e995);
    const sp = (lod === 0 ? 8 : 15) / Math.sqrt(this.density);
    const nx = Math.floor(CELL / sp);
    const spruce: Inst[] = [];
    const broad: Inst[] = [];
    const bush: Inst[] = [];
    const rock: Inst[] = [];
    const sizeK = lod === 0 ? 1 : 1.3;
    for (let j = 0; j < nx; j++)
      for (let i = 0; i < nx; i++) {
        const x = x0 + (i + rnd()) * sp;
        const z = z0 + (j + rnd()) * sp;
        const r1 = rnd();
        const r2 = rnd();
        const r3 = rnd();
        const urb = urbanness(x, z);
        if (urb > 0.55) continue;
        const h = height(x, z);
        if (h < LAKE.y + 1.5 && Math.hypot(x - LAKE.x, z - LAKE.z) < 1500) continue;
        const hx = height(x + 3, z) - h;
        const hz = height(x, z + 3) - h;
        const slope = Math.hypot(hx, hz) / 3;
        const farm = farmland(x, z, h);
        const dens = forestDensity(x, z, h, slope, farm, urb);
        const re = roadEdgeDist(x, z);
        if (re < 6) continue;
        if (riverEdgeDist(x, z) < 4 || lakeDist(x, z) < 3) continue;
        const wet = riverEdgeDist(x, z) < 40;
        let place = r1 < dens * 0.95;
        if (!place && dens < 0.2 && farm < 0.3 && r1 < 0.02 + (re < 40 ? 0.02 : 0)) place = true; // lone trees
        if (farm > 0.5 && r1 < 0.01) place = true;
        if (place) {
          const conifer = h > 900 ? true : h > 420 ? r2 < 0.82 : wet ? r2 < 0.2 : r2 < 0.45;
          const alt = 1 - smoothstep(700, 1250, h) * 0.6;
          const s = (0.75 + r3 * 0.7) * alt * sizeK;
          const c = 0.78 + rnd() * 0.45;
          const it = { x, y: h - 0.4, z, r: rnd() * 6.28, s, sy: s * (0.9 + rnd() * 0.3), c };
          if (conifer) spruce.push(it);
          else broad.push(it);
        } else if (lod === 0 && dens > 0.25 && r2 < 0.2) {
          bush.push({ x, y: h - 0.1, z, r: rnd() * 6.28, s: 0.6 + r3 * 0.9, sy: 0.7 + rnd() * 0.6, c: 0.8 + rnd() * 0.4 });
        }
        if (slope > 0.45 && r3 < 0.07 * (lod === 0 ? 1 : 0.5) && re > 10) {
          const s = 0.8 + rnd() * 2.8;
          rock.push({ x, y: h - 0.2, z, r: rnd() * 6.28, s, sy: s * (0.6 + rnd() * 0.5), c: 0.8 + rnd() * 0.4 });
        } else if (h > 500 && r3 < 0.015 && re > 10) {
          const s = 0.7 + rnd() * 2;
          rock.push({ x, y: h - 0.2, z, r: rnd() * 6.28, s, sy: s * 0.7, c: 0.8 + rnd() * 0.4 });
        }
      }
    const g = new THREE.Group();
    const L = lod === 0 ? 0 : 1;
    const cast = lod === 0;
    if (spruce.length) g.add(instancedFrom(this.kit.spruce[L], this.kit.mat, spruce, cast));
    if (broad.length) g.add(instancedFrom(this.kit.broad[L], this.kit.mat, broad, cast));
    if (bush.length) g.add(instancedFrom(this.kit.bush, this.kit.mat, bush, false));
    if (rock.length) g.add(instancedFrom(this.kit.rock, this.kit.mat, rock, cast));
    this.group.add(g);
    return g;
  }

  private dispose(g: THREE.Group) {
    this.group.remove(g);
    g.traverse((o) => {
      const im = o as THREE.InstancedMesh;
      if (im.isInstancedMesh) im.dispose();
    });
  }

  setEnabled(v: boolean) {
    this.enabled = v;
    this.group.visible = v;
  }

  update(cam: THREE.Vector3, budgetMs = 5) {
    if (!this.enabled) return;
    const cx = Math.floor(cam.x / CELL);
    const cz = Math.floor(cam.z / CELL);
    const rad = Math.ceil(R1 / CELL) + 1;
    const need: { ix: number; iz: number; lod: number; d: number }[] = [];
    const alt = Math.max(0, cam.y);
    const r1 = alt > 1400 ? R1 * 0.65 : R1;
    for (let dz = -rad; dz <= rad; dz++)
      for (let dx = -rad; dx <= rad; dx++) {
        const ix = cx + dx;
        const iz = cz + dz;
        if (ix < -24 || ix >= 24 || iz < -24 || iz >= 24) continue;
        const px = (ix + 0.5) * CELL;
        const pz = (iz + 0.5) * CELL;
        const d = Math.hypot(px - cam.x, pz - cam.z);
        const k = this.key(ix, iz);
        const cur = this.cells.get(k);
        let want = d < R0 * (cur && cur.lod === 0 ? 1.1 : 1) ? 0 : d < r1 * (cur ? 1.08 : 1) ? 1 : -1;
        if (alt > 900 && want === 0) want = 1; // high above: skip detailed trees
        if (want < 0) {
          if (cur) {
            this.dispose(cur.g);
            this.cells.delete(k);
          }
          continue;
        }
        if (!cur || cur.lod !== want) need.push({ ix, iz, lod: want, d });
      }
    // drop cells that fell out of the scan window
    for (const [k, c] of this.cells) {
      const ix = Math.floor(k / 1000) - 100;
      const iz = (k % 1000) - 100;
      if (Math.abs(ix - cx) > rad || Math.abs(iz - cz) > rad) {
        this.dispose(c.g);
        this.cells.delete(k);
      }
    }
    if (!need.length) return;
    need.sort((a, b) => a.d - b.d);
    const t0 = performance.now();
    for (const n of need) {
      const k = this.key(n.ix, n.iz);
      const old = this.cells.get(k);
      if (old) this.dispose(old.g);
      const g = this.buildCell(n.ix, n.iz, n.lod);
      this.cells.set(k, { lod: n.lod, g });
      if (performance.now() - t0 > budgetMs) break;
    }
  }

  /** build everything around a point synchronously (loading) */
  async prime(cam: THREE.Vector3, progress: (p: number) => void) {
    let guard = 0;
    while (guard++ < 60) {
      const before = this.cells.size;
      this.update(cam, 60);
      progress(Math.min(1, guard / 12));
      await new Promise((r) => setTimeout(r, 0));
      if (this.cells.size === before && guard > 3) break;
    }
  }
}

void hash2;
