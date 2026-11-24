import "./port.css";

export type Stick = { x: number; y: number };

export type PortHudView = {
  objective: string;
  hint: string;
  action: string;
  swap: string;
  leftLabel: string;
  rightMode: "arm" | "heli";
  meters: { label: string; value: number; tone?: "good" | "warn" | "bad" }[];
};

function clampStick(x: number, y: number): Stick {
  const len = Math.hypot(x, y);
  if (len > 1) return { x: x / len, y: y / len };
  return { x, y };
}

/** Self-contained two-thumb HUD for Port Blackout only. */
export class PortHud {
  readonly left: Stick = { x: 0, y: 0 };
  readonly right: Stick = { x: 0, y: 0 };
  actionHeld = false;
  actionPressed = false;
  switchPressed = false;
  menuPressed = false;

  private root: HTMLElement;
  private hintEl: HTMLButtonElement;
  private objEl: HTMLElement;
  private actionEl: HTMLButtonElement;
  private swapEl: HTMLButtonElement;
  private metersEl: HTMLElement;
  private leftLabel: HTMLElement;
  private rightLabel: HTMLElement;
  private heliAxes: HTMLElement;
  private pointers = new Map<number, { side: "left" | "right" }>();
  private keys = new Set<string>();
  private actionButtonDown = false;
  private onKeyDown: (event: KeyboardEvent) => void;
  private onKeyUp: (event: KeyboardEvent) => void;

  constructor(onMenu: () => void, onDismissHint: () => void) {
    this.root = document.createElement("div");
    this.root.id = "port-hud";
    this.root.innerHTML = `
      <div class="top">
        <button type="button" data-role="menu">Menu</button>
        <div class="copy">
          <p class="title">Port Blackout</p>
          <p class="obj"></p>
        </div>
      </div>
      <div class="col">
        <button type="button" class="hint" hidden></button>
        <div class="meters"></div>
      </div>
      <div class="stick left" data-stick="left">
        <span class="lbl">Drive</span>
        <i></i>
      </div>
      <div class="stick right" data-stick="right">
        <span class="lbl">Arm</span>
        <span class="heli-axes" hidden>
          <span class="axis top">Climb</span>
          <span class="axis mid">Yaw</span>
        </span>
        <i></i>
      </div>
      <div class="actions">
        <button type="button" data-role="swap">Helicopter</button>
        <button type="button" class="action" data-role="action">Grab</button>
      </div>
    `;
    document.body.append(this.root);

    this.hintEl = this.root.querySelector(".hint") as HTMLButtonElement;
    this.objEl = this.root.querySelector(".obj") as HTMLElement;
    this.actionEl = this.root.querySelector("[data-role=action]") as HTMLButtonElement;
    this.swapEl = this.root.querySelector("[data-role=swap]") as HTMLButtonElement;
    this.metersEl = this.root.querySelector(".meters") as HTMLElement;
    this.leftLabel = this.root.querySelector(".stick.left .lbl") as HTMLElement;
    this.rightLabel = this.root.querySelector(".stick.right .lbl") as HTMLElement;
    this.heliAxes = this.root.querySelector(".heli-axes") as HTMLElement;

    this.root.querySelector("[data-role=menu]")?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.menuPressed = true;
      onMenu();
    });
    this.swapEl.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.switchPressed = true;
    });
    const hold = (el: HTMLElement, set: (on: boolean) => void, press?: () => void) => {
      el.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        el.setPointerCapture(event.pointerId);
        set(true);
        press?.();
      });
      const up = () => set(false);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    };
    hold(this.actionEl, (on) => {
      this.actionButtonDown = on;
    }, () => {
      this.actionPressed = true;
    });
    this.hintEl.addEventListener("click", () => onDismissHint());

    this.bindStick(this.root.querySelector("[data-stick=left]") as HTMLElement, "left");
    this.bindStick(this.root.querySelector("[data-stick=right]") as HTMLElement, "right");

    this.onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (this.keys.has(key)) return;
      this.keys.add(key);
      if (event.key === " " || event.key === "Tab") event.preventDefault();
      if (key === "v" || event.key === "Tab") this.switchPressed = true;
      if (event.key === " ") this.actionPressed = true;
      if (key === "m" || event.key === "escape") {
        this.menuPressed = true;
        onMenu();
      }
    };
    this.onKeyUp = (event: KeyboardEvent) => {
      this.keys.delete(event.key.toLowerCase());
    };
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  updateView(view: PortHudView): void {
    this.objEl.textContent = view.objective;
    this.hintEl.textContent = view.hint;
    this.hintEl.hidden = !view.hint;
    this.actionEl.textContent = view.action;
    this.swapEl.textContent = view.swap;
    this.leftLabel.textContent = view.leftLabel;
    const heli = view.rightMode === "heli";
    this.heliAxes.hidden = !heli;
    this.rightLabel.hidden = heli;
    if (!heli) this.rightLabel.textContent = "Arm";
    this.metersEl.replaceChildren();
    for (const meter of view.meters) {
      const wrap = document.createElement("div");
      wrap.className = "meter";
      const label = document.createElement("span");
      label.textContent = meter.label;
      const track = document.createElement("i");
      const bar = document.createElement("b");
      if (meter.tone) bar.className = meter.tone;
      bar.style.width = `${Math.round(Math.max(0, Math.min(1, meter.value)) * 100)}%`;
      track.append(bar);
      wrap.append(label, track);
      this.metersEl.append(wrap);
    }
  }

  poll(): void {
    if (!this.hasPointer("left")) {
      const x = (this.keys.has("d") ? 1 : 0) - (this.keys.has("a") ? 1 : 0);
      const y = (this.keys.has("w") ? 1 : 0) - (this.keys.has("s") ? 1 : 0);
      const next = clampStick(x, y);
      this.left.x = next.x;
      this.left.y = next.y;
    }
    if (!this.hasPointer("right")) {
      const x = (this.keys.has("l") ? 1 : 0) - (this.keys.has("j") ? 1 : 0);
      const y = (this.keys.has("i") ? 1 : 0) - (this.keys.has("k") ? 1 : 0);
      const next = clampStick(x, y);
      this.right.x = next.x;
      this.right.y = next.y;
    }
    this.actionHeld = this.actionButtonDown || this.keys.has(" ");
  }

  endFrame(): void {
    this.actionPressed = false;
    this.switchPressed = false;
    this.menuPressed = false;
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.root.remove();
  }

  private hasPointer(side: "left" | "right"): boolean {
    for (const value of this.pointers.values()) {
      if (value.side === side) return true;
    }
    return false;
  }

  private bindStick(el: HTMLElement, side: "left" | "right"): void {
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
      const stick = side === "left" ? this.left : this.right;
      stick.x = 0;
      stick.y = 0;
      const knob = el.querySelector("i");
      if (knob instanceof HTMLElement) knob.style.transform = "";
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  private moveStick(side: "left" | "right", el: HTMLElement, event: PointerEvent): void {
    const rect = el.getBoundingClientRect();
    const stick = clampStick(
      (event.clientX - (rect.left + rect.width / 2)) / (rect.width * 0.5),
      -(event.clientY - (rect.top + rect.height / 2)) / (rect.height * 0.5),
    );
    const target = side === "left" ? this.left : this.right;
    target.x = stick.x;
    target.y = stick.y;
    const knob = el.querySelector("i");
    if (knob instanceof HTMLElement) {
      knob.style.transform = `translate(${stick.x * rect.width * 0.225}px, ${-stick.y * rect.height * 0.225}px)`;
    }
  }
}
