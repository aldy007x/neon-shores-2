// sim.mjs — headless harness for Neon Shores. Plays the real world with
// scripted inputs (teleports are used to travel between objectives; every
// rule — heat, police, timers, payments — runs through the game's own
// step). Run: node sim.mjs. Exits non-zero on the first failed area.

import { createGame, stepGame, starsForHeat } from './game/src/world.js';
import { scriptedInput } from './game/src/input.js';
import { silentAudio } from './game/src/audio.js';
import { HEAT } from './game/src/config.js';

const DT = 1 / 60;
let failures = 0;

function check(name, cond, detail = '') {
  if (cond) console.log(`  PASS ${name}`);
  else { failures += 1; console.log(`  FAIL ${name} ${detail}`); }
}

function memoryStorage() {
  const data = {};
  return { data, get: (k) => data[k] ?? null, set: (k, v) => { data[k] = v; } };
}

function newGame(storage = memoryStorage()) {
  const g = createGame({ seed: 1, storage, audio: silentAudio() });
  stepGame(g, DT, scriptedInput({ confirmPressed: true })); // leave the title
  return g;
}

function steps(g, n, input = {}) {
  const snap = scriptedInput(input);
  for (let i = 0; i < n; i++) stepGame(g, DT, snap);
}

function teleportPlayer(g, x, y) {
  g.player.x = x; g.player.y = y;
  if (g.player.car) { g.player.car.x = x; g.player.car.y = y; }
  g.focusX = x; g.focusY = y;
  g.cam.x = x; g.cam.y = y;
}

function clearPolice(g) {
  for (const c of [...g.police]) {
    g.cars.splice(g.cars.indexOf(c), 1);
  }
  g.police = [];
}

function talkToDario(g) {
  if (g.player.car) {
    teleportPlayer(g, g.city.dario.x - 90, g.city.dario.y);
    steps(g, 1, { interactPressed: true }); // step out
  }
  teleportPlayer(g, g.city.dario.x - 20, g.city.dario.y);
  steps(g, 1, { interactPressed: true });
}

function getParkedCar(g) {
  const car = g.cars.find((c) => c.parked);
  teleportPlayer(g, car.x - 24, car.y);
  steps(g, 1, { interactPressed: true });
  return g.player.car;
}

// ------------------------------------------------------------ walking
console.log('walking');
{
  const g = newGame();
  const y0 = g.player.y;
  steps(g, 60, { down: true });
  check('player walks south under input', g.player.y - y0 > 80, `dy=${(g.player.y - y0).toFixed(1)}`);
  const x0 = g.player.x;
  steps(g, 30, { right: true, sprint: true });
  check('sprint moves faster than walk', g.player.x - x0 > 90, `dx=${(g.player.x - x0).toFixed(1)}`);
}

// ------------------------------------------------------------ theft + driving
console.log('car theft and driving');
{
  const g = newGame();
  // Park the traffic somewhere harmless so the driving test is clean.
  for (const c of g.cars) if (c.traffic) { c.x = 120; c.y = 120; }
  const car = g.cars.find((c) => c.parked);
  car.x = 540; car.y = 540; car.angle = 0;
  const witness = g.peds.find((p) => p.state === 'stroll');
  witness.x = 570; witness.y = 560;
  teleportPlayer(g, 518, 540);
  steps(g, 1, { interactPressed: true });
  check('player enters the car', g.player.car === car);
  check('witnessed theft adds heat', g.heat >= HEAT.crimes.theft, `heat=${g.heat}`);
  check('theft makes at least one star', g.stars >= 1, `stars=${g.stars}`);
  const x0 = car.x;
  steps(g, 90, { up: true });
  check('car accelerates past 120 px/s', Math.abs(car.speed) > 120, `speed=${car.speed.toFixed(0)}`);
  check('car travels east down the avenue', car.x - x0 > 150, `dx=${(car.x - x0).toFixed(0)}`);
}

// ------------------------------------------------------------ police per star
console.log('police per star');
{
  const g = newGame();
  for (const heat of [25, 60, 110, 175, 260]) {
    clearPolice(g);
    g.heat = heat;
    g.stars = starsForHeat(heat);
    steps(g, 40);
    check(`heat ${heat} -> ${HEAT.policePerStar[g.stars]} units`, g.police.length === HEAT.policePerStar[g.stars], `got ${g.police.length}`);
  }
}

// ------------------------------------------------------------ heat decay
console.log('heat decay');
{
  const g = newGame();
  g.addHeat(60);
  check('setup: two stars', g.stars === 2);
  let stepsUsed = 0;
  while (g.heat > 1 && stepsUsed < 60 * 20) {
    for (const c of g.police) { c.x = 100; c.y = 100; } // a clean getaway
    stepGame(g, DT, scriptedInput({}));
    stepsUsed += 1;
  }
  check('heat drains to ~0 when unseen', g.heat <= 1, `heat=${g.heat.toFixed(1)} after ${stepsUsed} steps`);
  check('stars follow heat down', g.stars === 0);
}

// ------------------------------------------------------------ bust flow
console.log('bust flow');
{
  const g = newGame();
  g.addHeat(60);
  steps(g, 30);
  check('police have arrived', g.police.length === 2, `got ${g.police.length}`);
  let busted = false;
  for (let i = 0; i < 60 * 6 && !busted; i++) {
    for (const c of g.police) { c.x = g.player.x + 40; c.y = g.player.y; c.speed = 0; }
    stepGame(g, DT, scriptedInput({}));
    if (g.banner && g.banner.text === 'BUSTED') busted = true;
  }
  check('cornered player is busted', busted);
  check('bust fine is exact', g.player.cash === 250 - HEAT.bustFine, `cash=${g.player.cash}`);
  check('bust clears heat', g.heat === 0 && g.stars === 0);
  const d = Math.hypot(g.player.x - g.city.policeDoor.x, g.player.y - g.city.policeDoor.y);
  check('bust respawns at Police HQ', d < 2, `d=${d.toFixed(1)}`);
}

// ------------------------------------------------------------ save / load
console.log('save and load');
{
  const storage = memoryStorage();
  const g = newGame(storage);
  g.player.cash = 999;
  g.saveGame();
  const g2 = createGame({ seed: 1, storage, audio: silentAudio() });
  check('save reloads cash', g2.player.cash === 999, `cash=${g2.player.cash}`);
}

// ------------------------------------------------------------ determinism
console.log('determinism');
{
  const a = newGame();
  const b = newGame();
  steps(a, 300, { down: true });
  steps(b, 300, { down: true });
  check('same seed, same run', a.player.x === b.player.x && a.player.y === b.player.y && a.player.cash === b.player.cash);
}

// ------------------------------------------------------------ the full run: all six jobs
console.log('full run — six missions, exact cash math');
{
  const storage = memoryStorage();
  const g = newGame(storage);
  const expectCash = (n, label) => check(`${label}: cash ${n}`, g.player.cash === n, `cash=${g.player.cash}`);

  // 1. Hot Package — on foot, straight to the tower.
  talkToDario(g);
  check('mission 1 auto-starts at Dario', g.mission && g.mission.id === 'hot-package');
  teleportPlayer(g, g.mission.objective.x, g.mission.objective.y);
  steps(g, 2);
  check('mission 1 completes', !g.mission && g.nextMission === 1);
  expectCash(550, 'after Hot Package');

  // 2. Fare Play — take a car, board the fare, deliver, collect the tip.
  talkToDario(g);
  check('mission 2 starts', g.mission && g.mission.id === 'fare-play');
  getParkedCar(g);
  check('player has a car for the fare', !!g.player.car);
  const passenger = g.mission.passenger;
  teleportPlayer(g, passenger.x + 24, passenger.y);
  g.player.car.speed = 0;
  steps(g, 2);
  check('fare boards a stopped car', g.mission.phase === 'dropoff', `phase=${g.mission.phase}`);
  teleportPlayer(g, g.mission.objective.x, g.mission.objective.y);
  steps(g, 2);
  check('mission 2 completes', !g.mission && g.nextMission === 2);
  expectCash(800, 'after Fare Play fare');
  check('tip pickup spawned', g.pickups.length === 1, `pickups=${g.pickups.length}`);
  teleportPlayer(g, g.pickups[0].x, g.pickups[0].y);
  steps(g, 2);
  expectCash(840, 'after collecting the tip');

  // 3. Cool Down — starts at three stars; escape until the heat is gone.
  talkToDario(g);
  check('mission 3 starts', g.mission && g.mission.id === 'cool-down');
  check('mission 3 starts at three stars', g.stars === 3, `stars=${g.stars} heat=${g.heat}`);
  let guard = 0;
  while (g.mission && guard < 60 * 45) {
    for (const c of g.police) { c.x = 100; c.y = 100; }
    stepGame(g, DT, scriptedInput({}));
    guard += 1;
  }
  check('mission 3 completes when heat reaches zero', !g.mission && g.nextMission === 3, `guard=${guard} heat=${g.heat.toFixed(1)}`);
  expectCash(1240, 'after Cool Down');
  steps(g, 10); // let the last units stand down

  // 4. Grand Tour — three checkpoints.
  talkToDario(g);
  check('mission 4 starts', g.mission && g.mission.id === 'grand-tour');
  for (let cp = 0; cp < 3; cp++) {
    teleportPlayer(g, g.mission.objective.x, g.mission.objective.y);
    steps(g, 2);
  }
  check('mission 4 completes', !g.mission && g.nextMission === 4);
  expectCash(1740, 'after Grand Tour');

  // 5. Harbour Run — three crates under a two-star floor, then the warehouse.
  talkToDario(g);
  check('mission 5 starts', g.mission && g.mission.id === 'harbour-run');
  for (let c = 0; c < 3; c++) {
    teleportPlayer(g, g.mission.objective.x, g.mission.objective.y);
    steps(g, 2);
    if (c === 0) check('first crate raises a two-star floor', g.heatFloor === 60 && g.heat >= 60, `floor=${g.heatFloor} heat=${g.heat}`);
  }
  check('mission 5 reaches the delivery phase', g.mission && g.mission.phase === 'deliver', `phase=${g.mission && g.mission.phase}`);
  teleportPlayer(g, g.mission.objective.x, g.mission.objective.y);
  steps(g, 2);
  check('mission 5 completes', !g.mission && g.nextMission === 5);
  expectCash(2340, 'after Harbour Run');

  // 6. Neon Finale — six checkpoints, escalating heat floor.
  talkToDario(g);
  check('mission 6 starts', g.mission && g.mission.id === 'neon-finale');
  let sawEscalation = false;
  for (let cp = 0; cp < 6; cp++) {
    teleportPlayer(g, g.mission.objective.x, g.mission.objective.y);
    steps(g, 2);
    if (g.heatFloor >= 110) sawEscalation = true;
  }
  check('finale escalates the heat floor', sawEscalation);
  check('mission 6 completes', !g.mission && g.nextMission === 6);
  expectCash(3140, 'after Neon Finale');
  check('total earned is exact', g.earned === 2890, `earned=${g.earned}`);
  check('city cleared', g.cityCleared === true && g.clearedPanel === true);
  check('jobs counted', g.jobs === 6);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
