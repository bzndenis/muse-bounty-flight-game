#!/usr/bin/env node
// Play-test Langit Nusantara in headless Chromium over CDP: load the game,
// assert no console errors and no network request outside the local server,
// take off with real keyboard input, then let the in-game co-pilot fly the
// ring course and land, fast-forwarding the fixed-step simulation through the
// game's own stepPlane (the same code the live loop runs).
import { spawn } from 'node:child_process';

const entry = new URL('..', import.meta.url).pathname;
const gameDir = `${entry}game`;
const chrome = `${process.env.HOME}/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome`;
const PORT = 8934;
const DEBUG_PORT = 9334;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function serve() {
  return spawn('python3', ['-m', 'http.server', String(PORT), '--directory', gameDir], { stdio: 'ignore' });
}

async function getTarget() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === 'page');
      if (page) return page;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('chrome devtools did not come up');
}

const server = serve();
const chromeProc = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows', '--disable-frame-rate-limit',
  `--remote-debugging-port=${DEBUG_PORT}`,
  '--window-size=1280,807',
  'about:blank',
], { stdio: 'ignore' });

const failures = [];
const errors = [];
const requests = [];
let ws;
let msgId = 0;
const pending = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalJs(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true });
  if (res.exceptionDetails) throw new Error(`evaluate failed: ${JSON.stringify(res.exceptionDetails)}`);
  return res.result.value;
}

async function waitFor(expression, label, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await evalJs(expression)) return true;
    } catch { /* page not ready */ }
    await sleep(200);
  }
  failures.push(`timeout waiting for: ${label}`);
  return false;
}

async function key(type, keyName, code, keyCode) {
  await send('Input.dispatchKeyEvent', { type, key: keyName, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
}

function stateExpr() {
  return `(() => { const g = window.__langitNusantara; const p = g.state.plane; return { screen: g.state.screen, x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z), speed: Math.round(p.speed), throttle: Math.round(p.throttle * 100) / 100, fuel: Math.round(p.fuel), airborne: p.airborne, landed: p.landed, crashed: p.crashed, crashReason: p.crashReason, rings: p.ringsPassed, score: p.score, time: Math.round(p.time), heading: Math.round(p.heading * 180 / Math.PI), autopilot: p.autopilot }; })()`;
}

try {
  const target = await getTarget();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description ?? ''));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
    if (msg.method === 'Network.requestWillBeSent') requests.push(msg.params.request.url);
  };
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html?seed=11` });
  await waitFor(`!!window.__langitNusantara`, 'game handle', 15000);
  await sleep(1500);
  console.log('loaded, screen =', await evalJs(`window.__langitNusantara.state.screen`));

  // Start with Space (real keyboard input).
  await key('keyDown', ' ', 'Space', 32);
  await key('keyUp', ' ', 'Space', 32);
  await waitFor(`window.__langitNusantara.state.screen === 'play'`, 'play screen', 5000);
  console.log('playing:', JSON.stringify(await evalJs(stateExpr())));

  // Take off: hold W (throttle) and ArrowUp (pitch up) with real key events
  // for a short climb, then level off and hand over to the co-pilot.
  await key('keyDown', 'w', 'KeyW', 87);
  await key('keyDown', 'ArrowUp', 'ArrowUp', 38);
  await evalJs(`(() => { const g = window.__langitNusantara; for (let i = 0; i < 60 * 8; i += 1) g.stepPlane(g.state, g.input, 1 / 60); return true; })()`);
  await key('keyUp', 'ArrowUp', 'ArrowUp', 38);
  await evalJs(`(() => { const g = window.__langitNusantara; for (let i = 0; i < 60 * 12; i += 1) g.stepPlane(g.state, g.input, 1 / 60); return true; })()`);
  const afterTakeoff = await evalJs(stateExpr());
  console.log('after takeoff:', JSON.stringify(afterTakeoff));
  if (!afterTakeoff.airborne) failures.push('plane never left the ground');
  if (afterTakeoff.y < 40) failures.push(`altitude too low after takeoff: ${afterTakeoff.y} m`);
  if (afterTakeoff.speed < 30) failures.push(`speed too low after takeoff: ${afterTakeoff.speed} m/s`);

  // Co-pilot flies the ring course and lands; fast-forward in 30 s chunks.
  await key('keyDown', 'a', 'KeyA', 65);
  await key('keyUp', 'a', 'KeyA', 65);
  await key('keyUp', 'w', 'KeyW', 87);
  let landed = false;
  for (let chunk = 0; chunk < 24; chunk += 1) {
    await evalJs(`(() => { const g = window.__langitNusantara; for (let i = 0; i < 60 * 30; i += 1) g.stepPlane(g.state, g.input, 1 / 60); return true; })()`);
    const s = await evalJs(stateExpr());
    console.log(`chunk ${chunk}:`, JSON.stringify(s));
    if (s.crashed) { failures.push(`crashed during co-pilot flight: ${s.crashReason}`); break; }
    if (s.landed) { landed = true; break; }
    if (errors.length) break;
  }
  const finalState = await evalJs(stateExpr());
  console.log('final state:', JSON.stringify(finalState));
  if (!landed) failures.push('co-pilot never landed within the fast-forward window');
  if (finalState.rings < 6) failures.push(`only ${finalState.rings}/6 rings passed`);
  if (finalState.score < 600) failures.push(`score too low: ${finalState.score}`);
  if (finalState.screen !== 'landed') failures.push(`final screen is ${finalState.screen}, not landed`);

  // Restart with R and confirm the game resets to play.
  await key('keyDown', 'r', 'KeyR', 82);
  await key('keyUp', 'r', 'KeyR', 82);
  await waitFor(`window.__langitNusantara.state.screen === 'play' && window.__langitNusantara.state.plane.score === 0`, 'restart', 5000);
  console.log('restart ok:', JSON.stringify(await evalJs(stateExpr())));
} catch (err) {
  failures.push(`play-test crashed: ${err.message}`);
} finally {
  if (ws) ws.close();
  chromeProc.kill();
  server.kill();
}

console.log('--- network requests:', requests.length);
for (const url of requests) console.log(' ', url);
const external = requests.filter((u) => !u.startsWith(`http://127.0.0.1:${PORT}`) && !u.startsWith('data:'));
if (external.length) failures.push(`external requests: ${external.join(', ')}`);
console.log('--- console errors:', errors.length);
for (const e of errors) console.log(' ', e);
if (errors.length) failures.push(`${errors.length} console error(s)`);

if (failures.length) {
  console.log('PLAYTEST FAILED:');
  for (const f of failures) console.log(' -', f);
  process.exit(1);
}
console.log('PLAYTEST PASSED');
