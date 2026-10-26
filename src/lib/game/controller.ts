// GameController runs one table: the game state, dice timing, computer
// players, network sync, chat, token animations and the winner popup.
// It is framework-free; React components subscribe to it (see
// src/hooks/use-game.ts) and call its methods.

import { playSound } from "@/lib/audio/sfx";
import { createPeerTransport } from "@/lib/net/peer-transport";
import type { NetMessage, PeerLink, RoomTransport, TransportFactory } from "@/lib/net/transport";
import type { SoundName } from "@/lib/settings/settings";
import type { Services } from "@/lib/services/types";
import {
  AWAY_GRACE,
  CI,
  COLORS,
  DICE_ROLL_MS,
  FINISH,
  OFFLINE_ALLOWANCE,
  ONLINE_FULL_START_DELAY,
  ONLINE_TURN_LIMIT,
  REMOTE_MOVE_DELAY,
  STEP_MS,
  TYPING_TTL,
} from "./constants";
import { rollDie } from "./dice";
import { basePoint } from "./geometry";
import {
  addLog,
  applyMove,
  applyRoll,
  canMove,
  chooseMove,
  clone,
  freshState,
  freshTokens,
  movable,
  seatName,
  seated,
  seatsFor,
  validState,
} from "./rules";
import type { ChatMessage, Color, GameState, Mode, Seat } from "./types";

export type NetKind = "" | "ok" | "bad";

export interface TokenView {
  c: Color;
  i: number;
  x: number;
  y: number;
  scale: number;
  movable: boolean;
  stepping: boolean;
  hidden: boolean;
}

interface MoveAnim {
  c: Color;
  i: number;
  a: number;
  b: number;
}

type GameEvent = { type: "roll"; value: number; color: Color } | { type: "confetti" };

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
  banner = "";
  net: { kind: NetKind; text: string } = { kind: "", text: "Connecting…" };
  confirmReset = false;
  confirmMenu = false;
  // chat
  chat: ChatMessage[] = [];
  unread = 0;
  chatOpen = false;
  bubbles: Record<string, { text: string; until: number }> = {};
  /** Player id -> until when they count as typing. */
  typing: Record<string, number> = {};
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
  private menuTimer: ReturnType<typeof setTimeout> | null = null;
  private seenSeq: number | null = null;
  private autoJoin = false;
  private turnKey = "";
  private winStage = 0;
  private animPos: Record<string, number> = {};
  private animTimers: ReturnType<typeof setTimeout>[] = [];
  private animBusyUntil = 0;
  private rotFrame = 0;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  /** Host: when each player was last connected. */
  private lastSeen: Record<string, number> = {};
  private typingSentAt = 0;
  /** My colour while a game is on; changing the colour setting waits for the next game. */
  private lockedColor: Color | null = null;

  constructor(
    private services: Services,
    private makeTransport: TransportFactory = createPeerTransport,
  ) {}

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
    if (!this.rolling) {
      const lv = this.state.roll || this.state.last?.v;
      if (lv) this.dieFace = lv;
    }
    this.version++;
    this.listeners.forEach((fn) => fn());
    this.tickBots();
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
  private get settings() {
    return this.services.settings.get();
  }
  play(name: SoundName) {
    const s = this.settings.sound;
    if (!s.all || s[name] === false) return;
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
    return this.loaded && !this.rolling && s.phase === "playing" && !s.roll && this.mine(s, s.turn);
  }
  /** Which player the dice sits with. */
  dieColor(): Color | null {
    if (this.rolling) return this.rollColor;
    return this.state.phase === "playing" ? this.state.turn : null;
  }
  secsLeft(at: number) {
    return Math.max(0, Math.ceil((at - Date.now()) / 1000));
  }
  turnSecsLeft() {
    return this.secsLeft(this.turnSeenAt + ONLINE_TURN_LIMIT);
  }
  capacity() {
    return this.state.capacity || this.wantCount;
  }
  /** Offline time a player has left this game (ms), counting down while they're away. */
  offlineLeft(seat: Seat) {
    const bank = seat.bank ?? OFFLINE_ALLOWANCE;
    return seat.away && seat.awayAt ? Math.max(0, bank - (Date.now() - seat.awayAt)) : bank;
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
  private commit(mutate: (s: GameState) => boolean | void) {
    if (!this.loaded) return;
    const prevState = this.state;
    const s = clone(prevState);
    if (mutate(s) === false) return;
    s.v = (prevState.v || 0) + 1;
    if (s.turn !== prevState.turn || s.roll !== prevState.roll || s.last?.seq !== prevState.last?.seq || s.phase !== prevState.phase) s.turnAt = Date.now();
    this.state = s;
    this.persist();
    this.onStateChange(prevState, s, false);
    this.emit();
    if (this.isNet()) this.broadcast();
  }

  private persist() {
    const saves = this.services.saves;
    if (this.isNet()) {
      if (this.room) saves.saveRoom(this.room, this.state);
    } else if (this.mode) saves.saveOffline({ mode: this.mode, state: this.state });
  }

  // ============================================================ roll & move
  private doRoll(c: Color) {
    const s0 = this.state;
    if (this.rolling || s0.phase !== "playing" || s0.turn !== c || s0.roll) return;
    const v = rollDie();
    this.rolling = true;
    this.rollColor = c;
    this.animateDie(v, c, () => {
      this.rolling = false;
      this.commit((s) => {
        if (!applyRoll(s, c, v)) return false;
        this.seenSeq = s.last?.seq ?? null;
      });
      this.emit();
    });
    this.emit();
  }

  private doMove(c: Color, i: number) {
    this.commit((s) => {
      if (s.phase !== "playing" || s.turn !== c || !s.roll) return false;
      if (!canMove(s.tokens[c][i], s.roll)) return false;
      applyMove(s, c, i, s.roll);
    });
  }

  /** One step for a computer player (or an automatic move for an idle online player). */
  private autoStep() {
    const s = this.state;
    if (s.phase !== "playing" || this.rolling || !s.turn) return;
    const c = s.turn;
    if (!s.roll) this.doRoll(c);
    else {
      const i = chooseMove(s, c, s.roll);
      if (i >= 0) this.doMove(c, i);
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
    this.play("dice");
    try {
      navigator.vibrate?.(30);
    } catch {
      /* ignore */
    }
    this.diceRoll = { id: (this.diceRoll?.id || 0) + 1, value: finalV, at: Date.now() };
    this.fire({ type: "roll", value: finalV, color: c });
    this.emit();
    const ms = reduceMotion() ? 0 : DICE_ROLL_MS;
    setTimeout(() => {
      this.dieFace = finalV;
      done();
    }, ms);
  }

  // ============================================================ lobby
  private hostJoin(id: string, nick: string) {
    this.commit((s) => {
      if (s.phase !== "lobby") return false;
      const cap = this.mode === "online" ? s.capacity || this.wantCount : 4;
      const ex = s.players.find((p) => p.id === id);
      if (ex) {
        if (ex.nick === nick) return false;
        ex.nick = nick;
      } else {
        if (s.players.length >= cap) return false;
        s.players.push({ id, nick });
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
      const cap = this.mode === "online" ? s.capacity || this.wantCount : 2;
      if (s.players.length < cap) s.startAt = null;
      s.log = [{ c: "" as const, t: `${me.nick} left.` }, ...s.log].slice(0, 20);
    });
  }

  private startGame() {
    this.commit((s) => {
      if (s.phase !== "lobby" || s.players.length < 2) return false;
      if (this.mode === "online" && s.players.length < (s.capacity || this.wantCount)) return false;
      s.seats = seatsFor(s.players);
      Object.assign(s, { phase: "playing", tokens: freshTokens(), winners: [], roll: null, sixes: 0, turn: seated(s)[0], last: null, startAt: null });
      s.log = [{ c: "" as const, t: `Game on! ${seatName(s, s.turn as Color)} goes first.` }, ...s.log].slice(0, 20);
    });
  }

  // ============================================================ player actions
  join = () => {
    if (this.isHost || !this.online) this.hostJoin(this.myId, this.myNick());
    else this.transport?.sendToHost({ type: "join", id: this.myId, nick: this.myNick() });
  };
  leave = () => {
    if (this.isHost || !this.online) this.hostLeave(this.myId);
    else this.transport?.sendToHost({ type: "leave", id: this.myId });
  };
  start = () => {
    if (this.isHost || !this.isNet()) this.startGame();
    else this.transport?.sendToHost({ type: "start" });
  };
  roll = () => {
    if (this.canRollNow() && this.state.turn) this.doRoll(this.state.turn);
  };
  move = (c: Color, i: number) => {
    const s = this.state;
    if (s.phase === "playing" && s.turn === c && this.mine(s, c)) this.doMove(c, i);
  };
  reset = () => {
    this.confirmReset = false;
    this.commit((s) => {
      const { players, seats, capacity } = s;
      Object.assign(s, freshState(), { players, seats });
      if (capacity) s.capacity = capacity;
      if (this.isNet()) s.seats = seatsFor(players);
      else {
        s.phase = "playing";
        s.turn = seated(s)[0];
      }
      s.log = [{ c: "", t: this.isNet() ? "New game. Press Start when ready." : `New game. ${seatName(s, s.turn as Color)} goes first.` }];
    });
  };
  clearSeats = () => {
    this.confirmReset = false;
    this.commit((s) => {
      Object.assign(s, freshState());
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
  private hostTakeBack(id: string) {
    this.commit((s) => {
      const c = COLORS.find((k) => s.seats[k]?.id === id);
      const seat = c && s.seats[c];
      if (!seat || !seat.takeover) return false;
      seat.bot = false;
      seat.takeover = false;
      addLog(s, c, `${seat.nick} is back in control.`);
    });
  }
  /**
   * Menu button. During an online/friends game the first tap only asks
   * "Leave game?"; returns true when it's fine to leave now.
   */
  requestMenu(): boolean {
    const risky = this.isNet() && this.state.phase === "playing" && !!this.mySlot();
    if (risky && !this.confirmMenu) {
      this.confirmMenu = true;
      this.emit();
      if (this.menuTimer) clearTimeout(this.menuTimer);
      this.menuTimer = setTimeout(() => {
        this.confirmMenu = false;
        this.emit();
      }, 3000);
      return false;
    }
    this.confirmMenu = false;
    return true;
  }

  // ============================================================ starting modes
  /** Unfinished offline game to offer on the menu. */
  savedOffline() {
    const saved = this.services.saves.loadOffline();
    return saved && saved.state.phase === "playing" && (saved.mode === "computer" || saved.mode === "local") ? saved : null;
  }

  private startOffline(s: GameState, animateRotation = false) {
    this.state = s;
    this.loaded = true;
    this.online = false;
    this.seenSeq = s.last ? s.last.seq : 0;
    this.confirmReset = false;
    this.confirmMenu = false;
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

  startComputer(count: number) {
    this.leaveCurrent();
    const human = this.pref;
    const hi = CI[human];
    const offsets = ({ 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] } as Record<number, number[]>)[count] || [0, 2];
    const s = freshState();
    let bot = 0;
    offsets.forEach((o) => {
      const slot = COLORS[(hi + o) % 4];
      s.seats[slot] = o === 0 ? { id: "me", nick: this.myNick() } : { id: "bot" + ++bot, nick: `Computer ${bot}`, bot: true };
    });
    s.players = seated(s).map((c) => ({ id: s.seats[c]!.id, nick: s.seats[c]!.nick }));
    s.phase = "playing";
    s.turn = human;
    s.turnAt = Date.now();
    s.log = [{ c: "", t: `Game on! ${this.myNick()} goes first.` }];
    this.mode = "computer";
    this.startOffline(s, true); // my corner animates to the bottom-left
  }

  startLocal(rows: { name: string; color: Color }[]) {
    this.leaveCurrent();
    const s = freshState();
    rows.forEach((r, k) => {
      s.seats[r.color] = { id: "L" + (k + 1), nick: r.name.trim() || `Player ${k + 1}` };
    });
    s.players = seated(s).map((c) => ({ id: s.seats[c]!.id, nick: s.seats[c]!.nick }));
    s.phase = "playing";
    s.turn = seated(s)[0];
    s.turnAt = Date.now();
    s.log = [{ c: "", t: `Game on! ${seatName(s, s.turn)} goes first.` }];
    this.mode = "local";
    this.startOffline(s);
  }

  /** Public matchmaking: only tables for exactly `count` players. */
  startOnline(count = this.wantCount) {
    this.leaveCurrent();
    this.mode = "online";
    this.wantCount = count;
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
    void this.openRoom(`pub${this.wantCount}x${n}`);
  }

  startFriends(code: string) {
    if (this.mode === "friends" && this.room === code) return;
    this.leaveCurrent();
    this.mode = "friends";
    this.autoJoin = true;
    void this.openRoom(code);
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
    this.confirmMenu = false;
    this.confirmReset = false;
    this.resetChat();
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
    const groups: Record<string, { c: Color; i: number; x: number; y: number }[]> = {};
    for (const c of COLORS)
      s.tokens[c].forEach((p0, i) => {
        const p = this.animPos[c + i] !== undefined ? this.animPos[c + i] : p0;
        const b = basePoint(c, i, p);
        (groups[b.key] = groups[b.key] || []).push({ c, i, x: b.x, y: b.y });
      });
    const turn = s.turn;
    const moveSet = new Set<string>(
      s.phase === "playing" && s.roll && turn && this.mine(s, turn) ? movable(s, turn, s.roll).map((i) => turn + String(i)) : [],
    );
    const out: TokenView[] = [];
    for (const key in groups) {
      const list = groups[key];
      const n = list.length;
      list.forEach((t, k) => {
        let { x, y } = t;
        let scale = 1;
        if (n > 1) {
          scale = n > 2 ? 0.62 : 0.75;
          const off = n > 2 ? 0.22 : 0.2;
          const ang = (k / n) * Math.PI * 2 - Math.PI / 4;
          x += Math.cos(ang) * off;
          y += Math.sin(ang) * off;
        }
        out.push({
          c: t.c,
          i: t.i,
          x,
          y,
          scale,
          movable: moveSet.has(t.c + t.i),
          stepping: this.settings.steps && this.animPos[t.c + t.i] !== undefined,
          hidden: !s.seats[t.c],
        });
      });
    }
    return out;
  }

  private animateMove(m: MoveAnim, caps: { c: Color; i: number; a: number }[], delay: number) {
    const key = m.c + m.i;
    this.animPos[key] = m.a;
    caps.forEach((k) => {
      this.animPos[k.c + k.i] = k.a;
    });
    const steps = this.settings.steps && !reduceMotion();
    const finish = (wait: number) => {
      this.animTimers.push(
        setTimeout(() => {
          delete this.animPos[key];
          if (m.b === FINISH) this.play("home");
          if (caps.length) {
            caps.forEach((k) => delete this.animPos[k.c + k.i]);
            this.play("capture");
          }
          this.emit();
        }, wait),
      );
    };
    const run = () => {
      if (m.a === -1) {
        this.animPos[key] = 0;
        this.play("out");
        this.emit();
        finish(300);
        return;
      }
      if (!steps) {
        delete this.animPos[key];
        this.play("move");
        this.emit();
        finish(360);
        return;
      }
      let p = m.a;
      const iv = setInterval(() => {
        p++;
        this.animPos[key] = p;
        this.play("move");
        this.emit();
        if (p >= m.b) {
          clearInterval(iv);
          finish(STEP_MS);
        }
      }, STEP_MS);
      this.animTimers.push(iv as unknown as ReturnType<typeof setTimeout>);
    };
    const total = delay + (m.a === -1 ? 300 : steps ? (m.b - m.a + 1) * STEP_MS : 360);
    this.animBusyUntil = Math.max(this.animBusyUntil, Date.now() + total);
    if (delay) this.animTimers.push(setTimeout(run, delay));
    else run();
  }

  private stopAnimations() {
    this.animTimers.forEach((t) => {
      clearTimeout(t);
      clearInterval(t as unknown as ReturnType<typeof setInterval>);
    });
    this.animTimers = [];
    this.animBusyUntil = 0;
    for (const k in this.animPos) delete this.animPos[k];
  }

  /** Compare two states and play the matching sounds / animations. */
  private onStateChange(prev: GameState | null, next: GameState, remote: boolean) {
    if (!prev || !next) return;
    if (prev.phase === "playing" && (next.phase === "playing" || next.phase === "done")) {
      const moves: MoveAnim[] = [];
      const caps: { c: Color; i: number; a: number }[] = [];
      for (const c of COLORS)
        for (let i = 0; i < 4; i++) {
          const a = prev.tokens[c][i];
          const b = next.tokens[c][i];
          if (a === b) continue;
          if (b === -1 && a >= 0) caps.push({ c, i, a });
          else if (b > a) moves.push({ c, i, a, b });
        }
      // A remote roll animates the dice first, so hold the token until it lands.
      const newRoll = !!next.last && (!prev.last || prev.last.seq !== next.last.seq);
      const delay = remote && newRoll ? REMOTE_MOVE_DELAY : 0;
      moves.forEach((m) => this.animateMove(m, caps, delay));
      if (!moves.length && caps.length) this.play("capture");
    }
    if (next.phase === "playing" && prev.phase === "playing" && next.turn !== prev.turn && this.mode !== "local" && this.mine(next, next.turn)) {
      setTimeout(() => this.play("turn"), Math.max(250, this.animBusyUntil - Date.now()));
    }
    // Celebrate the first player home right away (others may keep playing),
    // and show final rankings when the game is over.
    const wait = Math.max(300, this.animBusyUntil - Date.now() + 200);
    if (prev.phase !== "done" && next.phase === "done") setTimeout(() => this.showWinner(true), wait);
    else if (next.phase === "playing" && !(prev.winners || []).length && (next.winners || []).length) setTimeout(() => this.showWinner(false), wait);
    if (!(next.winners || []).length || (next.phase !== "done" && next.phase !== "playing")) this.hideWinner();
  }

  // ============================================================ winner popup
  private showWinner(final: boolean) {
    const s = this.state;
    const stage = final ? 2 : 1;
    if (!s.winners.length || this.winStage >= stage) return;
    if (final && s.phase !== "done") return;
    this.winStage = stage;
    this.winFinal = final;
    this.winOpen = true;
    this.play("win");
    if (!reduceMotion()) this.fire({ type: "confetti" });
    this.emit();
  }
  private hideWinner() {
    this.winStage = 0;
    this.winOpen = false;
  }
  closeWinner() {
    this.winOpen = false;
    this.emit();
  }
  /** Winner popup "Play again" */
  playAgain() {
    this.winOpen = false;
    if (this.mode === "online") this.startOnline(this.wantCount);
    else this.reset();
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
      nick: String(m.nick || "Player").slice(0, 16),
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

  // ============================================================ timers
  private noteTurn() {
    const s = this.state;
    const k = `${s.phase}|${s.turn}|${s.roll}|${s.last?.seq}`;
    if (k !== this.turnKey) {
      this.turnKey = k;
      this.turnSeenAt = Date.now();
    }
  }

  /** Host housekeeping every second: online countdowns, idle-player moves and who's offline. */
  private ensureHeartbeat() {
    if (this.heartbeat || typeof window === "undefined") return;
    this.heartbeat = setInterval(() => {
      if (!this.loaded || !this.isNet()) return;
      const s = this.state;
      if (this.isHost && s.phase === "playing") this.checkPresence();
      if (this.isHost && this.mode === "online") {
        if (s.phase === "lobby" && s.startAt && Date.now() >= s.startAt && s.players.length >= (s.capacity || this.wantCount)) this.startGame();
        else if (s.phase === "playing" && !this.rolling && Date.now() - this.turnSeenAt > ONLINE_TURN_LIMIT) this.autoStep();
      }
      if (s.phase === "lobby" ? s.startAt : s.phase === "playing") this.emit();
    }, 1000);
  }

  /**
   * Host: mark players who lost their connection as away and spend their
   * offline time; when it runs out the computer plays for them until they
   * come back and take over again.
   */
  private checkPresence() {
    const now = Date.now();
    const here = new Set([this.myId, ...(this.transport?.connectedIds() || [])]);
    here.forEach((id) => (this.lastSeen[id] = now));
    const s0 = this.state;
    // Someone we haven't seen since becoming host gets the grace period from now.
    seated(s0).forEach((c) => (this.lastSeen[s0.seats[c]!.id] ??= now));
    const changed = seated(s0).some((c) => {
      const seat = s0.seats[c]!;
      if (s0.winners.includes(c)) return false;
      const gone = now - this.lastSeen[seat.id] > AWAY_GRACE;
      return gone !== !!seat.away || (seat.away && !seat.bot && this.offlineLeft(seat) <= 0);
    });
    if (!changed) return;
    this.commit((s) => {
      for (const c of seated(s)) {
        const seat = s.seats[c]!;
        if (s.winners.includes(c)) continue;
        const gone = now - this.lastSeen[seat.id] > AWAY_GRACE;
        if (gone && !seat.away) {
          seat.away = true;
          seat.awayAt = now;
          if (seat.bank === undefined) seat.bank = OFFLINE_ALLOWANCE;
          addLog(s, c, `${seat.nick} went offline.`);
        } else if (!gone && seat.away) {
          seat.bank = this.offlineLeft(seat);
          seat.away = false;
          delete seat.awayAt;
          addLog(s, c, seat.takeover ? `${seat.nick} is back. The computer keeps playing until they take over.` : `${seat.nick} is back.`);
        }
        if (seat.away && !seat.bot && this.offlineLeft(seat) <= 0) {
          seat.bot = true;
          seat.takeover = true;
          addLog(s, c, `${seat.nick} is still offline. The computer plays for them.`);
        }
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
            : "Live · hosting · tap Invite to add friends",
      );
    } else this.setNet("ok", this.mode === "online" ? `Live · ${this.capacity()}-player table` : "Live · connected to the table");
  }
  private broadcast() {
    this.transport?.broadcast({ type: "state", state: this.state });
  }

  /** A state arrived from the network. */
  private accept(incoming: unknown) {
    if (!validState(incoming)) return false;
    if (this.loaded && (incoming.v || 0) < (this.state.v || 0)) return false;
    const first = !this.loaded;
    const prev = this.loaded ? this.state : null;
    this.state = incoming;
    this.loaded = true;
    this.persist();
    if (prev) this.onStateChange(prev, this.state, true);
    if (first) this.onFirstState();
    this.onRemoteState();
    return true;
  }

  /** Called once a room's state is known. */
  private onFirstState() {
    if (this.searching) {
      const s = this.state;
      const cap = s.capacity || 0;
      const fits = s.phase === "lobby" && cap === this.wantCount && (s.players.length < cap || this.joined(s));
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
      if (!first) {
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
    const alive = () => my === this.gen;
    const retry = (ms: number, withState: () => GameState | null) => {
      this.retryTimer = setTimeout(() => {
        if (alive()) void this.openRoom(code, withState());
      }, ms);
    };
    try {
      await t.open(code, {
        hosting: () => {
          if (!alive()) return;
          this.online = true;
          let s = carry || (this.mode === "friends" && this.services.saves.loadRoom(code)) || freshState();
          if (this.mode === "online" && !s.capacity) s = { ...s, capacity: this.wantCount };
          this.state = s;
          const first = !this.loaded;
          this.loaded = true;
          this.persist();
          if (first) this.onFirstState();
          this.netSummary();
          this.onRemoteState();
        },
        peerOpened: (link) => {
          link.send({ type: "state", state: this.state });
          if (this.chat.length) link.send({ type: "chatHistory", msgs: this.chat });
          this.netSummary();
          this.emit();
        },
        peerMessage: (link, m) => this.onPeerMessage(link, m),
        peerClosed: (link) => {
          if (!alive()) return;
          if (link.pid && this.state.phase === "lobby") this.hostLeave(link.pid);
          this.netSummary();
          this.emit();
        },
        joinedHost: () => {
          if (!alive()) return;
          this.online = true;
          t.sendToHost({ type: "hello", id: this.myId });
          if (carry) t.sendToHost({ type: "state", state: carry });
          this.netSummary();
          this.emit();
        },
        hostMessage: (m) => {
          if (m.type === "state") this.accept(m.state);
          else if (m.type === "chat") this.addChat(m);
          else if (m.type === "chatHistory" && Array.isArray(m.msgs)) m.msgs.slice(-40).forEach((x) => this.addChat(x, true));
          else if (m.type === "typing") this.noteTyping(String(m.id || ""), !!m.on);
        },
        lost: (reason) => {
          if (!alive()) return;
          if (reason === "host-left") {
            this.setNet("bad", "Host left · taking over the table…");
            this.emit();
            retry(600 + Math.random() * 1400, () => (this.loaded ? this.state : carry || null));
          } else {
            this.setNet("bad", "Reconnecting…");
            this.emit();
            retry(2500, () => (this.loaded ? this.state : null));
          }
        },
      });
    } catch {
      if (!alive()) return;
      this.banner = "Online play needs an internet connection. Check it and reload the page.";
      this.emit();
    }
  }

  private onPeerMessage(link: PeerLink, m: NetMessage) {
    if (m.type === "hello") link.pid = String(m.id || "");
    else if (m.type === "join" && typeof m.id === "string") {
      link.pid = m.id;
      this.hostJoin(m.id, String(m.nick || "Player").slice(0, 16));
    } else if (m.type === "leave" && typeof m.id === "string") this.hostLeave(m.id);
    else if (m.type === "start") this.startGame();
    else if (m.type === "chat") {
      if (this.addChat(m)) this.transport?.broadcast(m, link);
    } else if (m.type === "typing") {
      // Only relay a guest's own typing signal.
      const id = link.pid || String(m.id || "");
      this.noteTyping(id, !!m.on);
      this.transport?.broadcast({ type: "typing", id, on: !!m.on }, link);
    } else if (m.type === "takeBack" && link.pid && m.id === link.pid) this.hostTakeBack(link.pid);
    else if (m.type === "state" && this.accept(m.state)) this.transport?.broadcast({ type: "state", state: this.state }, link);
  }

  /** Invite link for the current friends room. */
  inviteLink() {
    if (typeof window === "undefined" || !this.room) return "";
    return `${window.location.origin}/r/${this.room}`;
  }
}
