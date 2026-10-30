// Peer-to-peer rooms via PeerJS (free public signalling server).
// Room "abc123" is hosted by whoever holds the peer id PREFIX + "abc123".
import type { DataConnection, MediaConnection, Peer as PeerType } from "peerjs";
import type { NetMessage, PeerLink, RoomEvents, RoomTransport, VoiceCall } from "./transport";

const PREFIX = "ludotable-v4-";
/** A guest whose connection to the host hasn't opened by now gives up and tries again. */
const CONNECT_TIMEOUT = 10_000;

/** Start downloading PeerJS early (e.g. while the menu shows), so opening a room doesn't wait for it. */
export function preloadPeer() {
  void import("peerjs").catch(() => {});
}

class Link implements PeerLink {
  pid?: string;
  constructor(readonly conn: DataConnection) {}
  get open() {
    return this.conn.open;
  }
  send(msg: NetMessage) {
    try {
      if (this.conn.open) this.conn.send(msg);
    } catch {
      /* closed meanwhile */
    }
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
  onStream(cb: (stream: MediaStream) => void) {
    this.mc.on("stream", cb);
  }
  onClose(cb: () => void) {
    this.mc.on("close", cb);
    this.mc.on("error", cb);
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

  async open(code: string, events: RoomEvents) {
    const { Peer } = await import("peerjs");
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
        // Someone already hosts this room: join them as a guest.
        destroy(host);
        const ready = this.spare && !spareFailed ? this.spare : new Peer();
        if (ready !== this.spare) destroy(this.spare);
        this.spare = null;
        this.joinAsGuest(ready, code, events);
      } else if (e.type === "network" || e.type === "server-error" || e.type === "socket-error") {
        events.lost("network");
      }
    });
  }

  private joinAsGuest(peer: PeerType, code: string, events: RoomEvents) {
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
      events.lost(e.type === "peer-unavailable" ? "host-left" : "network");
    });
  }

  broadcast(msg: NetMessage, except?: PeerLink) {
    if (this.isHost) this.links.forEach((l) => l !== except && l.send(msg));
    else this.sendToHost(msg);
  }

  sendToHost(msg: NetMessage) {
    if (this.hostConn && this.hostConn.open) {
      try {
        this.hostConn.send(msg);
        return true;
      } catch {
        return false;
      }
    }
    return false;
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
