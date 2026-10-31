// Sound effects made with the Web Audio API (no audio files to download).
import type { SoundName } from "@/lib/settings/settings";

let actx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!actx) {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      actx = new Ctx();
    } catch {
      return null;
    }
  }
  if (actx.state === "suspended") actx.resume().catch(() => {});
  return actx;
}

/** Browsers only allow sound after the player has touched the page. */
export function unlockAudioOnFirstTouch() {
  if (typeof document === "undefined") return;
  document.addEventListener("pointerdown", () => audio(), { passive: true });
}

interface ToneOpts {
  type?: OscillatorType;
  vol?: number;
  slide?: number;
  delay?: number;
}

function tone(freq: number, dur: number, o: ToneOpts = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + (o.delay || 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = o.type || "sine";
  osc.frequency.setValueAtTime(freq, t);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

function noise(dur: number, o: { vol?: number; delay?: number; freq?: number } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + (o.delay || 0);
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let k = 0; k < len; k++) d[k] = (Math.random() * 2 - 1) * Math.pow(1 - k / len, 2);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = o.freq || 2000;
  f.Q.value = 1.1;
  const g = a.createGain();
  g.gain.value = o.vol || 0.3;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

// ---------------------------------------------------------------- dice on a wooden plate
let plate: { input: GainNode } | null = null;

/**
 * A short wooden "body": everything for the dice goes through a little
 * reverb made from a decaying burst, so knocks ring like a hollow wooden plate.
 */
function plateBus(a: AudioContext) {
  if (plate) return plate;
  const len = Math.floor(a.sampleRate * 0.22);
  const ir = a.createBuffer(2, len, a.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let k = 0; k < len; k++) d[k] = (Math.random() * 2 - 1) * Math.pow(1 - k / len, 3.2);
  }
  const conv = a.createConvolver();
  conv.buffer = ir;
  const tone = a.createBiquadFilter(); // wood is warm: soften the ring's highs
  tone.type = "lowpass";
  tone.frequency.value = 2400;
  const wet = a.createGain();
  wet.gain.value = 0.35;
  const input = a.createGain();
  input.connect(a.destination); // dry
  input.connect(conv).connect(tone).connect(wet).connect(a.destination);
  plate = { input };
  return plate;
}

/** One knock of the dice on wood: a hard edge click plus the plate's hollow "tok". `s` 0-1 = how hard. */
function woodKnock(a: AudioContext, out: AudioNode, t: number, s: number) {
  // the dice's edge: a few ms of bright noise
  const clickLen = Math.floor(a.sampleRate * 0.006);
  const cb = a.createBuffer(1, clickLen, a.sampleRate);
  const cd = cb.getChannelData(0);
  for (let k = 0; k < clickLen; k++) cd[k] = (Math.random() * 2 - 1) * (1 - k / clickLen);
  const click = a.createBufferSource();
  click.buffer = cb;
  const cf = a.createBiquadFilter();
  cf.type = "bandpass";
  cf.frequency.value = 2600 + Math.random() * 1600;
  cf.Q.value = 0.9;
  const cg = a.createGain();
  cg.gain.value = 0.55 * s;
  click.connect(cf).connect(cg).connect(out);
  click.start(t);
  // the wood answering: a few short, damped resonances (slightly different each knock)
  const modes = [
    [210, 0.11, 0.5],
    [470, 0.07, 0.32],
    [880, 0.045, 0.18],
  ];
  for (const [f0, decay, vol] of modes) {
    const o = a.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(f0 * (0.93 + Math.random() * 0.14), t);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * s * 0.6 + 0.0002, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay * (0.7 + s * 0.6));
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + decay * 1.4 + 0.05);
  }
}

/** The dice tumbling across the wood between knocks: a soft, low rattle. */
function woodRoll(a: AudioContext, out: AudioNode, t: number, dur: number, vol: number) {
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  // grainy: random little bumps, fading out as it slows down
  for (let k = 0; k < len; k++) d[k] = (Math.random() * 2 - 1) * (Math.random() < 0.08 ? 1 : 0.25) * Math.pow(1 - k / len, 1.5);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 650;
  f.Q.value = 0.8;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(out);
  src.start(t);
}

/**
 * A dice thrown onto a wooden plate, timed to the 0.82s dice animation: a
 * first hard knock, bounces getting quicker and softer, a rattle as it rolls,
 * and a last small settle-and-wobble as it comes to rest.
 */
function diceOnWood() {
  const a = audio();
  if (!a) return;
  const out = plateBus(a).input;
  const t0 = a.currentTime + 0.01;
  let t = t0;
  let gap = 0.17;
  let s = 1;
  while (t - t0 < 0.66) {
    woodKnock(a, out, t, s * (0.85 + Math.random() * 0.3));
    t += gap * (0.85 + Math.random() * 0.3);
    gap *= 0.8;
    s *= 0.78;
  }
  woodRoll(a, out, t0 + 0.04, 0.68, 0.16);
  // settles: a last clack and a tiny wobble
  woodKnock(a, out, t0 + 0.74, 0.42);
  woodKnock(a, out, t0 + 0.785, 0.16);
}

const SFX: Record<SoundName, () => void> = {
  dice() {
    diceOnWood();
  },
  move() {
    tone(700, 0.07, { type: "triangle", vol: 0.16 });
  },
  out() {
    tone(420, 0.18, { type: "square", vol: 0.07, slide: 940 });
  },
  capture() {
    tone(560, 0.32, { type: "sawtooth", vol: 0.1, slide: 110 });
    noise(0.16, { vol: 0.25, freq: 500 });
  },
  home() {
    [784, 988, 1319].forEach((f, k) => tone(f, 0.2, { vol: 0.14, delay: k * 0.09 }));
  },
  turn() {
    tone(880, 0.1, { vol: 0.1 });
    tone(1175, 0.15, { vol: 0.1, delay: 0.1 });
  },
  chat() {
    tone(1046, 0.08, { vol: 0.1 });
    tone(1568, 0.1, { vol: 0.08, delay: 0.06 });
  },
  win() {
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, k) => tone(f, 0.24, { type: "triangle", vol: 0.16, delay: k * 0.12 }));
  },
};

export function playSound(name: SoundName) {
  try {
    SFX[name]();
  } catch {
    /* sound is optional */
  }
}
