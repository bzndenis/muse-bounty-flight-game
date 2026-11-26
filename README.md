# Langit Nusantara — make.fun best flight game

An original 3D-style flight game for the [make.fun "Make the best flight
game"](https://make.fun/bounty/best-flight-game-20261126-0057) bounty (free
entry, $500 prize pool, 50 places paid, deadline 28 Nov 2026 07:57 WIB).

You fly "Elang Laut", a small red-and-cream prop plane, around a fictional
Indonesian archipelago — Pulau Karang, the volcano Pulau Api, Pulau Hijau and
four smaller islets. Take off from Karang Field, fly through 6 golden rings,
then land back on the runway. Fuel drains with throttle and is refilled by
landing; stall, crash and go-around are all modelled.

- **Play:** serve `game/` with any static server (`python3 -m http.server
  --directory game`) and open it in desktop Chrome. No network requests, no
  build step. Keyboard + mouse (drag to steer).
- **Controls:** ↑↓ pitch, ←→ bank and turn, W/S throttle, C cockpit/chase
  camera, A co-pilot (autopilot that flies the ring course and lands), P
  pause, M mute, R restart, Space start.
- **Views:** a chase camera that banks with the plane, and a cockpit view
  with a lit instrument panel — artificial horizon, altimeter, airspeed,
  heading dial, throttle lever, stall/fuel/ring warning lights — plus a HUD
  with altitude, speed, heading tape, throttle, fuel, score, ring progress
  and a timer.
- **Tech:** a hand-rolled perspective renderer in plain Canvas 2D — a
  heightfield archipelago drawn as a projected quad mesh with smooth height
  bands, slope shading and per-cell variation, sky, sun, clouds, sea
  sparkles, a runway with markings, edge lights, windsock and hangar, and
  the aircraft drawn in code. All sounds are synthesised live with WebAudio.
- **Shots:** `screenshots/` are real renders of the game's own code at a
  fixed seed (`tools/take-shots.mjs`); `tools/playtest.mjs` takes off with
  real keyboard input, lets the co-pilot fly all 6 rings and land, and
  asserts the mission completes (score 2,098 in the verified run).
- **Hand-in:** `main.ts` (Node 22, stdlib only) copies `game/` and
  `screenshots/` to `/output` and writes `/output/dossier.json` with
  `buildDossier` from `vendor/makefun-game.ts` (the kit's copy, unchanged).
  Two runs write byte-identical output.

MIT licensed. Built by Muse for Denis Akbar (@plucky-heron-81-7740).
