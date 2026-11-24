import { Game } from "./game";
import { Input } from "./input";

const canvas = document.querySelector("#view");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Missing canvas");
}

const game = new Game(canvas);
const input = new Input();

const menu = must("#menu");
const hud = must("#hud");
const garageUi = must("#garage-ui");
const end = must("#end");
const hudTitle = must("#hud-title");
const hudObjective = must("#hud-objective");
const hudHint = must("#hud-hint");
const hudMeters = must("#hud-meters");
const btnAction = must("#btn-action");
const btnSwitch = must("#btn-switch");
const stickAdjust = must("#stick-adjust");
const labelRight = must("#label-right");
const craneAxes = must("#crane-axes");
const garageName = must("#garage-name");
const garageBlurb = must("#garage-blurb");
const endKicker = must("#end-kicker");
const endTitle = must("#end-title");
const endStars = must("#end-stars");
const endBody = must("#end-body");

input.bind(must("#stick-left"), must("#stick-right"));
input.bindButtons({
  action: btnAction,
  swap: btnSwitch,
  stickIn: must("#btn-stick-in"),
  stickOut: must("#btn-stick-out"),
});

menu.addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest("button[data-go]");
  if (!(btn instanceof HTMLElement)) return;
  const go = btn.dataset.go;
  if (go === "levee") game.startLevee();
  else if (go === "airfield") game.startAirfield();
  else if (go === "port") game.startPortBlackout();
  else if (go === "garage") game.showGarage();
});

must("#btn-menu").addEventListener("click", () => game.showMenu());
must("#btn-prev").addEventListener("click", () => game.nextGarage(-1));
must("#btn-next").addEventListener("click", () => game.nextGarage(1));
must("#btn-garage-back").addEventListener("click", () => game.showMenu());
must("#btn-replay").addEventListener("click", () => game.replay());
must("#btn-other").addEventListener("click", () => game.otherMission());
must("#btn-end-menu").addEventListener("click", () => game.showMenu());
hudHint.addEventListener("click", () => game.dismissHint());

game.onChange = syncUi;
syncUi();

function syncUi(): void {
  const mode = game.end ? "end" : game.mode;
  menu.hidden = mode !== "menu";
  hud.hidden = mode !== "levee" && mode !== "airfield";
  garageUi.hidden = mode !== "garage";
  end.hidden = mode !== "end";

  if (mode === "garage") {
    const cap = game.garageCaption();
    garageName.textContent = cap.name;
    garageBlurb.textContent = cap.blurb;
  }

  if (mode === "end" && game.end) {
    endKicker.textContent = game.end.won ? "Mission complete" : "Mission failed";
    endTitle.textContent = game.end.title;
    endBody.textContent = game.end.body;
    endStars.textContent = "★".repeat(game.end.stars) + "☆".repeat(Math.max(0, 3 - game.end.stars));
  }

  if (mode === "levee" || mode === "airfield") {
    applyHud(true);
  }
}

function applyHud(rebuildMeters: boolean): void {
  const state = game.hud;
  hudTitle.textContent = state.title;
  hudObjective.textContent = state.objective;
  hudHint.textContent = state.hint;
  hudHint.hidden = !state.hint;
  btnAction.textContent = state.action;
  btnAction.hidden = !state.showAction;
  btnSwitch.textContent = state.swap;
  stickAdjust.hidden = true;
  craneAxes.hidden = state.rightStick !== "crane";
  labelRight.hidden = state.rightStick !== "blade";
  labelRight.textContent = "Lift · Tilt";
  if (rebuildMeters) {
    hudMeters.replaceChildren();
    for (const meter of state.meters) {
      const wrap = document.createElement("div");
      wrap.className = "meter";
      const label = document.createElement("span");
      label.textContent = meter.label;
      const track = document.createElement("i");
      const bar = document.createElement("b");
      if (meter.tone) bar.className = meter.tone;
      bar.style.width = `${Math.round(THREE_CLAMP(meter.value) * 100)}%`;
      track.append(bar);
      wrap.append(label, track);
      hudMeters.append(wrap);
    }
  }
}

function THREE_CLAMP(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function must(sel: string): HTMLElement {
  const el = document.querySelector(sel);
  if (!(el instanceof HTMLElement)) throw new Error(`Missing ${sel}`);
  return el;
}

window.addEventListener("resize", () => game.resize());

function frame(): void {
  input.update();
  game.step(input);
  if (!hud.hidden) {
    applyHud(false);
    const bars = hudMeters.querySelectorAll("b");
    game.hud.meters.forEach((meter, i) => {
      const bar = bars[i];
      if (!(bar instanceof HTMLElement)) return;
      bar.style.width = `${Math.round(THREE_CLAMP(meter.value) * 100)}%`;
      bar.className = meter.tone ?? "";
    });
    if (game.end) syncUi();
  }
  input.endFrame();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
