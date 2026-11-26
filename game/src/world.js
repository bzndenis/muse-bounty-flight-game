// The world: an analytic heightfield of Gaussian islands over a flat sea,
// the flattened runway strip, the ring course, and the clouds and sea sparkles.
import { ISLANDS, RUNWAY, RINGS, PALETTE } from './config.js';
import { mulberry32, clamp } from './random.js';

// Small deterministic bumps so hillsides are not perfectly smooth.
function bump(x, z) {
  const s1 = Math.sin(x * 0.021 + z * 0.017) * Math.cos(z * 0.023 - x * 0.011);
  const s2 = Math.sin(x * 0.043 - z * 0.031) * 0.5;
  const s3 = Math.sin(x * 0.11 + z * 0.09) * Math.cos(x * 0.07 - z * 0.13) * 0.35;
  return (s1 + s2 + s3) * 6;
}

export function islandHeight(x, z) {
  let h = 0;
  for (const isl of ISLANDS) {
    const dx = x - isl.x;
    const dz = z - isl.z;
    const d2 = (dx * dx + dz * dz) / (isl.r * isl.r);
    if (d2 > 4) continue;
    // A plateau shoulder near the shore, then a smooth dome.
    let g = Math.exp(-d2 * 1.9);
    if (isl.kind === 'volcano') {
      // A crater: push the very top down into a bowl.
      const crater = Math.exp(-d2 * 14);
      g = g * (1 - crater * 0.85);
    }
    h += isl.peak * g;
  }
  return h;
}

export function inRunwayRect(x, z, margin = 0) {
  const dx = Math.abs(x - RUNWAY.cx);
  const dz = Math.abs(z - RUNWAY.cz);
  return dx <= RUNWAY.length / 2 + margin && dz <= RUNWAY.width / 2 + margin;
}

export function heightAt(x, z) {
  let h = islandHeight(x, z);
  if (h > 0.4) h += bump(x, z) * Math.min(1, h / 25);
  if (inRunwayRect(x, z, 26)) {
    // Flatten a shelf for the airfield: exactly flat inside the strip,
    // blending to the surroundings over the 26 m margin.
    const dx = Math.max(0, (Math.abs(x - RUNWAY.cx) - RUNWAY.length / 2) / 26);
    const dz = Math.max(0, (Math.abs(z - RUNWAY.cz) - RUNWAY.width / 2) / 26);
    const edge = clamp(Math.max(dx, dz), 0, 1);
    const t = edge * edge * (3 - 2 * edge); // smoothstep out of the flat shelf
    h = RUNWAY.elevation + (h - RUNWAY.elevation) * t;
  }
  // A wide, gentle airfield plateau around the runway so the approach is
  // flat: the runway must not sit in a pit on the island's flank. The ellipse
  // stretches west, so the final approach comes in over flat ground.
  const px = (x - (RUNWAY.cx - 150)) / 750;
  const pz = (z - RUNWAY.cz) / 300;
  const pd = px * px + pz * pz;
  if (pd < 1) {
    const t = pd * pd * (3 - 2 * pd); // smoothstep: 0 at centre, 1 at rim
    const shelf = RUNWAY.elevation;
    h = shelf + (h - shelf) * t;
  }
  return Math.max(h, -1);
}

// Terrain colour for a sample point: smooth height bands, shaded by slope,
// with a deterministic per-cell variation so the hillsides are not flat.
function hash01(x, z) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

const BANDS = [
  [0.6, PALETTE.sand],
  [3.2, PALETTE.sandWet],
  [14, PALETTE.grassLight],
  [34, PALETTE.grass],
  [110, PALETTE.forest],
  [200, PALETTE.rock],
  [285, PALETTE.rockDark],
  [305, PALETTE.volcano],
  [340, PALETTE.snow],
];

function mixHex(a, b, t) {
  const ar = hexToRgb(a);
  const br = hexToRgb(b);
  return [
    Math.round(ar[0] + (br[0] - ar[0]) * t),
    Math.round(ar[1] + (br[1] - ar[1]) * t),
    Math.round(ar[2] + (br[2] - ar[2]) * t),
  ];
}

export function terrainColor(x, z, h) {
  if (h < 0.6) return PALETTE.seaNear;
  const slope = Math.abs(heightAt(x + 14, z) - h) + Math.abs(heightAt(x, z + 14) - h);
  const shade = clamp(1 - slope * 0.04, 0.6, 1.08);
  // Find the band this height sits in and blend to the next one.
  let base = hexToRgb(BANDS[BANDS.length - 1][1]);
  for (let i = 0; i < BANDS.length - 1; i += 1) {
    if (h < BANDS[i + 1][0]) {
      const [h0, c0] = BANDS[i];
      const [h1, c1] = BANDS[i + 1];
      const t = clamp((h - h0) / (h1 - h0), 0, 1);
      base = mixHex(c0, c1, t * t * (3 - 2 * t));
      break;
    }
  }
  // Volcano crater rim glows warm near the top of Pulau Api.
  const dx = x - ISLANDS[1].x;
  const dz = z - ISLANDS[1].z;
  const dv = Math.hypot(dx, dz);
  if (dv < 260 && h > 240) base = hexToRgb(PALETTE.volcanoHot);
  const jitter = 0.94 + hash01(Math.floor(x / 18), Math.floor(z / 18)) * 0.12;
  return shadeColor(base, shade * jitter);
}

export function shadeColor(rgb, f) {
  const r = clamp(Math.round(rgb[0] * f), 0, 255);
  const g = clamp(Math.round(rgb[1] * f), 0, 255);
  const b = clamp(Math.round(rgb[2] * f), 0, 255);
  return `rgb(${r},${g},${b})`;
}

function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

// The rings, each with a facing direction (the course direction through it).
export function buildRings() {
  return RINGS.map((r, i) => {
    const from = i === 0 ? { x: -200, y: 60, z: RUNWAY.cz } : RINGS[i - 1];
    const to = i === RINGS.length - 1
      ? { x: -300, y: 40, z: RUNWAY.cz }
      : RINGS[i + 1];
    const nx = to.x - from.x;
    const ny = to.y - from.y;
    const nz = to.z - from.z;
    const len = Math.hypot(nx, ny, nz) || 1;
    return {
      ...r,
      index: i,
      normal: { x: nx / len, y: ny / len, z: nz / len },
      passed: false,
    };
  });
}

// Clouds: fixed world positions, seeded so every run looks the same.
export function buildClouds(seed = 7) {
  const rnd = mulberry32(seed);
  const clouds = [];
  for (let i = 0; i < 42; i += 1) {
    const a = rnd() * Math.PI * 2;
    const d = 600 + rnd() * 2600;
    clouds.push({
      x: Math.cos(a) * d,
      z: Math.sin(a) * d,
      y: 380 + rnd() * 260,
      s: 60 + rnd() * 130,
      puffs: 3 + Math.floor(rnd() * 3),
      seed: rnd() * 100,
    });
  }
  return clouds;
}

// Sea sparkles: fixed glints on the water, drawn as short white dashes.
export function buildSparkles(seed = 11) {
  const rnd = mulberry32(seed);
  const pts = [];
  for (let i = 0; i < 160; i += 1) {
    const x = (rnd() - 0.5) * 5200;
    const z = (rnd() - 0.5) * 5200;
    if (islandHeight(x, z) > 2) continue; // only on open water
    pts.push({ x, z, len: 6 + rnd() * 16, a: rnd() * Math.PI });
  }
  return pts;
}
