// The 2D overlay: HUD readouts, the cockpit instrument panel, messages and
// the title / pause / crash / landed screens.
import { CONFIG, PALETTE, RUNWAY } from './config.js';
import { clamp, wrapAngle } from './random.js';
import { project, drawNose, makeCamera, drawSky, drawOcean, drawTerrain, drawRunway, drawSparkles, drawRings, drawClouds, drawPlaneShadow, drawPlane } from './draw.js';
import { heightAt } from './world.js';

function knots(ms) {
  return Math.round(ms * 1.944);
}

function headingDeg(h) {
  // Compass bearing: 0 = north (-z), 90 = east (+x). The heading angle h is
  // measured in the xz-plane from +x, so the bearing is h + 90 degrees.
  return Math.round((((h * 180) / Math.PI + 90) % 360 + 360) % 360);
}

function compassLabel(deg) {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return names[Math.round(deg / 45) % 8];
}

function bar(ctx, x, y, w, h, frac, fill, label, text) {
  ctx.fillStyle = 'rgba(8,24,40,0.62)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x + 2, y + 2, (w - 4) * clamp(frac, 0, 1), h - 4);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#eaf6ff';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 6, y + h / 2);
  ctx.textAlign = 'right';
  ctx.fillText(text, x + w - 6, y + h / 2);
}

export function drawHud(ctx, state, cam) {
  const p = state.plane;
  const W = CONFIG.width;
  const H = CONFIG.height;
  ctx.textBaseline = 'middle';

  // Top bar: altitude, speed, heading.
  ctx.fillStyle = 'rgba(8,24,40,0.55)';
  ctx.fillRect(0, 0, W, 46);
  ctx.fillStyle = PALETTE.hud;
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'left';
  const alt = Math.max(0, Math.round(p.y));
  ctx.fillText(`ALT ${alt} m`, 16, 24);
  ctx.fillText(`SPD ${knots(p.speed)} kt`, 190, 24);
  const hd = headingDeg(p.heading);
  ctx.fillText(`HDG ${String(hd).padStart(3, '0')}° ${compassLabel(hd)}`, 380, 24);
  // Compass tape across the top centre.
  ctx.save();
  ctx.beginPath();
  ctx.rect(620, 6, 260, 34);
  ctx.clip();
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  for (let d = -120; d <= 120; d += 15) {
    const deg = (hd + d + 360) % 360;
    const x = 750 + d * 1.1;
    const major = deg % 45 === 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.moveTo(x, 34);
    ctx.lineTo(x, major ? 18 : 26);
    ctx.stroke();
    if (major) {
      ctx.fillStyle = '#fff';
      ctx.fillText(deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : String(deg), x, 13);
    }
  }
  ctx.restore();
  ctx.fillStyle = PALETTE.gold;
  ctx.beginPath();
  ctx.moveTo(750, 40);
  ctx.lineTo(744, 32);
  ctx.lineTo(756, 32);
  ctx.closePath();
  ctx.fill();
  // Score, rings, time at top right (with a dark underlay so clouds behind
  // the text never wash it out).
  ctx.textAlign = 'right';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = 'rgba(8,24,40,0.55)';
  ctx.fillText(`SKOR ${p.score}`, W - 15, 25);
  ctx.fillStyle = PALETTE.hud;
  ctx.fillText(`SKOR ${p.score}`, W - 16, 24);
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = 'rgba(8,24,40,0.55)';
  const mins = Math.floor(p.time / 60);
  const secs = Math.floor(p.time % 60);
  ctx.fillText(`RING ${p.ringsPassed}/6   ${mins}:${String(secs).padStart(2, '0')}`, W - 15, 59);
  ctx.fillStyle = '#ffe9a8';
  ctx.fillText(`RING ${p.ringsPassed}/6   ${mins}:${String(secs).padStart(2, '0')}`, W - 16, 58);

  // Throttle (left) and fuel (right) bars.
  bar(ctx, 16, H - 130, 170, 22, p.throttle, '#f2b705', 'THR', `${Math.round(p.throttle * 100)}%`);
  const fuelCol = p.fuel > 25 ? '#4fc06a' : '#e0523f';
  bar(ctx, W - 186, H - 130, 170, 22, p.fuel / 100, fuelCol, 'FUEL', `${Math.round(p.fuel)}%`);
  // Vertical speed.
  ctx.textAlign = 'left';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = '#cfe8f8';
  const vs = p.verticalSpeed;
  ctx.fillText(`V/S ${vs >= 0 ? '+' : ''}${vs.toFixed(1)} m/s`, 16, H - 92);

  // Off-screen pointer to the next ring or the runway.
  const target = state.rings.find((r) => !r.passed)
    || { x: RUNWAY.cx, y: RUNWAY.elevation + 5, z: RUNWAY.cz };
  const tp = project(cam, target.x, target.y, target.z);
  if (tp && (tp.x < 40 || tp.x > W - 40 || tp.y < 70 || tp.y > H - 160 || tp.cz < 0)) {
    const ex = clamp(tp.x, 80, W - 80);
    const ey = clamp(tp.y, 100, H - 180);
    ctx.fillStyle = 'rgba(8,24,40,0.6)';
    ctx.beginPath();
    ctx.arc(ex, ey, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('◆', ex, ey + 1);
    const dist = Math.round(Math.hypot(target.x - p.x, target.y - p.y, target.z - p.z));
    ctx.font = 'bold 12px sans-serif';
    const labelX = clamp(ex, 60, W - 60);
    ctx.fillText(`${dist} m`, labelX, ey + 38);
  }

  // Stall / fuel warnings.
  if (state.screen === 'play' && p.airborne && p.speed < CONFIG.stallSpeed) {
    ctx.fillStyle = '#ff5a4a';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚠ STALL — TAMBAH THROTTLE', W / 2, 84);
  }

  // Centre message banner.
  if (p.message && p.time < p.messageUntil) {
    ctx.fillStyle = 'rgba(8,24,40,0.68)';
    ctx.font = 'bold 24px sans-serif';
    const w = ctx.measureText(p.message).width + 36;
    ctx.fillRect(W / 2 - w / 2, 108, w, 40);
    ctx.fillStyle = '#ffe9a8';
    ctx.textAlign = 'center';
    ctx.fillText(p.message, W / 2, 129);
  }

  // Controls hint, fading after the first seconds of flight.
  if (state.screen === 'play' && p.time < 14) {
    ctx.fillStyle = `rgba(234,246,255,${clamp(1 - p.time / 14, 0.15, 0.9)})`;
    ctx.font = '15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('↑↓ pitch · ←→ belok · W/S throttle · C kokpit · A co-pilot · P jeda · M suara', W / 2, H - 24);
  }
}

function gauge(ctx, cx, cy, r, label, valueText, drawNeedle) {
  ctx.save();
  ctx.translate(cx, cy);
  // Backlit face.
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, r);
  g.addColorStop(0, '#1d2f42');
  g.addColorStop(1, '#0a1622');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8fa8bd';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (r - 4), Math.sin(a) * (r - 4));
    ctx.lineTo(Math.cos(a) * (r - 10), Math.sin(a) * (r - 10));
    ctx.stroke();
  }
  drawNeedle(ctx, r);
  ctx.fillStyle = '#eaf6ff';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, 0, r - 14);
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(valueText, 0, 6);
  ctx.restore();
}

export function drawPanel(ctx, state, time) {
  const p = state.plane;
  const W = CONFIG.width;
  const H = CONFIG.height;
  // Panel body.
  const pg = ctx.createLinearGradient(0, H - 210, 0, H);
  pg.addColorStop(0, '#1c2733');
  pg.addColorStop(1, '#0b121a');
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.moveTo(0, H - 150);
  ctx.quadraticCurveTo(W / 2, H - 215, W, H - 150);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#46586a';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Artificial horizon.
  const ax = W / 2 - 300;
  const ay = H - 96;
  const ar = 62;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax, ay, ar, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(ax, ay);
  ctx.rotate(-p.roll);
  const pitchPx = clamp(p.pitch, -0.6, 0.6) * 90;
  ctx.fillStyle = '#4a90d9';
  ctx.fillRect(-ar - 4, -ar - 4 - pitchPx, ar * 2 + 8, ar + 4 + pitchPx);
  ctx.fillStyle = '#7a5a34';
  ctx.fillRect(-ar - 4, pitchPx, ar * 2 + 8, ar + 4);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-ar, pitchPx);
  ctx.lineTo(ar, pitchPx);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#8fa8bd';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ax, ay, ar, 0, Math.PI * 2);
  ctx.stroke();
  // Fixed wings marker.
  ctx.fillStyle = '#f2b705';
  ctx.fillRect(ax - 40, ay - 3, 26, 6);
  ctx.fillRect(ax + 14, ay - 3, 26, 6);
  ctx.beginPath();
  ctx.arc(ax, ay, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#eaf6ff';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ATTITUDE', ax, ay + ar + 14);

  // Altimeter.
  gauge(ctx, W / 2 - 150, H - 96, 52, 'ALT m', String(Math.max(0, Math.round(p.y))), (c, r) => {
    const a = -Math.PI / 2 + (clamp(p.y, 0, 1000) / 1000) * Math.PI * 1.5;
    c.strokeStyle = '#ffcf4d';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(Math.cos(a) * (r - 12), Math.sin(a) * (r - 12));
    c.stroke();
  });
  // Airspeed.
  gauge(ctx, W / 2, H - 96, 52, 'KT', String(knots(p.speed)), (c, r) => {
    const a = -Math.PI / 2 + (clamp(p.speed, 0, 120) / 120) * Math.PI * 1.5;
    c.strokeStyle = '#7ee2a8';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(Math.cos(a) * (r - 12), Math.sin(a) * (r - 12));
    c.stroke();
  });
  // Heading dial: the needle points at the compass bearing (north up).
  gauge(ctx, W / 2 + 150, H - 96, 52, 'HDG', String(headingDeg(p.heading)).padStart(3, '0'), (c, r) => {
    const a = -Math.PI / 2 + wrapAngle(p.heading + Math.PI / 2);
    c.strokeStyle = '#9fd8ff';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(Math.cos(a) * (r - 12), Math.sin(a) * (r - 12));
    c.stroke();
    c.fillStyle = '#9fd8ff';
    c.font = 'bold 10px sans-serif';
    c.textAlign = 'center';
    c.fillText('N', 0, -r + 20);
  });
  // Throttle lever (right) and fuel (left).
  const tx = W - 130;
  ctx.fillStyle = '#0a1622';
  ctx.fillRect(tx - 14, H - 170, 28, 120);
  ctx.strokeStyle = '#8fa8bd';
  ctx.strokeRect(tx - 14, H - 170, 28, 120);
  const leverY = H - 58 - p.throttle * 100;
  ctx.fillStyle = '#f2b705';
  ctx.fillRect(tx - 22, leverY - 6, 44, 12);
  ctx.fillStyle = '#eaf6ff';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('THR', tx, H - 186);
  // Warning lights.
  const stall = state.screen === 'play' && p.airborne && p.speed < CONFIG.stallSpeed;
  const lowFuel = p.fuel < 20;
  const blink = Math.sin(time * 8) > 0;
  const lights = [
    ['STALL', stall && blink, '#ff5a4a'],
    ['FUEL', lowFuel && blink, '#ffb02e'],
    ['RING', p.ringsPassed === 6, '#4fc06a'],
  ];
  lights.forEach(([label, on, col], i) => {
    const lx = 60 + i * 78;
    ctx.fillStyle = on ? col : 'rgba(120,130,140,0.35)';
    ctx.beginPath();
    ctx.arc(lx, H - 176, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#cfe8f8';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, lx, H - 158);
  });
}

function overlay(ctx, title, lines, accent) {
  const W = CONFIG.width;
  const H = CONFIG.height;
  ctx.fillStyle = 'rgba(6,18,30,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = accent;
  ctx.font = 'bold 54px sans-serif';
  ctx.fillText(title, W / 2, H / 2 - 110);
  ctx.fillStyle = '#eaf6ff';
  ctx.font = '20px sans-serif';
  lines.forEach((line, i) => {
    ctx.fillText(line, W / 2, H / 2 - 56 + i * 32);
  });
}

export function drawTitle(ctx, state) {
  const W = CONFIG.width;
  const H = CONFIG.height;
  overlay(ctx, 'LANGIT NUSANTARA', [
    'Terbang mengelilingi kepulauan, lewati 6 ring emas,',
    'lalu mendarat di runway Karang Field.',
    '',
    '↑ ↓ pitch      ← → belok      W / S throttle',
    'C ganti kamera      A co-pilot      P jeda      M suara',
    'Mouse: tahan & seret untuk mengemudi',
    '',
    'Tekan SPASI untuk lepas landas',
  ], '#ffd76a');
  ctx.fillStyle = '#9fc8dd';
  ctx.font = '15px sans-serif';
  ctx.fillText('Pesawat orisinal "Elang Laut" · Pulau Karang · Pulau Api · Pulau Hijau', W / 2, H - 36);
}

export function drawPause(ctx) {
  overlay(ctx, 'JEDA', ['Tekan P untuk lanjut terbang', 'M suara · R mulai dari awal'], '#9fd8ff');
}

export function drawCrashed(ctx, state) {
  const p = state.plane;
  overlay(ctx, 'PESAWAT JATUH', [
    p.crashReason || 'Kecelakaan',
    `Skor ${p.score} · Ring ${p.ringsPassed}/6 · Waktu ${Math.round(p.time)} dtk`,
    '',
    'Tekan R untuk terbang lagi',
  ], '#ff6a5a');
}

export function drawLanded(ctx, state) {
  const p = state.plane;
  overlay(ctx, 'PENDARATAN SEMPURNA!', [
    `Ring ${p.ringsPassed}/6  ·  Bonus mendarat +${p.landingBonus || 0} (termasuk bonus waktu +${p.timeBonus || 0})`,
    `Waktu ${Math.round(p.time)} dtk dari par ${CONFIG.parTime} dtk`,
    '',
    `SKOR AKHIR: ${p.score}`,
    '',
    'Tekan R untuk terbang lagi',
  ], '#7ee2a8');
}

export function renderFrame(ctx, state, view, clouds, sparkles, time) {
  const p = state.plane;
  const cam = makeCamera(state, view);
  drawSky(ctx, cam, time);
  drawOcean(ctx, cam);
  drawTerrain(ctx, cam);
  drawRunway(ctx, cam);
  drawSparkles(ctx, cam, sparkles);
  drawRings(ctx, cam, state.rings, time);
  drawClouds(ctx, cam, clouds);
  drawPlaneShadow(ctx, cam, p);
  if (view === 'cockpit') {
    drawNose(ctx, p, time);
    drawPanel(ctx, state, time);
  } else {
    drawPlane(ctx, cam, p, time);
  }
  return cam;
}
