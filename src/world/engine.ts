// Orchestrates all world systems, rendering loop, teleports and HUD data.
import * as THREE from 'three';
import { Atmosphere } from './atmosphere';
import { CitySystem } from './city';
import { ESTATE, HOSPITAL, LAKE, RELAY, VILLAGES } from './config';
import { Controls } from './controls';
import { EstateSystem } from './estate';
import { facadeUniforms } from './facade';
import { height, initHeightfield } from './heightfield';
import { HospitalSystem } from './hospital';
import { InfrastructureSystem } from './infrastructure';
import { buildMinimap } from './minimap';
import { RoadSystem } from './roads';
import { TerrainSystem } from './terrain';
import { VegetationSystem } from './vegetation';
import { WaterSystem } from './water';
import { clamp } from './noise';

export type Quality = 'low' | 'medium' | 'high' | 'ultra';

export interface HudState {
  fps: number;
  x: number;
  y: number;
  z: number;
  alt: number;
  heading: number;
  mode: string;
  place: string;
  time: number;
  speed: number;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export class WorldEngine {
  renderer!: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, 0.5, 34000);
  atmo!: Atmosphere;
  terrain!: TerrainSystem;
  veg!: VegetationSystem;
  water!: WaterSystem;
  roads!: RoadSystem;
  city!: CitySystem;
  estate!: EstateSystem;
  hospital!: HospitalSystem;
  infra!: InfrastructureSystem;
  controls!: Controls;
  minimap!: HTMLCanvasElement;
  canvas: HTMLCanvasElement;
  running = false;
  private raf = 0;
  private last = 0;
  private time = 0;
  private fps = 60;
  private lastNear = 0.5;
  private placeCache = { t: 0, v: '' };
  quality: Quality = 'high';
  private slowFrames = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  async init(progress: (p: number, label: string) => void) {
    const canvas = this.canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.resize();
    window.addEventListener('resize', () => this.resize());

    progress(0.02, 'Lighting the sky');
    this.atmo = new Atmosphere(this.scene, this.renderer);
    this.controls = new Controls(this.camera, canvas);
    await tick();

    progress(0.05, 'Surveying the province');
    initHeightfield();
    await tick();

    progress(0.08, 'Raising mountains and carving valleys');
    const start = new THREE.Vector3(-2400, 760, 2900);
    this.terrain = new TerrainSystem(this.scene);
    await this.terrain.buildAll(start, (p) => progress(0.08 + p * 0.4, 'Raising mountains and carving valleys'));

    progress(0.5, 'Laying highways, rails, bridges and tunnels');
    this.roads = new RoadSystem(this.scene);
    await tick();

    progress(0.58, 'Filling rivers, lake and waterfall');
    this.water = new WaterSystem(this.scene);
    await tick();

    progress(0.62, 'Constructing the city');
    this.city = new CitySystem(this.scene);
    await tick();

    progress(0.74, 'Building the government estate');
    this.estate = new EstateSystem(this.scene);
    await tick();

    progress(0.8, 'Abandoning the research hospital');
    this.hospital = new HospitalSystem(this.scene);
    await tick();

    progress(0.85, 'Erecting remote infrastructure');
    this.infra = new InfrastructureSystem(this.scene);
    await tick();

    progress(0.88, 'Growing forests');
    this.veg = new VegetationSystem(this.scene);
    await this.veg.prime(start, (p) => progress(0.88 + p * 0.08, 'Growing forests'));

    progress(0.97, 'Drawing the map');
    this.minimap = buildMinimap(360, this.city.blocks);
    this.controls.setColliders([...this.city.colliders, ...this.estate.colliders, ...this.hospital.colliders]);
    this.atmo.setTime(15.2);
    this.controls.lookAt(start, new THREE.Vector3(0, 40, -500));
    this.controls.setMode('fly');
    this.setQuality('high');
    progress(1, 'Ready');
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setQuality(q: Quality) {
    this.quality = q;
    const dpr = window.devicePixelRatio;
    const pr = q === 'low' ? 0.75 : q === 'medium' ? 1 : q === 'high' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
    this.renderer.setPixelRatio(pr);
    this.resize();
    this.atmo.sun.castShadow = q !== 'low';
    this.atmo.setShadowRes(q === 'ultra' ? 4096 : q === 'high' ? 3072 : 2048);
    this.veg.density = q === 'low' ? 0.45 : q === 'medium' ? 0.75 : 1;
    for (const k of this.veg.cells.keys()) {
      const c = this.veg.cells.get(k)!;
      this.veg.group.remove(c.g);
    }
    this.veg.cells.clear();
  }

  setTime(h: number) {
    this.atmo.setTime(h);
  }
  setTimeSpeed(s: number) {
    this.atmo.speed = s;
  }
  setBaseSpeed(v: number) {
    this.controls.baseSpeed = v;
  }

  teleport(id: string) {
    const c = this.controls;
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const g = (x: number, z: number) => height(x, z);
    c.setMode('fly');
    switch (id) {
      case 'overview':
        c.lookAt(V(-2400, 760, 2900), V(0, 40, -500));
        break;
      case 'downtown': {
        c.setMode('walk');
        c.lookAt(V(0, g(0, 400) + 1.75, 420), V(0, 80, 0));
        break;
      }
      case 'skyline':
        c.lookAt(V(900, g(900, 1500) + 220, 1500), V(0, 120, 0));
        break;
      case 'estate':
        c.lookAt(V(ESTATE.x - 90, g(0, ESTATE.z + 380) + 45, ESTATE.z + 420), V(ESTATE.x, g(0, ESTATE.z) + 18, ESTATE.z - 25));
        break;
      case 'estateGate':
        c.setMode('walk');
        c.lookAt(V(ESTATE.x, g(0, ESTATE.z + 600) + 1.75, ESTATE.z + 610), V(ESTATE.x, g(0, ESTATE.z) + 18, ESTATE.z - 30));
        break;
      case 'hospital':
        c.lookAt(V(HOSPITAL.x + 40, g(HOSPITAL.x, HOSPITAL.z + 300) + 38, HOSPITAL.z + 320), V(HOSPITAL.x, g(HOSPITAL.x, HOSPITAL.z) + 14, HOSPITAL.z - 40));
        break;
      case 'hospitalGround':
        c.setMode('walk');
        c.lookAt(V(HOSPITAL.x + 10, g(HOSPITAL.x, HOSPITAL.z + 230) + 1.75, HOSPITAL.z + 230), V(HOSPITAL.x, g(HOSPITAL.x, HOSPITAL.z) + 16, HOSPITAL.z));
        break;
      case 'mountains':
        c.lookAt(V(-1900, 1500, -2600), V(2000, 700, -5200));
        break;
      case 'falls':
        c.lookAt(V(3350 + 120, g(3350, -3900) + 70, -3900 + 190), V(3350, g(3350, -3900) + 10, -3900));
        break;
      case 'lake':
        c.lookAt(V(LAKE.x - 900, g(LAKE.x - 900, LAKE.z - 500) + 140, LAKE.z - 500), V(LAKE.x, 22, LAKE.z));
        break;
      case 'highway':
        c.lookAt(V(2350 - 60, g(2300, -200) + 38, -300), V(2330, g(2330, 400) + 10, 600));
        break;
      case 'industrial':
        c.lookAt(V(1200, 230, 1700), V(1500, 60, 500));
        break;
      case 'windfarm':
        c.lookAt(V(-3600, g(-3600, -1500) + 200, -1300), V(-3000, g(-3000, -2400) + 80, -2400));
        break;
      case 'relay':
        c.lookAt(V(RELAY.x + 140, g(RELAY.x, RELAY.z) + 70, RELAY.z + 160), V(RELAY.x, g(RELAY.x, RELAY.z) + 25, RELAY.z));
        break;
      case 'village': {
        const v = VILLAGES[0];
        c.lookAt(V(v.x + 220, g(v.x, v.z) + 120, v.z + 260), V(v.x, g(v.x, v.z) + 5, v.z));
        break;
      }
    }
  }

  teleportXZ(x: number, z: number) {
    const g = height(x, z);
    const alt = Math.max(g + 260, 300);
    this.controls.setMode('fly');
    this.controls.lookAt(new THREE.Vector3(x, alt, z + 380), new THREE.Vector3(x, g, z));
  }

  private place(x: number, z: number, alt: number) {
    const now = performance.now();
    if (now - this.placeCache.t < 400) return this.placeCache.v;
    let v = 'Open countryside';
    const d = (cx: number, cz: number) => Math.hypot(x - cx, z - cz);
    if (d(ESTATE.x, ESTATE.z) < 650) v = 'Government Estate';
    else if (d(HOSPITAL.x, HOSPITAL.z) < 450) v = 'Ashgrove Research Hospital (abandoned)';
    else if (d(RELAY.x, RELAY.z) < 200) v = 'Mountain Relay Station';
    else if (d(LAKE.x, LAKE.z) < LAKE.R * 1.2) v = 'Lake Verrin';
    else {
      let found = '';
      for (const vl of VILLAGES) if (d(vl.x, vl.z) < 420) found = 'Village of ' + vl.name;
      if (!found && Math.hypot(x, z) < 2020) {
        const b = this.city.blocks.find((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
        const map: Record<string, string> = {
          tower: 'Downtown', plaza: 'Downtown Plaza', office: 'Commercial District', hotel: 'Commercial District', mall: 'Shopping Centre', retail: 'Retail Quarter', gas: 'Commercial District',
          parking: 'Commercial District', apartments: 'Residential – Apartments', houses: 'Residential – Suburbs', industrial: 'Industrial District', yard: 'Rail Freight Yard', rail: 'Rail Corridor',
          park: 'City Park', school: 'School Campus', hospital: 'City Hospital', police: 'Police Station', fire: 'Fire Station', gov: 'Government Offices', station: 'Central Station', bus: 'Bus Terminal', church: 'Church',
        };
        found = b ? map[b.zone] || 'City' : 'City streets';
      }
      if (found) v = found;
      else if (alt < 0 && false) v = '';
      else if (height(x, z) > 900) v = 'Alpine Peaks';
      else if (height(x, z) > 350) v = 'Mountain Slopes';
      else if (Math.hypot(x, z) < 3300) v = 'City Outskirts';
    }
    this.placeCache = { t: now, v };
    return v;
  }

  getHud(): HudState {
    const p = this.camera.position;
    const gy = this.controls.groundY;
    const heading = ((-this.controls.yaw * 180) / Math.PI + 360 * 10) % 360;
    return {
      fps: Math.round(this.fps),
      x: Math.round(p.x),
      y: Math.round(p.y),
      z: Math.round(p.z),
      alt: Math.round(p.y - gy),
      heading: Math.round(heading),
      mode: this.controls.mode,
      place: this.place(p.x, p.z, p.y - gy),
      time: this.atmo.timeOfDay,
      speed: Math.round(this.controls.vel.length() * 3.6),
    };
  }

  start() {
    this.running = true;
    this.last = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (t - this.last) / 1000);
      this.last = t;
      this.time += dt;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame(dt: number) {
    this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.05;
    const cam = this.camera;
    this.controls.update(dt);
    const alt = Math.max(0.5, cam.position.y - this.controls.groundY);
    const near = clamp(alt * 0.04, 0.35, 45);
    if (Math.abs(near - this.lastNear) / this.lastNear > 0.08) {
      cam.near = near;
      cam.far = 34000;
      cam.updateProjectionMatrix();
      this.lastNear = near;
    }
    this.atmo.update(dt, cam.position, alt);
    facadeUniforms.uNight.value = this.atmo.night;
    const night = this.atmo.night;
    this.terrain.update(cam.position, 7);
    this.veg.update(cam.position, 4);
    this.city.update(night, dt);
    this.roads.update(night);
    this.estate.lamps.update(night);
    this.estate.update(this.time);
    this.hospital.update(this.time, night);
    this.water.update(dt);
    this.infra.update(this.time);
    this.renderer.render(this.scene, cam);
    // adaptive quality guard: if we are really slow early on, back off once
    if (this.fps < 18) this.slowFrames++;
    else this.slowFrames = Math.max(0, this.slowFrames - 2);
    if (this.slowFrames > 240 && this.quality !== 'low') {
      this.slowFrames = 0;
      this.setQuality(this.quality === 'ultra' ? 'high' : this.quality === 'high' ? 'medium' : 'low');
      this.onQualityAuto?.(this.quality);
    }
  }
  onQualityAuto?: (q: Quality) => void;
}
