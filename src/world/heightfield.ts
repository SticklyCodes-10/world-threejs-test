// Analytic terrain: layered height function + road/river path fields.
import { clamp, fbm, lerp, noise2, ridge, smoothstep } from './noise';
import { HALF, LAKE, RIVERS, ROADS, ROAD_WIDTH, SITES, VILLAGES, type RoadDef, type RoadType } from './config';

// ---------------------------------------------------------------- base terrain
function bump(x: number, z: number, cx: number, cz: number, r: number, h: number) {
  const d = Math.hypot(x - cx, z - cz) / r;
  if (d >= 1) return 0;
  const k = 1 - d * d;
  return h * k * k * (0.75 + 0.5 * noise2(x * 0.002, z * 0.002));
}

function valleyFloor(x: number, z: number) {
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  return 24 + 0.011 * dl + 12 * fbm(x * 0.0004 + 3, z * 0.0004, 3);
}

export function mountainMask(x: number, z: number) {
  const ax = Math.abs(x) / HALF;
  const az = Math.abs(z) / HALF;
  const q = Math.pow(ax * ax * ax * ax + az * az * az * az, 0.25) + 0.09 * fbm(x * 0.00025 + 7, z * 0.00025, 3);
  return smoothstep(0.62, 1.0, q);
}

export function baseHeight(x: number, z: number) {
  const m = mountainMask(x, z);
  let h = valleyFloor(x, z);
  h += fbm(x * 0.0012 + 11, z * 0.0012 - 4, 4) * 28 * (0.4 + 0.6 * smoothstep(0.1, 0.5, m + 0.2)) * (1 - m * 0.4);
  if (m > 0.001) {
    const r = ridge(x * 0.0005, z * 0.0005, 6);
    const broad = 0.5 + 0.5 * fbm(x * 0.00028 + 13, z * 0.00028, 3);
    let mh = Math.pow(m, 1.2) * (380 + 1150 * r * (0.55 + 0.65 * broad));
    mh += m * 55 * fbm(x * 0.004, z * 0.004, 3);
    mh += m * m * 18 * ridge(x * 0.012, z * 0.012, 3);
    h += mh;
  }
  h += bump(x, z, -2800, -3600, 1100, 260);
  h += bump(x, z, 2100, -2900, 900, 150);
  h += bump(x, z, 1200, -4100, 1000, 300);
  h += bump(x, z, -3000, -2400, 900, 200);
  return h;
}

let inited = false;

export function profileHeight(x: number, z: number) {
  let h = baseHeight(x, z);
  for (let i = 0; i < SITES.length; i++) {
    const s = SITES[i];
    const dx = x - s.x;
    const dz = z - s.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < s.ro * s.ro) {
      const t = 1 - smoothstep(s.ri, s.ro, Math.sqrt(d2));
      h = lerp(h, s.y, t);
    }
  }
  return h;
}

// ---------------------------------------------------------------- lake
export function lakeRadius(ang: number) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return LAKE.R * (1 + 0.16 * noise2(c * 1.3 + 5, s * 1.3) + 0.07 * noise2(c * 3.1 - 2, s * 3.1 + 8));
}

function applyLake(x: number, z: number, h: number) {
  const dx = x - LAKE.x;
  const dz = z - LAKE.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > LAKE.R * 1.9) return h;
  const Rw = lakeRadius(Math.atan2(dz, dx));
  const u = d / Rw;
  const bank = LAKE.y + 1.8 + 1.4 * fbm(x * 0.01, z * 0.01, 2);
  const t1 = 1 - smoothstep(1.0, 1.7, u);
  if (t1 > 0) h = lerp(h, Math.max(h, bank), t1);
  const t2 = 1 - smoothstep(0.8, 1.02, u);
  if (t2 > 0) {
    const bed = LAKE.y - 0.4 - 9 * (1 - smoothstep(0.45, 1.0, u));
    h = lerp(h, bed, t2);
  }
  return h;
}

// ---------------------------------------------------------------- path field (rivers / roads)
export class PathField {
  px: Float32Array = new Float32Array(0);
  pz: Float32Array = new Float32Array(0);
  py: Float32Array = new Float32Array(0);
  pw: Float32Array = new Float32Array(0);
  pc: Float32Array = new Float32Array(0);
  link: Uint8Array = new Uint8Array(0);
  cs = 100;
  gn = 0;
  start: Int32Array = new Int32Array(0);
  items: Int32Array = new Int32Array(0);
  d = 0;
  y = 0;
  w = 0;
  c = 0;
  seg = -1;
  t = 0;
  ox = 0;
  oz = 0;

  build(px: number[], pz: number[], py: number[], pw: number[], pc: number[], link: number[], reach: number, cs: number) {
    this.px = Float32Array.from(px);
    this.pz = Float32Array.from(pz);
    this.py = Float32Array.from(py);
    this.pw = Float32Array.from(pw);
    this.pc = Float32Array.from(pc);
    this.link = Uint8Array.from(link);
    this.cs = cs;
    const org = HALF + 400;
    this.ox = org;
    this.oz = org;
    this.gn = Math.ceil((org * 2) / cs);
    const counts = new Int32Array(this.gn * this.gn + 1);
    const n = px.length;
    const visit = (fn: (cell: number, i: number) => void) => {
      for (let i = 0; i < n - 1; i++) {
        if (!link[i]) continue;
        const r = reach + Math.max(pw[i], pw[i + 1]);
        const x0 = Math.min(px[i], px[i + 1]) - r;
        const x1 = Math.max(px[i], px[i + 1]) + r;
        const z0 = Math.min(pz[i], pz[i + 1]) - r;
        const z1 = Math.max(pz[i], pz[i + 1]) + r;
        const cx0 = clamp(Math.floor((x0 + org) / cs), 0, this.gn - 1);
        const cx1 = clamp(Math.floor((x1 + org) / cs), 0, this.gn - 1);
        const cz0 = clamp(Math.floor((z0 + org) / cs), 0, this.gn - 1);
        const cz1 = clamp(Math.floor((z1 + org) / cs), 0, this.gn - 1);
        for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) fn(cz * this.gn + cx, i);
      }
    };
    visit((cell) => counts[cell + 1]++);
    for (let i = 0; i < this.gn * this.gn; i++) counts[i + 1] += counts[i];
    this.start = counts;
    this.items = new Int32Array(counts[this.gn * this.gn]);
    const fill = new Int32Array(this.gn * this.gn);
    visit((cell, i) => {
      this.items[counts[cell] + fill[cell]++] = i;
    });
  }

  query(x: number, z: number): boolean {
    const cx = Math.floor((x + this.ox) / this.cs);
    const cz = Math.floor((z + this.oz) / this.cs);
    if (cx < 0 || cz < 0 || cx >= this.gn || cz >= this.gn) return false;
    const cell = cz * this.gn + cx;
    const a = this.start[cell];
    const b = this.start[cell + 1];
    if (a === b) return false;
    let best = 1e18;
    let bi = -1;
    let bt = 0;
    const { px, pz, items } = this;
    for (let k = a; k < b; k++) {
      const i = items[k];
      const ax = px[i];
      const az = pz[i];
      const dx = px[i + 1] - ax;
      const dz = pz[i + 1] - az;
      const l2 = dx * dx + dz * dz + 1e-6;
      let t = ((x - ax) * dx + (z - az) * dz) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = ax + dx * t - x;
      const ez = az + dz * t - z;
      const d2 = ex * ex + ez * ez;
      if (d2 < best) {
        best = d2;
        bi = i;
        bt = t;
      }
    }
    if (bi < 0) return false;
    this.d = Math.sqrt(best);
    this.seg = bi;
    this.t = bt;
    this.y = this.py[bi] + (this.py[bi + 1] - this.py[bi]) * bt;
    this.w = this.pw[bi] + (this.pw[bi + 1] - this.pw[bi]) * bt;
    this.c = this.pc[bi] + (this.pc[bi + 1] - this.pc[bi]) * bt;
    return true;
  }
}

// ---------------------------------------------------------------- path sampling
export interface Sampled {
  x: number[];
  z: number[];
  dy: number[];
  s: number[];
}

export function samplePath(pts: number[][], spacing: number, loop: boolean): Sampled {
  const n = pts.length;
  const get = (i: number) => (loop ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const dx: number[] = [];
  const dz: number[] = [];
  const dd: number[] = [];
  const segs = loop ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(4, Math.ceil(L / 5));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const cr = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dx.push(cr(p0[0], p1[0], p2[0], p3[0]));
      dz.push(cr(p0[1], p1[1], p2[1], p3[1]));
      dd.push(lerp(p1[2] || 0, p2[2] || 0, smoothstep(0, 1, t)));
    }
  }
  if (loop) {
    dx.push(dx[0]);
    dz.push(dz[0]);
    dd.push(dd[0]);
  } else {
    const l = pts[n - 1];
    dx.push(l[0]);
    dz.push(l[1]);
    dd.push(l[2] || 0);
  }
  // arclength resample
  const cum: number[] = [0];
  for (let i = 1; i < dx.length; i++) cum.push(cum[i - 1] + Math.hypot(dx[i] - dx[i - 1], dz[i] - dz[i - 1]));
  const total = cum[cum.length - 1];
  const cnt = Math.max(2, Math.round(total / spacing));
  const out: Sampled = { x: [], z: [], dy: [], s: [] };
  let j = 0;
  for (let k = 0; k <= cnt; k++) {
    const target = (k / cnt) * total;
    while (j < cum.length - 2 && cum[j + 1] < target) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    const t = clamp((target - cum[j]) / seg, 0, 1);
    out.x.push(lerp(dx[j], dx[j + 1], t));
    out.z.push(lerp(dz[j], dz[j + 1], t));
    out.dy.push(lerp(dd[j], dd[j + 1], t));
    out.s.push(target);
  }
  return out;
}

function smoothArray(a: number[], R: number, passes: number, loop: boolean) {
  const n = a.length;
  let cur = a.slice();
  for (let p = 0; p < passes; p++) {
    const nxt = new Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      let cnt = 0;
      for (let k = -R; k <= R; k++) {
        let j = i + k;
        if (loop) j = ((j % (n - 1)) + (n - 1)) % (n - 1);
        else j = j < 0 ? 0 : j >= n ? n - 1 : j;
        sum += cur[j];
        cnt++;
      }
      nxt[i] = sum / cnt;
    }
    cur = nxt;
  }
  return cur;
}

// ---------------------------------------------------------------- data products
export interface RiverData {
  def: (typeof RIVERS)[number];
  n: number;
  x: number[];
  z: number[];
  y: number[];
  s: number[];
  hw: number;
  fallIdx: number;
}

export interface RoadData {
  def: RoadDef;
  type: RoadType;
  n: number;
  x: number[];
  z: number[];
  y: number[];
  s: number[];
  hw: number;
  bridge: Uint8Array;
  tunnel: Uint8Array;
  carve: number[];
  portal: number;
  loop: boolean;
  gap: number[];
}

export const rivers: RiverData[] = [];
export const roads: RoadData[] = [];
const riverField = new PathField();
const roadField = new PathField();

function buildRivers() {
  const px: number[] = [];
  const pz: number[] = [];
  const py: number[] = [];
  const pw: number[] = [];
  const pc: number[] = [];
  const link: number[] = [];
  for (const def of RIVERS) {
    const sm = samplePath(def.pts, 10, false);
    const n = sm.x.length;
    const yPre: number[] = [];
    for (let i = 0; i < n; i++) yPre.push(profileHeight(sm.x[i], sm.z[i]) - def.depth - 1.2);
    let fallIdx = -1;
    if (def.falls) {
      let bd = 1e18;
      for (let i = 0; i < n; i++) {
        const d = Math.hypot(sm.x[i] - def.falls.x, sm.z[i] - def.falls.z);
        if (d < bd) {
          bd = d;
          fallIdx = i;
        }
      }
    }
    let y = smoothArray(yPre, 5, 2, false);
    if (fallIdx >= 0) {
      const yf = y[fallIdx];
      for (let i = fallIdx; i < n; i++) y[i] = Math.min(y[i], yf - def.falls!.drop * Math.min(1, (i - fallIdx) / 2));
    }
    for (let i = 1; i < n; i++) y[i] = Math.min(y[i], y[i - 1] - 0.02);
    const ys = smoothArray(y, 4, 2, false);
    if (fallIdx >= 0) for (let i = Math.max(0, fallIdx - 3); i < Math.min(n, fallIdx + 7); i++) ys[i] = y[i];
    for (let i = 0; i < n; i++) ys[i] = Math.max(ys[i], LAKE.y + 0.15);
    for (let i = 0; i < n; i++) {
      px.push(sm.x[i]);
      pz.push(sm.z[i]);
      py.push(ys[i]);
      pw.push(def.w / 2);
      pc.push(def.depth);
      link.push(i < n - 1 ? 1 : 0);
    }
    rivers.push({ def, n, x: sm.x, z: sm.z, y: ys, s: sm.s, hw: def.w / 2, fallIdx });
  }
  riverField.build(px, pz, py, pw, pc, link, 90, 100);
}

function applyRivers(x: number, z: number, h: number) {
  if (!riverField.query(x, z)) return h;
  const d = riverField.d;
  const hw = riverField.w;
  const depth = riverField.c;
  const wl = riverField.y;
  const bedC = wl - depth * (1 - 0.55 * Math.min(1, (d / hw) * (d / hw)));
  const delta = Math.max(0, h - wl);
  const bank = clamp(9 + 1.15 * delta, 9, 80);
  let t = 1;
  if (d > hw) t = 1 - smoothstep(0, 1, (d - hw) / bank);
  if (t <= 0) return h;
  return lerp(h, bedC, t);
}

export function heightNoRoad(x: number, z: number) {
  let h = profileHeight(x, z);
  h = applyLake(x, z, h);
  h = applyRivers(x, z, h);
  return h;
}

function buildRoads() {
  const px: number[] = [];
  const pz: number[] = [];
  const py: number[] = [];
  const pw: number[] = [];
  const pc: number[] = [];
  const link: number[] = [];
  const prev: { x: number; z: number; y: number }[] = [];

  for (const def of ROADS) {
    const type = def.type;
    const spacing = type === 'hwy' || type === 'rail' ? 10 : type === 'dirt' || type === 'mtn' ? 6 : 8;
    const hw = ROAD_WIDTH[type] / 2;
    const loop = !!def.loop;
    const sm = samplePath(def.pts, spacing, loop);
    if (def.tunnelFrom != null) {
      // continue the alignment straight into the mountain (tunnel bore)
      const m = sm.x.length;
      const ux = sm.x[m - 1] - sm.x[m - 4];
      const uz = sm.z[m - 1] - sm.z[m - 4];
      const ul = Math.hypot(ux, uz) || 1;
      for (let k = 1; k <= 14; k++) {
        sm.x.push(sm.x[m - 1] + (ux / ul) * spacing * k);
        sm.z.push(sm.z[m - 1] + (uz / ul) * spacing * k);
        sm.dy.push(0);
        sm.s.push(sm.s[m - 1] + spacing * k);
      }
    }
    const n = sm.x.length;
    const y0: number[] = [];
    for (let i = 0; i < n; i++) y0.push(profileHeight(sm.x[i], sm.z[i]));
    let portal = -1;
    if (def.tunnelFrom != null) {
      const p = def.pts[def.tunnelFrom];
      let bd = 1e18;
      for (let i = 0; i < n; i++) {
        const d = Math.hypot(sm.x[i] - p[0], sm.z[i] - p[1]);
        if (d < bd) {
          bd = d;
          portal = i;
        }
      }
    }
    const R = def.smooth ?? 8;
    let y: number[];
    if (portal >= 0) {
      const head = smoothArray(y0.slice(0, portal + 1), Math.min(R, portal), 2, false);
      y = head.slice();
      for (let i = portal + 1; i < n; i++) y.push(head[portal] + 0.025 * (sm.s[i] - sm.s[portal]));
    } else y = smoothArray(y0, R, 2, loop);
    if (!loop) {
      const g = ({ hwy: 0.07, art: 0.08, avenue: 0.08, sec: 0.09, rural: 0.09, mtn: 0.11, dirt: 0.14, rail: 0.035, ramp: 0.08 } as any)[type];
      const lim = portal >= 0 ? portal + 1 : n;
      for (let i = 1; i < lim; i++) {
        const ds = sm.s[i] - sm.s[i - 1];
        y[i] = clamp(y[i], y[i - 1] - g * ds, y[i - 1] + g * ds);
      }
      for (let i = lim - 2; i >= 0; i--) {
        const ds = sm.s[i + 1] - sm.s[i];
        y[i] = clamp(y[i], y[i + 1] - g * ds, y[i + 1] + g * ds);
      }
      if (portal >= 0) for (let i = portal + 1; i < n; i++) y[i] = y[portal] + 0.025 * (sm.s[i] - sm.s[portal]);
    }
    // join with earlier roads at the endpoints
    if (!loop) {
      for (const end of [0, n - 1]) {
        let bd = 14;
        let by = NaN;
        for (const p of prev) {
          const d = Math.hypot(p.x - sm.x[end], p.z - sm.z[end]);
          if (d < bd) {
            bd = d;
            by = p.y;
          }
        }
        if (!Number.isNaN(by)) {
          const K = 26;
          for (let k = 0; k < K; k++) {
            const i = end === 0 ? k : n - 1 - k;
            if (i < 0 || i >= n) continue;
            const t = smoothstep(0, 1, k / K);
            y[i] = lerp(by, y[i], t);
          }
        }
      }
    }
    for (let i = 0; i < n; i++) y[i] += sm.dy[i];
    const gap: number[] = [];
    const bridge = new Uint8Array(n);
    const tunnel = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const g = y[i] - heightNoRoad(sm.x[i], sm.z[i]);
      gap.push(g);
      if (portal >= 0 && i > portal) tunnel[i] = 1;
      else if (sm.dy[i] > 3.2 || (g > 2.8 && (riverEdgeDist(sm.x[i], sm.z[i]) < 70 || lakeDist(sm.x[i], sm.z[i]) < 60)) || g > 24) bridge[i] = 1;
    }
    // remove tiny bridges, pad real ones
    for (let i = 0; i < n; ) {
      if (!bridge[i]) {
        i++;
        continue;
      }
      let j = i;
      while (j < n && bridge[j]) j++;
      if (j - i < 3) for (let k = i; k < j; k++) bridge[k] = 0;
      i = j;
    }
    const b2 = bridge.slice();
    for (let i = 0; i < n; i++) if (bridge[i]) for (let k = -1; k <= 1; k++) if (i + k >= 0 && i + k < n && !tunnel[i + k]) b2[i + k] = 1;
    bridge.set(b2);
    let carve: number[] = [];
    for (let i = 0; i < n; i++) {
      let c = bridge[i] ? 0 : 1;
      if (portal >= 0 && i > portal) c = Math.max(0, 1 - (sm.s[i] - sm.s[portal]) / 60);
      carve.push(c);
    }
    carve = smoothArray(carve, 2, 2, loop);

    const shoulder = type === 'hwy' ? 3 : type === 'rail' ? 3 : 1.2;
    for (let i = 0; i < n; i++) {
      px.push(sm.x[i]);
      pz.push(sm.z[i]);
      py.push(y[i]);
      pw.push(hw + shoulder);
      pc.push(carve[i]);
      link.push(i < n - 1 ? 1 : 0);
      prev.push({ x: sm.x[i], z: sm.z[i], y: y[i] });
    }
    roads.push({ def, type, n, x: sm.x, z: sm.z, y, s: sm.s, hw, bridge, tunnel, carve, portal, loop, gap });
  }
  roadField.build(px, pz, py, pw, pc, link, 74, 100);
}

export function height(x: number, z: number, widen = 0) {
  let h = heightNoRoad(x, z);
  if (roadField.query(x, z)) {
    const c = roadField.c;
    if (c > 0.002) {
      const d = roadField.d;
      const hw = roadField.w;
      const target = roadField.y - 0.14;
      const emb = clamp(6 + 1.6 * Math.abs(h - target), 6, 55);
      if (d < hw + widen + emb) {
        const t = d <= hw + widen ? 1 : 1 - smoothstep(0, 1, (d - hw - widen) / emb);
        h = lerp(h, target, t * c);
      }
    }
  }
  return h;
}

/** distance from road edge (negative when on it); 1e9 if nothing near */
export function roadEdgeDist(x: number, z: number) {
  if (!roadField.query(x, z)) return 1e9;
  return roadField.d - roadField.w;
}
/** distance from river water edge (negative = in water) */
export function riverEdgeDist(x: number, z: number) {
  if (!riverField.query(x, z)) return 1e9;
  return riverField.d - riverField.w;
}
export function lakeDist(x: number, z: number) {
  const dx = x - LAKE.x;
  const dz = z - LAKE.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  return (d - lakeRadius(Math.atan2(dz, dx))) ;
}

export function urbanness(x: number, z: number) {
  let u = 0;
  for (let i = 0; i < SITES.length; i++) {
    const s = SITES[i];
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < s.ro) u = Math.max(u, 1 - smoothstep(s.ri * 0.85, s.ro, d));
  }
  return u;
}

export function farmland(x: number, z: number, h: number) {
  if (h > 190) return 0;
  let n = fbm(x * 0.00075 + 40, z * 0.00075 + 9, 3);
  for (const v of VILLAGES) {
    const d = Math.hypot(x - v.x, z - v.z);
    n += 0.5 * (1 - smoothstep(450, 1300, d));
  }
  let f = smoothstep(0.02, 0.18, n);
  f *= 1 - smoothstep(110, 190, h);
  f *= 1 - smoothstep(0.0, 0.25, urbanness(x, z));
  f *= 1 - smoothstep(0.25, 0.5, mountainMask(x, z));
  return f;
}

export function forestDensity(x: number, z: number, h: number, slope: number, farm: number, urb: number) {
  const n = fbm(x * 0.0011 + 50, z * 0.0011, 4);
  let d = smoothstep(-0.42, 0.0, n);
  d *= 1 - smoothstep(1050, 1300, h);
  d *= 1 - farm;
  d *= 1 - smoothstep(0.85, 1.35, slope);
  d *= 1 - urb;
  return d;
}

export function initHeightfield() {
  if (inited) return;
  inited = true;
  for (const s of SITES) {
    let sum = baseHeight(s.x, s.z);
    let c = 1;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      sum += baseHeight(s.x + Math.cos(a) * s.ri * 0.5, s.z + Math.sin(a) * s.ri * 0.5);
      c++;
    }
    s.y = Math.round((sum / c) * 2) / 2;
  }
  buildRivers();
  buildRoads();
}

export function slopeAt(x: number, z: number, e = 3) {
  const hx = height(x + e, z) - height(x - e, z);
  const hz = height(x, z + e) - height(x, z - e);
  return Math.sqrt(hx * hx + hz * hz) / (2 * e);
}
