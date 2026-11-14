// What every game at the table shares: seats, whose turn it is, missed turns,
// leaving, and the game log. Nothing here knows the rules of a particular game
// (those are in ludo/ and pachisi/). Functions take a state and change it in
// place; callers work on a copy (see GameController.commit). No browser APIs in
// here, so the same rules can later run on a server.
import { COLORS, NAMES, SLOTS_FOR } from "./constants";
import type { Color, GameState, Player, Seat, TrailStep } from "./types";

export const freshTokens = (): Record<Color, number[]> => ({
  red: [-1, -1, -1, -1],
  green: [-1, -1, -1, -1],
  yellow: [-1, -1, -1, -1],
  blue: [-1, -1, -1, -1],
});

export const freshState = (): GameState => ({
  phase: "lobby",
  players: [],
  seats: {},
  tokens: freshTokens(),
  turn: null,
  roll: null,
  sixes: 0,
  winners: [],
  last: null,
  startAt: null,
  turnAt: 0,
  log: [{ c: "", t: "Table is set." }],
  luck: {},
});

export const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
export const seated = (s: GameState) => COLORS.filter((c) => s.seats[c]);
export const seatName = (s: GameState, c: Color) => s.seats[c]?.nick || NAMES[c];
export const addLog = (s: GameState, c: Color | "", t: string) => {
  s.log = [{ c, t }, ...(s.log || [])].slice(0, 20);
};

/**
 * Every game's rules note each move here as they make it: the screens then
 * play the moves in that order, each after the one before (and its captures)
 * has finished, even when several come in one change.
 */
export function noteStep(s: GameState, moves: TrailStep["moves"], caps: TrailStep["caps"] = []) {
  const trail = s.trail || [];
  const n = (trail[trail.length - 1]?.n || 0) + 1;
  s.trail = [...trail.slice(-15), { n, moves, caps }];
}

/** Seats in join order; two players sit opposite each other. */
export function seatsFor(players: Player[]): Partial<Record<Color, Seat>> {
  const out: Partial<Record<Color, Seat>> = {};
  (SLOTS_FOR[players.length] || []).forEach((slot, i) => {
    const { id, nick, cc, av, ai } = players[i];
    out[slot] = { id, nick, ...(cc ? { cc } : {}), ...(av !== undefined ? { av } : {}), ...(ai ? { ai } : {}) };
  });
  return out;
}

/** Seats still playing: not finished and not out. */
export const inPlay = (s: GameState) => seated(s).filter((c) => !s.winners.includes(c) && !s.seats[c]?.out);

/** The side c plays for: c and its partners (just c when there are no partners). */
export const teamOf = (s: GameState, c: Color): Color[] => s.teams?.find((t) => t.includes(c)) || [c];

export function nextTurn(s: GameState) {
  s.roll = null;
  s.sixes = 0;
  const active = inPlay(s);
  // Over once at most one side is still playing.
  if (new Set(active.map((c) => teamOf(s, c).join())).size <= 1) {
    s.winners.push(...active);
    s.phase = "done";
    s.turn = null;
    addLog(s, "", "Game over.");
    return;
  }
  const order = s.order || COLORS;
  const i = s.turn ? order.indexOf(s.turn) : 0;
  // Twice round: someone who has to miss a turn is passed over once.
  for (let k = 1; k <= 8; k++) {
    const c = order[(i + k) % 4];
    if (!active.includes(c)) continue;
    if (s.skip?.[c]) {
      s.skip[c] = (s.skip[c] as number) - 1;
      if (!s.skip[c]) delete s.skip[c];
      addLog(s, c, `${seatName(s, c)} misses this turn.`);
      continue;
    }
    s.turn = c;
    return;
  }
}

/**
 * c let the turn timer run out without rolling: the turn passes and it counts
 * as a miss. After `maxMisses` misses the player is out and their tokens leave the board.
 */
export function missTurn(s: GameState, c: Color, maxMisses: number) {
  const seat = s.seats[c];
  if (s.phase !== "playing" || s.turn !== c || s.roll || !seat) return false;
  seat.misses = (seat.misses || 0) + 1;
  if (seat.misses >= maxMisses) {
    seat.out = true;
    s.tokens[c] = [-1, -1, -1, -1];
    addLog(s, c, `${seat.nick} missed ${maxMisses} turns and is out of the game.`);
  } else addLog(s, c, `${seat.nick} missed their turn (${seat.misses}/${maxMisses}).`);
  nextTurn(s);
  return true;
}

/**
 * Online: c's time ran out, before throwing or before moving with the throw.
 * It counts as a missed turn (each takes time off their next turns; maxMisses
 * and they're out), but the throw isn't skipped: it's played for them (letting
 * the time run out is no way to get out of a bad throw). Returns true if
 * they're still in, to be played for.
 */
export function timeOut(s: GameState, c: Color, maxMisses: number) {
  const seat = s.seats[c];
  if (s.phase !== "playing" || s.turn !== c || !seat) return false;
  seat.misses = (seat.misses || 0) + 1;
  if (seat.misses >= maxMisses) {
    seat.out = true;
    s.tokens[c] = [-1, -1, -1, -1];
    addLog(s, c, `${seat.nick} missed ${maxMisses} turns and is out of the game.`);
    nextTurn(s);
    return false;
  }
  addLog(s, c, `${seat.nick} ran out of time (${seat.misses}/${maxMisses}). ${s.roll ? "Their move is made" : "Their throw is played"} for them.`);
  return true;
}

/**
 * c has left the game for good (online: offline too long). Their tokens leave
 * the board; if only one player is left, the game ends and they win.
 */
export function leaveGame(s: GameState, c: Color) {
  const seat = s.seats[c];
  if (s.phase !== "playing" || !seat || seat.out || s.winners.includes(c)) return false;
  seat.out = true;
  seat.left = true;
  s.tokens[c] = [-1, -1, -1, -1];
  addLog(s, c, `${seat.nick} left the game.`);
  if (s.turn === c || inPlay(s).length <= 1) nextTurn(s);
  return true;
}

export const validState = (s: unknown): s is GameState => {
  const o = s as GameState;
  return !!o && typeof o === "object" && !!o.tokens && !!o.seats && Array.isArray(o.winners) && Array.isArray(o.players);
};
