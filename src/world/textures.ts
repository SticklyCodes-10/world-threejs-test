// Procedural canvas textures (no external assets needed).
import * as THREE from 'three';
import { mulberry32 } from './noise';

const cache = new Map<string, THREE.Texture>();

function cvs(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function mk(c: HTMLCanvasElement, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}
function memo(key: string, f: () => THREE.Texture) {
  let t = cache.get(key);
  if (!t) {
    t = f();
    cache.set(key, t);
  }
  return t;
}

// periodic value noise helpers ------------------------------------------------
const latCache = new Map<string, Float32Array>();
function lattice(n: number, seed: number) {
  const key = n + ':' + seed;
  const hit = latCache.get(key);
  if (hit) return hit;
  const r = mulberry32(seed);
  const a = new Float32Array(n * n);
  for (let i = 0; i < a.length; i++) a[i] = r();
  latCache.set(key, a);
  return a;
}
function pnoise(a: Float32Array, n: number, x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % n) + n) % n;
  const y0 = ((yi % n) + n) % n;
  const x1 = (x0 + 1) % n;
  const y1 = (y0 + 1) % n;
  const a00 = a[y0 * n + x0];
  const a10 = a[y0 * n + x1];
  const a01 = a[y1 * n + x0];
  const a11 = a[y1 * n + x1];
  return a00 + (a10 - a00) * u + (a01 - a00) * v + (a00 - a10 - a01 + a11) * u * v;
}
function pfbm(size: number, px: number, py: number, base: number, oct: number, seed: number) {
  let s = 0;
  let amp = 0.5;
  let n = base;
  let norm = 0;
  for (let o = 0; o < oct; o++) {
    const a = lattice(n, seed + o * 31);
    s += pnoise(a, n, (px / size) * n, (py / size) * n) * amp;
    norm += amp;
    amp *= 0.5;
    n *= 2;
  }
  return s / norm;
}

function grain(ctx: CanvasRenderingContext2D, w: number, h: number, amt: number, seed = 5) {
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  const r = mulberry32(seed);
  for (let i = 0; i < d.length; i += 4) {
    const k = (r() - 0.5) * amt;
    d[i] += k;
    d[i + 1] += k;
    d[i + 2] += k;
  }
  ctx.putImageData(id, 0, 0);
}

// ------------------------------------------------------------------ shared noise
export function noiseTex() {
  return memo('noise', () => {
    const S = 256;
    const c = cvs(S, S);
    const ctx = c.getContext('2d')!;
    const id = ctx.createImageData(S, S);
    const cell = lattice(32, 99);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        id.data[i] = pfbm(S, x, y, 4, 5, 11) * 255;
        id.data[i + 1] = pfbm(S, x, y, 8, 4, 23) * 255;
        id.data[i + 2] = pfbm(S, x, y, 16, 3, 37) * 255;
        id.data[i + 3] = cell[((y >> 3) % 32) * 32 + ((x >> 3) % 32)] * 255;
      }
    ctx.putImageData(id, 0, 0);
    return mk(c, false);
  });
}

export function terrainDetailTex() {
  return memo('tdetail', () => {
    const S = 512;
    const c = cvs(S, S);
    const ctx = c.getContext('2d')!;
    const id = ctx.createImageData(S, S);
    const r = mulberry32(8);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const i = (y * S + x) * 4;
        const g = pfbm(S, x, y, 8, 5, 3) * 0.6 + pfbm(S, x, y, 64, 2, 4) * 0.4;
        const rk0 = pfbm(S, x, y, 6, 5, 5);
        const crack = Math.abs(pfbm(S, x, y, 10, 4, 6) - 0.5) * 2;
        const rock = rk0 * 0.55 + Math.pow(crack, 0.6) * 0.45;
        const gravel = pfbm(S, x, y, 32, 3, 7) * 0.7 + r() * 0.3;
        id.data[i] = g * 255;
        id.data[i + 1] = rock * 255;
        id.data[i + 2] = gravel * 255;
        id.data[i + 3] = 255;
      }
    ctx.putImageData(id, 0, 0);
    return mk(c, false);
  });
}

// ------------------------------------------------------------------ roads
function asphaltBase(ctx: CanvasRenderingContext2D, w: number, h: number, tone = 58) {
  ctx.fillStyle = `rgb(${tone},${tone},${tone + 2})`;
  ctx.fillRect(0, 0, w, h);
  // large mottling
  const r = mulberry32(21);
  for (let i = 0; i < 90; i++) {
    { const v = r() > 0.5 ? 255 : 0; ctx.fillStyle = `rgba(${v},${v},${v},0.03)`; }
    ctx.beginPath();
    ctx.ellipse(r() * w, r() * h, 10 + r() * 60, 10 + r() * 70, r() * 3, 0, 7);
    ctx.fill();
  }
  grain(ctx, w, h, 26, 9);
}

export function roadTex(kind: string) {
  return memo('road_' + kind, () => {
    const W = 256;
    const H = 512;
    const c = cvs(W, H);
    const ctx = c.getContext('2d')!;
    const widthM: Record<string, number> = { hwy: 30, art: 17, avenue: 38, sec: 11, rural: 7.5, mtn: 7, dirt: 4.2, ramp: 8.5, rail: 6.5, street: 14, streetAve: 24 };
    const tileM: Record<string, number> = { hwy: 24, art: 12, avenue: 24, sec: 12, rural: 12, mtn: 12, dirt: 8, ramp: 12, rail: 4.8, street: 12, streetAve: 12 };
    const wm = widthM[kind] || 10;
    const tm = tileM[kind] || 12;
    const mx = (m: number) => (m / wm) * W;
    const my = (m: number) => (m / tm) * H;
    const solid = (m: number, wid: number, col: string) => {
      ctx.fillStyle = col;
      ctx.fillRect(mx(m - wid / 2), 0, mx(wid), H);
    };
    const dashed = (m: number, wid: number, col: string, dash: number, period: number) => {
      ctx.fillStyle = col;
      for (let v = 0; v < tm; v += period) ctx.fillRect(mx(m - wid / 2), my(v), mx(wid), my(dash));
    };
    const WH = 'rgba(232,232,226,0.92)';
    const YL = 'rgba(222,178,40,0.92)';
    if (kind === 'rail') {
      ctx.fillStyle = '#6b665e';
      ctx.fillRect(0, 0, W, H);
      const r = mulberry32(4);
      for (let i = 0; i < 5000; i++) {
        const g = 70 + r() * 90;
        ctx.fillStyle = `rgb(${g},${g * 0.97},${g * 0.92})`;
        ctx.fillRect(r() * W, r() * H, 2 + r() * 3, 2 + r() * 3);
      }
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = '#3d3025';
        ctx.fillRect(mx(wm / 2 - 1.3), my(i * 0.6 + 0.08), mx(2.6), my(0.26));
      }
      ctx.fillStyle = '#b9b2a6';
      ctx.fillRect(mx(wm / 2 - 0.74), 0, mx(0.09), H);
      ctx.fillRect(mx(wm / 2 + 0.65), 0, mx(0.09), H);
      ctx.fillStyle = 'rgba(120,70,40,0.55)';
      ctx.fillRect(mx(wm / 2 - 0.7), 0, mx(0.05), H);
      ctx.fillRect(mx(wm / 2 + 0.7), 0, mx(0.05), H);
      return mk(c);
    }
    if (kind === 'dirt') {
      ctx.fillStyle = '#6f5c43';
      ctx.fillRect(0, 0, W, H);
      const r = mulberry32(6);
      for (let i = 0; i < 4000; i++) {
        const g = 70 + r() * 60;
        ctx.fillStyle = `rgba(${g + 30},${g + 10},${g - 20},0.6)`;
        ctx.fillRect(r() * W, r() * H, 2 + r() * 4, 2 + r() * 4);
      }
      ctx.fillStyle = 'rgba(40,30,20,0.35)';
      ctx.fillRect(mx(0.7), 0, mx(0.6), H);
      ctx.fillRect(mx(wm - 1.3), 0, mx(0.6), H);
      ctx.fillStyle = 'rgba(70,95,40,0.5)';
      ctx.fillRect(mx(wm / 2 - 0.5), 0, mx(1), H);
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, 'rgba(60,85,40,0.7)');
      g.addColorStop(0.1, 'rgba(60,85,40,0)');
      g.addColorStop(0.9, 'rgba(60,85,40,0)');
      g.addColorStop(1, 'rgba(60,85,40,0.7)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      grain(ctx, W, H, 24, 12);
      return mk(c);
    }
    const tone = kind === 'hwy' ? 52 : kind === 'rural' || kind === 'mtn' ? 70 : 58;
    asphaltBase(ctx, W, H, tone);
    // tyre wear tracks
    const lanes = kind === 'hwy' ? [4.3, 10.4, 19.6, 25.7] : kind === 'avenue' ? [3, 6.5, 10, 28, 31.5, 35] : kind === 'art' || kind === 'street' ? [2.4, 6.4, 10.6, 14.6] : kind === 'streetAve' ? [3, 6.7, 10.4, 13.6, 17.3, 21] : [wm * 0.27, wm * 0.73];
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (const l of lanes) {
      ctx.fillRect(mx(l - 0.9), 0, mx(0.5), H);
      ctx.fillRect(mx(l + 0.4), 0, mx(0.5), H);
    }
    if (kind === 'hwy') {
      solid(1.0, 0.18, WH);
      solid(29, 0.18, WH);
      ctx.fillStyle = '#8a8a86';
      ctx.fillRect(mx(14.3), 0, mx(1.4), H);
      solid(13.9, 0.14, YL);
      solid(16.1, 0.14, YL);
      dashed(7.4, 0.14, WH, 3, 12);
      dashed(22.6, 0.14, WH, 3, 12);
      // cracks
    } else if (kind === 'avenue') {
      solid(0.7, 0.16, WH);
      solid(37.3, 0.16, WH);
      ctx.fillStyle = '#6f7a63';
      ctx.fillRect(mx(16.5), 0, mx(5), H);
      ctx.fillStyle = '#9a9a94';
      ctx.fillRect(mx(16.2), 0, mx(0.3), H);
      ctx.fillRect(mx(21.5), 0, mx(0.3), H);
      dashed(4.7, 0.14, WH, 3, 12);
      dashed(8.8, 0.14, WH, 3, 12);
      dashed(29.2, 0.14, WH, 3, 12);
      dashed(33.3, 0.14, WH, 3, 12);
    } else if (kind === 'art') {
      solid(0.5, 0.15, WH);
      solid(16.5, 0.15, WH);
      solid(8.35, 0.1, YL);
      solid(8.65, 0.1, YL);
      dashed(4.5, 0.12, WH, 3, 12);
      dashed(12.5, 0.12, WH, 3, 12);
    } else if (kind === 'street' || kind === 'streetAve') {
      if (kind === 'street') {
        dashed(7, 0.14, YL, 4, 12);
        solid(0.35, 0.12, 'rgba(230,230,225,0.5)');
        solid(13.65, 0.12, 'rgba(230,230,225,0.5)');
      } else {
        solid(11.85, 0.1, YL);
        solid(12.15, 0.1, YL);
        dashed(6.6, 0.12, WH, 3, 12);
        dashed(17.4, 0.12, WH, 3, 12);
        solid(0.4, 0.14, WH);
        solid(23.6, 0.14, WH);
      }
    } else if (kind === 'sec') {
      dashed(5.5, 0.12, YL, 3, 9);
      solid(0.45, 0.12, WH);
      solid(10.55, 0.12, WH);
    } else if (kind === 'ramp') {
      solid(0.4, 0.14, WH);
      solid(8.1, 0.14, YL);
    } else {
      dashed(wm / 2, 0.12, 'rgba(210,170,50,0.75)', 3, 9);
      solid(0.3, 0.1, 'rgba(220,220,215,0.55)');
      solid(wm - 0.3, 0.1, 'rgba(220,220,215,0.55)');
      // patched / worn
      const r = mulberry32(31);
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = `rgba(20,20,20,${0.15 + r() * 0.15})`;
        ctx.fillRect(r() * W, r() * H, 30 + r() * 120, 6 + r() * 20);
      }
    }
    // cracks
    const r = mulberry32(77);
    ctx.strokeStyle = 'rgba(15,15,15,0.4)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      let x = r() * W;
      let y = r() * H;
      ctx.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (r() - 0.5) * 50;
        y += r() * 40;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    return mk(c);
  });
}

/** Intersection with zebra crossings on every side. UV 0..1 across the junction. */
export function intersectionTex() {
  return memo('inter', () => {
    const S = 256;
    const c = cvs(S, S);
    const ctx = c.getContext('2d')!;
    asphaltBase(ctx, S, S, 58);
    ctx.fillStyle = 'rgba(235,235,230,0.88)';
    const zb = 30;
    for (let k = 0; k < 11; k++) {
      const p = 26 + k * 20;
      ctx.fillRect(p, 4, 10, zb);
      ctx.fillRect(p, S - 4 - zb, 10, zb);
      ctx.fillRect(4, p, zb, 10);
      ctx.fillRect(S - 4 - zb, p, zb, 10);
    }
    ctx.fillStyle = 'rgba(235,235,230,0.8)';
    ctx.fillRect(20, 40, 216, 4);
    ctx.fillRect(20, S - 44, 216, 4);
    return mk(c);
  });
}

export function pavementTex() {
  return memo('pave', () => {
    const S = 256;
    const c = cvs(S, S);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#9b9a94';
    ctx.fillRect(0, 0, S, S);
    const r = mulberry32(13);
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const g = 140 + r() * 30;
        ctx.fillStyle = `rgb(${g},${g - 1},${g - 6})`;
        ctx.fillRect(x * 64 + 1, y * 64 + 1, 62, 62);
      }
    ctx.strokeStyle = 'rgba(40,40,36,0.7)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 64, 0);
      ctx.lineTo(i * 64, S);
      ctx.moveTo(0, i * 64);
      ctx.lineTo(S, i * 64);
      ctx.stroke();
    }
    grain(ctx, S, S, 22, 3);
    return mk(c);
  });
}

export function grassTex(dry = 0) {
  return memo('grass' + dry, () => {
    const S = 256;
    const c = cvs(S, S);
    const ctx = c.getContext('2d')!;
    const id = ctx.createImageData(S, S);
    const r = mulberry32(3 + dry);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const n = pfbm(S, x, y, 8, 4, 9 + dry);
        const k = 0.55 + n * 0.6 + (r() - 0.5) * 0.25;
        const i = (y * S + x) * 4;
        id.data[i] = (62 + dry * 40) * k;
        id.data[i + 1] = (92 + dry * 12) * k;
        id.data[i + 2] = (38 + dry * 0) * k;
        id.data[i + 3] = 255;
      }
    ctx.putImageData(id, 0, 0);
    return mk(c);
  });
}

export function lotTex(worn = 0) {
  return memo('lot' + worn, () => {
    const S = 256;
    const c = cvs(S, S);
    const ctx = c.getContext('2d')!;
    asphaltBase(ctx, S, S, worn ? 70 : 55);
    ctx.fillStyle = worn ? 'rgba(200,200,190,0.45)' : 'rgba(235,235,225,0.85)';
    // parking stall lines (every 2.6 m if tile = 10.4 m => 4 stalls)
    for (let i = 0; i <= 4; i++) {
      ctx.fillRect(i * 64 - 2, 10, 4, 100);
      ctx.fillRect(i * 64 - 2, 146, 4, 100);
    }
    if (worn) {
      const r = mulberry32(5);
      ctx.strokeStyle = 'rgba(10,10,10,0.7)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 16; i++) {
        ctx.beginPath();
        let x = r() * S;
        let y = r() * S;
        ctx.moveTo(x, y);
        for (let k = 0; k < 7; k++) {
          x += (r() - 0.5) * 60;
          y += (r() - 0.5) * 60;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = `rgba(${60 + r() * 20},${80 + r() * 30},${40},${0.35 + r() * 0.3})`;
        ctx.beginPath();
        ctx.ellipse(r() * S, r() * S, 6 + r() * 20, 4 + r() * 12, r() * 3, 0, 7);
        ctx.fill();
      }
    }
    return mk(c);
  });
}

export function parterreTex() {
  return memo('parterre', () => {
    const S = 512;
    const c = cvs(S, S);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#5b8a3a';
    ctx.fillRect(0, 0, S, S);
    grain(ctx, S, S, 40, 4);
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#25461f';
    const loops = (cx: number, cy: number, R: number) => {
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.arc(cx, cy, R - k * 22, 0, 7);
        ctx.stroke();
      }
    };
    ctx.strokeRect(14, 14, S - 28, S - 28);
    loops(S / 2, S / 2, 150);
    ctx.fillStyle = '#c24a5a';
    for (let a = 0; a < 12; a++) {
      ctx.beginPath();
      ctx.arc(S / 2 + Math.cos(a / 12 * 6.28) * 60, S / 2 + Math.sin(a / 12 * 6.28) * 60, 12, 0, 7);
      ctx.fill();
    }
    ctx.fillStyle = '#e8d56a';
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, 26, 0, 7);
    ctx.fill();
    ctx.lineWidth = 10;
    for (const [x, y] of [[90, 90], [S - 90, 90], [90, S - 90], [S - 90, S - 90]]) {
      ctx.beginPath();
      ctx.arc(x, y, 50, 0, 7);
      ctx.stroke();
      ctx.fillStyle = '#e1e1ea';
      ctx.beginPath();
      ctx.arc(x, y, 30, 0, 7);
      ctx.fill();
    }
    return mk(c);
  });
}

// ------------------------------------------------------------------ water
export function waterNormalTex() {
  return memo('wnorm', () => {
    const S = 256;
    const c = cvs(S, S);
    const ctx = c.getContext('2d')!;
    const id = ctx.createImageData(S, S);
    const h = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) h[y * S + x] = pfbm(S, x, y, 8, 4, 77) + 0.5 * pfbm(S, x, y, 32, 2, 78);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const dx = h[y * S + ((x + 1) % S)] - h[y * S + ((x - 1 + S) % S)];
        const dy = h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x];
        const i = (y * S + x) * 4;
        id.data[i] = 128 + dx * 700;
        id.data[i + 1] = 128 + dy * 700;
        id.data[i + 2] = 255;
        id.data[i + 3] = 255;
      }
    ctx.putImageData(id, 0, 0);
    return mk(c, false);
  });
}

export function foamTex() {
  return memo('foam', () => {
    const W = 128;
    const H = 256;
    const c = cvs(W, H);
    const ctx = c.getContext('2d')!;
    const id = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const n = pfbm(128, x, y * 0.5, 4, 4, 55);
        const streak = pfbm(128, x * 3, y * 0.4, 6, 3, 56);
        const v = Math.min(1, Math.max(0, (n * 0.6 + streak * 0.7 - 0.35) * 2.4));
        const i = (y * W + x) * 4;
        id.data[i] = id.data[i + 1] = id.data[i + 2] = 245;
        id.data[i + 3] = v * 255;
      }
    ctx.putImageData(id, 0, 0);
    return mk(c);
  });
}

// ------------------------------------------------------------------ props
export function fenceTex(kind: 'iron' | 'chain') {
  return memo('fence' + kind, () => {
    const S = 256;
    const c = cvs(S, S);
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, S, S);
    if (kind === 'iron') {
      ctx.fillStyle = '#16181a';
      for (let i = 0; i < 8; i++) {
        ctx.fillRect(i * 32 + 13, 20, 6, S - 20);
        ctx.beginPath();
        ctx.moveTo(i * 32 + 16, 2);
        ctx.lineTo(i * 32 + 24, 22);
        ctx.lineTo(i * 32 + 8, 22);
        ctx.fill();
      }
      ctx.fillRect(0, 60, S, 8);
      ctx.fillRect(0, S - 40, S, 8);
    } else {
      ctx.strokeStyle = 'rgba(150,155,150,0.95)';
      ctx.lineWidth = 2;
      for (let i = -S; i < S * 2; i += 16) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + S, S);
        ctx.moveTo(i + S, 0);
        ctx.lineTo(i, S);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(120,70,40,0.5)';
      ctx.fillRect(0, 0, S, 8);
    }
    return mk(c);
  });
}

export function ivyTex() {
  return memo('ivy', () => {
    const S = 256;
    const c = cvs(S, S);
    const ctx = c.getContext('2d')!;
    const r = mulberry32(14);
    for (let i = 0; i < 1400; i++) {
      const x = S / 2 + (r() - 0.5) * S * 0.9 * (0.4 + r());
      const y = S * (0.15 + r() * 0.85);
      const fall = Math.abs(x - S / 2) / (S / 2);
      if (r() < fall * 0.7) continue;
      const g = 60 + r() * 60;
      ctx.fillStyle = `rgb(${g * 0.5},${g + 20},${g * 0.35})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 4 + r() * 5, 3 + r() * 4, r() * 6, 0, 7);
      ctx.fill();
    }
    return mk(c);
  });
}

export function glowTex() {
  return memo('glow', () => {
    const S = 128;
    const c = cvs(S, S);
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    return mk(c, true, false);
  });
}

export function signTex(lines: string[], opts: { bg?: string; fg?: string; w?: number; h?: number; worn?: number; border?: string } = {}) {
  const key = 'sign_' + lines.join('|') + JSON.stringify(opts);
  return memo(key, () => {
    const W = opts.w || 512;
    const H = opts.h || 256;
    const c = cvs(W, H);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = opts.bg || '#1f5a34';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = opts.border || opts.fg || '#f2f2f2';
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, W - 20, H - 20);
    ctx.fillStyle = opts.fg || '#f2f2f2';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const n = lines.length;
    lines.forEach((t, i) => {
      const size = Math.min(H / (n + 0.6), (W * 0.9) / (t.length * 0.62));
      ctx.font = `bold ${size}px Arial, Helvetica, sans-serif`;
      ctx.fillText(t, W / 2, (H / (n + 1)) * (i + 1));
    });
    if (opts.worn) {
      const r = mulberry32(8);
      for (let i = 0; i < 260 * opts.worn; i++) {
        ctx.fillStyle = `rgba(${90 + r() * 50},${60 + r() * 30},30,${r() * 0.5})`;
        ctx.fillRect(r() * W, r() * H, 3 + r() * 20, 2 + r() * 14);
      }
      ctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 40; i++) {
        ctx.beginPath();
        ctx.arc(r() * W, r() * H, 2 + r() * 8, 0, 7);
        ctx.fill();
      }
    }
    return mk(c, true, false);
  });
}

export function hazardTex() {
  return memo('hazard', () => {
    const S = 128;
    const c = cvs(S, S);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#d7a91c';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#1a1a18';
    for (let i = -S; i < S * 2; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 16, 0);
      ctx.lineTo(i + 16 + S, S);
      ctx.lineTo(i + S, S);
      ctx.fill();
    }
    grain(ctx, S, S, 40, 2);
    return mk(c);
  });
}
