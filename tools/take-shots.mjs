#!/usr/bin/env node
// Take Langit Nusantara's screenshots with headless Chromium: one real render
// per scene, straight from the game's own code, at a fixed seed. Writes JPEGs
// into screenshots/ (the first by name is the cover). Requires the Playwright
// Chromium build and Python 3 with PIL (or ffmpeg) for the PNG -> JPEG step.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const entry = join(here, '..');
const gameDir = join(entry, 'game');
const shotDir = join(entry, 'screenshots');
const chrome = `${process.env.HOME}/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome`;

const SHOTS = [
  { name: '1-cover.jpg', query: 'shot=cover&seed=7' },
  { name: '2-rings.jpg', query: 'shot=rings&seed=7' },
  { name: '3-cockpit.jpg', query: 'shot=cockpit&seed=7' },
  { name: '4-land.jpg', query: 'shot=land&seed=7' },
];

const PORT = 8933;

function serve() {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', gameDir], {
    stdio: 'ignore',
  });
  return server;
}

async function waitForServer() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/index.html`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('static server did not come up');
}

function toJpeg(pngPath, jpgPath) {
  try {
    execFileSync('python3', ['-c',
      'import sys; from PIL import Image; '
      + 'im = Image.open(sys.argv[1]).convert("RGB"); '
      + 'im = im.crop((0, 0, 1280, 720)); '
      + 'im.save(sys.argv[2], "JPEG", quality=88, optimize=True)',
      pngPath, jpgPath], { stdio: 'pipe' });
  } catch {
    execFileSync('ffmpeg', ['-y', '-i', pngPath, '-q:v', '4', jpgPath], { stdio: 'pipe' });
  }
}

const server = serve();
try {
  await waitForServer();
  mkdirSync(shotDir, { recursive: true });
  for (const shot of SHOTS) {
    const png = join(shotDir, `${shot.name}.png`);
    const jpg = join(shotDir, shot.name);
    if (existsSync(png)) unlinkSync(png);
    if (existsSync(jpg)) unlinkSync(jpg);
    execFileSync(chrome, [
      '--headless=new', '--disable-gpu', '--no-sandbox',
      '--window-size=1280,807', '--hide-scrollbars', // 807px window -> 720px viewport in headless=new
      `--virtual-time-budget=20000`,
      `--screenshot=${png}`,
      `http://127.0.0.1:${PORT}/index.html?${shot.query}`,
    ], { stdio: 'pipe', timeout: 120000 });
    toJpeg(png, jpg);
    unlinkSync(png);
    const size = statSync(jpg).size;
    console.log(`${shot.name}: ${size} bytes`);
  }
  console.log('shots in:', readdirSync(shotDir).join(', '));
} finally {
  server.kill();
}
