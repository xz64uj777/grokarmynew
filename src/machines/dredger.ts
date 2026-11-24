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

export type AmphibiousDredger = THREE.Group & {
  hull: THREE.Group;
  cab: THREE.Group;
  cutterArm: THREE.Group;
  cutterHead: THREE.Group;
  setArm: (radians: number) => void;
  spinCutter: (delta: number) => void;
};

/** Amphibious dredger: pontoon hull with a cutter-head arm. */
export function createAmphibiousDredger(): AmphibiousDredger {
  const group = new THREE.Group() as AmphibiousDredger;
  group.name = "amphibiousDredger";

  const olive = mat(C.olive);
  const oliveDark = mat(C.oliveDark);
  const tan = mat(C.tan);
  const steel = mat(C.steel, 0.5, 0.45);
  const safety = mat(C.safety, 0.12, 0.48);
  const glass = mat(C.glass, 0.15, 0.15);
  glass.transparent = true;
  glass.opacity = 0.55;

  const hull = pivot("hull", 0, 0.7, 0);
  // Twin pontoons
  const pontoon = (x: number) => {
    const p = cyl(0.7, 0.7, 9.2, 8, oliveDark, x, 0, 0);
    p.rotation.x = Math.PI / 2;
    hull.add(p);
    const nose = cyl(0.2, 0.7, 1.2, 8, olive, x, 0, 5.1);
    nose.rotation.x = Math.PI / 2;
    hull.add(nose);
  };
  pontoon(-1.55);
  pontoon(1.55);
  hull.add(box(3.6, 0.28, 7.4, olive, 0, 0.7, -0.2));
  hull.add(box(3.2, 0.08, 6.8, safety, 0, 0.86, -0.2));
  group.add(hull);
  group.hull = hull;

  const cab = pivot("cab", 0, 1.9, -1.6);
  cab.add(box(2.0, 1.4, 2.2, tan));
  cab.add(box(1.7, 0.7, 0.08, glass, 0, 0.15, 1.12));
  cab.add(box(0.08, 0.7, 1.6, glass, 1.02, 0.15, 0));
  cab.add(box(0.08, 0.7, 1.6, glass, -1.02, 0.15, 0));
  cab.add(box(2.15, 0.1, 2.3, oliveDark, 0, 0.75, 0));
  cab.add(box(0.2, 0.14, 0.16, glow(C.light, 0.7), 0.6, 0.2, 1.16));
  cab.add(box(0.2, 0.14, 0.16, glow(C.light, 0.7), -0.6, 0.2, 1.16));
  group.add(cab);
  group.cab = cab;

  const cutterArm = pivot("cutterArm", 0, 1.35, 3.3);
  cutterArm.add(box(0.35, 0.32, 6.0, olive, 0, 0, 2.8));
  cutterArm.add(box(0.18, 0.1, 5.4, safety, 0, 0.2, 2.8));
  const ram = cyl(0.07, 0.07, 3.2, 6, steel, 0.28, 0.35, 1.6);
  ram.rotation.x = 0.4;
  cutterArm.add(ram);
  group.add(cutterArm);
  group.cutterArm = cutterArm;

  const cutterHead = pivot("cutterHead", 0, 0, 6.0);
  const head = cyl(0.7, 0.15, 1.1, 8, steel);
  head.rotation.x = Math.PI / 2;
  cutterHead.add(head);
  for (let i = 0; i < 6; i++) {
    const tooth = box(0.12, 0.18, 0.4, mat(C.steelDark, 0.55, 0.4), 0, 0.62, 0.15);
    tooth.rotation.z = (i / 6) * Math.PI * 2;
    cutterHead.add(tooth);
  }
  cutterArm.add(cutterHead);
  group.cutterHead = cutterHead;

  group.setArm = (radians: number) => {
    cutterArm.rotation.x = clamp(radians, -0.2, 1.1);
  };
  group.spinCutter = (delta: number) => {
    cutterHead.rotation.z += delta * 6;
  };
  group.setArm(0.45);

  const shadow = blobShadow(5.2, 11);
  shadow.position.y = 0.02;
  group.add(shadow);
  return group;
}
