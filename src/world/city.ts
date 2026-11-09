// Procedural city: street grid, districts, buildings, public infrastructure, villages, traffic.
import * as THREE from 'three';
import { CITY, SITES, VILLAGES } from './config';
import { CarField, LampField, randomCarColor } from './props';
import { FacadeInstances, GroundBuilder, createFacadeMaterial, type FStyle } from './facade';
import { mulberry32 } from './noise';
import { grassTex, intersectionTex, lotTex, pavementTex, roadTex } from './textures';
import { getTreeKit, instancedFrom } from './vegetation';

export interface Collider {
  x: number;
  z: number;
  hx: number;
  hz: number;
  c: number;
  s: number;
  h: number;
}
export interface BlockInfo {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  zone: string;
}

interface TreeInst {
  x: number;
  y: number;
  z: number;
  r: number;
  s: number;
  sy: number;
  c: number;
}

const PAL = {
  glass: [0x5f7480, 0x4d6270, 0x6d7d85, 0x3f5560, 0x70808a, 0x55707a],
  conc: [0xb9b4a8, 0xa8a8a3, 0xc4bcae, 0x9c9a95, 0xbdb7aa],
  stone: [0xd8cfba, 0xc9bfa6, 0xbcb09a, 0xd2c8b0],
  brick: [0x8b4a3a, 0x7a3f33, 0x94533f, 0x6e4a3d, 0x80503f],
  render: [0xe8dfcf, 0xd9d2c3, 0xbfc7cf, 0xc9d3bf, 0xe5cfc0, 0xd4c4a8, 0x9db3c4, 0xf0ebe0, 0xc8b79c],
  roof: [0x4a4540, 0x5a3a30, 0x3a3d42, 0x6b4a3a, 0x2f3236, 0x54504b],
  metal: [0xb9bcbf, 0x8fa0ab, 0xc9c2ad, 0x9aa59a, 0xb8a98a, 0xa8aeb3],
  hvac: [0x8a8d90, 0x777b7f, 0x9a9ea0, 0x6c7074],
};
const pick = <T,>(a: T[], r: number) => a[Math.floor(r * a.length) % a.length];

interface Ctx {
  Y: number;
  fac: (x: number, z: number) => FacadeInstances;
  gb: (kind: string, x: number, z: number) => GroundBuilder;
  cars: CarField;
  trees: TreeInst[];
  colliders: Collider[];
  lamps: LampField;
  blocks: BlockInfo[];
}
interface Block {
  i: number;
  j: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  cx: number;
  cz: number;
  r: number;
}

export class CitySystem {
  group = new THREE.Group();
  lamps = new LampField();
  cars = new CarField();
  trees: TreeInst[] = [];
  colliders: Collider[] = [];
  blocks: BlockInfo[] = [];
  facs = new Map<string, FacadeInstances>();
  gbs = new Map<string, GroundBuilder>();
  matI = createFacadeMaterial(false);
  groundMats: Record<string, THREE.MeshStandardMaterial> = {};
  traffic: { x: number; z: number; v: number; axis: number; lane: number; dir: number; fixed: number; mesh: number }[] = [];
  trafficMesh: THREE.InstancedMesh | null = null;
  Y = 0;

  constructor(scene: THREE.Scene) {
    const mk = (map: THREE.Texture | null, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
      new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, ...opts });
    this.groundMats = {
      pave: mk(pavementTex()),
      street: mk(roadTex('street')),
      streetAve: mk(roadTex('streetAve')),
      inter: mk(intersectionTex()),
      lawn: mk(grassTex(0), { roughness: 1 }),
      lot: mk(lotTex(0)),
      gravel: mk(pavementTex(), { roughness: 1 }),
      water: mk(null, { roughness: 0.06, metalness: 0.2, polygonOffsetFactor: -5 }),
      plaza: mk(pavementTex()),
    };
    this.Y = SITES.find((s) => s.name === 'city')!.y;
    this.generateCity();
    for (const v of VILLAGES) this.generateVillage(v);
    this.finish(scene);
  }

  // ------------------------------------------------------------------ infrastructure
  private cellKey(x: number, z: number) {
    return Math.floor((x + 3000) / 900) + ',' + Math.floor((z + 3000) / 900);
  }
  private ctx(Y: number): Ctx {
    return {
      Y,
      fac: (x, z) => {
        const k = this.cellKey(x, z);
        let f = this.facs.get(k);
        if (!f) this.facs.set(k, (f = new FacadeInstances()));
        return f;
      },
      gb: (kind, x, z) => {
        const k = kind + '|' + this.cellKey(x, z);
        let g = this.gbs.get(k);
        if (!g) this.gbs.set(k, (g = new GroundBuilder()));
        return g;
      },
      cars: this.cars,
      trees: this.trees,
      colliders: this.colliders,
      lamps: this.lamps,
      blocks: this.blocks,
    };
  }

  private layoutGrid(
    c: Ctx,
    o: { ox: number; oz: number; S: number; k0: number; k1: number; wOf: (k: number) => number; inside: (x: number, z: number) => boolean; zoneOf: (b: Block, rnd: () => number) => string; seedBase: number; villageStyle?: boolean }
  ) {
    const { ox, oz, S, k0, k1, wOf, inside } = o;
    const Y = c.Y;
    const px = (k: number) => ox + k * S;
    const pz = (k: number) => oz + k * S;
    // streets + intersections
    for (let a = k0; a <= k1; a++) {
      const wa = wOf(a);
      const kind = (wa > 20 ? 'streetAve' : 'street') as string;
      for (let b = k0; b < k1; b++) {
        const wb0 = wOf(b), wb1 = wOf(b + 1);
        // vertical street (along z) at x = px(a)
        const zc = (pz(b) + wb0 / 2 + pz(b + 1) - wb1 / 2) / 2;
        const zl = pz(b + 1) - wb1 / 2 - (pz(b) + wb0 / 2);
        if (inside(px(a), zc)) c.gb(kind, px(a), zc).quad(px(a), Y + 0.12, zc, wa, zl, 0, 1, zl / 12);
        // horizontal street (along x) at z = pz(a)
        const xc = (px(b) + wb0 / 2 + px(b + 1) - wb1 / 2) / 2;
        if (inside(xc, pz(a))) c.gb(kind, xc, pz(a)).quad(xc, Y + 0.12, pz(a), wa, zl, Math.PI / 2, 1, zl / 12);
      }
      for (let b = k0; b <= k1; b++) {
        if (!inside(px(a), pz(b))) continue;
        c.gb('inter', px(a), pz(b)).quad(px(a), Y + 0.14, pz(b), wa, wOf(b), 0, 1, 1);
      }
    }
    // blocks
    for (let i = k0; i < k1; i++)
      for (let j = k0; j < k1; j++) {
        const B: Block = { i, j, x0: px(i) + wOf(i) / 2, x1: px(i + 1) - wOf(i + 1) / 2, z0: pz(j) + wOf(j) / 2, z1: pz(j + 1) - wOf(j + 1) / 2, cx: 0, cz: 0, r: 0 };
        B.cx = (B.x0 + B.x1) / 2;
        B.cz = (B.z0 + B.z1) / 2;
        B.r = Math.hypot(B.cx, B.cz);
        if (!inside(B.cx, B.cz)) continue;
        const rnd = mulberry32((i + 200) * 7919 + (j + 200) * 104729 + o.seedBase);
        const zone = o.zoneOf(B, rnd);
        c.blocks.push({ x0: B.x0, x1: B.x1, z0: B.z0, z1: B.z1, zone });
        // pavement slab for every block
        c.gb('pave', B.cx, B.cz).slab(B.cx, Y, B.cz, B.x1 - B.x0, B.z1 - B.z0, 0.18, 0.25, zone === 'rail' || zone === 'yard' ? 0x5c5a55 : 0xffffff);
        const L = { x0: B.x0 + 3.6, x1: B.x1 - 3.6, z0: B.z0 + 3.6, z1: B.z1 - 3.6 };
        this.buildBlock(c, B, L, zone, rnd);
        // lamps on block edges
        if (zone !== 'rail' && zone !== 'yard' && !(zone === 'park' && rnd() < 0.3)) {
          const y = Y + 0.18;
          const spacing = zone === 'houses' ? 55 : 42;
          for (let t = spacing / 2; t < B.x1 - B.x0; t += spacing) {
            c.lamps.add(B.x0 + t, y, B.z0 + 1.6, Math.PI / 2); // arm toward -z
            if (zone !== 'houses') c.lamps.add(B.x0 + t + spacing / 2, y, B.z1 - 1.6, -Math.PI / 2); // arm toward +z
          }
        }
      }
  }

  // ------------------------------------------------------------------ city layout
  private generateCity() {
    const c = this.ctx(this.Y);
    const S = CITY.S;
    const special: Record<string, string> = {
      '-1,-7': 'gov', '0,-7': 'gov', '-8,2': 'hospital', '3,-8': 'police', '-7,-4': 'fire', '7,3': 'fire',
      '-12,-2': 'school', '-13,5': 'school', '10,-9': 'school', '-5,11': 'school', '-1,6': 'station', '0,6': 'station',
      '1,7': 'bus', '-4,-2': 'parking', '3,2': 'parking', '-9,-7': 'park', '5,-6': 'park', '-11,9': 'park', '12,-3': 'park',
      '-2,-1': 'plaza', '1,0': 'plaza',
    };
    this.layoutGrid(c, {
      ox: 0, oz: 0, S, k0: -18, k1: 18, seedBase: 11,
      wOf: (k) => (k === 0 ? 30 : k % 4 === 0 ? 26 : 15),
      inside: (x, z) => Math.hypot(x, z) < CITY.radius - 20,
      zoneOf: (B, rnd) => {
        const sp = special[B.i + ',' + B.j];
        if (sp) return sp;
        const r = B.r;
        const q = rnd();
        if (B.j === 6) return 'rail';
        if (B.j === 7 && B.cx >= 1100 && B.cx <= 1990) return 'yard';
        if (Math.max(Math.abs(B.cx), Math.abs(B.cz)) <= 560) return q < 0.1 ? 'plaza' : 'tower';
        if (B.cx > 900 && B.cz > -800 && B.cz < 1800) return q < 0.08 ? 'yard' : 'industrial';
        if (r < 1050) return q < 0.3 ? 'office' : q < 0.36 ? 'mall' : q < 0.55 ? 'retail' : q < 0.65 ? 'hotel' : q < 0.71 ? 'gas' : q < 0.8 ? 'parking' : q < 0.95 ? 'apartments' : 'park';
        if (r < 1450) return q < 0.5 ? 'apartments' : q < 0.62 ? 'retail' : q < 0.7 ? 'park' : q < 0.78 ? 'office' : 'houses';
        return q < 0.92 ? 'houses' : q < 0.97 ? 'park' : 'retail';
      },
    });
    this.makeTraffic();
  }

  private generateVillage(v: (typeof VILLAGES)[number]) {
    const site = SITES.find((s) => s.name === v.id)!;
    const c = this.ctx(site.y);
    this.layoutGrid(c, {
      ox: v.x, oz: v.z, S: 90, k0: -2, k1: 2, seedBase: v.x * 3 + 17,
      wOf: () => 9,
      inside: () => true,
      villageStyle: true,
      zoneOf: (B, rnd) => {
        if (B.i === 0 && B.j === 0) return 'church';
        if (B.i === -1 && B.j === 0) return 'park';
        if (Math.abs(B.i) + Math.abs(B.j) === 1 && rnd() < 0.5) return 'retail';
        return 'houses';
      },
    });
    // farmsteads on the village plateau
    const r = mulberry32(v.x + 5);
    for (let k = 0; k < 3; k++) {
      const a = r() * Math.PI * 2;
      const d = 215 + r() * 25;
      this.farmstead(c, v.x + Math.cos(a) * d, v.z + Math.sin(a) * d, a + Math.PI / 2, r);
    }
  }

  private farmstead(c: Ctx, x: number, z: number, yaw: number, r: () => number) {
    const f = c.fac(x, z);
    const Y = c.Y + 0.1;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const W = (lx: number, lz: number) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];
    const [bx, bz] = W(0, 0);
    f.box(bx, Y, bz, 24, 7, 14, yaw, { color: 0x8c3b2e, wall: 5, winW: 0, bayW: 100, floorH: 7 });
    f.gable(bx, Y + 7, bz, 25, 5, 15, yaw, { color: 0x77797b, wall: 5 });
    c.colliders.push({ x: bx, z: bz, hx: 12, hz: 7, c: cs, s: sn, h: 12 });
    for (let k = 0; k < 2; k++) {
      const [sx, sz] = W(18 + k * 8, -3);
      f.cyl(sx, Y, sz, 3.4, 13, { color: 0xb7bcbf, wall: 5, winW: 0 });
      f.cyl(sx, Y + 13, sz, 3.0, 1.6, { color: 0x8e9396, wall: 5, winW: 0 });
      c.colliders.push({ x: sx, z: sz, hx: 3.4, hz: 3.4, c: 1, s: 0, h: 14 });
    }
    const [hx, hz] = W(-28, 12);
    this.house(c, hx, hz, yaw, r);
    const [sx, sz] = W(-8, 22);
    f.box(sx, Y, sz, 12, 4, 7, yaw, { color: 0xb9b2a0, wall: 5, winW: 0 });
    f.gable(sx, Y + 4, sz, 12.6, 2, 7.6, yaw, { color: 0x777a7c, wall: 5 });
  }

  // ------------------------------------------------------------------ block builders
  private col(c: Ctx, x: number, z: number, w: number, d: number, yaw: number, h: number) {
    c.colliders.push({ x, z, hx: w / 2, hz: d / 2, c: Math.cos(yaw), s: Math.sin(yaw), h });
  }

  private roofClutter(c: Ctx, cx: number, cz: number, w: number, d: number, yTop: number, rnd: () => number, n: number, yaw = 0) {
    const f = c.fac(cx, cz);
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    for (let k = 0; k < n; k++) {
      const bw = 1.5 + rnd() * 4, bd = 1.5 + rnd() * 3, bh = 1 + rnd() * 2.4;
      const lx = (rnd() - 0.5) * Math.max(0, w - bw - 3);
      const lz = (rnd() - 0.5) * Math.max(0, d - bd - 3);
      f.box(cx + lx * cs + lz * sn, yTop, cz - lx * sn + lz * cs, bw, bh, bd, yaw, { color: pick(PAL.hvac, rnd()), wall: 5, winW: 0, bayW: 100, floorH: 20 });
      if (rnd() < 0.25) f.cyl(cx + lx * cs + lz * sn + 2, yTop, cz - lx * sn + lz * cs + 2, 0.9 + rnd(), 2.5, { color: 0xa9adb0, wall: 5, winW: 0 });
    }
  }

  private lotCars(c: Ctx, x0: number, x1: number, z0: number, z1: number, rnd: () => number, fill: number) {
    const y = c.Y + 0.25;
    for (let z = z0 + 4; z < z1 - 4; z += 5.5 * 2 + 7) {
      for (const dz of [0, 5.4]) {
        for (let x = x0 + 3; x < x1 - 3; x += 2.6) {
          if (rnd() < fill) c.cars.add(x, y, z + dz, Math.PI / 2 + (rnd() < 0.5 ? 0 : Math.PI), randomCarColor(rnd()));
        }
      }
    }
  }

  private streetCars(c: Ctx, B: Block, rnd: () => number, p: number) {
    const y = c.Y + 0.18;
    for (let x = B.x0 + 8; x < B.x1 - 8; x += 7 + rnd() * 4) {
      if (rnd() < p) c.cars.add(x, y, B.z0 - 1.9, 0, randomCarColor(rnd()));
      if (rnd() < p) c.cars.add(x, y, B.z1 + 1.9, Math.PI, randomCarColor(rnd()));
    }
  }

  private tree(c: Ctx, x: number, z: number, rnd: () => number, s = 0.7) {
    c.trees.push({ x, y: c.Y + 0.2, z, r: rnd() * 6.28, s: s * (0.8 + rnd() * 0.5), sy: s * (0.9 + rnd() * 0.3), c: 0.8 + rnd() * 0.4 });
  }

  private house(c: Ctx, cx: number, cz: number, yaw: number, rnd: () => number): number[] | null {
    let gar: number[] | null = null;
    const f = c.fac(cx, cz);
    const Y = c.Y + 0.2;
    const w = 10 + rnd() * 5, d = 8 + rnd() * 3.5;
    const floors = rnd() < 0.4 ? 2 : 1;
    const h = floors * 2.9 + 0.3;
    const wall = rnd() < 0.2 ? 1 : 0;
    const col = wall ? pick(PAL.brick, rnd()) : pick(PAL.render, rnd());
    const st: FStyle = { color: col, wall, bayW: 3.2, floorH: 2.9, winW: 0.48, winH: 0.52, glass: 0 };
    f.box(cx, Y, cz, w, h, d, yaw, st);
    const rc = pick(PAL.roof, rnd());
    const ridgeAlongX = rnd() < 0.6;
    const rh = 2.0 + rnd() * 1.6;
    if (ridgeAlongX) f.gable(cx, Y + h, cz, w + 0.9, rh, d + 0.9, yaw, { color: rc, wall: 4 });
    else f.gable(cx, Y + h, cz, d + 0.9, rh, w + 0.9, yaw + Math.PI / 2, { color: rc, wall: 4 });
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const W = (lx: number, lz: number) => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs];
    // attached garage
    if (rnd() < 0.7) {
      const side = rnd() < 0.5 ? 1 : -1;
      const [gx, gz] = W(side * (w / 2 + 1.9), d * 0.1);
      f.box(gx, Y, gz, 3.8, 2.9, d * 0.8, yaw, { color: col, wall, winW: 0, bayW: 100, floorH: 3 });
      f.gable(gx, Y + 2.9, gz, 4.4, 1.4, d * 0.8 + 0.6, yaw + Math.PI / 2, { color: rc, wall: 4 });
      const [dx, dz] = W(side * (w / 2 + 1.9), d * 0.1 + d * 0.4 + 0.03);
      f.box(dx, Y, dz, 3.0, 2.2, 0.08, yaw, { color: 0xdcd8cc, wall: 2, winW: 0 });
      this.col(c, gx, gz, 3.8, d * 0.8, yaw, 3.5);
      gar = [gx, gz];
    }
    // chimney
    if (rnd() < 0.55) {
      const [qx, qz] = W(w * 0.3, 0);
      f.box(qx, Y + h, qz, 0.8, rh + 1.2, 0.8, yaw, { color: 0x8b4a3a, wall: 1, winW: 0 });
    }
    // porch
    const [px, pz] = W((rnd() - 0.5) * w * 0.5, d / 2 + 0.9);
    f.box(px, Y, pz, 3.4, 0.35, 1.9, yaw, { color: 0xcfcac0, wall: 2, winW: 0 });
    this.col(c, cx, cz, w, d, yaw, h + rh);
    return gar;
  }

  private buildBlock(c: Ctx, B: Block, L: { x0: number; x1: number; z0: number; z1: number }, zone: string, rnd: () => number) {
    const Y = c.Y;
    const lw = L.x1 - L.x0, ld = L.z1 - L.z0;
    const cx = B.cx, cz = B.cz;
    const base = Y + 0.2;
    const lawn = () => c.gb('lawn', cx, cz).quad(cx, Y + 0.2, cz, lw, ld, 0, lw / 6, ld / 6, 0xffffff);
    const lot = (x0: number, x1: number, z0: number, z1: number) => c.gb('lot', cx, cz).quad((x0 + x1) / 2, Y + 0.2, (z0 + z1) / 2, x1 - x0, z1 - z0, 0, (x1 - x0) / 10.4, (z1 - z0) / 10.4);
    const plaza = (col = 0xffffff) => c.gb('plaza', cx, cz).quad(cx, Y + 0.2, cz, lw, ld, 0, lw / 4, ld / 4, col);
    const f = c.fac(cx, cz);

    switch (zone) {
      case 'tower':
      case 'plaza': {
        plaza(zone === 'plaza' ? 0xd8d4c8 : 0xcfcbc0);
        if (zone === 'plaza') {
          for (let k = 0; k < 14; k++) this.tree(c, L.x0 + 6 + rnd() * (lw - 12), L.z0 + 6 + rnd() * (ld - 12), rnd, 0.6);
          const wg = c.gb('water', cx, cz);
          wg.quad(cx, Y + 0.24, cz, 16, 16, 0, 1, 1, 0x5f93a8);
          f.box(cx, base, cz, 2, 0.8, 2, 0, { color: 0xbbb7ab, wall: 2, winW: 0 });
          break;
        }
        const central = 1 - Math.min(1, Math.max(Math.abs(cx), Math.abs(cz)) / 600);
        const n = rnd() < 0.3 && central < 0.55 ? 2 : 1;
        for (let t = 0; t < n; t++) {
          const alongX = lw > ld;
          const sx0 = n === 1 ? L.x0 : alongX ? L.x0 + t * (lw / 2) : L.x0;
          const sx1 = n === 1 ? L.x1 : alongX ? L.x0 + (t + 1) * (lw / 2) : L.x1;
          const sz0 = n === 1 ? L.z0 : alongX ? L.z0 : L.z0 + t * (ld / 2);
          const sz1 = n === 1 ? L.z1 : alongX ? L.z1 : L.z0 + (t + 1) * (ld / 2);
          this.skyscraper(c, (sx0 + sx1) / 2, (sz0 + sz1) / 2, (sx1 - sx0) - 8, (sz1 - sz0) - 8, central, rnd);
        }
        break;
      }
      case 'office':
      case 'hotel': {
        plaza(0xc9c5ba);
        const w = lw * (0.6 + rnd() * 0.3), d = ld * (0.5 + rnd() * 0.3);
        const floors = zone === 'hotel' ? 10 + Math.floor(rnd() * 10) : 5 + Math.floor(rnd() * 10);
        const fh = zone === 'hotel' ? 3.3 : 3.9;
        const style = rnd();
        const stl: FStyle = style < 0.45 ? { color: pick(PAL.glass, rnd()), glass: 1, winW: 0.95, winH: 0.7, bayW: 1.5, floorH: fh, store: true } : { color: pick(PAL.conc, rnd()), wall: 2, glass: style < 0.7 ? 2 : 0, winW: 0.55, winH: 0.5, bayW: 3.6, floorH: fh, store: true, uplight: rnd() < 0.15 };
        f.box(cx, base, cz, w, floors * fh, d, 0, stl);
        this.col(c, cx, cz, w, d, 0, floors * fh);
        this.roofClutter(c, cx, cz, w, d, base + floors * fh, rnd, 4);
        if (rnd() < 0.5) f.box(cx, base + floors * fh, cz, w * 0.3, 4, d * 0.4, 0, { color: 0x9a9da0, wall: 2, winW: 0 });
        for (let k = 0; k < 8; k++) this.tree(c, L.x0 + rnd() * lw, rnd() < 0.5 ? L.z0 + 3 : L.z1 - 3, rnd, 0.55);
        break;
      }
      case 'mall': {
        lot(L.x0, L.x1, L.z0, L.z1);
        const w = lw * 0.62, d = ld * 0.5;
        f.box(cx, base, cz, w, 11, d, 0, { color: pick(PAL.conc, rnd()), wall: 2, winW: 0.0, bayW: 6, floorH: 5.5 });
        f.box(cx, base, cz + d / 2 + 0.6, w * 0.8, 6, 1.4, 0, { color: 0x2a4a6a, glass: 1, winW: 0.96, winH: 0.8, bayW: 2.2, floorH: 6, store: true });
        f.box(cx - w / 2 + 8, base + 11, cz + d / 2 - 1, 14, 5, 1.2, 0, { color: 0xb02a2a, wall: 2, winW: 0 });
        this.col(c, cx, cz, w, d, 0, 11);
        this.roofClutter(c, cx, cz, w, d, base + 11, rnd, 10);
        this.lotCars(c, L.x0, L.x1, L.z0, cz - d / 2 - 1, rnd, 0.55);
        this.lotCars(c, L.x0, L.x1, cz + d / 2 + 4, L.z1, rnd, 0.55);
        break;
      }
      case 'retail': {
        plaza(0xbdb9ae);
        const n = 2 + Math.floor(rnd() * 3);
        const lwEach = lw / n;
        for (let k = 0; k < n; k++) {
          const bw = lwEach - 3, bd = ld * (0.35 + rnd() * 0.25), fl = 1 + Math.floor(rnd() * 3);
          const bx = L.x0 + (k + 0.5) * lwEach;
          const bz = rnd() < 0.5 ? L.z0 + bd / 2 + 2 : L.z1 - bd / 2 - 2;
          const wall = rnd() < 0.5 ? 1 : 0;
          f.box(bx, base, bz, bw, fl * 3.8, bd, 0, { color: wall ? pick(PAL.brick, rnd()) : pick(PAL.render, rnd()), wall, store: true, bayW: 4, floorH: 3.8, winW: 0.5, winH: 0.5 });
          f.box(bx, base + 3.8 - 0.3, bz + (bz < cz ? bd / 2 : -bd / 2), bw, 0.6, 1.2, 0, { color: pick([0xb23a3a, 0x2a5a8a, 0x3a7a4a, 0xc9a02a], rnd()), wall: 2, winW: 0 });
          this.col(c, bx, bz, bw, bd, 0, fl * 3.8);
          this.roofClutter(c, bx, bz, bw, bd, base + fl * 3.8, rnd, 2);
        }
        this.lotCars(c, L.x0, L.x1, cz - 8, cz + 8, rnd, 0.4);
        this.streetCars(c, B, rnd, 0.35);
        break;
      }
      case 'gas': {
        lot(L.x0, L.x1, L.z0, L.z1);
        f.box(cx - 12, base, cz - 12, 10, 3.6, 7, 0, { color: 0xe8e4d8, wall: 2, store: true, bayW: 3.3, floorH: 3.6, winW: 0.5 });
        f.box(cx + 6, base + 5.2, cz + 8, 20, 0.7, 11, 0, { color: 0xd22b2b, wall: 2, winW: 0 });
        for (const [dx, dz] of [[-2, 3], [14, 3], [-2, 13], [14, 13]]) f.box(cx + dx, base, cz + dz, 0.5, 5.2, 0.5, 0, { color: 0xdddddd, wall: 2, winW: 0 });
        for (let k = 0; k < 3; k++) f.box(cx + 1 + k * 5, base, cz + 8, 0.8, 1.5, 1.4, 0, { color: 0x333333, wall: 5, winW: 0 });
        this.col(c, cx - 12, cz - 12, 10, 7, 0, 4);
        this.lotCars(c, L.x0, L.x1, cz + 16, L.z1, rnd, 0.15);
        break;
      }
      case 'parking': {
        const w = lw * 0.8, d = ld * 0.8;
        const fl = 4 + Math.floor(rnd() * 4);
        f.box(cx, base, cz, w, fl * 3.2, d, 0, { color: 0xa9a69e, wall: 2, glass: 0, winW: 0.94, winH: 0.45, bayW: 5.2, floorH: 3.2 });
        this.col(c, cx, cz, w, d, 0, fl * 3.2);
        f.box(cx, base + fl * 3.2, cz, w - 1, 0.5, d - 1, 0, { color: 0x8d8b85, wall: 2, winW: 0 });
        break;
      }
      case 'apartments': {
        lawn();
        const nb = lw > 70 && ld > 70 ? 2 + Math.floor(rnd() * 3) : 1 + Math.floor(rnd() * 2);
        for (let k = 0; k < nb; k++) {
          const cols = Math.ceil(Math.sqrt(nb)), rows = Math.ceil(nb / cols);
          const gx = k % cols, gz = Math.floor(k / cols);
          const cw = lw / cols, cd = ld / rows;
          const bw = cw * (0.62 + rnd() * 0.25), bd = cd * (0.4 + rnd() * 0.2);
          const bx = L.x0 + (gx + 0.5) * cw, bz = L.z0 + (gz + 0.5) * cd;
          const fl = 4 + Math.floor(rnd() * 6);
          const brick = rnd() < 0.5;
          const stl: FStyle = { color: brick ? pick(PAL.brick, rnd()) : pick(PAL.render, rnd()), wall: brick ? 1 : 0, bayW: 3.4, floorH: 3.0, winW: 0.5, winH: 0.55, store: rnd() < 0.3 };
          const yaw = 0;
          f.box(bx, base, bz, bw, fl * 3, bd, yaw, stl);
          if (rnd() < 0.5) f.box(bx + bw * 0.3, base, bz + bd * 0.5 + bd * 0.25, bw * 0.28, fl * 3, bd * 0.5, yaw, stl);
          this.col(c, bx, bz, bw, bd, yaw, fl * 3);
          this.roofClutter(c, bx, bz, bw, bd, base + fl * 3, rnd, 3);
          if (rnd() < 0.5) f.gable(bx, base + fl * 3, bz, bw + 0.8, 2.4, bd + 0.8, 0, { color: pick(PAL.roof, rnd()), wall: 4 });
        }
        for (let k = 0; k < 10; k++) this.tree(c, L.x0 + rnd() * lw, L.z0 + rnd() * ld, rnd, 0.7);
        this.streetCars(c, B, rnd, 0.55);
        break;
      }
      case 'houses':
      case 'retailhouses': {
        lawn();
        const nL = Math.max(2, Math.floor(lw / 21));
        const lotW = lw / nL;
        const rowZ = [L.z0 + 15, L.z1 - 15];
        for (let rowI = 0; rowI < 2; rowI++) {
          for (let k = 0; k < nL; k++) {
            const x = L.x0 + (k + 0.5) * lotW + (rnd() - 0.5) * 1.5;
            const z = rowZ[rowI] + (rnd() - 0.5) * 1.5;
            const yaw = rowI === 0 ? Math.PI : 0;
            const gar = this.house(c, x, z, yaw, rnd);
            // driveway
            const dz = rowI === 0 ? L.z0 + 5 : L.z1 - 5;
            if (gar) {
              c.gb('pave', x, z).quad(gar[0], Y + 0.21, dz, 3.4, 11, 0, 1, 3, 0xbab6ac);
              if (rnd() < 0.35) c.cars.add(gar[0], Y + 0.25, dz, Math.PI / 2, randomCarColor(rnd()));
            }
            this.tree(c, x + (rnd() - 0.5) * 8, rowI === 0 ? L.z0 + 3.5 : L.z1 - 3.5, rnd, 0.62);
            if (rnd() < 0.7) this.tree(c, x + (rnd() - 0.5) * 10, rowI === 0 ? L.z1 - ld * 0.2 : L.z0 + ld * 0.2, rnd, 0.7);
            if (rnd() < 0.1) c.gb('water', x, z).quad(x - 2, Y + 0.24, rowI === 0 ? cz - 8 : cz + 8, 4.5, 8, 0, 1, 1, 0x5aa6c4);
          }
        }
        f.box(cx, Y + 0.2, cz, lw, 1.7, 0.1, 0, { color: 0x8a6d4b, wall: 5, winW: 0, bayW: 100, floorH: 1.7 });
        this.streetCars(c, B, rnd, 0.22);
        break;
      }
      case 'park': {
        lawn();
        const g = c.gb('plaza', cx, cz);
        g.quad(cx, Y + 0.22, cz, 3, ld, 0, 1, ld / 3, 0xbab5a6);
        g.quad(cx, Y + 0.22, cz, lw, 3, 0, lw / 3, 1, 0xbab5a6);
        c.gb('water', cx, cz).quad(cx + lw * 0.2, Y + 0.23, cz + ld * 0.2, lw * 0.28, ld * 0.22, 0, 1, 1, 0x4d8294);
        for (let k = 0; k < 34; k++) {
          const x = L.x0 + 4 + rnd() * (lw - 8), z = L.z0 + 4 + rnd() * (ld - 8);
          if (Math.abs(x - cx) < 3 || Math.abs(z - cz) < 3) continue;
          this.tree(c, x, z, rnd, 0.9);
        }
        break;
      }
      case 'church': {
        plaza(0xc8c3b6);
        lawn();
        const f2 = c.fac(cx, cz);
        f2.box(cx, base, cz, 12, 8, 26, 0, { color: 0xd8d2c2, wall: 3, winW: 0.3, winH: 0.6, bayW: 4, floorH: 8, glass: 1 });
        f2.gable(cx, base + 8, cz, 13, 6, 27, Math.PI / 2, { color: 0x4a4a52, wall: 4 });
        f2.box(cx, base, cz + 15, 6.5, 24, 6.5, 0, { color: 0xd8d2c2, wall: 3, winW: 0.25, winH: 0.2, bayW: 6, floorH: 24 });
        f2.hip(cx, base + 24, cz + 15, 7, 16, 7, 0, { color: 0x3e4a4a, wall: 5 });
        this.col(c, cx, cz, 12, 26, 0, 14);
        this.col(c, cx, cz + 15, 6.5, 6.5, 0, 40);
        for (let k = 0; k < 8; k++) this.tree(c, L.x0 + rnd() * lw, L.z0 + rnd() * ld, rnd, 0.8);
        break;
      }
      case 'school': {
        lawn();
        const f2 = c.fac(cx, cz);
        const st: FStyle = { color: pick(PAL.brick, rnd()), wall: 1, bayW: 3.6, floorH: 3.8, winW: 0.62, winH: 0.55 };
        f2.box(cx, base, L.z0 + 22, lw * 0.7, 11.4, 16, 0, st);
        f2.box(cx - lw * 0.35 + 8, base, cz, 16, 7.6, ld * 0.5, 0, st);
        f2.box(cx + lw * 0.3, base, cz + 4, 22, 8, 26, 0, { color: 0xb8b3a6, wall: 2, winW: 0.0 });
        this.col(c, cx, L.z0 + 22, lw * 0.7, 16, 0, 12);
        this.col(c, cx - lw * 0.35 + 8, cz, 16, ld * 0.5, 0, 8);
        this.col(c, cx + lw * 0.3, cz + 4, 22, 26, 0, 8);
        c.gb('lawn', cx, cz).quad(cx - 5, Y + 0.23, L.z1 - 24, 60, 38, 0, 1, 1, 0x7fb06a);
        c.gb('lot', cx, cz).quad(cx - 5, Y + 0.25, L.z1 - 24, 46, 26, 0, 4, 2, 0xc2563f);
        this.roofClutter(c, cx, L.z0 + 22, lw * 0.7, 16, base + 11.4, rnd, 4);
        for (let k = 0; k < 10; k++) this.tree(c, L.x0 + rnd() * lw, L.z0 + 46 + rnd() * 10, rnd, 0.8);
        break;
      }
      case 'hospital': {
        plaza(0xd0ccc2);
        const st: FStyle = { color: 0xe4e2dc, wall: 2, glass: 2, bayW: 3.4, floorH: 3.9, winW: 0.55, winH: 0.5, store: true };
        f.box(cx, base, cz, lw * 0.8, 11 * 3.9, 26, 0, st);
        f.box(cx - lw * 0.3, base, cz + 28, 24, 6 * 3.9, 36, 0, st);
        f.box(cx + lw * 0.3, base, cz + 28, 24, 6 * 3.9, 36, 0, st);
        f.box(cx, base + 11 * 3.9, cz, 14, 6, 14, 0, { color: 0xb5b8ba, wall: 2, winW: 0 });
        this.col(c, cx, cz, lw * 0.8, 26, 0, 43);
        this.col(c, cx - lw * 0.3, cz + 28, 24, 36, 0, 24);
        this.col(c, cx + lw * 0.3, cz + 28, 24, 36, 0, 24);
        f.box(cx, base + 11 * 3.9 + 6, cz, 22, 0.3, 22, 0, { color: 0x2c6e9e, wall: 2, winW: 0 });
        f.box(cx, base + 6 * 3.9, cz + 28, 26, 0.4, 36, 0, { color: 0xcfd0d0, wall: 2, winW: 0 });
        this.lotCars(c, L.x0, L.x1, L.z1 - 22, L.z1, rnd, 0.7);
        this.roofClutter(c, cx, cz, lw * 0.8, 26, base + 11 * 3.9, rnd, 6);
        break;
      }
      case 'police':
      case 'fire': {
        lot(L.x0, L.x1, L.z0, L.z1);
        const fire = zone === 'fire';
        f.box(cx, base, cz - 6, lw * 0.6, 8.5, 28, 0, { color: fire ? 0xa8412f : 0xb9b4a7, wall: 1, bayW: 4.5, floorH: 4.2, winW: 0.5, store: false });
        f.box(cx - lw * 0.15, base, cz + 10, lw * 0.3, 4, 3, 0, { color: 0xe8e8e0, wall: 2, winW: 0 });
        if (fire) {
          f.box(cx + lw * 0.32, base, cz - 6, 8, 26, 8, 0, { color: 0xa8412f, wall: 1, winW: 0.2, bayW: 8, floorH: 8, winH: 0.4 });
          for (let k = 0; k < 4; k++) f.box(cx - lw * 0.22 + k * 9, base, cz + 8.1, 7, 4.6, 0.2, 0, { color: 0xd2d2c8, wall: 2, winW: 0 });
        } else {
          for (let k = 0; k < 4; k++) c.cars.add(L.x0 + 10 + k * 3, base + 0.05, L.z1 - 8, Math.PI / 2, k % 2 ? 0xf0f0f0 : 0x1a2540);
        }
        this.col(c, cx, cz - 6, lw * 0.6, 28, 0, 9);
        this.lotCars(c, L.x0, L.x1, L.z1 - 16, L.z1, rnd, 0.4);
        break;
      }
      case 'gov': {
        plaza(0xd0ccc0);
        const st: FStyle = { color: 0xd8d0bc, wall: 3, bayW: 4.4, floorH: 4.6, winW: 0.42, winH: 0.62, store: false, uplight: true };
        f.box(cx, base, cz, lw * 0.82, 4.6 * 5, ld * 0.55, 0, st);
        f.box(cx, base + 4.6 * 5, cz, lw * 0.9, 1.6, ld * 0.62, 0, { color: 0xc9c1ad, wall: 3, winW: 0 });
        for (let k = 0; k < 8; k++) f.cyl(cx - lw * 0.3 + k * (lw * 0.6 / 7), base, cz + ld * 0.27 + 2, 0.7, 4.6 * 3, { color: 0xe3dccb, wall: 3, winW: 0 });
        f.box(cx, base + 4.6 * 3, cz + ld * 0.27 + 2, lw * 0.66, 1.4, 4.6, 0, { color: 0xd8d0bc, wall: 3, winW: 0 });
        this.col(c, cx, cz, lw * 0.82, ld * 0.55, 0, 25);
        for (let k = 0; k < 10; k++) this.tree(c, L.x0 + 2 + rnd() * (lw - 4), L.z1 - 3 - rnd() * 8, rnd, 0.7);
        break;
      }
      case 'station': {
        plaza(0x8f8c84);
        break;
      }
      case 'bus': {
        lot(L.x0, L.x1, L.z0, L.z1);
        f.box(cx, base, cz - 22, lw * 0.7, 6, 18, 0, { color: 0xbdb9ae, wall: 2, glass: 1, store: true, winW: 0.8, winH: 0.6, bayW: 3, floorH: 6 });
        f.box(cx, base + 6.2, cz - 8, lw * 0.8, 0.5, 18, 0, { color: 0x55606a, wall: 5, winW: 0 });
        for (let k = 0; k < 6; k++) f.box(L.x0 + 10 + k * (lw - 20) / 5, base, cz - 8 + 8, 0.4, 6.2, 0.4, 0, { color: 0x666666, wall: 5, winW: 0 });
        for (let k = 0; k < 5; k++) c.cars.add(L.x0 + 14 + k * 14, base + 0.1, cz + 4, 0, 0xd9c21f, 2.1);
        this.col(c, cx, cz - 22, lw * 0.7, 18, 0, 6);
        break;
      }
      case 'industrial': {
        lot(L.x0, L.x1, L.z0, L.z1);
        this.industrial(c, B, L, rnd);
        break;
      }
      case 'yard': {
        // rail yard: containers & gravel
        for (let k = 0; k < 18; k++) {
          const bx = L.x0 + 8 + rnd() * (lw - 16);
          const bz = rnd() < 0.5 ? L.z0 + 6 : L.z1 - 6;
          const rows = 1 + Math.floor(rnd() * 3);
          const colr = pick([0x8b2f2b, 0x2b5a8a, 0x3a6a4a, 0xb98a2a, 0x6a6a6e, 0x9c4a2a], rnd());
          for (let r = 0; r < rows; r++) f.box(bx, base + r * 2.6, bz, 12.2, 2.6, 2.45, 0, { color: colr, wall: 5, winW: 0, bayW: 1.2, floorH: 2.6 });
          this.col(c, bx, bz, 12.2, 2.45, 0, rows * 2.6);
        }
        break;
      }
      case 'rail': {
        if (B.i === -1 || B.i === 0) break;
        for (let k = 0; k < 6; k++) this.tree(c, L.x0 + rnd() * lw, rnd() < 0.5 ? L.z0 + 2 : L.z1 - 2, rnd, 0.6);
        break;
      }
      default:
        plaza();
    }
    if (zone === 'station') this.stationBuilding(c, B, rnd);
  }

  private skyscraper(c: Ctx, cx: number, cz: number, w: number, d: number, central: number, rnd: () => number) {
    const f = c.fac(cx, cz);
    const base = c.Y + 0.2;
    const kind = rnd();
    const H = Math.max(40, 35 + 270 * Math.pow(central, 1.5) * (0.45 + rnd() * 0.65));
    const glass = kind < 0.45, dark = kind >= 0.45 && kind < 0.6, stone = kind >= 0.9 || (H < 110 && kind > 0.75);
    const podH = 10 + Math.floor(rnd() * 3) * 4;
    const podSt: FStyle = { color: stone ? pick(PAL.stone, rnd()) : pick(PAL.conc, rnd()), wall: stone ? 3 : 2, bayW: 4.4, floorH: 5, winW: 0.5, winH: 0.6, store: true, uplight: rnd() < 0.1 };
    f.box(cx, base, cz, w, podH, d, 0, podSt);
    this.col(c, cx, cz, w, d, 0, H);
    this.roofClutter(c, cx, cz, w, d, base + podH, rnd, 3);
    const sw = w * (0.6 + rnd() * 0.22), sd = d * (0.6 + rnd() * 0.22);
    const ox = (rnd() - 0.5) * (w - sw) * 0.6, oz = (rnd() - 0.5) * (d - sd) * 0.6;
    const shaftSt = (col: number): FStyle =>
      stone
        ? { color: col, wall: 3, bayW: 4.2, floorH: 4.4, winW: 0.42, winH: 0.6 }
        : glass || dark
        ? { color: col, glass: dark ? 2 : 1, wall: 0, bayW: 1.5, floorH: 4.0, winW: 0.96, winH: 0.72 }
        : { color: col, wall: 2, bayW: 3.6, floorH: 3.8, winW: 0.55, winH: 0.52 };
    const col = stone ? pick(PAL.stone, rnd()) : glass ? pick(PAL.glass, rnd()) : dark ? 0x2f3e40 : pick(PAL.conc, rnd());
    const shaftH = H - podH;
    let y = base + podH;
    let cw = sw, cd = sd, ccx = cx + ox, ccz = cz + oz;
    const stages = H > 150 ? 3 : H > 90 ? 2 : 1;
    for (let s = 0; s < stages; s++) {
      const hh = s === stages - 1 ? shaftH - (y - base - podH) : shaftH * (s === 0 ? (stages === 3 ? 0.5 : 0.62) : 0.3);
      f.box(ccx, y, ccz, cw, hh, cd, 0, shaftSt(col));
      y += hh;
      this.roofClutter(c, ccx, ccz, cw, cd, y, rnd, 2);
      cw *= 0.78;
      cd *= 0.78;
      ccx += (rnd() - 0.5) * 3;
      ccz += (rnd() - 0.5) * 3;
    }
    f.box(ccx, y, ccz, cw * 0.8, 6 + rnd() * 5, cd * 0.8, 0, { color: 0x8c9094, wall: 2, winW: 0 });
    if (H > 110) f.cyl(ccx, y + 8, ccz, 0.35, 20 + H * 0.12, { color: 0xc8c8c8, wall: 5, winW: 0 });
  }

  private industrial(c: Ctx, B: Block, L: { x0: number; x1: number; z0: number; z1: number }, rnd: () => number) {
    const f = c.fac(B.cx, B.cz);
    const base = c.Y + 0.2;
    const lw = L.x1 - L.x0, ld = L.z1 - L.z0;
    const t = rnd();
    const metal = pick(PAL.metal, rnd());
    if (t < 0.45) {
      // warehouse with loading docks
      const w = lw * (0.7 + rnd() * 0.2), d = ld * (0.5 + rnd() * 0.25), h = 10 + rnd() * 6;
      const bz = L.z0 + d / 2 + 3;
      f.box(B.cx, base, bz, w, h, d, 0, { color: metal, wall: 5, winW: 0, bayW: 100, floorH: h, store: false });
      f.gable(B.cx, base + h, bz, w + 0.6, 1.6, d + 0.6, 0, { color: 0x9aa0a5, wall: 5 });
      const nD = Math.floor(w / 14);
      for (let k = 0; k < nD; k++) f.box(B.cx - w / 2 + (k + 0.5) * (w / nD), base, bz + d / 2 + 0.05, 4.2, 4.6, 0.3, 0, { color: 0x30363a, wall: 5, winW: 0 });
      f.box(B.cx, base, bz + d / 2 + 2.2, w, 1.2, 4, 0, { color: 0x8c8a83, wall: 2, winW: 0 });
      this.col(c, B.cx, bz, w, d, 0, h + 1.6);
      for (let k = 0; k < nD; k += 2) f.box(B.cx - w / 2 + (k + 0.5) * (w / nD), base + 1.2, bz + d / 2 + 9, 2.6, 3.2, 14, 0, { color: pick([0xe5e5e5, 0xd5d0c5, 0x2b4a7a], rnd()), wall: 5, winW: 0 });
      this.roofClutter(c, B.cx, bz, w, d, base + h + 1, rnd, 4);
      this.lotCars(c, L.x0, L.x1, bz + d / 2 + 18, L.z1, rnd, 0.2);
    } else if (t < 0.75) {
      // factory: long hall + chimney + tanks
      const w = lw * 0.6, d = ld * 0.35;
      const bx = L.x0 + w / 2 + 4, bz = L.z0 + d / 2 + 4;
      f.box(bx, base, bz, w, 14, d, 0, { color: pick(PAL.brick, rnd()), wall: 1, bayW: 6, floorH: 7, winW: 0.6, winH: 0.5, decay: 0.15 });
      const teeth = Math.floor(w / 10);
      for (let k = 0; k < teeth; k++) f.gable(bx - w / 2 + (k + 0.5) * (w / teeth), base + 14, bz, w / teeth, 3.5, d, Math.PI / 2, { color: 0x7c8286, wall: 5 });
      this.col(c, bx, bz, w, d, 0, 17);
      const chx = L.x1 - 8, chz = L.z0 + 10;
      f.cyl(chx, base, chz, 2.6, 62 + rnd() * 30, { color: 0x7a4a40, wall: 1, winW: 0 });
      this.col(c, chx, chz, 5, 5, 0, 80);
      for (let k = 0; k < 4; k++) {
        const tr = 5 + rnd() * 4, tx = L.x0 + 14 + (k % 2) * 22, tz = L.z1 - 16 - Math.floor(k / 2) * 22;
        f.cyl(tx, base, tz, tr, 10 + rnd() * 7, { color: pick([0xe0e0dc, 0xb7bdc0, 0xc9c0a8], rnd()), wall: 5, winW: 0 });
        this.col(c, tx, tz, tr * 2, tr * 2, 0, 14);
      }
      f.box(L.x1 - 20, base + 7, L.z1 - 22, 36, 0.5, 2, 0, { color: 0x7a5a2a, wall: 5, winW: 0 });
      this.roofClutter(c, bx, bz, w, d, base + 14, rnd, 5);
    } else {
      // distribution centre with container yard
      const w = lw * 0.5, d = ld * 0.55;
      f.box(B.cx - lw * 0.2, base, B.cz - ld * 0.15, w, 12, d, 0, { color: metal, wall: 2, winW: 0.0, bayW: 8, floorH: 6 });
      this.col(c, B.cx - lw * 0.2, B.cz - ld * 0.15, w, d, 0, 12);
      for (let k = 0; k < 14; k++) {
        const bx = L.x0 + 12 + rnd() * (lw - 24), bz = L.z1 - 8 - rnd() * 20;
        const rows = 1 + Math.floor(rnd() * 3);
        const colr = pick([0x8b2f2b, 0x2b5a8a, 0x3a6a4a, 0xb98a2a, 0x6a6a6e, 0x9c4a2a], rnd());
        for (let r = 0; r < rows; r++) f.box(bx, base + r * 2.6, bz, 12.2, 2.6, 2.45, 0, { color: colr, wall: 5, winW: 0, bayW: 1.2, floorH: 2.6 });
      }
      this.roofClutter(c, B.cx - lw * 0.2, B.cz - ld * 0.15, w, d, base + 12, rnd, 6);
    }
  }

  private stationBuilding(c: Ctx, B: Block, rnd: () => number) {
    if (B.i !== 0) return;
    const cx = B.cx;
    const f = c.fac(cx, B.cz);
    const base = c.Y + 0.2;
    f.box(cx, base, 684, 80, 14, 22, 0, { color: 0xd3c8ae, wall: 3, bayW: 5.0, floorH: 7, winW: 0.45, winH: 0.75, store: false, uplight: true });
    f.gable(cx, base + 14, 684, 82, 6, 24, 0, { color: 0x4d5a5c, wall: 5 });
    f.box(cx, base + 14, 696, 14, 20, 5, 0, { color: 0xd3c8ae, wall: 3, winW: 0.3, bayW: 7, floorH: 10 });
    f.hip(cx, base + 34, 696, 15, 8, 7, 0, { color: 0x4d5a5c, wall: 5 });
    this.col(c, cx, 684, 80, 22, 0, 22);
    f.box(cx, base, 721, 86, 0.9, 5, 0, { color: 0xa8a69d, wall: 2, winW: 0 });
    f.box(cx, base, 709, 86, 0.9, 5, 0, { color: 0xa8a69d, wall: 2, winW: 0 });
    f.box(cx, base + 4.8, 715, 86, 0.4, 14, 0, { color: 0x69767a, wall: 5, winW: 0 });
    for (let q = -4; q <= 4; q++) for (const dz of [-6.5, 6.5]) f.box(cx + q * 10, base, 715 + dz, 0.4, 4.8, 0.4, 0, { color: 0x4a4f52, wall: 5, winW: 0 });
    void rnd;
  }

  // ------------------------------------------------------------------ traffic
  private makeTraffic() {
    const r = mulberry32(777);
    const lines = [-12, -8, -4, 0, 4, 8, 12];
    for (const k of lines) {
      const pos = k * CITY.S;
      for (const axis of [0, 1]) {
        for (const dir of [1, -1]) {
          for (const lane of [0, 1]) {
            const off = (dir === 1 ? 1 : -1) * (axis === 0 ? 1 : -1) * (lane === 0 ? 2.4 : 5.8);
            const v = 9 + lane * 3 + r() * 3;
            const lim = Math.sqrt(Math.max(0, 1900 * 1900 - pos * pos));
            let t = -lim + r() * 100;
            while (t < lim) {
              this.traffic.push({ x: t, z: 0, v: v * dir, axis, lane, dir, fixed: pos + off, mesh: 0 });
              t += 70 + r() * 110;
            }
            void lim;
          }
        }
      }
    }
    for (const t of this.traffic) {
      const pos = t.fixed;
      void pos;
    }
  }

  updateTraffic(dt: number) {
    const im = this.trafficMesh;
    if (!im) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    const y = this.Y + 0.14;
    this.traffic.forEach((t, i) => {
      t.x += t.v * dt;
      const lineCoord = t.fixed - 0; // perpendicular coordinate (includes lane offset)
      const lim = Math.sqrt(Math.max(0, 1900 * 1900 - Math.round(lineCoord / CITY.S) * CITY.S * Math.round(lineCoord / CITY.S) * CITY.S));
      if (t.x > lim) t.x = -lim;
      if (t.x < -lim) t.x = lim;
      // axis 0: travel along x, perpendicular z ; axis 1: travel along z
      const yaw = t.axis === 0 ? (t.dir > 0 ? 0 : Math.PI) : t.dir > 0 ? Math.PI / 2 * -1 : Math.PI / 2;
      q.setFromAxisAngle(up, yaw);
      if (t.axis === 0) p.set(t.x, y, t.fixed);
      else p.set(t.fixed, y, t.x);
      m.compose(p, q, s);
      im.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------ assemble
  private finish(scene: THREE.Scene) {
    // facades
    for (const [, f] of this.facs) f.build(this.matI, this.group, true);
    // ground
    for (const [k, g] of this.gbs) {
      const kind = k.split('|')[0];
      const mesh = g.build(this.groundMats[kind]);
      if (mesh) {
        mesh.renderOrder = 1;
        this.group.add(mesh);
      }
    }
    // static cars
    this.cars.build(this.group);
    // traffic
    if (this.traffic.length) {
      const geo = new THREE.BufferGeometry();
      void geo;
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.32 });
      // reuse car geometry through a throw-away CarField to avoid duplicating code
      const tmp = new CarField();
      tmp.add(0, 0, 0, 0, 0xffffff);
      const g = new THREE.Group();
      const one = tmp.build(g)!;
      const im = new THREE.InstancedMesh(one.geometry, mat, this.traffic.length);
      const rr = mulberry32(99);
      const col = new THREE.Color();
      for (let i = 0; i < this.traffic.length; i++) {
        col.setHex(randomCarColor(rr()));
        im.setColorAt(i, col);
      }
      im.frustumCulled = false;
      im.castShadow = true;
      this.trafficMesh = im;
      this.group.add(im);
      this.updateTraffic(0);
    }
    // trees
    const kit = getTreeKit();
    const byCell = new Map<string, TreeInst[]>();
    for (const t of this.trees) {
      const k = this.cellKey(t.x, t.z);
      if (!byCell.has(k)) byCell.set(k, []);
      byCell.get(k)!.push(t);
    }
    for (const [, list] of byCell) {
      const a = list.filter((_, i) => i % 3 !== 0);
      const b = list.filter((_, i) => i % 3 === 0);
      if (a.length) this.group.add(instancedFrom(kit.broad[1], kit.mat, a, false));
      if (b.length) this.group.add(instancedFrom(kit.spruce[1], kit.mat, b, false));
    }
    this.lamps.build(this.group);
    scene.add(this.group);
  }

  update(night: number, dt: number) {
    this.lamps.update(night);
    this.updateTraffic(dt);
  }
}
