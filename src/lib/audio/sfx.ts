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

const SFX: Record<SoundName, () => void> = {
  dice() {
    for (let k = 0; k < 8; k++) noise(0.05, { vol: 0.45, delay: k * 0.085 + Math.random() * 0.025, freq: 1300 + Math.random() * 1700 });
    tone(170, 0.09, { type: "triangle", vol: 0.18, delay: 0.74 });
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
