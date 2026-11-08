// Music for the menu and setup screens, played live with the Web Audio API
// (nothing to download). Each piece is a small band (tanpura, santoor, sitar,
// bansuri, tabla, dholak, harmonium, ...) playing a composed arrangement: an
// intro the first time, then a loop that varies a little each time round
// (ornaments, drum fills, who plays the tune).
//
// Strings are physical models (Karplus-Strong), drums are tuned partials and
// noise, the flute a breathy oscillator. Everything goes through one mix: a
// room reverb, an echo for the lead, a gentle compressor, and a fade in / out.

type Ctx = BaseAudioContext;

export type TrackId = "neelam";

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const chance = (p: number) => Math.random() < p;

// ---------------------------------------------------------------- notation
// Tunes are written in sargam, one token per step of the grid:
// S r R g G m M P d D n N (lowercase r g d n: komal; m shuddha Ma, M tivra Ma),
// "." in front for the octave below, "'" after for the one above, "-" holds the
// note on, "_" is a rest and "|" just marks bars.
const SWARA: Record<string, number> = {
  S: 0,
  r: 1,
  R: 2,
  g: 3,
  G: 4,
  m: 5,
  M: 6,
  P: 7,
  d: 8,
  D: 9,
  n: 10,
  N: 11,
};

interface Note {
  /** Step within its bar */
  at: number;
  /** In steps (may run on into the next bar) */
  len: number;
  /** Semitones from Sa */
  deg: number;
}

function parseDeg(tok: string): number {
  const low = tok.match(/^\.+/)?.[0].length || 0;
  const high = tok.match(/'+$/)?.[0].length || 0;
  const name = tok.slice(low, tok.length - high);
  return SWARA[name] + 12 * (high - low);
}

/** A tune, bar by bar. */
function tune(src: string, steps: number): Note[][] {
  const toks = src.split(/\s+/).filter((t) => t && t !== "|");
  const bars: Note[][] = Array.from({ length: Math.ceil(toks.length / steps) }, () => []);
  let last: Note | null = null;
  toks.forEach((tok, k) => {
    if (tok === "-") {
      if (last) last.len++;
    } else if (tok === "_") last = null;
    else {
      last = { at: k % steps, len: 1, deg: parseDeg(tok) };
      bars[Math.floor(k / steps)].push(last);
    }
  });
  return bars;
}

/** A drum part, bar by bar: one stroke (or ".") per step. */
function beats(src: string, steps: number): string[][] {
  const toks = src.split(/\s+/).filter((t) => t && t !== "|");
  return Array.from({ length: Math.ceil(toks.length / steps) }, (_, b) => toks.slice(b * steps, b * steps + steps));
}

// ---------------------------------------------------------------- strings
// Karplus-Strong: a burst of noise circulating in a delay one period long,
// softened a little each time round. A "bridge" bend in the loop adds the
// buzz of the sitar and tanpura (jawari).
interface StringModel {
  bright: number;
  /** Seconds to fade away */
  decay: number;
  /** Length of the sample */
  dur: number;
  /** Where along the string it's struck (0-0.5) */
  pick?: number;
  /** Struck by a hammer (santoor) rather than plucked */
  hammer?: boolean;
  buzz?: number;
}

const MODELS = {
  sitar: { bright: 0.74, decay: 2.1, dur: 2.4, pick: 0.13, buzz: 0.4 },
} satisfies Record<string, StringModel>;
type StringKind = keyof typeof MODELS;

const strings = new Map<string, { buf: AudioBuffer; rate: number }>();

function stringSample(ctx: Ctx, kind: StringKind, midi: number) {
  const key = `${kind}:${midi}:${ctx.sampleRate}`;
  const had = strings.get(key);
  if (had) return had;
  const o: StringModel = MODELS[kind];
  const sr = ctx.sampleRate;
  const N = Math.max(4, Math.round(sr / hz(midi)));
  const len = Math.ceil(o.dur * sr);
  const y = new Float32Array(len);
  let lp = 0;
  const c = 0.12 + 0.85 * o.bright;
  for (let n = 0; n < N; n++) {
    lp += c * (Math.random() * 2 - 1 - lp);
    y[n] = lp;
  }
  if (o.hammer) {
    const w = Math.max(2, Math.round(N * 0.16));
    for (let n = 0; n < w; n++) y[n] += 1.4 * Math.sin((Math.PI * n) / w);
  }
  if (o.pick) {
    const P = Math.max(1, Math.round(N * o.pick));
    const e = y.slice(0, N);
    for (let n = 0; n < N; n++) y[n] = e[n] - 0.9 * e[(n + P) % N];
  }
  let mean = 0;
  for (let n = 0; n < N; n++) mean += y[n];
  mean /= N;
  let pk = 0;
  for (let n = 0; n < N; n++) pk = Math.max(pk, Math.abs((y[n] -= mean)));
  for (let n = 0; n < N; n++) y[n] /= pk || 1;
  const s = 0.5 + 0.42 * o.bright;
  const g = Math.pow(0.001, 1 / (o.decay * (sr / N)));
  const buzz = o.buzz || 0;
  for (let n = N; n < len; n++) {
    let v = g * (s * y[n - N] + (1 - s) * y[Math.max(0, n - N - 1)]);
    if (buzz && v > 0) v -= buzz * v * v; // the string brushing the curved bridge
    y[n] = v;
  }
  // Take the offset the bridge leaves out, fade the very end, and level it.
  let prevX = 0;
  let prevY = 0;
  pk = 0;
  for (let n = 0; n < len; n++) {
    const x = y[n];
    prevY = x - prevX + 0.996 * prevY;
    prevX = x;
    y[n] = prevY;
    pk = Math.max(pk, Math.abs(prevY));
  }
  const fade = Math.floor(sr * 0.05);
  for (let n = 0; n < len; n++) y[n] = (y[n] / (pk || 1)) * 0.9 * (n > len - fade ? (len - n) / fade : 1);
  const buf = ctx.createBuffer(1, len, sr);
  buf.getChannelData(0).set(y);
  // The loop's filter adds (1 - s) of a sample to the period: tune it back.
  const rate = (hz(midi) * (N + 1 - s)) / sr;
  const out = { buf, rate };
  strings.set(key, out);
  return out;
}

// ---------------------------------------------------------------- the mix
let noiseBuf: AudioBuffer | null = null;
function noise(ctx: Ctx) {
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/** A room: two seconds and a bit of decaying noise, darker as it fades. */
function roomImpulse(ctx: Ctx, secs: number) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * secs);
  const b = ctx.createBuffer(2, len, sr);
  const pre = Math.floor(sr * 0.018);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let n = pre; n < len; n++) {
      const x = (n - pre) / (len - pre);
      lp += (0.85 - 0.7 * x) * (Math.random() * 2 - 1 - lp);
      d[n] = lp * Math.pow(1 - x, 3) * 0.6;
    }
  }
  return b;
}

interface ChannelOpts {
  vol: number;
  pan?: number;
  /** Send to the room reverb / the echo */
  verb?: number;
  echo?: number;
  /** A high cut for this instrument */
  cut?: number;
  /** Ducks under each kick (sidechain pumping) */
  duck?: boolean;
  /** Saturation (0-1): grit, and harmonics small speakers can play */
  drive?: number;
}

class Mix {
  readonly out: GainNode;
  private bus: GainNode;
  private verb: GainNode;
  private echo: GainNode;
  private ducked: GainNode;
  /** Over the whole mix: closed for an intro, swept open in a build-up */
  private tone: BiquadFilterNode;

  constructor(
    readonly ctx: Ctx,
    echoSecs: number,
    dest: AudioNode,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.006;
    comp.release.value = 0.25;
    this.bus = ctx.createGain();
    this.tone = ctx.createBiquadFilter();
    this.tone.type = "lowpass";
    this.tone.frequency.value = 20000;
    this.tone.Q.value = 0.9;
    // Last, a limiter: nothing ever clips.
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -3;
    limit.knee.value = 0;
    limit.ratio.value = 20;
    limit.attack.value = 0.002;
    limit.release.value = 0.1;
    this.bus.connect(this.tone).connect(comp).connect(this.out).connect(limit).connect(dest);
    this.ducked = ctx.createGain();
    this.ducked.connect(this.bus);
    const conv = ctx.createConvolver();
    conv.buffer = roomImpulse(ctx, 2.4);
    this.verb = ctx.createGain();
    this.verb.connect(conv).connect(this.bus);
    const d = ctx.createDelay(2);
    d.delayTime.value = echoSecs;
    const fb = ctx.createGain();
    fb.gain.value = 0.3;
    const dark = ctx.createBiquadFilter();
    dark.type = "lowpass";
    dark.frequency.value = 2600;
    this.echo = ctx.createGain();
    this.echo.connect(d).connect(dark).connect(fb).connect(d);
    dark.connect(this.bus);
    dark.connect(this.verb);
  }

  channel(o: ChannelOpts): AudioNode {
    const ctx = this.ctx;
    const input = ctx.createGain();
    input.gain.value = o.drive ? 1 : o.vol;
    let node: AudioNode = input;
    if (o.drive) {
      // Driven at full level, so the grit is the same whatever the volume, which comes after it.
      const ws = ctx.createWaveShaper();
      const k = 1 + o.drive * 8;
      ws.curve = Float32Array.from({ length: 1024 }, (_, n) => Math.tanh(k * ((n / 1023) * 2 - 1)) / Math.tanh(k));
      const level = ctx.createGain();
      level.gain.value = o.vol;
      node = node.connect(ws).connect(level);
    }
    if (o.cut) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = o.cut;
      node = node.connect(f);
    }
    if (o.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = o.pan;
      node = node.connect(p);
    }
    node.connect(o.duck ? this.ducked : this.bus);
    if (o.verb) {
      const s = ctx.createGain();
      s.gain.value = o.verb;
      node.connect(s).connect(this.verb);
    }
    if (o.echo) {
      const s = ctx.createGain();
      s.gain.value = o.echo;
      node.connect(s).connect(this.echo);
    }
    return input;
  }

  /** Sidechain: the ducked instruments dip as a kick lands, and swell back. */
  pump(t: number, depth = 0.55) {
    const g = this.ducked.gain;
    g.setTargetAtTime(1 - depth, t, 0.004);
    g.setTargetAtTime(1, t + 0.05, 0.08);
  }

  /** Sweep the mix's high cut from `from` to `to` Hz. */
  sweep(t: number, from: number, to: number, secs: number) {
    const f = this.tone.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(from, t);
    if (secs > 0) f.exponentialRampToValueAtTime(to, t + secs);
  }
}

/** Once `src` has finished, take `nodes` out of the mix (finished notes would otherwise pile up). */
function free(src: AudioScheduledSourceNode, ...nodes: AudioNode[]) {
  src.onended = () => nodes.forEach((n) => n.disconnect());
}

// ---------------------------------------------------------------- one-shots
// Drum strokes, bars and cymbals are drawn once into short samples (three
// takes of each, so repeats aren't identical) and then just replayed: a
// handful of audio nodes per stroke would be too much work for a phone.

/** A decaying sine: a drum's or a bar's partial (from: starts at that pitch and slides; to: then drifts there). */
interface Sine {
  f: number;
  vol: number;
  decay: number;
  from?: { f: number; secs: number };
  to?: { f: number; at: number };
}
/** A burst of filtered noise: a stroke's slap, a shaker, a hat. */
interface Hiss {
  f: number;
  q?: number;
  type?: "bandpass" | "lowpass" | "highpass";
  vol: number;
  decay: number;
  attack?: number;
  /** Starts this long into the shot */
  at?: number;
}
interface Shot {
  sines?: Sine[];
  hiss?: Hiss[];
}

/** Falls from 1 to -80 dB over `decay` seconds, after a short attack. */
const env = (t: number, attack: number, decay: number) => (t < attack ? t / attack : Math.exp((Math.log(1e-4) * (t - attack)) / decay));

function drawShot(sr: number, o: Shot) {
  const all = [...(o.sines || []).map((s) => s.decay), ...(o.hiss || []).map((h) => (h.at || 0) + h.decay + (h.attack || 0))];
  const len = Math.ceil((Math.max(...all) + 0.02) * sr);
  const y = new Float32Array(len);
  for (const s of o.sines || []) {
    let ph = 0;
    for (let n = 0; n < len; n++) {
      const t = n / sr;
      if (t > s.decay) break;
      let f = s.f;
      if (s.from && t < s.from.secs) f = s.from.f * Math.pow(s.f / s.from.f, t / s.from.secs);
      else if (s.to) f = s.f + (s.to.f - s.f) * Math.min(1, (t - (s.from?.secs || 0)) / s.to.at);
      ph += (2 * Math.PI * f) / sr;
      y[n] += Math.sin(ph) * s.vol * env(t, 0.003, s.decay);
    }
  }
  for (const h of o.hiss || []) {
    // An RBJ biquad over white noise.
    const w = (2 * Math.PI * Math.min(h.f, sr * 0.45)) / sr;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * (h.q ?? (h.type === "bandpass" || !h.type ? 1 : 0.707)));
    const type = h.type || "bandpass";
    const [b0, b1, b2] = type === "bandpass" ? [alpha, 0, -alpha] : type === "lowpass" ? [(1 - cos) / 2, 1 - cos, (1 - cos) / 2] : [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
    const a0 = 1 + alpha;
    const a1 = -2 * cos;
    const a2 = 1 - alpha;
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    const attack = h.attack || 0.002;
    for (let n = Math.floor((h.at || 0) * sr); n < len; n++) {
      const t = n / sr - (h.at || 0);
      if (t > h.decay + attack) break;
      const x = Math.random() * 2 - 1;
      const v = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = v;
      y[n] += v * h.vol * env(t, attack, h.decay);
    }
  }
  return y;
}

const shots = new Map<string, AudioBuffer[]>();

function shotTakes(ctx: Ctx, key: string, o: Shot) {
  const k = `${key}:${ctx.sampleRate}`;
  let takes = shots.get(k);
  if (!takes) {
    takes = [0, 1, 2].map(() => {
      const y = drawShot(ctx.sampleRate, o);
      const b = ctx.createBuffer(1, y.length, ctx.sampleRate);
      b.getChannelData(0).set(y);
      return b;
    });
    shots.set(k, takes);
  }
  return takes;
}

// ---------------------------------------------------------------- the band
interface BandOpts {
  /** Sa, as a MIDI note (the tanpura's middle string) */
  sa: number;
  /** Seconds per step of the grid */
  step: number;
  echo: number;
}

/** The instruments, each on its own channel of the mix. */
class Band {
  readonly ctx: Ctx;
  private ch: Record<string, AudioNode> = {};
  private sitarVoice: { g: GainNode; src: AudioBufferSourceNode } | null = null;

  constructor(
    readonly mix: Mix,
    readonly o: BandOpts,
    channels: Record<string, ChannelOpts>,
  ) {
    this.ctx = mix.ctx;
    for (const k in channels) this.ch[k] = mix.channel(channels[k]);
  }

  private out(name: string) {
    return this.ch[name] || this.ch.drums || Object.values(this.ch)[0];
  }

  /** Human hands: a few milliseconds early or late. */
  feel(t: number, ms = 7) {
    return t + rnd(-ms, ms) / 1000;
  }

  // -------------------------------------------- strings
  strike(kind: StringKind, midi: number, t: number, vel: number, o: { ch?: string; detune?: number; bendTo?: number; stopAt?: number } = {}) {
    const { buf, rate } = stringSample(this.ctx, kind, midi);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.setValueAtTime(rate * (o.detune || 1), t);
    if (o.bendTo !== undefined) {
      // Meend: slide to the next note along the string.
      src.playbackRate.setValueAtTime(rate, t + 0.08);
      src.playbackRate.exponentialRampToValueAtTime(rate * Math.pow(2, (o.bendTo - midi) / 12), t + 0.32);
    }
    const g = this.ctx.createGain();
    g.gain.value = vel;
    src.connect(g).connect(this.out(o.ch || kind));
    src.start(t);
    free(src, g);
    if (o.stopAt) {
      g.gain.setTargetAtTime(0, o.stopAt, 0.05);
      src.stop(o.stopAt + 0.4);
    }
    return { g, src };
  }

  /** Sitar: one string, so each note stops the last. */
  sitar(midi: number, t: number, vel: number, bendTo?: number) {
    if (this.sitarVoice) {
      this.sitarVoice.g.gain.setTargetAtTime(0, t, 0.03);
      this.sitarVoice.src.stop(t + 0.3);
    }
    this.sitarVoice = this.strike("sitar", midi, t, vel, { bendTo });
  }

  sitarLine(notes: Note[], t0: number, base: number, vel: number, o: { meend?: number; scale?: number[] } = {}) {
    const st = this.o.step;
    let slid = -1;
    notes.forEach((n, k) => {
      if (k === slid) return; // (reached by sliding into it)
      const t = this.feel(t0 + n.at * st);
      const next = notes[k + 1];
      // Now and then a long note slides into the next one instead of plucking it.
      const slide = !!o.meend && !!next && n.len >= 2 && next.at === n.at + n.len && Math.abs(next.deg - n.deg) <= 3 && chance(o.meend);
      if (o.scale && n.len >= 2 && chance(0.2)) this.strike("sitar", base + above(n.deg, o.scale), t - 0.06, vel * 0.35);
      this.sitar(base + n.deg, t, vel * rnd(0.85, 1.05), slide ? base + next.deg : undefined);
      if (slide) slid = k + 1;
    });
  }

  // -------------------------------------------- winds and keys
  /**
   * Bansuri: a breathy, nearly pure tone that swells in, slides between
   * close notes, and gains a slow vibrato as it's held.
   */
  flute(midi: number, t: number, secs: number, vel: number, from?: number) {
    const ctx = this.ctx;
    const out = this.out("flute");
    const f = hz(midi);
    const o = ctx.createOscillator();
    o.setPeriodicWave(fluteWave(ctx));
    if (from !== undefined) {
      o.frequency.setValueAtTime(hz(from), t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
    } else {
      o.frequency.setValueAtTime(f * 0.985, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    }
    const vib = ctx.createOscillator();
    vib.frequency.value = rnd(4.8, 5.6);
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(0, t + Math.min(0.35, secs * 0.5));
    depth.gain.linearRampToValueAtTime(secs > 0.5 ? 16 : 6, t + Math.max(0.4, secs));
    vib.connect(depth).connect(o.detune);
    const g = ctx.createGain();
    const end = t + secs;
    const legato = from !== undefined;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel * (legato ? 0.9 : 1), t + (legato ? 0.03 : 0.07));
    g.gain.exponentialRampToValueAtTime(vel * 0.82, t + Math.max(0.1, secs * 0.8));
    g.gain.setTargetAtTime(0.0001, end, 0.06);
    o.connect(g).connect(out);
    // Breath: noise around the note, following the tone.
    const br = ctx.createBufferSource();
    br.buffer = noise(ctx);
    br.loop = true;
    const bf = ctx.createBiquadFilter();
    bf.type = "bandpass";
    bf.frequency.value = Math.min(6000, f * 2.2);
    bf.Q.value = 0.8;
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.exponentialRampToValueAtTime(vel * 0.22, t + 0.03);
    bg.gain.exponentialRampToValueAtTime(vel * 0.07, t + 0.18);
    bg.gain.setTargetAtTime(0.0001, end, 0.05);
    br.connect(bf).connect(bg).connect(out);
    const stop = end + 0.5;
    [o, vib].forEach((x) => {
      x.start(t);
      x.stop(stop);
    });
    br.start(t, Math.random());
    br.stop(stop);
    free(br, g, depth, bf, bg);
  }

  fluteLine(notes: Note[], t0: number, base: number, vel: number, o: { scale?: number[]; grace?: number } = {}) {
    const st = this.o.step;
    let prev: Note | null = null;
    notes.forEach((n) => {
      const t = t0 + n.at * st;
      const legato = prev && prev.at + prev.len === n.at && Math.abs(prev.deg - n.deg) <= 4 ? base + prev.deg : undefined;
      if (o.scale && o.grace && legato === undefined && chance(o.grace)) {
        this.flute(base + above(n.deg, o.scale), t - 0.08, 0.07, vel * 0.7);
        this.flute(base + n.deg, t, n.len * st, vel, base + above(n.deg, o.scale));
      } else this.flute(base + n.deg, t, n.len * st - 0.02, vel, legato);
      prev = n;
    });
  }

  /** A soft string pad. */
  pad(midis: number[], t: number, secs: number, vel: number) {
    const ctx = this.ctx;
    const out = this.out("pad");
    const g = ctx.createGain();
    const attack = Math.min(1.2, secs * 0.4);
    g.gain.setValueAtTime(0.0001, t);
    const peak = (vel * 0.5) / midis.length;
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + secs);
    g.gain.exponentialRampToValueAtTime(0.0001, t + secs + 1.4);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 950;
    g.connect(f).connect(out);
    const stop = t + secs + 1.5;
    midis.forEach((m, k) => {
      [-7, 7].forEach((cents, j) => {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = hz(m);
        o.detune.value = cents + rnd(-2, 2);
        o.connect(g);
        o.start(t);
        o.stop(stop);
        if (!k && !j) free(o, g, f);
      });
    });
  }

  /** Marimba: a wooden bar, its overtone ringing briefly. */
  marimba(midi: number, t: number, vel: number) {
    const f = hz(midi);
    this.shot(
      `marimba:${midi}`,
      {
        sines: [
          { f, vol: 1, decay: 0.55 },
          { f: f * 3.93, vol: 0.22, decay: 0.07 },
          { f: f * 9.2, vol: 0.05, decay: 0.03 },
        ],
      },
      t,
      vel,
      "marimba",
    );
  }

  /** Replay one take of a one-shot. */
  private shot(key: string, o: Shot, t: number, vel: number, ch: string) {
    const takes = shotTakes(this.ctx, key, o);
    const src = this.ctx.createBufferSource();
    src.buffer = takes[Math.floor(Math.random() * takes.length)];
    const g = this.ctx.createGain();
    g.gain.value = vel;
    src.connect(g).connect(this.out(ch));
    src.start(Math.max(0, t));
    free(src, g);
  }

  // -------------------------------------------- drums
  /**
   * Tabla. The right drum (dayan) is tuned to Sa and rings with near-harmonic
   * overtones; the left (bayan) is a deep boom the palm bends upward.
   */
  bol(name: string, t: number, vel: number) {
    const st = this.o.step;
    switch (name) {
      case "dha":
        this.dayan("na", t, vel);
        this.bayan("ge", t, vel * 0.9);
        break;
      case "dhin":
      case "dhi":
        this.dayan("tin", t, vel);
        this.bayan("ge", t, vel * (name === "dhi" ? 0.6 : 0.9));
        break;
      case "na":
      case "ta":
        this.dayan("na", t, vel);
        break;
      case "tin":
      case "tun":
        this.dayan("tin", t, vel);
        break;
      case "ti":
      case "te":
      case "ra":
        this.dayan("ti", t, vel);
        break;
      case "ge":
      case "ghe":
        this.bayan("ge", t, vel);
        break;
      case "ka":
      case "ke":
        this.bayan("ka", t, vel);
        break;
      case "trkt": // ti-ra-ki-ta, four quick strokes in one step
        this.dayan("ti", t, vel * 0.8);
        this.dayan("ti", t + st / 4, vel * 0.6);
        this.bayan("ka", t + st / 2, vel * 0.7);
        this.dayan("na", t + (3 * st) / 4, vel * 0.8);
        break;
    }
  }

  private dayan(kind: "na" | "tin" | "ti", t: number, vel: number) {
    const f = hz(this.o.sa + 12);
    const modes: [number, number, number][] =
      kind === "na"
        ? [
            [1, 1, 0.5],
            [2, 0.55, 0.28],
            [3, 0.38, 0.18],
            [4.02, 0.2, 0.1],
            [5.1, 0.08, 0.06],
          ]
        : kind === "tin"
          ? [
              [1, 1, 0.8],
              [2, 0.22, 0.32],
              [3, 0.08, 0.15],
            ]
          : [[1, 0.36, 0.05]];
    const slap: Hiss =
      kind === "ti"
        ? { f: 1900, q: 0.9, vol: 0.5, decay: 0.035 }
        : {
            f: kind === "na" ? 3600 : 2400,
            q: 1.2,
            vol: kind === "na" ? 0.45 : 0.2,
            decay: 0.014,
          };
    this.shot(
      `dayan:${kind}:${this.o.sa}`,
      {
        sines: modes.map(([r, v, d]) => ({ f: f * r, vol: v * 0.5, decay: d })),
        hiss: [slap],
      },
      t,
      vel,
      "tabla",
    );
  }

  private bayan(kind: "ge" | "ka", t: number, vel: number) {
    const f = hz(this.o.sa - 12);
    const o: Shot =
      kind === "ka"
        ? {
            sines: [{ f: 150, vol: 0.25, decay: 0.05 }],
            hiss: [{ f: 320, q: 1, vol: 0.6, decay: 0.055 }],
          }
        : // Ge: the boom rises a little as the palm presses (gumki).
          {
            sines: [
              {
                f,
                vol: 0.9,
                decay: 0.95,
                from: { f: f * 0.84, secs: 0.05 },
                to: { f: f * 1.1, at: 0.45 },
              },
              {
                f: f * 2,
                vol: 0.25,
                decay: 0.35,
                from: { f: f * 1.68, secs: 0.05 },
              },
            ],
            hiss: [{ f: 200, type: "lowpass", vol: 0.4, decay: 0.05 }],
          };
    this.shot(`bayan:${kind}:${this.o.sa}`, o, t, vel, "tabla");
  }

  shaker(t: number, vel: number) {
    this.shot("shaker", { hiss: [{ f: 6500, q: 0.8, vol: 1, decay: 0.07, attack: 0.012 }] }, t, vel, "shaker");
  }

  kick(t: number, vel: number) {
    // (The click is the beater: what small speakers can play of a kick.)
    this.shot(
      "kick",
      {
        sines: [{ f: 48, vol: 1, decay: 0.4, from: { f: 150, secs: 0.09 } }],
        hiss: [{ f: 2800, q: 0.8, vol: 0.12, decay: 0.012 }],
      },
      t,
      vel,
      "drums",
    );
  }
  clap(t: number, vel: number) {
    const hiss: Hiss[] = [0, 0.011, 0.022].map((at) => ({
      f: 1500,
      q: 0.9,
      vol: 0.6,
      decay: 0.03,
      at,
    }));
    this.shot(
      "clap",
      {
        hiss: [...hiss, { f: 1300, q: 0.7, vol: 0.45, decay: 0.16, at: 0.03 }],
      },
      t,
      vel,
      "drums",
    );
  }

  // -------------------------------------------- the modern kit
  /** A kick that also pumps the ducked instruments. */
  kickPump(t: number, vel: number, depth = 0.55) {
    this.kick(t, vel);
    this.mix.pump(t, depth);
  }
  snare(t: number, vel: number) {
    this.shot(
      "snare",
      {
        sines: [{ f: 185, vol: 0.6, decay: 0.13, from: { f: 260, secs: 0.03 } }],
        hiss: [
          { f: 3200, q: 0.6, vol: 0.9, decay: 0.17 },
          { f: 7000, type: "highpass", vol: 0.35, decay: 0.12 },
        ],
      },
      t,
      vel,
      "drums",
    );
  }
  openHat(t: number, vel: number) {
    this.shot("openhat", { hiss: [{ f: 7500, type: "highpass", vol: 0.45, decay: 0.28 }] }, t, vel, "drums");
  }
  /** A cymbal crash and a deep boom: the drop lands. */
  impact(t: number, vel: number) {
    this.shot(
      "crash",
      {
        hiss: [
          { f: 4500, type: "highpass", vol: 0.5, decay: 1.6 },
          { f: 9000, q: 0.8, vol: 0.3, decay: 1.1 },
        ],
      },
      t,
      vel * 0.8,
      "drums",
    );
    this.shot(
      "boom",
      {
        sines: [{ f: 52, vol: 1, decay: 1.2, from: { f: 120, secs: 0.15 } }],
        hiss: [{ f: 150, type: "lowpass", vol: 0.5, decay: 0.3 }],
      },
      t,
      vel,
      "drums",
    );
  }
  /** Rising noise through a build-up. */
  riser(t: number, secs: number, vel: number) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(9000, t + secs);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + secs);
    g.gain.setTargetAtTime(0.0001, t + secs, 0.04);
    src.connect(f).connect(g).connect(this.out("drums"));
    src.start(t);
    src.stop(t + secs + 0.3);
    free(src, f, g);
  }
  /** Sweep the whole mix's high cut (intros, build-ups). */
  sweep(t: number, from: number, to: number, secs: number) {
    this.mix.sweep(t, from, to, secs);
  }

  /**
   * An 808: a long, deep sine with a little thump at the start, sliding to
   * the next note when asked (the channel's drive gives it its grit).
   */
  b808(midi: number, t: number, secs: number, vel: number, glideTo?: number) {
    const ctx = this.ctx;
    const f = hz(midi);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    if (glideTo !== undefined && secs > 0.2) {
      o.frequency.setValueAtTime(f, t + secs - 0.14);
      o.frequency.exponentialRampToValueAtTime(hz(glideTo), t + secs);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(vel * 0.7, t + Math.min(0.4, secs));
    g.gain.setTargetAtTime(0.0001, t + secs, 0.03);
    o.connect(g).connect(this.out("808"));
    o.start(t);
    o.stop(t + secs + 0.2);
    free(o, g);
  }

  /**
   * A synth voice: oscillators (detuned for width) through a filter that
   * opens on the attack. Plucks, stabs, brass, bass, chip leads.
   */
  synth(midis: number[], t: number, secs: number, vel: number, p: SynthPreset, o: { from?: number } = {}) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const peak = vel / Math.sqrt(midis.length);
    const a = p.attack ?? 0.004;
    const d = p.decay ?? 0.2;
    const sus = p.sustain ?? 0.6;
    const rel = p.release ?? 0.08;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sus), t + a + d);
    g.gain.setTargetAtTime(0.0001, t + Math.max(secs, a + 0.01), rel / 3);
    let into: AudioNode = g;
    let filter: BiquadFilterNode | null = null;
    if (p.cut < 18000) {
      filter = ctx.createBiquadFilter();
      filter.type = p.band ? "bandpass" : "lowpass";
      // (Once per block of samples, not every sample: plenty for a sweep, and far less work.)
      filter.frequency.automationRate = "k-rate";
      filter.Q.value = p.q ?? 0.8;
      filter.frequency.setValueAtTime(p.cut + (p.env || 0), t);
      if (p.env) filter.frequency.exponentialRampToValueAtTime(p.cut, t + (p.fdecay ?? 0.18));
      filter.connect(g);
      into = filter;
    }
    g.connect(this.out(p.ch));
    const stop = t + secs + rel + 0.05;
    const vib = p.vib && secs > 0.25 ? ctx.createOscillator() : null;
    let vibDepth: GainNode | null = null;
    if (vib) {
      vib.frequency.value = 5.5;
      vibDepth = ctx.createGain();
      vibDepth.gain.setValueAtTime(0, t);
      vibDepth.gain.linearRampToValueAtTime(0, t + 0.18);
      vibDepth.gain.linearRampToValueAtTime(p.vib!, t + Math.min(secs, 0.6));
      vib.connect(vibDepth);
      vib.start(t);
      vib.stop(stop);
    }
    let first: OscillatorNode | null = null;
    midis.forEach((m) => {
      (p.detune || [0]).forEach((cents) => {
        const osc = ctx.createOscillator();
        if (p.wave === "pulse") osc.setPeriodicWave(pulseWave(ctx, p.duty ?? 0.25));
        else osc.type = p.wave;
        if (o.from !== undefined) {
          osc.frequency.setValueAtTime(hz(o.from), t);
          osc.frequency.exponentialRampToValueAtTime(hz(m), t + (p.glide ?? 0.06));
        } else osc.frequency.value = hz(m);
        osc.detune.value = cents;
        if (vibDepth) vibDepth.connect(osc.detune);
        osc.connect(into);
        osc.start(t);
        osc.stop(stop);
        first ??= osc;
      });
    });
    if (first) free(first, g, ...(filter ? [filter] : []), ...(vibDepth ? [vibDepth] : []));
  }
}

interface SynthPreset {
  wave: OscillatorType | "pulse";
  /** Pulse width (pulse waves) */
  duty?: number;
  /** Cents, one oscillator each */
  detune?: number[];
  /** Filter: where it settles, how far above that it starts, how fast it closes */
  cut: number;
  env?: number;
  fdecay?: number;
  q?: number;
  /** A bandpass instead of a lowpass (a nasal, reedy tone) */
  band?: boolean;
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
  /** Vibrato depth in cents on long notes */
  vib?: number;
  /** Slide time between notes */
  glide?: number;
  ch: string;
}

const pulseWaves = new Map<string, PeriodicWave>();
let pulseCtx: Ctx | null = null;
/** A pulse wave of the given width (the sound of 8-bit consoles). */
function pulseWave(ctx: Ctx, duty: number) {
  if (pulseCtx !== ctx) {
    pulseWaves.clear();
    pulseCtx = ctx;
  }
  const key = String(duty);
  let w = pulseWaves.get(key);
  if (!w) {
    const n = 48;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    w = ctx.createPeriodicWave(real, imag);
    pulseWaves.set(key, w);
  }
  return w;
}

let fluteWaveOf: { ctx: Ctx; w: PeriodicWave } | null = null;
function fluteWave(ctx: Ctx) {
  if (fluteWaveOf?.ctx !== ctx) {
    const amps = [0, 1, 0.32, 0.12, 0.05, 0.02];
    fluteWaveOf = {
      ctx,
      w: ctx.createPeriodicWave(new Float32Array(amps.length), Float32Array.from(amps)),
    };
  }
  return fluteWaveOf.w;
}

/** The next note up the scale (for grace notes). */
function above(deg: number, scale: number[]) {
  const oct = Math.floor(deg / 12);
  const d = ((deg % 12) + 12) % 12;
  const up = scale.find((s) => s > d);
  return up !== undefined ? oct * 12 + up : (oct + 1) * 12 + scale[0];
}

// ---------------------------------------------------------------- the pieces
interface Piece {
  id: TrackId;
  name: string;
  mood: string;
  band: BandOpts;
  /** Steps in a bar */
  steps: number;
  /** Level of the whole piece (to match the others) */
  gain?: number;
  /** Bars played once at the start, then bars that loop */
  intro: number;
  loop: number;
  channels: Record<string, ChannelOpts>;
  /** Play bar `i` of the loop (or of the intro), starting at t. */
  bar(b: Band, i: number, intro: boolean, t: number): void;
  /** Called once, as it starts. */
  start?(b: Band, t: number): void;
}

// --- Neelam: the menu music. An original tune (sitar hook, bansuri answer) over
// future house: four on the floor, pumping chord stabs, an offbeat bass, build-ups and drops.
const CHORDS: Record<string, number[]> = {
  Am: [-12, -9, -5],
  F: [-16, -12, -9],
  C: [-9, -5, -2],
  G: [-14, -10, -7],
  Dm: [-7, -4, 0],
  E: [-17, -13, -10],
};
const NEELAM = {
  prog: ["Am", "F", "C", "G", "Am", "F", "Dm", "E"],
  breakProg: ["Am", "F", "C", "E"],
  a: tune("P - g - S - g m | P - - - d P m g | g - P - n - P - | m g R g - - - - | P - g - S - g m | P - d - S' - n d | P - m - g - R - | S - .N - R - - -", 8),
  b: tune("S' - - n S' - P - | d - P - m g m - | g - m - P - n - | P - - - m g R - | S' - - n S' - P - | d - P - S' - R' - | g' - R' - S' - n - | N - - - - - - -", 8),
  brk: tune("S - - - g - m - | P - - - - - - - | g - - - m - P - | .N - - - - - - -", 8),
  keherwa: beats("dha . ge . na . ti . na . ka . dhi . na .", 16)[0],
};

const STAB: SynthPreset = {
  wave: "sawtooth",
  detune: [-9, 9],
  cut: 1100,
  env: 3200,
  fdecay: 0.16,
  q: 1.2,
  decay: 0.18,
  sustain: 0.25,
  release: 0.1,
  ch: "stabs",
};

const neelam: Piece = {
  id: "neelam",
  name: "Neelam",
  mood: "A sitar hook and marimba as future house, with pumping stabs, a bouncy bass, build-ups and drops.",
  band: { sa: 57, step: 60 / 122 / 4, echo: (60 / 122) * 0.75 },
  steps: 16,
  gain: 0.92,
  intro: 4,
  loop: 36,
  channels: {
    sitar: { vol: 1.1, pan: 0.1, verb: 0.25, echo: 0.2 },
    flute: { vol: 0.12, pan: -0.2, verb: 0.35, echo: 0.15 },
    marimba: { vol: 0.2, pan: -0.25, verb: 0.25, duck: true },
    stabs: { vol: 0.12, pan: 0.2, verb: 0.25, duck: true },
    pad: { vol: 0.14, verb: 0.5, duck: true },
    "808": { vol: 0.045, drive: 0.25, duck: true },
    drums: { vol: 0.3, verb: 0.06 },
    tabla: { vol: 0.5, pan: 0.2, verb: 0.15 },
    shaker: { vol: 0.36, pan: -0.3 },
  },
  bar(b, i, intro, t) {
    const st = b.o.step;
    const sa = b.o.sa;
    const barLen = st * 16;
    // Build (4), drop: the sitar hook (8), groove: the bansuri (8), break (4), build (4), second drop (8).
    const sec = intro ? "intro" : i < 4 ? "build" : i < 12 ? "drop" : i < 20 ? "groove" : i < 24 ? "break" : i < 28 ? "build" : "drop2";
    const k = intro ? i : i < 4 ? i : i < 12 ? i - 4 : i < 20 ? i - 12 : i < 24 ? i - 20 : i < 28 ? i - 24 : i - 28;
    const chord = sec === "break" ? NEELAM.breakProg[k] : NEELAM.prog[k % 8];
    const notes = CHORDS[chord].map((d) => sa + d);
    const root = notes[0] - 12;
    const at = (s: number) => b.feel(t + s * st, 3);
    const eighths = (line: Note[][]) => line[k % 8].map((n) => ({ ...n, at: n.at * 2, len: n.len * 2 }));
    const tones = [notes[0] + 12, notes[2] + 12, notes[0] + 24, notes[1] + 24, notes[2] + 12, notes[0] + 24, notes[1] + 12, notes[2] + 12];
    const marimba = (v: number) => tones.forEach((m, j) => b.marimba(m, at(j * 2), (j % 2 ? 0.45 : 0.6) * v));
    if (sec === "intro") {
      if (k === 0) b.sweep(t, 900, 6000, barLen * 4);
      marimba(0.8);
      for (let s = 0; s < 16; s++) b.shaker(at(s), s % 4 === 0 ? 0.5 : 0.25);
      if (k >= 2) [0, 8].forEach((s) => b.kick(t + s * st, 0.6));
      return;
    }
    if (sec === "build") {
      if (k === 0) {
        b.sweep(t, 800, 16000, barLen * 4);
        b.riser(t, barLen * 4, 0.3);
      }
      marimba(0.9);
      b.pad(
        notes.map((m) => m + 12),
        t,
        barLen - 0.05,
        0.5,
      );
      if (sec === "build" && i >= 24) b.sitarLine(eighths(NEELAM.a), t, sa + 12, 0.55, { meend: 0.3 });
      // The snare roll: quarters, eighths, sixteenths, then faster, and a breath before the drop.
      const every = [4, 2, 1, 1][k];
      for (let s = 0; s < (k === 3 ? 12 : 16); s += every) {
        const v = 0.2 + (0.55 * (k * 16 + s)) / 64;
        b.snare(t + s * st, v);
        if (k === 3 && s >= 8) b.snare(t + (s + 0.5) * st, v);
      }
      return;
    }
    if (sec === "break") {
      b.pad(
        notes.map((m) => m + 12),
        t,
        barLen - 0.05,
        1,
      );
      marimba(0.6);
      b.sitarLine(
        NEELAM.brk[k].map((n) => ({ ...n, at: n.at * 2, len: n.len * 2 })),
        t,
        sa + 12,
        0.75,
        { meend: 0.5 },
      );
      return;
    }
    // The drops and the groove: four on the floor, pumping.
    if (k === 0 && sec !== "groove") {
      b.sweep(t, 18000, 18000, 0);
      b.impact(t, 0.55);
    }
    [0, 4, 8, 12].forEach((s) => b.kickPump(t + s * st, 0.95));
    [4, 12].forEach((s) => b.clap(at(s), 0.65));
    [2, 6, 10, 14].forEach((s) => b.openHat(at(s), 0.4));
    for (let s = 0; s < 16; s++) b.shaker(at(s), s % 2 ? 0.25 : 0.45);
    // The bass bounces on the offbeats, jumping the octave.
    [2, 6, 10, 14].forEach((s, n) => b.b808(root + (n % 2 ? 12 : 0), t + s * st, st * 1.6, 0.8));
    // Chord stabs on the offbeats too (pumped by the kick).
    const voiced = notes.map((m) => m + 12);
    [2, 5, 10, 13].forEach((s) => b.synth(voiced, at(s), st * 0.9, 0.5, STAB));
    marimba(0.7);
    if (sec === "drop") b.sitarLine(eighths(NEELAM.a), t, sa + 12, 0.85, { meend: 0.3 });
    else if (sec === "groove") {
      b.fluteLine(eighths(NEELAM.b), t, sa + 12, 0.6);
      NEELAM.keherwa.forEach((s, j) => s !== "." && b.bol(s, at(j), (j === 0 ? 0.7 : 0.45) * rnd(0.9, 1.05)));
    } else {
      b.sitarLine(eighths(k < 4 ? NEELAM.a : NEELAM.b), t, sa + 12, 0.85, {
        meend: 0.3,
      });
      NEELAM.keherwa.forEach((s, j) => s !== "." && b.bol(s, at(j), (j === 0 ? 0.6 : 0.4) * rnd(0.9, 1.05)));
    }
  },
};

export const PIECES: Piece[] = [neelam];

// ---------------------------------------------------------------- playing
const FADE_IN = 2.5;
const FADE_OUT = 1.2;
const LEVEL = 0.65;

/** One piece playing: schedules a bar at a time, a little ahead. */
class Performance {
  private band: Band;
  private bar = 0;
  private next: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  readonly mix: Mix;

  constructor(
    readonly ctx: Ctx,
    readonly piece: Piece,
    dest: AudioNode,
  ) {
    this.mix = new Mix(ctx, piece.band.echo, dest);
    this.band = new Band(this.mix, piece.band, piece.channels);
    this.next = ctx.currentTime + 0.15;
    piece.start?.(this.band, this.next);
  }

  barSecs() {
    return this.piece.band.step * this.piece.steps;
  }

  /** Schedules every bar that starts before `until`. */
  schedule(until: number) {
    const p = this.piece;
    while (this.next < until) {
      const intro = this.bar < p.intro;
      const i = intro ? this.bar : (this.bar - p.intro) % p.loop;
      try {
        p.bar(this.band, i, intro, this.next);
      } catch {
        /* music is optional */
      }
      this.next += this.barSecs();
      this.bar++;
    }
  }

  start() {
    const g = this.mix.out.gain;
    const now = this.ctx.currentTime;
    g.setValueAtTime(0.0001, now);
    g.exponentialRampToValueAtTime(LEVEL * (this.piece.gain ?? 1), now + FADE_IN);
    this.schedule(now + 0.6);
    this.timer = setInterval(() => {
      const t = this.ctx.currentTime;
      // Fell behind (the page slept): skip ahead rather than play a pile of bars at once.
      if (this.next < t - 0.05) this.next = t + 0.05;
      this.schedule(t + 0.6);
    }, 120);
  }

  stop(fade = FADE_OUT) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const g = this.mix.out.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, g.value), now);
    g.exponentialRampToValueAtTime(0.0001, now + fade);
    setTimeout(
      () => {
        try {
          this.mix.out.disconnect();
        } catch {
          /* already gone */
        }
      },
      (fade + 0.1) * 1000,
    );
  }
}

let current: Performance | null = null;

/** Start a piece (fading out whatever was playing), or keep playing it if it already is. */
export function playMusic(ctx: AudioContext, id: TrackId) {
  if (current && current.ctx === ctx && current.piece.id === id && ctx.state !== "closed") return;
  stopMusic();
  const piece = PIECES.find((p) => p.id === id) || PIECES[0];
  current = new Performance(ctx, piece, ctx.destination);
  current.start();
}

export function stopMusic(fade?: number) {
  current?.stop(fade);
  current = null;
}

export function musicPlaying(): TrackId | null {
  return current && current.ctx instanceof AudioContext && current.ctx.state !== "closed" ? current.piece.id : null;
}
