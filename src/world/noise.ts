// Deterministic noise + RNG utilities used by all world systems.

export function mulberry32(seed: number) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// permutation table
const perm = new Uint8Array(512);
{
  const r = mulberry32(1337);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}
const GX = new Float32Array([1, -1, 1, -1, 0.7071, -0.7071, 0.7071, -0.7071]);
const GZ = new Float32Array([1, 1, -1, -1, 0.7071, 0.7071, -0.7071, -0.7071]);

/** Perlin-style gradient noise, range approx [-1,1] */
export function noise2(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const X = xi & 255;
  const Z = zi & 255;
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
  const v = zf * zf * zf * (zf * (zf * 6 - 15) + 10);
  const g00 = perm[perm[X] + Z] & 7;
  const g10 = perm[perm[X + 1] + Z] & 7;
  const g01 = perm[perm[X] + Z + 1] & 7;
  const g11 = perm[perm[X + 1] + Z + 1] & 7;
  const n00 = GX[g00] * xf + GZ[g00] * zf;
  const n10 = GX[g10] * (xf - 1) + GZ[g10] * zf;
  const n01 = GX[g01] * xf + GZ[g01] * (zf - 1);
  const n11 = GX[g11] * (xf - 1) + GZ[g11] * (zf - 1);
  const a = n00 + (n10 - n00) * u;
  const b = n01 + (n11 - n01) * u;
  return (a + (b - a) * v) * 1.4;
}

export function fbm(x: number, z: number, oct = 4, lac = 2.03, gain = 0.5): number {
  let amp = 1;
  let sum = 0;
  let norm = 0;
  let fx = x;
  let fz = z;
  for (let i = 0; i < oct; i++) {
    sum += noise2(fx, fz) * amp;
    norm += amp;
    amp *= gain;
    fx = fx * lac + 17.3;
    fz = fz * lac - 9.1;
  }
  return sum / norm;
}

/** Ridged multifractal, range ~[0,1] – gives sharp mountain crests */
export function ridge(x: number, z: number, oct = 5): number {
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  let w = 1;
  let fx = x;
  let fz = z;
  for (let i = 0; i < oct; i++) {
    let n = 1 - Math.abs(noise2(fx, fz));
    n = n * n;
    n *= w;
    w = clamp(n * 1.6, 0, 1);
    sum += n * amp;
    norm += amp;
    amp *= 0.5;
    fx = fx * 2.1 + 31.7;
    fz = fz * 2.1 - 12.9;
  }
  return sum / norm;
}

export function hash2(ix: number, iz: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
