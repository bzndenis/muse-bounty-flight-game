// The flight model: arcade handling with stall, banked turns, fuel, rings,
// landing and crash detection. All distances in metres, speeds in m/s.
import { CONFIG, RUNWAY } from './config.js';
import { clamp, wrapAngle, angleDiff } from './random.js';
import { heightAt, inRunwayRect, buildRings } from './world.js';

export function newPlane() {
  return {
    // Parked at the west threshold, facing east down the runway.
    x: -RUNWAY.length / 2 + 20,
    z: RUNWAY.cz,
    y: RUNWAY.elevation + 2,
    heading: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    fuel: CONFIG.fuelCapacity,
    airborne: false,
    landed: false,
    crashed: false,
    crashReason: '',
    ringsPassed: 0,
    score: 0,
    time: 0,
    verticalSpeed: 0,
    prevRingSide: null,
    message: '',
    messageUntil: 0,
    autopilot: false,
    onFinal: false,
    landedAt: null,
  };
}

export function newGameState(seed) {
  return {
    screen: 'title', // title | play | pause | crashed | landed
    plane: newPlane(),
    rings: buildRings(),
    seed,
    startedAt: 0,
    bestScore: 0,
  };
}

function setMessage(plane, text, seconds = 2.5) {
  plane.message = text;
  plane.messageUntil = plane.time + seconds;
}

// Steer the plane toward a target point (used by the co-pilot autopilot).
// floorMargin is how far above the terrain ahead the plane must stay; the
// final approach passes useFloor=false because the approach corridor is flat
// by construction and the plane must be allowed to descend to the runway.
// targetVs, when given, holds a fixed vertical speed instead of pitching at
// the target point (used for the landing flare).
function autopilotSteer(plane, target, dt, floorMargin = 30, useFloor = true, targetVs = null) {
  const dx = target.x - plane.x;
  const dy = target.y - plane.y;
  const dz = target.z - plane.z;
  const wantHeading = Math.atan2(dz, dx);
  const dh = wrapAngle(wantHeading - plane.heading);
  const wantRoll = clamp(dh * 1.4, -CONFIG.maxRoll, CONFIG.maxRoll);
  plane.roll += (wantRoll - plane.roll) * Math.min(1, dt * 2.2);
  const dist = Math.hypot(dx, dy, dz);
  let wantPitch;
  if (targetVs !== null) {
    wantPitch = Math.asin(clamp(targetVs / Math.max(plane.speed, 1), -0.4, 0.4));
  } else {
    wantPitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)) * 1.1, -0.35, 0.35);
  }
  // Terrain floor: never descend into the hillside ahead of the plane.
  if (useFloor) {
    const aheadX = plane.x + Math.cos(plane.heading) * 100;
    const aheadZ = plane.z + Math.sin(plane.heading) * 100;
    const floor = heightAt(aheadX, aheadZ) + floorMargin;
    if (plane.y < floor) wantPitch = Math.max(wantPitch, 0.18);
  }
  plane.pitch += (wantPitch - plane.pitch) * Math.min(1, dt * 2.0);
  // On final approach, slow down; otherwise hold cruise.
  const final = target.final === true;
  const wantSpeed = final ? 34 : CONFIG.cruiseSpeed;
  plane.throttle = clamp(plane.throttle + (wantSpeed - plane.speed) * 0.012, 0, 1);
  return dist;
}

export function stepPlane(state, input, dt) {
  const p = state.plane;
  if (state.screen !== 'play' || p.crashed || p.landed) return;
  p.time += dt;

  // --- Controls -------------------------------------------------------------
  if (p.autopilot) {
    const next = state.rings.find((r) => !r.passed);
    if (next) {
      // Line up with the course before threading the ring: from far out, aim
      // for a point beyond the ring along its normal, so the plane arrives
      // face-on instead of chasing the ring in circles; up close, aim at it.
      const d = Math.hypot(next.x - p.x, next.y - p.y, next.z - p.z);
      if (d > 400) {
        autopilotSteer(p, {
          x: next.x + next.normal.x * 250,
          y: next.y + next.normal.y * 250,
          z: next.z + next.normal.z * 250,
        }, dt);
      } else {
        autopilotSteer(p, next, dt);
      }
    } else {
      // Final approach, as a little circuit: get west of the threshold and
      // lined up with the centreline, then fly down it to the far end, low
      // and slow, and touch down on the runway. Once lined up, the final is
      // latched: flying east past the threshold must not send the plane back
      // to the fix. A missed approach (past the far end, still airborne)
      // unlatches it for another circuit.
      const linedUp = p.x < -450
        && Math.abs(p.z - RUNWAY.cz) < 120
        && Math.abs(wrapAngle(p.heading)) < 0.5;
      if (linedUp) p.onFinal = true;
      if (p.onFinal && p.x > RUNWAY.cx + 650) p.onFinal = false;
      if (p.onFinal) {
        // Two-phase final: descend to the threshold at ~20 m, then flare down
        // the runway at a steady 2.5 m/s until the wheels touch.
        if (p.x < -RUNWAY.length / 2) {
          autopilotSteer(p, { x: -RUNWAY.length / 2, y: 20, z: RUNWAY.cz, final: true }, dt, 4, false);
        } else {
          autopilotSteer(p, { x: RUNWAY.cx + 600, y: RUNWAY.elevation + 3, z: RUNWAY.cz, final: true }, dt, 4, false, -2.5);
        }
      } else {
        autopilotSteer(p, { x: -800, y: 140, z: RUNWAY.cz }, dt);
      }
    }
  } else {
    if (input.throttleUp) p.throttle = clamp(p.throttle + dt * 0.7, 0, 1);
    if (input.throttleDown) p.throttle = clamp(p.throttle - dt * 0.7, 0, 1);
    const pitchIn = (input.pitchUp ? 1 : 0) - (input.pitchDown ? 1 : 0);
    const rollIn = (input.rollRight ? 1 : 0) - (input.rollLeft ? 1 : 0);
    const authority = clamp(p.speed / CONFIG.stallSpeed, 0.25, 1);
    const targetPitch = pitchIn * CONFIG.maxPitch * authority;
    const targetRoll = rollIn * CONFIG.maxRoll * authority;
    p.pitch += (targetPitch - p.pitch) * Math.min(1, dt * 5);
    p.roll += (targetRoll - p.roll) * Math.min(1, dt * 4);
    if (rollIn === 0) p.roll *= Math.max(0, 1 - dt * 0.9); // gentle auto-level
    if (pitchIn === 0) p.pitch *= Math.max(0, 1 - dt * 0.6);
    if (input.mouseSteer) {
      // Drag steering: pointer offset from centre banks and pitches the plane.
      p.roll = clamp(p.roll + input.mouseRoll * dt * 2.4, -CONFIG.maxRoll, CONFIG.maxRoll);
      p.pitch = clamp(p.pitch + input.mousePitch * dt * 1.4, -CONFIG.maxPitch, CONFIG.maxPitch);
    }
  }

  // --- Speed, lift and stall -----------------------------------------------
  const engineOn = p.fuel > 0;
  const targetSpeed = engineOn ? p.throttle * CONFIG.maxSpeed : 0;
  const drag = 0.25 + Math.abs(p.pitch) * 0.9 + Math.abs(p.roll) * 0.35;
  p.speed += (targetSpeed - p.speed) * Math.min(1, dt * (0.35 + drag * 0.25));
  p.speed -= Math.sin(p.pitch) * CONFIG.gravity * CONFIG.climbFactor * dt * 0.55;
  p.speed = clamp(p.speed, 0, CONFIG.maxSpeed * 1.15);
  const stalled = p.airborne && p.speed < CONFIG.stallSpeed;
  if (stalled) {
    p.pitch -= dt * 0.5; // the nose drops
    if (p.time > (p.stallWarnUntil || 0)) {
      setMessage(p, 'STALL! Turunkan hidung, tambah throttle', 1.2);
      p.stallWarnUntil = p.time + 1.2;
    }
  }

  // --- Turn: banked flight changes heading. Positive roll is a right bank,
  // and a right bank turns the nose right (compass bearing increases).
  p.heading = wrapAngle(p.heading + p.roll * CONFIG.turnFactor * (p.speed / 50) * dt);

  // --- Position --------------------------------------------------------------
  const fx = Math.cos(p.pitch) * Math.cos(p.heading);
  const fy = Math.sin(p.pitch);
  const fz = Math.cos(p.pitch) * Math.sin(p.heading);
  const prevY = p.y;
  p.x += fx * p.speed * dt;
  p.z += fz * p.speed * dt;
  p.y += fy * p.speed * dt;
  p.verticalSpeed = (p.y - prevY) / dt;
  // Ground effect keeps the plane from sinking below the runway while rolling.
  const ground = heightAt(p.x, p.z);
  if (!p.airborne) {
    p.y = ground + 2;
    if (p.speed > 26 && p.pitch > 0.06) {
      p.airborne = true;
      setMessage(p, 'LEPAS LANDAS!', 2);
    }
  }

  // --- Fuel ------------------------------------------------------------------
  if (engineOn) {
    p.fuel = Math.max(0, p.fuel - CONFIG.fuelDrain * (0.35 + p.throttle) * dt);
    if (p.fuel <= 0) setMessage(p, 'BAHAN BAKAR HABIS — meluncur!', 3);
    if (p.fuel < 20 && p.fuel > 0 && p.time > (p.fuelWarnUntil || 0)) {
      setMessage(p, 'BAHAN BAKAR RENDAH — mendarat untuk isi ulang', 2);
      p.fuelWarnUntil = p.time + 4;
    }
  }

  // --- Rings ------------------------------------------------------------------
  const next = state.rings.find((r) => !r.passed);
  if (next && p.airborne) {
    const dx = p.x - next.x;
    const dy = p.y - next.y;
    const dz = p.z - next.z;
    const dist = Math.hypot(dx, dy, dz);
    const side = dx * next.normal.x + dy * next.normal.y + dz * next.normal.z;
    // A pass is either crossing the ring's plane inside its radius, or flying
    // right through its middle from any direction.
    const crossed = p.prevRingSide !== null && p.prevRingSide < 0 && side >= 0 && dist < CONFIG.ringRadius;
    const through = dist < CONFIG.ringRadius * 0.75;
    if (crossed || through) {
      next.passed = true;
      p.ringsPassed += 1;
      p.score += CONFIG.ringScore;
      setMessage(p, `RING ${p.ringsPassed}/6! +${CONFIG.ringScore}`, 2);
      state.ringChime = true;
      if (p.ringsPassed === state.rings.length) {
        setMessage(p, 'SEMUA RING! Mendarat di Karang Field', 4);
      }
    }
    p.prevRingSide = side;
  } else if (next) {
    p.prevRingSide = null;
  }

  // --- Terrain / water / landing ---------------------------------------------
  const clearance = p.y - ground;
  if (p.airborne) {
    if (clearance <= 1.6) {
      const onRunway = inRunwayRect(p.x, p.z, 6);
      const aligned = Math.abs(angleDiff(p.heading, 0)) < 0.35 || Math.abs(angleDiff(p.heading, Math.PI)) < 0.35;
      const gentle = p.verticalSpeed > -6 && Math.abs(p.roll) < 0.35;
      if (onRunway && p.speed < 62 && gentle && aligned) {
        landPlane(state);
      } else if (ground > 0.6) {
        crashPlane(state, 'Menabrak daratan');
      } else {
        crashPlane(state, 'Mendarat darurat di laut');
      }
    }
  } else if (p.speed > 0.5) {
    // Rolling on the ground: keep on the runway shelf, slow down if off it.
    if (!inRunwayRect(p.x, p.z, 40)) {
      p.speed = Math.max(0, p.speed - dt * 22);
      if (p.speed < 1 && Math.abs(p.x) > 400) crashPlane(state, 'Tergelincir keluar runway');
    }
    if (p.speed < 0.5) p.speed = 0;
  }
}

function landPlane(state) {
  const p = state.plane;
  p.landed = true;
  p.landedAt = p.time;
  p.airborne = false;
  p.y = heightAt(p.x, p.z) + 2;
  const timeBonus = Math.max(0, Math.round((CONFIG.parTime - p.time) * CONFIG.timeBonusRate));
  const allRings = p.ringsPassed === state.rings.length;
  const bonus = CONFIG.landingScore + timeBonus + (allRings ? 200 : 0);
  p.score += bonus;
  p.landingBonus = bonus;
  p.timeBonus = timeBonus;
  p.fuel = CONFIG.fuelCapacity; // refuelled on the ground
  state.screen = 'landed';
  state.landedFanfare = true;
}

function crashPlane(state, reason) {
  const p = state.plane;
  p.crashed = true;
  p.crashReason = reason;
  state.screen = 'crashed';
  state.crashSound = true;
}

export function resetGame(state) {
  state.plane = newPlane();
  state.rings = buildRings();
  state.screen = 'play';
  state.ringChime = false;
  state.crashSound = false;
  state.landedFanfare = false;
}
