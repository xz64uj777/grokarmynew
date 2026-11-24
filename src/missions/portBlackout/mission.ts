import * as THREE from "three";
import {
  createAmphibiousDredger,
  createHeavyLiftHelicopter,
  type AmphibiousDredger,
  type HeavyLiftHelicopter,
} from "../../machines";
import { C, mat } from "../../machines/shared";
import { PortHud } from "./hud";

export type PortResult = {
  won: boolean;
  title: string;
  body: string;
  stars: number;
};

type Rig = "dredger" | "heli";

type SpanPiece = {
  mesh: THREE.Mesh;
  held: boolean;
  cleared: boolean;
};

type SiltMound = {
  mesh: THREE.Mesh;
  health: number;
  max: number;
};

type Generator = {
  mesh: THREE.Group;
  body: THREE.Mesh;
  lamp: THREE.Mesh;
  state: "yard" | "carried" | "placed" | "wrecked";
  vel: THREE.Vector3;
};

const LIMIT = 165;
const UP = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();

function std(color: number, extras?: { emissive?: number; opacity?: number }): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82,
    metalness: 0.12,
    emissive: extras?.emissive ? new THREE.Color(extras.emissive) : undefined,
    emissiveIntensity: extras?.emissive ? 0 : 0,
    transparent: extras?.opacity !== undefined,
    opacity: extras?.opacity ?? 1,
  });
}

function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Mission 3: clear a blocked shipping channel and restore harbor power. */
export class PortBlackoutMission {
  onMenu: (() => void) | null = null;
  onEnd: ((result: PortResult) => void) | null = null;
  readonly lookPoint = new THREE.Vector3(22, 3, 4);

  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private hud: PortHud;
  private rig: Rig = "dredger";
  private elapsed = 0;
  private ended = false;
  private hint = "The current will push the dredger. Cut the silt, then lift the span pieces onto the barge.";
  private time = 0;

  private dredger: AmphibiousDredger;
  private heli: HeavyLiftHelicopter;
  private boatVel = new THREE.Vector3();
  private heliVel = new THREE.Vector3();
  private arm = 0.55;
  private bob = 0;

  private hookPos = new THREE.Vector3();
  private hookVel = new THREE.Vector3();
  private cable = 7.4;
  private load: Generator | null = null;

  private silt: SiltMound[] = [];
  private pieces: SpanPiece[] = [];
  private gens: Generator[] = [];
  private pads: THREE.Vector3[] = [];
  private windows: THREE.MeshStandardMaterial[] = [];
  private lamps: THREE.MeshStandardMaterial[] = [];
  private streetLights: THREE.PointLight[] = [];
  private hemi: THREE.HemisphereLight | null = null;
  private moon: THREE.DirectionalLight | null = null;
  private waterMat: THREE.MeshStandardMaterial;
  private skyNight = new THREE.Color(0x0b1018);
  private skyDusk = new THREE.Color(0x3d4a5c);
  private fogDusk = new THREE.Color(0x4a5568);
  private fogNight = new THREE.Color(0x141820);
  private flicker = 0;
  private power = 0;
  private litTarget = 0;
  private ship: THREE.Group;
  private camPos = new THREE.Vector3(8, 10, -18);
  private camLook = new THREE.Vector3();
  private heldPiece: SpanPiece | null = null;
  private current = new THREE.Vector3(0, 0, -1.7);
  private wind = new THREE.Vector3();

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;
    this.hud = new PortHud(
      () => this.onMenu?.(),
      () => {
        this.hint = "";
        this.syncHud();
      },
    );
    this.tuneLights();
    this.waterMat = std(0x1a3a44, { opacity: 0.78 });
    this.ship = new THREE.Group();
    this.buildWorld();
    this.dredger = createAmphibiousDredger();
    this.dredger.position.set(2, 0.12, -28);
    this.dredger.rotation.y = 0.15;
    this.dredger.setArm(this.arm);
    this.scene.add(this.dredger);
    this.heli = createHeavyLiftHelicopter();
    this.heli.position.set(34, 8.5, 36);
    this.heli.rotation.y = Math.PI;
    this.heli.setHookLength(this.cable);
    this.scene.add(this.heli);
    this.hookPos.set(34, 8.5 - this.cable, 36);
    this.camera.position.set(10, 11, -16);
    this.camera.lookAt(2, 1.2, -20);
    this.syncHud();
  }

  update(dt: number): void {
    if (this.ended) return;
    this.hud.poll();
    if (this.hud.switchPressed) {
      this.rig = this.rig === "dredger" ? "heli" : "dredger";
      this.hint =
        this.rig === "heli"
          ? "Hook a generator and lower it gently onto a pad. A hard set-down will wreck it."
          : "Lower the cutter into the silt, then grab a span piece and drop it on the barge.";
    }
    this.time += dt;
    this.elapsed += dt;
    this.wind.set(Math.sin(this.time * 0.22) * 2.4, 0, 1.1 + Math.cos(this.time * 0.17) * 1.6);
    this.updateSky();
    this.updateDredger(dt);
    this.updateHeli(dt);
    this.updateSling(dt);
    this.updateLights(dt);
    this.followCam(dt);
    this.checkEnd();
    this.syncHud();
    this.hud.endFrame();
  }

  dispose(): void {
    this.hud.dispose();
  }

  private tuneLights(): void {
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.DirectionalLight) {
        obj.intensity = 0.32;
        obj.color.set(0x9aacbe);
        obj.position.set(-20, 40, -10);
        this.moon = obj;
      }
      if (obj instanceof THREE.HemisphereLight) {
        obj.intensity = 0.4;
        obj.color.set(0x6a7a90);
        obj.groundColor.set(0x1a1c16);
        this.hemi = obj;
      }
    });
  }

  private buildWorld(): void {
    const quay = std(0x8a8678);
    const dirt = std(0x5a5344);
    const concrete = std(0x9a968c);
    const rust = std(0x6a4330);
    const steel = std(0x5a5e64);
    const dark = std(0x2a2c28);
    const padMat = std(0xc4a018);

    const land = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), dirt);
    land.rotation.x = -Math.PI / 2;
    land.position.y = -0.05;
    land.receiveShadow = true;
    this.scene.add(land);

    const apron = box(46, 1.1, 120, quay, 36, 0.55, 8);
    apron.receiveShadow = true;
    this.scene.add(apron);
    const apron2 = box(22, 1.1, 80, quay, -32, 0.55, 10);
    this.scene.add(apron2);

    const water = new THREE.Mesh(new THREE.PlaneGeometry(40, 180), this.waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(2, 0.02, -5);
    this.scene.add(water);

    // Channel walls / riprap
    this.scene.add(box(3.2, 2.2, 160, std(0x6a5a40), 20, 0.2, 0));
    this.scene.add(box(3.2, 2.2, 160, std(0x6a5a40), -16, 0.2, 0));

    // Broken bridge approaches
    this.scene.add(box(10, 8, 8, concrete, 26, 4.6, 0));
    this.scene.add(box(10, 8, 8, concrete, -22, 4.6, 0));
    this.scene.add(box(14, 1.4, 7, concrete, 20, 8.5, 0));
    this.scene.add(box(14, 1.4, 7, concrete, -16, 8.5, 0));
    this.scene.add(box(3, 0.5, 6, rust, 12, 8.2, 0.4));
    this.scene.add(box(3, 0.5, 6, rust, -8, 8.0, -0.3));
    const stub = box(6, 0.7, 2.2, steel, 8, 0.9, 1);
    stub.rotation.z = 0.4;
    this.scene.add(stub);

    const barge = box(10, 1.2, 16, std(0x4a4e42), 18, 0.5, -22);
    this.scene.add(barge);
    this.scene.add(box(9.2, 0.08, 15, std(0xf0c400), 18, 1.14, -22));

    this.buildBuildings(dark, concrete);
    this.buildWreckage(concrete, steel, rust);
    this.buildGensAndPads(padMat, steel);
    this.ship = this.makeShip();
    this.ship.position.set(2, 0.2, -68);
    this.scene.add(this.ship);

    // Yard crane silhouette
    this.scene.add(box(1.2, 12, 1.2, steel, 42, 7, 30));
    this.scene.add(box(16, 0.5, 1.2, steel, 36, 13, 30));
    this.scene.add(box(2.4, 1.6, 2.6, std(0xc4a66a), 44, 1.9, 44));
    this.scene.add(box(2.2, 2.2, 5.5, std(0x2a4a6a), 40, 2.2, 22));
    this.scene.add(box(2.2, 2.2, 5.5, std(0x7a3a2a), 40, 2.2, 16));
  }

  private buildBuildings(dark: THREE.Material, concrete: THREE.Material): void {
    const spots = [
      { x: 44, z: -8, w: 10, h: 8, d: 12 },
      { x: 46, z: 8, w: 8, h: 10, d: 9 },
      { x: 43, z: 22, w: 12, h: 6.5, d: 10 },
      { x: 48, z: -24, w: 9, h: 7, d: 8 },
    ];
    for (const b of spots) {
      this.scene.add(box(b.w, b.h, b.d, concrete, b.x, 1.1 + b.h * 0.5, b.z));
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const winMat = std(0x1a1c18, { emissive: 0xffe3a0 });
          winMat.emissiveIntensity = 0;
          const win = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.08), winMat);
          win.position.set(b.x - b.w * 0.5 - 0.02, 2.2 + r * 1.8, b.z - b.d * 0.28 + c * 1.7);
          this.scene.add(win);
          this.windows.push(winMat);
        }
      }
    }
    const lampZ = [-20, -6, 8, 22, 36];
    for (const z of lampZ) {
      const post = box(0.18, 4.2, 0.18, dark, 24.2, 3.2, z);
      const lampMat = std(0x889099, { emissive: 0xfff1c0 });
      lampMat.emissiveIntensity = 0;
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.5), lampMat);
      bulb.position.set(24.2, 5.4, z);
      const light = new THREE.PointLight(0xffe4a8, 0, 18, 2);
      light.position.set(24.2, 5.2, z);
      this.scene.add(post, bulb, light);
      this.lamps.push(lampMat);
      this.streetLights.push(light);
    }
  }

  private buildWreckage(concrete: THREE.Material, steel: THREE.Material, rust: THREE.Material): void {
    const mounds = [
      { x: -4, z: -4, s: 4.2 },
      { x: 6, z: 2, s: 3.6 },
      { x: 0, z: 8, s: 3.8 },
      { x: 4, z: -9, s: 3.2 },
      { x: -6, z: 5, s: 3.4 },
    ];
    const siltMat = std(0x7a6a48);
    for (const m of mounds) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        siltMat,
      );
      mesh.position.set(m.x, 0.02, m.z);
      mesh.scale.set(m.s * 0.7, m.s * 0.28, m.s * 0.7);
      mesh.userData.base = mesh.scale.clone();
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.silt.push({ mesh, health: 1, max: 1 });
    }

    const specs = [
      { x: 1, z: 0.5, rot: 0.3, w: 8, h: 1.3, d: 2.2 },
      { x: -3, z: 6, rot: -0.7, w: 6.5, h: 1.1, d: 1.8 },
      { x: 3.5, z: -6, rot: 1.1, w: 7.2, h: 1.2, d: 2 },
    ];
    for (const s of specs) {
      const mesh = box(s.w, s.h, s.d, concrete, s.x, 0.7, s.z);
      mesh.rotation.y = s.rot;
      mesh.add(box(s.w * 0.9, 0.12, 0.18, rust, 0, 0.5, 0.7));
      mesh.add(box(s.w * 0.9, 0.12, 0.18, steel, 0, 0.5, -0.7));
      this.scene.add(mesh);
      this.pieces.push({ mesh, held: false, cleared: false });
    }
  }

  private buildGensAndPads(padMat: THREE.Material, steel: THREE.Material): void {
    const padSpots = [new THREE.Vector3(30, 1.16, -10), new THREE.Vector3(30, 1.16, 4), new THREE.Vector3(30, 1.16, 18)];
    this.pads = padSpots;
    for (const p of padSpots) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.1, 16), padMat);
      pad.position.copy(p);
      pad.receiveShadow = true;
      this.scene.add(pad);
    }
    const yard = [new THREE.Vector3(36, 1.7, 38), new THREE.Vector3(36, 1.7, 42), new THREE.Vector3(40, 1.7, 38), new THREE.Vector3(40, 1.7, 42)];
    for (const pos of yard) {
      const gen = this.makeGenerator(steel);
      gen.mesh.position.copy(pos);
      this.scene.add(gen.mesh);
      this.gens.push(gen);
    }
  }

  private makeGenerator(steel: THREE.Material): Generator {
    const group = new THREE.Group();
    const bodyMat = mat(C.olive);
    const body = box(1.6, 1.2, 2.2, bodyMat);
    const lampMat = std(0x3a3a32, { emissive: 0x4ae06a });
    lampMat.emissiveIntensity = 0;
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.2), lampMat);
    lamp.position.set(0.55, 0.72, 0.9);
    group.add(body, box(0.7, 0.7, 0.9, steel, 0, 0.15, -0.9), lamp);
    group.add(box(1.7, 0.08, 2.3, mat(C.safety), 0, 0.65, 0));
    return {
      mesh: group,
      body,
      lamp,
      state: "yard",
      vel: new THREE.Vector3(),
    };
  }

  private makeShip(): THREE.Group {
    const g = new THREE.Group();
    const hull = std(0x3a4248);
    const tan = std(0xc4a66a);
    g.add(box(8, 3.2, 28, hull, 0, 1.8, 0));
    g.add(box(6.4, 3.4, 8, hull, 0, 4.8, -4));
    g.add(box(6.5, 0.2, 20, tan, 0, 3.45, 2));
    const nav = std(0xaa2020, { emissive: 0xff2020 });
    nav.emissiveIntensity = 0.8;
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), nav);
    light.position.set(0, 6.8, -4);
    g.add(light);
    return g;
  }

  private updateDredger(dt: number): void {
    const active = this.rig === "dredger";
    const throttle = active ? this.hud.left.y : 0;
    const steer = active ? this.hud.left.x : 0;
    const turn = steer * 1.15 * dt * (Math.abs(throttle) > 0.1 ? Math.sign(throttle) : 1);
    this.dredger.rotation.y -= turn;
    _fwd.set(0, 0, 1).applyAxisAngle(UP, this.dredger.rotation.y);
    if (active) this.boatVel.addScaledVector(_fwd, throttle * 10 * dt);
    const currentScale = active ? 1 : 0.45;
    this.boatVel.addScaledVector(this.current, currentScale * 0.55 * dt);
    this.boatVel.y = 0;
    this.boatVel.multiplyScalar(Math.exp(-1.6 * dt));
    this.dredger.position.addScaledVector(this.boatVel, dt);
    this.dredger.position.x = THREE.MathUtils.clamp(this.dredger.position.x, -12, 16);
    this.dredger.position.z = THREE.MathUtils.clamp(this.dredger.position.z, -70, 50);
    this.bob += dt;
    this.dredger.position.y = 0.12 + Math.sin(this.bob * 1.7) * 0.12;
    this.dredger.rotation.z = Math.sin(this.bob * 1.3) * 0.03;
    this.dredger.rotation.x = Math.sin(this.bob * 1.1) * 0.02;

    if (active) {
      this.arm += -this.hud.right.y * dt * 1.15;
      this.arm = THREE.MathUtils.clamp(this.arm, -0.15, 1.05);
      this.dredger.setArm(this.arm);
    }

    this.dredger.cutterHead.getWorldPosition(_tmp);
    let cutting = false;
    for (const mound of this.silt) {
      if (mound.health <= 0) continue;
      const d = Math.hypot(mound.mesh.position.x - _tmp.x, mound.mesh.position.z - _tmp.z);
      if (d < 4.2 && this.arm > 0.35) {
        mound.health = Math.max(0, mound.health - dt * 0.28);
        const b = mound.mesh.userData.base as THREE.Vector3;
        mound.mesh.scale.set(
          b.x * (0.3 + 0.7 * mound.health),
          b.y * Math.max(0.12, mound.health),
          b.z * (0.3 + 0.7 * mound.health),
        );
        cutting = true;
        if (mound.health <= 0) mound.mesh.visible = false;
      }
    }
    this.dredger.spinCutter(dt * (cutting ? 8 : 1.2));

    if (this.heldPiece) {
      if (active && this.hud.actionPressed) {
        this.scene.attach(this.heldPiece.mesh);
        this.heldPiece.mesh.position.y = Math.max(0.7, this.heldPiece.mesh.position.y);
        const onBarge =
          this.heldPiece.mesh.position.x > 13 &&
          this.heldPiece.mesh.position.x < 24 &&
          this.heldPiece.mesh.position.z > -30 &&
          this.heldPiece.mesh.position.z < -14;
        const onQuay = this.heldPiece.mesh.position.x > 20;
        if (onBarge || onQuay) {
          this.heldPiece.cleared = true;
          this.heldPiece.mesh.position.y = 1.5;
        }
        this.heldPiece.held = false;
        this.heldPiece = null;
      }
    } else if (active && this.hud.actionPressed) {
      let best: SpanPiece | null = null;
      let bestD = 5.5;
      for (const piece of this.pieces) {
        if (piece.held || piece.cleared) continue;
        piece.mesh.getWorldPosition(_tmp2);
        const d = Math.hypot(_tmp.x - _tmp2.x, _tmp.z - _tmp2.z);
        if (d < bestD && Math.abs(_tmp.y - _tmp2.y) < 6) {
          best = piece;
          bestD = d;
        }
      }
      if (best) {
        this.dredger.cutterHead.attach(best.mesh);
        best.mesh.position.set(0, -0.6, 1.1);
        best.mesh.rotation.set(0, 0, 0);
        best.held = true;
        this.heldPiece = best;
      }
    }
  }

  private updateHeli(dt: number): void {
    const active = this.rig === "heli";
    _fwd.set(0, 0, 1).applyAxisAngle(UP, this.heli.rotation.y);
    const right = _tmp.set(1, 0, 0).applyAxisAngle(UP, this.heli.rotation.y);
    if (active) {
      this.heli.rotation.y -= this.hud.right.x * dt * 1.4;
      this.heliVel.addScaledVector(_fwd, this.hud.left.y * 16 * dt);
      this.heliVel.addScaledVector(right, this.hud.left.x * 12 * dt);
      this.heliVel.y += this.hud.right.y * 12 * dt;
    } else {
      this.heliVel.multiplyScalar(Math.exp(-2.8 * dt));
      this.heliVel.y *= Math.exp(-3 * dt);
    }
    this.heliVel.multiplyScalar(Math.exp(-1.1 * dt));
    this.heli.position.addScaledVector(this.heliVel, dt);
    this.heli.position.x = THREE.MathUtils.clamp(this.heli.position.x, -30, 55);
    this.heli.position.z = THREE.MathUtils.clamp(this.heli.position.z, -80, 60);
    const minY = Math.abs(this.heli.position.x) < 18 ? 4.5 : 3.2;
    if (this.heli.position.y < minY) {
      this.heli.position.y = minY;
      if (this.heliVel.y < 0) this.heliVel.y = 0;
    }
    this.heli.position.y = Math.min(32, this.heli.position.y);
    this.heli.spinRotors(dt);
    const bank = active ? THREE.MathUtils.clamp(this.hud.left.x * -0.2, -0.25, 0.25) : 0;
    const pitch = active ? THREE.MathUtils.clamp(this.hud.left.y * 0.15, -0.2, 0.2) : 0;
    this.heli.rotation.z = THREE.MathUtils.damp(this.heli.rotation.z, bank, 6, dt);
    this.heli.rotation.x = THREE.MathUtils.damp(this.heli.rotation.x, pitch, 6, dt);
  }

  private updateSling(dt: number): void {
    this.heli.getWorldPosition(_tmp);
    const attach = _tmp2.set(_tmp.x, _tmp.y - 0.8, _tmp.z);
    this.hookVel.y -= 18 * dt;
    this.hookVel.addScaledVector(this.wind, 0.55 * dt);
    if (this.load) this.hookVel.addScaledVector(this.wind, 0.35 * dt);
    this.hookVel.multiplyScalar(Math.exp(-1.8 * dt));
    this.hookPos.addScaledVector(this.hookVel, dt);
    const toHook = this.hookPos.clone().sub(attach);
    const dist = toHook.length();
    if (dist > this.cable && dist > 0.001) {
      toHook.multiplyScalar(this.cable / dist);
      this.hookPos.copy(attach).add(toHook);
      const n = toHook.normalize();
      const outward = this.hookVel.dot(n);
      if (outward > 0) this.hookVel.addScaledVector(n, -outward);
    }
    this.heli.setHookLength(THREE.MathUtils.clamp(dist, 0.6, this.cable));
    this.heli.slingHook.getWorldPosition(_tmp);
    // Keep visual hook in sync by setting length; also move carried load to hook bob
    if (this.load && this.load.state === "carried") {
      this.load.mesh.position.copy(this.hookPos);
      this.load.mesh.position.y -= 1.1;
      this.load.mesh.rotation.y = this.heli.rotation.y;
    }

    if (this.rig !== "heli") return;
    if (this.load && this.hud.actionPressed) {
      this.releaseLoad();
    } else if (!this.load && this.hud.actionPressed) {
      this.tryHookGen();
    }
  }

  private tryHookGen(): void {
    let best: Generator | null = null;
    let bestD = 4.8;
    for (const gen of this.gens) {
      if (gen.state !== "yard") continue;
      const d = Math.hypot(this.hookPos.x - gen.mesh.position.x, this.hookPos.z - gen.mesh.position.z);
      const dy = Math.abs(this.hookPos.y - (gen.mesh.position.y + 0.6));
      if (d < bestD && dy < 5) {
        best = gen;
        bestD = d;
      }
    }
    if (!best) return;
    best.state = "carried";
    this.load = best;
    this.hookPos.copy(best.mesh.position);
    this.hookPos.y += 1.1;
    this.hookVel.set(0, 0, 0);
  }

  private releaseLoad(): void {
    if (!this.load) return;
    const gen = this.load;
    this.load = null;
    const pad = this.nearestPad(gen.mesh.position);
    const horiz = pad ? Math.hypot(gen.mesh.position.x - pad.x, gen.mesh.position.z - pad.z) : 99;
    const height = pad ? gen.mesh.position.y - pad.y : gen.mesh.position.y;
    const swing = Math.hypot(this.hookVel.x, this.hookVel.z);
    const slam = this.hookVel.y < -5.2 || swing > 6.2 || height > 4.2;
    const overWater = Math.abs(gen.mesh.position.x) < 17;
    if (pad && horiz < 3.4 && height < 3.2 && !slam && !overWater) {
      gen.state = "placed";
      gen.mesh.position.set(pad.x, pad.y + 1.15, pad.z);
      gen.mesh.rotation.set(0, 0, 0);
      if (gen.lamp.material instanceof THREE.MeshStandardMaterial) {
        gen.lamp.material.emissiveIntensity = 1.2;
      }
      this.litTarget = this.placedCount();
    } else {
      gen.state = slam || overWater || height > 5 ? "wrecked" : "yard";
      if (gen.state === "wrecked") {
        gen.mesh.rotation.z = 0.55;
        gen.mesh.position.y = overWater ? 0.4 : 1.5;
        if (gen.body.material instanceof THREE.MeshStandardMaterial) {
          gen.body.material.color.set(0x2a2420);
        }
      } else {
        gen.mesh.position.y = 1.7;
      }
    }
  }

  private nearestPad(pos: THREE.Vector3): THREE.Vector3 | null {
    const taken = new Set(
      this.gens.filter((g) => g.state === "placed").map((g) => `${g.mesh.position.z.toFixed(0)}`),
    );
    let best: THREE.Vector3 | null = null;
    let bestD = 99;
    for (const pad of this.pads) {
      if (taken.has(`${pad.z.toFixed(0)}`)) continue;
      const d = Math.hypot(pos.x - pad.x, pos.z - pad.z);
      if (d < bestD) {
        best = pad;
        bestD = d;
      }
    }
    return best;
  }

  private placedCount(): number {
    return this.gens.filter((g) => g.state === "placed").length;
  }

  private channelClear(): boolean {
    const siltDone = this.silt.every((s) => s.health <= 0);
    const piecesDone = this.pieces.every((p) => p.cleared);
    return siltDone && piecesDone;
  }

  private updateSky(): void {
    const t = Math.min(1, this.time / LIMIT);
    const sky = this.skyDusk.clone().lerp(this.skyNight, t * 0.85);
    const fog = this.fogDusk.clone().lerp(this.fogNight, t * 0.85);
    this.scene.background = sky;
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(fog);
      this.scene.fog.near = 30;
      this.scene.fog.far = 140;
    }
    if (this.moon) this.moon.intensity = 0.32 - t * 0.12 + this.power * 0.05;
  }

  private updateLights(dt: number): void {
    this.power = THREE.MathUtils.damp(this.power, this.litTarget, 1.8, dt);
    if (this.litTarget > 0 && this.flicker < 0.8) {
      this.flicker += dt;
    }
    const flicker = this.flicker < 0.7 && this.litTarget > 0 ? (Math.sin(this.time * 42) > 0.15 ? 1 : 0.15) : 1;
    const level = this.power * flicker;
    const winTarget = Math.min(1, level / 3) * 1.15;
    for (let i = 0; i < this.windows.length; i++) {
      const gate = i / Math.max(1, this.windows.length - 1);
      const on = level / 3 >= gate * 0.92 ? winTarget : 0;
      this.windows[i].emissiveIntensity = THREE.MathUtils.damp(this.windows[i].emissiveIntensity, on, 5, dt);
    }
    for (let i = 0; i < this.lamps.length; i++) {
      const on = i < this.litTarget * 2 - 0.5 ? 1.4 * flicker : 0;
      this.lamps[i].emissiveIntensity = THREE.MathUtils.damp(this.lamps[i].emissiveIntensity, Math.max(0, on), 6, dt);
      this.streetLights[i].intensity = this.lamps[i].emissiveIntensity * 5;
    }
    this.waterMat.emissive = new THREE.Color(0x1c2a18);
    this.waterMat.emissiveIntensity = this.power * 0.12;
    if (this.hemi) this.hemi.intensity = 0.4 + this.power * 0.18;
    if (this.litTarget >= 3 && this.channelClear()) {
      this.ship.position.z = THREE.MathUtils.damp(this.ship.position.z, -20, 0.15, dt);
    }
  }

  private followCam(dt: number): void {
    if (this.rig === "dredger") {
      this.dredger.getWorldPosition(this.camLook);
      this.dredger.cutterHead.getWorldPosition(_tmp);
      this.camLook.lerp(_tmp, 0.35);
      this.camLook.y += 1.2;
      _fwd.set(0, 0, -1).applyAxisAngle(UP, this.dredger.rotation.y);
      const desired = this.camLook.clone().addScaledVector(_fwd, -16).add(new THREE.Vector3(0, 9, 0));
      this.camPos.lerp(desired, 1 - Math.exp(-3 * dt));
    } else {
      this.heli.getWorldPosition(this.camLook);
      this.camLook.lerp(this.hookPos, 0.55);
      this.camLook.y += 0.4;
      _fwd.set(0, 0, -1).applyAxisAngle(UP, this.heli.rotation.y);
      const desired = this.heli.position.clone().addScaledVector(_fwd, -16).add(new THREE.Vector3(0, 8, 0));
      this.camPos.lerp(desired, 1 - Math.exp(-3.4 * dt));
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.lookPoint.copy(this.camLook);
  }

  private checkEnd(): void {
    const left = LIMIT - this.time;
    const clear = this.channelClear();
    const lit = this.placedCount() >= 2;
    if (clear && lit) {
      const full = this.placedCount() >= 3;
      let stars = 1;
      if (full) stars += 1;
      if (left > 35) stars += 1;
      this.finish({
        won: true,
        title: full ? "Harbor power is back" : "The harbor is lit",
        body: full
          ? `Channel clear, all three pads running. ${Math.ceil(Math.max(0, left))} seconds left, and the ship can come in.`
          : `Channel clear and the harbor is lit on ${this.placedCount()} of 3 pads, with ${Math.ceil(Math.max(0, left))} seconds left.`,
        stars,
      });
      return;
    }
    if (left <= 0) {
      this.finish({
        won: false,
        title: "The ship had to hold",
        body: clear
          ? "The channel is open, but the harbor never got enough power before night closed in."
          : "Night fell with the span still in the channel. The waiting ship could not come in.",
        stars: 0,
      });
    }
  }

  private finish(result: PortResult): void {
    if (this.ended) return;
    this.ended = true;
    this.hud.dispose();
    this.onEnd?.(result);
  }

  private syncHud(): void {
    if (this.ended) return;
    const left = Math.max(0, LIMIT - this.time);
    const siltLeft = this.silt.filter((s) => s.health > 0).length;
    const piecesLeft = this.pieces.filter((p) => !p.cleared).length;
    const siltProg = 1 - siltLeft / Math.max(1, this.silt.length);
    const pieceProg = 1 - piecesLeft / Math.max(1, this.pieces.length);
    const channel = (siltProg + pieceProg) / 2;
    const placed = this.placedCount();
    const timeTone = left < 30 ? "bad" : left < 60 ? "warn" : undefined;
    let objective: string;
    if (this.rig === "dredger") {
      if (siltLeft) objective = `Cut silt in the channel — ${siltLeft} pile${siltLeft === 1 ? "" : "s"} left`;
      else if (piecesLeft) objective = this.heldPiece ? "Drop the span piece on the barge" : "Grab a span piece and lift it onto the barge";
      else objective = "Channel is clear — fly the generators in";
    } else if (placed >= 3) {
      objective = "Harbor power is up — finish any remaining channel work";
    } else if (this.load) {
      objective = "Lower the generator gently onto a yellow pad";
    } else {
      objective = `Hook a generator and set it on a pad — ${placed} of 3 running`;
    }
    this.hud.updateView({
      objective,
      hint: this.hint,
      action: this.rig === "dredger" ? (this.heldPiece ? "Drop" : "Grab") : this.load ? "Release" : "Hook",
      swap: this.rig === "dredger" ? "Helicopter" : "Dredger",
      leftLabel: this.rig === "dredger" ? "Drive" : "Fly",
      rightMode: this.rig === "dredger" ? "arm" : "heli",
      meters: [
        { label: "Channel", value: channel, tone: channel >= 1 ? "good" : undefined },
        { label: "Power", value: placed / 3, tone: placed >= 2 ? "good" : undefined },
        { label: "Time", value: left / LIMIT, tone: timeTone },
      ],
    });
  }
}
