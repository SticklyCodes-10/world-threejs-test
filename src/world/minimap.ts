import { HALF, LANDMARKS, VILLAGES } from './config';
import { height, rivers, roads } from './heightfield';
import type { BlockInfo } from './city';

const ZONE_COL: Record<string, string> = {
  tower: '#d4d6e4', plaza: '#d8d2c0', office: '#b9bccb', hotel: '#b9bccb', mall: '#c8aaa0', retail: '#cdb69a', gas: '#c8aaa0', parking: '#9a9aa2',
  apartments: '#bfa890', houses: '#a99c84', park: '#6ea168', school: '#c99a7a', hospital: '#e8e8f0', police: '#8fa0c8', fire: '#d08a7a', gov: '#e6e0c4',
  station: '#8a8a92', bus: '#8a8a92', industrial: '#8a7f86', yard: '#6f6a70', rail: '#6c6862', church: '#c0b090',
};

export function buildMinimap(S: number, blocks: BlockInfo[]) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const N = S + 1;
  const H = new Float32Array(N * N);
  const step = (HALF * 2) / S;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = height(-HALF + i * step, -HALF + j * step);
  const id = g.createImageData(S, S);
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      const h = H[j * N + i];
      const dx = H[j * N + i + 1] - H[j * N + Math.max(0, i - 1)];
      const dz = H[(j + 1) * N + i] - H[Math.max(0, j - 1) * N + i];
      const shade = Math.max(0.55, Math.min(1.5, 1 + (-dx * 0.7 - dz * 0.5) * 0.006));
      let r: number, gg: number, b: number;
      if (h < 22.4) [r, gg, b] = [58, 104, 138];
      else if (h < 140) [r, gg, b] = [92, 128, 78];
      else if (h < 500) [r, gg, b] = [84 + (h - 140) * 0.1, 112, 74];
      else if (h < 1000) [r, gg, b] = [118 + (h - 500) * 0.05, 118, 98];
      else if (h < 1300) [r, gg, b] = [140, 134, 126];
      else [r, gg, b] = [236, 238, 242];
      const k = (j * S + i) * 4;
      id.data[k] = Math.min(255, r * shade);
      id.data[k + 1] = Math.min(255, gg * shade);
      id.data[k + 2] = Math.min(255, b * shade);
      id.data[k + 3] = 255;
    }
  g.putImageData(id, 0, 0);
  const P = (x: number) => ((x + HALF) / (HALF * 2)) * S;
  g.lineCap = 'round';
  // rivers
  g.strokeStyle = '#4b86b0';
  for (const r of rivers) {
    g.lineWidth = Math.max(1, r.hw * 0.1);
    g.beginPath();
    for (let i = 0; i < r.n; i += 2) (i ? g.lineTo : g.moveTo).call(g, P(r.x[i]), P(r.z[i]));
    g.stroke();
  }
  // city blocks
  for (const b of blocks) {
    g.fillStyle = ZONE_COL[b.zone] || '#aaa';
    g.fillRect(P(b.x0), P(b.z0), Math.max(1, P(b.x1) - P(b.x0)), Math.max(1, P(b.z1) - P(b.z0)));
  }
  // roads
  for (const r of roads) {
    const t = r.type;
    g.strokeStyle = t === 'hwy' ? '#f1d36a' : t === 'rail' ? '#2e2a2a' : t === 'avenue' || t === 'art' ? '#f3f0e8' : t === 'dirt' ? '#a48a5c' : '#e0dccf';
    g.lineWidth = t === 'hwy' ? 1.6 : t === 'avenue' || t === 'art' ? 1.1 : 0.7;
    if (t === 'rail') g.setLineDash([2, 1.5]);
    else g.setLineDash([]);
    g.beginPath();
    for (let i = 0; i < r.n; i += 2) (i ? g.lineTo : g.moveTo).call(g, P(r.x[i]), P(r.z[i]));
    g.stroke();
  }
  g.setLineDash([]);
  // landmarks
  const mark = (x: number, z: number, col: string, r = 3.5) => {
    g.fillStyle = '#000a';
    g.beginPath();
    g.arc(P(x), P(z), r + 1.5, 0, 7);
    g.fill();
    g.fillStyle = col;
    g.beginPath();
    g.arc(P(x), P(z), r, 0, 7);
    g.fill();
  };
  mark(LANDMARKS.estate.x, LANDMARKS.estate.z, '#ffd54a', 4);
  mark(LANDMARKS.hospital.x, LANDMARKS.hospital.z, '#ff4a4a', 4);
  for (const v of VILLAGES) mark(v.x, v.z, '#fff', 2.2);
  mark(LANDMARKS.relay.x, LANDMARKS.relay.z, '#7ad7ff', 2.5);
  return c;
}
