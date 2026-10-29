// Peer-to-peer rooms via PeerJS (free public signalling server).
// Room "abc123" is hosted by whoever holds the peer id PREFIX + "abc123".
import type { DataConnection, MediaConnection, Peer as PeerType } from "peerjs";
import type { NetMessage, PeerLink, RoomEvents, RoomTransport, VoiceCall } from "./transport";

const PREFIX = "ludotable-v4-";

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

export class PeerRoomTransport implements RoomTransport {
  private peer: PeerType | null = null;
  private links: Link[] = [];
  private hostConn: DataConnection | null = null;
  private closed = false;
  private callHandler: ((call: VoiceCall) => void) | null = null;
  isHost = false;

  /** Voice chat calls can arrive on whichever peer this device is using. */
  private listenForCalls(peer: PeerType) {
    peer.on("call", (mc) => {
      if (this.closed || !this.callHandler) {
        mc.close();
        return;
      }
      this.callHandler(new PeerVoiceCall(mc));
    });
  }

  async open(code: string, events: RoomEvents) {
    const { Peer } = await import("peerjs");
    if (this.closed) return;
    const peer = new Peer(PREFIX + code);
    this.peer = peer;
    this.listenForCalls(peer);

    peer.on("open", () => {
      if (this.closed) return;
      this.isHost = true;
      events.hosting();
    });
    peer.on("connection", (conn) => {
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
    peer.on("error", (e: { type?: string }) => {
      if (this.closed) return;
      if (e.type === "unavailable-id") {
        // Someone already hosts this room: join them as a guest.
        try {
          peer.destroy();
        } catch {
          /* ignore */
        }
        this.joinAsGuest(Peer, code, events);
      } else if (e.type === "network" || e.type === "server-error" || e.type === "socket-error") {
        events.lost("network");
      }
    });
    peer.on("disconnected", () => {
      if (!this.closed && this.peer && !this.peer.destroyed) {
        try {
          this.peer.reconnect();
        } catch {
          /* ignore */
        }
      }
    });
  }

  private joinAsGuest(Peer: typeof PeerType, code: string, events: RoomEvents) {
    this.isHost = false;
    const peer = new Peer();
    this.peer = peer;
    this.listenForCalls(peer);
    peer.on("open", () => {
      if (this.closed) return;
      const conn = peer.connect(PREFIX + code, { reliable: true });
      this.hostConn = conn;
      conn.on("open", () => {
        if (!this.closed) events.joinedHost();
      });
      conn.on("data", (m) => {
        if (this.closed || !m || typeof m !== "object") return;
        events.hostMessage(m as NetMessage);
      });
      conn.on("close", () => {
        if (!this.closed) events.lost("host-left");
      });
    });
    peer.on("error", (e: { type?: string }) => {
      if (this.closed) return;
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
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        /* ignore */
      }
      this.peer = null;
    }
  }
}

export const createPeerTransport = () => new PeerRoomTransport();
