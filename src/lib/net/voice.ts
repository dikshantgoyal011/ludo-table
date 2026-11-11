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
//
// A phone call (or another app taking the microphone) interrupts voice chat: the
// phone takes the microphone, and afterwards it can stay silent ("muted") or be
// closed, and the others' voices can stay paused or silent. When the page is back
// in front, and whenever the microphone has been silent for a while, the
// microphone is opened again by itself (the mic stays on, as it was) and every
// voice is started again. Nobody has to turn anything off and on, or reload.

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
  /** The other player's `gen` when this call was made (see VoiceMember.gen). */
  gen?: number;
  /** How loud their voice last arrived, from the call's own figures (null: not known, use `meter`). */
  level?: number | null;
}

/** A call that hasn't connected after this long is dropped and tried again. */
const CONNECT_TIMEOUT = 12_000;
/** A call whose connection has been lost this long is dropped and tried again. */
const DOWN_TIMEOUT = 6_000;
/** The microphone silenced by the phone (a call) this long, with the page in front: open it again. */
const MIC_SILENT_MS = 2_500;
/** Opening the microphone again (it fails while a call still has it): no more often than this. */
const MIC_RETRY_MS = 3_000;
const MIC_OPTIONS: MediaStreamConstraints = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false };
/** Speaking indicator: how loud counts as talking (RMS, 0-1). */
const SPEAKING_LEVEL = 0.035;
/** The same, from a call's own figures of how loud a voice arrives (0-1). */
const SPEAKING_ARRIVING = 0.012;

export class VoiceChat {
  /** In voice chat at this table (calls placed / taken). */
  on = false;
  /** My microphone is on. Off whenever I join a table. */
  micOn = false;
  /** Player ids talking right now ("me" included as my own id). */
  speaking = new Set<string>();
  /** The phone won't play someone's voice until the page is tapped. */
  blocked = false;
  /**
   * Goes up each time I lose a call that the other player places (the one with
   * the smaller id calls). Shared through the host (VoiceMember.gen): seeing it
   * change, they call me again at once instead of waiting for their end of the
   * dead call to time out.
   */
  gen = 0;
  /** Tell the table my voice status again (set by the game: my `gen` changed). */
  onLost: (() => void) | null = null;
  /** Who is in voice chat, as last shared by the host. */
  private roster = new Map<string, VoiceMember>();

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
  /** When the page was hidden (a phone call, another app in front), and since when my microphone has been silenced by the phone. */
  private hiddenAt = 0;
  private micSilentSince = 0;
  private micTriedAt = 0;
  private reopening = false;

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
    this.gen = 0;
    this.hearAll = true;
    this.hearOne.clear();
    this.meterTimer = setInterval(() => this.measure(), 200);
    // Phones only play sound after a tap: start anything that was held back on the next one.
    if (typeof document !== "undefined") {
      document.addEventListener("pointerdown", this.unlock, { passive: true });
      // Back in front after a phone call (or another app): get everything going again.
      document.addEventListener("visibilitychange", this.onVisibility);
      window.addEventListener("pageshow", this.onBack);
      window.addEventListener("focus", this.onBack);
    }
    this.hiddenAt = 0;
    this.micSilentSince = 0;
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
    if (typeof document !== "undefined") {
      document.removeEventListener("pointerdown", this.unlock);
      document.removeEventListener("visibilitychange", this.onVisibility);
      window.removeEventListener("pageshow", this.onBack);
      window.removeEventListener("focus", this.onBack);
    }
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.meters.clear();
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
        const mic = await navigator.mediaDevices.getUserMedia(MIC_OPTIONS);
        if (!this.on) {
          mic.getTracks().forEach((t) => t.stop());
          return;
        }
        this.useMic(mic);
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

  /** A newly opened microphone: its level meter, and watching it for the phone taking it away. */
  private useMic(mic: MediaStream) {
    this.mic = mic;
    this.myMeter = this.meter(mic);
    const t = mic.getAudioTracks()[0];
    t?.addEventListener("ended", this.micLost);
    t?.addEventListener("mute", this.micMuted);
    t?.addEventListener("unmute", this.micMuted);
    this.micSilentSince = t?.muted ? Date.now() : 0;
  }

  /**
   * The microphone stopped by itself (the phone took it for a call, or it was
   * unplugged): silence goes out meanwhile, and it's opened again as soon as it
   * can be, the mic staying on.
   */
  private micLost = () => {
    const wasOn = this.micOn;
    this.closeMic();
    this.micOn = wasOn;
    this.sendOut();
    this.changed();
    if (wasOn) void this.reopenMic();
  };
  /** The phone silenced the microphone (a call), or gave it back. */
  private micMuted = () => {
    const t = this.mic?.getAudioTracks()[0];
    this.micSilentSince = t?.muted ? this.micSilentSince || Date.now() : 0;
  };
  /** Is my microphone, though on, not sending anything (closed, or silenced by the phone for a while)? */
  private micStuck() {
    if (!this.micOn) return false;
    const t = this.micTrack();
    return !t || (t.muted && !!this.micSilentSince && Date.now() - this.micSilentSince > MIC_SILENT_MS);
  }
  /** Open the microphone again (after a phone call) and put it into every call. Kept on if it can't be yet: tried again later. */
  private async reopenMic() {
    if (this.reopening || !this.on || !this.micOn || !navigator.mediaDevices?.getUserMedia) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    this.reopening = true;
    this.micTriedAt = Date.now();
    try {
      const mic = await navigator.mediaDevices.getUserMedia(MIC_OPTIONS);
      if (!this.on || !this.micOn) {
        mic.getTracks().forEach((t) => t.stop());
        return;
      }
      const old = this.mic;
      if (old) {
        old.getAudioTracks()[0]?.removeEventListener("ended", this.micLost);
        old.getAudioTracks()[0]?.removeEventListener("mute", this.micMuted);
        old.getAudioTracks()[0]?.removeEventListener("unmute", this.micMuted);
        this.dropMeter(this.myMeter);
      }
      this.useMic(mic);
      this.sendOut();
      old?.getTracks().forEach((t) => t.stop());
      this.changed();
    } catch (e) {
      // Not allowed any more: the mic goes off. (Still busy with the call: tried again later.)
      if ((e as Error)?.name === "NotAllowedError") {
        this.micOn = false;
        this.changed();
      }
    } finally {
      this.reopening = false;
    }
  }

  private onVisibility = () => {
    if (document.visibilityState === "hidden") {
      this.hiddenAt ||= Date.now();
      return;
    }
    this.onBack();
  };
  /** The page is in front again: after being away (a phone call), start every voice again and check the microphone. */
  private onBack = () => {
    if (!this.on || (typeof document !== "undefined" && document.visibilityState === "hidden")) return;
    const away = !!this.hiddenAt;
    this.hiddenAt = 0;
    this.heal(away);
  };
  /**
   * Get voice chat going again: the sound running, every voice I should hear
   * playing (`restart`: started afresh, as after a phone call a voice can be left
   * silent without being paused), and my microphone open if it's on.
   */
  heal(restart = false) {
    if (!this.on) return;
    if (this.ctx && this.ctx.state !== "running") void this.ctx.resume().catch(() => {});
    if (restart) for (const [pid, line] of this.lines) if (line.audio) this.replay(pid, line);
    this.keepPlaying();
    if (this.micOn && (!this.micTrack() || this.micStuck())) void this.reopenMic();
  }
  /** Start one voice afresh (the same stream, played again). */
  private replay(pid: string, line: Line) {
    const a = line.audio;
    if (!a) return;
    const src = a.srcObject;
    a.srcObject = null;
    a.srcObject = src;
    a.muted = !this.hears(pid);
    if (this.hears(pid))
      a.play().then(
        () => this.setBlocked(false),
        () => this.setBlocked(true),
      );
  }

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
    this.roster = others;
    let lost = false;
    for (const [pid, line] of this.lines) {
      const m = others.get(pid);
      const stale = !line.audio && now - line.startedAt > CONNECT_TIMEOUT;
      // Dead, or lost for a while: hang up, and it's placed again below (or by them).
      const health = line.call.health?.() || "ok";
      if (health === "down") line.downSince ||= now;
      else line.downSince = 0;
      const dead = health === "dead" || (!!line.downSince && now - line.downSince > DOWN_TIMEOUT);
      // They lost their end of our call (their gen went up): call again.
      const redial = !!m && (m.gen || 0) !== (line.gen || 0);
      if (!m || m.peerId !== line.peerId || stale || dead || redial) {
        this.hangUp(pid);
        // A call they place: tell them to place it again.
        if ((stale || dead) && !(myId < pid)) lost = true;
      }
    }
    if (lost) {
      this.gen++;
      this.onLost?.();
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
    this.mic?.getAudioTracks()[0]?.removeEventListener("mute", this.micMuted);
    this.mic?.getAudioTracks()[0]?.removeEventListener("unmute", this.micMuted);
    this.micSilentSince = 0;
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = null;
    this.dropMeter(this.myMeter);
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
    const line: Line = { call, peerId, startedAt: Date.now(), gen: this.roster.get(pid)?.gen || 0 };
    this.lines.set(pid, line);
    call.onStream((remote) => {
      if (this.lines.get(pid) !== line) return;
      const audio = new Audio();
      audio.autoplay = true;
      audio.setAttribute("playsinline", "");
      audio.srcObject = remote;
      audio.muted = !this.hears(pid);
      line.audio = audio;
      // The phone paused it (its sound went to a call): play it again as soon as it can.
      audio.addEventListener("pause", () => {
        if (this.lines.get(pid) === line && this.hears(pid)) setTimeout(() => this.keepPlaying(), 400);
      });
      // Their microphone came back (after a call on their side): start their voice afresh.
      remote.getAudioTracks().forEach((t) =>
        t.addEventListener("unmute", () => {
          if (this.lines.get(pid) === line) this.replay(pid, line);
        }),
      );
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
    this.dropMeter(line.meter);
    if (line.audio) {
      line.audio.pause();
      line.audio.srcObject = null;
    }
    this.speaking.delete(pid);
  }

  /**
   * A level meter on a stream (for the speaking lights). The whole chain is kept
   * referenced and ends at the speakers through a volume of zero: a chain that
   * goes nowhere can be thrown away by the browser (Chrome does), and the light
   * then stayed dark for good while the voice itself still played.
   */
  private meter(stream: MediaStream): AnalyserNode | null {
    if (!this.ctx) return null;
    try {
      const src = this.ctx.createMediaStreamSource(stream);
      const an = this.ctx.createAnalyser();
      an.fftSize = 512;
      const mute = this.ctx.createGain();
      mute.gain.value = 0; // playback is the <audio> element, not this
      src.connect(an);
      an.connect(mute);
      mute.connect(this.ctx.destination);
      this.meters.set(an, { src, mute });
      return an;
    } catch {
      return null;
    }
  }
  /** Each meter's nodes, kept so they aren't thrown away (and to disconnect them when done). */
  private meters = new Map<AnalyserNode, { src: MediaStreamAudioSourceNode; mute: GainNode }>();
  private dropMeter(an?: AnalyserNode | null) {
    const m = an && this.meters.get(an);
    if (!an || !m) return;
    this.meters.delete(an);
    try {
      m.src.disconnect();
      an.disconnect();
      m.mute.disconnect();
    } catch {
      /* already gone */
    }
  }

  private measure() {
    if (this.micStuck() && !this.reopening && Date.now() - this.micTriedAt > MIC_RETRY_MS) void this.reopenMic();
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
    for (const [pid, line] of this.lines) {
      if (!this.hears(pid)) continue;
      // Others: how loud their voice arrives, as the call itself measures it. (A meter on the
      // arriving sound sometimes heard only silence while the voice played fine, on a phone
      // that hadn't opened its own microphone: the light then stayed dark.)
      if (line.call.level)
        void line.call.level().then((v) => {
          if (this.lines.get(pid) === line) line.level = v;
        });
      if (typeof line.level === "number" ? line.level > SPEAKING_ARRIVING : loud(line.meter)) next.add(pid);
    }
    const same = next.size === this.speaking.size && [...next].every((p) => this.speaking.has(p));
    if (same) return;
    this.speaking = next;
    this.changed();
  }
}
