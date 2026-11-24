import * as THREE from "three";

/** Army olive, tan, and safety yellow used by every rig. */
export const C = {
  olive: 0x4f5d32,
  oliveDark: 0x3a4524,
  oliveMid: 0x627044,
  tan: 0xc4a66a,
  tanDark: 0x8a6e3e,
  safety: 0xf0c400,
  steel: 0x6c7075,
  steelDark: 0x3a3d41,
  steelLight: 0x9aa0a6,
  rubber: 0x1a1a1a,
  glass: 0x8fb4c2,
  light: 0xfff2c4,
} as const;

export function mat(
  color: number,
  metal = 0.22,
  rough = 0.72,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: metal,
    roughness: rough,
  });
}

export function glow(color: number, intensity = 0.55): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: new THREE.Color(color),
    emissiveIntensity: intensity,
    metalness: 0.1,
    roughness: 0.4,
  });
}

export function pivot(name: string, x = 0, y = 0, z = 0): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  return g;
}

export function box(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  name?: string,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (name) mesh.name = name;
  return mesh;
}

export function cyl(
  rTop: number,
  rBot: number,
  h: number,
  segs: number,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  name?: string,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop, rBot, h, segs),
    material,
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (name) mesh.name = name;
  return mesh;
}

/** Low-poly track frame. Local +Z is forward. */
export function makeTrack(
  length: number,
  height: number,
  width: number,
  name: string,
): THREE.Group {
  const g = pivot(name);
  const rubber = mat(C.rubber, 0.05, 0.9);
  const steel = mat(C.steelDark, 0.45, 0.5);
  const cap = mat(C.safety, 0.1, 0.5);
  g.add(box(width, height * 0.42, length, rubber, 0, height * 0.32, 0));
  const idler = (z: number) => {
    const wheel = cyl(height * 0.38, height * 0.38, width * 0.92, 8, steel);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0, height * 0.4, z);
    g.add(wheel);
    const tip = cyl(height * 0.12, height * 0.12, width * 1.05, 6, cap);
    tip.rotation.z = Math.PI / 2;
    tip.position.set(0, height * 0.4, z);
    g.add(tip);
  };
  idler(length * 0.38);
  idler(-length * 0.38);
  const rollers = 3;
  for (let i = 0; i < rollers; i++) {
    const t = i / (rollers - 1);
    const z = THREE.MathUtils.lerp(-length * 0.2, length * 0.2, t);
    const wheel = cyl(height * 0.22, height * 0.22, width * 0.85, 8, steel);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0, height * 0.22, z);
    g.add(wheel);
  }
  g.add(box(width * 0.55, height * 0.14, length * 0.7, mat(C.oliveDark), 0, height * 0.62, 0));
  return g;
}

export function blobShadow(width: number, depth: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(Math.max(width, depth) * 0.55, 12),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  mesh.name = "shadow";
  mesh.scale.set(width / depth || 1, 1, 1);
  mesh.renderOrder = -1;
  return mesh;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
