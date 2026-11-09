// Free-fly / ground-walk camera controller with smooth motion and simple building collision.
import * as THREE from 'three';
import { height } from './heightfield';
import type { Collider } from './city';
import { clamp } from './noise';

export class Controls {
  camera: THREE.PerspectiveCamera;
  dom: HTMLElement;
  yaw = 0;
  pitch = 0;
  vel = new THREE.Vector3();
  keys = new Set<string>();
  baseSpeed = 40;
  mode: 'fly' | 'walk' = 'fly';
  fov = 60;
  targetFov = 60;
  locked = false;
  dragging = false;
  groundY = 0;
  colliders: Collider[] = [];
  private grid = new Map<string, Collider[]>();
  onModeChange?: (m: 'fly' | 'walk') => void;
  private lookDX = 0;
  private lookDY = 0;
  enabled = true;

  constructor(camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    this.camera = camera;
    this.dom = dom;
    const kd = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      this.keys.add(e.code);
      if (e.code === 'KeyG') this.setMode(this.mode === 'fly' ? 'walk' : 'fly');
      if (e.code === 'BracketRight' || e.code === 'Equal') this.baseSpeed = clamp(this.baseSpeed * 1.25, 4, 600);
      if (e.code === 'BracketLeft' || e.code === 'Minus') this.baseSpeed = clamp(this.baseSpeed / 1.25, 4, 600);
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    };
    const ku = (e: KeyboardEvent) => this.keys.delete(e.code);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', () => this.keys.clear());
    dom.addEventListener('mousedown', (e) => {
      this.dragging = true;
      if (e.button === 0 || e.button === 2) {
        try {
          dom.requestPointerLock?.();
        } catch {
          /* ignore */
        }
      }
    });
    window.addEventListener('mouseup', () => (this.dragging = false));
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => (this.locked = document.pointerLockElement === dom));
    window.addEventListener('mousemove', (e) => {
      if (!this.locked && !this.dragging) return;
      this.lookDX += e.movementX || 0;
      this.lookDY += e.movementY || 0;
    });
    dom.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.targetFov = clamp(this.targetFov + e.deltaY * 0.03, 22, 95);
      },
      { passive: false }
    );
  }

  setColliders(list: Collider[]) {
    this.colliders = list;
    this.grid.clear();
    const CS = 120;
    for (const c of list) {
      const r = Math.hypot(c.hx, c.hz);
      for (let gx = Math.floor((c.x - r) / CS); gx <= Math.floor((c.x + r) / CS); gx++)
        for (let gz = Math.floor((c.z - r) / CS); gz <= Math.floor((c.z + r) / CS); gz++) {
          const k = gx + ',' + gz;
          let a = this.grid.get(k);
          if (!a) this.grid.set(k, (a = []));
          a.push(c);
        }
    }
  }

  setMode(m: 'fly' | 'walk') {
    this.mode = m;
    this.onModeChange?.(m);
  }

  lookAt(from: THREE.Vector3, target: THREE.Vector3) {
    this.camera.position.copy(from);
    const dx = target.x - from.x, dy = target.y - from.y, dz = target.z - from.z;
    this.yaw = Math.atan2(-dx, -dz);
    this.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    this.vel.set(0, 0, 0);
  }

  private collide(p: THREE.Vector3) {
    const k = Math.floor(p.x / 120) + ',' + Math.floor(p.z / 120);
    const list = this.grid.get(k);
    if (!list) return;
    const R = 0.7;
    for (const c of list) {
      if (p.y - 1.75 > c.h) continue;
      const dx = p.x - c.x, dz = p.z - c.z;
      const lx = dx * c.c - dz * c.s;
      const lz = dx * c.s + dz * c.c;
      const ox = Math.abs(lx) - c.hx - R;
      const oz = Math.abs(lz) - c.hz - R;
      if (ox < 0 && oz < 0) {
        let nx = 0, nz = 0;
        if (ox > oz) nx = (lx > 0 ? 1 : -1) * -ox;
        else nz = (lz > 0 ? 1 : -1) * -oz;
        p.x += nx * c.c + nz * c.s;
        p.z += -nx * c.s + nz * c.c;
      }
    }
  }

  update(dt: number) {
    dt = Math.min(dt, 0.1);
    const cam = this.camera;
    if (this.enabled) {
      const sens = 0.0022 * (this.fov / 60);
      this.yaw -= this.lookDX * sens;
      this.pitch = clamp(this.pitch - this.lookDY * sens, -1.55, 1.55);
    }
    this.lookDX = this.lookDY = 0;
    this.fov += (this.targetFov - this.fov) * (1 - Math.exp(-dt * 10));
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
    const k = this.keys;
    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const r = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const u = (k.has('Space') || k.has('KeyE') ? 1 : 0) - (k.has('KeyC') || k.has('KeyQ') ? 1 : 0);
    const boost = k.has('ShiftLeft') || k.has('ShiftRight') ? 4 : k.has('ControlLeft') ? 0.25 : 1;
    const gy = height(cam.position.x, cam.position.z);
    const alt = Math.max(0, cam.position.y - gy);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dir = new THREE.Vector3();
    let speed: number;
    if (this.mode === 'fly') {
      speed = this.baseSpeed * boost * clamp(0.35 + alt / 90, 0.35, 40);
      dir.set(-sy * cp * f + cy * r, sp * f + u, -cy * cp * f - sy * r);
    } else {
      speed = (this.baseSpeed > 40 ? 8 : 5.2) * boost * 0.9;
      dir.set(-sy * f + cy * r, 0, -cy * f - sy * r);
    }
    if (dir.lengthSq() > 1) dir.normalize();
    const target = dir.multiplyScalar(speed);
    this.vel.lerp(target, 1 - Math.exp(-dt * (this.mode === 'fly' ? 5 : 12)));
    cam.position.addScaledVector(this.vel, dt);
    if (this.mode === 'walk') {
      this.collide(cam.position);
      const g = height(cam.position.x, cam.position.z) + 1.75;
      cam.position.y += (g - cam.position.y) * (1 - Math.exp(-dt * 12));
    } else {
      const minY = gy + 2.2;
      if (cam.position.y < minY) cam.position.y += (minY - cam.position.y) * Math.min(1, dt * 10) + 0.001;
      if (cam.position.y < minY - 0.5) cam.position.y = minY - 0.5;
      cam.position.y = Math.min(cam.position.y, 6000);
    }
    cam.position.x = clamp(cam.position.x, -6400, 6400);
    cam.position.z = clamp(cam.position.z, -6400, 6400);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(this.pitch, this.yaw, 0);
    this.groundY = gy;
  }
}
