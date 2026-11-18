// input.js — keyboard state for the browser shell. The world simulation only
// ever sees the plain snapshot object this module produces, which is what
// lets a headless harness drive the same world with scripted snapshots.

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  Space: 'handbrake',
  KeyE: 'interact',
  KeyF: 'punch',
  KeyM: 'mute',
  KeyP: 'pause', Escape: 'pause',
  Enter: 'confirm',
  KeyR: 'reset',
};

export function emptyInput() {
  return {
    up: false, down: false, left: false, right: false,
    sprint: false, handbrake: false,
    interact: false, punch: false, mute: false, pause: false, confirm: false, reset: false,
    interactPressed: false, punchPressed: false, mutePressed: false,
    pausePressed: false, confirmPressed: false, resetPressed: false,
  };
}

export function attachInput(target) {
  const held = emptyInput();
  const snap = emptyInput();

  target.addEventListener('keydown', (ev) => {
    const name = KEYMAP[ev.code];
    if (!name) return;
    if (name === 'up' || name === 'down' || name === 'left' || name === 'right' || name === 'handbrake') {
      ev.preventDefault();
    }
    if (!ev.repeat) {
      if (name === 'interact') snap.interactPressed = true;
      if (name === 'punch') snap.punchPressed = true;
      if (name === 'mute') snap.mutePressed = true;
      if (name === 'pause') snap.pausePressed = true;
      if (name === 'confirm') snap.confirmPressed = true;
      if (name === 'reset') snap.resetPressed = true;
    }
    held[name] = true;
  });

  target.addEventListener('keyup', (ev) => {
    const name = KEYMAP[ev.code];
    if (name) held[name] = false;
  });

  target.addEventListener('blur', () => {
    for (const k of Object.keys(held)) held[k] = false;
  });

  // Called once per frame by the shell: merges held keys with the edge
  // presses gathered since the last frame, then clears the edges.
  function snapshot() {
    for (const k of ['up', 'down', 'left', 'right', 'sprint', 'handbrake', 'interact', 'punch', 'mute', 'pause', 'confirm', 'reset']) {
      snap[k] = held[k];
    }
    const out = { ...snap };
    snap.interactPressed = false;
    snap.punchPressed = false;
    snap.mutePressed = false;
    snap.pausePressed = false;
    snap.confirmPressed = false;
    snap.resetPressed = false;
    return out;
  }

  return { snapshot };
}

// Build a snapshot by hand (used by staged scenes and the test harness).
export function scriptedInput(overrides = {}) {
  return { ...emptyInput(), ...overrides };
}
