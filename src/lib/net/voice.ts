// Voice chat: every player at the table has a direct audio call with every
// other one (at most 3 calls each at a 4-player table). The host shares who is
// in voice chat; between any two players the one with the smaller player id
// places the call, so a pair never ends up with two calls.
//
// Everyone joins listening: until their mic is turned on, a player's calls
// carry silence (no microphone permission needed). Turning the mic on swaps
// the real microphone into the running calls. Turning it off only silences it:
// the microphone stays open (it closes when you leave the table). Closing it
// switched phones out of their call audio mode, and on some phones that left
// game sounds and the other players' voices silent until the page was reloaded.
//
// Calls look after themselves: one that died (even if the other end never said
// so) is hung up and placed again, and a voice that stopped playing is restarted.

import { resetSoundOutput } from "@/lib/audio/sfx";
import type { RoomTransport, VoiceCall, VoiceMember } from "./transport";

interface Line {
  call: VoiceCall;
  /** Address the call went to; a new address (they reconnected) means a new call. */
  peerId: string;
  startedAt: number;
  audio?: HTMLAudioElement;
  meter?: AnalyserNode;
  /** Since when the connection has been lost (0: it's fine). */
  downSince?: number;
}

/** A call that hasn't connected after this long is dropped and tried again. */
const CONNECT_TIMEOUT = 12_000;
/** A call whose connection has been lost this long is dropped and tried again. */
const DOWN_TIMEOUT = 6_000;
/** Speaking indicator: how loud counts as talking (RMS, 0-1). */
const SPEAKING_LEVEL = 0.035;

export class VoiceChat {
  /** In voice chat at this table (calls placed / taken). */
  on = false;
  /** My microphone is on. Off whenever I join a table. */
  micOn = false;
  /** Player ids talking right now ("me" included as my own id). */
  speaking = new Set<string>();
  /** The phone won't play someone's voice until the page is tapped. */
  blocked = false;

  /** The microphone, while it's on. */
  private mic: MediaStream | null = null;
  /** What my calls send while the mic is off. */
  private silence: MediaStreamTrack | null = null;
  private lines = new Map<string, Line>();
  /** Who I hear: everyone unless the speaker button turned them all off, then per-player choices. */
  private hearAll = true;
  private hearOne = new Map<string, boolean>();
  private ctx: AudioContext | null = null;
  private myMeter: AnalyserNode | null = null;
  private meterTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly changed: () => void) {}

  /** Join listening: speaker on, mic off. */
  start() {
    if (this.on) return;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.silence = this.ctx.createMediaStreamDestination().stream.getAudioTracks()[0] || null;
    } catch {
      this.ctx = null; // can still talk (and hear) once the mic is on
    }
    this.on = true;
    this.micOn = false;
    this.hearAll = true;
    this.hearOne.clear();
    this.meterTimer = setInterval(() => this.measure(), 200);
    // Phones only play sound after a tap: start anything that was held back on the next one.
    if (typeof document !== "undefined") document.addEventListener("pointerdown", this.unlock, { passive: true });
    this.changed();
  }

  /** Leave voice chat: hang up, close the microphone. */
  stop() {
    for (const pid of [...this.lines.keys()]) this.hangUp(pid);
    // Closing the microphone changes the phone's audio: start the game sounds afresh.
    if (this.mic) {
      this.closeMic();
      resetSoundOutput();
    }
    this.blocked = false;
    this.silence?.stop();
    this.silence = null;
    if (this.meterTimer) clearInterval(this.meterTimer);
    this.meterTimer = null;
    if (typeof document !== "undefined") document.removeEventListener("pointerdown", this.unlock);
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.speaking.clear();
    const was = this.on;
    this.on = false;
    this.micOn = false;
    if (was) this.changed();
  }

  /** Turn my microphone on (asks for it the first time; throws if refused) or off. */
  async setMic(on: boolean) {
    if (on === this.micOn) return;
    if (on) {
      // Open the microphone the first time (or again, if it was lost); after that it's just switched on.
      if (!this.micTrack()) {
        const mic = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
        if (!this.on) {
          mic.getTracks().forEach((t) => t.stop());
          return;
        }
        this.mic = mic;
        this.myMeter = this.meter(mic);
        mic.getAudioTracks()[0]?.addEventListener("ended", this.micLost);
      }
      this.mic?.getAudioTracks().forEach((t) => (t.enabled = true));
      this.micOn = true;
    } else {
      // Silenced, not closed (see the top of this file).
      this.mic?.getAudioTracks().forEach((t) => (t.enabled = false));
      this.micOn = false;
      this.speaking.delete("me");
    }
    this.sendOut();
    this.keepPlaying();
    this.changed();
  }

  /** The microphone stopped by itself (unplugged, or the phone took it away): send silence instead. */
  private micLost = () => {
    this.closeMic();
    this.micOn = false;
    this.sendOut();
    this.changed();
  };

  /** Put what I send (microphone or silence) into every call. */
  private sendOut() {
    const track = this.outTrack();
    for (const [pid, line] of this.lines) if (!track || !line.call.sendTrack(track)) this.hangUp(pid); // called again with the new sound
  }

  /** The open microphone, if there is one. */
  private micTrack() {
    const t = this.mic?.getAudioTracks()[0];
    return t && t.readyState === "live" ? t : null;
  }

  /** Make sure everyone I should hear is playing (phones pause them when their audio changes). */
  private keepPlaying() {
    for (const [pid, line] of this.lines) {
      const a = line.audio;
      if (!a || !this.hears(pid) || !a.paused) continue;
      a.play().then(
        () => this.setBlocked(false),
        () => this.setBlocked(true),
      );
    }
  }
  private setBlocked(b: boolean) {
    if (this.blocked === b) return;
    this.blocked = b;
    this.changed();
  }

  /** A tap on "Tap to hear": play everyone (a tap lets the phone start sound). */
  resumeAll() {
    if (this.ctx && this.ctx.state !== "running") void this.ctx.resume().catch(() => {});
    this.blocked = false;
    this.keepPlaying();
    this.changed();
  }

  /** The speaker button: hear everyone, or no one. */
  setSpeaker(on: boolean) {
    this.hearAll = on;
    this.hearOne.clear();
    this.applyHearing();
  }
  /** Hear / stop hearing one player (for me only). */
  setHear(pid: string, on: boolean) {
    this.hearOne.set(pid, on);
    this.applyHearing();
  }
  hears(pid: string) {
    return this.hearOne.get(pid) ?? this.hearAll;
  }
  /** Do I hear any of these players? (With nobody else here: is my speaker on?) */
  hearsAny(pids: string[]) {
    return pids.length ? pids.some((p) => this.hears(p)) : this.hearAll;
  }

  /**
   * Bring my calls in line with who is in voice chat: call new people,
   * hang up on people who left, retry calls that never connected.
   */
  sync(members: VoiceMember[], myId: string, transport: RoomTransport | null) {
    const out = this.outStream();
    if (!this.on || !out) return;
    const now = Date.now();
    const others = new Map(members.filter((m) => m.id !== myId && m.peerId).map((m) => [m.id, m]));
    for (const [pid, line] of this.lines) {
      const m = others.get(pid);
      const stale = !line.audio && now - line.startedAt > CONNECT_TIMEOUT;
      // Dead, or lost for a while: hang up, and it's placed again below (or by them).
      const health = line.call.health?.() || "ok";
      if (health === "down") line.downSince ||= now;
      else line.downSince = 0;
      const dead = health === "dead" || (!!line.downSince && now - line.downSince > DOWN_TIMEOUT);
      if (!m || m.peerId !== line.peerId || stale || dead) this.hangUp(pid);
    }
    this.keepPlaying();
    if (!transport) return;
    for (const m of others.values()) {
      if (this.lines.has(m.id) || !(myId < m.id)) continue;
      const call = transport.call(m.peerId, myId, out);
      if (call) this.attach(m.id, m.peerId, call);
    }
  }

  /** Someone is calling me. */
  incoming(call: VoiceCall) {
    const out = this.outStream();
    if (!this.on || !out || !call.pid) {
      call.close();
      return;
    }
    // A fresh call from them replaces any old one (e.g. they reconnected).
    if (this.lines.has(call.pid)) this.hangUp(call.pid);
    call.answer(out);
    this.attach(call.pid, call.peerId, call);
  }

  /** What my calls send: the microphone once it's been opened (switched off, it sends nothing), silence before that. */
  private outTrack(): MediaStreamTrack | null {
    return this.micTrack() || this.silence;
  }
  private outStream(): MediaStream | null {
    const t = this.outTrack();
    return t ? new MediaStream([t]) : null;
  }

  private closeMic() {
    this.mic?.getAudioTracks()[0]?.removeEventListener("ended", this.micLost);
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = null;
    this.myMeter = null;
    this.speaking.delete("me");
  }

  private applyHearing() {
    for (const [pid, line] of this.lines) if (line.audio) line.audio.muted = !this.hears(pid);
    this.changed();
  }

  private unlock = () => {
    if (this.ctx && this.ctx.state !== "running") void this.ctx.resume().catch(() => {});
    this.keepPlaying();
  };

  private attach(pid: string, peerId: string, call: VoiceCall) {
    const line: Line = { call, peerId, startedAt: Date.now() };
    this.lines.set(pid, line);
    call.onStream((remote) => {
      if (this.lines.get(pid) !== line) return;
      const audio = new Audio();
      audio.autoplay = true;
      audio.setAttribute("playsinline", "");
      audio.srcObject = remote;
      audio.muted = !this.hears(pid);
      line.audio = audio;
      // A phone may refuse to start it without a tap: then "Tap to hear" shows.
      audio.play().then(
        () => this.setBlocked(false),
        () => this.setBlocked(true),
      );
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
    if (this.micOn && loud(this.myMeter)) next.add("me");
    for (const [pid, line] of this.lines) if (this.hears(pid) && loud(line.meter)) next.add(pid);
    const same = next.size === this.speaking.size && [...next].every((p) => this.speaking.has(p));
    if (same) return;
    this.speaking = next;
    this.changed();
  }
}
