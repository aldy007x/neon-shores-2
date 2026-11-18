// audio.js — all sound is synthesised with WebAudio oscillators and noise;
// the game ships no audio files. The world talks to this through a narrow
// interface (setEngine, setSiren, blip, crash, ...) so a headless run can
// substitute the silent stub exported at the bottom.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenFlip = null;

  function ensure() {
    if (ctx) return true;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineOsc.connect(engineFilter).connect(engineGain).connect(master);
    engineOsc.start();

    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain).connect(master);
    sirenOsc.start();
    let high = false;
    sirenFlip = setInterval(() => {
      if (!ctx) return;
      high = !high;
      sirenOsc.frequency.setTargetAtTime(high ? 960 : 660, ctx.currentTime, 0.03);
    }, 380);
    return true;
  }

  function tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, delay = 0) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol = 0.25, freq = 900) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; },
    isMuted() { return muted; },
    // Continuous engine hum: speedRatio 0..1, silent when on foot.
    setEngine(speedRatio, driving) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      engineGain.gain.setTargetAtTime(driving && !muted ? 0.05 + speedRatio * 0.07 : 0, t, 0.09);
      engineOsc.frequency.setTargetAtTime(55 + speedRatio * 165, t, 0.06);
    },
    // Continuous siren bed: level 0..1 by nearest officer proximity.
    setSiren(level) {
      if (!ensure()) return;
      sirenGain.gain.setTargetAtTime(muted ? 0 : level * 0.055, ctx.currentTime, 0.15);
    },
    pickup() { tone(880, 0.09, 'square', 0.12); tone(1320, 0.12, 'square', 0.1, null, 0.07); },
    cash() { tone(1180, 0.07, 'square', 0.12); tone(1560, 0.1, 'square', 0.12, null, 0.06); },
    punch() { noise(0.08, 0.3, 500); tone(140, 0.08, 'sine', 0.25, 70); },
    crash(strength = 1) { noise(0.16 + strength * 0.12, 0.2 + strength * 0.25, 700); tone(90, 0.2, 'sine', 0.3, 45); },
    door() { tone(220, 0.06, 'square', 0.1, 160); noise(0.05, 0.08, 1200); },
    cone() { tone(500, 0.06, 'square', 0.1, 300); },
    jingle() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'triangle', 0.16, null, i * 0.09)); },
    fail() { tone(320, 0.22, 'sawtooth', 0.14, 130); tone(210, 0.3, 'sawtooth', 0.12, 90, 0.16); },
    sirenSting() { tone(660, 0.14, 'triangle', 0.14); tone(960, 0.14, 'triangle', 0.14, null, 0.15); },
    dispose() { if (sirenFlip) clearInterval(sirenFlip); if (ctx) ctx.close(); },
  };
}

// Drop-in replacement with the same shape, for headless simulation.
export function silentAudio() {
  const noop = () => {};
  return {
    unlock: noop, setMuted: noop, isMuted: () => false,
    setEngine: noop, setSiren: noop,
    pickup: noop, cash: noop, punch: noop, crash: noop, door: noop,
    cone: noop, jingle: noop, fail: noop, sirenSting: noop, dispose: noop,
  };
}
