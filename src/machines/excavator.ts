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

export type AttachmentId = "bucket" | "rockbreaker" | "pileDriver" | "hook";

export type TrackedExcavator = THREE.Group & {
  undercarriage: THREE.Group;
  slew: THREE.Group;
  cab: THREE.Group;
  boom: THREE.Group;
  stick: THREE.Group;
  attachmentMount: THREE.Group;
  leftTrack: THREE.Group;
  rightTrack: THREE.Group;
  attachment: AttachmentId;
  setSlew: (radians: number) => void;
  setBoom: (radians: number) => void;
  setStick: (radians: number) => void;
  setAttachment: (id: AttachmentId) => THREE.Group;
};

function makeBucket(): THREE.Group {
  const g = pivot("bucket");
  const steel = mat(C.steel, 0.5, 0.45);
  const dark = mat(C.steelDark, 0.5, 0.4);
  g.add(box(1.15, 0.7, 0.85, steel, 0, -0.2, 0.2));
  g.add(box(1.15, 0.16, 0.7, dark, 0, -0.52, 0.35));
  for (let i = -2; i <= 2; i++) {
    g.add(box(0.1, 0.22, 0.28, dark, i * 0.22, -0.68, 0.55));
  }
  return g;
}

function makeRockbreaker(): THREE.Group {
  const g = pivot("rockbreaker");
  const steel = mat(C.steel, 0.55, 0.4);
  const yellow = mat(C.safety, 0.12, 0.5);
  g.add(box(0.45, 0.45, 1.1, yellow, 0, 0, 0.2));
  const tool = cyl(0.09, 0.04, 1.3, 6, steel, 0, -0.7, 0.55);
  tool.rotation.x = 0.35;
  g.add(tool);
  return g;
}

function makePileDriver(): THREE.Group {
  const g = pivot("pileDriver");
  const steel = mat(C.steel, 0.55, 0.4);
  const yellow = mat(C.safety, 0.12, 0.5);
  const mast = box(0.28, 2.4, 0.28, yellow, 0, -0.7, 0.15);
  g.add(mast);
  const hammer = box(0.42, 0.55, 0.42, steel, 0, -0.15, 0.15);
  hammer.name = "vibrator";
  g.add(hammer);
  g.add(cyl(0.08, 0.08, 0.9, 6, steel, 0, -1.7, 0.15));
  return g;
}

function makeHook(): THREE.Group {
  const g = pivot("hook");
  const steel = mat(C.steelLight, 0.65, 0.3);
  const dark = mat(C.steelDark, 0.6, 0.35);
  const yellow = mat(C.safety, 0.12, 0.5);
  g.add(box(0.28, 0.2, 0.4, yellow, 0, 0.05, 0));
  g.add(cyl(0.08, 0.08, 0.45, 6, dark, 0, -0.25, 0));
  const hook = cyl(0.16, 0.16, 0.08, 10, steel, 0, -0.52, 0.05);
  hook.rotation.x = Math.PI / 2;
  g.add(hook);
  g.add(box(0.07, 0.28, 0.1, steel, 0, -0.68, 0.14));
  return g;
}

const ATTACH: Record<AttachmentId, () => THREE.Group> = {
  bucket: makeBucket,
  rockbreaker: makeRockbreaker,
  pileDriver: makePileDriver,
  hook: makeHook,
};

/** Tracked excavator / crane. Cab swings; boom and stick articulate. */
export function createTrackedExcavator(): TrackedExcavator {
  const group = new THREE.Group() as TrackedExcavator;
  group.name = "trackedExcavator";

  const olive = mat(C.olive);
  const oliveDark = mat(C.oliveDark);
  const tan = mat(C.tan);
  const steel = mat(C.steel, 0.5, 0.45);
  const safety = mat(C.safety, 0.12, 0.48);
  const glass = mat(C.glass, 0.15, 0.15);
  glass.transparent = true;
  glass.opacity = 0.55;

  const undercarriage = pivot("undercarriage", 0, 0.85, 0);
  undercarriage.add(box(2.1, 0.55, 3.4, oliveDark));
  undercarriage.add(cyl(0.55, 0.55, 0.22, 12, steel, 0, 0.4, 0));
  group.add(undercarriage);
  group.undercarriage = undercarriage;

  const leftTrack = makeTrack(4.6, 1.0, 0.62, "leftTrack");
  leftTrack.position.set(-1.35, 0, 0);
  const rightTrack = makeTrack(4.6, 1.0, 0.62, "rightTrack");
  rightTrack.position.set(1.35, 0, 0);
  group.add(leftTrack, rightTrack);
  group.leftTrack = leftTrack;
  group.rightTrack = rightTrack;

  const slew = pivot("slew", 0, 1.2, 0);
  group.add(slew);
  group.slew = slew;

  const house = box(2.3, 1.05, 3.2, olive, 0, 0.55, -0.25);
  slew.add(house);
  slew.add(box(2.0, 0.12, 2.6, safety, 0, 1.1, -0.35));
  slew.add(box(0.2, 0.14, 0.2, glow(C.light, 0.7), 0.7, 0.7, 1.3));
  slew.add(box(0.2, 0.14, 0.2, glow(C.light, 0.7), -0.7, 0.7, 1.3));
  slew.add(cyl(0.1, 0.13, 1.1, 8, mat(C.steelDark, 0.5, 0.4), -0.85, 1.4, -1.2));

  const cab = pivot("cab", -0.55, 1.35, 0.55);
  cab.add(box(1.15, 1.15, 1.3, tan));
  cab.add(box(1.0, 0.55, 0.08, glass, 0, 0.1, 0.65));
  cab.add(box(0.08, 0.55, 0.9, glass, 0.55, 0.1, 0.1));
  cab.add(box(0.08, 0.55, 0.9, glass, -0.55, 0.1, 0.1));
  slew.add(cab);
  group.cab = cab;

  // Boom pivots about local X, extending toward +Z.
  const boom = pivot("boom", 0.15, 1.05, 0.9);
  boom.add(box(0.38, 0.42, 4.2, olive, 0, 0.35, 1.9));
  boom.add(box(0.18, 0.12, 3.6, safety, 0, 0.6, 1.9));
  const boomRam = cyl(0.07, 0.07, 2.2, 6, steel, 0.28, -0.15, 1.2);
  boomRam.rotation.x = 0.85;
  boom.add(boomRam);
  slew.add(boom);
  group.boom = boom;

  const stick = pivot("stick", 0, 0.55, 4.05);
  stick.add(box(0.3, 0.3, 3.2, oliveDark, 0, -0.05, 1.5));
  const stickRam = cyl(0.06, 0.06, 1.8, 6, steel, 0.22, 0.25, 1.0);
  stickRam.rotation.x = 0.2;
  stick.add(stickRam);
  boom.add(stick);
  group.stick = stick;

  const attachmentMount = pivot("attachmentMount", 0, 0, 3.2);
  stick.add(attachmentMount);
  group.attachmentMount = attachmentMount;

  group.attachment = "bucket";
  attachmentMount.add(makeBucket());

  group.setAttachment = (id: AttachmentId) => {
    while (attachmentMount.children.length) {
      attachmentMount.remove(attachmentMount.children[0]);
    }
    const next = ATTACH[id]();
    attachmentMount.add(next);
    group.attachment = id;
    return next;
  };

  group.setSlew = (radians: number) => {
    slew.rotation.y = radians;
  };
  group.setBoom = (radians: number) => {
    boom.rotation.x = clamp(radians, -1.15, 0.35);
  };
  group.setStick = (radians: number) => {
    stick.rotation.x = clamp(radians, -0.15, 2.2);
  };

  // Neutral working pose
  group.setBoom(-0.55);
  group.setStick(0.85);

  group.add(blobShadow(3.8, 5.2));
  return group;
}
