// What every game at the table shares: seats, whose turn it is, missed turns,
// leaving, and the game log. Nothing here knows the rules of a particular game
// (those are in ludo/ and pachisi/). Functions take a state and change it in
// place; callers work on a copy (see GameController.commit). No browser APIs in
// here, so the same rules can later run on a server.
import { CI, COLORS, NAMES, SLOTS_FOR } from "./constants";
import type { Color, GameState, Player, Seat } from "./types";

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

/** Seats in join order; two players sit opposite each other. */
export function seatsFor(players: Player[]): Partial<Record<Color, Seat>> {
  const out: Partial<Record<Color, Seat>> = {};
  (SLOTS_FOR[players.length] || []).forEach((slot, i) => {
    const { id, nick, cc, av } = players[i];
    out[slot] = { id, nick, ...(cc ? { cc } : {}), ...(av !== undefined ? { av } : {}) };
  });
  return out;
}

/** Seats still playing: not finished and not out. */
export const inPlay = (s: GameState) => seated(s).filter((c) => !s.winners.includes(c) && !s.seats[c]?.out);

export function nextTurn(s: GameState) {
  s.roll = null;
  s.sixes = 0;
  const active = inPlay(s);
  if (active.length <= 1) {
    if (active.length === 1) s.winners.push(active[0]);
    s.phase = "done";
    s.turn = null;
    addLog(s, "", "Game over.");
    return;
  }
  const i = s.turn ? CI[s.turn] : 0;
  for (let k = 1; k <= 4; k++) {
    const c = COLORS[(i + k) % 4];
    if (active.includes(c)) {
      s.turn = c;
      return;
    }
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
