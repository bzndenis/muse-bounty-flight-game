// Deterministic scene staging for the screenshots: each ?shot= scene puts the
// plane, the rings and the camera in a fixed pose and freezes the simulation,
// so the same URL always renders the same frame.
import { CONFIG, RUNWAY } from './config.js';
import { newGameState } from './physics.js';

function baseState(seed) {
  const state = newGameState(seed);
  state.screen = 'play';
  return state;
}

// Chase view, over the sea south of Karang Field, the first ring ahead and
// the island, runway and volcano beyond it. The cover.
export function stageCover(seed) {
  const state = baseState(seed);
  const p = state.plane;
  p.x = 850;
  p.z = 470;
  p.y = 235;
  p.heading = -1.78;
  p.pitch = 0.0;
  p.roll = 0.15;
  p.speed = 58;
  p.throttle = 0.78;
  p.fuel = 90;
  p.airborne = true;
  p.time = 55;
  p.score = 0;
  p.ringsPassed = 0;
  p.message = 'TERBANG KE RING 1';
  p.messageUntil = 999;
  return { state, view: 'chase', time: 3.2 };
}

// The plane is about to fly through ring 2, with Pulau Hijau ahead over the sea.
export function stageRings(seed) {
  const state = baseState(seed);
  const p = state.plane;
  p.x = 1200;
  p.z = -500;
  p.y = 210;
  p.heading = -0.785;
  p.pitch = 0.02;
  p.roll = -0.1;
  p.speed = 62;
  p.throttle = 0.82;
  p.fuel = 71;
  p.airborne = true;
  p.time = 148;
  p.score = 100;
  p.ringsPassed = 1;
  state.rings[0].passed = true;
  return { state, view: 'chase', time: 5.7 };
}

// Cockpit view on final approach: runway 27 ahead, instruments lit.
export function stageCockpit(seed) {
  const state = baseState(seed);
  const p = state.plane;
  p.x = -450;
  p.z = RUNWAY.cz;
  p.y = 45;
  p.heading = 0;
  p.pitch = -0.05;
  p.roll = 0;
  p.speed = 38;
  p.throttle = 0.42;
  p.fuel = 46;
  p.airborne = true;
  p.time = 372;
  p.score = 600;
  p.ringsPassed = 6;
  for (const r of state.rings) r.passed = true;
  p.message = 'SEMUA RING! Mendarat di Karang Field';
  p.messageUntil = 999;
  return { state, view: 'cockpit', time: 8.1 };
}

// Flaring over the threshold: chase view, low over the runway, gear down feel.
export function stageLand(seed) {
  const state = baseState(seed);
  const p = state.plane;
  p.x = -330;
  p.z = RUNWAY.cz;
  p.y = 14;
  p.heading = 0;
  p.pitch = 0.05;
  p.roll = 0.02;
  p.speed = 34;
  p.throttle = 0.3;
  p.fuel = 41;
  p.airborne = true;
  p.time = 389;
  p.score = 600;
  p.ringsPassed = 6;
  for (const r of state.rings) r.passed = true;
  p.message = 'LAND ON THE RUNWAY';
  p.messageUntil = 999;
  return { state, view: 'chase', time: 9.4 };
}

export const SHOTS = { cover: stageCover, rings: stageRings, cockpit: stageCockpit, land: stageLand };
