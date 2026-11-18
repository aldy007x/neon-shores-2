// Neon Shores — hand-in program for the make.fun gta6-01 bounty.
//
// The game itself is the static site under game/ (open game/index.html in a
// browser and play; there is no build step). This program's job is to hand
// it in honestly: audit game/ and screenshots/ against the scorer's caps
// first and refuse, naming the problem, rather than ship an entry the gate
// would turn away; then copy both trees to the output directory and write
// dossier.json with the kit's buildDossier, so the dossier is byte for byte
// the one the scorer rebuilds.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// MAKEFUN_OUTPUT_DIR stands in for /output outside the grader.

import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const CAPS = {
  gameMaxEntries: 993,
  gameMaxBytes: 48 * 1024 * 1024,
  gamePathMaxBytes: 1000,
  indexMaxBytes: 1024 * 1024,
  shotsMax: 4,
  shotMaxBytes: 256 * 1024,
  dossierMaxBytes: Math.floor(1.5 * 1024 * 1024),
  textMaxBytes: 163840,
};

const root = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const problems = [];

function auditTree(dir, label) {
  let entries = 0;
  let bytes = 0;
  const walk = (current) => {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      const rel = relative(dir, full).split(sep).join('/');
      const st = lstatSync(full);
      entries += 1;
      if (st.isSymbolicLink()) {
        problems.push(`${label}: "${rel}" is a symlink; the gate takes plain files and directories only`);
        continue;
      }
      if (Buffer.byteLength(rel, 'utf8') > CAPS.gamePathMaxBytes) {
        problems.push(`${label}: path "${rel}" runs past ${CAPS.gamePathMaxBytes} UTF-8 bytes`);
      }
      if (st.isDirectory()) walk(full);
      else bytes += st.size;
    }
  };
  walk(dir);
  return { entries, bytes };
}

function audit() {
  const gameDir = join(root, 'game');
  if (!existsSync(join(gameDir, 'index.html'))) {
    problems.push('game: index.html is missing; the game cannot be entered without it');
    return;
  }
  const indexBytes = statSync(join(gameDir, 'index.html')).size;
  if (indexBytes > CAPS.indexMaxBytes) {
    problems.push(`game: index.html is ${indexBytes} bytes, over the ${CAPS.indexMaxBytes}-byte cap`);
  }
  const game = auditTree(gameDir, 'game');
  if (game.entries > CAPS.gameMaxEntries) {
    problems.push(`game: ${game.entries} entries, over the ${CAPS.gameMaxEntries}-entry cap`);
  }
  if (game.bytes > CAPS.gameMaxBytes) {
    problems.push(`game: ${game.bytes} bytes of files, over the ${CAPS.gameMaxBytes}-byte cap`);
  }

  const shotsDir = join(root, 'screenshots');
  const shots = existsSync(shotsDir)
    ? readdirSync(shotsDir).filter((n) => !n.startsWith('.'))
    : [];
  if (shots.length > CAPS.shotsMax) {
    problems.push(`screenshots: ${shots.length} images, over the ${CAPS.shotsMax}-image cap`);
  }
  for (const name of shots) {
    const size = statSync(join(shotsDir, name)).size;
    if (size > CAPS.shotMaxBytes) {
      problems.push(`screenshots: "${name}" is ${size} bytes, over the ${CAPS.shotMaxBytes}-byte cap`);
    }
  }
  return game;
}

const gameStats = audit();
if (problems.length > 0) {
  for (const p of problems) console.error(`refusing to hand in: ${p}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
cpSync(join(root, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(root, 'screenshots'))) {
  cpSync(join(root, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

const dossier = buildDossier(outDir, {
  text_max_bytes: CAPS.textMaxBytes,
  screenshots: { max: CAPS.shotsMax, max_bytes: CAPS.shotMaxBytes },
  game_max_files: CAPS.gameMaxEntries,
  game_max_bytes: CAPS.gameMaxBytes,
  game_path_max_bytes: CAPS.gamePathMaxBytes,
});
if (Buffer.byteLength(dossier, 'utf8') > CAPS.dossierMaxBytes) {
  console.error(`refusing to hand in: dossier.json would run past ${CAPS.dossierMaxBytes} bytes`);
  process.exit(1);
}
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`handed in: game/ ${gameStats.entries} entries, ${gameStats.bytes} bytes; dossier.json ${Buffer.byteLength(dossier, 'utf8')} bytes -> ${outDir}`);
