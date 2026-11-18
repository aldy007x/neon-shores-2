// entities.js — the moving population of Port Azura: cars (traffic, parked,
// police, the player's ride) and pedestrians. Factories only; behaviour
// lives in world.js so the simulation stays in one place.

import { VEHICLE_CLASSES } from './config.js';
import { makeRng, pick, range } from './random.js';

const CAR_COLORS = ['#c94f4f', '#4f7dc9', '#e0b83e', '#58a05c', '#b0b6bd', '#7058a8', '#d97b29', '#3fa8a0', '#e6e6e6', '#2e3138'];
const PED_SHIRTS = ['#e0655a', '#5a8de0', '#e0c95a', '#6ac96a', '#c95ac0', '#5ac9c0', '#e8e8e8', '#8888ff'];
const PED_PANTS = ['#2c3550', '#40342a', '#222222', '#4a4a55', '#5d4037'];

let nextId = 1;

export function makeCar(x, y, angle, cls, rng, opts = {}) {
  const spec = VEHICLE_CLASSES[cls];
  return {
    id: nextId++,
    kind: 'car',
    cls,
    spec,
    x, y, angle,
    vx: 0, vy: 0,
    speed: 0,               // signed forward speed, for HUD and audio
    steer: 0,
    color: opts.color ?? pick(rng, CAR_COLORS),
    health: 100,            // bodywork; smoke below 45, heavy smoke below 20
    parked: !!opts.parked,
    police: !!opts.police,
    traffic: !!opts.traffic,
    driver: !!opts.traffic, // traffic cars are occupied; parked ones are not
    wp: null,               // traffic waypoint {x, y}
    dir: opts.dir ?? 0,     // traffic heading: 0 E, 1 S, 2 W, 3 N
    brake: 0,               // brake-light timer for rendering
    stuck: 0,
    dead: false,
  };
}

export function makePed(x, y, rng, opts = {}) {
  return {
    id: nextId++,
    kind: 'ped',
    x, y, angle: range(rng, 0, Math.PI * 2),
    vx: 0, vy: 0,
    shirt: pick(rng, PED_SHIRTS),
    pants: pick(rng, PED_PANTS),
    skin: pick(rng, ['#f2c79b', '#c98d5f', '#8a5a34', '#f7d7b0']),
    state: 'stroll',        // stroll | flee | down | passenger | greeter
    wp: null,
    downTimer: 0,
    fleeFrom: null,
    speed: range(rng, 52, 78),
    name: opts.name ?? null,
    dead: false,
  };
}

// Deterministic per-entity jitter stream (brake timing, stroll pauses) that
// never touches the shared world stream.
export function entityRng(entity, salt) {
  return makeRng(entity.id * 1315423911 + salt * 2654435761);
}
