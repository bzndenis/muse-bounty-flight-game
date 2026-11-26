// Langit Nusantara — boot, fixed-step loop, and the play-test handle.
// ?seed=N sets the world seed; ?shot=cover|rings|cockpit|land renders one
// frozen, deterministic scene for screenshots.
import { CONFIG } from './config.js';
import { newGameState, stepPlane, resetGame } from './physics.js';
import { newInput, bindInput } from './input.js';
import { SoundBank } from './audio.js';
import { buildClouds, buildSparkles } from './world.js';
import { SHOTS } from './shots.js';
import { drawHud, drawTitle, drawPause, drawCrashed, drawLanded, renderFrame } from './render.js';

const params = new URLSearchParams(window.location.search);
const seed = Number.parseInt(params.get('seed') || '7', 10) || 7;
const shotName = params.get('shot');

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

function fitCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = CONFIG.width * dpr;
  canvas.height = CONFIG.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

const clouds = buildClouds(seed);
const sparkles = buildSparkles(seed + 4);
const sounds = new SoundBank();
const input = newInput();

let staged = null;
let state;
let view = 'chase';
if (shotName && SHOTS[shotName]) {
  staged = SHOTS[shotName](seed);
  state = staged.state;
  view = staged.view;
} else {
  state = newGameState(seed);
}

const actions = {
  confirm() {
    sounds.ensure();
    if (state.screen === 'title') {
      state.screen = 'play';
      sounds.click();
    } else if (state.screen === 'crashed' || state.screen === 'landed') {
      resetGame(state);
      sounds.click();
    }
  },
  toggleView() {
    view = view === 'chase' ? 'cockpit' : 'chase';
    sounds.click();
  },
  toggleAutopilot() {
    if (state.screen !== 'play') return;
    state.plane.autopilot = !state.plane.autopilot;
    state.plane.message = state.plane.autopilot ? 'CO-PILOT AKTIF' : 'CO-PILOT MATI';
    state.plane.messageUntil = state.plane.time + 2;
    sounds.click();
  },
  togglePause() {
    if (state.screen === 'play') state.screen = 'pause';
    else if (state.screen === 'pause') state.screen = 'play';
  },
  toggleMute() {
    sounds.ensure();
    sounds.toggleMute();
  },
  restart() {
    if (state.screen === 'play' || state.screen === 'crashed' || state.screen === 'landed' || state.screen === 'pause') {
      resetGame(state);
    }
  },
};
bindInput(canvas, input, actions);

const STEP = 1 / 60;
let last = performance.now();
let acc = 0;
let elapsed = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dtMs = Math.min(now - last, 100);
  last = now;
  if (staged) {
    // Frozen scene: render the staged frame with a fixed fake clock.
    const cam = renderFrame(ctx, state, view, clouds, sparkles, staged.time);
    drawHud(ctx, state, cam);
    return;
  }
  elapsed += dtMs / 1000;
  acc += dtMs / 1000;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    if (state.screen === 'play') stepPlane(state, input, STEP);
    acc -= STEP;
    steps += 1;
  }
  if (state.ringChime) {
    state.ringChime = false;
    sounds.ring();
  }
  if (state.crashSound) {
    state.crashSound = false;
    sounds.crash();
  }
  if (state.landedFanfare) {
    state.landedFanfare = false;
    sounds.fanfare();
    sounds.touchdown();
  }
  sounds.setEngine(state.plane.throttle, state.plane.speed, state.plane.airborne);
  const cam = renderFrame(ctx, state, view, clouds, sparkles, elapsed);
  if (state.screen === 'play' || state.screen === 'pause') drawHud(ctx, state, cam);
  if (state.screen === 'title') drawTitle(ctx, state);
  if (state.screen === 'pause') drawPause(ctx);
  if (state.screen === 'crashed') drawCrashed(ctx, state);
  if (state.screen === 'landed') drawLanded(ctx, state);
  const p = state.plane;
  statusEl.textContent = `Langit Nusantara: altitude ${Math.round(p.y)} metres, speed ${Math.round(p.speed * 1.944)} knots, heading ${Math.round((((p.heading * 180) / Math.PI + 90) % 360 + 360) % 360)} degrees, score ${p.score}, rings ${p.ringsPassed} of 6.`;
}

// The play-test handle: the game's live state, for headless verification.
window.__langitNusantara = {
  state,
  get view() {
    return view;
  },
  set view(v) {
    view = v;
  },
  actions,
  input,
  stepPlane,
  CONFIG,
};
requestAnimationFrame(frame);
