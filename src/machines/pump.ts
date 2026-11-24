import * as THREE from "three";
import { C, blobShadow, box, cyl, glow, mat, pivot } from "./shared";

export type DewateringPump = THREE.Group & {
  trailer: THREE.Group;
  pumpHousing: THREE.Group;
  impeller: THREE.Group;
  intakeHose: THREE.Group;
  dischargeHose: THREE.Group;
  hitch: THREE.Group;
  running: boolean;
  setRunning: (on: boolean) => void;
  spinImpeller: (delta: number) => void;
};

function hose(
  name: string,
  points: THREE.Vector3[],
  radius: number,
  color: number,
): THREE.Group {
  const g = pivot(name);
  const curve = new THREE.CatmullRomCurve3(points);
  const mesh = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 10, radius, 6, false),
    mat(color, 0.05, 0.85),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return g;
}

/** High-capacity dewatering pump on a trailer, with intake and discharge hoses. */
export function createDewateringPump(): DewateringPump {
  const group = new THREE.Group() as DewateringPump;
  group.name = "dewateringPump";

  const olive = mat(C.olive);
  const oliveDark = mat(C.oliveDark);
  const tan = mat(C.tan);
  const steel = mat(C.steel, 0.5, 0.45);
  const dark = mat(C.steelDark, 0.5, 0.4);
  const safety = mat(C.safety, 0.12, 0.48);
  const rubber = mat(C.rubber, 0.05, 0.9);

  const trailer = pivot("trailer", 0, 0.85, 0);
  trailer.add(box(1.7, 0.18, 3.8, oliveDark, 0, 0, 0.1));
  trailer.add(box(1.7, 0.08, 3.8, safety, 0, 0.14, 0.1));
  group.add(trailer);
  group.trailer = trailer;

  const hitch = pivot("hitch", 0, 0.85, 2.25);
  hitch.add(box(0.28, 0.14, 0.9, dark, 0, 0, 0));
  hitch.add(cyl(0.08, 0.08, 0.16, 8, steel, 0, 0, 0.5));
  group.add(hitch);
  group.hitch = hitch;

  const wheel = (x: number, z: number) => {
    const w = cyl(0.48, 0.48, 0.32, 10, rubber, x, 0.48, z);
    w.rotation.z = Math.PI / 2;
    group.add(w);
    const hub = cyl(0.16, 0.16, 0.36, 8, steel, x, 0.48, z);
    hub.rotation.z = Math.PI / 2;
    group.add(hub);
  };
  wheel(1.05, -0.9);
  wheel(-1.05, -0.9);
  wheel(1.05, 0.7);
  wheel(-1.05, 0.7);

  const pumpHousing = pivot("pumpHousing", 0, 1.55, -0.15);
  pumpHousing.add(box(1.35, 1.15, 1.5, olive));
  pumpHousing.add(box(1.0, 0.7, 1.1, tan, 0, 0.15, 0));
  pumpHousing.add(box(0.16, 0.22, 0.12, glow(0x3d7a28, 0.4), 0.55, 0.4, 0.76));
  pumpHousing.add(cyl(0.22, 0.22, 0.7, 10, dark, 0.85, -0.1, 0));
  trailer.add(pumpHousing);
  group.pumpHousing = pumpHousing;

  const impeller = pivot("impeller", 0.85, 1.45, -0.15);
  for (let i = 0; i < 5; i++) {
    const vane = box(0.06, 0.28, 0.08, steel, 0.16, 0, 0);
    vane.rotation.y = (i / 5) * Math.PI * 2;
    impeller.add(vane);
  }
  group.add(impeller);
  group.impeller = impeller;

  // Engine box
  trailer.add(box(1.2, 0.95, 1.3, olive, 0, 0.7, -1.45));
  trailer.add(cyl(0.12, 0.16, 0.7, 8, dark, 0.4, 1.35, -1.5));

  const intakeHose = hose(
    "intakeHose",
    [
      new THREE.Vector3(0.9, 1.45, 0.55),
      new THREE.Vector3(1.4, 1.1, 1.2),
      new THREE.Vector3(1.7, 0.5, 1.8),
      new THREE.Vector3(1.6, 0.18, 2.5),
    ],
    0.11,
    0x2a2a2a,
  );
  group.add(intakeHose);
  group.intakeHose = intakeHose;

  const dischargeHose = hose(
    "dischargeHose",
    [
      new THREE.Vector3(-0.9, 1.5, 0.2),
      new THREE.Vector3(-1.5, 1.3, -0.6),
      new THREE.Vector3(-1.8, 0.7, -1.5),
      new THREE.Vector3(-1.5, 0.2, -2.4),
    ],
    0.11,
    0x3f4a28,
  );
  group.add(dischargeHose);
  group.dischargeHose = dischargeHose;

  group.running = false;
  const lamp = pumpHousing.children.find(
    (child) => child instanceof THREE.Mesh && child.position.z > 0.7,
  ) as THREE.Mesh | undefined;
  group.setRunning = (on: boolean) => {
    group.running = on;
    if (lamp && lamp.material instanceof THREE.MeshStandardMaterial) {
      lamp.material.emissiveIntensity = on ? 1.1 : 0.25;
    }
  };
  group.spinImpeller = (delta: number) => {
    if (group.running) impeller.rotation.x += delta * 10;
  };

  group.add(blobShadow(2.8, 5.2));
  return group;
}
