// Voice chat: every player in voice chat has a direct audio call with every
// other one (at most 3 calls each at a 4-player table). The host shares who is
// in voice chat; between any two players the one with the smaller player id
// places the call, so a pair never ends up with two calls.
//
// Browser APIs are only touched once voice chat is switched on.

import type { RoomTransport, VoiceCall, VoiceMember } from "./transport";

interface Line {
  call: VoiceCall;
  /** Address the call went to; a new address (they reconnected) means a new call. */
  peerId: string;
  startedAt: number;
  audio?: HTMLAudioElement;
  meter?: AnalyserNode;
}

/** A call that hasn't connected after this long is dropped and tried again. */
const CONNECT_TIMEOUT = 12_000;
/** Speaking indicator: how loud counts as talking (RMS, 0-1). */
const SPEAKING_LEVEL = 0.035;

export class VoiceChat {
  /** I'm in voice chat (my microphone is open, I hear the others). */
  on = false;
  /** My microphone is muted (I still hear the others). */
  micMuted = false;
  /** Player ids talking right now ("me" included as my own id). */
  speaking = new Set<string>();

  private stream: MediaStream | null = null;
  private lines = new Map<string, Line>();
  /** Players I don't want to hear. */
  private mutedPids = new Set<string>();
  private ctx: AudioContext | null = null;
  private myMeter: AnalyserNode | null = null;
  private meterTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly changed: () => void) {}

  /** Opens the microphone. Throws if the browser or the player refuses it. */
  async start() {
    if (this.on) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    this.stream = stream;
    this.on = true;
    this.micMuted = false;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.myMeter = this.meter(stream);
    } catch {
      this.ctx = null; // no speaking indicator, voice still works
    }
    this.meterTimer = setInterval(() => this.measure(), 200);
    this.changed();
  }

  /** Leave voice chat: hang up and close the microphone. */
  stop() {
    for (const pid of [...this.lines.keys()]) this.hangUp(pid);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.meterTimer) clearInterval(this.meterTimer);
    this.meterTimer = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.myMeter = null;
    this.speaking.clear();
    const was = this.on;
    this.on = false;
    this.micMuted = false;
    if (was) this.changed();
  }

  setMicMuted(muted: boolean) {
    this.micMuted = muted;
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    this.changed();
  }

  /** Mute / unmute another player, for me only. */
  setPeerMuted(pid: string, muted: boolean) {
    if (muted) this.mutedPids.add(pid);
    else this.mutedPids.delete(pid);
    const audio = this.lines.get(pid)?.audio;
    if (audio) audio.muted = muted;
    this.changed();
  }
  isPeerMuted(pid: string) {
    return this.mutedPids.has(pid);
  }
  /** Do I have a working audio line with this player? */
  connectedTo(pid: string) {
    return !!this.lines.get(pid)?.audio;
  }

  /**
   * Bring my calls in line with who is in voice chat: call new people,
   * hang up on people who left, retry calls that never connected.
   */
  sync(members: VoiceMember[], myId: string, transport: RoomTransport | null) {
    if (!this.on || !this.stream) return;
    const now = Date.now();
    const others = new Map(members.filter((m) => m.id !== myId && m.peerId).map((m) => [m.id, m]));
    for (const [pid, line] of this.lines) {
      const m = others.get(pid);
      const stale = !line.audio && now - line.startedAt > CONNECT_TIMEOUT;
      if (!m || m.peerId !== line.peerId || stale) this.hangUp(pid);
    }
    if (!transport) return;
    for (const m of others.values()) {
      if (this.lines.has(m.id) || !(myId < m.id)) continue;
      const call = transport.call(m.peerId, myId, this.stream);
      if (call) this.attach(m.id, m.peerId, call);
    }
  }

  /** Someone is calling me. */
  incoming(call: VoiceCall) {
    if (!this.on || !this.stream || !call.pid) {
      call.close();
      return;
    }
    // A fresh call from them replaces any old one (e.g. they reconnected).
    if (this.lines.has(call.pid)) this.hangUp(call.pid);
    call.answer(this.stream);
    this.attach(call.pid, call.peerId, call);
  }

  private attach(pid: string, peerId: string, call: VoiceCall) {
    const line: Line = { call, peerId, startedAt: Date.now() };
    this.lines.set(pid, line);
    call.onStream((remote) => {
      if (this.lines.get(pid) !== line) return;
      const audio = new Audio();
      audio.autoplay = true;
      audio.setAttribute("playsinline", "");
      audio.srcObject = remote;
      audio.muted = this.mutedPids.has(pid);
      void audio.play().catch(() => {});
      line.audio = audio;
      line.meter = this.meter(remote) || undefined;
      this.changed();
    });
    call.onClose(() => {
      if (this.lines.get(pid) === line) {
        this.drop(pid, line);
        this.changed();
      }
    });
  }

  private hangUp(pid: string) {
    const line = this.lines.get(pid);
    if (!line) return;
    this.drop(pid, line);
    line.call.close();
  }

  private drop(pid: string, line: Line) {
    this.lines.delete(pid);
    if (line.audio) {
      line.audio.pause();
      line.audio.srcObject = null;
    }
    this.speaking.delete(pid);
  }

  private meter(stream: MediaStream): AnalyserNode | null {
    if (!this.ctx) return null;
    try {
      const src = this.ctx.createMediaStreamSource(stream);
      const an = this.ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an); // not to the speakers: playback is the <audio> element
      return an;
    } catch {
      return null;
    }
  }

  private measure() {
    const buf = new Uint8Array(512);
    const loud = (an?: AnalyserNode | null) => {
      if (!an) return false;
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (let k = 0; k < buf.length; k++) {
        const x = (buf[k] - 128) / 128;
        sum += x * x;
      }
      return Math.sqrt(sum / buf.length) > SPEAKING_LEVEL;
    };
    const next = new Set<string>();
    if (!this.micMuted && loud(this.myMeter)) next.add("me");
    for (const [pid, line] of this.lines) if (!this.mutedPids.has(pid) && loud(line.meter)) next.add(pid);
    const same = next.size === this.speaking.size && [...next].every((p) => this.speaking.has(p));
    if (same) return;
    this.speaking = next;
    this.changed();
  }
}
