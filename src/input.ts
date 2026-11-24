export type Stick = { x: number; y: number };

function clampStick(x: number, y: number): Stick {
  const len = Math.hypot(x, y);
  if (len > 1) return { x: x / len, y: y / len };
  return { x, y };
}

/** Dual-thumb virtual sticks plus on-screen buttons and a keyboard fallback. */
export class Input {
  left: Stick = { x: 0, y: 0 };
  right: Stick = { x: 0, y: 0 };
  actionHeld = false;
  actionPressed = false;
  switchPressed = false;
  stickIn = false;
  stickOut = false;

  private pointers = new Map<number, { side: "left" | "right" }>();
  private keys = new Set<string>();
  private actionButtonDown = false;
  private stickInButton = false;
  private stickOutButton = false;

  bind(leftEl: HTMLElement, rightEl: HTMLElement): void {
    const bindStick = (el: HTMLElement, side: "left" | "right") => {
      el.addEventListener("pointerdown", (event) => {
        el.setPointerCapture(event.pointerId);
        this.pointers.set(event.pointerId, { side });
        this.moveStick(side, el, event);
      });
      el.addEventListener("pointermove", (event) => {
        if (!this.pointers.has(event.pointerId)) return;
        this.moveStick(side, el, event);
      });
      const end = (event: PointerEvent) => {
        if (!this.pointers.has(event.pointerId)) return;
        this.pointers.delete(event.pointerId);
        if (side === "left") this.left = { x: 0, y: 0 };
        else this.right = { x: 0, y: 0 };
        const knob = el.querySelector("i");
        if (knob instanceof HTMLElement) knob.style.transform = "";
      };
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
    };
    bindStick(leftEl, "left");
    bindStick(rightEl, "right");

    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      if (this.keys.has(key)) return;
      this.keys.add(key);
      if (event.key === " " || event.key === "Tab") event.preventDefault();
      if (key === "v" || event.key === "Tab") this.switchPressed = true;
      if (event.key === " ") this.actionPressed = true;
    });
    window.addEventListener("keyup", (event) => {
      this.keys.delete(event.key.toLowerCase());
    });
  }

  bindButtons(opts: {
    action: HTMLElement;
    swap: HTMLElement;
    stickIn: HTMLElement;
    stickOut: HTMLElement;
  }): void {
    const hold = (
      el: HTMLElement,
      set: (pressed: boolean) => void,
      onPress?: () => void,
    ) => {
      el.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        el.setPointerCapture(event.pointerId);
        set(true);
        onPress?.();
      });
      const up = () => set(false);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    };
    hold(opts.action, (pressed) => {
      this.actionButtonDown = pressed;
    }, () => {
      this.actionPressed = true;
    });
    opts.swap.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.switchPressed = true;
    });
    hold(opts.stickIn, (pressed) => {
      this.stickInButton = pressed;
    });
    hold(opts.stickOut, (pressed) => {
      this.stickOutButton = pressed;
    });
  }

  update(): void {
    if (!this.hasPointer("left")) {
      const x = (this.keys.has("d") ? 1 : 0) - (this.keys.has("a") ? 1 : 0);
      const y = (this.keys.has("w") ? 1 : 0) - (this.keys.has("s") ? 1 : 0);
      this.left = clampStick(x, y);
    }
    if (!this.hasPointer("right")) {
      const x = (this.keys.has("l") ? 1 : 0) - (this.keys.has("j") ? 1 : 0);
      const y = (this.keys.has("i") ? 1 : 0) - (this.keys.has("k") ? 1 : 0);
      this.right = clampStick(x, y);
    }
    this.stickIn = this.stickInButton || this.keys.has("q");
    this.stickOut = this.stickOutButton || this.keys.has("e");
    this.actionHeld = this.actionButtonDown || this.keys.has(" ");
  }

  endFrame(): void {
    this.actionPressed = false;
    this.switchPressed = false;
  }

  private hasPointer(side: "left" | "right"): boolean {
    for (const value of this.pointers.values()) {
      if (value.side === side) return true;
    }
    return false;
  }

  private moveStick(side: "left" | "right", el: HTMLElement, event: PointerEvent): void {
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const radius = rect.width * 0.5;
    const stick = clampStick((event.clientX - cx) / radius, -(event.clientY - cy) / radius);
    if (side === "left") this.left = stick;
    else this.right = stick;
    const knob = el.querySelector("i");
    if (knob instanceof HTMLElement) {
      const px = stick.x * radius * 0.45;
      const py = -stick.y * radius * 0.45;
      knob.style.transform = `translate(${px}px, ${py}px)`;
    }
  }
}
