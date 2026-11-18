// main.js — the browser shell: canvas, storage, input, the frame loop.
// Everything about the game itself lives in the modules; this file only
// wires them to the page. With ?shot=<name> in the URL it instead builds
// one staged scene, steps it a fixed number of times and renders one frame.

import { createGame, stepGame } from './world.js';
import { createAudio } from './audio.js';
import { attachInput, scriptedInput } from './input.js';
import { render, VIEW_W, VIEW_H } from './render.js';
import { beginShot, finishShot } from './shots.js';

const canvas = document.getElementById('game');
canvas.width = VIEW_W;
canvas.height = VIEW_H;
const ctx = canvas.getContext('2d');

const storage = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    } catch { /* private mode: play without saving */ }
  },
};

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || '1') || 1;
const audio = createAudio();
const game = createGame({ seed, storage, audio });
const input = attachInput(window);
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
window.addEventListener('keydown', () => audio.unlock(), { once: true });

const shot = params.get('shot');
if (shot) {
  beginShot(game, shot);
  const still = scriptedInput({});
  for (let i = 0; i < 18; i++) stepGame(game, 1 / 30, still);
  finishShot(game, shot);
  render(ctx, game);
  window.__NEON_SHOT__ = shot;
} else {
  let last = performance.now();
  let acc = 0;
  const DT = 1 / 60;
  function frame(now) {
    acc += Math.min(0.1, (now - last) / 1000);
    last = now;
    const snap = input.snapshot();
    while (acc >= DT) {
      stepGame(game, DT, snap);
      acc -= DT;
    }
    render(ctx, game);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
