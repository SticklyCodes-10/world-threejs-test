// Remote infrastructure: wind farm, relay station, high-voltage power line.
import * as THREE from 'three';
import { RELAY, SITES } from './config';
import { GeoBuilder, createFacadeMaterial, type FStyle } from './facade';
import { height, samplePath } from './heightfield';
import { merged, colorize } from './props';
import { fenceTex } from './textures';
import { mulberry32 } from './noise';

export class InfrastructureSystem {
  group = new THREE.Group();
  rotors: THREE.Group[] = [];

  constructor(scene: THREE.Scene) {
    this.windFarm();
    this.relay();
    this.powerLine();
    scene.add(this.group);
  }

  private windFarm() {
    const rnd = mulberry32(31);
    const white = new THREE.MeshStandardMaterial({ color: 0xe9ebec, roughness: 0.45, metalness: 0.1 });
    const tower = new THREE.CylinderGeometry(1.3, 2.3, 88, 14).translate(0, 44, 0);
    const nacelle = new THREE.BoxGeometry(9, 3.4, 3.6).translate(1.5, 89.5, 0);
    const hub = new THREE.SphereGeometry(1.7, 10, 8).translate(-3.2, 89.5, 0);
    const blade = new THREE.BoxGeometry(0.5, 40, 2.2).translate(0, 21, 0);
    const bladeShaped = colorize(blade, 0xffffff);
    void bladeShaped;
    const pts: number[][] = [];
    for (let k = 0; k < 16; k++) {
      const t = k / 15;
      pts.push([-3500 + t * 1100 + (rnd() - 0.5) * 120, -1900 - t * 1000 + (rnd() - 0.5) * 120]);
    }
    for (const [x, z] of pts) {
      const y = height(x, z);
      const g = new THREE.Group();
      g.position.set(x, y - 0.5, z);
      g.rotation.y = 0.6 + (rnd() - 0.5) * 0.2;
      const t = new THREE.Mesh(tower, white);
      t.castShadow = true;
      g.add(t, new THREE.Mesh(nacelle, white), new THREE.Mesh(hub, white));
      const rotor = new THREE.Group();
      rotor.position.set(-3.5, 89.5, 0);
      for (let b = 0; b < 3; b++) {
        const m = new THREE.Mesh(blade, white);
        m.rotation.x = (b / 3) * Math.PI * 2;
        const holder = new THREE.Group();
        holder.rotation.x = (b / 3) * Math.PI * 2;
        const bm = new THREE.Mesh(blade, white);
        holder.add(bm);
        rotor.add(holder);
        void m;
      }
      rotor.rotation.x = rnd() * 6;
      rotor.rotation.order = 'XYZ';
      // rotor spins about the nacelle axis (local x); blades extend along local y
      g.add(rotor);
      this.rotors.push(rotor);
      this.group.add(g);
    }
  }

  private relay() {
    const site = SITES.find((s) => s.name === 'relay')!;
    const Y = site.y;
    const B = new GeoBuilder();
    const plain = (color: number, extra: FStyle = {}): FStyle => ({ color, wall: 2, winW: 0, bayW: 100, floorH: 100, decay: 0.2, ...extra });
    const cx = RELAY.x, cz = RELAY.z;
    B.box(cx + 18, Y, cz + 6, 16, 4, 9, 0, { color: 0xb8b4a8, wall: 2, bayW: 4, floorH: 4, winW: 0.3, winH: 0.4, glass: 0, decay: 0.2 });
    B.gable(cx + 18, Y + 4, cz + 6, 17, 1.6, 10, 0, { color: 0x5a5e62, wall: 5 });
    B.box(cx - 14, Y, cz + 10, 10, 3, 6, 0, plain(0xa8a79d));
    B.cyl(cx + 30, Y, cz - 8, 3, 4, 12, { color: 0xc0c3c4, wall: 5, winW: 0 });
    // lattice mast approximated by tapered tubes and platforms
    for (const [mx, mz, h] of [[cx, cz, 64], [cx - 24, cz - 12, 42]]) {
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.78;
        const r0 = 3.2 * (h / 64);
        B.cyl(mx + Math.cos(a) * r0, Y, mz + Math.sin(a) * r0, 0.18, h, 6, { color: 0xc23a2a, wall: 5, winW: 0, decay: 0.1 }, 0.1);
      }
      for (let k = 1; k < 8; k++) {
        const y = (h / 8) * k;
        const r = (3.2 * (h / 64)) * (1 - y / h) + 0.3;
        B.box(mx, Y + y, mz, r * 2.4, 0.2, r * 2.4, 0, plain(k % 2 ? 0xe8e8e8 : 0xc23a2a, { wall: 5 }));
      }
      B.cyl(mx, Y + h, mz, 0.15, 8, 6, { color: 0xffffff, wall: 5, winW: 0 });
      B.cyl(mx + 2, Y + h * 0.78, mz, 0.25, 1.6, 12, { color: 0xdedede, wall: 5, winW: 0 }, 1.6, false);
    }
    // solar array
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) B.box(cx - 20 + i * 5, Y + 0.8, cz + 20 + j * 4, 4.6, 0.12, 3, 0, { color: 0x1d2c4a, wall: 0, winW: 0, bayW: 100, floorH: 100, glass: 0 });
    this.group.add(B.build(createFacadeMaterial(true)));
    // fence
    const ft = fenceTex('chain').clone();
    ft.needsUpdate = true;
    ft.repeat.set(12, 1);
    const fm = new THREE.MeshStandardMaterial({ map: ft, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.6 });
    for (const [x, z, w, rot] of [[cx, cz - 35, 70, 0], [cx, cz + 35, 70, 0], [cx - 35, cz, 70, Math.PI / 2], [cx + 35, cz, 70, Math.PI / 2]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.4), fm);
      m.position.set(x, Y + 1.2, z);
      m.rotation.y = rot;
      this.group.add(m);
    }
  }

  private powerLine() {
    const sm = samplePath([[2100, -300], [2600, -1250], [3000, -2000], [3480, -2650], [3680, -2900]], 190, false);
    const legGeo = merged([
      colorize(new THREE.CylinderGeometry(0.35, 1.9, 38, 4).translate(0, 19, 0).rotateY(Math.PI / 4), 0x8b9094),
      colorize(new THREE.BoxGeometry(0.5, 0.5, 15).translate(0, 36, 0), 0x8b9094),
      colorize(new THREE.BoxGeometry(0.5, 0.5, 12).translate(0, 31, 0), 0x8b9094),
      colorize(new THREE.BoxGeometry(0.5, 0.5, 9).translate(0, 26, 0), 0x8b9094),
    ]);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.5 });
    const n = sm.x.length;
    const im = new THREE.InstancedMesh(legGeo, mat, n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const tops: { x: number; y: number; z: number; yaw: number }[] = [];
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      const yaw = Math.atan2(-(sm.z[b] - sm.z[a]), sm.x[b] - sm.x[a]);
      const y = height(sm.x[i], sm.z[i]);
      // cross arms lie along local z; line direction is local x => rotate +90deg
      q.setFromAxisAngle(up, yaw);
      m.compose(new THREE.Vector3(sm.x[i], y - 0.5, sm.z[i]), q, new THREE.Vector3(1, 1, 1));
      im.setMatrixAt(i, m);
      tops.push({ x: sm.x[i], y, z: sm.z[i], yaw });
    }
    im.castShadow = true;
    im.computeBoundingSphere();
    this.group.add(im);
    const verts: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      for (const [h, arm] of [[36, 7.5], [31, 6], [26, 4.5]]) {
        for (const sgn of [-1, 1]) {
          const A = tops[i], Bp = tops[i + 1];
          const ax = A.x + Math.sin(A.yaw) * arm * sgn, az = A.z + Math.cos(A.yaw) * arm * sgn;
          const bx = Bp.x + Math.sin(Bp.yaw) * arm * sgn, bz = Bp.z + Math.cos(Bp.yaw) * arm * sgn;
          const ay = A.y + h, by = Bp.y + h;
          const S = 14;
          for (let k = 0; k < S; k++) {
            const t0 = k / S, t1 = (k + 1) / S;
            const sag = (t: number) => 9 * 4 * t * (1 - t);
            verts.push(ax + (bx - ax) * t0, ay + (by - ay) * t0 - sag(t0), az + (bz - az) * t0, ax + (bx - ax) * t1, ay + (by - ay) * t1 - sag(t1), az + (bz - az) * t1);
          }
        }
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    this.group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x1a1c1e })));
  }

  update(t: number) {
    this.rotors.forEach((r, i) => (r.rotation.x = t * (0.8 + (i % 3) * 0.05) + i));
  }
}
