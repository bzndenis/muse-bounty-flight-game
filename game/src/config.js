// Langit Nusantara — tuning, palette, and the archipelago the game flies over.
// All art, names and places are original: a fictional Indonesian island chain.
export const CONFIG = {
  width: 1280,
  height: 720,
  // Flight model (metres, seconds).
  maxSpeed: 88,        // m/s at full throttle, level flight
  cruiseSpeed: 55,
  stallSpeed: 24,
  minSpeed: 12,
  accel: 14,           // m/s^2 toward throttle target
  climbFactor: 0.9,    // how much pitch trades speed for climb
  pitchRate: 0.9,      // rad/s at full stick
  rollRate: 1.9,       // rad/s at full stick
  maxPitch: 0.55,      // rad
  maxRoll: 1.1,        // rad
  turnFactor: 0.55,    // heading change per rad of bank
  gravity: 9.8,
  fuelDrain: 0.16,     // %/s at full throttle
  fuelCapacity: 100,
  // Mission.
  ringRadius: 28,
  ringScore: 100,
  landingScore: 500,
  timeBonusRate: 2,    // points per second under the 600 s par
  parTime: 600,
  // Camera.
  chaseDistance: 26,
  chaseHeight: 7,
  fovDeg: 70,
};

// The archipelago: Gaussian island bumps over a flat sea (height in metres).
// Each island: centre, radius, peak height, and a hue family for its slopes.
export const ISLANDS = [
  { name: 'Pulau Karang', x: 0, z: 0, r: 950, peak: 130, kind: 'home' },
  { name: 'Pulau Api', x: -1450, z: -950, r: 720, peak: 330, kind: 'volcano' },
  { name: 'Pulau Hijau', x: 1350, z: -1150, r: 620, peak: 95, kind: 'green' },
  { name: 'Pulau Pasir', x: 950, z: 1250, r: 300, peak: 42, kind: 'sand' },
  { name: 'Pulau Ombak', x: -950, z: 1350, r: 260, peak: 34, kind: 'green' },
  { name: 'Pulau Batu', x: 1850, z: 650, r: 290, peak: 48, kind: 'rock' },
  { name: 'Pulau Kabut', x: -1750, z: 550, r: 330, peak: 62, kind: 'green' },
];

// The runway sits on Pulau Karang: a flat strip, heading east-west, 600 x 42 m.
// Landing direction is east (+x); the threshold is at the west end.
export const RUNWAY = {
  name: 'Karang Field',
  cx: 0, cz: 200,          // centre
  length: 600, width: 42,
  heading: 0,              // radians, 0 = east (+x)
  elevation: 2,            // metres; the terrain is flattened to this here
};

// The ring course: six golden rings around the islands, then land on the runway.
export const RINGS = [
  { x: 700, y: 150, z: 150 },
  { x: 1500, y: 220, z: -800 },
  { x: 700, y: 280, z: -1500 },
  { x: -800, y: 280, z: -1400 },
  { x: -1700, y: 220, z: -500 },
  { x: -1200, y: 160, z: 600 },
];

export const PALETTE = {
  skyTop: '#2b6cc4',
  skyMid: '#7fb8e8',
  skyHorizon: '#cfeaf7',
  seaDeep: '#0d4d8a',
  seaNear: '#1e7fa8',
  seaSparkle: 'rgba(255,255,255,0.75)',
  sand: '#e9d49b',
  sandWet: '#d9c184',
  grass: '#5da244',
  grassLight: '#79bd58',
  forest: '#2f7a33',
  rock: '#8a7d6d',
  rockDark: '#6b5f52',
  volcano: '#4a3f38',
  volcanoHot: '#7a3b28',
  snow: '#f2f5f7',
  runway: '#3a3f46',
  runwayLine: '#f5f2e8',
  planeRed: '#c0392b',
  planeCream: '#f7f1de',
  planeBlue: '#1f4e79',
  gold: '#f2b705',
  hud: '#eaf6ff',
};
