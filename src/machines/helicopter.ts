import * as THREE from "three";
import {
  C,
  blobShadow,
  box,
  clamp,
  cyl,
  glow,
  mat,
  pivot,
} from "./shared";

export type HeavyLiftHelicopter = THREE.Group & {
  fuselage: THREE.Group;
  mainRotor: THREE.Group;
  tailRotor: THREE.Group;
  slingHook: THREE.Group;
  slingCable: THREE.Mesh;
  spinRotors: (delta: number) => void;
  setHookLength: (length: number) => void;
};

function blade(length: number, width: number, material: THREE.Material): THREE.Mesh {
  const mesh = box(width, 0.06, length, material, 0, 0, length * 0.5);
  const tip = box(width * 1.05, 0.07, 0.35, mat(C.safety, 0.1, 0.45), 0, 0.01, length);
  mesh.add(tip);
  return mesh;
}

/** Heavy-lift utility helicopter with spinning rotors and a sling hook. */
export function createHeavyLiftHelicopter(): HeavyLiftHelicopter {
  const group = new THREE.Group() as HeavyLiftHelicopter;
  group.name = "heavyLiftHelicopter";

  const olive = mat(C.olive);
  const oliveDark = mat(C.oliveDark);
  const tan = mat(C.tan);
  const steel = mat(C.steel, 0.5, 0.45);
  const dark = mat(C.steelDark, 0.55, 0.4);
  const glass = mat(C.glass, 0.15, 0.15);
  glass.transparent = true;
  glass.opacity = 0.5;

  const fuselage = pivot("fuselage", 0, 2.2, 0);
  fuselage.add(box(2.2, 1.6, 7.4, olive, 0, 0, -0.2));
  fuselage.add(box(2.0, 0.25, 6.6, tan, 0, -0.85, -0.2));
  fuselage.add(box(1.7, 1.0, 1.6, oliveDark, 0, 0.15, 3.2));
  fuselage.add(box(1.5, 0.7, 0.08, glass, 0, 0.2, 4.02));
  fuselage.add(box(0.08, 0.7, 1.2, glass, 0.82, 0.2, 3.3));
  fuselage.add(box(0.08, 0.7, 1.2, glass, -0.82, 0.2, 3.3));
  fuselage.add(box(0.18, 0.12, 0.14, glow(C.light, 0.8), 0.6, -0.3, 4.05));
  fuselage.add(box(0.18, 0.12, 0.14, glow(C.light, 0.8), -0.6, -0.3, 4.05));
  // Tail boom
  fuselage.add(box(0.55, 0.5, 5.2, olive, 0, 0.2, -6.0));
  fuselage.add(box(0.2, 0.08, 4.6, mat(C.safety), 0, 0.5, -6.0));
  fuselage.add(box(0.12, 1.4, 0.7, oliveDark, 0, 0.7, -8.4));
  group.add(fuselage);
  group.fuselage = fuselage;

  const hub = cyl(0.28, 0.28, 0.35, 8, dark, 0, 1.05, 0);
  fuselage.add(hub);

  const mainRotor = pivot("mainRotor", 0, 1.28, 0);
  const bladeMat = mat(C.steelDark, 0.3, 0.6);
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.y = (i / 4) * Math.PI * 2;
    arm.add(blade(7.2, 0.38, bladeMat));
    mainRotor.add(arm);
  }
  fuselage.add(mainRotor);
  group.mainRotor = mainRotor;

  const tailRotor = pivot("tailRotor", 0.45, 1.15, -8.45);
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.x = (i / 4) * Math.PI * 2;
    const b = box(0.08, 0.18, 1.3, bladeMat, 0, 0, 0.65);
    b.add(box(0.09, 0.2, 0.16, mat(C.safety), 0, 0, 1.25));
    arm.add(b);
    tailRotor.add(arm);
  }
  fuselage.add(tailRotor);
  group.tailRotor = tailRotor;

  const cableMat = mat(C.steelLight, 0.7, 0.3);
  const slingCable = cyl(0.035, 0.035, 1, 6, cableMat, 0, 0, 0, "slingCable");
  slingCable.position.set(0, 0.9, 0);
  group.add(slingCable);
  group.slingCable = slingCable;

  const slingHook = pivot("slingHook", 0, 0.4, 0);
  slingHook.add(cyl(0.12, 0.12, 0.1, 8, mat(C.safety), 0, 0.2, 0));
  slingHook.add(cyl(0.08, 0.08, 0.25, 6, dark, 0, 0, 0));
  const hook = cyl(0.14, 0.14, 0.07, 10, steel, 0, -0.18, 0.04);
  hook.rotation.x = Math.PI / 2;
  slingHook.add(hook);
  group.add(slingHook);
  group.slingHook = slingHook;

  const landing = (x: number) => {
    const ski = box(0.18, 0.1, 5.5, dark, x, 0.2, 0);
    group.add(ski);
    group.add(cyl(0.05, 0.05, 1.1, 6, steel, x, 1.1, 1.4));
    group.add(cyl(0.05, 0.05, 1.1, 6, steel, x, 1.1, -1.6));
  };
  landing(1.1);
  landing(-1.1);

  group.spinRotors = (delta: number) => {
    mainRotor.rotation.y += delta * 14;
    tailRotor.rotation.x += delta * 22;
  };

  group.setHookLength = (length: number) => {
    const len = clamp(length, 0.4, 6);
    slingCable.scale.y = len;
    slingCable.position.y = 1.35 - len * 0.5;
    slingHook.position.y = 1.35 - len - 0.15;
  };
  group.setHookLength(1.6);

  const shadow = blobShadow(4.2, 14);
  shadow.position.y = 0.02;
  group.add(shadow);
  return group;
}
