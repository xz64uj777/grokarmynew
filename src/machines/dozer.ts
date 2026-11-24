import * as THREE from "three";
import {
  C,
  blobShadow,
  box,
  clamp,
  cyl,
  glow,
  makeTrack,
  mat,
  pivot,
} from "./shared";

export type HeavyDozer = THREE.Group & {
  chassis: THREE.Group;
  cab: THREE.Group;
  blade: THREE.Group;
  bladePitch: THREE.Group;
  bladeTilt: THREE.Group;
  leftTrack: THREE.Group;
  rightTrack: THREE.Group;
  setBladePitch: (radians: number) => void;
  setBladeTilt: (radians: number) => void;
};

/** Heavy dozer with a pitch-and-tilt blade. Local +Z is forward. */
export function createHeavyDozer(): HeavyDozer {
  const group = new THREE.Group() as HeavyDozer;
  group.name = "heavyDozer";

  const olive = mat(C.olive);
  const oliveDark = mat(C.oliveDark);
  const tan = mat(C.tan);
  const steel = mat(C.steel, 0.5, 0.45);
  const steelDark = mat(C.steelDark, 0.5, 0.4);
  const safety = mat(C.safety, 0.12, 0.48);
  const glass = mat(C.glass, 0.15, 0.15);
  glass.transparent = true;
  glass.opacity = 0.55;

  const chassis = pivot("chassis", 0, 1.05, -0.15);
  chassis.add(box(2.4, 0.9, 4.4, olive, 0, 0, 0));
  chassis.add(box(2.2, 0.35, 4.0, oliveDark, 0, 0.55, -0.1));
  chassis.add(box(0.7, 0.2, 3.6, safety, 0, 0.58, -0.1));
  group.add(chassis);
  group.chassis = chassis;

  const cab = pivot("cab", 0, 2.15, -0.85);
  cab.add(box(1.9, 1.5, 1.8, tan, 0, 0, 0));
  cab.add(box(1.6, 0.7, 0.08, glass, 0, 0.15, 0.9));
  cab.add(box(0.08, 0.7, 1.3, glass, 0.9, 0.15, 0.05));
  cab.add(box(0.08, 0.7, 1.3, glass, -0.9, 0.15, 0.05));
  cab.add(box(2.05, 0.12, 2.0, oliveDark, 0, 0.82, 0));
  // ROPS posts
  cab.add(cyl(0.07, 0.07, 1.7, 6, steelDark, 0.85, 0.1, 0.8));
  cab.add(cyl(0.07, 0.07, 1.7, 6, steelDark, -0.85, 0.1, 0.8));
  group.add(cab);
  group.cab = cab;

  const stack = cyl(0.12, 0.16, 1.5, 8, steelDark, 0.7, 2.4, -2.0);
  group.add(stack);
  group.add(cyl(0.18, 0.18, 0.12, 8, steel, 0.7, 3.18, -2.0));

  // Lights
  group.add(box(0.22, 0.16, 0.14, glow(C.light, 0.8), 0.7, 1.35, 2.05));
  group.add(box(0.22, 0.16, 0.14, glow(C.light, 0.8), -0.7, 1.35, 2.05));

  const leftTrack = makeTrack(5.2, 1.15, 0.7, "leftTrack");
  leftTrack.position.set(-1.55, 0, -0.2);
  const rightTrack = makeTrack(5.2, 1.15, 0.7, "rightTrack");
  rightTrack.position.set(1.55, 0, -0.2);
  group.add(leftTrack, rightTrack);
  group.leftTrack = leftTrack;
  group.rightTrack = rightTrack;

  const bladePitch = pivot("bladePitch", 0, 1.15, 2.15);
  const arms = oliveDark;
  bladePitch.add(box(0.22, 0.22, 2.1, arms, 1.15, 0, 0.7));
  bladePitch.add(box(0.22, 0.22, 2.1, arms, -1.15, 0, 0.7));
  const ram = cyl(0.08, 0.08, 1.6, 6, steel, 0.7, 0.35, 0.5);
  ram.rotation.x = 0.6;
  bladePitch.add(ram);
  const ram2 = ram.clone();
  ram2.position.x = -0.7;
  bladePitch.add(ram2);

  const bladeTilt = pivot("bladeTilt", 0, 0, 1.85);
  const blade = pivot("blade");
  blade.add(box(3.2, 1.7, 0.28, steel, 0, 0.15, 0));
  const leftWing = box(1.15, 1.7, 0.28, steel, -2.0, 0.15, -0.28);
  leftWing.rotation.y = 0.55;
  const rightWing = box(1.15, 1.7, 0.28, steel, 2.0, 0.15, -0.28);
  rightWing.rotation.y = -0.55;
  blade.add(leftWing, rightWing);
  blade.add(box(3.4, 0.12, 0.16, safety, 0, 0.95, 0.1));
  blade.add(box(0.08, 1.3, 0.06, safety, 0, 0.15, 0.16));
  bladeTilt.add(blade);
  bladePitch.add(bladeTilt);
  group.add(bladePitch);

  group.bladePitch = bladePitch;
  group.bladeTilt = bladeTilt;
  group.blade = blade;

  group.add(blobShadow(4.4, 6.2));

  group.setBladePitch = (radians: number) => {
    bladePitch.rotation.x = clamp(radians, -0.45, 0.55);
  };
  group.setBladeTilt = (radians: number) => {
    bladeTilt.rotation.z = clamp(radians, -0.35, 0.35);
  };

  return group;
}
