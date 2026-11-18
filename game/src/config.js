// config.js — every tunable number for Neon Shores lives here so the rest of
// the code reads as rules rather than magic constants. World units are pixels;
// the city is a square of WORLD.size with the sea along its eastern edge.

export const WORLD = {
  size: 3600,
  block: 360,          // distance between road centrelines
  roadHalf: 46,        // half the width of a road
  laneOffset: 23,      // right-hand traffic lane offset from a centreline
  beachX: 3230,        // sand starts here
  seaX: 3410,          // open water starts here
  pierX0: 3230,        // pier deck spans from the beach into the sea
  pierX1: 3560,
  pierY: 1800,         // pier centreline (a horizontal road line)
  pierHalf: 34,
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 168,
  sprintSpeed: 268,
  startCash: 250,
  maxHealth: 100,
  punchRange: 34,
  punchCooldown: 0.38,
};

// Heat is a points pool; stars are thresholds over it. Crimes add points,
// silence lets them drain away.
export const HEAT = {
  starThresholds: [0, 25, 60, 110, 175, 260],
  policePerStar: [0, 1, 2, 3, 5, 7],
  crimes: {
    theft: 40,
    assault: 30,
    hitAndRun: 85,
    ramPolice: 110,
    ramCivilian: 18,
    cone: 4,
  },
  decayPerSecond: 7,
  decayGrace: 3.5,     // seconds unseen before decay starts
  sightRange: 430,     // how far a witness or officer can see the player
  bustFillTime: 2.6,   // seconds cornered at low speed to fill the bust meter
  bustFine: 150,
  wastedFine: 100,
};

// Three vehicle classes with distinct handling. topSpeed/accel in px units,
// grip is lateral velocity kept per second while cornering, driftGrip is the
// same while the handbrake is held (lower = looser tail).
export const VEHICLE_CLASSES = {
  compact: { label: 'Compact', topSpeed: 335, reverseSpeed: 110, accel: 300, brake: 520, turnRate: 3.1, grip: 9.5, driftGrip: 4.2, radius: 17, length: 38, width: 20 },
  sedan:   { label: 'Sedan',   topSpeed: 395, reverseSpeed: 125, accel: 340, brake: 580, turnRate: 2.8, grip: 10.5, driftGrip: 4.8, radius: 19, length: 44, width: 22 },
  sports:  { label: 'Sports',  topSpeed: 480, reverseSpeed: 140, accel: 430, brake: 640, turnRate: 3.4, grip: 8.0, driftGrip: 2.6, radius: 19, length: 46, width: 22 },
};

export const TRAFFIC = { carCount: 26, pedCount: 22, cruiseSpeed: 150 };

export const DAY = { cycleSeconds: 260, startPhase: 0.32 }; // 0 = dawn, 0.5 = dusk

export const RAMPAGE = {
  duration: 45,
  cones: 12,
  perCone: 15,
  clearBonus: 100,
  cooldown: 20,
};

// Mission payouts, in sequence order. The end-of-game panel and the staged
// "end" screenshot both derive from these numbers, so the cash math always
// agrees: start 250 + 300 + 250 + 40 tip + 400 + 500 + 600 + 800 = 3140.
export const MISSION_PAY = [300, 250, 400, 500, 600, 800];
export const FARE_TIP = 40;

export const SAVE_KEY = 'neon-shores-save-v2';

export const COLORS = {
  road: '#33373f',
  roadEdge: '#26292f',
  laneMark: '#d8c95a',
  sidewalk: '#565b63',
  block: '#3d4148',
  grass: '#3f7a44',
  sand: '#d9bd7f',
  sea: '#175d7d',
  seaDeep: '#0f4258',
  pier: '#8a6b45',
  night: '#0a1030',
};
