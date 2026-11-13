// Peer-to-peer rooms via PeerJS (free public signalling server).
// Room "abc123" is hosted by whoever holds the peer id PREFIX + "abc123" (or, while
// that address is held by a connection that has died, its backup address: see open).
import type { DataConnection, MediaConnection, Peer as PeerType } from "peerjs";
import type { GameState } from "@/lib/game/types";
import type { NetMessage, PeerLink, RoomEvents, RoomTransport, VoiceCall } from "./transport";

const PREFIX = "ludotable-v4-";
/** The room's address, or its backup address. */
const addressOf = (code: string, backup = false) => PREFIX + code + (backup ? "-b" : "");
/** A guest whose connection to the host hasn't opened by now gives up and tries again. */
const CONNECT_TIMEOUT = 10_000;
/** Looking at a room (is my game still on?): no answer by now counts as nobody there. */
const PROBE_TIMEOUT = 9_000;
/**
 * Guest, the host quiet: another connection to it is tried this often (see refresh), each
 * given this long to open. Several on their way at once: one tried while the host's phone
 * was still off the network never opens, and the next one shouldn't wait for it to give up.
 */
const REFRESH_EVERY_MS = 2_000;
const REFRESH_TIMEOUT = 6_000;
/** Hosting at the backup address: the room's own address is looked at this often (has its host come back?). */
const WATCH_MAIN_MS = 5_000;
/** The connection server unreachable for longer than this counts as this device being offline. */
const SERVER_DOWN_MS = 1_500;
/**
 * The server takes back an address for the tab that held it (same token) without
 * saying so: no "taken" this long after connecting means the address is mine.
 */
const RECLAIM_QUIET_MS = 1_500;
/**
 * Host: a guest quiet for longer than this (and not for longer than the second) is called back
 * (see callBack). A phone back on a network after changing it can be reached by nobody for a
 * minute or more (the server sends what's for it to its dead connection), but it can reach out.
 */
const CALL_BACK_QUIET_MS = 3_000;
const CALL_BACK_FOR_MS = 120_000;
/** Connecting to the server again: not through by now (and still trying), try afresh. */
const RECONNECT_HUNG_MS = 3_000;
/** Joining from a link: the room looked empty or didn't answer; looked at again this many times, this long after. */
const JOIN_TRIES = 2;
const JOIN_AGAIN_MS = 1_500;
const JOIN_TIMEOUT = 6_000;
/** Back on the server: whoever I haven't heard from for this long is called at once. */
const BACK_QUIET_MS = 1_500;

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
 * makes this device's connection slow (every message, sent or received, late by
 * min-max ms, still in order, like a slow relay) and lossy (a share p of messages
 * never arrive). With it on, window.__ludoNetCut = true cuts this device off (nothing
 * in or out), and every connection open before a cut stays dead after it
 * (window.__ludoNetCutGen counts the cuts), like a phone that changed networks.
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
type CutWindow = { __ludoNetCut?: boolean; __ludoNetCutGen?: number; __ludoNetLog?: string[] };
/** For testing only, with the chaos on: what the connection does, in window.__ludoNetLog. */
const note = (what: string) => {
  if (!CHAOS) return;
  const w = globalThis as CutWindow;
  (w.__ludoNetLog ||= []).push(`${(performance.now() / 1000).toFixed(1)} ${what}`);
};
/** `send`, through the test chaos when it's on. One per connection. */
function chaotic(send: (m: NetMessage) => void) {
  if (!CHAOS) return send;
  const w = globalThis as CutWindow;
  const born = w.__ludoNetCutGen || 0;
  let due = 0;
  return (m: NetMessage) => {
    if (w.__ludoNetCut || (w.__ludoNetCutGen || 0) !== born) return;
    if (Math.random() < (CHAOS.drop || 0)) return;
    const [a, b] = CHAOS.delay || [0, 0];
    due = Math.max(due, Date.now() + a + Math.random() * (b - a));
    setTimeout(() => send(m), due - Date.now());
  };
}

/**
 * This tab's key to its addresses on the connection server. A phone that changes
 * networks loses its connection without the server noticing, and the server keeps
 * the address for that dead connection for a minute or more: with the same key,
 * the address is this tab's again at once (a new key got "taken" until then).
 */
let token = "";
function tabToken() {
  if (token) return token;
  const fresh = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  try {
    token = sessionStorage.getItem("ludo.peerToken") || fresh();
    sessionStorage.setItem("ludo.peerToken", token);
  } catch {
    token = fresh();
  }
  return token;
}

/**
 * The addresses this tab has held (kept across a reload, like the token). Only for one of
 * these can a quiet server mean "it's yours again" (see whenHeld): for any other, a "taken"
 * that's slow to come would be read as the address being free.
 */
let heldAddrs: Set<string> | null = null;
function tabHeld() {
  if (heldAddrs) return heldAddrs;
  try {
    heldAddrs = new Set(JSON.parse(sessionStorage.getItem("ludo.heldAddrs") || "[]") as string[]);
  } catch {
    heldAddrs = new Set();
  }
  return heldAddrs;
}
function noteHeld(addr: string) {
  const held = tabHeld();
  if (held.has(addr)) return;
  held.add(addr);
  try {
    sessionStorage.setItem("ludo.heldAddrs", JSON.stringify([...held].slice(-20)));
  } catch {
    /* private mode */
  }
}

/**
 * An address of my own to join with. Made here: asking the server for one is a separate
 * request first, a second or more (sometimes three) before even connecting.
 */
function freshAddr() {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return "g" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Since when this device can't reach the connection server (0: it can). */
let serverDownSince = 0;
const serverLost = () => (serverDownSince ||= Date.now());
const serverBack = () => (serverDownSince = 0);

type PeerInsides = { _open: boolean; _lastServerId: string | null; socket?: { _socket?: WebSocket } };
/**
 * Calls `held` once `peer` holds its address (`addr`): on the server's "open", or, for an
 * address this tab has held before (see tabToken, tabHeld), when no "taken" came (the
 * server doesn't say "open" then, so PeerJS is told).
 */
function whenHeld(peer: PeerType, held: () => void, addr = peer.id) {
  let over = false;
  const done = () => {
    if (over || peer.destroyed) return;
    over = true;
    clearInterval(iv);
    serverBack();
    if (peer.id) noteHeld(peer.id);
    held();
  };
  peer.once("open", done);
  let quiet = 0;
  const iv = setInterval(() => {
    if (over || peer.destroyed) {
      over = true;
      clearInterval(iv);
      return;
    }
    const p = peer as unknown as PeerInsides;
    if (!addr || !tabHeld().has(addr)) return;
    if (!peer.disconnected && p.socket?._socket?.readyState === 1) {
      quiet += 200;
      if (quiet >= RECLAIM_QUIET_MS) {
        p._open = true;
        p._lastServerId = peer.id;
        done();
      }
    } else quiet = 0;
  }, 200);
}

/**
 * PeerJS looks a connection up when its channel arrives; one closed while it was still being
 * set up (a call back or a second connection not needed, see callBack and refresh) isn't
 * there any more, and PeerJS throws. Found missing, a stand-in that closes the channel.
 * (Every other lookup treats it as missing: it has no peerConnection and no type.)
 */
function guarded(peer: PeerType) {
  const p = peer as unknown as { getConnection: (id: string, cid: string) => unknown };
  const get = p.getConnection.bind(peer);
  const gone = {
    _initializeDataChannel(dc: RTCDataChannel) {
      try {
        dc.close();
      } catch {
        /* already closed */
      }
    },
    close() {},
    peerConnection: null,
  };
  p.getConnection = (id, cid) => get(id, cid) || gone;
  return peer;
}

/** A connection to the server lost (or not made): the errors that mean so. */
const serverError = (type?: string) => type === "network" || type === "server-error" || type === "socket-error" || type === "socket-closed";

class Link implements PeerLink {
  pid?: string;
  /** When anything last came from this guest (they ping every second). */
  heardAt = Date.now();
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
const shut = (c: DataConnection | null | undefined) => {
  try {
    c?.close();
  } catch {
    /* ignore */
  }
};
const JSON_LINK = { reliable: true, serialization: "json" } as const;

/**
 * A room through the connection server. Losing the server for a while (a phone
 * changing networks, the server dropping it) doesn't end anything: the
 * players stay connected to each other meanwhile, and the connection to the
 * server comes back by itself (keepAlive).
 */
export class PeerRoomTransport implements RoomTransport {
  private Peer: typeof PeerType | null = null;
  private code = "";
  private events: RoomEvents | null = null;
  private peer: PeerType | null = null;
  /** Registered alongside the hosting attempt, ready to join if the room is taken. */
  private spare: PeerType | null = null;
  private links: Link[] = [];
  private hostConn: DataConnection | null = null;
  /** Guest: messages to the host (one per connection: see chaotic). */
  private toHost: ((m: NetMessage) => void) | null = null;
  /** Guest: the address of the host I'm connected to. */
  private hostAddr = "";
  /** Guest: when anything last came from the host. */
  private hostHeardAt = 0;
  /** Guest: more connections to the host on their way (see refresh), and when the last one was tried. */
  private fresh = new Set<DataConnection>();
  private freshAt = 0;
  /** Host at the backup address: a look at the room's own address on its way (see watchMain). */
  private looking: DataConnection | null = null;
  /** Host: guests' addresses called back (see callBack), and when. */
  private calledAt = new Map<string, number>();
  /** Joining from a link: tries made again so far (see joinAgain). */
  private joinTries = 0;
  private timers: ReturnType<typeof setInterval>[] = [];
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

  /**
   * The connection to the server lost (a phone changing networks, the server dropping it):
   * connect again, with the same address and key, a little later each time while it
   * fails, and at once when the network is back. Nothing else stops meanwhile.
   */
  private keepAlive(peer: PeerType) {
    let wait = 400;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const mine = () => !this.closed && peer === this.peer && !peer.destroyed;
    let tries = 0;
    const again = () => {
      timer = null;
      if (!mine() || !peer.disconnected) return;
      try {
        note(`reconnect ${peer.id ?? ""}`);
        const n = ++tries;
        let held = false;
        peer.reconnect();
        whenHeld(peer, () => {
          if (n !== tries || held) return;
          held = true;
          note("reconnected");
          wait = 400;
          this.reconnected();
        });
        // A connection to the server that hangs (the first try on a new network can): drop it and try again.
        setTimeout(() => {
          if (held || n !== tries || !mine() || peer.disconnected) return;
          const ws = (peer as unknown as PeerInsides).socket?._socket;
          if (ws && ws.readyState === 1) return;
          note("reconnect hung");
          peer.disconnect();
        }, RECONNECT_HUNG_MS);
      } catch {
        /* destroyed meanwhile */
      }
    };
    peer.on("disconnected", () => {
      if (!mine()) return;
      serverLost();
      note(`server lost, again in ${timer ? "(set)" : wait}`);
      if (timer) return;
      timer = setTimeout(again, wait);
      wait = Math.min(wait * 2, 2_000);
    });
    // (A try still on its way when the network comes back fails, and the next one is quick again.)
    const online = () => {
      if (!mine()) return window.removeEventListener("online", online);
      wait = 400;
      if (timer) clearTimeout(timer);
      again();
    };
    if (typeof window !== "undefined") window.addEventListener("online", online);
  }

  async open(code: string, events: RoomEvents, opts: { join?: boolean } = {}) {
    const { Peer } = await loadPeer();
    if (this.closed) return;
    this.Peer = Peer;
    this.code = code;
    this.events = events;
    this.claim(false, !!opts.join);
  }

  /**
   * Host the room at its address, or join whoever hosts it there. Registers a second
   * address to join with at the same time: if the room is already hosted we connect
   * straight away instead of waiting for the server's "taken" reply first (about a second).
   *
   * The backup address is for when the host's address is held by a connection that
   * has died (a phone that changed networks: the server keeps its address for a minute
   * or more). Nobody answers there, so the room is taken over at the backup address,
   * and the computer can play for whoever is gone. Their phone, back, holds the room's
   * own address again (see tabToken); the host at the backup address notices and
   * joins them (see watchMain), and everyone follows.
   *
   * `join`: only join (an invite link): if nobody hosts the room, events.noRoom.
   */
  private claim(backup: boolean, join: boolean) {
    const Peer = this.Peer!;
    const events = this.events!;
    const addr = addressOf(this.code, backup);
    note(`claim ${backup ? "backup" : "main"}${join ? " (join)" : ""}`);
    const host = guarded(new Peer(addr, { token: tabToken() }));
    const spare = guarded(new Peer(freshAddr(), { token: tabToken() }));
    this.peer = host;
    this.spare = spare;
    let spareFailed = false;
    spare.on("error", () => {
      if (this.spare === spare) spareFailed = true;
    });
    this.listenForCalls(host);

    whenHeld(host, () => {
      if (this.closed || this.peer !== host) return;
      note(`held ${backup ? "backup" : "main"}`);
      destroy(this.spare);
      this.spare = null;
      // Joining only, and the address was free: nobody hosts the room here. Let it go again at once.
      // (Asking the server for an address nobody has only fails after many seconds; this takes one.)
      if (join) {
        // (Not ours any more before it's let go: letting go reads as a lost connection, which keepAlive would answer by taking the address back.)
        this.peer = null;
        destroy(host);
        // (Its host may be opening it again just now, its "taken" slow to come: look again first.)
        if (!backup && this.joinAgain()) return;
        // The room may be at its backup address.
        if (!backup) this.claim(true, true);
        else if (events.noRoom) events.noRoom();
        else events.lost("network");
        return;
      }
      this.isHost = true;
      this.keepAlive(host);
      this.callBack(host);
      if (backup) this.watchMain();
      events.hosting();
    }, addr);
    host.on("connection", (conn) => {
      if (this.closed || join || this.peer !== host) return shut(conn);
      note("guest connecting");
      this.addGuest(conn);
    });
    host.on("error", (e: { type?: string }) => {
      if (this.closed || this.peer !== host) return;
      note(`host error ${e.type}`);
      if (e.type === "unavailable-id") {
        // Hosting, and someone else holds the room's address now (the server let mine go while my
        // connection to it was down, and a guest took the room over): join them.
        if (this.isHost) return events.lost("host-left");
        // Someone already hosts the room here: join them as a guest. (Not ours before it's let go: see above.)
        this.peer = null;
        destroy(host);
        const ready = this.spare && !spareFailed ? this.spare : guarded(new Peer(freshAddr(), { token: tabToken() }));
        if (ready !== this.spare) destroy(this.spare);
        this.spare = null;
        this.joinAsGuest(ready, addr, backup, join);
      } else if (serverError(e.type)) {
        serverLost();
        // (Once hosting, the connection to the server comes back by itself: keepAlive. The guests stay meanwhile.)
        if (!this.isHost) events.lost("network");
      }
    });
  }

  /** Host: a connection with a guest (whichever end made it). */
  private addGuest(conn: DataConnection) {
    const events = this.events!;
    const link = new Link(conn);
    this.links.push(link);
    conn.on("open", () => {
      if (!this.closed) events.peerOpened(link);
    });
    const inbox = chaotic((m) => {
      if (this.closed) return;
      link.heardAt = Date.now();
      events.peerMessage(link, m);
    });
    conn.on("data", (m) => {
      if (this.closed || !m || typeof m !== "object") return;
      inbox(m as NetMessage);
    });
    conn.on("close", () => {
      this.links = this.links.filter((x) => x !== link);
      if (!this.closed) events.peerClosed(link);
    });
  }

  /**
   * Host: a guest gone quiet may be a phone back from changing networks, which nobody can
   * reach for a while (the server sends what's for it to its old, dead connection), or this
   * phone may be the one back (the same, the other way round: its guests' calls don't reach
   * it). Either way, calling them works: call each quiet guest, every few seconds while it stays
   * quiet. Their phone takes the new connection in place of the old one (see joinAsGuest).
   */
  private callBack(host: PeerType) {
    const iv = setInterval(() => {
      if (this.closed || !this.isHost || this.peer !== host) return clearInterval(iv);
      this.callQuiet(CALL_BACK_QUIET_MS);
    }, 1_000);
    this.timers.push(iv);
  }

  /**
   * Host: call each guest not heard from for `quietMs` (see callBack). `back`: just back on the
   * server, so calls made before (which went nowhere) don't count.
   */
  private callQuiet(quietMs: number, back = false) {
    const host = this.peer;
    if (this.closed || !this.isHost || !host || host.destroyed || host.disconnected) return;
    const now = Date.now();
    const freshest = new Map<string, number>();
    for (const l of this.links) freshest.set(l.conn.peer, Math.max(freshest.get(l.conn.peer) || 0, l.open ? l.heardAt : 0));
    for (const [addr, heard] of freshest) {
      const quiet = now - heard;
      if (heard && (quiet < quietMs || quiet > CALL_BACK_FOR_MS)) continue;
      if (!back && now - (this.calledAt.get(addr) || 0) < REFRESH_EVERY_MS) continue;
      // (Already one on its way, not open yet: let it.)
      if (!back && this.links.some((l) => l.conn.peer === addr && !l.open && now - l.heardAt < REFRESH_TIMEOUT)) continue;
      const conn = host.connect(addr, JSON_LINK);
      if (!conn) continue;
      note(`calling back ${addr.slice(0, 8)}`);
      this.calledAt.set(addr, now);
      this.addGuest(conn);
      // Not open by now, or open and nothing from them on it (their phone kept the connection it had): not needed.
      const link = this.links[this.links.length - 1];
      const born = link.heardAt;
      setTimeout(() => {
        if (!conn.open || link.heardAt === born) shut(conn);
      }, REFRESH_TIMEOUT);
    }
  }

  /** Back on the server after losing it: call at once whoever I'm not hearing from (they couldn't reach me meanwhile, nor I them). */
  private reconnected() {
    if (this.closed) return;
    if (this.isHost) this.callQuiet(BACK_QUIET_MS, true);
    else if (Date.now() - this.hostHeardAt > BACK_QUIET_MS) this.refresh(true);
  }

  /**
   * Joining from a link, and the room looked empty or its host didn't answer: try again, a moment
   * later, with new connections to the server (a few times before "no such room"). The server
   * sometimes loses what passes between two of its machines, and a host opening its room again
   * is a moment without its address. True if it does.
   */
  private joinAgain() {
    if (this.closed || this.joinTries >= JOIN_TRIES) return false;
    this.joinTries++;
    note(`join again (${this.joinTries})`);
    const t = setTimeout(() => !this.closed && !this.peer && this.claim(false, true), JOIN_AGAIN_MS);
    this.timers.push(t);
    return true;
  }

  private joinAsGuest(peer: PeerType, addr: string, backup: boolean, joinOnly: boolean) {
    const events = this.events!;
    this.isHost = false;
    this.peer = peer;
    this.listenForCalls(peer);
    this.keepAlive(peer);
    const connect = () => {
      if (this.closed || this.peer !== peer) return;
      serverBack();
      // JSON: lighter to encode than PeerJS's default binary packing.
      const conn = peer.connect(addr, JSON_LINK);
      if (!conn) return events.lost("network");
      note(`connect ${backup ? "backup" : "main"}`);
      this.hostAddr = addr;
      this.useHostConn(conn);
      // Nobody answers: whoever holds the address has gone without the server noticing yet (it keeps
      // the address for a minute or more). Take the room over at its backup address (or, there
      // already, give up and try again).
      const timer = setTimeout(() => {
        if (this.closed || this.hostConn !== conn || conn.open) return;
        note("connect timed out");
        this.hostConn = null;
        shut(conn);
        if (backup) return events.lost("network");
        this.peer = null;
        destroy(peer);
        if (joinOnly && this.joinAgain()) return;
        this.claim(true, joinOnly);
        // (Joining from a link with tries left: not so long, there's another try after.)
      }, joinOnly && !backup && this.joinTries < JOIN_TRIES ? JOIN_TIMEOUT : CONNECT_TIMEOUT);
      conn.on("open", () => {
        clearTimeout(timer);
        note("connected");
        this.joinTries = 0;
        if (!this.closed && this.hostConn === conn) events.joinedHost();
      });
      conn.on("close", () => clearTimeout(timer));
    };
    if (peer.open) connect();
    else whenHeld(peer, connect);
    // The host calling me back (see callBack: it isn't hearing from me): taken in place of the connection I have.
    peer.on("connection", (conn) => {
      if (this.closed || this.peer !== peer || this.isHost || !this.hostAddr || conn.peer !== this.hostAddr) return shut(conn);
      note("host calling back");
      conn.on("open", () => {
        if (this.closed || this.peer !== peer || this.isHost) return shut(conn);
        note("host call opened");
        this.adopt(conn);
      });
    });
    peer.on("error", (e: { type?: string }) => {
      if (this.closed || this.peer !== peer) return;
      note(`guest error ${e.type}`);
      if (e.type === "peer-unavailable") {
        // (A second connection that can't be made, see refresh: the first still carries on.)
        if (this.hostConn?.open) return;
        // Nobody has the room's address: when only joining, look at the backup address; then there's no such room.
        if (joinOnly && !backup) {
          this.peer = null;
          destroy(peer);
          if (this.joinAgain()) return;
          return this.claim(true, true);
        }
        if (joinOnly && events.noRoom) return events.noRoom();
        return events.lost("host-left");
      }
      if (serverError(e.type)) {
        serverLost();
        // Connected to the host: carry on (the connection to the server comes back by itself, keepAlive).
        if (!this.hostConn?.open) events.lost("network");
      }
    });
  }

  /** Guest: talk to the host through `conn` from now on. */
  private useHostConn(conn: DataConnection) {
    const events = this.events!;
    this.hostConn = conn;
    this.toHost = chaotic((msg) => {
      try {
        if (conn.open) conn.send(msg);
      } catch {
        /* closed meanwhile */
      }
    });
    const inbox = chaotic((m) => {
      if (this.closed || this.hostConn !== conn) return;
      this.hostHeardAt = Date.now();
      events.hostMessage(m);
    });
    conn.on("data", (m) => {
      if (this.closed || this.hostConn !== conn || !m || typeof m !== "object") return;
      inbox(m as NetMessage);
    });
    conn.on("close", () => {
      if (!this.closed && this.hostConn === conn) events.lost("host-left");
    });
  }

  /**
   * Guest: the host has gone quiet. Connect to it again alongside the connection I
   * have (it may have died without either end noticing, when a phone changes
   * networks); if the new one opens, it carries on and the old one is closed.
   */
  refresh(now = false) {
    const peer = this.peer;
    // (Connected to the server is enough: the server may not say "open" when it takes the address back, see whenHeld.)
    if (this.closed || this.isHost || !peer || peer.destroyed || peer.disconnected || !this.hostAddr) return;
    if (!now && Date.now() - this.freshAt < REFRESH_EVERY_MS) return;
    const conn = peer.connect(this.hostAddr, JSON_LINK);
    if (!conn) return;
    note(`refresh (${this.fresh.size} on their way)`);
    this.freshAt = Date.now();
    this.fresh.add(conn);
    const timer = setTimeout(() => {
      if (this.fresh.delete(conn)) {
        note("refresh timed out");
        shut(conn);
      }
    }, REFRESH_TIMEOUT);
    conn.on("open", () => {
      clearTimeout(timer);
      note("refresh opened");
      if (this.closed || !this.fresh.delete(conn)) return shut(conn);
      this.adopt(conn);
    });
    conn.on("close", () => {
      clearTimeout(timer);
      this.fresh.delete(conn);
    });
  }

  /** Guest: a new connection with the host has opened (mine, see refresh, or the host's, see callBack): it carries on, the others aren't needed. */
  private adopt(conn: DataConnection) {
    this.fresh.forEach(shut);
    this.fresh.clear();
    const old = this.hostConn;
    this.useHostConn(conn);
    shut(old);
    this.events?.joinedHost();
  }

  /**
   * Hosting at the backup address: look at the room's own address every few seconds.
   * Once a host answers there (the one who had gone, back), step down: the room
   * opens again, which finds them, and the guests here follow.
   */
  private watchMain() {
    const iv = setInterval(() => {
      const peer = this.peer;
      if (this.closed || !this.isHost) return clearInterval(iv);
      if (!peer || peer.disconnected || peer.destroyed || this.looking) return;
      const conn = peer.connect(addressOf(this.code), JSON_LINK);
      if (!conn) return;
      this.looking = conn;
      const timer = setTimeout(() => {
        if (this.looking === conn) this.looking = null;
        shut(conn);
      }, CONNECT_TIMEOUT);
      // (A host sends its game to anyone who connects.)
      conn.on("data", (m) => {
        if (this.closed || this.looking !== conn || !m || (m as NetMessage).type !== "state") return;
        clearTimeout(timer);
        this.looking = null;
        shut(conn);
        clearInterval(iv);
        this.events?.lost("host-left");
      });
      conn.on("close", () => {
        if (this.looking !== conn) return;
        this.looking = null;
        clearTimeout(timer);
      });
    }, WATCH_MAIN_MS);
    this.timers.push(iv);
  }

  async probe(code: string): Promise<GameState | null> {
    const { Peer } = await loadPeer();
    if (this.closed) return null;
    return new Promise((resolve) => {
      const peer = guarded(new Peer(freshAddr()));
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
        const conn = peer.connect(PREFIX + code, JSON_LINK);
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

  sendToHost(msg: NetMessage) {
    if (!this.hostConn || !this.hostConn.open || !this.toHost) return false;
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

  linked(pid: string) {
    return this.links.some((l) => l.pid === pid && l.open);
  }

  /** This device can't reach the connection server (for more than a moment), or has no network at all. */
  serverDown() {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
    return serverDownSince > 0 && Date.now() - serverDownSince > SERVER_DOWN_MS;
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
    this.timers.forEach((t) => clearInterval(t));
    this.timers = [];
    this.links.forEach((l) => shut(l.conn));
    this.links = [];
    this.fresh.forEach(shut);
    this.fresh.clear();
    shut(this.looking);
    this.looking = null;
    this.hostConn = null;
    this.isHost = false;
    destroy(this.spare);
    this.spare = null;
    destroy(this.peer);
    this.peer = null;
  }
}

export const createPeerTransport = () => new PeerRoomTransport();
