// missions.js — Dario Venn's six jobs, in order, plus the Rampage cone
// challenge in the south-west car park. A mission is a small state object on
// the game state; this module starts, steps and settles them. All money
// flows through g.earn so the totals on the CITY CLEARED panel are exact.

import { MISSION_PAY, FARE_TIP, RAMPAGE } from './config.js';

export const MISSION_DEFS = [
  { id: 'hot-package', title: 'Hot Package', brief: 'Take the package to the Neon Tower. Fast. The clock is already running.' },
  { id: 'fare-play', title: 'Fare Play', brief: 'A fare is waiting at Port Azura Mall. Pick her up, drop her at the Azura Grand Hotel.' },
  { id: 'cool-down', title: 'Cool Down', brief: 'You are hot — three stars hot. Break their line of sight and let it all cool down.' },
  { id: 'grand-tour', title: 'Grand Tour', brief: 'Casino, Mall, Neon Tower — three stops, one clock. Show the city what fast looks like.' },
  { id: 'harbour-run', title: 'Harbour Run', brief: 'Three crates walked off a boat. Collect them from the pier and beach, deliver to the Harbour Docks Warehouse — and the harbour patrol will notice.' },
  { id: 'neon-finale', title: 'Neon Finale', brief: 'The long way home: Lighthouse, Casino, Mall, Neon Tower, Hospital, then back to my corner. The whole city will be watching by the end.' },
];

function landmark(g, kind) {
  return g.city.landmarks.find((l) => l.kind === kind);
}

export function startNextMission(g) {
  const index = g.nextMission;
  if (index >= MISSION_DEFS.length) return false;
  const def = MISSION_DEFS[index];
  const m = { index, id: def.id, title: def.title, timer: null, phase: 'main', checkpoints: [], cpIndex: 0, crates: 0 };
  g.mission = m;
  g.heatFloor = 0;

  if (def.id === 'hot-package') {
    const t = landmark(g, 'tower');
    m.objective = { x: t.x, y: t.y, label: 'Deliver to the Neon Tower' };
    m.timer = 90;
  } else if (def.id === 'fare-play') {
    const mall = landmark(g, 'mall');
    m.passenger = g.spawnPassenger(mall.x + 30, mall.y + 16);
    m.objective = { x: m.passenger.x, y: m.passenger.y, label: 'Pick up the fare at the Mall' };
    m.phase = 'pickup';
  } else if (def.id === 'cool-down') {
    g.addHeat(110, 'The job starts hot');
    m.objective = null;
  } else if (def.id === 'grand-tour') {
    m.checkpoints = ['casino', 'mall', 'tower'].map((k) => {
      const l = landmark(g, k);
      return { x: l.x, y: l.y, name: l.name };
    });
    m.timer = 150;
    m.objective = { ...m.checkpoints[0], label: `Checkpoint: ${m.checkpoints[0].name}` };
  } else if (def.id === 'harbour-run') {
    m.crateStates = g.city.crates.map((c) => ({ ...c, taken: false }));
    m.objective = { ...m.crateStates[0], label: 'Collect the crates (0/3)' };
  } else if (def.id === 'neon-finale') {
    const seq = [
      { x: 3500, y: 1800, name: 'Lighthouse Point' },
      ...['casino', 'mall', 'tower', 'hospital'].map((k) => {
        const l = landmark(g, k);
        return { x: l.x, y: l.y, name: l.name };
      }),
      { x: g.city.dario.x, y: g.city.dario.y, name: "Dario's Corner" },
    ];
    m.checkpoints = seq;
    m.timer = 240;
    m.objective = { ...seq[0], label: `Checkpoint: ${seq[0].name}` };
  }
  g.toast(`${def.title} — ${def.brief}`, 6);
  return true;
}

export function missionObjective(g) {
  if (g.rampage && g.rampage.active) return null;
  return g.mission ? g.mission.objective : null;
}

function reach(g, obj, radius) {
  if (!obj) return false;
  const dx = g.focusX - obj.x;
  const dy = g.focusY - obj.y;
  return dx * dx + dy * dy <= radius * radius;
}

function completeMission(g) {
  const m = g.mission;
  const pay = MISSION_PAY[m.index];
  g.earn(pay, `${m.title} complete`);
  g.jobs += 1;
  g.nextMission += 1;
  g.mission = null;
  g.heatFloor = 0;
  g.audio.jingle();
  if (g.nextMission >= MISSION_DEFS.length) {
    g.cityCleared = true;
    g.saveGame();
    g.toast('CITY CLEARED — Port Azura is yours.', 8);
  } else {
    g.toast('Job done. Dario has more work when you are ready.', 5);
  }
}

export function failMission(g, reason) {
  if (!g.mission) return;
  g.toast(`${g.mission.title} failed — ${reason}. See Dario to retry.`, 5);
  if (g.mission.passenger) g.dismissPassenger(g.mission.passenger);
  g.mission = null;
  g.heatFloor = 0;
  g.audio.fail();
}

// Busted or wasted mid-job: the job is blown.
export function onPlayerDown(g) {
  if (g.mission) failMission(g, 'you went down');
  if (g.rampage && g.rampage.active) endRampage(g, false);
}

export function updateMissions(g, dt) {
  const m = g.mission;
  if (!m) return;
  if (m.timer !== null) {
    m.timer -= dt;
    if (m.timer <= 0) {
      failMission(g, 'out of time');
      return;
    }
  }
  if (m.id === 'hot-package') {
    if (reach(g, m.objective, 64)) completeMission(g);
  } else if (m.id === 'fare-play') {
    if (m.phase === 'pickup') {
      m.objective.x = m.passenger.x;
      m.objective.y = m.passenger.y;
      // The fare boards only a stopped car that has pulled up close.
      if (g.player.car && Math.abs(g.player.car.speed) < 12 && reach(g, m.objective, 52)) {
        g.boardPassenger(m.passenger, g.player.car);
        m.phase = 'dropoff';
        const hotel = landmark(g, 'hotel');
        m.objective = { x: hotel.x, y: hotel.y, label: 'Drop her at the Azura Grand Hotel' };
        g.toast('Fare aboard. Azura Grand Hotel — and make it smooth.', 4);
      }
    } else if (m.phase === 'dropoff') {
      if (g.player.car && reach(g, m.objective, 66)) {
        const drop = { x: m.objective.x + 26, y: m.objective.y + 10 };
        g.leavePassenger(m.passenger, drop.x, drop.y);
        g.pickups.push({ x: drop.x + 14, y: drop.y + 6, amount: FARE_TIP, kind: 'tip', bob: 0 });
        completeMission(g);
      }
    }
  } else if (m.id === 'cool-down') {
    if (g.heat <= 0) completeMission(g);
  } else if (m.id === 'grand-tour' || m.id === 'neon-finale') {
    if (reach(g, m.objective, 70)) {
      g.audio.pickup();
      m.cpIndex += 1;
      if (m.id === 'neon-finale') {
        // The finale escalates: each leg raises the heat floor.
        const floors = [0, 25, 60, 110, 175, 175];
        g.heatFloor = floors[Math.min(m.cpIndex, floors.length - 1)];
        if (g.heat < g.heatFloor) g.addHeat(g.heatFloor - g.heat, 'The finale draws a crowd');
      }
      if (m.cpIndex >= m.checkpoints.length) {
        completeMission(g);
      } else {
        const cp = m.checkpoints[m.cpIndex];
        m.objective = { ...cp, label: `Checkpoint: ${cp.name}` };
        g.toast(`Checkpoint ${m.cpIndex}/${m.checkpoints.length} — ${cp.name} next.`, 3);
      }
    }
  } else if (m.id === 'harbour-run') {
    if (m.phase === 'main') {
      for (const crate of m.crateStates) {
        if (!crate.taken && reach(g, crate, 44)) {
          crate.taken = true;
          m.crates += 1;
          g.audio.pickup();
          if (m.crates === 1 && g.heat < 60) g.addHeat(60 - g.heat, 'Harbour patrol spotted you');
          g.heatFloor = 60;
          g.toast(`Crate ${m.crates}/3 aboard.`, 3);
        }
      }
      const next = m.crateStates.find((c) => !c.taken);
      if (next) {
        m.objective = { x: next.x, y: next.y, label: `Collect the crates (${m.crates}/3)` };
      } else {
        m.phase = 'deliver';
        m.objective = { x: g.city.warehouseDoor.x, y: g.city.warehouseDoor.y, label: 'Deliver to the Harbour Docks Warehouse' };
        g.toast('All three crates aboard. Get them to the warehouse.', 4);
      }
    } else if (m.phase === 'deliver') {
      if (reach(g, m.objective, 76)) completeMission(g);
    }
  }
}

// --- Rampage: flatten the cones in the marked car park against the clock. ---

export function updateRampage(g, dt) {
  const r = g.rampage;
  if (r.cooldown > 0) r.cooldown -= dt;
  if (!r.active) {
    // Driving into the zone in a car starts the clock.
    const zone = g.city.rampageZone;
    if (g.player.car && r.cooldown <= 0) {
      const dx = g.player.car.x - zone.x;
      const dy = g.player.car.y - zone.y;
      if (dx * dx + dy * dy < zone.r * zone.r) startRampage(g);
    }
    return;
  }
  r.timer -= dt;
  const car = g.player.car;
  if (car) {
    for (const cone of r.cones) {
      if (cone.down) continue;
      const dx = car.x - cone.x;
      const dy = car.y - cone.y;
      const rr = car.spec.radius + 9;
      if (dx * dx + dy * dy < rr * rr) {
        cone.down = true;
        r.left -= 1;
        g.earn(RAMPAGE.perCone, 'Cone down', true);
        g.audio.cone();
        if (r.left <= 0) {
          g.earn(RAMPAGE.clearBonus, 'Rampage cleared!');
          endRampage(g, true);
          return;
        }
      }
    }
  }
  if (r.timer <= 0) endRampage(g, false);
}

export function startRampage(g) {
  const zone = g.city.rampageZone;
  const cones = [];
  const rng = g.rng;
  for (let i = 0; i < RAMPAGE.cones; i++) {
    const a = (i / RAMPAGE.cones) * Math.PI * 2;
    const rad = 44 + (i % 3) * 26;
    cones.push({ x: zone.x + Math.cos(a) * rad + (rng() - 0.5) * 14, y: zone.y + Math.sin(a) * rad + (rng() - 0.5) * 14, down: false });
  }
  g.rampage = { active: true, timer: RAMPAGE.duration, cones, left: RAMPAGE.cones, cooldown: 0 };
  g.toast('RAMPAGE! Flatten every cone before the clock runs out!', 4);
  g.audio.sirenSting();
}

export function endRampage(g, cleared) {
  g.rampage.active = false;
  g.rampage.cooldown = RAMPAGE.cooldown;
  g.toast(cleared ? 'Rampage cleared — the car park is yours.' : 'Rampage over. The cones forgive you. Eventually.', 4);
}
