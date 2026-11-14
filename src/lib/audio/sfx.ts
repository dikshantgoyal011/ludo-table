// Sound effects made with the Web Audio API (the dice uses small recordings in public/sounds).
import type { SoundName } from "@/lib/settings/settings";

let actx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!actx || actx.state === "closed") {
    // Not before the page may play sound: Chrome never lets a sound output made too early start
    // (on a phone the first touch only allows sound when the finger lifts).
    if (!soundAllowed()) return null;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      actx = new Ctx();
    } catch {
      return null;
    }
  }
  // Not only "suspended": iPhones put it "interrupted" when the phone's audio changes (a call, the microphone).
  if (actx.state !== "running") actx.resume().catch(() => {});
  return actx;
}

/** Whether the player has touched the page yet (where the browser says). */
export function soundAllowed() {
  return typeof navigator === "undefined" || !navigator.userActivation || navigator.userActivation.hasBeenActive;
}

/**
 * Start the sound without waiting for a touch, where the browser allows it (it
 * does for sites people come back to and play on; never on a first visit).
 * Resolves true when sound is running.
 */
export async function tryAutoplay(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (actx && actx.state === "running") return true;
  if (soundAllowed()) return !!audio();
  const policy = (navigator as Navigator & { getAutoplayPolicy?: (t: string) => string }).getAutoplayPolicy?.("audiocontext");
  if (policy === "disallowed") return false;
  let a: AudioContext;
  try {
    a = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  } catch {
    return false;
  }
  if (a.state !== "running") await Promise.race([a.resume().catch(() => {}), new Promise((r) => setTimeout(r, 400))]);
  // Not allowed: drop this one (one made too early never starts later) and wait for a touch.
  if (a.state !== "running" || (actx && actx.state !== "closed")) {
    void a.close().catch(() => {});
    return a.state === "running" && actx?.state === "running";
  }
  actx = a;
  return true;
}

/** The shared audio output (the music plays through it too); null where there's no sound. */
export const audioContext = audio;

/**
 * The phone's audio changed (the microphone closed, earphones came or went):
 * start the sounds afresh. On some phones the old sound output stays silent
 * after such a change until the page is reloaded.
 */
export function resetSoundOutput() {
  const old = actx;
  actx = null;
  void old?.close().catch(() => {});
}

/**
 * Events that let a page start sound. On a phone that's the end of a tap
 * (touchend, click), not its start: a pointerdown from a finger doesn't count.
 */
export const UNLOCK_EVENTS = ["pointerdown", "pointerup", "touchend", "click", "keydown"] as const;

/** Browsers only allow sound after the player has touched the page. */
export function unlockAudioOnFirstTouch() {
  if (typeof document === "undefined") return;
  let primed = false;
  const unlock = () => {
    const a = audio();
    if (!a) return;
    if (!primed) {
      primed = true;
      loadDice(a); // ready before the first roll
    }
    // iPhones: playing something (even silence) inside the tap is what opens the sound up.
    if (a.state !== "running") {
      const s = a.createBufferSource();
      s.buffer = a.createBuffer(1, 1, 22050);
      s.connect(a.destination);
      s.start();
    }
  };
  for (const ev of UNLOCK_EVENTS) document.addEventListener(ev, unlock, { passive: true, capture: true });
  // Back to the page (or earphones plugged in / out): wake the sounds up again.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && actx && actx.state !== "running") actx.resume().catch(() => {});
  });
  navigator.mediaDevices?.addEventListener?.("devicechange", () => resetSoundOutput());
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

/** A bell-like tone (FM): bright as it's struck, mellowing as it rings. */
function bell(freq: number, dur: number, o: { vol?: number; delay?: number; ratio?: number; index?: number } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + (o.delay || 0);
  const car = a.createOscillator();
  const mod = a.createOscillator();
  const depth = a.createGain();
  const g = a.createGain();
  car.frequency.value = freq;
  mod.frequency.value = freq * (o.ratio || 2);
  depth.gain.setValueAtTime(freq * (o.index || 1.2), t);
  depth.gain.exponentialRampToValueAtTime(freq * 0.05, t + dur * 0.6);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol || 0.1, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  mod.connect(depth).connect(car.frequency);
  car.connect(g).connect(a.destination);
  car.start(t);
  mod.start(t);
  car.stop(t + dur + 0.05);
  mod.stop(t + dur + 0.05);
}

// ---------------------------------------------------------------- cowries and long dice
// Small, hard things knocking together: a burst of filtered noise for the contact
// and a short ring for the body (porcelain-like for shells, bone for the long dice).
let noiseBuf: AudioBuffer | null = null;
function noiseOf(a: AudioContext) {
  if (!noiseBuf || noiseBuf.sampleRate !== a.sampleRate) {
    noiseBuf = a.createBuffer(1, Math.floor(a.sampleRate * 0.5), a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

interface KnockOpts {
  /** Contact noise: centre frequency, how narrow, how long */
  nf: number;
  nq?: number;
  nd: number;
  /** Body ring: its modes' frequencies (inharmonic, as in a real shell or bar) and how long */
  ring?: number[];
  rd?: number;
  vol: number;
  /** Panned left (-1) to right (1) */
  pan?: number;
}

function knock(t: number, o: KnockOpts) {
  const a = audio();
  if (!a) return;
  const out = a.createGain();
  out.gain.value = o.vol;
  let dest: AudioNode = a.destination;
  if (o.pan && a.createStereoPanner) {
    const p = a.createStereoPanner();
    p.pan.value = o.pan;
    p.connect(a.destination);
    dest = p;
  }
  out.connect(dest);
  const src = a.createBufferSource();
  src.buffer = noiseOf(a);
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = o.nf;
  f.Q.value = o.nq || 1.5;
  const ng = a.createGain();
  ng.gain.setValueAtTime(1, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + o.nd);
  src.connect(f).connect(ng).connect(out);
  src.start(t, Math.random() * 0.4, o.nd + 0.02);
  (o.ring || []).forEach((fr, k) => {
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.frequency.value = fr;
    const d = (o.rd || 0.03) / (1 + k * 0.7);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35 / (1 + k), t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + d + 0.02);
  });
}

const jit = (ms: number) => (Math.random() * 2 - 1) * ms;

/** A cowrie shell clicking: bright, glassy, tiny. */
function shell(t: number, vol: number, pan = 0) {
  const f = 2600 + Math.random() * 1400;
  knock(t, { nf: f * 1.4, nq: 3, nd: 0.012, ring: [f, f * 2.31], rd: 0.035, vol, pan });
}

/**
 * Cowries (timed to the throw in cowries.tsx, DICE_ROLL_MS long): a shake in the
 * hand, the shells landing one after another (68% of the throw, 30 ms apart) with a
 * soft tap on the cloth, clicking into each other, a smaller bounce (89%), a settle.
 */
function cowrieThrow() {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + 0.01;
  const n = 6;
  for (let k = 0; k < 7; k++) shell(t0 + Math.random() * 0.11, 0.1 + Math.random() * 0.08, jit(0.3));
  for (let k = 0; k < n; k++) {
    const t = t0 + 0.558 + k * 0.03 + jit(6) / 1000;
    const pan = (k / (n - 1) - 0.5) * 0.7;
    knock(t, { nf: 700, nq: 0.8, nd: 0.03, vol: 0.18, pan }); // on the cloth
    shell(t, 0.26 + Math.random() * 0.1, pan);
    if (Math.random() < 0.6) shell(t + 0.012 + Math.random() * 0.03, 0.1, pan); // knocking a neighbour
  }
  for (let k = 0; k < n; k++) {
    if (Math.random() < 0.3) continue;
    shell(t0 + 0.73 + k * 0.03 + jit(8) / 1000, 0.08 + Math.random() * 0.06, (k / (n - 1) - 0.5) * 0.7);
  }
  shell(t0 + 0.79 + Math.random() * 0.03, 0.05);
}

/** One long dice (bone): a lower, woodier knock with a short ring along the bar. */
function bar(t: number, k: number, vol: number, landing: boolean) {
  const f = [1180, 1290, 1240][k % 3] * (0.97 + Math.random() * 0.06);
  const pan = (k - 1) * 0.35;
  if (landing) knock(t, { nf: 380, nq: 0.7, nd: 0.06, ring: [170 + k * 12], rd: 0.07, vol: vol * 0.9, pan }); // the thud on the cloth
  knock(t + 0.004, { nf: 2200, nq: 1.2, nd: 0.018, ring: [f, f * 2.76, f * 5.4], rd: 0.06, vol, pan });
}

/**
 * Chaupar's two long dice (timed to pasa.tsx): knocked together in the hand,
 * landing one after another (70%, 40 ms apart) and rolling over on their long side
 * (two quieter knocks at 81–91% and 96%).
 */
function pasaThrow() {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + 0.01;
  bar(t0, 0, 0.16, false);
  bar(t0 + 0.05 + Math.random() * 0.02, 1, 0.13, false);
  for (let k = 0; k < 2; k++) {
    const t = t0 + 0.574 + k * 0.04 + jit(5) / 1000;
    bar(t, k, 0.3, true);
    bar(t0 + 0.746 + k * 0.04 + jit(8) / 1000, k, 0.13, false);
    if (Math.random() < 0.6) bar(t0 + 0.787 + k * 0.04 + jit(6) / 1000, k, 0.06, false);
  }
}

// ---------------------------------------------------------------- dice
// Built from real recordings (Kenney "Casino Audio", CC0) and timed to the dice animation (DICE_ROLL_MS):
// a rattle in the hand while it flies, a thud as it lands (394 ms), a smaller one on the bounce (656 ms),
// a tiny settle at the end. Each roll picks one at random, never the same twice in a row.
const DICE_FILES = [1, 2, 3].map((n) => `/sounds/dice-${n}.wav`);
let diceBufs: Promise<AudioBuffer[]> | null = null;
let lastDice = -1;

function loadDice(a: AudioContext): Promise<AudioBuffer[]> {
  if (!diceBufs) {
    diceBufs = Promise.all(
      DICE_FILES.map((f) =>
        fetch(f)
          .then((r) => r.arrayBuffer())
          .then((b) => new Promise<AudioBuffer>((ok, no) => a.decodeAudioData(b, ok, no)))
          .catch(() => null),
      ),
    ).then((l) => l.filter((b): b is AudioBuffer => !!b));
    diceBufs.then((l) => {
      if (!l.length) diceBufs = null; // try again next time (e.g. was offline)
    });
  }
  return diceBufs;
}

function diceRoll() {
  const a = audio();
  if (!a) return;
  loadDice(a).then((bufs) => {
    if (!bufs.length) return;
    let k = Math.floor(Math.random() * bufs.length);
    if (k === lastDice && bufs.length > 1) k = (k + 1) % bufs.length;
    lastDice = k;
    const src = a.createBufferSource();
    src.buffer = bufs[k];
    const g = a.createGain();
    g.gain.value = 0.8;
    src.connect(g).connect(a.destination);
    src.start();
  });
}
// ---------------------------------------------------------------- time running out
// The last five seconds of my turn: a soft wooden tock each second (a clock's, not an
// alarm's), with a quiet pitched tone under it that climbs a step each time (D, E,
// F#, A, B: a pentatonic run, so it never sounds sour against the music or the dice)
// and comes a little nearer. The last second ticks twice. Short and warm, never a buzzer.
// Someone else's turn (level + 10): the same, at about half the loudness and a fourth
// lower, so it's heard as theirs, not mine.
const TICK_NOTES = [587, 659, 740, 880, 988];
function timerTick(level: number) {
  const a = audio();
  if (!a) return;
  const theirs = level >= 10;
  const k = Math.max(0, Math.min(TICK_NOTES.length - 1, Math.round(theirs ? level - 10 : level)));
  const v = theirs ? 0.5 : 1;
  const pitch = theirs ? 0.75 : 1;
  const t = a.currentTime + 0.005;
  const tock = (at: number, vol: number) =>
    knock(at, { nf: (1500 + k * 160) * pitch, nq: 5, nd: 0.016, ring: [(480 + k * 36) * pitch, (1130 + k * 85) * pitch], rd: 0.055, vol: vol * v });
  tock(t, 0.16 + k * 0.03);
  tone(TICK_NOTES[k] * pitch, 0.16, { vol: (0.03 + k * 0.011) * v, delay: 0.004 });
  if (k === TICK_NOTES.length - 1) {
    tock(t + 0.17, 0.2);
    tone(TICK_NOTES[k] * 1.5 * pitch, 0.22, { vol: 0.05 * v, delay: 0.174 });
  }
}

const SFX: Record<SoundName, (arg?: number) => void> = {
  timer(level = 0) {
    timerTick(level);
  },
  dice() {
    diceRoll();
  },
  cowries() {
    cowrieThrow();
  },
  pasa() {
    pasaThrow();
  },
  move() {
    tone(700, 0.07, { type: "triangle", vol: 0.16 });
  },
  out() {
    tone(420, 0.18, { type: "square", vol: 0.07, slide: 940 });
  },
  // Safe: the piece settles, then a soft two-note chime (a fifth), like a shield closing.
  safe() {
    tone(330, 0.09, { type: "triangle", vol: 0.1 });
    bell(1046, 0.55, { vol: 0.07, delay: 0.03, ratio: 2, index: 0.9 });
    bell(1568, 0.7, { vol: 0.06, delay: 0.1, ratio: 2, index: 0.7 });
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
  /** Game on: two deep drum hits, a quick run up the bells and a bright chord ringing out (A major). */
  start() {
    const a = audio();
    if (!a) return;
    tone(110, 0.38, { vol: 0.42, slide: 52 });
    knock(a.currentTime, { nf: 180, nq: 1.2, nd: 0.08, ring: [98, 147], rd: 0.18, vol: 0.5 });
    tone(147, 0.4, { vol: 0.38, slide: 70, delay: 0.16 });
    knock(a.currentTime + 0.16, { nf: 220, nq: 1.2, nd: 0.08, ring: [131, 196], rd: 0.18, vol: 0.45 });
    [440, 554, 659].forEach((f, k) => bell(f, 0.5, { vol: 0.07, delay: 0.32 + k * 0.07, ratio: 3.5, index: 0.9 }));
    [880, 1109, 1319].forEach((f) => bell(f, 1.5, { vol: 0.06, delay: 0.55, ratio: 3.5, index: 1 }));
    tone(220, 1.2, { type: "triangle", vol: 0.12, delay: 0.55 });
    tone(330, 1.1, { type: "triangle", vol: 0.07, delay: 0.55 });
  },
  win() {
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, k) => tone(f, 0.24, { type: "triangle", vol: 0.16, delay: k * 0.12 }));
  },
};

export function playSound(name: SoundName, arg?: number) {
  try {
    SFX[name](arg);
  } catch {
    /* sound is optional */
  }
}
