// city.js — Port Azura, generated from one seed: a grid of avenues, city
// blocks with buildings, parks, car parks, a beach, the sea and a pier.
// Everything the world and the renderer need to know about the static city
// comes from the object built here; nothing else hard-codes the layout.

import { WORLD } from './config.js';
import { makeRng, range, rangeInt, pick, hashText } from './random.js';

const ROOF_SHADES = ['#4a4f58', '#54484a', '#46525a', '#584f43', '#4d4457', '#3f4a44', '#5a4a52'];
const NEON_ACCENTS = ['#ff5da2', '#39d0ff', '#ffd23e', '#7dff6a', '#c792ff', '#ff8a5c'];

// Landmark blocks are addressed by block indices (i grows east, j south).
// Each entry: block, name, kind, and where its sign/door sits in the block.
const LANDMARK_BLOCKS = [
  { i: 2, j: 2, name: 'Neon Tower', kind: 'tower' },
  { i: 1, j: 4, name: 'Azura Grand Hotel', kind: 'hotel' },
  { i: 4, j: 1, name: 'Port Azura Mall', kind: 'mall' },
  { i: 6, j: 2, name: 'City Hospital', kind: 'hospital' },
  { i: 3, j: 6, name: 'Police HQ', kind: 'police' },
  { i: 7, j: 7, name: 'Harbour Docks Warehouse', kind: 'warehouse' },
  { i: 7, j: 3, name: 'Oceanview Casino', kind: 'casino' },
  { i: 4, j: 4, name: 'Central Park Pavilion', kind: 'pavilion' },
  { i: 1, j: 7, name: "Dario's Corner", kind: 'fixer' },
  { i: 8, j: 4, name: 'Beachfront Arcade', kind: 'arcade' },
];

const PARK_BLOCKS = new Set(['4,4', '1,6', '6,5']);
const CARPARK_BLOCKS = new Set(['2,7', '7,1', '0,3']);

export function buildCity(seed = 1) {
  const rng = makeRng(seed * 7919 + 13);
  const size = WORLD.size;
  const lines = [];
  for (let k = 0; k < 9; k++) lines.push(180 + k * WORLD.block);

  const buildings = [];
  const parks = [];
  const carParks = [];
  const trees = [];
  const landmarks = [];

  const blockRect = (i, j) => {
    const x0 = lines[i] + WORLD.roadHalf + 10;
    const y0 = lines[j] + WORLD.roadHalf + 10;
    const x1 = (i + 1 < lines.length ? lines[i + 1] : WORLD.beachX - 60) - WORLD.roadHalf - 10;
    const y1 = (j + 1 < lines.length ? lines[j + 1] : size - 120) - WORLD.roadHalf - 10;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };

  const landmarkAt = (i, j) => LANDMARK_BLOCKS.find((l) => l.i === i && l.j === j);

  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      const rect = blockRect(i, j);
      const key = `${i},${j}`;
      const lm = landmarkAt(i, j);
      if (PARK_BLOCKS.has(key)) {
        parks.push({ ...rect, name: key === '4,4' ? 'Central Park' : 'Pocket Park' });
        const n = rangeInt(rng, 6, 10);
        for (let t = 0; t < n; t++) {
          trees.push({ x: rect.x + range(rng, 18, rect.w - 18), y: rect.y + range(rng, 18, rect.h - 18), r: range(rng, 13, 22) });
        }
        if (lm) {
          // The pavilion sits in the middle of Central Park, walkable around.
          const w = 92; const h = 64;
          const b = { x: rect.x + (rect.w - w) / 2, y: rect.y + (rect.h - h) / 2, w, h, roof: '#6b5636', accent: '#ffd23e', winSeed: hashText(lm.name), landmark: lm.name, kind: lm.kind };
          buildings.push(b);
          landmarks.push({ name: lm.name, kind: lm.kind, x: b.x + w / 2, y: b.y + h + 26, building: b });
        }
        continue;
      }
      if (CARPARK_BLOCKS.has(key)) {
        carParks.push({ ...rect, spots: makeParkingSpots(rect, rng) });
        continue;
      }
      if (lm) {
        const pad = 26;
        const b = {
          x: rect.x + pad, y: rect.y + pad, w: rect.w - pad * 2, h: rect.h - pad * 2,
          roof: pick(rng, ROOF_SHADES), accent: pick(rng, NEON_ACCENTS),
          winSeed: hashText(lm.name), landmark: lm.name, kind: lm.kind,
        };
        buildings.push(b);
        landmarks.push({ name: lm.name, kind: lm.kind, x: b.x + b.w / 2, y: b.y + b.h + 24, building: b });
        continue;
      }
      // Ordinary block: one to four buildings with alleys between them.
      const layout = pick(rng, ['quad', 'quad', 'pair-h', 'pair-v', 'single']);
      const gap = 16;
      const addBuilding = (x, y, w, h) => {
        buildings.push({
          x, y, w, h,
          roof: pick(rng, ROOF_SHADES), accent: rng() < 0.4 ? pick(rng, NEON_ACCENTS) : null,
          winSeed: rangeInt(rng, 1, 1e9), landmark: null, kind: 'block',
        });
      };
      if (layout === 'single') {
        addBuilding(rect.x + 14, rect.y + 14, rect.w - 28, rect.h - 28);
      } else if (layout === 'pair-h') {
        const w = (rect.w - gap) / 2;
        addBuilding(rect.x, rect.y + 8, w, rect.h - 16);
        addBuilding(rect.x + w + gap, rect.y + 8, w, rect.h - 16);
      } else if (layout === 'pair-v') {
        const h = (rect.h - gap) / 2;
        addBuilding(rect.x + 8, rect.y, rect.w - 16, h);
        addBuilding(rect.x + 8, rect.y + h + gap, rect.w - 16, h);
      } else {
        const w = (rect.w - gap) / 2;
        const h = (rect.h - gap) / 2;
        addBuilding(rect.x, rect.y, w, h);
        addBuilding(rect.x + w + gap, rect.y, w, h);
        addBuilding(rect.x, rect.y + h + gap, w, h);
        addBuilding(rect.x + w + gap, rect.y + h + gap, w, h);
      }
    }
  }

  // The lighthouse stands at the pier's end, in the sea: a landmark you can
  // walk to but never drive through.
  const lighthouse = { x: WORLD.pierX1 - 26, y: WORLD.pierY - 17, w: 34, h: 34, roof: '#c8c2b4', accent: '#ff5d5d', winSeed: hashText('Lighthouse Point'), landmark: 'Lighthouse Point', kind: 'lighthouse' };
  buildings.push(lighthouse);
  landmarks.push({ name: 'Lighthouse Point', kind: 'lighthouse', x: lighthouse.x + 17, y: lighthouse.y + 62, building: lighthouse });

  const byKind = (kind) => landmarks.find((l) => l.kind === kind);
  const hospital = byKind('hospital');
  const police = byKind('police');
  const warehouse = byKind('warehouse');
  const fixer = byKind('fixer');

  const city = {
    size,
    lines,
    buildings,
    parks,
    carParks,
    trees,
    landmarks,
    spawn: { x: fixer.x - 66, y: fixer.y + 8 },
    dario: { x: fixer.x - 40, y: fixer.y + 8, name: 'Dario Venn' },
    hospitalDoor: { x: hospital.x, y: hospital.y + 6 },
    policeDoor: { x: police.x, y: police.y + 6 },
    warehouseDoor: { x: warehouse.x - 30, y: warehouse.y },
    crates: [
      { x: WORLD.pierX0 + 60, y: WORLD.pierY - 60 },
      { x: WORLD.pierX1 - 90, y: WORLD.pierY + 44 },
      { x: WORLD.beachX + 70, y: WORLD.pierY - 330 },
    ],
    rampageZone: null, // filled below, once car parks exist
    junctions: [],
  };
  for (const x of lines) for (const y of lines) city.junctions.push({ x, y });

  // The Rampage lives in the south-west car park, over by Dario's corner.
  const rampagePark = carParks.reduce((a, b) => (b.y > a.y ? b : a));
  city.rampageZone = { x: rampagePark.x + rampagePark.w / 2, y: rampagePark.y + rampagePark.h / 2, r: 120, park: rampagePark };

  city.surfaceAt = (x, y) => surfaceAt(city, x, y);
  city.collideCircle = (pos, r) => collideCircle(city, pos, r);
  city.pointSolid = (x, y) => pointSolid(city, x, y);
  return city;
}

function makeParkingSpots(rect, rng) {
  const spots = [];
  const rows = 2;
  for (let row = 0; row < rows; row++) {
    const y = rect.y + 44 + row * 92;
    for (let x = rect.x + 34; x < rect.x + rect.w - 30; x += 56) {
      if (rng() < 0.55) spots.push({ x, y, angle: Math.PI / 2, cls: pick(rng, ['compact', 'sedan', 'sedan', 'sports']) });
    }
  }
  return spots;
}

export function surfaceAt(city, x, y) {
  if (x < 0 || y < 0 || x >= city.size || y >= city.size) return 'sea';
  const onPier = x >= WORLD.pierX0 && x <= WORLD.pierX1 && Math.abs(y - WORLD.pierY) <= WORLD.pierHalf;
  if (onPier) return 'pier';
  if (x >= WORLD.seaX) return 'sea';
  if (x >= WORLD.beachX) return 'sand';
  for (const p of city.parks) if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return 'grass';
  for (const c of city.carParks) if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return 'carpark';
  const nearLine = (v) => city.lines.some((l) => Math.abs(v - l) <= WORLD.roadHalf);
  if (nearLine(x) || nearLine(y)) return 'road';
  const nearWalk = (v) => city.lines.some((l) => Math.abs(v - l) <= WORLD.roadHalf + 12);
  if (nearWalk(x) || nearWalk(y)) return 'sidewalk';
  return 'block';
}

function pointSolid(city, x, y) {
  for (const b of city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}

// Push a circle out of every building it overlaps and out of the sea (the
// pier deck and the beach are exempt). Returns true if anything pushed.
function collideCircle(city, pos, r) {
  let pushed = false;
  for (const b of city.buildings) {
    const nx = Math.max(b.x, Math.min(pos.x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(pos.y, b.y + b.h));
    const dx = pos.x - nx;
    const dy = pos.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      pushed = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * r;
        pos.y = ny + (dy / d) * r;
      } else {
        // Centre inside the rect: leave by the nearest face.
        const left = pos.x - b.x; const right = b.x + b.w - pos.x;
        const top = pos.y - b.y; const bottom = b.y + b.h - pos.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) pos.x = b.x - r;
        else if (m === right) pos.x = b.x + b.w + r;
        else if (m === top) pos.y = b.y - r;
        else pos.y = b.y + b.h + r;
      }
    }
  }
  const onPier = pos.x >= WORLD.pierX0 && pos.x <= WORLD.pierX1 && Math.abs(pos.y - WORLD.pierY) <= WORLD.pierHalf;
  if (!onPier && pos.x > WORLD.seaX - r) pos.x = WORLD.seaX - r;
  if (pos.x < r) pos.x = r;
  if (pos.y < r) pos.y = r;
  if (pos.y > city.size - r) pos.y = city.size - r;
  return pushed;
}
