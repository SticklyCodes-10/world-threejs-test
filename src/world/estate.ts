// The Government Estate: an original neoclassical presidential residence and grounds.
import * as THREE from 'three';
import { ESTATE, SITES } from './config';
import { GeoBuilder, GroundBuilder, createFacadeMaterial, type FStyle } from './facade';
import { CarField, LampField, randomCarColor } from './props';
import { mulberry32 } from './noise';
import { fenceTex, grassTex, lotTex, parterreTex, pavementTex, roadTex, signTex } from './textures';
import { getTreeKit, instancedFrom } from './vegetation';
import type { Collider } from './city';

const WHITE = 0xf0eee6;
const STONE = 0xe2dfd3;
const COL = 0xf4f2ea;

function flagTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 140;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 13; i++) {
    g.fillStyle = i % 2 ? '#f2f2f2' : '#b22234';
    g.fillRect(0, (i * 140) / 13, 256, 140 / 13 + 1);
  }
  g.fillStyle = '#2c3e7a';
  g.fillRect(0, 0, 105, 75);
  g.fillStyle = '#fff';
  for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) g.fillRect(8 + x * 16, 7 + y * 14, 4, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class EstateSystem {
  group = new THREE.Group();
  lamps = new LampField();
  colliders: Collider[] = [];
  Y: number;
  flags: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene) {
    const site = SITES.find((s) => s.name === 'estate')!;
    this.Y = site.y;
    this.group.position.set(ESTATE.x, 0, ESTATE.z);
    this.build();
    this.lamps.build(this.group);
    scene.add(this.group);
  }

  private wc(lx: number, lz: number, w: number, d: number, h: number) {
    this.colliders.push({ x: ESTATE.x + lx, z: ESTATE.z + lz, hx: w / 2, hz: d / 2, c: 1, s: 0, h });
  }

  private build() {
    const Y = this.Y;
    const B = new GeoBuilder();
    const rnd = mulberry32(2024);
    const plain = (color: number, extra: FStyle = {}): FStyle => ({ color, wall: 0, winW: 0, bayW: 100, floorH: 100, ...extra });
    const columns = (cx: number, z: number, y0: number, h: number, n: number, sp: number, r: number, wall = 0) => {
      for (let k = 0; k < n; k++) {
        const x = cx - ((n - 1) * sp) / 2 + k * sp;
        B.box(x, y0, z, r * 3, 0.5, r * 3, 0, plain(COL, { wall }));
        B.cyl(x, y0 + 0.5, z, r, h - 1.3, 16, plain(COL, { wall }), r * 0.88);
        B.box(x, y0 + h - 0.8, z, r * 3.2, 0.8, r * 3.2, 0, plain(COL, { wall }));
      }
    };
    const balustrade = (x0: number, x1: number, z: number, y0: number, step = 0.55) => {
      B.box((x0 + x1) / 2, y0 + 0.9, z, x1 - x0, 0.15, 0.4, 0, plain(WHITE));
      B.box((x0 + x1) / 2, y0, z, x1 - x0, 0.2, 0.45, 0, plain(WHITE));
      for (let x = x0; x <= x1; x += step) B.box(x, y0 + 0.2, z, 0.16, 0.7, 0.16, 0, plain(WHITE));
    };
    const winSt: FStyle = { color: WHITE, wall: 0, bayW: 4.6, floorH: 6.2, winW: 0.4, winH: 0.74, glass: 0, uplight: true };
    const plinthSt: FStyle = { color: STONE, wall: 3, bayW: 4.6, floorH: 5, winW: 0.28, winH: 0.4, glass: 0, uplight: true };

    // ===================== central block
    const PL = 6; // plinth height
    B.box(0, Y, -30, 92, PL, 42, 0, plinthSt);
    B.box(0, Y + PL, -30, 90, 12.4, 40, 0, winSt);
    B.box(0, Y + PL + 12.4, -30, 94, 1.5, 44, 0, plain(STONE, { wall: 3, uplight: true })); // cornice
    B.box(0, Y + PL + 13.9, -30, 91, 1.2, 41, 0, plain(WHITE)); // parapet
    B.hip(0, Y + PL + 13.9, -30, 80, 3.2, 34, 0, { color: 0x666c70, wall: 5, winW: 0 });
    this.wc(0, -30, 92, 42, 20);
    // cupola
    B.box(0, Y + PL + 17.1, -30, 12, 4.2, 12, 0, { color: WHITE, wall: 0, bayW: 3, floorH: 4.2, winW: 0.5, winH: 0.7 });
    B.hip(0, Y + PL + 21.3, -30, 14, 4, 14, 0, { color: 0x555b60, wall: 5, winW: 0 });
    B.cyl(0, Y + PL + 25, -30, 0.2, 14, 6, plain(0xcccccc));
    // portico (south)
    B.box(0, Y, -4, 44, PL, 16, 0, plain(STONE, { wall: 3 }));
    columns(0, 1.6, Y + PL, 12.4, 8, 4.7, 0.85);
    B.box(0, Y + PL + 12.4, -1, 40, 2.0, 18, 0, plain(WHITE, { wall: 3 }));
    B.gable(0, Y + PL + 14.4, -1, 18.4, 5.4, 41, Math.PI / 2, { color: 0x8a9096, wall: 4 });
    // balcony between columns and facade
    B.box(0, Y + PL + 6.2, -5.5, 33, 0.35, 8, 0, plain(WHITE, { wall: 3 }));
    balustrade(-16.5, 16.5, -1.6, Y + PL + 6.5);
    // grand staircase
    for (let i = 0; i < 20; i++) {
      const depth = 9 - i * 0.45;
      B.box(0, Y, 5 + depth / 2, 34 - i * 0.12, (i + 1) * 0.3, depth, 0, plain(STONE, { wall: 3 }));
    }
    B.box(-18.4, Y, 9, 2.4, 3.6, 10, 0, plain(STONE, { wall: 3 }));
    B.box(18.4, Y, 9, 2.4, 3.6, 10, 0, plain(STONE, { wall: 3 }));
    // rear semicircular portico
    for (let k = 0; k <= 10; k++) {
      const a = Math.PI + (k / 10) * Math.PI;
      const x = Math.cos(a) * 13;
      const z = -50 + Math.sin(a) * 13;
      B.box(x, Y + PL, z, 2.4, 0.5, 2.4, 0, plain(COL));
      B.cyl(x, Y + PL + 0.5, z, 0.75, 10.6, 14, plain(COL), 0.66);
    }
    B.cyl(0, Y + PL + 11.5, -50, 14.5, 1.6, 28, plain(STONE, { wall: 3 }));
    B.cyl(0, Y, -50, 15.5, PL, 28, plain(STONE, { wall: 3 }));
    // ===================== wings, galleries, pavilions (mirrored)
    for (const sx of [-1, 1]) {
      // colonnaded gallery
      B.box(sx * 57.5, Y, -22, 25, 4.5, 6, 0, plinthSt);
      B.box(sx * 57.5, Y + 4.5, -22, 25, 5.5, 6, 0, { ...winSt, floorH: 5.5, winW: 0.5 });
      columns(sx * 57.5, -16, Y, 9.2, 5, 5.2, 0.5);
      B.box(sx * 57.5, Y + 9.2, -19, 27, 1.0, 12, 0, plain(STONE, { wall: 3 }));
      balustrade(sx * 57.5 - 13, sx * 57.5 + 13, -13.5, Y + 10.2);
      this.wc(sx * 57.5, -20, 25, 10, 11);
      // wing
      B.box(sx * 105, Y, -30, 70, 4.5, 32, 0, plinthSt);
      B.box(sx * 105, Y + 4.5, -30, 69, 9.6, 31, 0, { ...winSt, floorH: 4.8 });
      B.box(sx * 105, Y + 14.1, -30, 72, 1.2, 34, 0, plain(STONE, { wall: 3, uplight: true }));
      B.hip(sx * 105, Y + 15.3, -30, 66, 3, 28, 0, { color: 0x666c70, wall: 5, winW: 0 });
      for (let k = 0; k < 4; k++) B.box(sx * (80 + k * 17), Y + 15.3, -38, 1.8, 5, 1.8, 0, { color: 0x9a5a48, wall: 1, winW: 0 });
      this.wc(sx * 105, -30, 70, 32, 18);
      // wing pilasters on the facade
      for (let k = 0; k < 8; k++) B.box(sx * (75 + k * 8.5), Y + 4.5, -14.3, 0.9, 9.6, 0.6, 0, plain(COL));
      // end pavilion with small portico
      B.box(sx * 156, Y, -30, 34, 4.5, 38, 0, plinthSt);
      B.box(sx * 156, Y + 4.5, -30, 33, 11.5, 37, 0, { ...winSt, floorH: 5.75, bayW: 4.1 });
      B.box(sx * 156, Y + 16, -30, 36, 1.4, 40, 0, plain(STONE, { wall: 3 }));
      B.hip(sx * 156, Y + 17.4, -30, 30, 4.2, 34, 0, { color: 0x666c70, wall: 5, winW: 0 });
      columns(sx * 156, -8, Y + 4.5, 11.5, 4, 5.2, 0.62);
      B.box(sx * 156, Y + 16, -9, 21, 1.4, 6, 0, plain(WHITE, { wall: 3 }));
      B.gable(sx * 156, Y + 17.4, -9, 6, 3.4, 21, Math.PI / 2, { color: 0x8a9096, wall: 4 });
      this.wc(sx * 156, -30, 34, 38, 20);
      // flagpoles
      for (const dz of [28, 46]) B.cyl(sx * 70, Y, dz, 0.14, 24, 6, plain(0xd8d8d8), 0.09);
    }
    // ===================== perimeter, gates, checkpoint
    const X0 = -420, X1 = 420, Z0 = -380, Z1 = 520;
    const wallSt = plain(0xcfcbc0, { wall: 3, bayW: 4, floorH: 1.2 });
    const wallRun = (ax: number, az: number, bx: number, bz: number) => {
      const len = Math.hypot(bx - ax, bz - az);
      const yaw = Math.atan2(-(bz - az), bx - ax);
      B.box((ax + bx) / 2, Y, (az + bz) / 2, len, 1.3, 0.7, yaw, wallSt);
      const n = Math.max(1, Math.round(len / 11));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
        B.box(px, Y, pz, 1.0, 3.6, 1.0, yaw, plain(0xd9d5ca, { wall: 3 }));
        B.box(px, Y + 3.6, pz, 1.35, 0.35, 1.35, yaw, plain(0xe6e2d8, { wall: 3 }));
        B.cyl(px, Y + 3.95, pz, 0.28, 0.3, 8, plain(0xd2cfc6));
      }
      return { len, yaw, mx: (ax + bx) / 2, mz: (az + bz) / 2 };
    };
    const fenceTexture = fenceTex('iron');
    const fenceMat = (len: number) => {
      const t = fenceTexture.clone();
      t.needsUpdate = true;
      t.repeat.set(len / 3, 1);
      return new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.5 });
    };
    const fence = (ax: number, az: number, bx: number, bz: number) => {
      const r = wallRun(ax, az, bx, bz);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(r.len, 2.6), fenceMat(r.len));
      m.position.set(r.mx, Y + 1.3 + 1.3, r.mz);
      m.rotation.y = r.yaw;
      m.castShadow = false;
      this.group.add(m);
    };
    fence(X0, Z0, -10, Z0);
    fence(10, Z0, X1, Z0);
    fence(X0, Z0, X0, Z1);
    fence(X1, Z0, X1, Z1);
    fence(X0, Z1, -26, Z1);
    fence(26, Z1, X1, Z1);
    // main gate
    for (const sx of [-1, 1]) {
      B.box(sx * 24, Y, Z1, 3, 7.5, 3, 0, plain(0xd9d5ca, { wall: 3 }));
      B.box(sx * 24, Y + 7.5, Z1, 3.8, 0.6, 3.8, 0, plain(0xe6e2d8, { wall: 3 }));
      B.cyl(sx * 24, Y + 8.1, Z1, 0.9, 1.2, 10, plain(0xd2cfc6), 0.6);
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(10, 4.2), fenceMat(10));
      leaf.position.set(sx * 20.5, Y + 2.2, Z1 + 3);
      leaf.rotation.y = sx * 1.2;
      this.group.add(leaf);
    }
    B.box(0, Y + 7.3, Z1, 52, 0.9, 1.4, 0, plain(0x1c1e20, { wall: 5 }));
    // rear service gate
    for (const sx of [-1, 1]) B.box(sx * 10.5, Y, Z0, 1.6, 4.5, 1.6, 0, plain(0xd9d5ca, { wall: 3 }));
    // checkpoint: canopy, booths, barriers
    const CZ = 548;
    B.box(0, Y + 5.6, CZ, 46, 0.6, 12, 0, plain(0xb9bcbe, { wall: 5 }));
    for (const sx of [-1, 1]) for (const dz of [-5, 5]) B.box(sx * 22, Y, CZ + dz, 0.6, 5.6, 0.6, 0, plain(0x8e9396, { wall: 5 }));
    B.box(0, Y, CZ, 2.6, 0.4, 12, 0, plain(0x9a9a94));
    for (const sx of [-1, 1]) {
      B.box(sx * 20, Y, CZ, 3.4, 3.0, 3.2, 0, { color: 0xd8d6cc, wall: 2, glass: 1, bayW: 1.7, floorH: 3, winW: 0.9, winH: 0.45 });
      B.box(sx * 20, Y + 3, CZ, 4.2, 0.35, 4, 0, plain(0x55595c));
    }
    for (let k = 0; k < 6; k++) {
      const x = -16.5 + k * 6.6 + (k >= 3 ? 3.3 : 0);
      const closed = x < 0;
      B.box(x - 1.3, Y, CZ + 10, 0.35, 1.2, 0.35, 0, plain(0x45484a));
      if (closed) B.box(x + 1.3, Y + 1.05, CZ + 10, 5.2, 0.18, 0.12, 0, plain(k % 2 ? 0xffffff : 0xd62828));
      else B.box(x - 0.9, Y + 1.0, CZ + 10, 0.12, 4.2, 0.12, 0, plain(0xd62828));
    }
    for (let k = -8; k <= 8; k++) B.cyl(k * 2.2, Y, CZ + 22, 0.18, 0.9, 8, plain(0x35383a));
    for (let k = 0; k < 6; k++) B.box(-14 + k * 5.6 * (k % 2 ? 1 : 1), Y, CZ + 31 + (k % 2) * 2.4, 3.6, 0.9, 0.8, k % 2 ? 0.5 : -0.5, plain(0xaaa89f, { wall: 2 }));
    // visitor centre & gatehouse outside the wall
    B.box(-70, Y, 484, 36, 5.2, 14, 0, { color: 0xd4cfc0, wall: 3, glass: 1, bayW: 3, floorH: 5.2, winW: 0.8, winH: 0.6, store: true });
    B.hip(-70, Y + 5.2, 484, 38, 2.4, 16, 0, { color: 0x666c70, wall: 5, winW: 0 });
    this.wc(-70, 484, 36, 14, 8);
    // service garages (west) and utility sheds
    for (let k = 0; k < 4; k++) {
      B.box(-300 + k * 30, Y, -250, 28, 6.5, 14, 0, { color: 0xc9c5b8, wall: 2, winW: 0 });
      B.box(-300 + k * 30, Y, -242.9, 14, 5, 0.2, 0, plain(0x4b5258, { wall: 5 }));
      B.gable(-300 + k * 30, Y + 6.5, -250, 29, 1.4, 15, 0, { color: 0x6f757a, wall: 5 });
    }
    this.wc(-255, -250, 120, 14, 8);
    B.box(-250, Y, -200, 20, 4, 12, 0, { color: 0xb8b3a4, wall: 5, winW: 0 });
    B.box(310, Y, -250, 26, 5, 16, 0, { color: 0xb8b3a4, wall: 5, winW: 0 });
    // ===================== fountains
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x3d7f95, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.88, envMapIntensity: 1.5 });
    const fountain = (x: number, z: number, R: number) => {
      B.cyl(x, Y, z, R + 0.8, 1.15, 36, plain(STONE, { wall: 3 }));
      B.cyl(x, Y + 1.15, z, R + 0.3, 0.2, 36, plain(0xd6d2c6, { wall: 3 }));
      B.cyl(x, Y, z, R * 0.2, R * 0.38, 20, plain(WHITE), R * 0.14);
      B.cyl(x, Y + R * 0.38, z, R * 0.42, 0.45, 24, plain(STONE, { wall: 3 }), R * 0.2);
      B.cyl(x, Y + R * 0.38 + 0.45, z, R * 0.08, R * 0.2, 12, plain(WHITE), R * 0.06);
      B.cyl(x, Y + R * 0.58 + 0.45, z, R * 0.22, 0.35, 20, plain(STONE, { wall: 3 }), R * 0.1);
      const w = new THREE.Mesh(new THREE.CircleGeometry(R, 36), waterMat);
      w.rotation.x = -Math.PI / 2;
      w.position.set(x, Y + 0.95, z);
      this.group.add(w);
      const jet = new THREE.Mesh(new THREE.ConeGeometry(0.6, R * 0.45, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xdcecf2, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }));
      jet.position.set(x, Y + R * 0.58 + 0.45 + R * 0.22, z);
      this.group.add(jet);
    };
    fountain(0, 74, 15);
    fountain(-150, 160, 8);
    fountain(150, 160, 8);
    fountain(0, 400, 10);
    // reflecting pool
    B.box(0, Y, 250, 20, 0.7, 120, 0, plain(STONE, { wall: 3 }));
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(17.6, 117.6), waterMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, Y + 0.6, 250);
    this.group.add(pool);

    // ===================== ground plates
    const G = {
      lawn: new GroundBuilder(),
      drive: new GroundBuilder(),
      pave: new GroundBuilder(),
      parterre: new GroundBuilder(),
      lot: new GroundBuilder(),
      grav: new GroundBuilder(),
    };
    G.lawn.quad(0, Y + 0.04, 70, X1 - X0 - 4, Z1 - Z0 - 4 + 0, 0, (X1 - X0) / 6, (Z1 - Z0) / 6);
    // axial avenue (outside the circle)
    G.drive.quad(0, Y + 0.1, 330, 22, 380, 0, 1, 380 / 12);
    G.drive.quad(0, Y + 0.1, 538, 38, 40, 0, 1, 40 / 24);
    // forecourt ring road
    const ringR = 44;
    const N = 40;
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      const L = (2 * Math.PI * ringR) / N + 0.6;
      G.drive.quad(Math.cos(a) * ringR, Y + 0.1, 74 + Math.sin(a) * ringR, 14, L, -a, 1, L / 12);
    }
    G.pave.quad(0, Y + 0.09, 38, 56, 52, 0, 56 / 4, 52 / 4, 0xd8d3c6);
    G.pave.quad(0, Y + 0.09, 12, 60, 22, 0, 15, 5, 0xd8d3c6);
    // parterre gardens
    for (const [x, z] of [[-90, 215], [90, 215], [-90, 330], [90, 330], [-130, 60], [130, 60]]) G.parterre.quad(x, Y + 0.08, z, 78, 78, 0, 1, 1);
    // gravel paths
    G.grav.quad(0, Y + 0.07, 480, 8, 80, 0, 1, 10, 0xb8ad94);
    for (const sx of [-1, 1]) {
      G.grav.quad(sx * 210, Y + 0.07, 60, 6, 300, 0, 1, 40, 0xb8ad94);
      G.grav.quad(sx * 150, Y + 0.07, 160, 100, 5, 0, 20, 1, 0xb8ad94);
    }
    // east parking
    G.lot.quad(290, Y + 0.09, 230, 150, 120, 0, 150 / 10.4, 120 / 10.4);
    G.lot.quad(-300, Y + 0.09, -190, 140, 70, 0, 14, 7);
    G.drive.quad(-18, Y + 0.1, -440, 8, 120, 0, 1, 10);
    G.drive.quad(0, Y + 0.1, -330, 14, 100, 0, 1, 8);
    const mkG = (g: GroundBuilder, tex: THREE.Texture | null, extra: THREE.MeshStandardMaterialParameters = {}) => {
      const m = g.build(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, vertexColors: true, ...extra }));
      if (m) this.group.add(m);
    };
    mkG(G.lawn, grassTex(0));
    mkG(G.drive, roadTex('art'));
    mkG(G.pave, pavementTex());
    mkG(G.parterre, parterreTex());
    mkG(G.lot, lotTex(0));
    mkG(G.grav, pavementTex());
    // helipad
    const hp = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 0.2, 40), new THREE.MeshStandardMaterial({ color: 0x4a4d50, roughness: 0.9 }));
    hp.position.set(-260, Y + 0.12, 90);
    hp.receiveShadow = true;
    this.group.add(hp);
    const hl = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ map: signTex(['H'], { bg: '#00000000', fg: '#f0f0f0', w: 256, h: 256, border: '#00000000' }), transparent: true, polygonOffset: true, polygonOffsetFactor: -5 }));
    hl.rotation.x = -Math.PI / 2;
    hl.position.set(-260, Y + 0.25, 90);
    this.group.add(hl);

    // ===================== hedges
    const hedge = (x: number, z: number, w: number, d: number, h = 1.3) => B.box(x, Y, z, w, h, d, 0, plain(0x30572a, { wall: 0 }));
    for (const sx of [-1, 1]) {
      hedge(sx * 13.5, 330, 1.6, 360);
      hedge(sx * 34, 70, 1.6, 10);
    }
    // ===================== lamps along avenue and forecourt
    for (let z = 520; z > 110; z -= 26) for (const sx of [-1, 1]) this.lamps.add(sx * 12, Y + 0.1, z, sx > 0 ? Math.PI : 0);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      this.lamps.add(Math.cos(a) * (ringR + 9), Y + 0.1, 74 + Math.sin(a) * (ringR + 9), Math.atan2(Math.sin(a), -Math.cos(a)));
    }
    for (let x = -40; x <= 40; x += 20) this.lamps.add(x, Y + 0.1, 20, -Math.PI / 2);
    // ===================== flag(s)
    const ft = flagTexture();
    for (const [x, z, y] of [[-70, 28, 24], [70, 28, 24], [-70, 46, 24], [70, 46, 24]]) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.4), new THREE.MeshStandardMaterial({ map: ft, side: THREE.DoubleSide, roughness: 0.8 }));
      f.position.set(x + 3.1, Y + y - 1.9, z);
      this.group.add(f);
      this.flags.push(f);
    }
    const top = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.8), new THREE.MeshStandardMaterial({ map: ft, side: THREE.DoubleSide }));
    top.position.set(2.7, Y + PL + 25 + 12 - 1.6, -30);
    this.group.add(top);
    this.flags.push(top);

    // ===================== vehicles
    const cars = new CarField();
    for (let r = 0; r < 8; r++) for (let c = 0; c < 22; c++) if (rnd() < 0.6) cars.add(225 + c * 6.2, Y + 0.14, 185 + r * 11 + (r % 2 ? 0 : 0), Math.PI / 2 + (rnd() < 0.5 ? 0 : Math.PI), randomCarColor(rnd()), 1);
    for (let c = 0; c < 8; c++) cars.add(-340 + c * 6, Y + 0.14, -190, Math.PI / 2, 0x151515, 1.1);
    for (const x of [-30, -24, 24]) cars.add(x, Y + 0.14, 70 + 52 * 0 + 120, 0, 0x101010, 1.1);
    cars.build(this.group);

    // ===================== trees
    const kit = getTreeKit();
    const broad: any[] = [];
    const conif: any[] = [];
    const T = (x: number, z: number, s: number, conifer = false) => {
      const it = { x, y: Y, z, r: rnd() * 6.28, s: s * (0.85 + rnd() * 0.3), sy: s * (0.9 + rnd() * 0.25), c: 0.85 + rnd() * 0.3 };
      (conifer ? conif : broad).push(it);
    };
    // double rows flanking the avenue
    for (let z = 520; z > 100; z -= 15) for (const sx of [-1, 1]) {
      T(sx * 22, z, 1.0);
      T(sx * 31, z + 7, 1.05);
    }
    // groves, kept clear of paths / parterres
    const clear = (x: number, z: number) => {
      if (Math.abs(x) < 38 && z > -10) return false;
      if (Math.abs(x) < 50 && z > 90 && z < 520) return false;
      for (const [px, pz] of [[-90, 215], [90, 215], [-90, 330], [90, 330], [-130, 60], [130, 60]]) if (Math.abs(x - px) < 46 && Math.abs(z - pz) < 46) return false;
      if (x > 200 && x < 370 && z > 160 && z < 300) return false;
      if (x > -375 && x < -225 && z > -230 && z < -150) return false;
      if (Math.hypot(x + 260, z - 90) < 22) return false;
      if (z < -5 && z > -90 && Math.abs(x) < 190) return false;
      return true;
    };
    for (let k = 0; k < 520; k++) {
      const x = X0 + 12 + rnd() * (X1 - X0 - 24);
      const z = Z0 + 12 + rnd() * (Z1 - Z0 - 24);
      if (!clear(x, z)) continue;
      T(x, z, 0.9 + rnd() * 0.5, rnd() < 0.18);
    }
    for (let k = 0; k < 110; k++) {
      const side = Math.floor(rnd() * 4);
      let x = 0, z = 0;
      if (side === 0) { x = X0 + 6 + rnd() * 8; z = Z0 + rnd() * (Z1 - Z0); }
      else if (side === 1) { x = X1 - 6 - rnd() * 8; z = Z0 + rnd() * (Z1 - Z0); }
      else if (side === 2) { z = Z0 + 6 + rnd() * 8; x = X0 + rnd() * (X1 - X0); }
      else { z = Z1 - 6 - rnd() * 8; x = X0 + rnd() * (X1 - X0); if (Math.abs(x) < 40) continue; }
      T(x, z, 1.2, rnd() < 0.3);
    }
    this.group.add(instancedFrom(kit.broad[0], kit.mat, broad, true));
    this.group.add(instancedFrom(kit.spruce[0], kit.mat, conif, true));

    const mesh = B.build(createFacadeMaterial(true));
    this.group.add(mesh);
    void CarField;
  }

  update(t: number) {
    for (const f of this.flags) f.rotation.y = Math.sin(t * 1.7 + f.position.x) * 0.18;
  }
}
