import * as THREE from 'three';
import { height } from './heightfield';

// A compact regional airport placed on the open western edge of Verrin.
export const AIRPORT = { x: -4200, z: 700 };

export class AirportSystem {
  group = new THREE.Group();

  constructor(scene: THREE.Scene) {
    const { x, z } = AIRPORT;
    const y = height(x, z) + 1.1;
    this.group.name = 'Verrin Regional Airport';

    const mat = (color: number, roughness = 0.86, metalness = 0) =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness });
    const addBox = (name: string, px: number, py: number, pz: number, sx: number, sy: number, sz: number, material: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
      mesh.name = name;
      mesh.position.set(px, py, pz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    const addPlane = (name: string, px: number, py: number, pz: number, sx: number, sz: number, material: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), material);
      mesh.name = name;
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(px, py, pz);
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };

    const apron = mat(0x777b7c);
    const runway = mat(0x252b31, 0.96);
    const concrete = mat(0x969895);
    const white = mat(0xf4f0df, 0.7);
    const yellow = mat(0xf0bd42, 0.7);
    const dark = mat(0x343a3c);
    const glass = new THREE.MeshStandardMaterial({ color: 0x477080, roughness: 0.22, metalness: 0.35 });

    // Broad graded airport apron and the main runway, aligned north–south.
    addPlane('Airport apron', x, y, z, 1850, 1900, apron);
    addPlane('Runway 18/36', x, y + 0.18, z, 112, 1560, runway);
    addPlane('Taxiway', x + 105, y + 0.2, z + 20, 34, 1180, concrete);
    addPlane('Aircraft apron', x + 260, y + 0.22, z + 280, 390, 480, concrete);

    // Runway edge strips and broken centreline.
    for (const side of [-1, 1]) {
      addBox('Runway edge line', x + side * 53, y + 0.42, z, 1.4, 0.08, 1530, white);
      for (let i = 0; i < 30; i++) {
        const pz = z - 720 + i * 49;
        addBox('Centreline dash', x, y + 0.43, pz, 1.5, 0.08, 24, white);
      }
      for (let i = 0; i < 8; i++) {
        const px = x + side * (9 + i * 4.8);
        addBox('Threshold bar', px, y + 0.44, z - 730, 2.7, 0.08, 34, white);
        addBox('Threshold bar', px, y + 0.44, z + 730, 2.7, 0.08, 34, white);
      }
    }
    // Taxiway centreline and holding-position bars.
    addBox('Taxiway centreline', x + 105, y + 0.43, z + 20, 0.7, 0.08, 1110, yellow);
    for (const dz of [-520, 520]) {
      addBox('Hold short marking', x + 105, y + 0.46, z + dz, 31, 0.08, 2.2, yellow);
      addBox('Hold short marking', x + 105, y + 0.46, z + dz + 5, 31, 0.08, 2.2, white);
    }

    // Runway lighting, approach lights and taxiway edge lamps.
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xd9f4ff, emissive: 0x9bdfff, emissiveIntensity: 2.2 });
    const amberMat = new THREE.MeshStandardMaterial({ color: 0xffc15a, emissive: 0xff9d28, emissiveIntensity: 1.8 });
    const lampGeo = new THREE.SphereGeometry(1.15, 8, 6);
    const addLamp = (px: number, pz: number, material: THREE.Material, size = 1.15) => {
      const lamp = new THREE.Mesh(size === 1.15 ? lampGeo : new THREE.SphereGeometry(size, 8, 6), material);
      lamp.position.set(px, y + 1.3, pz);
      this.group.add(lamp);
    };
    for (let i = 0; i < 48; i++) {
      const pz = z - 750 + i * 32;
      for (const side of [-1, 1]) {
        addLamp(x + side * 61, pz, i < 5 || i > 42 ? amberMat : lampMat);
        if (i % 2 === 0) addLamp(x + 105 + side * 21, pz, amberMat, 0.8);
      }
    }
    for (let i = 0; i < 9; i++) {
      addLamp(x, z - 980 - i * 28, lampMat, 1.35);
      addLamp(x, z + 980 + i * 28, lampMat, 1.35);
    }

    // A low terminal, control tower and two hangars establish the airport silhouette.
    addBox('Terminal building', x + 470, y + 12, z + 330, 170, 24, 58, concrete);
    addBox('Terminal glass frontage', x + 470, y + 10, z + 299, 145, 13, 1.2, glass);
    addBox('Terminal roof', x + 470, y + 25, z + 330, 180, 2, 68, dark);
    addBox('Control tower shaft', x + 575, y + 22, z + 215, 13, 44, 13, concrete);
    addBox('Control tower cab', x + 575, y + 47, z + 215, 25, 9, 25, glass);
    addBox('Control tower roof', x + 575, y + 52, z + 215, 27, 1.4, 27, dark);
    addBox('Hangar A', x + 310, y + 10, z - 80, 100, 20, 72, dark);
    addBox('Hangar A doors', x + 310, y + 9, z - 43, 72, 16, 1.2, concrete);
    addBox('Hangar B', x + 470, y + 9, z - 100, 82, 18, 62, dark);
    addBox('Hangar B doors', x + 470, y + 8, z - 68, 58, 14, 1.2, concrete);

    // Windsock and perimeter markers.
    addBox('Windsock mast', x - 155, y + 8, z + 500, 0.8, 16, 0.8, dark);
    addBox('Windsock', x - 145, y + 15, z + 500, 19, 1.3, 1.3, yellow);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      addBox('Perimeter marker', x + Math.cos(a) * 910, y + 1.6, z + Math.sin(a) * 910, 3, 3.2, 3, white);
    }
    scene.add(this.group);
  }
}
