// Shared instanced props: street lamps (with night glow), parked cars, simple mesh helpers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { glowTex } from './textures';

export const nightState = { value: 0 };
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);

export function colorize(g: THREE.BufferGeometry, hex: number) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
export function merged(parts: THREE.BufferGeometry[]) {
  const ps = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  for (const p of ps) {
    p.deleteAttribute('uv');
  }
  return mergeGeometries(ps)!;
}

export class LampField {
  mats: number[] = [];
  pools: number[] = [];
  n = 0;
  poleMesh: THREE.InstancedMesh | null = null;
  headMesh: THREE.InstancedMesh | null = null;
  poolMesh: THREE.InstancedMesh | null = null;
  headMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, emissive: new THREE.Color(1.0, 0.72, 0.4), emissiveIntensity: 0, roughness: 0.6 });
  poolMat = new THREE.MeshBasicMaterial({
    map: glowTex(),
    color: 0xffb060,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    fog: true,
  });

  /** yaw: direction the lamp arm points (towards the road) */
  add(x: number, y: number, z: number, yaw: number) {
    _q.setFromAxisAngle(_up, yaw);
    _m.compose(_p.set(x, y, z), _q, _s);
    this.mats.push(..._m.elements);
    // pool sits below the lamp head, 2.3 m out along the arm
    this.pools.push(x + Math.cos(yaw) * 2.3, y + 0.2, z - Math.sin(yaw) * 2.3);
    this.n++;
  }

  build(group: THREE.Group) {
    if (!this.n) return;
    const pole = merged([
      colorize(new THREE.CylinderGeometry(0.09, 0.15, 9, 6).translate(0, 4.5, 0), 0x6b7075),
      colorize(new THREE.BoxGeometry(2.5, 0.12, 0.12).translate(1.25, 9, 0), 0x6b7075),
      colorize(new THREE.CylinderGeometry(0.25, 0.3, 0.6, 6).translate(0, 0.3, 0), 0x55595d),
    ]);
    const head = new THREE.BoxGeometry(0.95, 0.14, 0.42).translate(2.35, 8.93, 0);
    const polemat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.5 });
    this.poleMesh = new THREE.InstancedMesh(pole, polemat, this.n);
    this.headMesh = new THREE.InstancedMesh(head, this.headMat, this.n);
    const arr = new Float32Array(this.mats);
    this.poleMesh.instanceMatrix.set(arr);
    this.headMesh.instanceMatrix.set(arr);
    this.poleMesh.castShadow = true;
    this.poleMesh.computeBoundingSphere();
    this.headMesh.computeBoundingSphere();
    group.add(this.poleMesh, this.headMesh);
    const pg = new THREE.PlaneGeometry(16, 16);
    pg.rotateX(-Math.PI / 2);
    this.poolMesh = new THREE.InstancedMesh(pg, this.poolMat, this.n);
    for (let i = 0; i < this.n; i++) {
      _m.makeTranslation(this.pools[i * 3], this.pools[i * 3 + 1], this.pools[i * 3 + 2]);
      this.poolMesh.setMatrixAt(i, _m);
    }
    this.poolMesh.computeBoundingSphere();
    this.poolMesh.renderOrder = 4;
    group.add(this.poolMesh);
  }

  update(night: number) {
    this.headMat.emissiveIntensity = night * 6;
    this.poolMat.opacity = night * 0.5;
    if (this.poolMesh) this.poolMesh.visible = night > 0.03;
  }
}

export function makeCarGeometry() {
  const body = colorize(new THREE.BoxGeometry(4.4, 0.62, 1.8).translate(0, 0.62, 0), 0xffffff);
  const cabin = colorize(new THREE.BoxGeometry(2.3, 0.55, 1.62).translate(-0.2, 1.18, 0), 0x222a30);
  const roof = colorize(new THREE.BoxGeometry(1.9, 0.08, 1.5).translate(-0.2, 1.48, 0), 0xffffff);
  const hood = colorize(new THREE.BoxGeometry(1.1, 0.12, 1.7).translate(1.4, 0.95, 0), 0xffffff);
  const wheels = [
    [1.3, 0.32, 0.88],
    [1.3, 0.32, -0.88],
    [-1.3, 0.32, 0.88],
    [-1.3, 0.32, -0.88],
  ].map((p) => colorize(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 8).rotateX(Math.PI / 2).translate(p[0], p[1], p[2]), 0x101010));
  return merged([body, cabin, roof, hood, ...wheels]);
}

const CAR_COLORS = [0xd8d8d8, 0x1b1b1d, 0x8a8d91, 0x9a1c1c, 0x1d3f7a, 0xc9c3b0, 0x2f5a3d, 0x7a5a3a, 0xe0e0e2, 0x464a50];
export function randomCarColor(r: number) {
  return CAR_COLORS[Math.floor(r * CAR_COLORS.length) % CAR_COLORS.length];
}

export class CarField {
  items: { x: number; y: number; z: number; yaw: number; color: number; s: number }[] = [];
  add(x: number, y: number, z: number, yaw: number, color: number, s = 1) {
    this.items.push({ x, y, z, yaw, color, s });
  }
  build(group: THREE.Group, rusty = false) {
    if (!this.items.length) return null;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: rusty ? 0.3 : 0.55, roughness: rusty ? 0.85 : 0.32 });
    const im = new THREE.InstancedMesh(makeCarGeometry(), mat, this.items.length);
    const c = new THREE.Color();
    this.items.forEach((it, i) => {
      _q.setFromAxisAngle(_up, it.yaw);
      _m.compose(_p.set(it.x, it.y, it.z), _q, _s.set(it.s, it.s, it.s));
      im.setMatrixAt(i, _m);
      c.setHex(it.color);
      im.setColorAt(i, c);
    });
    _s.set(1, 1, 1);
    im.castShadow = true;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    group.add(im);
    return im;
  }
}
