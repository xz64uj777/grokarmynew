import * as THREE from "three";
import type { Input } from "./input";
import {
  createAmphibiousDredger,
  createDewateringPump,
  createHeavyDozer,
  createHeavyLiftHelicopter,
  createTrackedExcavator,
  type AmphibiousDredger,
  type DewateringPump,
  type HeavyDozer,
  type HeavyLiftHelicopter,
  type TrackedExcavator,
} from "./machines";
import { PortBlackoutMission } from "./missions/portBlackout";

export type Mode = "menu" | "levee" | "airfield" | "garage" | "port" | "end";
export type Rig = "dozer" | "crane" | "pump";

export type HudState = {
  title: string;
  objective: string;
  hint: string;
  action: string;
  swap: string;
  showAction: boolean;
  rightStick: "blade" | "crane" | "none";
  meters: { label: string; value: number; tone?: "good" | "warn" | "bad" }[];
};

export type EndReport = {
  won: boolean;
  title: string;
  body: string;
  stars: number;
  mission: "levee" | "airfield" | "port";
};

const UP = new THREE.Vector3(0, 1, 0);
const _forward = new THREE.Vector3();
const _world = new THREE.Vector3();

function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const material of materials) material.dispose();
    }
  });
}

function mat(color: number, opts?: { transparent?: boolean; opacity?: number; emissive?: number }): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.85,
    metalness: 0.08,
    transparent: opts?.transparent ?? false,
    opacity: opts?.opacity ?? 1,
    emissive: opts?.emissive ? new THREE.Color(opts.emissive) : undefined,
    emissiveIntensity: opts?.emissive ? 0.7 : 0,
  });
}

function drive(
  group: THREE.Group,
  input: Input,
  dt: number,
  speed: number,
  turn: number,
  bounds: number,
): void {
  const steer = input.left.x;
  const throttle = input.left.y;
  const turnScale = Math.abs(throttle) > 0.12 ? Math.sign(throttle) : 1;
  group.rotation.y -= steer * turn * dt * turnScale;
  _forward.set(0, 0, 1).applyAxisAngle(UP, group.rotation.y);
  group.position.addScaledVector(_forward, throttle * speed * dt);
  group.position.y = 0;
  group.position.x = THREE.MathUtils.clamp(group.position.x, -bounds, bounds);
  group.position.z = THREE.MathUtils.clamp(group.position.z, -bounds, bounds);
}

function makeBuildings(count: number, color: number): THREE.Group {
  const town = new THREE.Group();
  town.name = "town";
  const wall = mat(color);
  const roof = mat(0x6a4a32);
  for (let i = 0; i < count; i++) {
    const w = 2.2 + (i % 3) * 0.7;
    const d = 2.4 + (i % 2) * 0.8;
    const h = 2.2 + (i % 4) * 0.9;
    const z = -22 + (i % 6) * 8 + (i > 5 ? 2 : 0);
    const x = 24 + Math.floor(i / 6) * 7 + (i % 2);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wall);
    body.position.set(x, h * 0.5, z);
    body.castShadow = true;
    body.receiveShadow = true;
    const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.2, d + 0.2), roof);
    top.position.set(x, h + 0.1, z);
    town.add(body, top);
  }
  return town;
}

function makeBarrier(): THREE.Mesh {
  const geom = new THREE.BoxGeometry(0.55, 1.05, 2.2);
  const mesh = new THREE.Mesh(geom, mat(0xb9b6ae, { }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.y = 0.52;
  mesh.userData.inGap = false;
  mesh.userData.tons = 7.4;
  return mesh;
}

function makeRock(rng: () => number): THREE.Mesh {
  const s = 1.05 + rng() * 0.85;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(s, s * 0.8, s * 0.9),
    mat(rng() > 0.5 ? 0xe0cc8a : 0xc4a45c),
  );
  mesh.scale.set(1, 0.85 + rng() * 0.3, 1);
  mesh.rotation.y = rng() * Math.PI;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.size = s;
  return mesh;
}

function makeCargoPlane(): THREE.Group {
  const g = new THREE.Group();
  g.name = "cargoPlane";
  const olive = mat(0x4a5630);
  const tan = mat(0xc4a66a);
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 14), olive);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(18, 0.22, 3.2), olive);
  wing.position.set(0, 0.2, -0.5);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.6, 1.6), olive);
  tail.position.set(0, 1.8, -6.4);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.16, 1.2), olive);
  stab.position.set(0, 1.2, -6.4);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.21, 0.2, 10), tan);
  stripe.position.y = -0.6;
  g.add(body, wing, tail, stab, stripe);
  return g;
}

function tree(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.2, 6), mat(0x5a3a22));
  trunk.position.y = 0.6;
  const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.4, 7), mat(0x3d5a2c));
  leaves.position.y = 2.1;
  g.add(trunk, leaves);
  g.position.set(x, 0, z);
  return g;
}

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
  mode: Mode = "menu";
  hud: HudState = {
    title: "",
    objective: "",
    hint: "",
    action: "Action",
    swap: "Dozer",
    showAction: false,
    rightStick: "blade",
    meters: [],
  };
  end: EndReport | null = null;
  onChange: (() => void) | null = null;

  private clock = new THREE.Clock();
  private camTarget = new THREE.Vector3();
  private camPos = new THREE.Vector3(18, 14, 22);

  private dozer: HeavyDozer | null = null;
  private crane: TrackedExcavator | null = null;
  private rig: Rig = "dozer";
  private boom = -0.55;
  private stick = 0.85;
  private slew = 0;
  private pitch = 0.15;
  private tilt = 0;

  private water: THREE.Mesh | null = null;
  private waterLevel = 1;
  private fill = 0;
  private rocks: THREE.Mesh[] = [];
  private barriers: THREE.Mesh[] = [];
  private held: THREE.Object3D | null = null;
  private usedDozer = false;
  private usedCrane = false;
  private usedPump = false;
  private flood = false;
  private pump: DewateringPump | null = null;
  private pumpRunning = false;
  private sway = 0;
  private swingRate = 0;
  private craneLock = 0;
  private missionTime = 0;

  private bumps: THREE.Mesh[] = [];
  private grade0 = 0;
  private panels: { slot: THREE.Vector3; mesh: THREE.Mesh | null }[] = [];
  private pallet: THREE.Mesh[] = [];
  private lightsBuilt = false;
  private lights: THREE.Group | null = null;
  private plane: THREE.Group | null = null;
  private planeTime = 0;

  private garageRigs: (AmphibiousDredger | HeavyLiftHelicopter | DewateringPump)[] = [];
  private garageIndex = 0;
  private port: PortBlackoutMission | null = null;
  private garageSpin = 0;
  private menuSpin = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera.position.copy(this.camPos);
    this.showMenu();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  step(input: Input): void {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.mode === "menu") this.updateMenu(dt);
    else if (this.mode === "garage") this.updateGarage(dt);
    else if ((this.mode === "levee" || this.mode === "airfield") && !this.end) {
      this.updateMission(input, dt);
    } else if (this.mode === "port" && this.port && !this.end) {
      this.port.update(dt);
    } else if (this.mode === "end" || this.end) {
      this.updateEndCam(dt);
    }
    this.renderer.render(this.scene, this.camera);
  }

  showMenu(): void {
    this.resetWorld(0x8aa3b8, 0xb8c48a, 0x6a7a40);
    this.mode = "menu";
    this.end = null;
    this.menuSpin = 0.4;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), mat(0x6d7a45));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const dozer = createHeavyDozer();
    dozer.position.set(-4, 0, 2);
    dozer.rotation.y = 0.6;
    const crane = createTrackedExcavator();
    crane.position.set(5, 0, -1);
    crane.rotation.y = -0.8;
    crane.setAttachment("hook");
    this.scene.add(dozer, crane, tree(-14, -8), tree(16, 6), tree(-10, 12));
    this.dozer = dozer;
    this.crane = crane;
    this.camPos.set(14, 9, 16);
    this.camTarget.set(0, 1.4, 0);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);
    this.emit();
  }

  startLevee(): void {
    this.resetWorld(0x6b8498, 0x8aa070, 0x3e4a28);
    this.mode = "levee";
    this.end = null;
    this.flood = false;
    this.fill = 0;
    this.waterLevel = 1.05;
    this.held = null;
    this.usedDozer = false;
    this.usedCrane = false;
    this.usedPump = false;
    this.pumpRunning = false;
    this.sway = 0;
    this.swingRate = 0;
    this.craneLock = 0;
    this.missionTime = 0;
    this.rig = "dozer";
    this.rocks = [];
    this.barriers = [];

    const dry = new THREE.Mesh(new THREE.PlaneGeometry(160, 180), mat(0x6f7d48));
    dry.rotation.x = -Math.PI / 2;
    dry.receiveShadow = true;
    this.scene.add(dry);
    const mud = new THREE.Mesh(new THREE.PlaneGeometry(24, 180), mat(0x6a5a3c));
    mud.rotation.x = -Math.PI / 2;
    mud.position.set(2, 0.02, 0);
    mud.receiveShadow = true;
    this.scene.add(mud);
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(80, 180), mat(0x3f4336));
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(-28, -0.2, 0);
    bed.receiveShadow = true;
    this.scene.add(bed);

    const bermMat = mat(0x8b7348);
    const makeBerm = (z: number, len: number) => {
      const berm = new THREE.Mesh(new THREE.BoxGeometry(9, 3.2, len), bermMat);
      berm.position.set(0, 1.6, z);
      berm.castShadow = true;
      berm.receiveShadow = true;
      this.scene.add(berm);
    };
    makeBerm(-34, 52);
    makeBerm(34, 52);

    this.scene.add(makeBuildings(10, 0xcfc4a8));
    for (let i = 0; i < 8; i++) {
      this.scene.add(tree(36 + (i % 3) * 4, -30 + i * 8));
    }

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 180),
      mat(0x2c6a7a, { transparent: true, opacity: 0.72 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(-32, this.waterLevel, 0);
    this.water = water;
    this.scene.add(water);

    const rng = mulberry(19);
    const piles = [
      { x: 8, z: -5 },
      { x: 7.5, z: 0 },
      { x: 8, z: 5 },
    ];
    for (const pile of piles) {
      const marker = new THREE.Mesh(
        new THREE.CircleGeometry(3.4, 16),
        new THREE.MeshBasicMaterial({
          color: 0xf0c400,
          transparent: true,
          opacity: 0.38,
          depthWrite: false,
        }),
      );
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(pile.x, 0.05, pile.z);
      this.scene.add(marker);
      for (let i = 0; i < 6; i++) {
        const rock = makeRock(rng);
        rock.position.set(
          pile.x + (rng() - 0.5) * 2.8,
          0.55,
          pile.z + (rng() - 0.5) * 2.8,
        );
        this.scene.add(rock);
        this.rocks.push(rock);
      }
    }

    for (let i = 0; i < 4; i++) {
      const barrier = makeBarrier();
      barrier.position.set(15, 0.52, -6 + i * 2.6);
      barrier.rotation.y = Math.PI / 2;
      this.scene.add(barrier);
      this.barriers.push(barrier);
    }

    this.dozer = createHeavyDozer();
    this.dozer.position.set(11, 0, -18);
    this.dozer.rotation.y = 0.4;
    this.pitch = 0.18;
    this.tilt = 0;
    this.dozer.setBladePitch(this.pitch);
    this.scene.add(this.dozer);

    this.crane = createTrackedExcavator();
    this.crane.position.set(16, 0, 10);
    this.crane.rotation.y = -0.9;
    this.crane.setAttachment("hook");
    this.boom = -0.55;
    this.stick = 0.9;
    this.slew = 0;
    this.crane.setBoom(this.boom);
    this.crane.setStick(this.stick);
    this.scene.add(this.crane);

    this.pump = createDewateringPump();
    this.pump.position.set(22, 0, 2);
    this.pump.rotation.y = -Math.PI / 2;
    this.pump.setRunning(false);
    this.scene.add(this.pump);

    this.camTarget.set(11, 2, -18);
    this.camPos.set(20, 12, -8);
    this.camera.position.copy(this.camPos);
    this.setLeveeHud("Push the pale rock piles into the gap. The crane sets barriers. The pump, on the dry side, lowers the river.");
    this.emit();
  }

  startAirfield(): void {
    this.resetWorld(0x9aa8b8, 0xc8b894, 0x7a6a40);
    this.mode = "airfield";
    this.end = null;
    this.held = null;
    this.rig = "dozer";
    this.lightsBuilt = false;
    this.planeTime = 0;
    this.rig = "dozer";
    this.bumps = [];
    this.panels = [];
    this.pallet = [];
    this.grade0 = 0;

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 220), mat(0x9a7b4a));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(16, 100), mat(0x7a6240));
    strip.rotation.x = -Math.PI / 2;
    strip.position.y = 0.03;
    strip.receiveShadow = true;
    this.scene.add(strip);

    const rng = mulberry(7);
    this.grade0 = 0;
    for (let i = 0; i < 9; i++) {
      const bump = new THREE.Mesh(
        new THREE.SphereGeometry(2.2, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        mat(0x8b6b3e),
      );
      bump.position.set((rng() - 0.5) * 8, 0, -36 + i * 9 + (rng() - 0.5) * 3);
      bump.scale.set(1.1 + rng() * 0.5, 0.7 + rng() * 0.7, 1.1 + rng() * 0.4);
      bump.castShadow = true;
      bump.receiveShadow = true;
      this.scene.add(bump);
      this.bumps.push(bump);
      this.grade0 += bump.scale.y;
    }

    const zs = [-30, -18, -6, 6, 18, 30];
    for (const z of zs) {
      this.panels.push({ slot: new THREE.Vector3(0, 0.06, z), mesh: null });
    }
    for (let i = 0; i < 6; i++) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(12, 0.1, 9.5), mat(0xb8b5aa));
      panel.castShadow = true;
      panel.position.set(14, 0.12 + i * 0.12, 4);
      this.scene.add(panel);
      this.pallet.push(panel);
    }

    this.lights = new THREE.Group();
    this.scene.add(this.lights);

    this.dozer = createHeavyDozer();
    this.dozer.position.set(8, 0, -40);
    this.dozer.rotation.y = 0;
    this.pitch = 0.25;
    this.dozer.setBladePitch(this.pitch);
    this.scene.add(this.dozer);

    this.crane = createTrackedExcavator();
    this.crane.position.set(16, 0, 8);
    this.crane.rotation.y = Math.PI;
    this.crane.setAttachment("hook");
    this.boom = -0.5;
    this.stick = 1.0;
    this.slew = 0;
    this.crane.setBoom(this.boom);
    this.crane.setStick(this.stick);
    this.scene.add(this.crane);

    this.plane = makeCargoPlane();
    this.plane.position.set(0, 22, 130);
    this.plane.rotation.y = Math.PI;
    this.scene.add(this.plane);

    for (let i = 0; i < 10; i++) {
      this.scene.add(tree(-22 - (i % 3) * 3, -40 + i * 9));
      this.scene.add(tree(24 + (i % 3) * 3, -36 + i * 9));
    }

    this.camTarget.set(8, 2, -40);
    this.camPos.set(18, 12, -28);
    this.camera.position.copy(this.camPos);
    this.setAirHud("Grade the strip with the blade down, then crane-drop matting down the center.");
    this.emit();
  }

  showGarage(index = 0): void {
    this.resetWorld(0x1c2420, 0x3a4030, 0x202418);
    this.mode = "garage";
    this.end = null;
    this.garageIndex = index;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), mat(0x4a4a42));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(7, 24), mat(0x3a3a34));
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.02;
    this.scene.add(pad);

    const dredger = createAmphibiousDredger();
    const heli = createHeavyLiftHelicopter();
    const pump = createDewateringPump();
    pump.setRunning(true);
    this.garageRigs = [dredger, heli, pump];
    for (const rig of this.garageRigs) {
      rig.visible = false;
      this.scene.add(rig);
    }
    this.garageSpin = 0;
    this.focusGarage();
    this.emit();
  }

  nextGarage(dir: number): void {
    if (this.mode !== "garage") return;
    this.garageIndex = (this.garageIndex + dir + 3) % 3;
    this.focusGarage();
    this.emit();
  }

  garageCaption(): { name: string; blurb: string } {
    const info = [
      {
        name: "Amphibious Dredger",
        blurb: "A pontoon hull and cutter arm for clearing silt and wreckage in deep water.",
      },
      {
        name: "Heavy-Lift Helicopter",
        blurb: "Spinning rotors and a sling hook for dropping generators, trusses, and barriers.",
      },
      {
        name: "Dewatering Pump",
        blurb: "A trailer pump with intake and discharge hoses to drain pits and drop water pressure.",
      },
    ];
    return info[this.garageIndex];
  }

  dismissHint(): void {
    this.hud.hint = "";
    this.emit();
  }

  startPortBlackout(): void {
    this.resetWorld(0x4a5568, 0x3d4a5c, 0x1a1e18);
    this.mode = "port";
    this.end = null;
    this.port = new PortBlackoutMission(this.scene, this.camera);
    this.port.onMenu = () => this.showMenu();
    this.port.onEnd = (result) => {
      if (this.port) this.camTarget.copy(this.port.lookPoint);
      this.end = { ...result, mission: "port" };
      this.mode = "end";
      this.emit();
    };
    this.emit();
  }

  replay(): void {
    if (this.end?.mission === "airfield") this.startAirfield();
    else if (this.end?.mission === "port") this.startPortBlackout();
    else this.startLevee();
  }

  otherMission(): void {
    if (this.end?.mission === "port") this.startAirfield();
    else if (this.end?.mission === "airfield") this.startLevee();
    else this.startAirfield();
  }

  private focusGarage(): void {
    for (let i = 0; i < this.garageRigs.length; i++) {
      this.garageRigs[i].visible = i === this.garageIndex;
      this.garageRigs[i].rotation.y = 0;
    }
    this.garageSpin = 0;
    this.camTarget.set(0, 1.6, 0);
    this.camPos.set(10, 6, 12);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);
  }

  private updateMenu(dt: number): void {
    this.menuSpin += dt * 0.12;
    this.camera.position.set(
      Math.cos(this.menuSpin) * 16,
      9,
      Math.sin(this.menuSpin) * 16,
    );
    this.camera.lookAt(0, 1.4, 0);
    this.dozer?.setBladePitch(0.15 + Math.sin(this.menuSpin * 2) * 0.08);
    if (this.crane) {
      this.crane.setSlew(Math.sin(this.menuSpin) * 0.4);
      this.crane.setBoom(-0.5 + Math.sin(this.menuSpin * 1.3) * 0.1);
    }
  }

  private updateGarage(dt: number): void {
    this.garageSpin += dt * 0.35;
    const rig = this.garageRigs[this.garageIndex];
    if (rig) rig.rotation.y = this.garageSpin;
    const heli = this.garageRigs[1] as HeavyLiftHelicopter | undefined;
    heli?.spinRotors(dt);
    const dredger = this.garageRigs[0] as AmphibiousDredger | undefined;
    dredger?.spinCutter(dt);
    const pump = this.garageRigs[2] as DewateringPump | undefined;
    pump?.spinImpeller(dt);
    const dist = this.garageIndex === 1 ? 14 : this.garageIndex === 0 ? 13 : 9;
    const height = this.garageIndex === 1 ? 7 : 5.5;
    this.camera.position.set(
      Math.cos(this.garageSpin * 0.25) * dist,
      height,
      Math.sin(this.garageSpin * 0.25) * dist,
    );
    this.camera.lookAt(0, this.garageIndex === 1 ? 2.2 : 1.4, 0);
  }

  private updateEndCam(dt: number): void {
    this.menuSpin += dt * 0.08;
    const look = this.camTarget;
    this.camera.position.x = look.x + Math.cos(this.menuSpin) * 16;
    this.camera.position.z = look.z + Math.sin(this.menuSpin) * 16;
    this.camera.position.y = 12;
    this.camera.lookAt(look);
  }

  private updateMission(input: Input, dt: number): void {
    if (input.switchPressed) this.cycleRig();
    const active = this.activeRig();
    if (!active) return;

    if (this.rig === "dozer" && this.dozer) {
      drive(this.dozer, input, dt, 9.5, 1.6, 70);
      this.pitch += -input.right.y * dt * 1.2;
      this.tilt += input.right.x * dt * 1.1;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -0.4, 0.5);
      this.tilt = THREE.MathUtils.clamp(this.tilt, -0.35, 0.35);
      this.dozer.setBladePitch(this.pitch);
      this.dozer.setBladeTilt(this.tilt);
      if (input.left.y * input.left.y + input.left.x * input.left.x > 0.05) this.usedDozer = true;
    } else if (this.rig === "crane" && this.crane) {
      if (this.craneLock > 0) {
        this.craneLock = Math.max(0, this.craneLock - dt);
        this.swingRate = 0;
        this.crane.rotation.z *= Math.max(0, 1 - dt * 1.6);
      } else {
        drive(this.crane, input, dt, 6.2, 1.3, 70);
        this.swingRate = -input.right.x * 1.3;
        this.slew += this.swingRate * dt;
        this.boom += -input.right.y * dt * 1.0;
        if (input.stickOut) this.stick += dt * 1.2;
        if (input.stickIn) this.stick -= dt * 1.2;
        this.boom = THREE.MathUtils.clamp(this.boom, -1.15, 0.3);
        this.stick = THREE.MathUtils.clamp(this.stick, -0.1, 2.1);
        this.crane.setSlew(this.slew);
        this.crane.setBoom(this.boom);
        this.crane.setStick(this.stick);
        if (input.left.y * input.left.y + input.left.x * input.left.x > 0.05) this.usedCrane = true;
      }
    } else if (this.rig === "pump" && this.pump) {
      drive(this.pump, input, dt, 3.2, 0.8, 70);
      if (input.left.y * input.left.y + input.left.x * input.left.x > 0.05) this.usedPump = true;
    }

    if (this.mode === "levee") this.updateLevee(input, dt);
    else this.updateAirfield(input, dt);
    this.pump?.spinImpeller(dt);

    this.followCam(active, dt);
  }

  private cycleRig(): void {
    if (this.mode === "levee") {
      this.rig = this.rig === "dozer" ? "crane" : this.rig === "crane" ? "pump" : "dozer";
    } else {
      this.rig = this.rig === "dozer" ? "crane" : "dozer";
    }
    this.swingRate = 0;
    this.hud.hint = this.rigHint();
  }

  private rigHint(): string {
    if (this.mode !== "levee") {
      return this.rig === "crane"
        ? "Swing and raise the Boom until the hook is over a matting panel, then tap Hook."
        : "";
    }
    if (this.rig === "crane") {
      return "Boom is up and down. Swing is side to side. A barrier is 7.4 tons, just under the 8 ton limit. Swing easy or the crane tips.";
    }
    if (this.rig === "pump") {
      return "Creep onto the dry side, behind the levee, then tap Run. The pump pulls the river down.";
    }
    return "Left thumb drives. Right thumb is lift and tilt. Push the pale piles straight into the gap.";
  }

  private activeRig(): THREE.Object3D | null {
    if (this.rig === "dozer") return this.dozer;
    if (this.rig === "crane") return this.crane;
    return this.mode === "levee" ? this.pump : this.dozer;
  }

  private followCam(target: THREE.Object3D, dt: number): void {
    target.getWorldPosition(this.camTarget);
    _forward.set(0, 0, -1).applyAxisAngle(UP, target.rotation.y);
    const desired = this.camTarget.clone();
    if (this.rig === "crane" && this.crane) {
      const hook = this.crane.attachmentMount.getObjectByName("hook") ?? this.crane.attachmentMount;
      hook.getWorldPosition(_world);
      this.camTarget.lerp(_world, 0.7);
      this.camTarget.y += 0.6;
      desired.addScaledVector(_forward, -14).add(new THREE.Vector3(0, 10, 0));
    } else {
      this.camTarget.y += 1.6;
      desired.copy(this.camTarget).addScaledVector(_forward, -12).add(new THREE.Vector3(0, 7.5, 0));
    }
    this.camPos.lerp(desired, 1 - Math.exp(-3.2 * dt));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);
  }

  private updateLevee(input: Input, dt: number): void {
    if (!this.dozer || !this.water) return;
    this.missionTime += dt;
    this.settleCraneLoad(dt);
    const pumping = this.pumpHelping();
    this.waterLevel += dt * (pumping ? 0.004 : 0.018);
    if (pumping) this.waterLevel = Math.max(0.9, this.waterLevel - dt * 0.008);
    this.water.position.y = this.waterLevel;
    if (this.flood) {
      this.water.position.x = THREE.MathUtils.lerp(this.water.position.x, 10, 1 - Math.exp(-0.6 * dt));
      this.water.scale.x = THREE.MathUtils.lerp(this.water.scale.x, 1.8, 1 - Math.exp(-0.5 * dt));
    }

    this.dozer.blade.getWorldPosition(_world);
    _forward.set(0, 0, 1).applyAxisAngle(UP, this.dozer.rotation.y);
    const moving = Math.hypot(input.left.x, input.left.y);
    if (this.rig === "dozer" && moving > 0.08 && input.left.y > 0.04) {
      for (const rock of this.rocks) {
        const dx = rock.position.x - _world.x;
        const dz = rock.position.z - _world.z;
        if (Math.hypot(dx, dz) < 3.2 && dx * _forward.x + dz * _forward.z > -0.35) {
          const speed = 10 * dt * Math.max(input.left.y, 0.4);
          rock.position.addScaledVector(_forward, speed);
          rock.position.y = 0.55;
        }
      }
    }

    if (this.crane) this.handleHook(input, this.barriers, 7);
    this.updatePump(input);

    let fill = 0;
    for (const rock of this.rocks) {
      if (rock.position.x < 4 && rock.position.x > -4.5 && Math.abs(rock.position.z) < 8.5) {
        fill += 0.05;
        rock.position.y = 0.5;
      }
    }
    for (const barrier of this.barriers) {
      if (barrier.parent !== this.scene) continue;
      if (barrier.position.x < 4 && barrier.position.x > -4.5 && Math.abs(barrier.position.z) < 8.5) {
        fill += 0.17;
        barrier.userData.inGap = true;
      }
    }
    this.fill = THREE.MathUtils.clamp(fill, 0, 1.15);

    const crest = 3.15;
    if (!this.flood && this.waterLevel >= crest && this.fill < 1) {
      this.flood = true;
      this.finishLevee(false);
    } else if (!this.end && this.fill >= 1) {
      this.finishLevee(true);
    } else if (!this.end) {
      const waterTone = this.waterLevel > 2.6 ? "bad" : this.waterLevel > 2.0 ? "warn" : undefined;
      const open = 1 - Math.min(1, this.fill);
      const stress = Math.max(0, Math.min(1, (this.waterLevel / crest) * (0.35 + 0.65 * open)));
      const next = this.rig === "dozer" ? "Crane" : this.rig === "crane" ? "Pump" : "Dozer";
      let objective = "Push riprap into the gap";
      let action = "Hook";
      let showAction = false;
      let rightStick: HudState["rightStick"] = "blade";
      if (this.rig === "crane") {
        objective = this.craneLock > 0
          ? "Crane tipped — wait for the tracks"
          : this.held
            ? "Swing slow, then drop the barrier in the gap"
            : "Hook a barrier and swing it over the gap";
        action = this.held ? "Drop" : "Hook";
        showAction = true;
        rightStick = "crane";
      } else if (this.rig === "pump") {
        objective = pumping
          ? "Pump is drawing the river down"
          : "Set the pump on the dry side and run it";
        action = this.pumpRunning ? "Stop" : "Run";
        showAction = true;
        rightStick = "none";
      }
      this.hud = {
        title: "Levee Breach",
        objective,
        hint: this.hud.hint,
        action,
        swap: next,
        showAction,
        rightStick,
        meters: [
          { label: "River", value: this.waterLevel / crest, tone: waterTone },
          { label: "Plug", value: Math.min(1, this.fill), tone: this.fill >= 1 ? "good" : undefined },
          { label: "Stress", value: stress, tone: stress > 0.72 ? "bad" : stress > 0.45 ? "warn" : undefined },
        ],
      };
    }
  }

  private pumpHelping(): boolean {
    return this.pumpRunning && !!this.pump && this.pump.position.x > 6;
  }

  private updatePump(input: Input): void {
    if (this.rig !== "pump" || !this.pump || !input.actionPressed) return;
    if (this.pump.position.x <= 6) {
      this.pumpRunning = false;
      this.pump.setRunning(false);
      this.hud.hint = "That is still the wet side. Creep the pump behind the levee, then run it.";
      return;
    }
    this.pumpRunning = !this.pumpRunning;
    this.pump.setRunning(this.pumpRunning);
    this.usedPump = this.usedPump || this.pumpRunning;
    this.hud.hint = this.pumpRunning
      ? "Pump is running. Intake is on the dry side and the head is dropping."
      : "Pump is stopped.";
  }

  /** A near-limit barrier sways, and a fast swing tips the crane. */
  private settleCraneLoad(dt: number): void {
    if (!this.held || this.rig !== "crane") {
      this.sway = Math.max(0, this.sway - dt * 0.8);
      return;
    }
    const tons = typeof this.held.userData.tons === "number" ? this.held.userData.tons : 7.4;
    if (tons > 8) {
      this.dropHeld(false);
      this.hud.hint = "Over the crane's 8 ton limit. That one stays on the ground.";
      return;
    }
    const excess = Math.max(0, Math.abs(this.swingRate) - 0.55);
    const grow = excess * (0.85 + tons / 8);
    this.sway = Math.max(0, this.sway + grow * dt - this.sway * 0.65 * dt);
    this.held.position.set(Math.sin(this.missionTime * 3.2) * this.sway * 0.85, -1.1, 0.2);
    if (this.sway > 1) {
      this.dropHeld(true);
      this.craneLock = 2.6;
      this.sway = 0;
      if (this.crane) this.crane.rotation.z = 0.2;
      this.hud.hint = "Swung too fast with a heavy barrier. The crane tipped and dropped it.";
    }
  }

  private dropHeld(tipped: boolean): void {
    if (!this.held) return;
    this.scene.attach(this.held);
    this.held.position.y = 0.52;
    if (tipped) this.held.position.x += 1.6;
    this.held = null;
  }

  private updateAirfield(input: Input, dt: number): void {
    this.planeTime += dt;
    if (this.dozer && this.rig === "dozer" && this.pitch > 0.08) {
      this.dozer.blade.getWorldPosition(_world);
      for (const bump of this.bumps) {
        const d = Math.hypot(bump.position.x - _world.x, bump.position.z - _world.z);
        if (d < 3.2 && bump.scale.y > 0.16) {
          bump.scale.y = Math.max(0.15, bump.scale.y - dt * 0.85);
        }
      }
    }
    let left = 0;
    for (const bump of this.bumps) left += bump.scale.y;
    const grade = this.grade0 > 0 ? 1 - left / this.grade0 : 1;

    if (this.crane) this.handleHook(input, this.pallet, 7);

    if (this.held && input.actionPressed && this.rig === "crane") {
      const slot = this.panels.find((p) => !p.mesh);
      this.held.getWorldPosition(_world);
      if (slot && _world.distanceTo(slot.slot) < 8) {
        const panel = this.held as THREE.Mesh;
        this.scene.attach(panel);
        panel.position.copy(slot.slot);
        panel.rotation.set(0, 0, 0);
        panel.position.y = 0.08;
        slot.mesh = panel;
        this.held = null;
        this.pallet = this.pallet.filter((p) => p !== panel);
        input.actionPressed = false;
      }
    }

    const placed = this.panels.filter((p) => p.mesh).length;
    if (input.actionPressed && !this.held && placed >= 6 && !this.lightsBuilt) {
      this.buildLights();
    }

    if (this.plane && !this.end) {
      const approach = this.planeTime;
      const ready = grade >= 0.75 && placed >= 6;
      if (approach < 95) {
        this.plane.position.z = 130 - approach * 0.2;
        this.plane.position.y = 22;
      } else {
        const t = approach - 95;
        if (ready) {
          this.plane.position.z = 111 - t * 18;
          this.plane.position.y = Math.max(3.2, 22 - t * 3.4);
          this.plane.rotation.x = THREE.MathUtils.lerp(this.plane.rotation.x, 0.08, 0.04);
          if (this.plane.position.z < 40 && this.plane.position.y <= 3.3) {
            this.plane.position.y = 3.2;
            this.finishAir(true, grade, placed);
          }
        } else {
          this.plane.position.z = 111 - t * 22;
          this.plane.position.y = 18 + Math.sin(t) * 0.5;
          if (this.plane.position.z < -20) this.finishAir(false, grade, placed);
        }
      }
    }

    if (!this.end) {
      this.hud = {
        title: "Forward Airfield",
        objective: grade < 0.75
          ? "Grade the strip — keep the blade down"
          : placed < 6
            ? `Lay matting — ${placed} of 6 panels`
            : this.lightsBuilt
              ? "Hold the strip — plane inbound"
              : "Tap Lights to mark the runway",
        hint: this.hud.hint,
        action: this.held ? "Drop" : placed >= 6 && !this.lightsBuilt ? "Lights" : "Hook",
        swap: this.rig === "dozer" ? "Crane" : "Dozer",
        showAction: this.rig === "crane" || (placed >= 6 && !this.lightsBuilt),
        rightStick: this.rig === "crane" ? "crane" : "blade",
        meters: [
          { label: "Grade", value: grade, tone: grade >= 0.75 ? "good" : undefined },
          { label: "Matting", value: placed / 6, tone: placed >= 6 ? "good" : undefined },
          {
            label: "Plane",
            value: Math.min(1, this.planeTime / 110),
            tone: this.planeTime > 90 ? "bad" : this.planeTime > 70 ? "warn" : undefined,
          },
        ],
      };
    }
  }

  private hookWorldPosition(out: THREE.Vector3): void {
    if (!this.crane) return;
    const hook = this.crane.attachmentMount.getObjectByName("hook") ?? this.crane.attachmentMount;
    hook.getWorldPosition(out);
  }

  private handleHook(input: Input, items: THREE.Mesh[], reach: number): void {
    if (!this.crane || this.rig !== "crane") return;
    this.crane.updateMatrixWorld(true);
    this.hookWorldPosition(_world);
    if (this.held) {
      if (input.actionPressed && this.mode === "levee") this.dropHeld(false);
      return;
    }
    if (!input.actionPressed) return;
    let best: THREE.Mesh | null = null;
    let bestDist = reach;
    for (const item of items) {
      if (item.userData.inGap) continue;
      if (this.mode === "airfield" && this.panels.some((p) => p.mesh === item)) continue;
      item.getWorldPosition(_forward);
      const dx = _world.x - _forward.x;
      const dz = _world.z - _forward.z;
      const d = Math.hypot(dx, dz);
      const dy = Math.abs(_world.y - _forward.y);
      if (d < bestDist && dy < 10) {
        best = item;
        bestDist = d;
      }
    }
    if (best) {
      this.crane.attachmentMount.attach(best);
      best.position.set(0, -1.1, 0.2);
      best.rotation.set(0, 0, 0);
      this.held = best;
    }
  }

  private buildLights(): void {
    if (!this.lights || this.lightsBuilt) return;
    this.lightsBuilt = true;
    const lamp = mat(0xfff2c4, { emissive: 0xffe9a0 });
    for (const side of [-7.2, 7.2]) {
      for (let i = 0; i < 12; i++) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), mat(0x333333));
        const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.22), lamp);
        const z = -42 + i * 7.6;
        post.position.set(side, 0.25, z);
        bulb.position.set(side, 0.55, z);
        this.lights.add(post, bulb);
      }
    }
  }

  private finishLevee(won: boolean): void {
    if (this.end) return;
    const timeLeft = Math.max(0, 3.15 - this.waterLevel);
    let stars = 0;
    if (won) {
      stars = 1;
      if (this.usedDozer && this.usedCrane) stars += 1;
      if (timeLeft > 0.35) stars += 1;
    }
    const placed = this.barriers.filter((b) => b.userData.inGap).length;
    this.end = {
      won,
      mission: "levee",
      title: won ? "The levee held" : "The town flooded",
      body: won
        ? `You plugged the gap with rock and ${placed} barrier${placed === 1 ? "" : "s"}${this.usedPump ? ", and the pump held the river down" : ""} before the crest passed.`
        : "The river came over the gap before it was plugged. The streets below took the water.",
      stars,
    };
    this.mode = "end";
    this.emit();
  }

  private finishAir(won: boolean, grade: number, placed: number): void {
    if (this.end) return;
    let stars = 0;
    if (won) {
      stars = 1;
      if (this.lightsBuilt) stars += 1;
      if (this.planeTime < 108) stars += 1;
    }
    this.end = {
      won,
      mission: "airfield",
      title: won ? "The plane is on the ground" : "The plane had to abort",
      body: won
        ? `Strip graded ${Math.round(grade * 100)}%, ${placed} panels down${this.lightsBuilt ? ", lights on" : ""}. The cargo plane landed on your runway.`
        : `The strip was not ready in time (grade ${Math.round(grade * 100)}%, ${placed} of 6 panels). The plane flew on.`,
      stars,
    };
    this.mode = "end";
    this.emit();
  }

  private setLeveeHud(hint: string): void {
    this.hud = {
      title: "Levee Breach",
      objective: "Push riprap into the gap",
      hint,
      action: "Hook",
      swap: "Crane",
      showAction: false,
      rightStick: "blade",
      meters: [
        { label: "River", value: 0.33 },
        { label: "Plug", value: 0 },
        { label: "Stress", value: 0.2 },
      ],
    };
  }

  private setAirHud(hint: string): void {
    this.hud = {
      title: "Forward Airfield",
      objective: "Grade the strip — keep the blade down",
      hint,
      action: "Hook",
      swap: "Crane",
      showAction: false,
      rightStick: "blade",
      meters: [
        { label: "Grade", value: 0 },
        { label: "Matting", value: 0 },
        { label: "Plane", value: 0 },
      ],
    };
  }

  private resetWorld(fog: number, sky: number, groundHem: number): void {
    this.port?.dispose();
    this.port = null;
    this.clearScene();
    this.scene.background = new THREE.Color(sky);
    this.scene.fog = new THREE.Fog(fog, 40, 160);
    const hemi = new THREE.HemisphereLight(sky, groundHem, 0.85);
    const sun = new THREE.DirectionalLight(0xfff1d0, 1.15);
    sun.position.set(30, 40, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    sun.shadow.camera.far = 140;
    sun.shadow.bias = -0.001;
    this.scene.add(hemi, sun);
    this.dozer = null;
    this.crane = null;
    this.pump = null;
    this.pumpRunning = false;
    this.water = null;
    this.plane = null;
    this.lights = null;
    this.garageRigs = [];
    this.held = null;
  }

  private clearScene(): void {
    const kids = [...this.scene.children];
    for (const child of kids) {
      this.scene.remove(child);
      disposeObject(child);
    }
  }

  private emit(): void {
    this.onChange?.();
  }
}

function mulberry(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
