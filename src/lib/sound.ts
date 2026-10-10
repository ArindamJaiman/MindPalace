/**
 * Tiny Web Audio synth: every sound is generated on the fly, so there are no audio assets.
 * The AudioContext is created lazily on the first sound (which always follows a user gesture).
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let volume = 0.6;

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (!enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return { ctx, out: master! };
}

export function configureSound(on: boolean, vol: number) {
  enabled = on;
  volume = vol;
  if (master) master.gain.value = vol;
}

// C major pentatonic across a few octaves: every combo step sounds good together.
const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66];

function tone(
  freq: number,
  dur: number,
  { type = 'sine' as OscillatorType, gain = 0.3, attack = 0.005, slideTo = 0, delay = 0 } = {},
) {
  const a = audio();
  if (!a) return;
  const t0 = a.ctx.currentTime + delay;
  const osc = a.ctx.createOscillator();
  const g = a.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, { gain = 0.2, freq = 2000, q = 1, delay = 0 } = {}) {
  const a = audio();
  if (!a) return;
  const t0 = a.ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(a.ctx.sampleRate * dur));
  const buf = a.ctx.createBuffer(1, len, a.ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.ctx.createBufferSource();
  src.buffer = buf;
  const filter = a.ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = a.ctx.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(a.out);
  src.start(t0);
}

export const sfx = {
  /** Bubble pop — slightly random pitch so repeated pops never sound identical. */
  pop(pitch = 1) {
    const f = (500 + Math.random() * 250) * pitch;
    tone(f, 0.09, { type: 'sine', gain: 0.35, slideTo: f * 0.45 });
    noise(0.03, { gain: 0.12, freq: 3000, q: 0.8 });
  },
  click() {
    noise(0.018, { gain: 0.25, freq: 4200, q: 2 });
    tone(1800, 0.025, { type: 'square', gain: 0.04 });
  },
  softClick() {
    noise(0.012, { gain: 0.08, freq: 5000, q: 2 });
  },
  tick() {
    tone(2400, 0.015, { type: 'triangle', gain: 0.06 });
  },
  toggle(on: boolean) {
    noise(0.02, { gain: 0.3, freq: on ? 3200 : 2200, q: 3 });
    tone(on ? 900 : 600, 0.04, { type: 'square', gain: 0.05 });
  },
  thunk() {
    tone(180, 0.18, { type: 'sine', gain: 0.5, slideTo: 60 });
    noise(0.05, { gain: 0.15, freq: 800, q: 1 });
  },
  /** Task completion: climbs the pentatonic scale as your combo grows. */
  complete(combo = 1) {
    const i = Math.min(combo - 1, PENTA.length - 3);
    tone(130, 0.14, { type: 'sine', gain: 0.4, slideTo: 55 }); // low punch under the chime
    tone(PENTA[i] * 2, 0.35, { type: 'triangle', gain: 0.22 });
    tone(PENTA[i + 2] * 2, 0.45, { type: 'sine', gain: 0.14, delay: 0.06 });
    noise(0.04, { gain: 0.08, freq: 6000, q: 1 });
  },
  uncomplete() {
    tone(330, 0.15, { type: 'sine', gain: 0.12, slideTo: 220 });
  },
  levelUp() {
    [0, 2, 4, 5, 7].forEach((n, k) => tone(PENTA[n] * 2, 0.5, { type: 'triangle', gain: 0.18, delay: k * 0.08 }));
    tone(PENTA[9] * 2, 0.9, { type: 'sine', gain: 0.12, delay: 0.45 });
  },
  chime() {
    tone(PENTA[5] * 2, 0.6, { type: 'sine', gain: 0.15 });
    tone(PENTA[7] * 2, 0.8, { type: 'sine', gain: 0.1, delay: 0.1 });
  },
  whoosh() {
    noise(0.25, { gain: 0.15, freq: 900, q: 0.6 });
  },
  squish() {
    const f = 140 + Math.random() * 60;
    tone(f, 0.16, { type: 'sine', gain: 0.25, slideTo: f * 1.8 });
  },
  boing() {
    tone(220, 0.3, { type: 'sine', gain: 0.2, slideTo: 520 });
  },
  add() {
    tone(PENTA[4] * 2, 0.12, { type: 'triangle', gain: 0.12 });
    tone(PENTA[6] * 2, 0.16, { type: 'triangle', gain: 0.1, delay: 0.05 });
  },

  /* ---- terminal edition: retro square-wave console sounds ---- */
  /** Mechanical keyboard tick for typing in the shell. */
  key() {
    noise(0.012, { gain: 0.12, freq: 3500 + Math.random() * 1500, q: 4 });
  },
  /** "ACCESS GRANTED": two-tone square chirp that climbs with the combo, over a low thump. */
  granted(combo = 1) {
    const i = Math.min(combo - 1, PENTA.length - 3);
    tone(110, 0.12, { type: 'sine', gain: 0.4, slideTo: 50 });
    tone(PENTA[i] * 2, 0.07, { type: 'square', gain: 0.07 });
    tone(PENTA[i + 2] * 2, 0.12, { type: 'square', gain: 0.07, delay: 0.07 });
    noise(0.03, { gain: 0.1, freq: 5000, q: 2 });
  },
  denied() {
    tone(160, 0.09, { type: 'square', gain: 0.09 });
    tone(120, 0.16, { type: 'square', gain: 0.09, delay: 0.1 });
  },
  boot() {
    [0, 2, 4].forEach((n, k) => tone(PENTA[n] * 2, 0.06, { type: 'square', gain: 0.05, delay: k * 0.06 }));
  },
  /** Modem-ish rank-up arpeggio. */
  rankUp() {
    [0, 4, 7, 9, 11].forEach((n, k) => tone(PENTA[Math.min(n, PENTA.length - 1)] * 2, 0.09, { type: 'square', gain: 0.06, delay: k * 0.07 }));
    tone(65, 0.5, { type: 'sawtooth', gain: 0.12, slideTo: 40, delay: 0.35 });
  },
  glitch() {
    noise(0.08, { gain: 0.18, freq: 1200 + Math.random() * 3000, q: 0.5 });
  },
  delete() {
    tone(400, 0.12, { type: 'triangle', gain: 0.1, slideTo: 200 });
  },
};

/** A continuous hum whose pitch/volume follow a speed value (used by the fidget spinner). */
export function createWhir() {
  let osc: OscillatorNode | null = null;
  let lfo: OscillatorNode | null = null;
  let g: GainNode | null = null;
  return {
    update(speed: number) {
      const a = audio();
      if (!a) return;
      if (!osc) {
        osc = a.ctx.createOscillator();
        osc.type = 'sawtooth';
        lfo = a.ctx.createOscillator();
        const lfoGain = a.ctx.createGain();
        lfoGain.gain.value = 8;
        lfo.connect(lfoGain).connect(osc.frequency);
        const filter = a.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 600;
        g = a.ctx.createGain();
        g.gain.value = 0;
        osc.connect(filter).connect(g).connect(a.out);
        osc.start();
        lfo.start();
      }
      const t = a.ctx.currentTime;
      osc.frequency.setTargetAtTime(40 + speed * 4, t, 0.05);
      lfo!.frequency.setTargetAtTime(Math.max(1, speed / 6), t, 0.05);
      g!.gain.setTargetAtTime(Math.min(0.06, speed / 1500), t, 0.08);
    },
    stop() {
      try {
        osc?.stop();
        lfo?.stop();
      } catch {
        /* already stopped */
      }
      osc = lfo = null;
      g = null;
    },
  };
}
