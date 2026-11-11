// Peer-to-peer rooms via PeerJS (free public signalling server).
// Room "abc123" is hosted by whoever holds the peer id PREFIX + "abc123".
import type { DataConnection, MediaConnection, Peer as PeerType } from "peerjs";
import type { GameState } from "@/lib/game/types";
import type { NetMessage, PeerLink, RoomEvents, RoomTransport, VoiceCall } from "./transport";

const PREFIX = "ludotable-v4-";
/** A guest whose connection to the host hasn't opened by now gives up and tries again. */
const CONNECT_TIMEOUT = 10_000;
/** Looking at a room (is my game still on?): no answer by now counts as nobody there. */
const PROBE_TIMEOUT = 9_000;

/**
 * PeerJS, loaded when a room opens. The browser downloads it ahead of time
 * when it's idle (webpackPrefetch: a low-priority <link rel="prefetch">), so
 * opening a room doesn't wait for the download, and it only runs (about 0.4s
 * of work on a phone) when it's needed. Running it early froze whatever
 * screen was showing.
 */
const loadPeer = () => import(/* webpackPrefetch: true */ "peerjs");

/**
 * For testing only: localStorage "ludo.netChaos" = {"delay": [min, max], "drop": p}
 * makes this device's connection slow (every message late by min-max ms, still
 * in order, like a slow relay) and lossy (a share p of messages never arrive).
 * Off unless set.
 */
const CHAOS: { delay?: [number, number]; drop?: number } | null = (() => {
  try {
    const v = typeof localStorage !== "undefined" ? JSON.parse(localStorage.getItem("ludo.netChaos") || "null") : null;
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
})();
/** `send`, through the test chaos when it's on. */
function chaotic(send: (m: NetMessage) => void) {
  if (!CHAOS) return send;
  let due = 0;
  return (m: NetMessage) => {
    if (Math.random() < (CHAOS.drop || 0)) return;
    const [a, b] = CHAOS.delay || [0, 0];
    due = Math.max(due, Date.now() + a + Math.random() * (b - a));
    setTimeout(() => send(m), due - Date.now());
  };
}

class Link implements PeerLink {
  pid?: string;
  private out = chaotic((msg) => {
    try {
      if (this.conn.open) this.conn.send(msg);
    } catch {
      /* closed meanwhile */
    }
  });
  constructor(readonly conn: DataConnection) {}
  get open() {
    return this.conn.open;
  }
  send(msg: NetMessage) {
    this.out(msg);
  }
}

class PeerVoiceCall implements VoiceCall {
  readonly pid: string;
  constructor(private readonly mc: MediaConnection) {
    const meta = mc.metadata as { pid?: unknown } | undefined;
    this.pid = String(meta?.pid || "");
  }
  get peerId() {
    return this.mc.peer;
  }
  answer(stream: MediaStream) {
    this.mc.answer(stream);
  }
  sendTrack(track: MediaStreamTrack) {
    try {
      const sender = this.mc.peerConnection?.getSenders().find((s) => !s.track || s.track.kind === "audio");
      if (!sender) return false;
      void sender.replaceTrack(track).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }
  onStream(cb: (stream: MediaStream) => void) {
    this.mc.on("stream", cb);
  }
  onClose(cb: () => void) {
    this.mc.on("close", cb);
    this.mc.on("error", cb);
  }
  async level(): Promise<number | null> {
    const pc = this.mc.peerConnection;
    if (!pc || pc.connectionState === "closed") return null;
    let lv: number | null = null;
    try {
      (await pc.getStats()).forEach((r) => {
        if (r.type === "inbound-rtp" && r.kind === "audio" && typeof r.audioLevel === "number") lv = Math.max(lv ?? 0, r.audioLevel);
      });
    } catch {
      return null;
    }
    return lv;
  }
  health(): "ok" | "down" | "dead" {
    // PeerJS doesn't always tell one end that the other hung up: look at the connection itself.
    const pc = this.mc.peerConnection;
    if (!pc) return "ok"; // still being set up
    const st = pc.connectionState || pc.iceConnectionState;
    if (st === "failed" || st === "closed") return "dead";
    if (st === "disconnected") return "down";
    return "ok";
  }
  close() {
    try {
      this.mc.close();
    } catch {
      /* already closed */
    }
  }
}

const destroy = (p: PeerType | null) => {
  try {
    p?.destroy();
  } catch {
    /* ignore */
  }
};

export class PeerRoomTransport implements RoomTransport {
  private peer: PeerType | null = null;
  /** Registered alongside the hosting attempt, ready to join if the room is taken. */
  private spare: PeerType | null = null;
  private links: Link[] = [];
  private hostConn: DataConnection | null = null;
  private closed = false;
  private callHandler: ((call: VoiceCall) => void) | null = null;
  isHost = false;

  /** Voice chat calls can arrive on whichever peer this device is using. */
  private listenForCalls(peer: PeerType) {
    peer.on("call", (mc) => {
      if (this.closed || !this.callHandler || peer !== this.peer) {
        mc.close();
        return;
      }
      this.callHandler(new PeerVoiceCall(mc));
    });
  }

  private keepAlive(peer: PeerType) {
    peer.on("disconnected", () => {
      if (!this.closed && peer === this.peer && !peer.destroyed) {
        try {
          peer.reconnect();
        } catch {
          /* ignore */
        }
      }
    });
  }

  async open(code: string, events: RoomEvents, opts: { join?: boolean } = {}) {
    const { Peer } = await loadPeer();
    if (this.closed) return;
    // Try to host the room and, at the same time, register a second address to
    // join it with. If the room is already hosted we connect straight away
    // instead of waiting for the server's "taken" reply first (about a second).
    const host = new Peer(PREFIX + code);
    const spare = new Peer();
    this.peer = host;
    this.spare = spare;
    let spareFailed = false;
    spare.on("error", () => {
      if (this.spare === spare) spareFailed = true;
    });
    this.listenForCalls(host);
    this.keepAlive(host);

    host.on("open", () => {
      if (this.closed) return;
      destroy(this.spare);
      this.spare = null;
      // Joining only, and the room's address was free: nobody hosts it. Let it go again at once.
      // (Asking the server for an address nobody has only fails after many seconds; this takes one.)
      if (opts.join) {
        // (Not ours any more before it's let go: letting go reads as a lost connection, which keepAlive would answer by taking the address back.)
        this.peer = null;
        destroy(host);
        if (events.noRoom) events.noRoom();
        else events.lost("network");
        return;
      }
      this.isHost = true;
      events.hosting();
    });
    host.on("connection", (conn) => {
      if (this.closed) return;
      const link = new Link(conn);
      this.links.push(link);
      conn.on("open", () => {
        if (!this.closed) events.peerOpened(link);
      });
      conn.on("data", (m) => {
        if (this.closed || !m || typeof m !== "object") return;
        events.peerMessage(link, m as NetMessage);
      });
      conn.on("close", () => {
        this.links = this.links.filter((x) => x !== link);
        if (!this.closed) events.peerClosed(link);
      });
    });
    host.on("error", (e: { type?: string }) => {
      if (this.closed || this.peer !== host) return;
      if (e.type === "unavailable-id") {
        // Someone already hosts this room: join them as a guest. (Not ours before it's let go: see above.)
        this.peer = null;
        destroy(host);
        const ready = this.spare && !spareFailed ? this.spare : new Peer();
        if (ready !== this.spare) destroy(this.spare);
        this.spare = null;
        this.joinAsGuest(ready, code, events, !!opts.join);
      } else if (e.type === "network" || e.type === "server-error" || e.type === "socket-error") {
        events.lost("network");
      }
    });
  }

  private joinAsGuest(peer: PeerType, code: string, events: RoomEvents, joinOnly = false) {
    this.isHost = false;
    this.peer = peer;
    this.listenForCalls(peer);
    this.keepAlive(peer);
    const connect = () => {
      if (this.closed || this.peer !== peer) return;
      // JSON: lighter to encode than PeerJS's default binary packing.
      const conn = peer.connect(PREFIX + code, { reliable: true, serialization: "json" });
      this.hostConn = conn;
      // The server may still list a host whose phone dropped off without closing
      // the connection; nobody answers then. Give up and try again instead of waiting forever.
      const timer = setTimeout(() => {
        if (!this.closed && this.hostConn === conn && !conn.open) events.lost("network");
      }, CONNECT_TIMEOUT);
      conn.on("open", () => {
        clearTimeout(timer);
        if (!this.closed) events.joinedHost();
      });
      conn.on("data", (m) => {
        if (this.closed || !m || typeof m !== "object") return;
        events.hostMessage(m as NetMessage);
      });
      conn.on("close", () => {
        clearTimeout(timer);
        if (!this.closed && this.hostConn === conn) events.lost("host-left");
      });
    };
    if (peer.open) connect();
    else peer.on("open", connect);
    peer.on("error", (e: { type?: string }) => {
      if (this.closed || this.peer !== peer) return;
      // (Nobody has the room's address: when only joining, there's no such room.)
      if (e.type === "peer-unavailable" && joinOnly && !this.hostConn?.open && events.noRoom) events.noRoom();
      else events.lost(e.type === "peer-unavailable" ? "host-left" : "network");
    });
  }

  async probe(code: string): Promise<GameState | null> {
    const { Peer } = await loadPeer();
    if (this.closed) return null;
    return new Promise((resolve) => {
      const peer = new Peer();
      this.peer = peer;
      let done = false;
      const finish = (s: GameState | null) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        destroy(peer);
        resolve(s);
      };
      const timer = setTimeout(() => finish(null), PROBE_TIMEOUT);
      peer.on("open", () => {
        const conn = peer.connect(PREFIX + code, { reliable: true, serialization: "json" });
        // The host sends its game as soon as anyone connects.
        conn.on("data", (m) => {
          const msg = m as NetMessage;
          if (msg && typeof msg === "object" && msg.type === "state") finish(msg.state);
        });
        conn.on("close", () => finish(null));
      });
      peer.on("error", () => finish(null));
    });
  }

  broadcast(msg: NetMessage, except?: PeerLink) {
    if (this.isHost) this.links.forEach((l) => l !== except && l.send(msg));
    else this.sendToHost(msg);
  }

  private toHost = chaotic((msg) => {
    try {
      if (this.hostConn?.open) this.hostConn.send(msg);
    } catch {
      /* closed meanwhile */
    }
  });
  sendToHost(msg: NetMessage) {
    if (!this.hostConn || !this.hostConn.open) return false;
    try {
      this.toHost(msg);
      return true;
    } catch {
      return false;
    }
  }

  guestCount() {
    return this.links.filter((l) => l.open).length;
  }

  peerId() {
    return this.peer && !this.peer.destroyed && this.peer.open ? this.peer.id : null;
  }

  call(peerId: string, myPid: string, stream: MediaStream) {
    if (this.closed || !this.peer || this.peer.destroyed) return null;
    try {
      const mc = this.peer.call(peerId, stream, { metadata: { pid: myPid } });
      return mc ? new PeerVoiceCall(mc) : null;
    } catch {
      return null;
    }
  }

  onCall(cb: (call: VoiceCall) => void) {
    this.callHandler = cb;
  }
  close() {
    this.closed = true;
    this.links.forEach((l) => {
      try {
        l.conn.close();
      } catch {
        /* ignore */
      }
    });
    this.links = [];
    this.hostConn = null;
    this.isHost = false;
    destroy(this.spare);
    this.spare = null;
    destroy(this.peer);
    this.peer = null;
  }
}

export const createPeerTransport = () => new PeerRoomTransport();
