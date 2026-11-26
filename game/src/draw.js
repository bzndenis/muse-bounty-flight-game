// The renderer: a hand-rolled perspective camera over the heightfield, drawn
// with plain Canvas 2D — sky, sun, sea, terrain mesh, runway, rings, clouds,
// and the aircraft itself. No libraries, no images, no network.
import { CONFIG, PALETTE, RUNWAY } from './config.js';
import { heightAt, terrainColor, buildClouds, buildSparkles } from './world.js';
import { clamp, mulberry32 } from './random.js';

const ROW_DIST = [22, 32, 45, 60, 78, 100, 125, 155, 190, 230, 275, 325, 380, 445, 520, 610, 710, 830, 970, 1130, 1320, 1550, 1830, 2150, 2550, 3000];
const COLS = 44;
const SPREAD = 1.15; // lateral half-width per metre of distance
const NEAR = 8;

export function makeCamera(state, view) {
  const p = state.plane;
  const fov = (CONFIG.fovDeg * Math.PI) / 180;
  const focal = (CONFIG.height / 2) / Math.tan(fov / 2);
  let camPos;
  let pitch;
  let roll;
  let h = p.heading;
  if (view === 'cockpit') {
    const fx = Math.cos(p.pitch) * Math.cos(p.heading);
    const fy = Math.sin(p.pitch);
    const fz = Math.cos(p.pitch) * Math.sin(p.heading);
    camPos = { x: p.x + fx * 1.6, y: p.y + 0.9, z: p.z + fz * 1.6 };
    pitch = p.pitch;
    roll = p.roll;
  } else {
    // Chase: the camera trails the plane and looks at a point ahead of it, so
    // the aircraft always stays in frame even when the ground rises.
    const fx = Math.cos(p.heading);
    const fz = Math.sin(p.heading);
    camPos = {
      x: p.x - fx * CONFIG.chaseDistance,
      y: p.y + CONFIG.chaseHeight,
      z: p.z - fz * CONFIG.chaseDistance,
    };
    const groundAtCam = heightAt(camPos.x, camPos.z);
    // Keep the camera out of the hillside, but never let it rise so far above
    // the plane that the aircraft drops out of frame: at most 12 m above it.
    if (camPos.y < groundAtCam + 3) camPos.y = Math.min(groundAtCam + 3, p.y + 12);
    const lx = p.x + Math.cos(p.pitch) * Math.cos(p.heading) * 45;
    const ly = p.y + Math.sin(p.pitch) * 45 + 4;
    const lz = p.z + Math.cos(p.pitch) * Math.sin(p.heading) * 45;
    const dx = lx - camPos.x;
    const dy = ly - camPos.y;
    const dz = lz - camPos.z;
    const dl = Math.hypot(dx, dy, dz) || 1;
    const fwd = { x: dx / dl, y: dy / dl, z: dz / dl };
    pitch = Math.asin(clamp(fwd.y, -1, 1));
    h = Math.atan2(fwd.z, fwd.x);
    roll = p.roll * 0.55;
  }
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const f = { x: cp * Math.cos(h), y: sp, z: cp * Math.sin(h) };
  // Right and up, rolled with the aircraft.
  let r0 = { x: f.z, y: 0, z: -f.x }; // up x f, horizontal
  const rl = Math.hypot(r0.x, r0.z) || 1;
  r0 = { x: r0.x / rl, y: 0, z: r0.z / rl };
  let u0 = {
    x: f.y * r0.z - f.z * r0.y,
    y: f.z * r0.x - f.x * r0.z,
    z: f.x * r0.y - f.y * r0.x,
  };
  const ul = Math.hypot(u0.x, u0.y, u0.z) || 1;
  u0 = { x: u0.x / ul, y: u0.y / ul, z: u0.z / ul };
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const r = {
    x: r0.x * cr + u0.x * sr,
    y: r0.y * cr + u0.y * sr,
    z: r0.z * cr + u0.z * sr,
  };
  const u = {
    x: u0.x * cr - r0.x * sr,
    y: u0.y * cr - r0.y * sr,
    z: u0.z * cr - r0.z * sr,
  };
  return { pos: camPos, f, r, u, focal, heading: h, pitch, roll };
}

export function project(cam, px, py, pz) {
  const dx = px - cam.pos.x;
  const dy = py - cam.pos.y;
  const dz = pz - cam.pos.z;
  const cx = dx * cam.r.x + dy * cam.r.y + dz * cam.r.z;
  const cy = dx * cam.u.x + dy * cam.u.y + dz * cam.u.z;
  const cz = dx * cam.f.x + dy * cam.f.y + dz * cam.f.z;
  if (cz < NEAR) return null;
  const s = cam.focal / cz;
  return { x: CONFIG.width / 2 + cx * s, y: CONFIG.height / 2 - cy * s, s, cz };
}

function horizonYAt(cam, screenX) {
  // Project a far point at camera height, straight ahead at this screen x.
  const t = (screenX - CONFIG.width / 2) / cam.focal;
  const dir = {
    x: cam.f.x + cam.r.x * t,
    y: cam.f.y + cam.r.y * t,
    z: cam.f.z + cam.r.z * t,
  };
  const p = project(cam, cam.pos.x + dir.x * 4000, cam.pos.y, cam.pos.z + dir.z * 4000);
  return p ? p.y : CONFIG.height / 2;
}

export function drawSky(ctx, cam, time) {
  const g = ctx.createLinearGradient(0, 0, 0, CONFIG.height);
  g.addColorStop(0, PALETTE.skyTop);
  g.addColorStop(0.45, PALETTE.skyMid);
  g.addColorStop(0.62, PALETTE.skyHorizon);
  g.addColorStop(1, '#9fc8dd');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);
  // Sun: fixed in the north-west sky.
  const sunDir = { x: -0.55, y: 0.42, z: -0.72 };
  const sp = project(cam, cam.pos.x + sunDir.x * 5000, cam.pos.y + sunDir.y * 5000, cam.pos.z + sunDir.z * 5000);
  if (sp) {
    const glow = ctx.createRadialGradient(sp.x, sp.y, 4, sp.x, sp.y, 130);
    glow.addColorStop(0, 'rgba(255,246,200,0.95)');
    glow.addColorStop(0.25, 'rgba(255,232,150,0.55)');
    glow.addColorStop(1, 'rgba(255,232,150,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sp.x - 140, sp.y - 140, 280, 280);
    ctx.fillStyle = '#fff7cf';
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 26, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawOcean(ctx, cam) {
  const y0 = horizonYAt(cam, 0);
  const y1 = horizonYAt(cam, CONFIG.width);
  if (y0 < -40 && y1 < -40) return; // looking at sky only
  const top = Math.min(y0, y1);
  const bot = Math.max(y0, y1);
  const g = ctx.createLinearGradient(0, top, 0, CONFIG.height);
  g.addColorStop(0, PALETTE.seaDeep);
  g.addColorStop(0.5, PALETTE.seaNear);
  g.addColorStop(1, '#2a93b8');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, y0);
  ctx.lineTo(CONFIG.width, y1);
  ctx.lineTo(CONFIG.width, CONFIG.height);
  ctx.lineTo(0, CONFIG.height);
  ctx.closePath();
  ctx.fill();
  // A pale haze band right at the horizon so sea meets sky softly.
  ctx.fillStyle = 'rgba(207,234,247,0.35)';
  ctx.beginPath();
  ctx.moveTo(0, y0);
  ctx.lineTo(CONFIG.width, y1);
  ctx.lineTo(CONFIG.width, Math.min(CONFIG.height, bot + 14));
  ctx.lineTo(0, Math.min(CONFIG.height, bot + 14));
  ctx.closePath();
  ctx.fill();
}

function terrainGrid(cam) {
  // Sample the heightfield on a camera-facing grid, far rows first.
  const rows = [];
  const fh = { x: Math.cos(cam.heading), z: Math.sin(cam.heading) };
  const rh = { x: fh.z, z: -fh.x };
  for (const d of ROW_DIST) {
    const half = d * SPREAD;
    const pts = [];
    for (let j = 0; j <= COLS; j += 1) {
      const lat = -half + (2 * half * j) / COLS;
      const x = cam.pos.x + fh.x * d + rh.x * lat;
      const z = cam.pos.z + fh.z * d + rh.z * lat;
      const y = heightAt(x, z);
      pts.push({ x, y, z });
    }
    rows.push(pts);
  }
  return rows;
}

export function drawTerrain(ctx, cam) {
  const rows = terrainGrid(cam);
  const proj = rows.map((row) => row.map((pt) => project(cam, pt.x, pt.y, pt.z)));
  for (let i = rows.length - 2; i >= 0; i -= 1) {
    for (let j = 0; j < COLS; j += 1) {
      const a = proj[i][j];
      const b = proj[i][j + 1];
      const c = proj[i + 1][j + 1];
      const d = proj[i + 1][j];
      if (!a || !b || !c || !d) continue;
      const cx = (rows[i][j].x + rows[i + 1][j + 1].x) / 2;
      const cz = (rows[i][j].z + rows[i + 1][j + 1].z) / 2;
      const h = (rows[i][j].y + rows[i][j + 1].y + rows[i + 1][j].y + rows[i + 1][j + 1].y) / 4;
      if (h < 0.6) continue; // open water: the ocean fill already covers it
      ctx.fillStyle = terrainColor(cx, cz, h);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

export function drawSparkles(ctx, cam, sparkles) {
  ctx.strokeStyle = PALETTE.seaSparkle;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  let drawn = 0;
  for (const s of sparkles) {
    if (drawn > 90) break;
    const p = project(cam, s.x, 0.4, s.z);
    if (!p || p.x < -20 || p.x > CONFIG.width + 20 || p.y < 0 || p.y > CONFIG.height) continue;
    const len = s.len * p.s * 0.5;
    if (len < 1) continue;
    const dx = Math.cos(s.a) * len;
    const dy = Math.sin(s.a) * len * 0.4;
    ctx.moveTo(p.x - dx, p.y - dy);
    ctx.lineTo(p.x + dx, p.y + dy);
    drawn += 1;
  }
  ctx.stroke();
}

export function drawRunway(ctx, cam) {
  const hw = RUNWAY.width / 2;
  const hl = RUNWAY.length / 2;
  const corners = [
    [RUNWAY.cx - hl, RUNWAY.cz - hw],
    [RUNWAY.cx + hl, RUNWAY.cz - hw],
    [RUNWAY.cx + hl, RUNWAY.cz + hw],
    [RUNWAY.cx - hl, RUNWAY.cz + hw],
  ].map(([x, z]) => project(cam, x, RUNWAY.elevation + 0.4, z));
  if (corners.some((c) => !c)) return;
  ctx.fillStyle = PALETTE.runway;
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 4; i += 1) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.fill();
  // Centreline dashes.
  ctx.fillStyle = PALETTE.runwayLine;
  for (let i = 0; i < 9; i += 1) {
    const x0 = RUNWAY.cx - hl + 40 + i * 58;
    const p0 = project(cam, x0, RUNWAY.elevation + 0.5, RUNWAY.cz - 2.5);
    const p1 = project(cam, x0 + 30, RUNWAY.elevation + 0.5, RUNWAY.cz - 2.5);
    const p2 = project(cam, x0 + 30, RUNWAY.elevation + 0.5, RUNWAY.cz + 2.5);
    const p3 = project(cam, x0, RUNWAY.elevation + 0.5, RUNWAY.cz + 2.5);
    if (!p0 || !p1 || !p2 || !p3) continue;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.closePath();
    ctx.fill();
  }
  // Threshold bars and the runway number (capped: never paint it huge when
  // the camera is right over the threshold).
  for (const [tx, label] of [[RUNWAY.cx - hl + 14, '27'], [RUNWAY.cx + hl - 14, '09']]) {
    const p = project(cam, tx, RUNWAY.elevation + 0.5, RUNWAY.cz);
    if (p && p.s > 0.35 && p.s < 3) {
      ctx.fillStyle = PALETTE.runwayLine;
      ctx.font = `bold ${Math.max(10, Math.min(44, Math.round(p.s * 26)))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, p.x, p.y);
    }
  }
  // Edge lights.
  ctx.fillStyle = '#fff8d0';
  for (let i = 0; i <= 10; i += 1) {
    for (const side of [-1, 1]) {
      const p = project(cam, RUNWAY.cx - hl + i * (RUNWAY.length / 10), RUNWAY.elevation + 1, RUNWAY.cz + side * (hw + 3));
      if (p && p.x > -5 && p.x < CONFIG.width + 5 && p.y > -5 && p.y < CONFIG.height + 5) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1.5, Math.min(6, p.s * 2.2)), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // Windsock beside the threshold (skipped when the camera is right on it).
  const base = project(cam, RUNWAY.cx - hl - 26, RUNWAY.elevation, RUNWAY.cz - hw - 18);
  const top = project(cam, RUNWAY.cx - hl - 26, RUNWAY.elevation + 11, RUNWAY.cz - hw - 18);
  if (base && top && base.s < 2.2) {
    ctx.strokeStyle = '#e8e8e8';
    ctx.lineWidth = Math.max(1, base.s * 2);
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();
    const sock = project(cam, RUNWAY.cx - hl - 14, RUNWAY.elevation + 10, RUNWAY.cz - hw - 18);
    if (sock) {
      ctx.fillStyle = '#ff7a1a';
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(sock.x, sock.y - 3 * top.s * 0.4);
      ctx.lineTo(sock.x, sock.y + 3 * top.s * 0.4);
      ctx.closePath();
      ctx.fill();
    }
  }
  // A small hangar and control hut near the apron.
  drawBox(ctx, cam, RUNWAY.cx + 180, RUNWAY.elevation, RUNWAY.cz + hw + 42, 46, 16, 30, '#b8452f', '#8f3524');
  drawBox(ctx, cam, RUNWAY.cx + 240, RUNWAY.elevation, RUNWAY.cz + hw + 40, 18, 10, 14, '#e8e0c8', '#c9bfa4');
}

function drawBox(ctx, cam, x, y, z, w, h, d, topColor, sideColor) {
  const hw = w / 2;
  const hd = d / 2;
  const pts = [
    project(cam, x - hw, y + h, z - hd), project(cam, x + hw, y + h, z - hd),
    project(cam, x + hw, y + h, z + hd), project(cam, x - hw, y + h, z + hd),
    project(cam, x - hw, y, z - hd), project(cam, x + hw, y, z - hd),
    project(cam, x + hw, y, z + hd), project(cam, x - hw, y, z + hd),
  ];
  if (pts.some((p) => !p)) return;
  // Roof, then the two faces toward the camera.
  ctx.fillStyle = topColor;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  ctx.lineTo(pts[1].x, pts[1].y);
  ctx.lineTo(pts[2].x, pts[2].y);
  ctx.lineTo(pts[3].x, pts[3].y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = sideColor;
  ctx.beginPath();
  ctx.moveTo(pts[4].x, pts[4].y);
  ctx.lineTo(pts[5].x, pts[5].y);
  ctx.lineTo(pts[1].x, pts[1].y);
  ctx.lineTo(pts[0].x, pts[0].y);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(pts[5].x, pts[5].y);
  ctx.lineTo(pts[6].x, pts[6].y);
  ctx.lineTo(pts[2].x, pts[2].y);
  ctx.lineTo(pts[1].x, pts[1].y);
  ctx.closePath();
  ctx.fill();
}

export function drawRings(ctx, cam, rings, time) {
  for (const ring of rings) {
    if (ring.passed) continue;
    const c = project(cam, ring.x, ring.y, ring.z);
    if (!c || c.cz > 3200) continue;
    const isNext = !rings.some((r) => !r.passed && r.index < ring.index);
    const n = ring.normal;
    // Ring basis: u and v perpendicular to the normal.
    let u = { x: -n.z, y: 0, z: n.x };
    const ul = Math.hypot(u.x, u.z) || 1;
    u = { x: u.x / ul, y: 0, z: u.z / ul };
    const v = {
      x: n.y * u.z - n.z * u.y,
      y: n.z * u.x - n.x * u.z,
      z: n.x * u.y - n.y * u.x,
    };
    const R = 28;
    const pts = [];
    for (let i = 0; i <= 28; i += 1) {
      const a = (i / 28) * Math.PI * 2;
      const px = ring.x + (u.x * Math.cos(a) + v.x * Math.sin(a)) * R;
      const py = ring.y + (u.y * Math.cos(a) + v.y * Math.sin(a)) * R;
      const pz = ring.z + (u.z * Math.cos(a) + v.z * Math.sin(a)) * R;
      const p = project(cam, px, py, pz);
      pts.push(p);
    }
    if (pts.some((p) => !p)) continue;
    const pulse = isNext ? 0.75 + 0.25 * Math.sin(time * 5) : 0.4;
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = isNext ? PALETTE.gold : '#9fd8ff';
    ctx.lineWidth = Math.max(2, c.s * 4.5);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.globalAlpha = pulse * 0.5;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, c.s * 1.6);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Distance + ring number label for the next ring.
    if (isNext && c.cz > 40) {
      const dist = Math.round(c.cz);
      ctx.fillStyle = 'rgba(10,30,50,0.65)';
      const label = `RING ${ring.index + 1} · ${dist} m`;
      ctx.font = 'bold 15px sans-serif';
      const w = ctx.measureText(label).width + 18;
      ctx.fillRect(c.x - w / 2, c.y - c.s * 34 - 12, w, 24);
      ctx.fillStyle = '#ffe9a8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, c.x, c.y - c.s * 34);
    }
  }
}

export function drawClouds(ctx, cam, clouds) {
  const items = [];
  for (const cl of clouds) {
    const p = project(cam, cl.x, cl.y, cl.z);
    if (!p || p.cz < 60 || p.cz > 6000) continue;
    items.push({ cl, p });
  }
  items.sort((a, b) => b.p.cz - a.p.cz);
  for (const { cl, p } of items) {
    const s = cl.s * p.s * 0.9;
    if (s < 2) continue;
    const rnd = mulberry32(Math.floor(cl.seed));
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    for (let i = 0; i < cl.puffs; i += 1) {
      const ox = (rnd() - 0.5) * s * 1.6;
      const oy = (rnd() - 0.5) * s * 0.35;
      const r = s * (0.32 + rnd() * 0.25);
      ctx.beginPath();
      ctx.ellipse(p.x + ox, p.y + oy, r, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawPlaneShadow(ctx, cam, plane) {
  const g = heightAt(plane.x, plane.z);
  const p = project(cam, plane.x, g + 1, plane.z);
  if (!p) return;
  const alt = Math.max(0, plane.y - g);
  const alpha = clamp(0.3 - alt * 0.0009, 0.04, 0.3);
  // The shadow is the plane's own size on screen, shrinking with altitude —
  // never a giant ellipse from the ground point's perspective scale.
  const size = clamp(110 * (1 - alt / 500), 14, 110);
  ctx.fillStyle = `rgba(8,20,30,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, size, size * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
}

// The aircraft in chase view: drawn in screen space at its projected spot,
// banked with the plane. A small red-and-cream prop plane, "Elang Laut".
export function drawPlane(ctx, cam, plane, time) {
  const p = project(cam, plane.x, plane.y, plane.z);
  if (!p) return;
  const cx = p.x;
  const cy = p.y; // the look-at camera already puts the plane below centre
  const scale = 1.05;
  const relRoll = (plane.roll - cam.roll) * 0.9;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(relRoll);
  ctx.scale(scale, scale);
  const W = 150; // half wingspan in px
  // Wings (seen from behind and above).
  ctx.fillStyle = PALETTE.planeCream;
  ctx.strokeStyle = '#8a7a5a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-W, -8);
  ctx.lineTo(-34, -26);
  ctx.lineTo(34, -26);
  ctx.lineTo(W, -8);
  ctx.lineTo(W - 14, 6);
  ctx.lineTo(30, 2);
  ctx.lineTo(-30, 2);
  ctx.lineTo(-W + 14, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Red wingtips and a stripe.
  ctx.fillStyle = PALETTE.planeRed;
  ctx.beginPath();
  ctx.moveTo(-W, -8);
  ctx.lineTo(-W + 26, -13);
  ctx.lineTo(-W + 20, 2);
  ctx.lineTo(-W + 14, 6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(W, -8);
  ctx.lineTo(W - 26, -13);
  ctx.lineTo(W - 20, 2);
  ctx.lineTo(W - 14, 6);
  ctx.closePath();
  ctx.fill();
  // Fuselage: tail (near, bottom) to nose (far, top).
  const fg = ctx.createLinearGradient(0, 90, 0, -78);
  fg.addColorStop(0, '#a93226');
  fg.addColorStop(0.35, PALETTE.planeRed);
  fg.addColorStop(1, '#d95545');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(-16, 92);
  ctx.quadraticCurveTo(-22, 30, -15, -58);
  ctx.quadraticCurveTo(-12, -78, 0, -80);
  ctx.quadraticCurveTo(12, -78, 15, -58);
  ctx.quadraticCurveTo(22, 30, 16, 92);
  ctx.quadraticCurveTo(0, 100, -16, 92);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#7e2a20';
  ctx.stroke();
  // Canopy.
  ctx.fillStyle = '#bfe6f5';
  ctx.strokeStyle = '#5d7d90';
  ctx.beginPath();
  ctx.ellipse(0, -30, 11, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Tailplane and fin.
  ctx.fillStyle = PALETTE.planeCream;
  ctx.beginPath();
  ctx.moveTo(-52, 66);
  ctx.lineTo(-14, 74);
  ctx.lineTo(14, 74);
  ctx.lineTo(52, 66);
  ctx.lineTo(46, 80);
  ctx.lineTo(-46, 80);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = PALETTE.planeRed;
  ctx.beginPath();
  ctx.moveTo(-4, 92);
  ctx.lineTo(-8, 44);
  ctx.lineTo(0, 34);
  ctx.lineTo(8, 44);
  ctx.lineTo(4, 92);
  ctx.closePath();
  ctx.fill();
  // Propeller: spinning disc at the nose (far end).
  const propA = time * 22;
  ctx.save();
  ctx.translate(0, -82);
  ctx.fillStyle = 'rgba(40,40,40,0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 34, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(30,30,30,0.75)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-Math.cos(propA) * 30, -Math.sin(propA) * 8);
  ctx.lineTo(Math.cos(propA) * 30, Math.sin(propA) * 8);
  ctx.stroke();
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Navigation lights.
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath();
  ctx.arc(-W + 4, -2, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#34e07a';
  ctx.beginPath();
  ctx.arc(W - 4, -2, 4, 0, Math.PI * 2);
  ctx.fill();
  // Registration on the left wing.
  ctx.fillStyle = '#1f4e79';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PK-LNU', -92, -12);
  ctx.restore();
}

// In cockpit view: the nose cowling and the spinning prop at the bottom centre.
export function drawNose(ctx, plane, time) {
  const W = CONFIG.width;
  const H = CONFIG.height;
  const propA = time * 22;
  ctx.save();
  ctx.translate(W / 2, H + 40);
  ctx.fillStyle = 'rgba(40,40,40,0.22)';
  ctx.beginPath();
  ctx.ellipse(0, -60, 260, 120, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(25,25,25,0.6)';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(-Math.cos(propA) * 240, -60 - Math.sin(propA) * 110);
  ctx.lineTo(Math.cos(propA) * 240, -60 + Math.sin(propA) * 110);
  ctx.stroke();
  // Cowling.
  const cg = ctx.createLinearGradient(0, -190, 0, 0);
  cg.addColorStop(0, '#d95545');
  cg.addColorStop(1, '#8f2f23');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.moveTo(-150, 10);
  ctx.quadraticCurveTo(-170, -120, -90, -180);
  ctx.lineTo(90, -180);
  ctx.quadraticCurveTo(170, -120, 150, 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(0, -60, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export const WORLD_BUILDERS = { buildClouds, buildSparkles };
