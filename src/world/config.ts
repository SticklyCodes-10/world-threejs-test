// World layout and infrastructure definition.
// Coordinate system: metres. +X = east, +Z = south (north is -Z), +Y = up.
// Province extent: 12 km x 12 km  (x,z in [-6000, 6000]).

export const HALF = 6000;

export const LAKE = { x: 900, z: 4200, R: 750, y: 22 };

export interface Site {
  name: string;
  x: number;
  z: number;
  ri: number; // fully flat radius
  ro: number; // blend-out radius
  y: number; // flat height (filled in by heightfield on init)
}

export const CITY = { x: 0, z: 0, S: 110, radius: 2000 };
export const ESTATE = { x: 0, z: -3500 };
export const HOSPITAL = { x: 3900, z: -3000 };
export const RELAY = { x: -700, z: -4600 };
export const VILLAGES = [
  { id: 'west', name: 'Alderbrook', x: -3700, z: 1800 },
  { id: 'east', name: 'Marlow Crossing', x: 3500, z: 1900 },
  { id: 'south', name: 'Fenwick', x: -200, z: 3500 },
];

export const SITES: Site[] = [
  { name: 'city', x: CITY.x, z: CITY.z, ri: 2500, ro: 3300, y: 0 },
  { name: 'estate', x: ESTATE.x, z: ESTATE.z, ri: 760, ro: 1150, y: 0 },
  { name: 'hospital', x: HOSPITAL.x, z: HOSPITAL.z, ri: 430, ro: 800, y: 0 },
  { name: 'relay', x: RELAY.x, z: RELAY.z, ri: 90, ro: 210, y: 0 },
  ...VILLAGES.map((v) => ({ name: v.id, x: v.x, z: v.z, ri: 270, ro: 480, y: 0 })),
];

export interface RiverDef {
  id: string;
  pts: number[][];
  w: number; // water width
  depth: number;
  falls?: { x: number; z: number; drop: number };
  canal?: boolean;
}

export const RIVERS: RiverDef[] = [
  {
    id: 'Verrin River',
    w: 28,
    depth: 6,
    pts: [
      [3600, -4900], [3480, -4400], [3350, -3900], [3250, -3300], [3250, -2300], [3100, -1500], [3050, -900],
      [3010, -200], [3000, 300], [2950, 900], [2900, 1500], [2700, 2100], [2400, 2700], [2000, 3250],
      [1600, 3750], [1350, 3980],
    ],
    falls: { x: 3350, z: -3900, drop: 42 },
  },
  {
    id: 'Hollow Creek',
    w: 14,
    depth: 4,
    pts: [
      [-4950, -1800], [-4500, -900], [-4200, -300], [-3700, 200], [-3300, 700], [-2900, 1300], [-2500, 2000],
      [-2200, 2700], [-1700, 3400], [-1000, 3900], [-300, 4250], [200, 4350],
    ],
  },
  {
    id: 'Industrial Drain',
    w: 7,
    depth: 3,
    canal: true,
    pts: [[2060, 330], [2400, 360], [2750, 290], [3010, 230]],
  },
];

export type RoadType = 'hwy' | 'art' | 'avenue' | 'sec' | 'rural' | 'mtn' | 'dirt' | 'rail' | 'ramp';

export interface RoadDef {
  id: string;
  name: string;
  type: RoadType;
  pts: number[][]; // [x, z, dy?]
  loop?: boolean;
  tunnelFrom?: number; // index of control point where road enters a tunnel
  smooth?: number;
  deadEnd?: boolean;
}

export const ROAD_WIDTH: Record<RoadType, number> = {
  hwy: 30, art: 17, avenue: 38, sec: 11, rural: 7.5, mtn: 7, dirt: 4.2, rail: 6.5, ramp: 8.5,
};

const ring = (r: number, n: number) => {
  const a: number[][] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    a.push([Math.cos(t) * r, Math.sin(t) * r]);
  }
  return a;
};
const circ = (cx: number, cz: number, r: number, n: number) => ring(r, n).map(([x, z]) => [x + cx, z + cz]);

export const ROADS: RoadDef[] = [
  { id: 'beltway', name: 'Beltway 1', type: 'hwy', loop: true, pts: ring(2350, 64), smooth: 6 },
  {
    id: 'h1', name: 'Northwest Highway', type: 'hwy', smooth: 22, tunnelFrom: 5,
    pts: [[-600, -2272], [-1000, -2700], [-1450, -3200], [-1750, -3800], [-1950, -4300], [-2050, -4600]],
  },
  {
    id: 'h2', name: 'East Highway', type: 'hwy', smooth: 22, tunnelFrom: 5,
    pts: [[2330, -300], [2800, -350], [3300, -420], [3900, -500], [4500, -750], [4800, -880]],
  },
  {
    id: 'h3', name: 'South Highway', type: 'hwy', smooth: 22, tunnelFrom: 5,
    pts: [[-300, 2331], [-600, 2800], [-1000, 3300], [-1400, 3800], [-1700, 4300], [-1900, 4650]],
  },
  {
    id: 'h4', name: 'West Highway', type: 'hwy', smooth: 22, tunnelFrom: 5,
    pts: [[-2300, -480], [-2800, -560], [-3400, -480], [-3900, -600], [-4300, -680], [-4600, -700]],
  },
  {
    id: 'capitol', name: 'Capitol Avenue', type: 'avenue', smooth: 14,
    pts: [[0, -1985, 0], [0, -2150, 0], [0, -2250, 6], [0, -2350, 7], [0, -2450, 6], [0, -2550, 0], [0, -2752, 0]],
  },
  { id: 'capitol2', name: 'Capitol Approach', type: 'avenue', smooth: 6, pts: [[0, -2848], [0, -2985]] },
  { id: 'capcircle', name: 'Capitol Circle', type: 'sec', loop: true, smooth: 2, pts: circ(0, -2800, 48, 20) },
  {
    id: 'east', name: 'Verrin Boulevard', type: 'art', smooth: 12,
    pts: [[1985, 0, 0], [2150, 0, 0], [2250, 0, 6], [2350, 0, 7], [2450, 0, 6], [2550, 0, 0], [2900, 10], [3350, 500], [3500, 1100], [3510, 1650], [3500, 1712]],
  },
  {
    id: 'south', name: 'Lakeshore Road', type: 'art', smooth: 12,
    pts: [[0, 1985, 0], [0, 2150, 0], [0, 2250, 6], [0, 2350, 7], [0, 2450, 6], [0, 2550, 0], [0, 2900], [-150, 3250], [-200, 3312]],
  },
  {
    id: 'west', name: 'Alderbrook Road', type: 'art', smooth: 12,
    pts: [[-1985, 0, 0], [-2150, 0, 0], [-2250, 0, 6], [-2350, 0, 7], [-2450, 0, 6], [-2550, 0, 0], [-3000, 300], [-3400, 900], [-3600, 1500], [-3700, 1612]],
  },
  { id: 'rampA', name: 'Exit 3 Ramp', type: 'ramp', smooth: 4, pts: [[2800, -350], [2850, -200], [2870, -60], [2900, 10]] },
  { id: 'rampC', name: 'Exit 7 Ramp', type: 'ramp', smooth: 4, pts: [[-600, 2800], [-400, 2850], [-200, 2885], [0, 2900]] },
  {
    id: 'service', name: 'Estate Service Road', type: 'rural', smooth: 10,
    pts: [[0, -3890], [-400, -4010], [-900, -3850], [-1300, -3650], [-1500, -3300]],
  },
  {
    id: 'hospital', name: 'Ashgrove Hospital Road', type: 'sec', smooth: 10,
    pts: [[3900, -500], [3950, -1000], [4250, -1500], [4150, -2000], [3750, -2250], [3850, -2450], [3900, -2670]],
  },
  {
    id: 'ruralA', name: 'Farm Road 12', type: 'rural', smooth: 10,
    pts: [[-3700, 1992], [-3300, 2600], [-2600, 3100], [-1700, 3300], [-900, 3450], [-382, 3500]],
  },
  {
    id: 'ruralB', name: 'Farm Road 14', type: 'rural', smooth: 10,
    pts: [[3500, 2092], [3100, 2700], [2400, 3000], [1500, 3100], [800, 3250], [300, 3400], [-18, 3480]],
  },
  {
    id: 'mtn1', name: 'Relay Station Road', type: 'mtn', smooth: 8, deadEnd: true,
    pts: [[-900, -3850], [-1050, -4000], [-650, -4080], [-1100, -4200], [-600, -4290], [-1100, -4400], [-650, -4480], [-950, -4560], [-700, -4600]],
  },
  {
    id: 'mtn2', name: 'Marlow Pass Road', type: 'mtn', smooth: 9, deadEnd: true,
    pts: [[3500, 2092], [3900, 2500], [4300, 2900], [4000, 3350], [4400, 3650], [4650, 3500]],
  },
  {
    id: 'mtn3', name: 'Alderbrook Forest Track', type: 'dirt', smooth: 4, deadEnd: true,
    pts: [[-3700, 1612], [-3950, 1250], [-4350, 1050], [-4200, 600], [-4600, 250]],
  },
  {
    id: 'dirt1', name: 'Logging Track', type: 'dirt', smooth: 4, deadEnd: true,
    pts: [[2400, 3000], [2900, 3500], [3400, 3500], [3750, 3900]],
  },
  // Rail network (main line crosses city on z = 715)
  {
    id: 'railW', name: 'Western Line', type: 'rail', smooth: 14, tunnelFrom: 5,
    pts: [[-2000, 715], [-2800, 690], [-3500, 620], [-4000, 560], [-4500, 470], [-4800, 400]],
  },
  {
    id: 'railE', name: 'Eastern Line', type: 'rail', smooth: 14, tunnelFrom: 5,
    pts: [[2000, 715], [2500, 730], [2950, 800], [3500, 1000], [4100, 1200], [4800, 1500]],
  },
  { id: 'railMain', name: 'Central Line', type: 'rail', smooth: 2, pts: [[-2000, 715], [-1000, 715], [0, 715], [1000, 715], [2000, 715]] },
  { id: 'yard1', name: 'Yard Lead', type: 'rail', smooth: 2, pts: [[1150, 715], [1260, 765], [1350, 803], [1450, 805], [2000, 805]] },
  { id: 'yard2', name: 'Yard Track 2', type: 'rail', smooth: 2, pts: [[1330, 790], [1420, 818], [1500, 820], [2000, 820]] },
  { id: 'yard3', name: 'Yard Track 3', type: 'rail', smooth: 2, pts: [[1390, 806], [1480, 833], [1560, 835], [2000, 835]] },
];

export const LANDMARKS = {
  estate: { name: 'Government Estate', x: ESTATE.x, z: ESTATE.z },
  hospital: { name: 'Ashgrove Research Hospital', x: HOSPITAL.x, z: HOSPITAL.z },
  downtown: { name: 'Downtown', x: 0, z: 0 },
  industrial: { name: 'Industrial District', x: 1500, z: 450 },
  lake: { name: 'Lake Verrin', x: LAKE.x, z: LAKE.z },
  falls: { name: 'Verrin Falls', x: 3350, z: -3900 },
  relay: { name: 'Relay Station', x: RELAY.x, z: RELAY.z },
};
