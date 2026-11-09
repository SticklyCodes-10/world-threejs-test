// Rivers, canal, lake and waterfall.
import * as THREE from 'three';
import { LAKE } from './config';
import { lakeRadius, rivers } from './heightfield';
import { foamTex, glowTex, waterNormalTex } from './textures';

export class WaterSystem {
  group = new THREE.Group();
  riverMat: THREE.MeshStandardMaterial;
  lakeMat: THREE.MeshStandardMaterial;
  foamMat: THREE.MeshBasicMaterial;
  mistMat: THREE.SpriteMaterial;
  fallPos: THREE.Vector3 | null = null;

  constructor(scene: THREE.Scene) {
    const nt = waterNormalTex();
    const nt2 = nt.clone();
    nt2.needsUpdate = true;
    nt2.wrapS = nt2.wrapT = THREE.RepeatWrapping;
    this.riverMat = new THREE.MeshStandardMaterial({
      color: 0x2c5560,
      roughness: 0.06,
      metalness: 0.15,
      normalMap: nt,
      normalScale: new THREE.Vector2(0.7, 0.7),
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
      envMapIntensity: 1.4,
    });
    this.lakeMat = new THREE.MeshStandardMaterial({
      color: 0x1b4553,
      roughness: 0.04,
      metalness: 0.2,
      normalMap: nt2,
      normalScale: new THREE.Vector2(0.45, 0.45),
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      envMapIntensity: 1.6,
    });
    nt2.repeat.set(1, 1);
    this.foamMat = new THREE.MeshBasicMaterial({ map: foamTex(), transparent: true, opacity: 0.92, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true });
    this.mistMat = new THREE.SpriteMaterial({ map: glowTex(), color: 0xe8f0f4, transparent: true, opacity: 0.35, depthWrite: false });

    for (const r of rivers) {
      const pos: number[] = [];
      const uv: number[] = [];
      const idx: number[] = [];
      const fpos: number[] = [];
      const fuv: number[] = [];
      const fidx: number[] = [];
      const hw = r.hw * 1.8 + 3;
      for (let i = 0; i < r.n; i++) {
        const a = Math.max(0, i - 1);
        const b = Math.min(r.n - 1, i + 1);
        let tx = r.x[b] - r.x[a];
        let tz = r.z[b] - r.z[a];
        const tl = Math.hypot(tx, tz) || 1;
        tx /= tl;
        tz /= tl;
        const nx = -tz;
        const nz = tx;
        const y = r.y[i];
        const sc = 1 / 7;
        pos.push(r.x[i] - nx * hw, y, r.z[i] - nz * hw, r.x[i] + nx * hw, y, r.z[i] + nz * hw);
        uv.push(-hw * sc, r.s[i] * sc, hw * sc, r.s[i] * sc);
        if (i > 0) {
          const k = (i - 1) * 2;
          idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      }
      // foam / waterfall strips where the surface is steep
      let fcount = 0;
      for (let i = 0; i < r.n - 1; i++) {
        const ds = Math.hypot(r.x[i + 1] - r.x[i], r.z[i + 1] - r.z[i]);
        const slope = (r.y[i] - r.y[i + 1]) / ds;
        if (slope > 0.22) {
          const w2 = r.hw * 1.15;
          for (const j of [i, i + 1]) {
            const a = Math.max(0, j - 1);
            const b = Math.min(r.n - 1, j + 1);
            let tx = r.x[b] - r.x[a];
            let tz = r.z[b] - r.z[a];
            const tl = Math.hypot(tx, tz) || 1;
            tx /= tl;
            tz /= tl;
            const nx = -tz;
            const nz = tx;
            const y = r.y[j] + 0.25;
            fpos.push(r.x[j] - nx * w2, y, r.z[j] - nz * w2, r.x[j] + nx * w2, y, r.z[j] + nz * w2);
            fuv.push(0, r.s[j] * 0.08, 1, r.s[j] * 0.08);
          }
          const k = fcount * 4;
          fidx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
          fcount++;
          if (!this.fallPos && slope > 0.5) this.fallPos = new THREE.Vector3(r.x[i], r.y[i + 1], r.z[i]);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, this.riverMat);
      m.renderOrder = 5;
      m.receiveShadow = true;
      this.group.add(m);
      if (fcount) {
        const fg = new THREE.BufferGeometry();
        fg.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3));
        fg.setAttribute('uv', new THREE.Float32BufferAttribute(fuv, 2));
        fg.setIndex(fidx);
        const fm = new THREE.Mesh(fg, this.foamMat);
        fm.renderOrder = 6;
        this.group.add(fm);
      }
    }
    // mist at the falls
    if (this.fallPos) {
      for (let i = 0; i < 9; i++) {
        const s = new THREE.Sprite(this.mistMat);
        s.position.set(this.fallPos.x + (Math.random() - 0.5) * 24, this.fallPos.y + 4 + Math.random() * 14, this.fallPos.z + (Math.random() - 0.5) * 24);
        s.scale.setScalar(40 + Math.random() * 40);
        this.group.add(s);
      }
    }
    // lake
    const seg = 128;
    const lp: number[] = [LAKE.x, LAKE.y, LAKE.z];
    const lu: number[] = [0, 0];
    const li: number[] = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const R = lakeRadius(a) * 1.1;
      const x = LAKE.x + Math.cos(a) * R;
      const z = LAKE.z + Math.sin(a) * R;
      lp.push(x, LAKE.y, z);
      lu.push((x - LAKE.x) / 18, (z - LAKE.z) / 18);
      if (i > 0) li.push(0, i + 1, i);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    lg.setAttribute('uv', new THREE.Float32BufferAttribute(lu, 2));
    lg.setIndex(li);
    lg.computeVertexNormals();
    const lm = new THREE.Mesh(lg, this.lakeMat);
    lm.renderOrder = 5;
    this.group.add(lm);
    scene.add(this.group);
  }

  update(dt: number) {
    (this.riverMat.normalMap as THREE.Texture).offset.y -= dt * 0.12;
    const ln = this.lakeMat.normalMap as THREE.Texture;
    ln.offset.x += dt * 0.004;
    ln.offset.y += dt * 0.006;
    (this.foamMat.map as THREE.Texture).offset.y -= dt * 1.4;
  }
}
