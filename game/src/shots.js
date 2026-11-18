// shots.js — deterministic screenshot scenes. The page is loaded with
// ?shot=cover|play|chase|end&seed=1; beginShot arranges the scene, the shell
// steps the world a fixed number of fixed-size steps so traffic and crowds
// settle naturally, then finishShot makes any final arrangement and the
// shell renders exactly one frame. Same seed, same frame, every time.

import { MISSION_PAY, FARE_TIP } from './config.js';
import { makeCar } from './entities.js';
import { startNextMission } from './missions.js';

function landmark(g, kind) {
  return g.city.landmarks.find((l) => l.kind === kind);
}

function putPlayerInCar(g, cls, x, y, angle, speed) {
  const car = makeCar(x, y, angle, cls, g.rng, { color: '#12b5a5' });
  car.vx = Math.cos(angle) * speed;
  car.vy = Math.sin(angle) * speed;
  car.speed = speed;
  g.cars.push(car);
  g.player.car = car;
  g.player.x = x;
  g.player.y = y;
  g.focusX = x;
  g.focusY = y;
  g.cam.x = x;
  g.cam.y = y;
  return car;
}

export function beginShot(g, name) {
  // A staged scene must not inherit a real save's progression.
  g.mission = null;
  g.nextMission = 0;
  g.jobs = 0;
  g.earned = 0;
  g.player.cash = 250;
  g.player.health = 100;
  g.heat = 0;
  g.stars = 0;
  g.cityCleared = false;
  g.clearedPanel = false;
  if (name === 'cover') {
    g.screen = 'title';
    const tower = landmark(g, 'tower');
    g.dayPhase = 0.47; // late golden afternoon, windows just lighting up
    g.player.x = tower.x - 130;
    g.player.y = tower.y + 60;
    g.focusX = tower.x - 60;
    g.focusY = tower.y;
    g.cam.x = g.focusX;
    g.cam.y = g.focusY;
  } else if (name === 'play') {
    g.screen = 'play';
    g.dayPhase = 0.3;
    startNextMission(g); // Hot Package, objective on the HUD and minimap
    const tower = landmark(g, 'tower');
    // Mid-route: east of the tower, driving at it down the avenue.
    putPlayerInCar(g, 'sedan', tower.x + 430, 900, Math.PI, 215);
  } else if (name === 'chase') {
    g.screen = 'play';
    g.dayPhase = 0.62; // dusk: headlights and neon on
    putPlayerInCar(g, 'sports', 1980, 1620, 0, 300);
    g.addHeat(175, ''); // exactly four stars
    g.toast('Four stars — the whole district is rolling.', 30);
  } else if (name === 'end') {
    g.screen = 'play';
    g.dayPhase = 0.5;
    const total = MISSION_PAY.reduce((a, b) => a + b, 0) + FARE_TIP;
    g.nextMission = MISSION_PAY.length;
    g.jobs = MISSION_PAY.length;
    g.earned = total;
    g.player.cash = 250 + total; // the same math the panel shows in play
    g.cityCleared = true;
    g.clearedPanel = true;
    g.player.x = g.city.dario.x - 60;
    g.player.y = g.city.dario.y + 26;
    g.focusX = g.player.x;
    g.focusY = g.player.y;
    g.cam.x = g.focusX;
    g.cam.y = g.focusY;
  }
}

export function finishShot(g, name) {
  if (name === 'chase') {
    // Arrange the pursuit for the frame: units closing from behind and the
    // flank, lights flashing, the player's sports car pulling away.
    const car = g.player.car;
    const spots = [
      { dx: -120, dy: -46, a: 0.25 },
      { dx: -150, dy: 52, a: -0.2 },
      { dx: -64, dy: 118, a: -0.9 },
      { dx: -230, dy: -8, a: 0.05 },
      { dx: 90, dy: -150, a: 2.6 },
    ];
    g.police.forEach((unit, i) => {
      const s = spots[i % spots.length];
      unit.x = car.x + s.dx;
      unit.y = car.y + s.dy;
      unit.angle = Math.atan2(car.y - unit.y, car.x - unit.x);
      unit.speed = 330;
      unit.vx = Math.cos(unit.angle) * 330;
      unit.vy = Math.sin(unit.angle) * 330;
    });
    g.cam.x = car.x;
    g.cam.y = car.y;
    g.focusX = car.x;
    g.focusY = car.y;
  }
  if (name === 'play' && g.player.car) {
    g.cam.x = g.player.car.x;
    g.cam.y = g.player.car.y;
    g.focusX = g.player.car.x;
    g.focusY = g.player.car.y;
  }
}
