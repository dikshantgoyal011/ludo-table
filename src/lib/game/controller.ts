// GameController runs one table: the game state, dice timing, computer
// players, network sync, chat, token animations and the winner popup.
// It is framework-free; React components subscribe to it (see
// src/hooks/use-game.ts) and call its methods.

import { playSound } from "@/lib/audio/sfx";
import { defaultAvatar, isAvatar } from "@/lib/avatars";
import { detectCountry, isCountry } from "@/lib/country";
import { createPeerTransport } from "@/lib/net/peer-transport";
import type { NetMessage, PeerLink, RoomTransport, TransportFactory, VoiceMember } from "@/lib/net/transport";
import { VoiceChat } from "@/lib/net/voice";
import type { SoundName } from "@/lib/settings/settings";
import type { ActiveRoom, Services } from "@/lib/services/types";
import {
  ABANDON_MS,
  AWAY_GRACE,
  CI,
  COLORS,
  DICE_ROLL_MS,
  HOST_SILENT_MS,
  MAX_MISSES,
  MISS_PENALTY,
  NICK_MAX,
  OFFLINE_ALLOWANCE,
  ONLINE_FULL_START_DELAY,
  ONLINE_TURN_LIMIT,
  PING_MS,
  REMOTE_MOVE_DELAY,
  roomPath,
  STEP_MS,
  TYPING_TTL,
} from "./constants";
import { stackSquare } from "./chaupar/board";
import { cleanFor, hasSides, hasVariations, noVariations, playsSolo, type Variations } from "./variations";
import { addLog, clone, finishOf, freshState, freshTokens, leaveGame, missTurn, movable, rulesFor, seatName, seated, seatsFor, teamOf, validState } from "./rules";
import type { ChatMessage, Color, GameId, GameState, Looks, Mode, MoveOpt, Seat } from "./types";

export type NetKind = "" | "ok" | "bad";

export interface TokenView {
  c: Color;
  i: number;
  x: number;
  y: number;
  scale: number;
  movable: boolean;
  stepping: boolean;
  /** Cut: flying back to its yard (a longer glide, it can cross the board). */
  returning: boolean;
  hidden: boolean;
  /** Pachisi: lying on its side (on its way back up, or home). */
  lying?: boolean;
  /** Chaupar, a pair: how far up the screen this piece of the stack sits, and on the top one how many are in it. */
  lift?: number;
  badge?: number;
}

/** How long a cut token takes to fly home (matches .token.returning in globals.css). */
const RETURN_MS = 650;

interface MoveAnim {
  c: Color;
  i: number;
  a: number;
  b: number;
}

type GameEvent = { type: "roll"; value: number; color: Color } | { type: "confetti" };

/**
 * A guest's own roll or move, shown before the host confirms it. `seq`: the roll
 * it belongs to; `stage`: moves already made with that roll (Pachisi plays
 * several throws one after another). A move of token -1 is a skip (Pachisi).
 */
type Pending = (
  | { kind: "roll"; c: Color; v: number; seq: number }
  | { kind: "move"; c: Color; i: number; opt: MoveOpt; seq: number; stage: number }
) & {
  /** When it was made, and last sent to the host (it's sent again until the host has it). */
  at: number;
  sentAt: number;
  msg: NetMessage;
};

/** Moves made with the roll in hand so far (a game whose roll has one move: 0 until it's made). */
const stageOf = (s: GameState) => {
  const r = rulesFor(s);
  return r.stage ? r.stage(s) : s.roll ? 0 : 1;
};

const newGameId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Each game has its own public tables (room names pub<prefix><count>x<n>): players only meet players of the same game. */
const PUBLIC_PREFIX: Record<GameId, string> = { ludo: "", pachisi: "p", parchis: "x", chaupar: "c" };

/** "Continue your pass-and-play game" is offered for this long after the last move. */
const LOCAL_RESUME_MS = 60 * 60_000;
/** Friends room: its creator offline this long hands starting / restarting to the next player. */
const OWNER_AWAY_MS = 30_000;
/** Where the computer players "come from" (flags on their name tags). */
const BOT_COUNTRIES = ["IN", "BD", "PK", "NP", "LK", "AE", "SA", "ID", "MY", "PH", "NG", "GB", "US", "CA", "AU", "BR"];
/** Rejoining a game whose table nobody is at: wait this long for the others before calling it over. */
const REJOIN_WAIT_MS = 12_000;
/** Presence checks run every second; a longer gap means this device wasn't watching (asleep, in the background). */
const WATCH_GAP_MS = 5_000;

/** Online: someone waiting alone at a table other than the first looks again for an earlier table this often. */
const RESEARCH_MS = 8_000;

/** Everyone in voice chat says so again this often. */
const VOICE_REPEAT_MS = 5_000;

/**
 * Guest: my roll or move the host hasn't confirmed yet is sent again this often
 * (the host takes each exactly once, so a copy is harmless), and only given up
 * after a long time. Dropping it after a few seconds, on a slow connection, undid
 * the move on screen; the original then arrived anyway and the game jumped.
 */
const RESEND_MS = 1_500;
const PENDING_GIVE_UP_MS = 30_000;
/** Guest: unconfirmed this long, the connection line says the move is on its way. */
const PENDING_SLOW_MS = 3_000;
/** Guest: after asking the host for the game, wait this long before asking again. */
const SYNC_GAP_MS = 2_000;
/** The app came back (from the background, or the screen was off): the others get this long to be heard from again. */
const WAKE_GRACE_MS = 6_000;
/** A gap this long between heartbeats means this device was asleep / in the background. */
const TICK_GAP_MS = 3_000;
/** Opening a room: nothing at all after this long, start again (a connection that never answers). */
const OPEN_WATCHDOG_MS = 15_000;
/** Friends wait longer for each other than strangers do before the computer stands in. */
const FRIENDS_OFFLINE_ALLOWANCE = 40_000;

/** A number someone could really have rolled / thrown in this game. */
const validRoll = (s: GameState, v: number) => rulesFor(s).validRoll(v, s);

function applyPending(s: GameState, a: Pending) {
  // (The computer took the seat over meanwhile: my own action no longer counts.)
  if (s.seats[a.c]?.bot) return false;
  if (a.kind === "roll") return rulesFor(s).applyRoll(s, a.c, a.v);
  if (s.phase !== "playing" || s.turn !== a.c || !s.roll || (s.last?.seq || 0) !== a.seq) return false;
  return applyChoice(s, a.c, a.i, a.opt);
}

/** c moves token i with the roll in hand (i = -1: chooses not to move, where the game allows it). false if that isn't possible. */
function applyChoice(s: GameState, c: Color, i: number, opt: MoveOpt) {
  const r = rulesFor(s);
  if (i === -1) return !!r.pass && r.pass(s, c);
  if (!s.roll || !r.moveChoices(s, c, i, s.roll).length) return false;
  r.applyMove(s, c, i, s.roll, opt);
  return true;
}

/** Has the host's state already got this action in it? */
function confirmedBy(s: GameState, a: Pending) {
  const seq = s.last?.seq || 0;
  return a.kind === "roll" ? seq >= a.seq : seq > a.seq || (seq === a.seq && (!s.roll || stageOf(s) > a.stage));
}

/** A piece of the app's code that couldn't be loaded (the app was open across an update). */
const isChunkError = (e: unknown) => {
  const t = `${(e as Error)?.name || ""} ${(e as Error)?.message || ""}`;
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(t);
};
/** Load the page again for the new version, at most once a minute (never in a loop). */
function reloadOnce() {
  try {
    const at = Number(sessionStorage.getItem("ludo.reloadedAt") || 0);
    if (Date.now() - at < 60_000) return;
    sessionStorage.setItem("ludo.reloadedAt", String(Date.now()));
  } catch {
    /* private mode: still worth one try */
  }
  window.location.reload();
}

const reduceMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export class GameController {
  // ------------------------------------------------------------ public state
  mode: Mode | null = null;
  state: GameState = freshState();
  loaded = false;
  online = false;
  rolling = false;
  rollColor: Color | null = null;
  /** Face the dice currently shows. */
  dieFace = 1;
  /** The latest dice throw, for the 3D dice to animate. */
  diceRoll: { id: number; value: number; at: number } | null = null;
  room: string | null = null;
  searching = false;
  searchN = 0;
  /** Online: the table size the player asked for. */
  wantCount = 2;
  /** The game picked for the next table (online / friends rooms set up here). */
  wantGame: GameId = "ludo";
  banner = "";
  net: { kind: NetKind; text: string } = { kind: "", text: "Connecting…" };
  confirmReset = false;
  // chat
  chat: ChatMessage[] = [];
  unread = 0;
  chatOpen = false;
  bubbles: Record<string, { text: string; until: number }> = {};
  /** Player id -> until when they count as typing. */
  typing: Record<string, number> = {};
  // voice chat
  voice = new VoiceChat(() => this.emit());
  /** Who is in voice chat at this table (from the host). */
  voiceRoster: VoiceMember[] = [];
  // winner popup
  winOpen = false;
  winFinal = false;
  // move timer (online)
  turnSeenAt = 0;
  // board rotation (degrees)
  rot = { angle: 0, target: 0, ready: false };

  // ------------------------------------------------------------ internals
  private version = 0;
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(e: GameEvent) => void>();
  private rotListeners = new Set<() => void>();
  private transport: RoomTransport | null = null;
  private gen = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private seenSeq: number | null = null;
  private autoJoin = false;
  private turnKey = "";
  /** This game: confetti fired / my own finish shown / final rankings shown. */
  private celebrated = false;
  private finishShown = false;
  private finalShown = false;
  private animPos: Record<string, number> = {};
  private animTimers: ReturnType<typeof setTimeout>[] = [];
  private animBusyUntil = 0;
  private rotFrame = 0;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  /** Host: when each player was last heard from. */
  private lastSeen: Record<string, number> = {};
  /** Guest: who hosts the table and when we last heard from them. */
  private hostId = "";
  private hostHeardAt = 0;
  /** Guest: the host went silent; treat it as gone and take over the table. */
  private onHostSilent: (() => void) | null = null;
  /** Per token: bumped by every new move animation, so an older one can't cut a newer one short. */
  private animGen: Record<string, number> = {};
  /** Per token: when its current move animation ends. */
  private tokenBusyUntil: Record<string, number> = {};
  /** Per token: which move animation is walking it right now. */
  private animOwner: Record<string, number> = {};
  /** Tokens gliding out of the yard right now (not one-square hops). */
  private comingOut = new Set<string>();
  /** Cut tokens flying back to their yard right now. */
  private returning = new Set<string>();
  /** Guest: the roll number (seq) my own roll will get; its dice already played here. */
  private ownRollSeq = 0;
  /**
   * Guest: my rolls and moves the host hasn't confirmed yet. They show here
   * straight away (the rules give the host the same result), so playing never
   * waits for the network; the host's answer replaces them.
   */
  private pending: Pending[] = [];
  /** Guest: the host's latest state, without my unconfirmed actions on top. */
  private hostState: GameState | null = null;
  /** When the dice on this screen lands; tokens wait for it. */
  private diceLandsAt = 0;
  /** Someone else's roll whose dice already started spinning here (from their "dice" message). */
  private preRolledSeq = 0;
  /** When this device started hosting its current table. */
  private hostingSince = 0;
  /** Host: since when presence has been checked without a gap, and the last check. */
  private watchingSince = 0;
  private lastPresenceCheck = 0;
  /** Rejoining an online game (its id): checked against the table once connected. */
  private rejoinGid: string | null = null;
  /** Rejoined, but nobody else was at the table: when to call the game over unless someone comes back. */
  private rejoinUntil = 0;
  /** A note for the home screen, e.g. why a rejoin didn't work. */
  notice = "";
  private preRolledColor: Color | null = null;
  /** Host: who's in voice chat. */
  private voiceMembers = new Map<string, VoiceMember>();
  /** When I last told the host I'm in voice chat. */
  private voiceSaidAt = 0;
  private typingSentAt = 0;
  /** My colour while a game is on; changing the colour setting waits for the next game. */
  private lockedColor: Color | null = null;
  /** When the heartbeat last ran (a long gap: this device was asleep or in the background). */
  private lastTick = 0;
  /** Guest: the connection line is saying my move is on its way. */
  private slowShown = false;
  /** When I last asked to take my seat back from the computer. */
  private takeBackAt = 0;

  constructor(
    private services: Services,
    private makeTransport: TransportFactory = createPeerTransport,
  ) {
    // I lost a voice call the other player places: tell the table, so they call me again.
    this.voice.onLost = () => this.announceVoice();
  }

  // ============================================================ subscriptions
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    this.ensureHeartbeat();
    return () => {
      this.listeners.delete(fn);
    };
  };
  getVersion = () => this.version;
  onEvent(fn: (e: GameEvent) => void) {
    this.eventListeners.add(fn);
    return () => {
      this.eventListeners.delete(fn);
    };
  }
  onRotate(fn: () => void) {
    this.rotListeners.add(fn);
    return () => {
      this.rotListeners.delete(fn);
    };
  }
  private fire(e: GameEvent) {
    this.eventListeners.forEach((fn) => fn(e));
  }

  /** Re-render everything that shows the table. */
  private emit() {
    if (this.state.phase !== "playing") this.lockedColor = null;
    else if (!this.lockedColor) this.lockedColor = this.pref;
    this.noteTurn();
    this.updateRotation();
    // The dice shows the game's latest roll, except while someone else's dice has
    // landed here before their roll itself arrived: then it keeps the number it
    // landed on (going back to the previous roll for a moment looked like a second roll).
    // (The number rolled, not the move in hand: in Parchís that can be a 6 counting 7, or a count of 20 or 10.)
    if (!this.rolling && !this.awaitingPreRoll()) {
      const lv = this.state.last?.v || this.state.roll;
      if (lv) this.dieFace = lv;
    }
    this.version++;
    this.listeners.forEach((fn) => fn());
    this.tickBots();
    // For tests only: a page that sets window.__ludoTrace = [] gets a record of every change shown.
    const trace = (globalThis as { __ludoTrace?: unknown[] }).__ludoTrace;
    if (trace && this.loaded) {
      const s = this.state;
      trace.push({ t: Date.now(), seq: s.last?.seq || 0, stage: stageOf(s), turn: s.turn, phase: s.phase, v: s.v || 0, tokens: JSON.stringify(s.tokens), pending: this.pending.length, host: this.isHost });
    }
  }
  /** Public refresh (e.g. after a setting changes). */
  refresh() {
    this.emit();
  }

  // ============================================================ identity
  get myId() {
    return this.services.auth.currentUser().id;
  }
  get pref(): Color {
    return this.services.profile.get().color;
  }
  myNick() {
    return this.services.profile.get().nick.trim() || "Player";
  }
  /** My country and picture, as the others see them. */
  myLooks(): Looks {
    const p = this.services.profile.get();
    const cc = p.country || detectCountry();
    return { ...(cc ? { cc } : {}), av: p.avatar >= 0 ? p.avatar : defaultAvatar(this.myId) };
  }
  private get settings() {
    return this.services.settings.get();
  }
  play(name: SoundName) {
    const s = this.settings.sound;
    if (!s.all) return; // one switch for all game sounds
    playSound(name);
  }

  // ============================================================ helpers
  isNet() {
    return this.mode === "online" || this.mode === "friends";
  }
  joined(s = this.state) {
    return s.players.some((p) => p.id === this.myId);
  }
  /** Can this device act for seat c? */
  mine(s: GameState, c: Color | null) {
    if (!c) return false;
    const st = s.seats[c];
    if (!st || st.bot) return false;
    return this.isNet() ? st.id === this.myId : true;
  }
  /** Does this device run computer players and automatic moves? */
  private controller() {
    return !this.isNet() || !!this.transport?.isHost;
  }
  get isHost() {
    return !!this.transport?.isHost;
  }
  /** The slot that belongs to me: online/friends after joining, and vs computer. */
  mySlot(): Color | null {
    const s = this.state;
    if (this.isNet()) return COLORS.find((c) => s.seats[c]?.id === this.myId) || null;
    if (this.mode === "computer") return COLORS.find((c) => s.seats[c]?.id === "me") || null;
    return null;
  }
  /** In online/friends play my slot shows in my chosen colour; the rest follow clockwise. */
  displayColor(slot: Color): Color {
    const me = this.isNet() ? this.mySlot() : null;
    if (!me) return slot;
    return COLORS[(CI[this.myColor()] + (CI[slot] - CI[me] + 4)) % 4];
  }
  /** The colour I play as: the colour setting, frozen while a game is on. */
  myColor(): Color {
    return this.lockedColor || this.pref;
  }
  /** Colour can't be changed mid-game (the board would swap colours under everyone's eyes). */
  colorLocked() {
    return this.loaded && this.state.phase === "playing";
  }
  private targetTurns() {
    const s = this.mySlot();
    return s ? (3 - CI[s] + 4) % 4 : 0;
  }
  isYou(c: Color) {
    const seat = this.state.seats[c];
    return !!seat && ((this.isNet() && seat.id === this.myId) || (this.mode === "computer" && seat.id === "me"));
  }
  canRollNow() {
    const s = this.state;
    return this.loaded && this.connected() && !this.rolling && s.phase === "playing" && !s.roll && this.mine(s, s.turn);
  }
  /** I hold a roll and may choose not to move with it (games that allow it: Pachisi). */
  canPass() {
    const s = this.state;
    return this.loaded && this.connected() && !this.rolling && !!rulesFor(s).pass && s.phase === "playing" && !!s.roll && this.mine(s, s.turn);
  }
  /** The throws still to play this turn (Pachisi can hold several). */
  hand(): number[] {
    const s = this.state;
    if (s.phase !== "playing") return [];
    const r = rulesFor(s);
    return r.hand ? r.hand(s) : s.roll ? [s.roll] : [];
  }
  /** The ways my token i can move with the roll in hand (more than one: let me pick). */
  choicesFor(c: Color, i: number) {
    const s = this.state;
    const ref = this.pieceRef(c, i);
    return s.phase === "playing" && s.roll && ref ? rulesFor(s).moveChoices(s, ref.c, ref.i, s.roll) : [];
  }
  /**
   * Token i of colour c, as the piece the player whose turn it is moves: their
   * own (c is the turn), or in games where they also move a partner's pieces
   * (Rulebook.handles) piece k * 4 + i. Null: not theirs to move.
   */
  private pieceRef(c: Color, i: number): { c: Color; i: number } | null {
    const s = this.state;
    const t = s.turn;
    if (!t) return null;
    const k = (rulesFor(s).handles?.(s, t) || [t]).indexOf(c);
    return k < 0 ? null : { c: t, i: k * 4 + i };
  }
  /** Online/friends: only act while connected, or this device's game would drift from everyone else's. */
  private connected() {
    return !this.isNet() || this.online;
  }
  /** Which player the dice sits with. */
  dieColor(): Color | null {
    if (this.rolling) return this.rollColor;
    return this.state.phase === "playing" ? this.state.turn : null;
  }
  secsLeft(at: number) {
    return Math.max(0, Math.ceil((at - Date.now()) / 1000));
  }
  /** Online: time per turn for seat c; every missed turn takes 2s off. */
  turnLimit(c: Color) {
    return ONLINE_TURN_LIMIT - MISS_PENALTY * (this.state.seats[c]?.misses || 0);
  }
  /** Online: is the turn timer running for c right now? */
  turnTimerOn(c: Color) {
    const s = this.state;
    const seat = s.seats[c];
    return this.mode === "online" && s.phase === "playing" && s.turn === c && !!seat && !seat.bot && !this.rolling;
  }
  turnSecsLeft(c: Color) {
    return this.secsLeft(this.turnSeenAt + this.turnLimit(c));
  }
  /** Changes whenever a new turn timer starts. */
  turnId() {
    return this.turnKey;
  }
  capacity() {
    return this.state.capacity || this.wantCount;
  }
  /**
   * Is this player offline, and since when? Comes from the host; a guest
   * whose host went silent also sees the host as offline straight away.
   */
  awayInfo(seat: Seat): { away: boolean; since: number } {
    if (seat.away) return { away: true, since: seat.awayAt || Date.now() };
    const hostGone = this.isNet() && this.loaded && !this.isHost && seat.id === this.hostId && Date.now() - this.hostHeardAt > AWAY_GRACE;
    return hostGone ? { away: true, since: this.hostHeardAt } : { away: false, since: 0 };
  }
  /** How long someone can be offline before the computer plays for them (friends wait longer for each other). */
  private offlineAllowance() {
    return this.mode === "friends" ? FRIENDS_OFFLINE_ALLOWANCE : OFFLINE_ALLOWANCE;
  }
  /** Offline time left before the computer plays for this player (ms). */
  offlineLeft(seat: Seat) {
    const a = this.awayInfo(seat);
    const allowance = this.offlineAllowance();
    return a.away ? Math.max(0, allowance - (Date.now() - a.since)) : allowance;
  }
  /** Is the computer playing my seat because I was away? */
  myTakeover() {
    const c = this.mySlot();
    return !!c && !!this.state.seats[c]?.takeover;
  }
  setBanner(t: string) {
    this.banner = t;
    this.emit();
  }

  // ============================================================ commit
  /** Change the game. `remote`: the change is someone else's roll (their dice plays first). */
  private commit(mutate: (s: GameState) => boolean | void, remote = false) {
    if (!this.loaded) return;
    const prevState = this.state;
    const s = clone(prevState);
    if (mutate(s) === false) return;
    s.v = (prevState.v || 0) + 1;
    if (s.turn !== prevState.turn || s.roll !== prevState.roll || s.last?.seq !== prevState.last?.seq || s.phase !== prevState.phase) s.turnAt = Date.now();
    this.state = s;
    this.persist();
    this.onStateChange(prevState, s, remote);
    this.emit();
    if (this.isNet()) this.broadcast();
  }

  private persist() {
    const saves = this.services.saves;
    if (this.isNet()) {
      if (!this.room) return;
      saves.saveRoom(this.room, this.state);
      // Remember the game I'm playing in so I can rejoin if I close the page.
      const c = this.mySlot();
      const s = this.state;
      if (s.phase === "playing" && c && !s.seats[c]?.out && !s.winners.includes(c))
        saves.saveActiveRoom({ mode: this.mode as "online" | "friends", room: this.room, count: this.capacity(), at: Date.now(), gid: s.gid });
      else if (saves.loadActiveRoom()?.room === this.room && s.phase !== "lobby") saves.clearActiveRoom();
    } else if (this.mode) saves.saveOffline({ mode: this.mode, state: this.state, at: Date.now() });
  }

  // ============================================================ roll & move
  /** Online/friends guest: the game only changes on the host. */
  private get guest() {
    return this.isNet() && !this.isHost;
  }

  private doRoll(c: Color) {
    const s0 = this.state;
    if (this.rolling || s0.phase !== "playing" || s0.turn !== c || s0.roll) return;
    // Random, the game's own way (Ludo's dice odds, Pachisi's cowrie shells).
    const v = rulesFor(s0).roll(s0, c);
    this.rolling = true;
    this.rollColor = c;
    // Everyone else's dice starts spinning now too, not after mine has landed.
    if (this.isNet()) this.transport?.broadcast({ type: "dice", id: this.myId, c, v, seq: (s0.last?.seq || 0) + 1 });
    this.animateDie(v, c, () => {
      this.rolling = false;
      if (this.guest) {
        // Show it now and ask the host to record it; its answer confirms it.
        const seq = (this.state.last?.seq || 0) + 1;
        this.ownRollSeq = seq;
        const msg: NetMessage = { type: "roll", id: this.myId, c, v, seq };
        this.transport?.sendToHost(msg);
        const now = Date.now();
        if (this.predict({ kind: "roll", c, v, seq, at: now, sentAt: now, msg })) this.seenSeq = seq;
      } else
        this.commit((s) => {
          if (!rulesFor(s).applyRoll(s, c, v)) return false;
          this.seenSeq = s.last?.seq ?? null;
        });
      this.emit();
    });
    this.emit();
  }

  /**
   * Host: a guest rolled. Record it, then show their dice landing here too.
   * `seq`: the roll number it is. Each is taken once. One that doesn't fit (a
   * copy sent again, one the game is past, or one that came before the guest's
   * move it follows) isn't taken: the guest gets the game as it is, keeps on top
   * of it whatever of its own still fits (by the same rules), and sends the rest
   * again, so nothing on its screen goes back.
   */
  private hostRoll(link: PeerLink, c: Color, v: number, seq?: number) {
    const s = this.state;
    const seat = s.seats[c];
    const next = (s.last?.seq || 0) + 1;
    // Checked against the game only, never this screen's animations: a guest's
    // roll or move that arrives while its dice still spins here must not be lost.
    const fits =
      !!seat && seat.id === link.pid && !seat.bot && validRoll(s, v) && s.phase === "playing" && s.turn === c && !s.roll && (seq === undefined || seq === next);
    if (!fits) {
      if (seq !== undefined) link.send({ type: "state", state: s });
      return;
    }
    this.commit((n) => rulesFor(n).applyRoll(n, c, v), true);
    this.onRemoteState();
  }

  /** Host: a guest moved (i = -1: let the roll go). Taken once, and only for the roll and stage it was made for. */
  private hostMove(link: PeerLink, m: Extract<NetMessage, { type: "move" }>) {
    const s = this.state;
    const seat = s.seats[m.c];
    const use = Number(m.use);
    const opt: MoveOpt = { ...(use > 0 ? { use } : {}), extra: !!m.extra };
    const same = m.seq === undefined || (m.seq === (s.last?.seq || 0) && (m.stage === undefined || m.stage === stageOf(s)));
    const ok =
      !!seat && seat.id === link.pid && !seat.bot && same && s.phase === "playing" && s.turn === m.c && !!s.roll && (() => applyChoice(clone(s), m.c, Number(m.i), opt))();
    if (!ok) {
      // (As with rolls: the guest gets the game as it is and sorts out its own moves by the same rules.)
      if (m.seq !== undefined) link.send({ type: "state", state: s });
      return;
    }
    this.doMove(m.c, Number(m.i), opt);
  }

  /**
   * Guest: the host's game is older than mine (it took the table over from me, or
   * missed my copy, while I was away). Offer mine: the host keeps the newer one.
   * Without this the two kept turning each other's game down.
   */
  private offeredAt = 0;
  private offerState() {
    if (this.isHost || !this.online || !this.loaded) return;
    const now = Date.now();
    if (now - this.offeredAt < SYNC_GAP_MS) return;
    this.offeredAt = now;
    this.transport?.sendToHost({ type: "state", state: this.state });
  }

  /** Guest: send again whatever the host hasn't confirmed yet (it takes each once, so copies are harmless). */
  private resendPending(force = false) {
    if (!this.pending.length || this.isHost) return;
    const now = Date.now();
    for (const a of this.pending) {
      if (!force && now - a.sentAt < RESEND_MS) continue;
      if (this.transport?.sendToHost(a.msg)) a.sentAt = now;
    }
  }

  /** Guest: ask the host for the game as it is now (rate-limited). */
  private syncAskedAt = 0;
  private requestSync() {
    if (this.isHost || !this.online) return;
    const now = Date.now();
    if (now - this.syncAskedAt < SYNC_GAP_MS) return;
    this.syncAskedAt = now;
    this.transport?.sendToHost({ type: "sync", id: this.myId });
  }

  /** Has someone's dice spun here for a roll that hasn't reached this device's game yet? */
  private awaitingPreRoll() {
    const s = this.state;
    return !!this.preRolledColor && this.preRolledSeq > (s.last?.seq || 0) && s.turn === this.preRolledColor && !s.roll;
  }

  /** Someone else tapped their dice: spin it here now; the roll itself follows. */
  private showRemoteDice(c: Color, v: number, seq: number) {
    const s = this.state;
    if (s.phase !== "playing" || s.turn !== c || s.roll || !validRoll(s, v)) return false;
    if (seq !== (s.last?.seq || 0) + 1 || this.preRolledSeq === seq) return false;
    this.preRolledSeq = seq;
    this.preRolledColor = c;
    this.rolling = true;
    this.rollColor = c;
    this.animateDie(v, c, () => {
      this.rolling = false;
      this.emit();
    });
    return true;
  }

  /** Guest: apply my own roll / move here at once, on top of the host's state. */
  private predict(a: Pending) {
    const prev = this.state;
    const s = clone(prev);
    if (!applyPending(s, a)) return false;
    if (!this.pending.length) this.hostState = prev;
    this.pending.push(a);
    // Same version as the host's state: its answer (a newer version) replaces this.
    if (s.turn !== prev.turn || s.roll !== prev.roll || s.last?.seq !== prev.last?.seq) s.turnAt = Date.now();
    this.state = s;
    this.onStateChange(prev, s, false);
    this.emit();
    return true;
  }

  /** Guest: the host never answered for a long time; go back to what it last sent (and ask it for the latest). */
  private dropPending() {
    const prev = this.state;
    const back = this.hostState;
    this.pending = [];
    this.hostState = null;
    this.requestSync();    if (!back) return;
    this.state = back;
    this.onStateChange(prev, back, true);
    this.emit();
  }

  private doMove(c: Color, i: number, opt: MoveOpt = {}) {
    if (this.guest) {
      const seq = this.state.last?.seq || 0;
      const stage = stageOf(this.state);
      const msg: NetMessage = { type: "move", id: this.myId, c, i, use: opt.use, extra: !!opt.extra, seq, stage };
      this.transport?.sendToHost(msg);
      const now = Date.now();
      this.predict({ kind: "move", c, i, opt, seq, stage, at: now, sentAt: now, msg });
      return;
    }
    this.commit((s) => {
      if (s.phase !== "playing" || s.turn !== c || !s.roll) return false;
      return applyChoice(s, c, i, opt);
    });
  }

  /** One step for a computer player (or an automatic move for an idle online player). */
  private autoStep() {
    const s = this.state;
    if (s.phase !== "playing" || this.rolling || !s.turn) return;
    const c = s.turn;
    if (!s.roll) this.doRoll(c);
    else {
      const r = rulesFor(s);
      const { i, opt } = r.chooseMove(s, c, s.roll);
      if (i >= 0) this.doMove(c, i, opt);
      else if (r.pass) this.doMove(c, -1);
    }
  }

  private tickBots() {
    if (this.botTimer || !this.loaded || !this.controller() || this.state.phase !== "playing" || this.rolling) return;
    const st = this.state.turn ? this.state.seats[this.state.turn] : null;
    if (!st || !st.bot) return;
    const wait = Math.max(this.state.roll ? 650 : 900, this.animBusyUntil - Date.now() + 250);
    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      const t = this.state.turn;
      if (t && this.state.seats[t]?.bot) this.autoStep();
    }, wait);
  }

  /** Dice animation: the 3D dice listens for the "roll" event. */
  private animateDie(finalV: number, c: Color, done: () => void) {
    // Pachisi throws cowries and Chaupar long dice: each has its own sound.
    const g = this.state.game;
    this.play(g === "pachisi" ? "cowries" : g === "chaupar" ? "pasa" : "dice");
    try {
      navigator.vibrate?.(30);
    } catch {
      /* ignore */
    }
    this.diceRoll = { id: (this.diceRoll?.id || 0) + 1, value: finalV, at: Date.now() };
    this.fire({ type: "roll", value: finalV, color: c });
    this.emit();
    const ms = reduceMotion() ? 0 : DICE_ROLL_MS;
    this.diceLandsAt = Date.now() + ms;
    setTimeout(() => {
      this.dieFace = finalV;
      done();
    }, ms);
  }

  // ============================================================ lobby
  private hostJoin(id: string, nick: string, looks: Looks = {}) {
    const cc = isCountry(looks.cc) ? looks.cc : undefined;
    const av = isAvatar(looks.av) ? looks.av : undefined;
    this.commit((s) => {
      if (s.phase !== "lobby") return false;
      const cap = this.mode === "online" ? s.capacity || this.wantCount : 4;
      const ex = s.players.find((p) => p.id === id);
      if (ex) {
        if (ex.nick === nick && ex.cc === cc && ex.av === av) return false;
        Object.assign(ex, { nick, cc, av });
      } else {
        if (s.players.length >= cap) return false;
        s.players.push({ id, nick, cc, av });
        s.log = [{ c: "" as const, t: `${nick} joined.` }, ...s.log].slice(0, 20);
      }
      s.seats = seatsFor(s.players);
      if (this.mode === "online") s.startAt = s.players.length >= cap ? s.startAt || Date.now() + ONLINE_FULL_START_DELAY : null;
    });
  }

  private hostLeave(id: string) {
    this.commit((s) => {
      if (s.phase !== "lobby") return false;
      const me = s.players.find((p) => p.id === id);
      if (!me) return false;
      s.players = s.players.filter((p) => p.id !== id);
      s.seats = seatsFor(s.players);
      if (s.ready) s.ready = s.ready.filter((x) => x !== id);
      if (s.agreed) s.agreed = s.agreed.filter((x) => x !== id);
      const cap = this.mode === "online" ? s.capacity || this.wantCount : 2;
      if (s.players.length < cap) s.startAt = null;
      s.log = [{ c: "" as const, t: `${me.nick} left.` }, ...s.log].slice(0, 20);
    });
  }

  /**
   * Friends room: who still has to get ready, or agree to the variations
   * (Pachisi, Parchís), before the game can start. The creator starts it, so they're always ready.
   */
  waitingFor(s = this.state): { notReady: string[]; notAgreed: string[] } {
    if (this.mode !== "friends") return { notReady: [], notAgreed: [] };
    const owner = this.roomOwnerId();
    const others = s.players.filter((p) => p.id !== owner);
    return {
      notReady: others.filter((p) => !s.ready?.includes(p.id)).map((p) => p.nick),
      notAgreed: hasVariations(s.game) ? others.filter((p) => !s.agreed?.includes(p.id)).map((p) => p.nick) : [],
    };
  }
  /** Can the game at this table start now? */
  canStart(s = this.state) {
    if (s.phase !== "lobby" || s.players.length < 2) return false;
    if (this.mode === "online") return s.players.length >= (s.capacity || this.wantCount);
    const w = this.waitingFor(s);
    return !w.notReady.length && !w.notAgreed.length;
  }

  private startGame() {
    this.commit((s) => {
      if (!this.canStart(s)) return false;
      s.seats = seatsFor(s.players);
      Object.assign(s, { phase: "playing", tokens: freshTokens(), winners: [], roll: null, sixes: 0, turn: seated(s)[0], last: null, startAt: null, luck: {}, gid: newGameId() });
      delete s.ready;
      delete s.agreed;
      // Online tables always play the standard rules (Pachisi, Chaupar: Solo or 2 vs 2, as the table was set up).
      if (this.mode === "online") {
        if (hasSides(s.game)) s.variations = { ...noVariations(s.game), alone: playsSolo(s.variations) };
        else delete s.variations;
      }
      this.setupGame(s);
    });
  }

  /** Once everyone is seated: the game's own setup (Pachisi: partners, who goes first), then "Game on!". */
  private setupGame(s: GameState) {
    delete s.teams;
    delete s.order;
    delete s.skip;
    delete s.pachisi;
    delete s.chaupar;
    rulesFor(s).setup?.(s);
    s.log = [{ c: "" as const, t: `Game on! ${seatName(s, s.turn as Color)} goes first.` }, ...s.log].slice(0, 20);
  }

  /** Friends lobby, host: player `id` is ready (or not). */
  private hostReady(id: string, on: boolean) {
    this.commit((s) => {
      if (s.phase !== "lobby" || !s.players.some((p) => p.id === id) || !!s.ready?.includes(id) === on) return false;
      s.ready = on ? [...(s.ready || []), id] : (s.ready || []).filter((x) => x !== id);
    });
  }
  /** Friends lobby, host: player `id` agrees to the variations of version vv (or not). */
  private hostAgree(id: string, on: boolean, vv: number) {
    this.commit((s) => {
      if (s.phase !== "lobby" || !s.players.some((p) => p.id === id) || !!s.agreed?.includes(id) === on) return false;
      // Agreeing to rules that have just changed doesn't count: they have to see the new ones first.
      if (on && vv !== (s.variationsV || 0)) return false;
      s.agreed = on ? [...(s.agreed || []), id] : (s.agreed || []).filter((x) => x !== id);
    });
  }
  /** Friends lobby, host: the room's creator changed the variations. Everyone has to agree again. */
  private hostVariations(id: string, v: unknown) {
    if (id !== this.roomOwnerId()) return;
    this.commit((s) => {
      if (s.phase !== "lobby" || !hasVariations(s.game)) return false;
      const next = cleanFor(s.game, v);
      if (JSON.stringify(cleanFor(s.game, s.variations)) === JSON.stringify(next)) return false;
      s.variations = next;
      s.variationsV = (s.variationsV || 0) + 1;
      s.agreed = [];
      addLog(s, "", `${s.players.find((p) => p.id === id)?.nick || "The host"} changed the rules. Everyone has to agree again.`);
    });
  }

  // ============================================================ player actions
  /**
   * Guest, in the lobby: what I've asked for (to be at the table, ready, agreeing
   * to the rules of version vv, the game to start). Sent again until the host's
   * game shows it, so a message lost on a bad connection can't leave the lobby
   * waiting for ever. (The host takes each the same however often it comes.)
   */
  private lobbyWant: { join?: boolean; ready?: boolean; agree?: number | null; start?: boolean } = {};
  private lobbySentAt = 0;
  join = () => {
    this.lobbyWant.join = true;
    if (this.isHost || !this.online) this.hostJoin(this.myId, this.myNick(), this.myLooks());
    else this.transport?.sendToHost({ type: "join", id: this.myId, nick: this.myNick(), ...this.myLooks() });
  };
  leave = () => {
    this.lobbyWant = { join: false };
    if (this.isHost || !this.online) this.hostLeave(this.myId);
    else this.transport?.sendToHost({ type: "leave", id: this.myId });
  };
  start = () => {
    if (!this.canRunTable()) return;
    if (this.isHost || !this.isNet()) this.startGame();
    else {
      this.lobbyWant.start = true;
      this.transport?.sendToHost({ type: "start" });
    }
  };
  /** Friends lobby: mark myself ready to start (or not). */
  setReady = (on: boolean) => {
    this.lobbyWant.ready = on;
    if (this.isHost || !this.online) this.hostReady(this.myId, on);
    else this.transport?.sendToHost({ type: "ready", id: this.myId, on });
  };
  /** Friends lobby (Pachisi): agree to the variations on show (or not). */
  agree = (on: boolean) => {
    const vv = this.state.variationsV || 0;
    this.lobbyWant.agree = on ? vv : null;
    if (this.isHost || !this.online) this.hostAgree(this.myId, on, vv);
    else this.transport?.sendToHost({ type: "agree", id: this.myId, on, vv });
  };
  /** Guest, in the lobby: send again what the host's game doesn't show yet. */
  private resendLobby(now: number) {
    const s = this.state;
    if (this.isHost || !this.online || !this.loaded || s.phase !== "lobby") {
      if (s.phase !== "lobby") this.lobbyWant = {};
      return;
    }
    if (now - this.lobbySentAt < RESEND_MS) return;
    this.lobbySentAt = now;
    const t = this.transport;
    const me = this.myId;
    const w = this.lobbyWant;
    if (w.join && !this.joined(s)) t?.sendToHost({ type: "join", id: me, nick: this.myNick(), ...this.myLooks() });
    if (w.join === false && this.joined(s)) t?.sendToHost({ type: "leave", id: me });
    if (!this.joined(s)) return;
    if (w.ready !== undefined && !!s.ready?.includes(me) !== w.ready) t?.sendToHost({ type: "ready", id: me, on: w.ready });
    // (Agreeing counts only for the rules as they were: once they change, I agree again myself.)
    if (w.agree !== undefined) {
      const agreed = !!s.agreed?.includes(me);
      if (w.agree === null ? agreed : !agreed && w.agree === (s.variationsV || 0)) t?.sendToHost({ type: "agree", id: me, on: w.agree !== null, vv: w.agree ?? 0 });
    }
    if (w.start) t?.sendToHost({ type: "start" });
  }
  /** Friends lobby (Pachisi, Parchís), the room's creator: play with these variations. */
  setVariations = (v: Variations) => {
    if (!this.canRunTable()) return;
    const game = this.state.game;
    // Kept for next time only if I saved my preferences for this game.
    const p = this.services.profile.get();
    if (hasVariations(game) && p.saveVariations[game]) this.services.profile.save({ variations: { ...p.variations, [game]: cleanFor(game, v) } });
    if (this.isHost || !this.online) this.hostVariations(this.myId, v);
    else this.transport?.sendToHost({ type: "variations", id: this.myId, variations: v });
  };
  /** The variations this table plays (none: the traditional rules). */
  variations(): Variations {
    const g = this.state.game;
    return this.state.variations ? cleanFor(g, this.state.variations) : noVariations(g);
  }
  amReady() {
    return this.mode !== "friends" || this.roomOwnerId() === this.myId || !!this.state.ready?.includes(this.myId);
  }
  haveAgreed() {
    return this.roomOwnerId() === this.myId || !!this.state.agreed?.includes(this.myId);
  }
  roll = () => {
    if (this.canRollNow() && this.state.turn) this.doRoll(this.state.turn);
  };
  /** Move token i of colour c (a partner's too, in games where that's allowed: see pieceRef). */
  move = (c: Color, i: number, opt: MoveOpt = {}) => {
    const s = this.state;
    const ref = this.pieceRef(c, i);
    if (ref && s.phase === "playing" && this.mine(s, ref.c) && this.connected()) this.doMove(ref.c, ref.i, opt);
  };
  /** Don't move with this roll (games that allow it: Pachisi). */
  pass = () => {
    const s = this.state;
    const c = s.turn;
    if (c && rulesFor(s).pass && s.phase === "playing" && s.roll && this.mine(s, c) && this.connected()) this.doMove(c, -1);
  };
  reset = () => {
    this.confirmReset = false;
    if (!this.canRunTable()) return;
    // Friends: whoever runs the room now keeps it (the creator may have gone).
    const owner = this.mode === "friends" ? this.roomOwnerId() : undefined;
    this.commit((s) => {
      const { players, seats, capacity, game, variations, variationsV } = s;
      Object.assign(s, freshState(), { players, seats, gid: newGameId() });
      if (capacity) s.capacity = capacity;
      if (game) s.game = game;
      if (owner) s.owner = owner;
      if (variations) Object.assign(s, { variations, variationsV: variationsV || 0 });
      // Friends: the next game's rules start again from the creator's saved preferences (or the
      // standard rules), to be chosen and agreed again in the lobby.
      if (this.mode === "friends" && hasVariations(game)) Object.assign(s, { variations: cleanFor(game, this.services.profile.get().variations[game]), variationsV: (variationsV || 0) + 1 });
      s.log = [{ c: "", t: "New game." }];
      if (this.isNet()) s.seats = seatsFor(players);
      else {
        s.phase = "playing";
        s.turn = seated(s)[0];
        this.setupGame(s);
      }
    });
  };
  clearSeats = () => {
    this.confirmReset = false;
    if (!this.canRunTable()) return;
    const owner = this.roomOwnerId();
    this.commit((s) => {
      const { game, variations, variationsV } = s;
      Object.assign(s, freshState(), owner ? { owner } : {}, game ? { game } : {}, variations ? { variations, variationsV: variationsV || 0 } : {});
    });
  };
  setConfirmReset(v: boolean) {
    this.confirmReset = v;
    this.emit();
  }
  /** Rename while waiting in a lobby (debounced by the caller). */
  renameInLobby() {
    if (this.isNet() && this.joined() && this.state.phase === "lobby") this.join();
  }
  /** The colour I see myself as changed (online / friends). */
  colorChanged() {
    this.emit();
  }
  /** Turn the computer off for my seat and play myself again. */
  takeBack = () => {
    if (!this.myTakeover()) return;
    if (this.isHost) this.hostTakeBack(this.myId);
    else this.transport?.sendToHost({ type: "takeBack", id: this.myId });
  };
  /**
   * I'm here, looking at the game, and connected, but the computer is playing my
   * seat (my connection dropped for a while): take it back by myself. Before,
   * the computer kept playing until the player found and tapped "Bot on".
   */
  private autoTakeBack() {
    if (!this.isNet() || !this.online || !this.myTakeover()) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const now = Date.now();
    if (now - this.takeBackAt < 3_000) return;
    this.takeBackAt = now;
    this.takeBack();
  }

  /**
   * This device came back: from the background, the screen going off, or the
   * network returning. Its timers were stopped meanwhile, so nobody counts as
   * silent for that time: everyone gets a fresh moment to be heard from, and the
   * game catches up at once (the host sends it, a guest asks for it and sends
   * its own unconfirmed moves again).
   */
  private wake() {
    if (!this.isNet() || !this.loaded) return;
    const now = Date.now();
    if (this.isHost) {
      for (const id in this.lastSeen) this.lastSeen[id] = Math.max(this.lastSeen[id], now);
      this.lastPresenceCheck = now;
      if (this.online) {
        this.transport?.broadcast(this.hostPing());
        this.broadcast();
      }
    } else {
      if (this.hostHeardAt) this.hostHeardAt = Math.max(this.hostHeardAt, now - HOST_SILENT_MS + WAKE_GRACE_MS);
      if (this.online) {
        this.transport?.sendToHost({ type: "ping", id: this.myId });
        this.syncAskedAt = 0;
        this.requestSync();
        this.resendPending(true);
      }
    }
    this.autoTakeBack();
  }

  /** Guest: while a move of mine waits for the host a few seconds, the connection line says so. */
  private noteSlow(now: number) {
    if (this.isHost || !this.online) return;
    const slow = this.pending.length > 0 && now - this.pending[0].at > PENDING_SLOW_MS;
    if (slow === this.slowShown) return;
    this.slowShown = slow;
    if (slow) this.setNet("bad", "Slow connection · your move is on its way…");
    else this.netSummary();
    this.emit();
  }

  private hostTakeBack(id: string) {
    this.commit((s) => {
      // Every seat of theirs (in Pachisi one person can play two colours).
      const mine = COLORS.filter((k) => s.seats[k]?.id === id && s.seats[k]?.takeover);
      if (!mine.length) return false;
      for (const c of mine) Object.assign(s.seats[c]!, { bot: false, takeover: false });
      addLog(s, mine[0], `${s.seats[mine[0]]!.nick} is back in control.`);
    });
  }
  /** Friends room: who starts and restarts its games. The one who created it; if they've left, whoever joined first. */
  roomOwnerId(): string {
    const s = this.state;
    // Gone: left the room, or offline for a while (a quick drop and back keeps the room theirs).
    const gone = (id: string) =>
      COLORS.some((c) => {
        const seat = s.seats[c];
        if (seat?.id !== id) return false;
        const a = this.awayInfo(seat);
        return !!seat.left || (a.away && a.since > 0 && Date.now() - a.since > OWNER_AWAY_MS);
      });
    const here = (id: string) => s.players.some((p) => p.id === id) && !gone(id);
    if (s.owner && here(s.owner)) return s.owner;
    return s.players.find((p) => here(p.id))?.id || s.owner || "";
  }
  roomOwnerName() {
    const id = this.roomOwnerId();
    return this.state.players.find((p) => p.id === id)?.nick || "the room's creator";
  }
  /** May I start / restart the game at this table? (In a friends room only its creator may.) */
  canRunTable() {
    return this.mode !== "friends" || this.roomOwnerId() === this.myId;
  }
  /** Am I in a game that leaving now would walk out of? (Then Menu / Back ask first.) */
  leaveNeedsConfirm(): boolean {
    const s = this.state;
    if (!this.loaded || s.phase !== "playing") return false;
    if (this.mode === "local") return true;
    const c = this.mySlot();
    return !!c && !s.winners.includes(c) && !s.seats[c]?.out;
  }

  // ============================================================ starting modes
  /**
   * Unfinished game to offer on the menu: pass-and-play only (a game against
   * the computer is quick to start again), and only for an hour after the last move.
   */
  savedOffline() {
    const saved = this.recentOffline();
    return saved && saved.mode === "local" ? saved : null;
  }
  private recentOffline() {
    const saved = this.services.saves.loadOffline();
    const fresh = saved && Date.now() - (saved.at || 0) < LOCAL_RESUME_MS;
    return fresh && saved.state.phase === "playing" && (saved.mode === "computer" || saved.mode === "local") ? saved : null;
  }
  /** The game page was reloaded: pick the computer / pass-and-play game up again, no questions asked. */
  resumeAfterReload() {
    const saved = this.recentOffline();
    if (!saved) return false;
    this.leaveCurrent();
    this.mode = saved.mode;
    this.startOffline(saved.state);
    return true;
  }

  private startOffline(s: GameState, animateRotation = false) {
    this.state = s;
    this.loaded = true;
    this.online = false;
    this.seenSeq = s.last ? s.last.seq : 0;
    this.confirmReset = false;
    this.banner = "";
    if (animateRotation) {
      this.rot = { angle: 0, target: 0, ready: true };
      this.applyRot();
    } else this.rot.ready = false;
    this.persist();
    this.emit();
  }

  resumeOffline() {
    const saved = this.savedOffline();
    if (!saved) return false;
    this.leaveCurrent();
    this.mode = saved.mode;
    this.startOffline(saved.state);
    return true;
  }

  /** Vs computer. `variations`: the game's own (Pachisi, Parchís, Chaupar), chosen before the game. */
  startComputer(count: number, game: GameId = "ludo", variations?: Variations) {
    this.leaveCurrent();
    const human = this.pref;
    const hi = CI[human];
    const offsets = ({ 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] } as Record<number, number[]>)[count] || [0, 2];
    const s = freshState();
    if (game !== "ludo") s.game = game;
    if (hasVariations(game) && variations) s.variations = cleanFor(game, variations);
    let bot = 0;
    // Computer players come from around the Ludo-playing world: a different flag each.
    const lands = BOT_COUNTRIES.filter((cc) => cc !== this.myLooks().cc).sort(() => Math.random() - 0.5);
    offsets.forEach((o) => {
      const slot = COLORS[(hi + o) % 4];
      // Partners with four (Pachisi, Chaupar 2 vs 2; Parchís in pairs): the computer opposite me is my partner.
      const partner = count === 4 && o === 2 && (hasSides(game) ? !playsSolo(variations) : game === "parchis" && !!variations?.pairs);
      s.seats[slot] = o === 0 ? { id: "me", nick: this.myNick(), ...this.myLooks() } : { id: "bot" + ++bot, nick: partner ? "Partner" : `Computer ${bot}`, bot: true, cc: lands[bot - 1] };
    });
    s.phase = "playing";
    s.turn = human;
    s.turnAt = Date.now();
    s.log = [];
    this.setupGame(s);
    s.players = this.playersOf(s);
    this.mode = "computer";
    this.startOffline(s, true); // my corner animates to the bottom-left
    this.play("start");
  }

  startLocal(rows: { name: string; color: Color }[], game: GameId = "ludo", variations?: Variations) {
    this.leaveCurrent();
    const s = freshState();
    if (game !== "ludo") s.game = game;
    if (hasVariations(game) && variations) s.variations = cleanFor(game, variations);
    // Everyone is at this phone: they share its country.
    const cc = this.myLooks().cc;
    rows.forEach((r, k) => {
      s.seats[r.color] = { id: "L" + (k + 1), nick: r.name.trim() || `Player ${k + 1}`, ...(cc ? { cc } : {}) };
    });
    s.phase = "playing";
    s.turn = seated(s)[0];
    s.turnAt = Date.now();
    s.log = [];
    this.setupGame(s);
    s.players = this.playersOf(s);
    this.mode = "local";
    this.startOffline(s);
    this.play("start");
  }

  /** The people at a table, once each (in Pachisi one person can play two colours). */
  private playersOf(s: GameState) {
    return seated(s)
      .map((c) => ({ id: s.seats[c]!.id, nick: s.seats[c]!.nick }))
      .filter((p, k, all) => all.findIndex((o) => o.id === p.id) === k);
  }

  /** Pachisi / Chaupar online: looking for a 2 vs 2 table (or, with two players, a side each), not a solo one. */
  wantPairs = false;
  /** Public matchmaking: only tables for exactly `count` players (Pachisi, Chaupar: and the same Solo or 2 vs 2). */
  startOnline(count = this.wantCount, game: GameId = this.wantGame, pairs = this.wantPairs) {
    this.leaveCurrent();
    this.mode = "online";
    this.wantCount = count;
    this.wantGame = game;
    this.wantPairs = hasSides(game) && pairs && count !== 3;
    this.autoJoin = true;
    this.searching = true;
    this.findGame(0);
  }

  private findGame(n: number) {
    if (n > 40) {
      this.searching = false;
      this.banner = "Couldn't find a free table right now. Try again in a minute.";
      this.emit();
      return;
    }
    this.searchN = n;
    this.searching = true;
    this.autoJoin = true;
    // Each game has its own public tables (Pachisi players only meet Pachisi players, 2 vs 2 only 2 vs 2).
    void this.openRoom(`pub${PUBLIC_PREFIX[this.wantGame]}${this.wantPairs ? "t" : ""}${this.wantCount}x${n}`);
  }

  /** Friends room `code`; `game` is used if this device sets the room up (a new room). */
  startFriends(code: string, game: GameId = "ludo") {
    if (this.mode === "friends" && this.room === code) return;
    this.leaveCurrent();
    this.mode = "friends";
    this.wantGame = game;
    this.autoJoin = true;
    void this.openRoom(code);
  }

  /** The online / friends game I'm seated in, if I closed the page by mistake. */
  activeRoom() {
    return this.services.saves.loadActiveRoom();
  }

  /** Is s my game `gid`, still being played, with me still in it (not out, not finished)? */
  private stillMine(s: GameState | null, gid: string | null | undefined) {
    if (!s || !validState(s) || s.phase !== "playing") return false;
    if (gid && s.gid && s.gid !== gid) return false;
    const c = COLORS.find((col) => s.seats[col]?.id === this.myId);
    return !!c && !s.seats[c]!.out && !s.winners.includes(c);
  }

  /**
   * The game I could rejoin, if it's really still on: asks its table (without
   * joining). Nobody there, a different game, or me no longer in it: the
   * record is cleared and there's nothing to offer.
   */
  async checkActiveRoom(): Promise<ActiveRoom | null> {
    const a = this.activeRoom();
    if (!a) return null;
    const ask = async () => {
      const t = this.makeTransport();
      if (!t.probe) return undefined;
      try {
        return await t.probe(a.room);
      } catch {
        return null;
      } finally {
        t.close();
      }
    };
    let s = await ask();
    if (s === undefined) return a; // can't check: offer it as before
    // Nobody hosting right now: the table may be changing hands (that takes a few seconds). Look once more.
    if (!s) {
      await new Promise((r) => setTimeout(r, 8000));
      s = await ask();
    }
    if (this.stillMine(s ?? null, a.gid)) return this.activeRoom();
    if (this.activeRoom()?.room === a.room) this.services.saves.clearActiveRoom();
    return null;
  }

  /** The game I tried to get back into is over: back to the home screen with a note. */
  private rejoinFailed(note: string) {
    this.services.saves.clearActiveRoom();
    this.exitToMenu();
    this.notice = note;
    this.emit();
  }
  /** A note for the home screen (read once). */
  takeNotice() {
    const n = this.notice;
    this.notice = "";
    return n;
  }
  /**
   * Go back into that game. Returns the page to open, or null if there's
   * nothing to rejoin. Friends rooms go through their invite link page.
   */
  rejoin(): string | null {
    const a = this.activeRoom();
    if (!a) return null;
    if (a.mode === "friends") {
      if (!(this.mode === "friends" && this.room === a.room)) this.leaveCurrent();
      return roomPath(a.room);
    }
    this.leaveCurrent();
    this.mode = "online";
    this.wantCount = a.count;
    // Show the last known board straight away; the table's live state replaces it once connected.
    const carry = this.services.saves.loadRoom(a.room);
    // "Find another game" after this one looks for the same game.
    this.wantGame = carry?.game || (a.room.startsWith("pubp") ? "pachisi" : a.room.startsWith("pubx") ? "parchis" : a.room.startsWith("pubc") ? "chaupar" : "ludo");
    this.wantPairs = a.room.startsWith("pubpt") || a.room.startsWith("pubct");
    // Check, once connected, that it's still this game and I'm still in it.
    this.rejoinGid = carry?.gid ?? a.gid ?? "";
    if (carry) {
      this.state = carry;
      this.loaded = true;
      this.seenSeq = carry.last?.seq ?? 0;
    }
    void this.openRoom(a.room, carry);
    return "/game";
  }

  /** Leave whatever is running (network rooms, timers). */
  leaveCurrent() {
    if (this.isNet() && this.loaded && this.state.phase === "lobby" && this.joined()) {
      try {
        this.leave();
      } catch {
        /* ignore */
      }
    }
    this.teardown();
    this.hostId = "";
    this.hostHeardAt = 0;
    this.onHostSilent = null;
    this.rejoinGid = null;
    this.rejoinUntil = 0;
    if (this.botTimer) clearTimeout(this.botTimer);
    this.botTimer = null;
    this.online = false;
    this.loaded = false;
    this.searching = false;
    this.autoJoin = false;
    this.room = null;
    this.rolling = false;
    this.rot = { angle: 0, target: 0, ready: false };
    this.applyRot();
    this.state = freshState();
    this.banner = "";
    this.confirmReset = false;
    this.resetChat();
    this.voice.stop();
    this.voiceRoster = [];
    this.voiceMembers.clear();
    this.pending = [];
    this.hostState = null;
    this.lobbyWant = {};
    this.ownRollSeq = 0;
    this.preRolledSeq = 0;
    this.preRolledColor = null;
    this.diceLandsAt = 0;
    this.stopAnimations();
    this.hideWinner();
    this.emit();
  }

  /** Back to the menu: leave the table and forget the mode. */
  exitToMenu() {
    this.leaveCurrent();
    this.mode = null;
    this.emit();
  }

  // ============================================================ token animation
  tokenViews(): TokenView[] {
    const s = this.state;
    const rules = rulesFor(s);
    const groups: Record<string, { c: Color; i: number; p: number; x: number; y: number; lying?: boolean }[]> = {};
    for (const c of COLORS)
      s.tokens[c].forEach((p0, i) => {
        const p = this.animPos[c + i] !== undefined ? this.animPos[c + i] : p0;
        const b = rules.point(c, i, p);
        (groups[b.key] = groups[b.key] || []).push({ c, i, p, x: b.x, y: b.y, lying: b.lying });
      });
    const turn = s.turn;
    // (Piece k * 4 + i of the turn is piece i of the k-th colour it moves: a partner's, in some games.)
    const hands = turn ? rules.handles?.(s, turn) || [turn] : [];
    const moveSet = new Set<string>(
      s.phase === "playing" && s.roll && turn && this.mine(s, turn) ? movable(s, turn, s.roll).map((k) => hands[Math.floor(k / 4)] + String(k % 4)) : [],
    );
    const out: TokenView[] = [];
    for (const key in groups) {
      const list = groups[key];
      const n = list.length;
      // Chaupar: a pair (two pawns of one colour on one position) stands as a stack.
      const placed: ((typeof list)[number] & { scale: number; lift: number; badge?: number })[] = rules.melds
        ? stackSquare(list)
        : list.map((t, k) => {
            let { x, y } = t;
            let scale = 1;
            if (n > 1) {
              scale = n > 2 ? 0.62 : 0.75;
              const off = n > 2 ? 0.22 : 0.2;
              const ang = (k / n) * Math.PI * 2 - Math.PI / 4;
              x += Math.cos(ang) * off;
              y += Math.sin(ang) * off;
            }
            return { ...t, x, y, scale, lift: 0, badge: undefined };
          });
      placed.forEach((t) => {
        const { x, y, scale } = t;
        out.push({
          c: t.c,
          i: t.i,
          x,
          y,
          scale,
          ...(t.lift ? { lift: t.lift } : {}),
          ...(t.badge ? { badge: t.badge } : {}),
          movable: moveSet.has(t.c + t.i),
          // Quick one-square hops while walking; coming out of the yard is a longer glide.
          stepping: this.settings.steps && this.animPos[t.c + t.i] !== undefined && !this.comingOut.has(t.c + t.i),
          returning: this.returning.has(t.c + t.i),
          hidden: !s.seats[t.c] || !!s.seats[t.c]?.out,
          lying: t.lying,
        });
      });
    }
    // Always the same order (red 0-3, green 0-3, ...). Grouped by square, the
    // order changed whenever a token changed square; the board then moved token
    // elements around, and moving an element cancels its slide: the token jumped.
    return out.sort((a, b) => CI[a.c] * 4 + a.i - (CI[b.c] * 4 + b.i));
  }

  private animateMove(m: MoveAnim, caps: { c: Color; i: number; a: number }[], delay: number) {
    const key = m.c + m.i;
    const steps = this.settings.steps && !reduceMotion();
    // The squares in between, by the game's own route.
    const stepsOf = rulesFor(this.state).steps;
    // The same token can move again before its last move has finished (a 6, then
    // an automatic move). Queue behind it instead of cutting it short.
    const gen = (this.animGen[key] = (this.animGen[key] || 0) + 1);
    const busy = steps ? Math.max(0, (this.tokenBusyUntil[key] || 0) - Date.now()) : 0;
    if (busy > delay) delay = busy;
    else this.animPos[key] = m.a; // (while queued, the earlier move is still walking it to m.a)
    caps.forEach((k) => {
      this.animPos[k.c + k.i] = k.a;
    });
    const latest = () => this.animGen[key] === gen;
    const finish = (wait: number) => {
      this.animTimers.push(
        setTimeout(() => {
          // A newer move of this token takes over from here.
          if (latest()) delete this.animPos[key];
          if (m.b === finishOf(this.state)) this.play("home");
          // Reaching a safe square (not straight out of the yard: that has its own sound).
          else if (!caps.length && !entering && rulesFor(this.state).safe?.(m.c, m.b)) this.play("safe");
          if (caps.length) {
            caps.forEach((k) => delete this.animPos[k.c + k.i]);
            this.sendHome(caps.map((k) => k.c + k.i));
            this.play("capture");
          }
          this.emit();
        }, wait),
      );
    };
    // Out of the yard onto the first square: one glide. (A Pachisi piece coming out further walks from there.)
    const entering = m.a === -1 && stepsOf(m.a, m.b).length <= 1;
    const run = () => {
      this.animOwner[key] = gen;
      if (m.a === -1 && !entering) this.play("out");
      if (entering) {
        this.animPos[key] = 0;
        this.comingOut.add(key);
        this.play("out");
        this.emit();
        this.animTimers.push(setTimeout(() => this.comingOut.delete(key), 380));
        finish(380);
        return;
      }
      if (!steps) {
        if (latest()) delete this.animPos[key];
        this.play("move");
        this.emit();
        finish(360);
        return;
      }
      const path = stepsOf(m.a, m.b);
      let k = 0;
      this.animPos[key] = m.a;
      const iv = setInterval(() => {
        if (this.animOwner[key] !== gen) {
          clearInterval(iv);
          return;
        }
        this.animPos[key] = path[k++];
        this.play("move");
        this.emit();
        if (k >= path.length) {
          clearInterval(iv);
          finish(STEP_MS);
        }
      }, STEP_MS);
      this.animTimers.push(iv as unknown as ReturnType<typeof setTimeout>);
    };
    const total = delay + (entering ? 380 : steps ? (stepsOf(m.a, m.b).length + 1) * STEP_MS : 360);
    this.animBusyUntil = Math.max(this.animBusyUntil, Date.now() + total);
    this.tokenBusyUntil[key] = Date.now() + total;
    if (delay) this.animTimers.push(setTimeout(run, delay));
    else run();
  }

  /** Cut tokens glide back to their yard slowly enough to follow across the board. */
  private sendHome(keys: string[]) {
    keys.forEach((k) => this.returning.add(k));
    this.animTimers.push(setTimeout(() => keys.forEach((k) => this.returning.delete(k)), RETURN_MS + 50));
  }

  private stopAnimations() {
    this.animTimers.forEach((t) => {
      clearTimeout(t);
      clearInterval(t as unknown as ReturnType<typeof setInterval>);
    });
    this.animTimers = [];
    this.animBusyUntil = 0;
    for (const k in this.animPos) delete this.animPos[k];
    this.animGen = {};
    this.animOwner = {};
    this.comingOut.clear();
    this.returning.clear();
    this.tokenBusyUntil = {};
  }

  /** Compare two states and play the matching sounds / animations. */
  private onStateChange(prev: GameState | null, next: GameState, remote: boolean) {
    if (!prev || !next) return;
    // A game begins (or begins again): nothing played in it yet.
    if (next.phase === "playing" && !next.last && (prev.phase !== "playing" || (!!next.gid && next.gid !== prev.gid))) this.play("start");
    if (prev.phase === "playing" && (next.phase === "playing" || next.phase === "done")) {
      const moves: MoveAnim[] = [];
      const caps: { c: Color; i: number; a: number }[] = [];
      for (const c of COLORS)
        for (let i = 0; i < 4; i++) {
          const a = prev.tokens[c][i];
          const b = next.tokens[c][i];
          if (a === b) continue;
          if (b === -1 && a >= 0) caps.push({ c, i, a });
          // (Tokens only ever move forward; a Pachisi piece heading home from a later round goes to a smaller number.)
          else if (b !== -1) moves.push({ c, i, a, b });
        }
      // A remote roll animates the dice first, so hold the token until it lands.
      const newRoll = !!next.last && (!prev.last || prev.last.seq !== next.last.seq);
      // (My own roll coming back from the host: its dice already played here.)
      // (A move that arrives while a dice is still spinning here also waits for it to land.)
      const seq = next.last?.seq;
      const delay = Math.max(
        remote && newRoll && seq !== this.ownRollSeq && seq !== this.preRolledSeq ? REMOTE_MOVE_DELAY : 0,
        this.diceLandsAt - Date.now(),
      );
      moves.forEach((m) => this.animateMove(m, caps, delay));
      if (!moves.length && caps.length) {
        this.sendHome(caps.map((k) => k.c + k.i));
        this.play("capture");
      }
    }
    if (next.phase === "playing" && prev.phase === "playing" && next.turn !== prev.turn && this.mode !== "local" && this.mine(next, next.turn)) {
      setTimeout(() => this.play("turn"), Math.max(250, this.animBusyUntil - Date.now()));
    }
    // Celebrate the first player home right away (others may keep playing),
    // and show final rankings when the game is over.
    const wait = Math.max(300, this.animBusyUntil - Date.now() + 200);
    if (prev.phase !== "done" && next.phase === "done") setTimeout(() => this.onFinish(true), wait);
    else if (next.phase === "playing" && (next.winners || []).length > (prev.winners || []).length) setTimeout(() => this.onFinish(false), wait);
    if (!(next.winners || []).length || (next.phase !== "done" && next.phase !== "playing")) this.hideWinner();
  }

  // ============================================================ winner popup
  /**
   * Someone got all their tokens home (`final`: and the game is over).
   * Confetti only on the winner's own device. While others play on, only the
   * player who finished sees their result; everyone else just sees the place
   * badge on that player's name tag. When the game ends, everyone gets the
   * final rankings.
   */
  private onFinish(final: boolean) {
    const s = this.state;
    if (!s.winners.length) return;
    // Partners (Pachisi) win together: nothing to show until a whole side is home.
    if (s.teams && !final) return;
    // Pass-and-play: everyone is at this device.
    const mine = (c: Color) => (this.mode === "local" ? !!s.seats[c] : this.isYou(c));
    if (!this.celebrated && teamOf(s, s.winners[0]).some(mine)) {
      this.celebrated = true;
      this.play("win");
      if (!reduceMotion()) this.fire({ type: "confetti" });
    }
    if (final) {
      if (s.phase !== "done" || this.finalShown) return;
      this.finalShown = true;
      this.winFinal = true;
      this.winOpen = true;
    } else if (this.mode !== "local" && !this.finishShown && s.winners.some((c) => this.isYou(c))) {
      this.finishShown = true;
      this.winFinal = false;
      this.winOpen = true;
    }
    this.emit();
  }
  private hideWinner() {
    this.celebrated = false;
    this.finishShown = false;
    this.finalShown = false;
    this.winOpen = false;
  }
  closeWinner() {
    this.winOpen = false;
    this.emit();
  }
  /** Winner popup "Play again" */
  /**
   * Vs computer / this device, a game with variations whose rules aren't saved as
   * my preferences: "Play again" goes back to choosing them (the page to open).
   * Null: play again straight away.
   */
  againPath(): string | null {
    const g = this.state.game;
    if (this.isNet() || !hasVariations(g) || this.services.profile.get().saveVariations[g]) return null;
    return `/play/${this.mode}?game=${g}`;
  }
  playAgain() {
    this.winOpen = false;
    if (this.mode === "online") this.startOnline(this.wantCount);
    else if (this.canRunTable()) this.reset();
  }

  // ============================================================ board rotation
  /** Board rotation: turns (with an animation) only when my seat changes, i.e. when I join. */
  private applyRot() {
    this.rotListeners.forEach((fn) => fn());
  }
  private updateRotation() {
    const t = this.targetTurns() * 90;
    if (this.rot.ready && t === this.rot.target) return;
    const instant = !this.rot.ready || reduceMotion() || typeof window === "undefined";
    this.rot.ready = true;
    this.rot.target = t;
    if (this.rotFrame) cancelAnimationFrame(this.rotFrame);
    if (instant) {
      this.rot.angle = t;
      this.applyRot();
      return;
    }
    const from = this.rot.angle;
    const d = ((((t - from) % 360) + 540) % 360) - 180;
    const t0 = performance.now();
    const step = (now: number) => {
      if (this.rot.target !== t) return;
      const p = Math.min(1, (now - t0) / 900);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      this.rot.angle = from + d * e;
      this.applyRot();
      if (p < 1) this.rotFrame = requestAnimationFrame(step);
      else {
        this.rot.angle = ((t % 360) + 360) % 360;
        this.applyRot();
      }
    };
    this.rotFrame = requestAnimationFrame(step);
  }
  /** Which corner (0 top-left, 1 top-right, 2 bottom-right, 3 bottom-left) a slot appears in. */
  cornerOf(c: Color) {
    return (CI[c] + this.rot.target / 90) % 4;
  }

  // ============================================================ chat
  addChat(m: Partial<ChatMessage> | null | undefined, quiet = false) {
    if (!m || typeof m.text !== "string" || typeof m.mid !== "string") return false;
    if (this.chat.some((x) => x.mid === m.mid)) return false;
    const msg: ChatMessage = {
      mid: m.mid.slice(0, 64),
      id: String(m.id || "").slice(0, 40),
      nick: String(m.nick || "Player").slice(0, NICK_MAX),
      text: m.text.trim().slice(0, 200),
      ts: Number(m.ts) || Date.now(),
    };
    if (!msg.text) return false;
    this.chat = [...this.chat, msg].slice(-40);
    delete this.typing[msg.id];
    if (!quiet) {
      if (msg.id !== this.myId && !this.chatOpen) this.unread++;
      if (msg.id !== this.myId) {
        this.play("chat");
        try {
          navigator.vibrate?.(20);
        } catch {
          /* ignore */
        }
      }
      this.bubbles[msg.id] = { text: msg.text, until: Date.now() + 4500 };
      setTimeout(() => this.emit(), 4600);
    }
    this.emit();
    return true;
  }
  sendChat(text: string) {
    text = String(text || "").trim().slice(0, 200);
    if (!text || !this.isNet() || !this.online) return;
    const me = this.state.players.find((p) => p.id === this.myId);
    const m = {
      type: "chat" as const,
      mid: this.myId + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      id: this.myId,
      nick: me?.nick || this.myNick(),
      text,
      ts: Date.now(),
    };
    this.typingSentAt = 0; // the message itself clears my "typing…" for everyone
    this.addChat(m);
    this.transport?.broadcast(m);
  }
  /** Tell the table I'm typing (or stopped). Repeats at most every 2s while typing. */
  setTyping(on: boolean) {
    if (!this.isNet() || !this.online) return;
    const now = Date.now();
    if (on ? now - this.typingSentAt < 2000 : !this.typingSentAt) return;
    this.typingSentAt = on ? now : 0;
    this.transport?.broadcast({ type: "typing", id: this.myId, on });
  }
  private noteTyping(id: string, on: boolean) {
    if (!id || id === this.myId) return;
    if (on) {
      this.typing[id] = Date.now() + TYPING_TTL;
      setTimeout(() => this.emit(), TYPING_TTL + 100);
    } else delete this.typing[id];
    this.emit();
  }
  isTyping(id: string) {
    return (this.typing[id] || 0) > Date.now();
  }
  /** Names of the other players typing right now. */
  typingNames() {
    return this.state.players.filter((p) => this.isTyping(p.id)).map((p) => p.nick);
  }
  openChat() {
    this.chatOpen = true;
    this.unread = 0;
    this.emit();
  }
  closeChat() {
    this.chatOpen = false;
    this.emit();
  }
  private resetChat() {
    this.chat = [];
    this.unread = 0;
    this.bubbles = {};
    this.typing = {};
    this.typingSentAt = 0;
    this.chatOpen = false;
  }

  // ============================================================ voice chat
  // Everyone at an online / friends table is in voice chat from the start:
  // speaker on (you hear the others), mic off. The mic asks for permission the
  // first time it's turned on.

  /** Join voice chat for this table (listening only; no microphone needed). */
  private joinVoice() {
    this.voice.start();
    this.announceVoice();
  }
  /** My mic button. */
  async toggleMic() {
    if (!this.isNet() || !this.online) return;
    if (!this.voice.on) this.voice.start();
    try {
      await this.voice.setMic(!this.voice.micOn);
    } catch {
      this.setBanner("Microphone blocked. Allow microphone access to talk in voice chat.");
      return;
    }
    this.announceVoice();
  }
  /** My speaker button: stop hearing everyone, or hear everyone again. */
  toggleSpeaker() {
    if (!this.voice.on) this.voice.start();
    this.voice.setSpeaker(!this.speakerOn());
  }
  /** Do I hear anyone? (What my speaker button shows.) */
  speakerOn() {
    const others = this.voiceRoster.filter((m) => m.id !== this.myId).map((m) => m.id);
    return this.voice.hearsAny(others);
  }
  /** Hear / stop hearing one player, for me only (the speaker button on their name tag). */
  toggleHear(pid: string) {
    this.voice.setHear(pid, !this.voice.hears(pid));
  }
  hears(pid: string) {
    return this.voice.hears(pid);
  }
  inVoice(pid: string) {
    return this.voiceRoster.some((m) => m.id === pid);
  }
  /** Is this player's microphone off? */
  micOffFor(pid: string) {
    return pid === this.myId ? !this.voice.micOn : !!this.voiceRoster.find((m) => m.id === pid)?.muted;
  }
  isSpeaking(pid: string) {
    return this.voice.speaking.has(pid === this.myId ? "me" : pid);
  }
  private announceVoice() {
    const m = { type: "voice" as const, id: this.myId, peerId: this.transport?.peerId() || "", on: this.voice.on, muted: !this.voice.micOn, gen: this.voice.gen };
    if (this.isHost) this.hostVoice(m);
    else this.transport?.sendToHost(m);
  }
  /** Host: someone joined / left voice chat or muted their mic. */
  private hostVoice(m: { id: string; peerId: string; on: boolean; muted: boolean; gen?: number }) {
    if (m.on && m.peerId) {
      const was = this.voiceMembers.get(m.id);
      const gen = m.gen || 0;
      // (Everyone repeats this every few seconds: only tell the table when something changed.)
      if (was && was.peerId === m.peerId && was.muted === !!m.muted && (was.gen || 0) === gen) return;
      this.voiceMembers.set(m.id, { id: m.id, peerId: m.peerId, muted: !!m.muted, gen });
    } else if (!this.voiceMembers.delete(m.id)) return;
    this.shareVoice();
  }
  /** Host: drop people from voice chat who went offline. */
  private pruneVoice() {
    const now = Date.now();
    let changed = false;
    for (const id of [...this.voiceMembers.keys()]) {
      if (id === this.myId) continue;
      const seen = this.lastSeen[id];
      if (seen !== undefined && now - seen > AWAY_GRACE) changed = this.voiceMembers.delete(id) || changed;
    }
    if (changed) this.shareVoice();
  }
  private shareVoice() {
    const list = [...this.voiceMembers.values()];
    this.transport?.broadcast({ type: "voiceRoster", list });
    this.setVoiceRoster(list);
  }
  private setVoiceRoster(list: VoiceMember[]) {
    this.voiceRoster = list;
    this.voice.sync(list, this.myId, this.transport);
    this.emit();
  }

  // ============================================================ timers
  private noteTurn() {
    const s = this.state;
    // A fresh timer for every turn, roll, and when a player takes back control from the computer.
    const k = `${s.phase}|${s.turn}|${s.roll}|${s.last?.seq}|${s.turn ? !!s.seats[s.turn]?.bot : ""}`;
    if (k !== this.turnKey) {
      this.turnKey = k;
      this.turnSeenAt = Date.now();
    }
  }

  /**
   * Every second: "I'm here" pings, and on the host the online countdowns,
   * turn timer (missed turns) and who's offline.
   */
  private ensureHeartbeat() {
    if (this.heartbeat || typeof window === "undefined") return;
    // Back from the background / the screen coming on / the network returning: catch up straight away.
    const onWake = () => {
      if (document.visibilityState === "visible") this.wake();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("pageshow", onWake);
    window.addEventListener("online", () => this.wake());
    // An app left open across an update asks for code that's no longer there: load the new version once.
    window.addEventListener("unhandledrejection", (e) => isChunkError(e.reason) && reloadOnce());
    this.heartbeat = setInterval(() => {
      if (!this.loaded || !this.isNet()) return;
      const s = this.state;
      const now = Date.now();
      // A long gap since the last tick: this device was asleep or in the background (timers stop).
      // Nobody is "silent" because of that: give everyone a fresh moment, and catch up at once.
      const gap = this.lastTick && now - this.lastTick > TICK_GAP_MS;
      this.lastTick = now;
      if (gap) this.wake();
      if (this.online) {
        if (this.isHost) this.transport?.broadcast(this.hostPing());
        else {
          this.transport?.sendToHost({ type: "ping", id: this.myId });
          // The host's page was closed (its connection may still look open for a long time).
          if (this.hostHeardAt && now - this.hostHeardAt > HOST_SILENT_MS) this.onHostSilent?.();
        }
      }
      if (this.pending.length) {
        if (now - this.pending[0].at > PENDING_GIVE_UP_MS) this.dropPending();
        else this.resendPending();
      }
      this.resendLobby(now);
      this.noteSlow(now);
      // Rejoined, and nobody else from the game turned up: everyone had gone.
      if (this.rejoinUntil && now > this.rejoinUntil) {
        this.rejoinFailed("That game has ended. Everyone else had left the table.");
        return;
      }
      if (this.isHost && s.phase === "playing") this.checkPresence();
      if (this.isHost) this.pruneVoice();
      // Retry voice calls that didn't connect (or died).
      if (this.voice.on) this.voice.sync(this.voiceRoster, this.myId, this.transport);
      // Say again that I'm in voice chat: a host that dropped me (I was offline for a moment,
      // or it's a new host) takes me back, so the others call me again.
      if (this.voice.on && this.online && now - this.voiceSaidAt > VOICE_REPEAT_MS) {
        this.voiceSaidAt = now;
        this.announceVoice();
      }
      if (this.isHost && this.mode === "online") {
        // Waiting alone at a later table: an earlier one may have freed up with
        // someone waiting there (two players could each end up hosting a table
        // and never meet). Look again from the first table; only later tables
        // move, so waiting players always end up at the same one.
        if (s.phase === "lobby" && this.searchN > 0 && s.players.length <= 1 && !s.startAt && !this.transport?.guestCount() && now - this.hostingSince > RESEARCH_MS) {
          this.startOnline(this.wantCount);
          return;
        }
        if (s.phase === "lobby" && s.startAt && now >= s.startAt && s.players.length >= (s.capacity || this.wantCount)) this.startGame();
        // A second's grace on the host: a roll made just in time is still on its way here.
        else if (s.phase === "playing" && !this.rolling && s.turn && now - this.turnSeenAt > this.turnLimit(s.turn) + 1000) this.turnTimeout(s.turn);
      }
      if (s.phase === "lobby" ? s.startAt : s.phase === "playing") this.emit();
    }, PING_MS);
  }

  /**
   * Host, online: c's turn time ran out. Not rolling while connected is a
   * missed turn (5 and you're out); an offline player or a pending token pick
   * gets an automatic move instead.
   */
  private turnTimeout(c: Color) {
    const s = this.state;
    const seat = s.seats[c];
    if (!seat || seat.bot) return;
    if (!s.roll && !seat.away) this.commit((n) => missTurn(n, c, MAX_MISSES));
    else this.autoStep();
  }

  /**
   * Host: anyone not heard from for a few seconds is offline. After 15s offline
   * the computer plays for them until they come back and take over again.
   */
  private checkPresence() {
    const now = Date.now();
    this.lastSeen[this.myId] = now;
    const s0 = this.state;
    // After a gap in these checks (this phone asleep, the app in the background)
    // everyone looks silent, but it was this device that wasn't listening: they
    // all get a fresh grace period. (Before, coming back to the app marked
    // everyone offline at once, and the computer took over their seats.)
    if (now - this.lastPresenceCheck > WATCH_GAP_MS) for (const id in this.lastSeen) this.lastSeen[id] = Math.max(this.lastSeen[id], now);
    // Someone we haven't heard from since becoming host gets the grace period from now.
    seated(s0).forEach((c) => (this.lastSeen[s0.seats[c]!.id] ??= now));
    const skip = (s: GameState, c: Color) => s.winners.includes(c) || !!s.seats[c]?.out;
    // Online, with at most one player still here: anyone offline this long (the
    // computer playing for them all the while) has left for good, so the game
    // can end. With two or more still playing, the computer keeps standing in
    // for absent players and they can come back. (Not while I'm rejoining and
    // still waiting to see who else returns.)
    const stillHere = seated(s0).filter((c) => !skip(s0, c) && now - (this.lastSeen[s0.seats[c]!.id] ?? now) <= AWAY_GRACE).length;
    // The time someone has been gone only counts while this device was actually
    // watching: after a gap in these checks (phone asleep, tab in the background)
    // everyone looks silent, but they may well be playing on. Start counting again.
    if (now - this.lastPresenceCheck > WATCH_GAP_MS) this.watchingSince = now;
    this.lastPresenceCheck = now;
    const abandoned = (seat: Seat) =>
      this.mode === "online" &&
      !this.rejoinUntil &&
      stillHere <= 1 &&
      !!seat.away &&
      !!seat.bot &&
      now - Math.max(seat.awayAt || now, this.watchingSince) > ABANDON_MS;
    const changed = seated(s0).some((c) => {
      const seat = s0.seats[c]!;
      if (skip(s0, c)) return false;
      const gone = now - this.lastSeen[seat.id] > AWAY_GRACE;
      return gone !== !!seat.away || (seat.away && !seat.bot && this.offlineLeft(seat) <= 0) || abandoned(seat);
    });
    if (!changed) return;
    this.commit((s) => {
      for (const c of seated(s)) {
        const seat = s.seats[c]!;
        if (skip(s, c)) continue;
        const gone = now - this.lastSeen[seat.id] > AWAY_GRACE;
        if (gone && !seat.away) {
          seat.away = true;
          seat.awayAt = this.lastSeen[seat.id];
          addLog(s, c, `${seat.nick} went offline.`);
        } else if (!gone && seat.away) {
          seat.away = false;
          delete seat.awayAt;
          addLog(s, c, seat.takeover ? `${seat.nick} is back. The computer keeps playing until they take over.` : `${seat.nick} is back.`);
        }
        if (seat.away && !seat.bot && this.offlineLeft(seat) <= 0) {
          seat.bot = true;
          seat.takeover = true;
          addLog(s, c, `${seat.nick} is offline. The computer plays for them.`);
        }
        // Gone for good: out of the game; if one player is left, they win.
        if (s.phase === "playing" && abandoned(seat)) leaveGame(s, c);
      }
    });
  }

  // ============================================================ networking
  private setNet(kind: NetKind, text: string) {
    this.net = { kind, text };
  }
  private netSummary() {
    if (this.isHost) {
      const n = this.transport?.guestCount() || 0;
      this.setNet(
        "ok",
        this.mode === "online"
          ? `Live · ${this.capacity()}-player table · ${n + 1} connected`
          : n
            ? `Live · hosting · ${n} friend${n > 1 ? "s" : ""} connected`
            : "Live · hosting",
      );
    } else this.setNet("ok", this.mode === "online" ? `Live · ${this.capacity()}-player table` : "Live · connected to the table");
  }
  private broadcast() {
    this.transport?.broadcast({ type: "state", state: this.state });
  }
  /** Host: "I'm here", with the game and version I have. */
  private hostPing(): NetMessage {
    return { type: "ping", id: this.myId, v: this.state.v || 0, gid: this.state.gid || "" };
  }
  /**
   * Guest: the host's ping says which game and version it has. If mine (without
   * my own unconfirmed actions) is older or another game, I missed an update: ask for it.
   */
  private checkBehind(m: Extract<NetMessage, { type: "ping" }>) {
    if (m.v === undefined || !this.loaded) return;
    const base = this.hostState || this.state;
    if ((m.gid || "") !== (base.gid || "") || m.v > (base.v || 0)) this.requestSync();
    // The host is behind me (it took the table over with an older copy): offer mine.
    else if (m.v < (base.v || 0)) this.offerState();
    // Still waiting on the host for a move of mine: send it again.
    this.resendPending();
  }

  /**
   * A state arrived from the network. `fromGuest`: a guest offered its saved
   * copy (coming back, or after a host change); the host only takes it if it's
   * the same game. From the host: a different game simply replaces ours.
   */
  private accept(incoming: unknown, fromGuest = false) {
    if (!validState(incoming)) return false;
    const sameGame = (incoming.gid || "") === (this.state.gid || "");
    if (this.loaded && fromGuest && !sameGame) return false;
    // A guest's copy only if it's newer than the host's (the same version: the host's own stands;
    // the guest's moves on top of it come as moves). From the host: anything not older.
    const older = (incoming.v || 0) < (this.state.v || 0) || (fromGuest && (incoming.v || 0) === (this.state.v || 0));
    if (this.loaded && sameGame && older) {
      // The host is behind me (it took the table over with an older copy): offer mine.
      if (!fromGuest && !this.isHost && (incoming.v || 0) < (this.state.v || 0)) this.offerState();
      return false;
    }
    if (!sameGame) {
      this.pending = [];
      this.hostState = null;
    }
    const first = !this.loaded;
    const prev = this.loaded ? this.state : null;
    // My own actions the host hasn't got to yet stay on top of its state, so
    // nothing jumps back while they're on their way.
    let shown = incoming;
    if (this.pending.length) {
      const s = clone(incoming);
      const keep: Pending[] = [];
      for (const a of this.pending) {
        if (confirmedBy(incoming, a)) continue;
        if (!applyPending(s, a)) break;
        keep.push(a);
      }
      this.pending = keep;
      if (keep.length) shown = s;
    }
    this.hostState = this.pending.length ? incoming : null;    this.state = shown;
    this.loaded = true;
    // Rejoining: the table's game must still be mine, still on, with me still in it.
    if (this.rejoinGid !== null && !fromGuest && !this.isHost) {
      const gid = this.rejoinGid;
      this.rejoinGid = null;
      if (!this.stillMine(incoming, gid)) {
        this.rejoinFailed(incoming.phase === "done" ? "That game has already finished." : "That game has ended.");
        return true;
      }
    }
    this.persist();
    if (prev) this.onStateChange(prev, this.state, true);
    if (first) this.onFirstState();
    this.onRemoteState();
    // The computer was standing in for me while my connection was down, and I'm here: play myself again.
    if (!fromGuest) this.autoTakeBack();
    return true;
  }

  /** Called once a room's state is known. */
  private onFirstState() {
    if (this.searching) {
      const s = this.state;
      const cap = s.capacity || 0;
      const sides = !hasSides(s.game) || playsSolo(s.variations) === !this.wantPairs;
      const fits = s.phase === "lobby" && cap === this.wantCount && (s.game || "ludo") === this.wantGame && sides && (s.players.length < cap || this.joined(s));
      if (!fits) {
        const n = this.searchN + 1;
        this.teardown();
        this.loaded = false;
        this.findGame(n);
        return;
      }
      this.searching = false;
    }
    if (this.autoJoin && this.state.phase === "lobby" && !this.joined()) {
      this.autoJoin = false;
      setTimeout(() => this.join(), 0);
    }
    this.autoJoin = false;
  }

  private onRemoteState() {
    const last = this.state.last;
    if (last && last.seq !== this.seenSeq) {
      const first = this.seenSeq === null;
      this.seenSeq = last.seq;
      // My own roll, back from the host: its dice already played on this screen.
      const mine = last.seq === this.ownRollSeq && this.mine(this.state, last.c);
      // Its dice already started spinning here when the "dice" message came.
      const spun = last.seq === this.preRolledSeq;
      if (!first && !mine && !spun) {
        this.rolling = true;
        this.rollColor = last.c;
        this.emit();
        this.animateDie(last.v, last.c, () => {
          this.rolling = false;
          this.emit();
        });
        return;
      }
    } else if (!last) this.seenSeq = 0;
    this.emit();
  }

  private teardown() {
    this.gen++;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.transport?.close();
    this.transport = null;
    this.lastSeen = {};
  }

  private async openRoom(code: string, carry?: GameState | null) {
    this.teardown();
    const my = this.gen;
    this.room = code;
    this.confirmReset = false;
    if (!carry) {
      this.loaded = false;
      this.seenSeq = null;
      this.state = freshState();
    }
    this.setNet("", this.searching ? `Looking for a ${this.wantCount}-player table (${this.searchN + 1})…` : "Connecting…");
    this.emit();
    const t = this.makeTransport();
    this.transport = t;
    t.onCall((call) => this.voice.incoming(call));
    const alive = () => my === this.gen;
    const retry = (ms: number, withState: () => GameState | null) => {
      this.retryTimer = setTimeout(() => {
        if (alive()) void this.openRoom(code, withState());
      }, ms);
    };
    // The previous host and when we last heard from it: if we end up hosting,
    // its offline time counts from then, not from when we took over.
    const prevHost = this.hostId;
    const prevHostHeard = this.hostHeardAt;
    this.hostHeardAt = 0;
    let lostAlready = false;
    const lost = (reason: "host-left" | "network") => {
      if (!alive() || lostAlready) return;
      lostAlready = true;
      this.online = false;
      // An online match that's over has nothing to keep alive: don't take over or
      // reconnect (carrying the finished game into a new table is what made
      // "Find another game" land in the old match again).
      if (this.mode === "online" && this.loaded && this.state.phase === "done") {
        this.setNet("", "Game over · the other players have left the table");
        this.emit();
        return;
      }
      if (reason === "host-left") {
        this.setNet("bad", "Host left · taking over the table…");
        this.emit();
        retry(600 + Math.random() * 1400, () => (this.loaded ? this.state : carry || null));
      } else {
        this.setNet("bad", "Reconnecting…");
        this.emit();
        retry(1200, () => (this.loaded ? this.state : null));
      }
    };
    this.onHostSilent = () => lost("host-left");
    // Nothing at all after a while (the connection server never answered, or a
    // host that's listed but gone): start again instead of "Connecting…" for ever.
    setTimeout(() => {
      if (alive() && !this.online) lost("network");
    }, OPEN_WATCHDOG_MS);
    try {
      await t.open(code, {
        hosting: () => {
          if (!alive()) return;
          this.online = true;
          this.hostId = this.myId;
          this.hostingSince = Date.now();
          // Rejoined an online game and nobody else is at its table: give the
          // others a moment (they may be reconnecting) before calling it over.
          if (this.rejoinGid !== null && this.mode === "online") this.rejoinUntil = Date.now() + REJOIN_WAIT_MS;
          if (prevHost && prevHost !== this.myId && prevHostHeard) this.lastSeen[prevHost] = prevHostHeard;
          // The game as this screen shows it: my own moves the old host never confirmed are in it, and
          // it's the real one now. (Not the copy carried in when this connection began: a roll made
          // while it was connecting was in the game on screen, and taking over without it undid it.)
          let s = (carry && this.loaded ? this.state : carry) || (this.mode === "friends" && this.services.saves.loadRoom(code)) || freshState();
          // (A newer version than the copy the others have, so mine wins when they offer theirs.)
          if (this.pending.length && s === this.state) s = { ...s, v: (s.v || 0) + 1 };          this.pending = [];
          this.hostState = null;
          // A new friends room belongs to whoever opened it first.
          if (this.mode === "friends" && !s.owner) s = { ...s, owner: this.myId };
          if (this.mode === "online" && !s.capacity) {
            s = { ...s, capacity: this.wantCount };
            // A Pachisi / Chaupar table is Solo or 2 vs 2 (and only finds players who picked the same).
            if (hasSides(this.wantGame)) s = { ...s, variations: { ...noVariations(this.wantGame), alone: !this.wantPairs } };
          }
          // A brand-new table plays the game it was set up for.
          if (!carry && s.phase === "lobby" && !s.players.length && !s.game && this.wantGame !== "ludo") {
            s = { ...s, game: this.wantGame };
            // A new friends room for a game with variations starts with the ones its creator saved.
            const g = this.wantGame;
            if (this.mode === "friends" && hasVariations(g)) s = { ...s, variations: cleanFor(g, this.services.profile.get().variations[g]), variationsV: 0 };
          }
          this.state = s;
          const first = !this.loaded;
          this.loaded = true;
          this.persist();
          if (first) this.onFirstState();
          this.netSummary();
          // Took over a game in progress: mark the old host offline now, not on the
          // next heartbeat (their tag flickered back to online for up to a second).
          if (this.state.phase === "playing") this.checkPresence();
          this.onRemoteState();
          // A new host starts a fresh voice chat list; guests re-announce themselves.
          this.voiceMembers.clear();
          this.joinVoice();
        },
        peerOpened: (link) => {
          link.send({ type: "state", state: this.state });
          if (this.chat.length) link.send({ type: "chatHistory", msgs: this.chat });
          if (this.voiceMembers.size) link.send({ type: "voiceRoster", list: [...this.voiceMembers.values()] });
          this.netSummary();
          this.emit();
        },
        peerMessage: (link, m) => this.onPeerMessage(link, m),
        peerClosed: (link) => {
          if (!alive()) return;
          if (link.pid && this.state.phase === "lobby") this.hostLeave(link.pid);
          if (link.pid && this.voiceMembers.delete(link.pid)) this.shareVoice();
          this.netSummary();
          this.emit();
        },
        joinedHost: () => {
          if (!alive()) return;
          this.online = true;
          this.hostHeardAt = Date.now();
          t.sendToHost({ type: "hello", id: this.myId });
          // Offer the game as I have it: the host keeps whichever is newer. (A host that
          // went quiet, say its app in the background, can find a guest has taken the
          // table over with an older copy; without this, the two kept turning each
          // other's game down and the game stopped.)
          const mine = this.loaded ? this.state : carry;
          if (mine) t.sendToHost({ type: "state", state: mine });
          // Moves of mine the old connection never got through: send them now.
          this.resendPending(true);
          this.joinVoice();
          this.netSummary();
          this.emit();
        },
        hostMessage: (m) => {
          if (!alive()) return;
          this.hostHeardAt = Date.now();
          if (m.type === "ping") {
            this.hostId = String(m.id || "");
            this.checkBehind(m);
          } else if (m.type === "state") this.accept(m.state);
          else if (m.type === "dice" && m.id !== this.myId) this.showRemoteDice(m.c, Number(m.v), Number(m.seq));
          else if (m.type === "chat") this.addChat(m);
          else if (m.type === "chatHistory" && Array.isArray(m.msgs)) m.msgs.slice(-40).forEach((x) => this.addChat(x, true));
          else if (m.type === "typing") this.noteTyping(String(m.id || ""), !!m.on);
          else if (m.type === "voiceRoster" && Array.isArray(m.list)) this.setVoiceRoster(m.list);
        },
        lost,
      });
    } catch (e) {
      if (!alive()) return;
      // The app was open across an update and its connection code is gone: load the new version.
      if (isChunkError(e)) {
        reloadOnce();
        return;
      }
      this.banner = "Online play needs an internet connection. Check it and reload the page.";
      this.emit();
    }
  }

  private onPeerMessage(link: PeerLink, m: NetMessage) {
    // Anything from a guest means they're still here.
    if (link.pid) this.lastSeen[link.pid] = Date.now();
    if (m.type === "ping") {
      if (!link.pid && m.id) link.pid = String(m.id);
      if (link.pid) this.lastSeen[link.pid] = Date.now();
      // Answer straight away (not on a timer), so guests hear from us even if this tab is in the background.
      link.send(this.hostPing());
    } else if (m.type === "hello") {
      link.pid = String(m.id || "");
      this.lastSeen[link.pid] = Date.now();
      // Someone from this game came back: it's on.
      if (this.rejoinUntil && seated(this.state).some((c) => this.state.seats[c]!.id === link.pid && link.pid !== this.myId)) {
        this.rejoinUntil = 0;
        this.rejoinGid = null;
      }
    }
    else if (m.type === "join" && typeof m.id === "string") {
      link.pid = m.id;
      this.hostJoin(m.id, String(m.nick || "Player").slice(0, NICK_MAX), { cc: m.cc, av: m.av });
    } else if (m.type === "leave" && typeof m.id === "string") this.hostLeave(m.id);
    else if (m.type === "start" && (this.mode !== "friends" || link.pid === this.roomOwnerId())) this.startGame();
    else if (m.type === "ready" && this.mode === "friends" && link.pid && m.id === link.pid) this.hostReady(link.pid, !!m.on);
    else if (m.type === "agree" && this.mode === "friends" && link.pid && m.id === link.pid) this.hostAgree(link.pid, !!m.on, Number(m.vv));
    else if (m.type === "variations" && this.mode === "friends" && link.pid && m.id === link.pid) this.hostVariations(link.pid, m.variations);
    else if (m.type === "chat") {
      if (this.addChat(m)) this.transport?.broadcast(m, link);
    } else if (m.type === "typing") {
      // Only relay a guest's own typing signal.
      const id = link.pid || String(m.id || "");
      this.noteTyping(id, !!m.on);
      this.transport?.broadcast({ type: "typing", id, on: !!m.on }, link);
    } else if (m.type === "takeBack" && link.pid && m.id === link.pid) this.hostTakeBack(link.pid);
    else if (m.type === "roll" && link.pid && m.id === link.pid) this.hostRoll(link, m.c, Number(m.v), m.seq === undefined ? undefined : Number(m.seq));
    else if (m.type === "sync") link.send({ type: "state", state: this.state });
    else if (m.type === "dice" && link.pid && m.id === link.pid) {
      const seat = this.state.seats[m.c];
      if (seat?.id === link.pid && !seat.bot && this.showRemoteDice(m.c, Number(m.v), Number(m.seq))) this.transport?.broadcast(m, link);
    }
    else if (m.type === "move" && link.pid && m.id === link.pid) this.hostMove(link, m);
    else if (m.type === "voice" && link.pid && m.id === link.pid)
      this.hostVoice({ id: link.pid, peerId: String(m.peerId || ""), on: !!m.on, muted: !!m.muted, gen: Math.max(0, Math.floor(Number(m.gen) || 0)) });
    else if (m.type === "state") {
      // Send the result to everyone, the sender included: if the host changed
      // something at the same moment, the sender must end up with the same state.
      if (this.accept(m.state, true)) this.broadcast();
      else link.send({ type: "state", state: this.state });
    }
  }

  /** Invite link for the current friends room. */
  inviteLink() {
    if (typeof window === "undefined" || !this.room) return "";
    return `${window.location.origin}/r/${this.room}`;
  }
}
