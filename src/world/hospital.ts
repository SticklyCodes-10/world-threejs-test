// Ashgrove Memorial Hospital & Research Institute: abandoned, overgrown, ominous.
import * as THREE from 'three';
import { HOSPITAL, SITES } from './config';
import { GeoBuilder, GroundBuilder, createFacadeMaterial, type FStyle } from './facade';
import { CarField, LampField } from './props';
import { mulberry32 } from './noise';
import { fenceTex, glowTex, ivyTex, lotTex, roadTex, signTex } from './textures';
import { getTreeKit, instancedFrom } from './vegetation';
import type { Collider } from './city';

export class HospitalSystem {
  group = new THREE.Group();
  lamps = new LampField();
  colliders: Collider[] = [];
  Y: number;
  flickerMat: THREE.MeshBasicMaterial;
  mist: THREE.Sprite[] = [];

  constructor(scene: THREE.Scene) {
    this.Y = SITES.find((s) => s.name === 'hospital')!.y;
    this.group.position.set(HOSPITAL.x, 0, HOSPITAL.z);
    this.flickerMat = new THREE.MeshBasicMaterial({ map: signTex(['EMERGENCY'], { bg: '#7a1414', fg: '#f3d9d0', w: 512, h: 128, worn: 0.8 }), color: 0x555555 });
    this.build();
    this.lamps.build(this.group);
    scene.add(this.group);
  }

  private wc(x: number, z: number, w: number, d: number, h: number) {
    this.colliders.push({ x: HOSPITAL.x + x, z: HOSPITAL.z + z, hx: w / 2, hz: d / 2, c: 1, s: 0, h });
  }

  private build() {
    const Y = this.Y;
    const B = new GeoBuilder();
    const rnd = mulberry32(666);
    const bx = (cx: number, y0: number, cz: number, w: number, h: number, d: number, yaw: number, st: FStyle) => B.box(cx, Y + y0, cz, w, h, d, yaw, st);
    const plain = (color: number, extra: FStyle = {}): FStyle => ({ color, wall: 2, winW: 0, bayW: 100, floorH: 100, decay: 0.6, ...extra });
    const brick = (decay = 0.5): FStyle => ({ color: 0x86563f, wall: 1, bayW: 3.6, floorH: 4, winW: 0.5, winH: 0.55, glass: 3, decay });
    const conc = (decay = 0.7, color = 0xb0ada1): FStyle => ({ color, wall: 2, bayW: 3.6, floorH: 4, winW: 0.52, winH: 0.55, glass: 3, decay });

    // ---------------------------------------------------------------- main hospital (closed ring around a courtyard)
    bx(0, 0, -5, 124, 21, 30, 0, brick(0.55));
    bx(0, 21, -5, 126, 1.2, 32, 0, plain(0xaaa69a));
    for (const sx of [-1, 1]) {
      bx(sx * 56, 0, -70, 26, 21, 100, 0, conc(0.7));
      bx(sx * 56, 21, -70, 27.6, 1.2, 101.6, 0, plain(0xa09c90));
    }
    bx(0, 0, -128, 138, 17, 16, 0, brick(0.6));
    bx(0, 17, -128, 139, 1.2, 17, 0, plain(0xa09c90));
    // ward tower
    bx(0, 22, -8, 40, 24, 22, 0, conc(0.65, 0xa8a59a));
    bx(0, 46, -8, 41.4, 1.2, 23.4, 0, plain(0x9d9a8f));
    this.wc(0, -5, 124, 30, 22);
    this.wc(-56, -70, 26, 100, 22);
    this.wc(56, -70, 26, 100, 22);
    this.wc(0, -128, 138, 16, 18);
    this.wc(0, -8, 40, 22, 47);
    // roof equipment
    bx(10, 47.2, -10, 10, 6, 10, 0, plain(0x8f8c82));
    bx(-12, 47.2, -4, 7, 3, 12, 0, plain(0x7b7f80, { wall: 5 }));
    for (let k = 0; k < 6; k++) bx(-52 + k * 21, 22.2, -4 + (k % 2) * 3, 6 + rnd() * 3, 2.4 + rnd() * 1.6, 5, 0, plain(0x7e8284, { wall: 5, decay: 0.7 }));
    for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) bx(sx * 56 + (k % 2 ? 4 : -4), 22.2, -30 - k * 20, 7, 3 + rnd() * 2, 6, 0, plain(0x7e8284, { wall: 5 }));
    // tank on tower roof
    for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) bx(-8 + dx * 1.2, 47.2, 8 + dz * 1.2, 0.5, 5, 0.5, 0, plain(0x6b4a38, { wall: 5, decay: 0.9 }));
    B.cyl(-8, Y + 52.2, 8, 4.2, 6.5, 14, { color: 0x75503b, wall: 5, winW: 0, decay: 0.9 });
    B.cone(-8, Y + 58.7, 8, 4.6, 2, 14, { color: 0x6c4a38, wall: 5, winW: 0, decay: 0.9 });
    // satellite dishes (funnel shaped)
    for (const [dx, dz, r] of [[16, 8, 2.6], [-18, 2, 1.8], [21, -12, 1.4]]) {
      B.cyl(dx, Y + 47.2, dz, 0.15, 2.6, 6, { color: 0x8a8d90, wall: 5, winW: 0 });
      B.cyl(dx, Y + 49.8, dz, 0.3, 1.1, 14, { color: 0xc8cacc, wall: 5, winW: 0, decay: 0.3 }, r, false);
    }
    B.cyl(-20, Y + 47.2, -14, 0.25, 22, 6, { color: 0xaaaaaa, wall: 5, winW: 0 });
    // boiler house + chimney
    bx(112, 0, -75, 26, 15, 28, 0, brick(0.7));
    bx(112, 15, -75, 27, 1, 29, 0, plain(0x9a968b));
    B.cyl(104, Y, -88, 3.4, 58, 16, { color: 0x8a4f3c, wall: 1, winW: 0, decay: 0.6 }, 2.4);
    B.cyl(104, Y + 56, -88, 3.0, 2.4, 16, { color: 0xb8b3a6, wall: 2, winW: 0, decay: 0.5 }, 3.2);
    this.wc(112, -75, 26, 28, 16);
    this.wc(104, -88, 7, 7, 58);
    // standalone water tower
    for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) bx(-125 + dx, 0, -140 + dz, 0.8, 24, 0.8, 0, plain(0x6a4a3a, { wall: 5, decay: 0.9 }));
    bx(-125, 12, -140, 9, 0.4, 0.4, 0.78, plain(0x6a4a3a, { wall: 5 }));
    bx(-125, 12, -140, 9, 0.4, 0.4, -0.78, plain(0x6a4a3a, { wall: 5 }));
    B.cyl(-125, Y + 24, -140, 6.5, 9, 18, { color: 0x7a5c47, wall: 5, winW: 0, decay: 0.95 });
    B.cone(-125, Y + 33, -140, 7, 3.5, 18, { color: 0x6a4a3a, wall: 5, winW: 0, decay: 0.9 });
    this.wc(-125, -140, 10, 10, 36);
    // ---------------------------------------------------------------- entrances
    bx(0, 0, 18, 22, 5.2, 11, 0, { color: 0xb5b2a6, wall: 2, glass: 3, decay: 0.7, bayW: 3, floorH: 5.2, winW: 0.85, winH: 0.7, store: true });
    bx(0, 5.2, 18, 24, 0.6, 13, 0, plain(0x9d9a8f));
    for (let i = 0; i < 6; i++) bx(0, 0, 28.5 + (5 - i) * 0.4 - 1.2 + i * 0, 20, (i + 1) * 0.2 - 0.2 + 0.2, 1.0 + (5 - i) * 0.4, 0, plain(0xa8a59a));
    // ambulance entrance canopy (emergency)
    bx(-38, 5.2, 24, 30, 0.7, 16, 0, plain(0xa8a59a));
    for (const [dx, dz] of [[-50, 17], [-26, 17], [-50, 31], [-26, 31]]) bx(dx, 0, dz, 0.9, 5.2, 0.9, 0, plain(0xaaa79b));
    bx(-38, 0, 12, 20, 4.6, 3, 0, { color: 0xb5b2a6, wall: 2, glass: 3, decay: 0.8, bayW: 3.3, floorH: 4.6, winW: 0.85, winH: 0.7, store: true });
    bx(-38, 0, 31, 30, 0.35, 12, 0, plain(0x7b7a74));
    bx(-38, 0, 34, 30, 0.6, 0.6, 0, plain(0xd7a91c, { decay: 0.4 }));
    // ambulance ramp and loading docks (rear service block)
    bx(112, 0, -110, 40, 4.2, 18, 0, { color: 0x9a968b, wall: 2, winW: 0, decay: 0.7, bayW: 100, floorH: 4.2 });
    for (let k = 0; k < 4; k++) bx(97 + k * 10, 0, -100.9, 4.2, 3.6, 0.3, 0, plain(0x46484a, { wall: 5, decay: 0.9 }));
    bx(112, 0, -96, 40, 1.2, 4, 0, plain(0x8a877e));
    bx(112, 4.2, -108, 41, 0.6, 20, 0, plain(0x8a877e));
    this.wc(112, -110, 40, 18, 5);
    // ---------------------------------------------------------------- stairs & fire escapes
    const stairs = (x: number, z: number, y0: number, steps: number, dir: number, w: number, st: FStyle) => {
      for (let i = 0; i < steps; i++) bx(x, y0 + i * 0.3, z + dir * i * 0.34, w, 0.3, 0.34, 0, st);
    };
    for (const sx of [-1, 1]) {
      // external concrete stair tower at the north end of each wing
      bx(sx * 56, 0, -123, 8, 25, 6, 0, conc(0.8, 0x9f9c91));
      for (let f = 0; f < 4; f++) stairs(sx * 56 - 2.4 + (f % 2) * 4.8, f % 2 ? -119.6 : -126, f * 6, 20, f % 2 ? -1 : 1, 1.8, plain(0x8c897f));
    }
    // metal fire escape on west wing, outer face
    for (let f = 1; f <= 4; f++) {
      const y0 = f * 4.4 + 0.2;
      bx(-70.2, y0, -45, 1.8, 0.14, 8, 0, plain(0x6a4f3f, { wall: 5, decay: 0.95 }));
      bx(-71.0, y0 + 0.6, -45, 0.06, 1.0, 8, 0, plain(0x5e4637, { wall: 5, decay: 0.95 }));
      for (let i = 0; i < 14; i++) bx(-70.2, y0 - 4.4 + i * 0.31, -40.5 + i * 0.32, 1.2, 0.08, 0.3, 0, plain(0x6a4f3f, { wall: 5, decay: 0.95 }));
    }
    // ---------------------------------------------------------------- laboratory annex (west), sky-bridge
    bx(-152, 0, -45, 80, 12.5, 34, 0, { color: 0xa4a196, wall: 2, glass: 3, decay: 0.75, bayW: 3.2, floorH: 4.2, winW: 0.9, winH: 0.42, store: false });
    bx(-152, 12.5, -45, 82, 1.1, 36, 0, plain(0x8f8c82));
    bx(-170, 13.6, -45, 16, 4.5, 14, 0, plain(0x8b8d8e, { wall: 5 }));
    for (let k = 0; k < 4; k++) bx(-132 - k * 12, 13.6, -40, 6, 2.4, 6, 0, plain(0x777b7e, { wall: 5, decay: 0.8 }));
    this.wc(-152, -45, 80, 34, 14);
    // containment vessels + piping
    for (let k = 0; k < 3; k++) {
      B.cyl(-170 + k * 18, Y, -78, 6, 15, 18, { color: 0xc6c6c0, wall: 5, winW: 0, decay: 0.8 });
      B.cone(-170 + k * 18, Y + 15, -78, 6.4, 3, 18, { color: 0xb2b2ac, wall: 5, winW: 0, decay: 0.7 });
      this.wc(-170 + k * 18, -78, 12, 12, 18);
    }
    bx(-152, 9, -78, 40, 0.5, 0.5, 0, plain(0x7a4a2a, { wall: 5, decay: 0.9 }));
    bx(-134, 9, -66, 0.5, 0.5, 24, 0, plain(0x7a4a2a, { wall: 5, decay: 0.9 }));
    for (let k = 0; k < 14; k++) B.cyl(-190 + (k % 7) * 1.3, Y, -20 + Math.floor(k / 7) * 1.4, 0.35, 1.5, 6, { color: k % 3 ? 0x6d6f6c : 0x7a8a95, wall: 5, winW: 0, decay: 0.7 });
    // sky-bridge
    bx(-94, 8, -48, 44, 3.6, 4.4, 0, { color: 0xb0ada1, wall: 2, glass: 3, decay: 0.8, bayW: 2.5, floorH: 3.6, winW: 0.9, winH: 0.55 });
    for (const dx of [-108, -82]) bx(dx, 0, -48, 1.8, 8, 1.8, 0, plain(0x9c998e));
    // ---------------------------------------------------------------- research & testing wing (east)
    bx(155, 0, -30, 90, 9.5, 58, 0, { color: 0x8d8b85, wall: 2, glass: 3, decay: 0.85, bayW: 6, floorH: 4.75, winW: 0.08, winH: 0.55 });
    bx(155, 9.5, -30, 92, 1.1, 60, 0, plain(0x7c7a74));
    bx(145, 0, -66, 36, 6, 14, 0, plain(0x827f78));
    for (let k = 0; k < 3; k++) B.cyl(130 + k * 14, Y + 10.6, -20, 0.9, 24, 10, { color: 0x8a8a86, wall: 5, winW: 0, decay: 0.8 });
    B.cyl(185, Y, -62, 9, 8, 22, { color: 0x9a9890, wall: 2, winW: 0, decay: 0.8 }, 6.5);
    B.cyl(185, Y + 8, -62, 6.6, 8, 22, { color: 0x9a9890, wall: 2, winW: 0, decay: 0.8 }, 7);
    this.wc(155, -30, 90, 58, 11);
    this.wc(185, -62, 18, 18, 16);
    // gas bottles, tanks, transformers
    for (let k = 0; k < 10; k++) B.cyl(205 + (k % 5) * 1.0, Y, -5 + Math.floor(k / 5) * 1.1, 0.22, 1.6, 6, { color: k % 2 ? 0x5a7a8a : 0x8a3a2a, wall: 5, winW: 0 });
    bx(110, 0, 2, 6, 3, 4, 0, plain(0x4d5a52, { wall: 5, decay: 0.9 }));
    bx(118, 0, 2, 6, 3, 4, 0, plain(0x4d5a52, { wall: 5, decay: 0.9 }));
    // covered walkway between main block and research wing
    bx(88, 0, -30, 45, 3.4, 3, 0, plain(0x9a978c));
    bx(88, 3.4, -30, 46, 0.4, 4.2, 0, plain(0x7c7a74));
    // ---------------------------------------------------------------- maintenance & auxiliary
    for (let k = 0; k < 3; k++) {
      bx(-165 + k * 22, 0, 85, 20, 6, 16, 0, { color: 0x9b9487, wall: 5, winW: 0, decay: 0.85 });
      if (k !== 1) B.gable(-165 + k * 22, Y + 6, 85, 21, 1.8, 17, 0, { color: 0x75706a, wall: 5, decay: 0.9 });
      else for (let q = 0; q < 6; q++) bx(-165 + k * 22 + (rnd() - 0.5) * 16, 6 + rnd() * 0.5, 85 + (rnd() - 0.5) * 12, 6 + rnd() * 6, 0.25, 0.4, rnd() * 3, plain(0x6a5b4b, { wall: 5 })); // collapsed roof: loose beams
      bx(-165 + k * 22, 0, 93.1, 11, 4.8, 0.25, 0, plain(0x4a4c4d, { wall: 5, decay: 0.95 }));
    }
    this.wc(-143, 85, 64, 16, 8);
    bx(170, 0, 90, 28, 7, 18, 0, { color: 0x86563f, wall: 1, glass: 3, decay: 0.7, bayW: 4, floorH: 3.5, winW: 0.45, winH: 0.55 });
    B.gable(170, Y + 7, 90, 29, 3, 19, 0, { color: 0x5a3a30, wall: 4, decay: 0.8 });
    this.wc(170, 90, 28, 18, 10);
    // morgue, incinerator, chapel (north)
    bx(-30, 0, -185, 40, 6, 24, 0, { color: 0x7e5a47, wall: 1, glass: 3, decay: 0.8, bayW: 8, floorH: 6, winW: 0.1, winH: 0.4 });
    bx(-30, 6, -185, 41, 0.8, 25, 0, plain(0x8f8c82));
    bx(45, 0, -185, 20, 9, 16, 0, { color: 0x6e6254, wall: 1, glass: 3, decay: 0.9, bayW: 6, floorH: 9, winW: 0.1 });
    B.cyl(52, Y, -185, 2.0, 38, 12, { color: 0x73432f, wall: 1, winW: 0, decay: 0.9 }, 1.5);
    bx(-100, 0, -190, 16, 8, 26, 0, { color: 0xb8b2a2, wall: 3, glass: 3, decay: 0.85, bayW: 5, floorH: 8, winW: 0.3, winH: 0.65 });
    B.gable(-100, Y + 8, -190, 26.6, 6, 17, 0, { color: 0x4a443f, wall: 4, decay: 0.9 });
    B.gable(-100, Y + 8, -190, 26.6, 6, 17, 0, { color: 0x4a443f, wall: 4, decay: 0.9 });
    this.wc(-30, -185, 40, 24, 7);
    this.wc(45, -185, 20, 16, 9);
    this.wc(-100, -190, 16, 26, 14);
    // guard house at gate
    bx(-22, 0, 322, 5, 3.4, 6, 0, { color: 0xa9a699, wall: 2, glass: 3, decay: 0.8, bayW: 2.5, floorH: 3.4, winW: 0.8, winH: 0.5 });
    bx(-22, 3.4, 322, 6, 0.3, 7, 0, plain(0x6c6a62));
    for (const sx of [-1, 1]) bx(sx * 8, 0, 330, 1.4, 4.4, 1.4, 0, plain(0x9d998d));
    bx(0, 4.2, 330, 18, 0.5, 1.2, 0, plain(0x8a877e));
    // ---------------------------------------------------------------- signs
    const addSign = (lines: string[], x: number, y: number, z: number, w: number, h: number, rotY: number, opts: any = {}) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: signTex(lines, { w: 512, h: Math.round(512 * (h / w)), ...opts }), side: THREE.DoubleSide, roughness: 0.8 }));
      m.position.set(x, Y + y, z);
      m.rotation.y = rotY;
      this.group.add(m);
    };
    addSign(['ASHGROVE MEMORIAL', 'HOSPITAL & RESEARCH INSTITUTE'], 0, 18.5, 10.7, 34, 3.4, 0, { bg: '#3d4a52', fg: '#cbc7b8', worn: 1 });
    const em = new THREE.Mesh(new THREE.PlaneGeometry(16, 3.4), this.flickerMat);
    em.position.set(-38, Y + 7.6, 32.4);
    this.group.add(em);
    addSign(['RESEARCH ANNEX', 'LEVEL 4 CONTAINMENT'], -152, 11, -27.6, 22, 3, 0, { bg: '#26303a', fg: '#c8c5b5', worn: 1 });
    addSign(['BIOHAZARD', 'AUTHORIZED PERSONNEL ONLY'], -152, 3.2, -27.6, 11, 2.6, 0, { bg: '#d7a91c', fg: '#1a1a18', w: 512, h: 128, worn: 0.8 });
    addSign(['NO TRESPASSING', 'PROPERTY OF STATE HEALTH DEPT'], 0, 2.4, 331, 8, 2.2, 0, { bg: '#c9c9c0', fg: '#8b1a1a', worn: 1.4 });
    addSign(['NO ENTRY'], 155, 4, 0.1, 10, 2, 0, { bg: '#7a1414', fg: '#e8e0d4', worn: 1 });
    addSign(['VISITOR PARKING'], -90, 2.4, 60, 6, 1.6, 0.3, { bg: '#2a4a6a', fg: '#d8d8d0', worn: 1.3 });
    // ---------------------------------------------------------------- perimeter fence (chain-link, damaged)
    const chain = fenceTex('chain');
    const X0 = -300, X1 = 300, Z0 = -260, Z1 = 335;
    const fenceSeg = (ax: number, az: number, bx2: number, bz2: number) => {
      const len = Math.hypot(bx2 - ax, bz2 - az);
      const yaw = Math.atan2(-(bz2 - az), bx2 - ax);
      const t = chain.clone();
      t.needsUpdate = true;
      t.repeat.set(len / 2.5, 1);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.8), new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.7, metalness: 0.5, color: 0xa09a8c }));
      m.position.set((ax + bx2) / 2, Y + 1.4, (az + bz2) / 2);
      m.rotation.y = yaw;
      m.rotation.z = (rnd() - 0.5) * 0.12;
      this.group.add(m);
      for (let k = 0; k <= Math.round(len / 12); k++) {
        const tt = k / Math.max(1, Math.round(len / 12));
        const lean = rnd() < 0.2 ? (rnd() - 0.5) * 0.4 : 0;
        const px = ax + (bx2 - ax) * tt, pz = az + (bz2 - az) * tt;
        B.cyl(px + lean * 0.5, Y, pz, 0.07, 3.1, 5, { color: 0x6f6a5f, wall: 5, winW: 0, decay: 0.9 });
      }
    };
    const side = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      let t = 0;
      while (t < len - 1) {
        const seg = Math.min(len - t, 20 + rnd() * 40);
        if (rnd() < 0.82) fenceSeg(x0 + ((x1 - x0) * t) / len, z0 + ((z1 - z0) * t) / len, x0 + ((x1 - x0) * (t + seg)) / len, z0 + ((z1 - z0) * (t + seg)) / len);
        t += seg + (rnd() < 0.18 ? 8 : 0);
      }
    };
    side(X0, Z0, X1, Z0);
    side(X0, Z0, X0, Z1);
    side(X1, Z0, X1, Z1);
    side(X0, Z1, -12, Z1);
    side(12, Z1, X1, Z1);
    const gateLeaf = (sx: number, ang: number) => {
      const t = chain.clone();
      t.needsUpdate = true;
      t.repeat.set(4, 1);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.2), new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.4, side: THREE.DoubleSide, color: 0x8f8a7c, metalness: 0.5 }));
      m.position.set(sx * 8, Y + 1.7, Z1 + sx * 0);
      m.rotation.y = sx * ang;
      this.group.add(m);
    };
    gateLeaf(1, 0.9);
    gateLeaf(-1, 0.25);

    // ---------------------------------------------------------------- ground: cracked lots, roads, courtyard
    const asphalt = new GroundBuilder();
    const lotG = new GroundBuilder();
    const dirt = new GroundBuilder();
    lotG.quad(0, Y + 0.08, 100, 300, 120, 0, 30, 12);
    lotG.quad(-120, Y + 0.08, 20, 90, 40, 0, 9, 4);
    asphalt.quad(0, Y + 0.1, 245, 12, 175, 0, 1, 175 / 12);
    asphalt.quad(0, Y + 0.1, 330, 18, 14, 0, 1, 1);
    for (const sx of [-1, 1]) asphalt.quad(sx * 218, Y + 0.1, -10, 9, 380, 0, 1, 380 / 12);
    asphalt.quad(0, Y + 0.1, -200, 440, 9, 0, 440 / 12, 1);
    asphalt.quad(-30, Y + 0.1, -45, 100, 9, 0, 8, 1);
    asphalt.quad(120, Y + 0.1, -30, 9, 100, 0, 1, 8);
    asphalt.quad(-38, Y + 0.1, 40, 36, 14, 0, 3, 1);
    dirt.quad(0, Y + 0.06, -70, 80, 90, 0, 8, 9, 0x6b6a3a); // overgrown courtyard
    const mat = (g: GroundBuilder, tex: THREE.Texture, c = 0xffffff) => {
      const m = g.build(new THREE.MeshStandardMaterial({ map: tex, color: c, roughness: 0.97, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
      if (m) this.group.add(m);
    };
    mat(lotG, lotTex(1));
    mat(asphalt, roadTex('rural'));
    mat(dirt, roadTex('dirt'), 0xa09f6a);
    // courtyard broken fountain
    B.cyl(0, Y, -70, 7, 1.0, 20, { color: 0xa9a699, wall: 3, winW: 0, decay: 0.8 });
    B.cyl(0, Y, -70, 1.3, 3.4, 10, { color: 0x9a978a, wall: 3, winW: 0, decay: 0.8 }, 0.9);
    const pond = new THREE.Mesh(new THREE.CircleGeometry(6.4, 20), new THREE.MeshStandardMaterial({ color: 0x2e3a22, roughness: 0.2, metalness: 0.1 }));
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(0, Y + 0.8, -70);
    this.group.add(pond);

    // ---------------------------------------------------------------- abandoned cars, rubble, drums
    const cars = new CarField();
    const rustCols = [0x5a4a3a, 0x6b6a5c, 0x4d3b34, 0x59606a, 0x6a5a3a, 0x474a46];
    for (let k = 0; k < 26; k++) {
      const x = -120 + rnd() * 240, z = 55 + rnd() * 90;
      cars.add(x, Y + 0.12, z, rnd() < 0.8 ? Math.PI / 2 + (rnd() - 0.5) * 0.3 : rnd() * 6, rustCols[k % rustCols.length], 1);
    }
    cars.add(-38, Y + 0.14, 26, 0.2, 0xcfcfc8, 1.35);
    cars.add(-28, Y + 0.14, 26, 0.1, 0xcfcfc8, 1.35);
    cars.build(this.group, true);
    for (let k = 0; k < 40; k++) {
      const x = (rnd() - 0.5) * 360, z = -150 + rnd() * 300;
      if (Math.abs(x) < 60 && z < 20 && z > -130) continue;
      B.cyl(x, Y, z, 0.3, 0.9, 7, { color: pick3(rnd, [0x6a4a2a, 0x3a4a5a, 0x5a5a4a]), wall: 5, winW: 0, decay: 0.9 });
    }

    // ---------------------------------------------------------------- old street lamps (dead)
    for (let z = 320; z > 60; z -= 34) for (const sx of [-1, 1]) if (rnd() < 0.8) this.lamps.add(sx * 11, Y + 0.1, z, sx > 0 ? Math.PI : 0);
    for (let x = -180; x <= 180; x += 45) this.lamps.add(x, Y + 0.1, 48, -Math.PI / 2);

    // ---------------------------------------------------------------- ivy
    const ivyMat = new THREE.MeshStandardMaterial({ map: ivyTex(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 });
    const ivy = (x: number, z: number, y0: number, w: number, h: number, rotY: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), ivyMat);
      m.position.set(x, Y + y0 + h / 2, z);
      m.rotation.y = rotY;
      this.group.add(m);
    };
    for (let k = 0; k < 16; k++) ivy(-69.95, -110 + k * 6, 0, 5 + rnd() * 4, 7 + rnd() * 14, Math.PI / 2);
    for (let k = 0; k < 12; k++) ivy(69.95, -110 + k * 8, 0, 5 + rnd() * 4, 6 + rnd() * 12, -Math.PI / 2);
    for (let k = 0; k < 10; k++) ivy(-60 + k * 13, 10.2, 0, 6, 5 + rnd() * 12, 0);
    for (let k = 0; k < 8; k++) ivy(-192.1, -60 + k * 6, 0, 5, 4 + rnd() * 7, Math.PI / 2);
    for (let k = 0; k < 8; k++) ivy(-100 + k * 11, -136.1, 0, 7, 6 + rnd() * 8, 0);

    // ---------------------------------------------------------------- vegetation: bushes, dead trees, overgrowth
    const kit = getTreeKit();
    const bushes: any[] = [];
    const trees: any[] = [];
    const dead: any[] = [];
    for (let k = 0; k < 520; k++) {
      let x = (rnd() - 0.5) * 520, z = -240 + rnd() * 560;
      if (Math.abs(x) < 130 && z < 15 && z > -125 && rnd() < 0.5) {
        x = (rnd() - 0.5) * 80;
        z = -115 + rnd() * 90;
      }
      // keep road clear
      if (Math.abs(x) < 6 && z > 60) continue;
      const near = z > 40 && z < 160 && Math.abs(x) < 150; // growing through cracks in the lot
      if (!near && rnd() < 0.3) continue;
      bushes.push({ x, y: Y + 0.05, z, r: rnd() * 6, s: 0.5 + rnd() * 1.4, sy: 0.5 + rnd() * 1.0, c: 0.6 + rnd() * 0.5 });
    }
    for (let k = 0; k < 150; k++) {
      let x = (rnd() - 0.5) * 560, z = -250 + rnd() * 580;
      const inBuilt = (Math.abs(x) < 72 && z > -138 && z < 18) || (x > -195 && x < -110 && z > -65 && z < -25) || (x > 110 && x < 200 && z > -65 && z < 5) || (z > 35 && z < 160 && Math.abs(x) < 130 && rnd() < 0.8) || (Math.abs(x) < 8 && z > 60);
      if (inBuilt && !(Math.abs(x) < 38 && z < -30 && z > -120)) continue;
      if (rnd() < 0.2) {
        x = (rnd() - 0.5) * 70;
        z = -110 + rnd() * 70;
      }
      const it = { x, y: Y - 0.2, z, r: rnd() * 6, s: 0.8 + rnd() * 0.9, sy: 0.8 + rnd() * 0.9, c: rnd() < 0.3 ? 0.35 : 0.7 + rnd() * 0.3 };
      (rnd() < 0.25 ? dead : trees).push(it);
    }
    this.group.add(instancedFrom(kit.bush, kit.mat, bushes, false));
    this.group.add(instancedFrom(kit.broad[0], kit.mat, trees, true));
    this.group.add(instancedFrom(kit.spruce[0], kit.mat, dead.map((d) => ({ ...d, c: 0.3 })), true));

    // ---------------------------------------------------------------- ground mist
    const mm = new THREE.SpriteMaterial({ map: glowTex(), color: 0xaab6b2, transparent: true, opacity: 0.16, depthWrite: false });
    for (let k = 0; k < 26; k++) {
      const s = new THREE.Sprite(mm);
      s.position.set((rnd() - 0.5) * 420, Y + 3 + rnd() * 4, -160 + rnd() * 420);
      s.scale.setScalar(70 + rnd() * 90);
      s.scale.y *= 0.35;
      this.group.add(s);
      this.mist.push(s);
    }
    this.group.add(B.build(createFacadeMaterial(true)));
  }

  update(t: number, night: number) {
    const f = night > 0.35 ? 0.15 + Math.max(0, Math.sin(t * 23) * Math.sin(t * 7.3)) * 0.85 * (Math.sin(t * 1.3) > -0.3 ? 1 : 0.1) : 0.33;
    this.flickerMat.color.setRGB(f, f * 0.8, f * 0.75);
  }
}

function pick3<T>(rnd: () => number, a: T[]) {
  return a[Math.floor(rnd() * a.length) % a.length];
}
