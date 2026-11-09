// Road network meshes: asphalt ribbons, rails, bridges, tunnels, guard rails, lamps, gantries.
import * as THREE from 'three';
import { LampField } from './props';
import { ROAD_WIDTH } from './config';
import { heightNoRoad, roads, type RoadData } from './heightfield';
import { noiseTex, roadTex, signTex } from './textures';

const TILE: Record<string, number> = { hwy: 24, art: 12, avenue: 24, sec: 12, rural: 12, mtn: 12, dirt: 8, ramp: 12, rail: 4.8 };
const ROAD_DROP = 0.06;

class Strip {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  n = 0;
  private c = new THREE.Color();
  quadDir(p0: number[], p1: number[], p2: number[], p3: number[], dx: number, dy: number, dz: number, color: number, shade = 1) {
    let a = [p0, p1, p2, p3];
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * dx + ny * dy + nz * dz < 0) {
      a = [p0, p3, p2, p1];
      nx = -nx; ny = -ny; nz = -nz;
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    this.c.setHex(color).multiplyScalar(shade);
    const b = this.n;
    for (const p of a) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx / l, ny / l, nz / l);
      this.col.push(this.c.r, this.c.g, this.c.b);
      this.n++;
    }
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  box(cx: number, y0: number, cz: number, w: number, h: number, d: number, yaw: number, color: number) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const P = (x: number, y: number, z: number) => [cx + x * c + z * s, y0 + y, cz - x * s + z * c];
    const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
    const q = (a: number[], b: number[], cc: number[], dd: number[], nx: number, ny: number, nz: number, sh: number) =>
      this.quadDir(a, b, cc, dd, nx * c + nz * s, ny, -nx * s + nz * c, color, sh);
    q(P(x0, 0, z1), P(x1, 0, z1), P(x1, h, z1), P(x0, h, z1), 0, 0, 1, 0.9);
    q(P(x0, 0, z0), P(x1, 0, z0), P(x1, h, z0), P(x0, h, z0), 0, 0, -1, 0.85);
    q(P(x1, 0, z0), P(x1, 0, z1), P(x1, h, z1), P(x1, h, z0), 1, 0, 0, 0.95);
    q(P(x0, 0, z0), P(x0, 0, z1), P(x0, h, z1), P(x0, h, z0), -1, 0, 0, 0.8);
    q(P(x0, h, z0), P(x1, h, z0), P(x1, h, z1), P(x0, h, z1), 0, 1, 0, 1);
  }
  build(mat: THREE.Material, cast = true) {
    if (!this.n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    return m;
  }
}

interface Frame {
  nx: number[];
  nz: number[];
  tx: number[];
  tz: number[];
}
function frames(r: RoadData): Frame {
  const f: Frame = { nx: [], nz: [], tx: [], tz: [] };
  for (let i = 0; i < r.n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(r.n - 1, i + 1);
    let tx = r.x[b] - r.x[a];
    let tz = r.z[b] - r.z[a];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    f.tx.push(tx);
    f.tz.push(tz);
    f.nx.push(-tz);
    f.nz.push(tx);
  }
  return f;
}

export class RoadSystem {
  group = new THREE.Group();
  lamps = new LampField();
  portals: { x: number; z: number; y: number }[] = [];
  bridges: { x: number; z: number; y: number }[] = [];

  constructor(scene: THREE.Scene) {
    const concrete = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, map: null });
    const tunnelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
    void noiseTex;
    const concS = new Strip();
    const tunS = new Strip();
    const railS = new Strip();
    const postList: number[][] = [];
    const gantrySpots: { x: number; y: number; z: number; yaw: number; hw: number; txt: string[] }[] = [];
    const roadMats: Record<string, THREE.MeshStandardMaterial> = {};
    const matFor = (type: string) => {
      if (!roadMats[type]) {
        roadMats[type] = new THREE.MeshStandardMaterial({
          map: roadTex(type),
          roughness: type === 'rail' || type === 'dirt' ? 0.98 : 0.88,
          metalness: 0,
          polygonOffset: true,
          polygonOffsetFactor: type === 'rail' ? -1 : -3,
          polygonOffsetUnits: type === 'rail' ? -1 : -3,
        });
      }
      return roadMats[type];
    };

    const rib = (S: Strip, r: RoadData, F: Frame, i0: number, i1: number, off: number, wd: number, yb: number, yt: number, color: number, dyBase = -ROAD_DROP) => {
      for (let i = i0; i < i1; i++) {
        const P = (k: number, o: number, yy: number) => [r.x[k] + F.nx[k] * o, r.y[k] + dyBase + yy, r.z[k] + F.nz[k] * o];
        const a0 = off - wd / 2, b0 = off + wd / 2;
        const mx = F.nx[i] + F.nx[i + 1], mz = F.nz[i] + F.nz[i + 1];
        const ml = Math.hypot(mx, mz) || 1;
        S.quadDir(P(i, a0, yt), P(i + 1, a0, yt), P(i + 1, b0, yt), P(i, b0, yt), 0, 1, 0, color, 1);
        S.quadDir(P(i, a0, yb), P(i + 1, a0, yb), P(i + 1, b0, yb), P(i, b0, yb), 0, -1, 0, color, 0.5);
        S.quadDir(P(i, a0, yb), P(i + 1, a0, yb), P(i + 1, a0, yt), P(i, a0, yt), -mx / ml, 0, -mz / ml, color, 0.85);
        S.quadDir(P(i, b0, yb), P(i + 1, b0, yb), P(i + 1, b0, yt), P(i, b0, yt), mx / ml, 0, mz / ml, color, 0.9);
      }
    };

    const runs = (flag: (i: number) => boolean, n: number, minLen = 2) => {
      const out: [number, number][] = [];
      for (let i = 0; i < n; ) {
        if (!flag(i)) {
          i++;
          continue;
        }
        let j = i;
        while (j < n && flag(j)) j++;
        if (j - 1 - i >= minLen - 1) out.push([i, j - 1]);
        i = j;
      }
      return out;
    };

    for (const r of roads) {
      const F = frames(r);
      const { n, hw, type } = r;
      const spacing = r.s[1] - r.s[0];
      const tunLen = Math.ceil(90 / spacing);
      const last = r.portal >= 0 ? Math.min(n - 1, r.portal + tunLen) : n - 1;
      // ---- surface ribbon
      const pos: number[] = [];
      const uv: number[] = [];
      const idx: number[] = [];
      const tile = TILE[type] || 12;
      for (let i = 0; i <= last; i++) {
        const y = r.y[i] - ROAD_DROP + (type === 'rail' ? -0.03 : 0);
        pos.push(r.x[i] - F.nx[i] * hw, y, r.z[i] - F.nz[i] * hw, r.x[i] + F.nx[i] * hw, y, r.z[i] + F.nz[i] * hw);
        uv.push(0, r.s[i] / tile, 1, r.s[i] / tile);
        if (i > 0) {
          const k = (i - 1) * 2;
          idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, matFor(type));
      mesh.receiveShadow = true;
      this.group.add(mesh);

      const populated = (i: number) => Math.hypot(r.x[i], r.z[i]) < 3500;

      // ---- bridges
      for (const [a, b] of runs((i) => !!r.bridge[i] && i <= last, n, 3)) {
        const i0 = Math.max(0, a), i1 = Math.min(last, b);
        rib(concS, r, F, i0, i1, 0, hw * 2 + 1.6, -1.7, -0.06, type === 'rail' ? 0x8c8a85 : 0xa9a8a2, 0);
        if (type !== 'rail') {
          rib(concS, r, F, i0, i1, -(hw + 0.45), 0.5, -0.06, 1.05, 0xb4b3ad, 0);
          rib(concS, r, F, i0, i1, hw + 0.45, 0.5, -0.06, 1.05, 0xb4b3ad, 0);
        } else {
          rib(concS, r, F, i0, i1, -(hw - 0.2), 0.25, -0.06, 0.9, 0x6a6a68, 0);
          rib(concS, r, F, i0, i1, hw - 0.2, 0.25, -0.06, 0.9, 0x6a6a68, 0);
        }
        this.bridges.push({ x: r.x[(i0 + i1) >> 1], z: r.z[(i0 + i1) >> 1], y: r.y[(i0 + i1) >> 1] });
        // piers
        const step = Math.max(1, Math.round(30 / spacing));
        for (let i = i0 + 1; i < i1; i += step) {
          const ground = heightNoRoad(r.x[i], r.z[i]) - 1.2;
          const top = r.y[i] - 1.7;
          const ph = top - ground;
          if (ph < 0.8) continue;
          const yaw = Math.atan2(-F.nz[i], F.nx[i]);
          const cols = type === 'hwy' ? [-hw * 0.55, hw * 0.55] : [0];
          for (const o of cols) {
            concS.box(r.x[i] + F.nx[i] * o, ground, r.z[i] + F.nz[i] * o, 2.2, ph, 1.8, yaw, 0x9a9993);
          }
          concS.box(r.x[i], top - 1.1, r.z[i], hw * 2 - 1, 1.1, 2.4, yaw, 0x9a9993);
        }
      }

      // ---- tunnel + portal
      if (r.portal >= 0) {
        const p = r.portal;
        const yaw = Math.atan2(-F.nz[p], F.nx[p]);
        const W = hw * 2 + 18;
        const bx = r.x[p] - F.tx[p] * 1.2;
        const bz = r.z[p] - F.tz[p] * 1.2;
        const by = r.y[p] - ROAD_DROP;
        const open = hw + 1.6;
        const side = (W / 2 - open) / 2 + open;
        concS.box(bx + F.nx[p] * side, by - 1, bz + F.nz[p] * side, W / 2 - open, 15, 2.6, yaw, 0xa7a59f);
        concS.box(bx - F.nx[p] * side, by - 1, bz - F.nz[p] * side, W / 2 - open, 15, 2.6, yaw, 0xa7a59f);
        concS.box(bx, by + (type === 'rail' ? 6.2 : 7.2), bz, W, 8, 2.6, yaw, 0xb0aea8);
        concS.box(bx, by + (type === 'rail' ? 6.0 : 7.0), bz, open * 2 + 1, 0.6, 3.2, yaw, 0x888781);
        const h = type === 'rail' ? 6.3 : 7.2;
        rib(tunS, r, F, p, last, -(hw + 0.5), 1, -0.2, h, 0x302f2d, 0);
        rib(tunS, r, F, p, last, hw + 0.5, 1, -0.2, h, 0x302f2d, 0);
        rib(tunS, r, F, p, last, 0, hw * 2 + 2, h, h + 1, 0x2a2927, 0);
        // dark end
        const ex = r.x[last] + F.tx[last] * 1, ez = r.z[last] + F.tz[last] * 1;
        tunS.box(ex, r.y[last] - 0.2, ez, hw * 2 + 3, h + 1.2, 0.5, yaw, 0x050505);
        this.portals.push({ x: r.x[p], z: r.z[p], y: r.y[p] });
      }

      // ---- highways: median barrier, guard rails
      if (type === 'hwy') {
        rib(concS, r, F, 0, last, 0, 0.7, -0.05, 0.9, 0xb8b7b0);
      }
      if (type === 'hwy' || type === 'mtn' || type === 'rural' || type === 'sec' || type === 'ramp') {
        for (const sgn of [-1, 1]) {
          const off = sgn * (hw + (type === 'hwy' ? 1.4 : 0.9));
          const drop = (i: number) => {
            if (r.bridge[i] || r.tunnel[i] || i > last) return false;
            const gx = r.x[i] + F.nx[i] * (hw + 3.2) * sgn;
            const gz = r.z[i] + F.nz[i] * (hw + 3.2) * sgn;
            return r.y[i] - heightNoRoad(gx, gz) > 1.1;
          };
          const flags: boolean[] = [];
          for (let i = 0; i < n; i++) flags.push(drop(i));
          for (const [a, b] of runs((i) => flags[i], n, 3)) {
            rib(railS, r, F, a, b, off, 0.14, 0.52, 0.86, 0xb4babd);
            for (let i = a; i <= b; i += type === 'hwy' ? 1 : 1) postList.push([r.x[i] + F.nx[i] * off, r.y[i] - ROAD_DROP, r.z[i] + F.nz[i] * off, Math.atan2(-F.nz[i], F.nx[i])]);
          }
        }
      }
      // ---- sidewalks on urban roads
      if (type === 'avenue' || type === 'art') {
        for (const sgn of [-1, 1]) {
          for (const [a, b] of runs((i) => !r.bridge[i] && !r.tunnel[i] && i <= last && populated(i), n, 3)) {
            rib(concS, r, F, a, b, sgn * (hw + 1.9), 3.6, -0.5, 0.2, 0xb0aea6);
          }
        }
      }
      // ---- dead-end barrier
      if (r.def.deadEnd) {
        const i = n - 2;
        const yaw = Math.atan2(-F.nz[i], F.nx[i]);
        const cx = r.x[i], cz = r.z[i], cy = r.y[i] - ROAD_DROP;
        concS.box(cx + F.nx[i] * (hw + 0.6), cy, cz + F.nz[i] * (hw + 0.6), 0.3, 1.5, 0.3, yaw, 0x555555);
        concS.box(cx - F.nx[i] * (hw + 0.6), cy, cz - F.nz[i] * (hw + 0.6), 0.3, 1.5, 0.3, yaw, 0x555555);
        for (let k = 0; k < 6; k++) {
          const o = -hw + (k + 0.5) * ((hw * 2) / 6);
          concS.box(cx + F.nx[i] * o, cy + 1.05, cz + F.nz[i] * o, (hw * 2) / 6, 0.25, 0.1, yaw, k % 2 ? 0xd62828 : 0xf2f2f2);
        }
        for (const o of [-hw - 2.5, hw + 2.5]) concS.box(cx + F.nx[i] * o, cy, cz + F.nz[i] * o, 2.5, 0.7, 1, yaw, 0x8e8c86);
      }
      // ---- street lamps
      if (type === 'hwy') {
        for (let i = 3; i <= last - 3; i += 5) {
          if (!populated(i) || r.bridge[i] || r.tunnel[i]) continue;
          const y = r.y[i] - ROAD_DROP;
          const yaw = Math.atan2(-F.nz[i], F.nx[i]);
          this.lamps.add(r.x[i], y, r.z[i], yaw);
          this.lamps.add(r.x[i], y, r.z[i], yaw + Math.PI);
        }
      } else if (type === 'avenue') {
        for (let i = 2; i <= last - 2; i += 5) {
          if (r.bridge[i]) continue;
          for (const sgn of [-1, 1]) {
            const o = sgn * (hw + 3.2);
            const yaw = Math.atan2(-F.nz[i] * -sgn, F.nx[i] * -sgn);
            this.lamps.add(r.x[i] + F.nx[i] * o, r.y[i] - ROAD_DROP + 0.14, r.z[i] + F.nz[i] * o, yaw);
          }
        }
      } else if (type === 'art') {
        for (let i = 2; i <= last - 2; i += 6) {
          if (r.bridge[i] || !populated(i)) continue;
          const sgn = (i / 6) % 2 === 0 ? 1 : -1;
          const o = sgn * (hw + 3.2);
          const yaw = Math.atan2(-F.nz[i] * -sgn, F.nx[i] * -sgn);
          this.lamps.add(r.x[i] + F.nx[i] * o, r.y[i] - ROAD_DROP + 0.14, r.z[i] + F.nz[i] * o, yaw);
        }
      }
      // ---- gantry candidates
      if (type === 'hwy' && !r.loop) {
        const names = ['VERRIN BLVD', 'CAPITOL AVE', 'DOWNTOWN', 'LAKESHORE', 'ALDERBROOK', 'MARLOW'];
        for (let k = 1; k <= 3; k++) {
          const i = Math.floor((r.portal >= 0 ? r.portal : n) * (0.12 + 0.22 * k));
          if (i < 3 || i > n - 4 || r.bridge[i] || r.bridge[i - 2] || r.bridge[i + 2]) continue;
          const yaw = Math.atan2(-F.nz[i], F.nx[i]);
          gantrySpots.push({ x: r.x[i], y: r.y[i], z: r.z[i], yaw, hw, txt: [r.def.name.toUpperCase(), `${names[(k + i) % names.length]}   ${3 + k * 4} km`] });
        }
      }
      // ---- capitol roundabout island
      if (r.def.id === 'capcircle') {
        const cx = 0, cz = -2800, y = r.y[0];
        const isl = new THREE.Mesh(new THREE.CylinderGeometry(r.hw ? 42 : 42, 43, 0.5, 40), new THREE.MeshStandardMaterial({ color: 0x4f7a3a, roughness: 1 }));
        isl.position.set(cx, y + 0.0, cz);
        isl.receiveShadow = true;
        this.group.add(isl);
        const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 2.4, 38, 4), new THREE.MeshStandardMaterial({ color: 0xdcdad2, roughness: 0.7 }));
        ob.rotation.y = Math.PI / 4;
        ob.position.set(cx, y + 19, cz);
        ob.castShadow = true;
        this.group.add(ob);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(7, 8, 2, 16), new THREE.MeshStandardMaterial({ color: 0xc9c7bf, roughness: 0.8 }));
        base.position.set(cx, y + 1, cz);
        this.group.add(base);
      }
    }

    // --- meshes
    for (const [S, mat] of [[concS, concrete], [railS, new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.7, roughness: 0.45 })], [tunS, tunnelMat]] as [Strip, THREE.Material][]) {
      const m = S.build(mat);
      if (m) this.group.add(m);
    }
    // guard-rail posts
    if (postList.length) {
      const pg = new THREE.BoxGeometry(0.12, 0.9, 0.12).translate(0, 0.45, 0);
      const im = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ color: 0x8d9296, metalness: 0.6, roughness: 0.5 }), postList.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      postList.forEach((p, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p[3]);
        m.compose(new THREE.Vector3(p[0], p[1], p[2]), q, new THREE.Vector3(1, 1, 1));
        im.setMatrixAt(i, m);
      });
      im.computeBoundingSphere();
      this.group.add(im);
    }
    // gantries
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x7d8286, metalness: 0.6, roughness: 0.5 });
    for (const g of gantrySpots) {
      const gg = new THREE.Group();
      gg.position.set(g.x, g.y - ROAD_DROP, g.z);
      gg.rotation.y = g.yaw;
      const span = g.hw * 2 + 6;
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 8.5, 0.5), poleMat);
        post.position.set(sx * (span / 2), 4.25, 0);
        post.castShadow = true;
        gg.add(post);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(span, 0.6, 0.6), poleMat);
      beam.position.set(0, 8.2, 0);
      gg.add(beam);
      for (const sx of [-1, 1]) {
        const board = new THREE.Mesh(
          new THREE.PlaneGeometry(span * 0.42, 3.2),
          new THREE.MeshStandardMaterial({ map: signTex(g.txt, { bg: '#1c5b36', fg: '#f4f4f0', w: 512, h: 160 }), side: THREE.DoubleSide, roughness: 0.5, metalness: 0.1 })
        );
        board.position.set(sx * span * 0.23, 6.1, 0.35);
        // local z axis is the road tangent; boards face along it
        board.rotation.y = 0;
        gg.add(board);
      }
      this.group.add(gg);
    }
    this.lamps.build(this.group);
    scene.add(this.group);
    void ROAD_WIDTH;
  }

  update(night: number) {
    this.lamps.update(night);
  }
}
