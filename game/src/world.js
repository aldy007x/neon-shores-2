// world.js — the simulation. One game state object, stepped with a fixed
// input snapshot; rendering and audio are injected, so the identical world
// runs in the browser and in a headless harness. All rules that involve
// money or heat live here or in missions.js, nowhere else.

import { WORLD, PLAYER, HEAT, TRAFFIC, DAY, SAVE_KEY } from './config.js';
import { makeRng, range, pick, clamp, angleLerp } from './random.js';
import { buildCity } from './city.js';
import { makeCar, makePed } from './entities.js';
import { startNextMission, updateMissions, updateRampage, onPlayerDown, MISSION_DEFS } from './missions.js';

const DIRS = [
  { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 },
];

export function starsForHeat(heat) {
  let stars = 0;
  for (let i = 0; i < HEAT.starThresholds.length; i++) {
    if (heat >= HEAT.starThresholds[i]) stars = i;
  }
  return stars;
}

export function createGame({ seed = 1, storage = null, audio }) {
  const rng = makeRng(seed * 104729 + 7);
  const city = buildCity(seed);
  const g = {
    city, rng, audio,
    time: 0,
    dayPhase: DAY.startPhase,
    screen: 'title', // title | play | pause
    player: {
      x: city.spawn.x, y: city.spawn.y, angle: -Math.PI / 2,
      vx: 0, vy: 0, health: PLAYER.maxHealth, cash: PLAYER.startCash,
      car: null, punchTimer: 0, walkCycle: 0,
    },
    cars: [], peds: [], police: [], pickups: [], particles: [], toasts: [],
    heat: 0, stars: 0, heatFloor: 0, unseenTimer: 0, bustMeter: 0,
    mission: null, nextMission: 0, jobs: 0, earned: 0,
    rampage: { active: false, timer: 0, cones: [], left: 0, cooldown: 0 },
    cityCleared: false, clearedPanel: false,
    banner: null, // { text, sub, t } for BUSTED / WASTED
    focusX: city.spawn.x, focusY: city.spawn.y,
    cam: { x: city.spawn.x, y: city.spawn.y },
    prompt: null, // context action hint for the HUD
    storage,
    muted: false,
  };

  // Dario Venn stands on his corner, day and night.
  const dario = makePed(city.dario.x, city.dario.y, rng, { name: 'Dario Venn' });
  dario.state = 'greeter';
  dario.shirt = '#ffd23e';
  g.peds.push(dario);
  g.dario = dario;

  for (let i = 0; i < TRAFFIC.pedCount; i++) {
    const p = randomSidewalkPoint(g);
    g.peds.push(makePed(p.x, p.y, rng));
  }
  for (const park of city.carParks) {
    for (const spot of park.spots) {
      g.cars.push(makeCar(spot.x, spot.y, spot.angle, spot.cls, rng, { parked: true }));
    }
  }
  for (let i = 0; i < TRAFFIC.carCount; i++) {
    const j = pick(rng, city.junctions);
    const dir = Math.floor(rng() * 4);
    const car = makeCar(j.x, j.y, dir * Math.PI / 2, pick(rng, ['compact', 'sedan', 'sedan', 'sports']), rng, { traffic: true, dir });
    car.wp = { x: j.x, y: j.y };
    g.cars.push(car);
  }

  // --- helpers the missions module calls back through -------------------
  g.toast = (text, dur = 3.5) => {
    g.toasts.push({ text, t: 0, dur });
    if (g.toasts.length > 3) g.toasts.shift();
  };
  g.earn = (amount, label, quiet = false) => {
    g.player.cash += amount;
    g.earned += amount;
    if (!quiet) {
      g.toast(`+$${amount} — ${label}`, 3);
      audio.cash();
    }
  };
  g.addHeat = (amount, why) => {
    const before = g.stars;
    g.heat = clamp(g.heat + amount, 0, 420);
    g.stars = starsForHeat(g.heat);
    if (g.stars > before) {
      audio.sirenSting();
      if (why) g.toast(why, 3);
    }
  };
  g.witnessed = (x, y) => {
    const r2 = HEAT.sightRange * HEAT.sightRange;
    for (const p of g.peds) {
      if (p.state === 'down' || p.state === 'riding') continue;
      const dx = p.x - x; const dy = p.y - y;
      if (dx * dx + dy * dy < r2) return true;
    }
    for (const c of g.police) {
      const dx = c.x - x; const dy = c.y - y;
      if (dx * dx + dy * dy < r2) return true;
    }
    return false;
  };
  g.fleeCrowd = (x, y, radius) => {
    for (const p of g.peds) {
      if (p.state !== 'stroll') continue;
      const dx = p.x - x; const dy = p.y - y;
      if (dx * dx + dy * dy < radius * radius) {
        p.state = 'flee';
        p.fleeFrom = { x, y };
        p.fleeTimer = 2.4;
      }
    }
  };
  g.spawnPassenger = (x, y) => {
    const ped = makePed(x, y, rng, { name: 'Fare' });
    ped.state = 'passenger';
    ped.shirt = '#ff5da2';
    g.peds.push(ped);
    return ped;
  };
  g.boardPassenger = (ped, car) => { ped.state = 'riding'; ped.car = car; };
  g.leavePassenger = (ped, x, y) => { ped.state = 'stroll'; ped.car = null; ped.x = x; ped.y = y; ped.wp = null; };
  g.dismissPassenger = (ped) => { if (ped) { ped.state = 'stroll'; ped.car = null; } };

  g.saveGame = () => {
    if (!storage) return;
    try {
      storage.set(SAVE_KEY, JSON.stringify({
        cash: g.player.cash, nextMission: g.nextMission, earned: g.earned, cleared: g.cityCleared,
      }));
    } catch { /* storage is a bonus, never a blocker */ }
  };
  g.loadGame = () => {
    if (!storage) return;
    try {
      const raw = storage.get(SAVE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.cash === 'number') g.player.cash = s.cash;
      if (typeof s.nextMission === 'number') g.nextMission = clamp(s.nextMission, 0, MISSION_DEFS.length);
      if (typeof s.earned === 'number') g.earned = s.earned;
      g.jobs = g.nextMission;
      g.cityCleared = !!s.cleared;
    } catch { /* a corrupt save is just a fresh start */ }
  };
  g.resetSave = () => {
    if (storage) { try { storage.set(SAVE_KEY, ''); } catch { /* ignore */ } }
    g.player.cash = PLAYER.startCash;
    g.nextMission = 0;
    g.jobs = 0;
    g.earned = 0;
    g.cityCleared = false;
    g.clearedPanel = false;
    g.mission = null;
    g.heat = 0; g.stars = 0; g.heatFloor = 0;
    g.toast('New game — Dario is waiting on his corner.', 4);
  };

  g.loadGame();
  return g;
}

function randomSidewalkPoint(g) {
  const { city, rng } = g;
  const line = pick(rng, city.lines);
  const along = range(rng, 60, city.size - 160);
  const side = rng() < 0.5 ? -1 : 1;
  if (rng() < 0.5) return { x: line + side * (WORLD.roadHalf + 8), y: along };
  return { x: along, y: line + side * (WORLD.roadHalf + 8) };
}

// ---------------------------------------------------------------- player

function stepPlayerOnFoot(g, dt, input) {
  const p = g.player;
  let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len; my /= len;
    const speed = input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    p.vx = mx * speed;
    p.vy = my * speed;
    p.angle = Math.atan2(my, mx);
    p.walkCycle += dt * (input.sprint ? 13 : 9);
  } else {
    p.vx = 0; p.vy = 0;
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  g.city.collideCircle(p, PLAYER.radius);
  // Cars are solid to a pedestrian: slide around them.
  for (const car of g.cars) {
    const dx = p.x - car.x; const dy = p.y - car.y;
    const rr = PLAYER.radius + car.spec.radius;
    const d2 = dx * dx + dy * dy;
    if (d2 < rr * rr && d2 > 0.01) {
      const d = Math.sqrt(d2);
      p.x = car.x + (dx / d) * rr;
      p.y = car.y + (dy / d) * rr;
    }
  }

  p.punchTimer -= dt;
  if (input.punchPressed && p.punchTimer <= 0) {
    p.punchTimer = PLAYER.punchCooldown;
    g.audio.punch();
    const fx = p.x + Math.cos(p.angle) * PLAYER.punchRange;
    const fy = p.y + Math.sin(p.angle) * PLAYER.punchRange;
    for (const ped of g.peds) {
      if (ped.state === 'down' || ped.state === 'riding' || ped.state === 'greeter') continue;
      const dx = ped.x - fx; const dy = ped.y - fy;
      if (dx * dx + dy * dy < 26 * 26) {
        ped.state = 'down';
        ped.downTimer = 6;
        spawnParticles(g, ped.x, ped.y, 6, '#e0655a', 90);
        if (g.witnessed(p.x, p.y)) g.addHeat(HEAT.crimes.assault, 'Assault witnessed');
        g.fleeCrowd(p.x, p.y, 190);
        break;
      }
    }
  }

  // Context prompt + interact.
  g.prompt = null;
  const darioD2 = (p.x - g.city.dario.x) ** 2 + (p.y - g.city.dario.y) ** 2;
  if (!g.mission && g.nextMission < MISSION_DEFS.length && darioD2 < 56 * 56) {
    g.prompt = `E — Talk to Dario (${MISSION_DEFS[g.nextMission].title})`;
    if (input.interactPressed) startNextMission(g);
    return;
  }
  let nearest = null;
  let nearestD2 = 46 * 46;
  for (const car of g.cars) {
    const dx = car.x - p.x; const dy = car.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < nearestD2) { nearestD2 = d2; nearest = car; }
  }
  if (nearest) {
    g.prompt = nearest.police ? 'E — Steal the police car (very bad idea)' : `E — Drive the ${nearest.spec.label}`;
    if (input.interactPressed) enterCar(g, nearest);
  }
}

function enterCar(g, car) {
  const p = g.player;
  if (car.traffic && car.driver) {
    // The driver is thrown out and runs.
    const ped = makePed(car.x + 22, car.y + 10, g.rng);
    ped.state = 'flee';
    ped.fleeFrom = { x: p.x, y: p.y };
    ped.fleeTimer = 3;
    g.peds.push(ped);
    car.driver = false;
  }
  if (g.witnessed(p.x, p.y)) {
    g.addHeat(car.police ? HEAT.crimes.theft + 30 : HEAT.crimes.theft, car.police ? 'Police car stolen!' : 'Car theft witnessed');
  }
  car.traffic = false;
  car.parked = false;
  p.car = car;
  g.audio.door();
}

function exitCar(g) {
  const p = g.player;
  const car = p.car;
  if (!car) return;
  p.car = null;
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * (car.spec.radius + 12);
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * (car.spec.radius + 12);
  g.city.collideCircle(p, PLAYER.radius);
  car.speed = 0;
  car.vx = 0; car.vy = 0;
  g.audio.door();
}

function stepPlayerCar(g, dt, input) {
  const p = g.player;
  const car = p.car;
  const spec = car.spec;
  g.prompt = 'E — Step out';
  if (input.interactPressed) { exitCar(g); return; }

  const throttle = (input.up ? 1 : 0) - (input.down ? 1 : 0);
  const steerIn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let vf = car.vx * fx + car.vy * fy;
  const lx = car.vx - fx * vf;
  const ly = car.vy - fy * vf;

  if (throttle > 0) vf += spec.accel * dt;
  else if (throttle < 0) vf -= (vf > 12 ? spec.brake : spec.accel * 0.55) * dt;
  vf -= vf * 0.55 * dt; // rolling drag
  if (input.handbrake) vf -= vf * 1.7 * dt;
  vf = clamp(vf, -spec.reverseSpeed, spec.topSpeed);

  const grip = input.handbrake ? spec.driftGrip : spec.grip;
  const keep = Math.exp(-grip * dt);
  const turnAuthority = clamp(Math.abs(vf) / 130, 0, 1) * (vf < 0 ? -1 : 1);
  car.angle += steerIn * spec.turnRate * turnAuthority * dt;
  car.steer = steerIn;

  const nfx = Math.cos(car.angle);
  const nfy = Math.sin(car.angle);
  car.vx = nfx * vf + lx * keep;
  car.vy = nfy * vf + ly * keep;
  car.speed = vf;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  const impactSpeed = Math.hypot(car.vx, car.vy);
  const beforeX = car.x; const beforeY = car.y;
  if (g.city.collideCircle(car, spec.radius)) {
    // The push-out distance is a fair proxy for how hard we hit.
    const push = Math.hypot(car.x - beforeX, car.y - beforeY);
    if (impactSpeed > 120 && push > 1.5) {
      const severity = clamp((impactSpeed - 120) / 300, 0.2, 1.4);
      car.health = Math.max(0, car.health - severity * 16);
      hurtPlayer(g, severity * 9);
      spawnParticles(g, car.x, car.y, Math.floor(6 + severity * 8), '#ffd23e', 190);
      g.audio.crash(severity);
      car.vx *= 0.35; car.vy *= 0.35;
    }
  }
  collideCarWithCars(g, car, dt);
  runOverPeds(g, car);
  if (car.health < 45 && g.rng() < dt * 6) {
    spawnSmoke(g, car.x, car.y, car.health < 20 ? 2 : 1);
  }
  p.x = car.x; p.y = car.y; p.angle = car.angle;
}

function collideCarWithCars(g, car, dt) {
  for (const other of g.cars) {
    if (other === car) continue;
    const dx = other.x - car.x; const dy = other.y - car.y;
    const rr = car.spec.radius + other.spec.radius;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr || d2 < 0.01) continue;
    const d = Math.sqrt(d2);
    const nx = dx / d; const ny = dy / d;
    const overlap = rr - d;
    const relVx = car.vx - other.vx;
    const relVy = car.vy - other.vy;
    const closing = relVx * nx + relVy * ny;
    if (!other.parked && !g.police.includes(other)) {
      other.x += nx * overlap * 0.5; other.y += ny * overlap * 0.5;
      car.x -= nx * overlap * 0.5; car.y -= ny * overlap * 0.5;
    } else {
      car.x -= nx * overlap; car.y -= ny * overlap;
    }
    if (closing > 60) {
      const severity = clamp((closing - 60) / 320, 0.15, 1.3);
      car.health = Math.max(0, car.health - severity * 11);
      other.health = Math.max(0, other.health - severity * 13);
      if (car === g.player.car || other === g.player.car) hurtPlayer(g, severity * 6);
      spawnParticles(g, (car.x + other.x) / 2, (car.y + other.y) / 2, Math.floor(5 + severity * 8), '#ffd23e', 170);
      g.audio.crash(severity);
      car.vx -= nx * closing * 0.55; car.vy -= ny * closing * 0.55;
      if (!other.parked) { other.vx += nx * closing * 0.4; other.vy += ny * closing * 0.4; }
      // Ramming home a crime needs a beat between charges, else one scrape
      // would stack the whole heat table. Only the player's own driving is
      // ever charged — a police car ramming the player is not his crime.
      const now = g.time;
      if (car === g.player.car && now - (car.lastRamAt || -9) > 1.6) {
        car.lastRamAt = now;
        if (other.police) g.addHeat(HEAT.crimes.ramPolice, 'You rammed a police car');
        else if (g.witnessed(car.x, car.y)) g.addHeat(HEAT.crimes.ramCivilian, 'Collision witnessed');
      }
    }
  }
  void dt;
}

function runOverPeds(g, car) {
  const speed = Math.abs(car.speed);
  if (speed < 42) return;
  for (const ped of g.peds) {
    if (ped.state === 'down' || ped.state === 'riding' || ped.state === 'greeter') continue;
    const dx = ped.x - car.x; const dy = ped.y - car.y;
    const rr = car.spec.radius + 10;
    if (dx * dx + dy * dy < rr * rr) {
      ped.state = 'down';
      ped.downTimer = 7;
      spawnParticles(g, ped.x, ped.y, 8, '#e0655a', 120);
      g.audio.crash(0.5);
      if (g.witnessed(car.x, car.y)) g.addHeat(HEAT.crimes.hitAndRun, 'Hit and run!');
      g.fleeCrowd(ped.x, ped.y, 210);
    }
  }
}

function hurtPlayer(g, amount) {
  const p = g.player;
  p.health = Math.max(0, p.health - amount);
  if (p.health <= 0 && g.screen === 'play') wasted(g);
}

function busted(g) {
  const p = g.player;
  const fine = Math.min(p.cash, HEAT.bustFine);
  p.cash -= fine;
  if (p.car) { p.car = null; }
  p.x = g.city.policeDoor.x; p.y = g.city.policeDoor.y;
  p.health = Math.max(p.health, 55);
  g.heat = 0; g.stars = 0; g.bustMeter = 0;
  clearPolice(g);
  g.banner = { text: 'BUSTED', sub: `Fine $${fine} — the car stays where it lies.`, t: 3 };
  g.audio.fail();
  onPlayerDown(g);
  g.saveGame();
}

function wasted(g) {
  const p = g.player;
  const fine = Math.min(p.cash, HEAT.wastedFine);
  p.cash -= fine;
  if (p.car) { p.car = null; }
  p.x = g.city.hospitalDoor.x; p.y = g.city.hospitalDoor.y;
  p.health = PLAYER.maxHealth;
  g.heat = 0; g.stars = 0; g.bustMeter = 0;
  clearPolice(g);
  g.banner = { text: 'WASTED', sub: `Hospital bill $${fine}. Port Azura is not done with you.`, t: 3 };
  g.audio.fail();
  onPlayerDown(g);
  g.saveGame();
}

function clearPolice(g) {
  for (const c of g.police) {
    const i = g.cars.indexOf(c);
    if (i >= 0) g.cars.splice(i, 1);
  }
  g.police = [];
}

function spawnParticles(g, x, y, n, color, spread) {
  for (let i = 0; i < n; i++) {
    const a = g.rng() * Math.PI * 2;
    const s = 30 + g.rng() * spread;
    g.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.45 + g.rng() * 0.3, maxLife: 0.75, color, size: 2 + g.rng() * 2.5, smoke: false });
  }
}

function spawnSmoke(g, x, y, n) {
  for (let i = 0; i < n; i++) {
    g.particles.push({ x: x + (g.rng() - 0.5) * 10, y: y + (g.rng() - 0.5) * 10, vx: (g.rng() - 0.5) * 14, vy: -26 - g.rng() * 22, life: 0.9, maxLife: 0.9, color: '#22242a', size: 5 + g.rng() * 5, smoke: true });
  }
}

// ---------------------------------------------------------------- traffic

function laneTargetFor(car) {
  // Aim at the upcoming junction, shifted onto the right-hand lane.
  const dir = DIRS[car.dir];
  const rightX = -dir.y;
  const rightY = dir.x;
  return {
    x: car.wp.x + rightX * WORLD.laneOffset,
    y: car.wp.y + rightY * WORLD.laneOffset,
  };
}

function chooseNextJunction(g, car) {
  // At a junction: mostly straight, sometimes a turn, almost never a U-turn.
  const options = [0, 1, 2, 3].filter((d) => d !== (car.dir + 2) % 4);
  car.dir = g.rng() < 0.55 ? car.dir : pick(g.rng, options);
  const dir = DIRS[car.dir];
  const nx = car.wp.x + dir.x * WORLD.block;
  const ny = car.wp.y + dir.y * WORLD.block;
  if (nx < 100 || ny < 100 || nx > g.city.size - 260 || ny > g.city.size - 260) {
    car.dir = (car.dir + 2) % 4;
    car.wp = { x: car.wp.x + DIRS[car.dir].x * WORLD.block, y: car.wp.y + DIRS[car.dir].y * WORLD.block };
  } else {
    car.wp = { x: nx, y: ny };
  }
}

function obstacleAhead(g, car, range) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const test = (e, r) => {
    const dx = e.x - car.x; const dy = e.y - car.y;
    const ahead = dx * fx + dy * fy;
    if (ahead < 4 || ahead > range) return false;
    const lateral = Math.abs(dx * -fy + dy * fx);
    return lateral < r;
  };
  for (const other of g.cars) {
    if (other !== car && test(other, 24)) return true;
  }
  for (const ped of g.peds) {
    if (ped.state !== 'down' && ped.state !== 'riding' && test(ped, 16)) return true;
  }
  return false;
}

function stepTrafficCar(g, car, dt) {
  const target = laneTargetFor(car);
  const dx = target.x - car.x;
  const dy = target.y - car.y;
  const distToWp = Math.hypot(car.wp.x - car.x, car.wp.y - car.y);
  if (distToWp < 44) chooseNextJunction(g, car);
  const desired = Math.atan2(dy, dx);
  car.angle = angleLerp(car.angle, desired, clamp(dt * 3.2, 0, 1));
  const blocked = obstacleAhead(g, car, 86);
  const targetSpeed = blocked ? 0 : 150;
  car.speed += clamp(targetSpeed - car.speed, -420 * dt, 190 * dt);
  car.brake = blocked || car.speed < 0 ? 0.2 : Math.max(0, car.brake - dt);
  if (blocked) car.brake = 0.2;
  car.vx = Math.cos(car.angle) * car.speed;
  car.vy = Math.sin(car.angle) * car.speed;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  g.city.collideCircle(car, car.spec.radius);
}

// ---------------------------------------------------------------- peds

function stepPed(g, ped, dt) {
  if (ped.state === 'riding' || ped.state === 'greeter' || ped.state === 'passenger') return;
  if (ped.state === 'down') {
    ped.downTimer -= dt;
    if (ped.downTimer <= 0) {
      ped.state = 'flee';
      ped.fleeFrom = { x: g.focusX, y: g.focusY };
      ped.fleeTimer = 1.6;
    }
    return;
  }
  if (ped.state === 'flee') {
    ped.fleeTimer -= dt;
    const dx = ped.x - ped.fleeFrom.x;
    const dy = ped.y - ped.fleeFrom.y;
    const d = Math.hypot(dx, dy) || 1;
    ped.angle = Math.atan2(dy / d, dx / d);
    ped.x += Math.cos(ped.angle) * 196 * dt;
    ped.y += Math.sin(ped.angle) * 196 * dt;
    g.city.collideCircle(ped, 11);
    if (ped.fleeTimer <= 0) { ped.state = 'stroll'; ped.wp = null; }
    return;
  }
  // Stroll between sidewalk waypoints.
  if (!ped.wp || Math.hypot(ped.wp.x - ped.x, ped.wp.y - ped.y) < 12) {
    ped.wp = randomSidewalkPoint(g);
  }
  const desired = Math.atan2(ped.wp.y - ped.y, ped.wp.x - ped.x);
  ped.angle = angleLerp(ped.angle, desired, clamp(dt * 6, 0, 1));
  ped.x += Math.cos(ped.angle) * ped.speed * dt;
  ped.y += Math.sin(ped.angle) * ped.speed * dt;
  g.city.collideCircle(ped, 11);
}

// ---------------------------------------------------------------- police

function spawnPolice(g) {
  let best = null;
  let bestD = -1;
  for (const j of g.city.junctions) {
    const d = Math.hypot(j.x - g.focusX, j.y - g.focusY);
    if (d > 430 && d < 820 && d > bestD) { bestD = d; best = j; }
  }
  if (!best) best = g.city.junctions[0];
  const car = makeCar(best.x, best.y, 0, 'sedan', g.rng, { police: true, color: '#e8ecf2' });
  car.spec = { ...car.spec, topSpeed: 440, accel: 430 };
  g.cars.push(car);
  g.police.push(car);
}

function stepPoliceCar(g, car, dt) {
  // Predict the player's position a touch ahead and drive at it; if the way
  // is walled, probe to either side and take the opening.
  const lead = 0.35;
  const tx = g.focusX + (g.player.car ? g.player.car.vx : g.player.vx) * lead;
  const ty = g.focusY + (g.player.car ? g.player.car.vy : g.player.vy) * lead;
  let desired = Math.atan2(ty - car.y, tx - car.x);
  const probe = (ang) => {
    const px = car.x + Math.cos(ang) * 58;
    const py = car.y + Math.sin(ang) * 58;
    return !g.city.pointSolid(px, py) && g.city.surfaceAt(px, py) !== 'sea';
  };
  if (!probe(desired)) {
    if (probe(desired + 0.75)) desired += 0.75;
    else if (probe(desired - 0.75)) desired -= 0.75;
    else desired += Math.PI * 0.6;
  }
  car.angle = angleLerp(car.angle, desired, clamp(dt * 2.6, 0, 1));
  const distToPlayer = Math.hypot(g.focusX - car.x, g.focusY - car.y);
  const blocked = obstacleAhead(g, car, 60);
  const targetSpeed = blocked && distToPlayer > 90 ? 60 : car.spec.topSpeed;
  car.speed += clamp(targetSpeed - car.speed, -640 * dt, 330 * dt);
  car.vx = Math.cos(car.angle) * car.speed;
  car.vy = Math.sin(car.angle) * car.speed;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  const beforeX = car.x; const beforeY = car.y;
  if (g.city.collideCircle(car, car.spec.radius) && Math.hypot(car.x - beforeX, car.y - beforeY) > 2) {
    car.health = Math.max(0, car.health - 4);
    car.vx *= 0.4; car.vy *= 0.4;
    car.speed *= 0.4;
  }
  collideCarWithCars(g, car, dt);
  if (car.health < 40 && g.rng() < dt * 5) spawnSmoke(g, car.x, car.y, 1);
}

function stepWanted(g, dt) {
  // Sight: any officer within range of the focus point keeps the trail hot.
  let seen = false;
  for (const c of g.police) {
    const dx = c.x - g.focusX; const dy = c.y - g.focusY;
    if (dx * dx + dy * dy < HEAT.sightRange * HEAT.sightRange) { seen = true; break; }
  }
  if (seen) g.unseenTimer = 0;
  else g.unseenTimer += dt;
  if (g.unseenTimer > HEAT.decayGrace && g.heat > g.heatFloor) {
    g.heat = Math.max(g.heatFloor, g.heat - HEAT.decayPerSecond * dt);
    g.stars = starsForHeat(g.heat);
  }
  if (g.heat < g.heatFloor) {
    g.heat = g.heatFloor;
    g.stars = starsForHeat(g.heat);
  }

  const wanted = HEAT.policePerStar[g.stars];
  if (g.police.length < wanted) spawnPolice(g);
  else if (g.police.length > wanted) {
    // The farthest unit gives up first.
    let far = null; let farD = -1;
    for (const c of g.police) {
      const d = Math.hypot(c.x - g.focusX, c.y - g.focusY);
      if (d > farD) { farD = d; far = c; }
    }
    if (far && (farD > 240 || wanted === 0)) {
      g.police.splice(g.police.indexOf(far), 1);
      g.cars.splice(g.cars.indexOf(far), 1);
    }
  }

  // Bust pressure: an officer close by while the player barely moves.
  const pSpeed = g.player.car ? Math.abs(g.player.car.speed) : Math.hypot(g.player.vx, g.player.vy);
  let cornered = false;
  if (g.stars > 0 && pSpeed < 30) {
    for (const c of g.police) {
      const d = Math.hypot(c.x - g.focusX, c.y - g.focusY);
      if (d < (g.player.car ? 74 : 52)) { cornered = true; break; }
    }
  }
  if (cornered) {
    g.bustMeter += dt / HEAT.bustFillTime;
    if (g.bustMeter >= 1) { busted(g); return; }
  } else {
    g.bustMeter = Math.max(0, g.bustMeter - dt * 0.7);
  }
}

// ---------------------------------------------------------------- step

export function stepGame(g, dt, input) {
  g.time += dt;
  g.dayPhase = (g.dayPhase + dt / DAY.cycleSeconds) % 1;
  if (input.mutePressed) {
    g.muted = !g.muted;
    g.audio.setMuted(g.muted);
  }

  if (g.screen === 'title') {
    if (input.confirmPressed || input.interactPressed) {
      g.screen = 'play';
      g.audio.unlock();
      g.toast(g.nextMission >= MISSION_DEFS.length ? 'Port Azura is yours. Free roam.' : 'Find Dario Venn on his corner — the yellow shirt, south-west.', 6);
    }
  } else if (g.screen === 'pause') {
    if (input.pausePressed || input.confirmPressed) g.screen = 'play';
    if (input.resetPressed) { g.resetSave(); g.screen = 'play'; }
    return;
  } else if (input.pausePressed) {
    g.screen = 'pause';
    return;
  }

  if (g.banner) {
    g.banner.t -= dt;
    if (g.banner.t <= 0) g.banner = null;
  }
  if (g.clearedPanel && (input.confirmPressed || input.interactPressed)) g.clearedPanel = false;
  const wasCleared = g.cityCleared;

  // Ambient city always breathes; the player only acts in play.
  for (const car of g.cars) if (car.traffic) stepTrafficCar(g, car, dt);
  for (const ped of g.peds) stepPed(g, ped, dt);

  if (g.screen === 'play') {
    if (g.player.car) stepPlayerCar(g, dt, input);
    else stepPlayerOnFoot(g, dt, input);
    for (const car of g.police) stepPoliceCar(g, car, dt);
    stepWanted(g, dt);
    updateMissions(g, dt);
    updateRampage(g, dt);
    // Pickups (fare tips) collect by walking or driving over them.
    for (let i = g.pickups.length - 1; i >= 0; i--) {
      const pk = g.pickups[i];
      pk.bob += dt * 4;
      const dx = pk.x - g.focusX; const dy = pk.y - g.focusY;
      if (dx * dx + dy * dy < 34 * 34) {
        g.pickups.splice(i, 1);
        g.earn(pk.amount, pk.kind === 'tip' ? 'Fare tip' : 'Cash', false);
        spawnParticles(g, pk.x, pk.y, 7, '#7dff6a', 80);
      }
    }
    if (g.cityCleared && !wasCleared) g.clearedPanel = true;
  }

  g.focusX = g.player.car ? g.player.car.x : g.player.x;
  g.focusY = g.player.car ? g.player.car.y : g.player.y;
  g.cam.x += (g.focusX - g.cam.x) * clamp(dt * 5, 0, 1);
  g.cam.y += (g.focusY - g.cam.y) * clamp(dt * 5, 0, 1);

  for (let i = g.particles.length - 1; i >= 0; i--) {
    const pt = g.particles[i];
    pt.life -= dt;
    if (pt.life <= 0) { g.particles.splice(i, 1); continue; }
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
  }
  for (let i = g.toasts.length - 1; i >= 0; i--) {
    g.toasts[i].t += dt;
    if (g.toasts[i].t > g.toasts[i].dur) g.toasts.splice(i, 1);
  }

  // Audio beds follow the action.
  const car = g.player.car;
  g.audio.setEngine(car ? Math.abs(car.speed) / car.spec.topSpeed : 0, !!car && g.screen === 'play');
  let siren = 0;
  for (const c of g.police) {
    const d = Math.hypot(c.x - g.focusX, c.y - g.focusY);
    siren = Math.max(siren, clamp(1 - d / 620, 0, 1));
  }
  g.audio.setSiren(g.screen === 'play' ? siren : 0);
}

// Sun height from the day phase: > 0 is day, < 0 is night.
export function sunHeight(g) {
  return Math.sin(g.dayPhase * Math.PI * 2 - 0.6);
}

export function nightFactor(g) {
  return clamp((0.08 - sunHeight(g)) * 1.5, 0, 1);
}
