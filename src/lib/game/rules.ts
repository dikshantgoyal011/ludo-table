// Pure Ludo rules. Functions take a state and change it in place; callers
// work on a copy (see GameController.commit). No browser APIs in here, so
// the same rules can later run on a server.
import { CI, COLORS, FINISH, NAMES, SAFE, SLOTS_FOR } from "./constants";
import { trackIdx } from "./geometry";
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
    out[slot] = { id: players[i].id, nick: players[i].nick };
  });
  return out;
}

export const canMove = (p: number, v: number) => p !== FINISH && (p === -1 ? v === 6 : p + v <= FINISH);
export const movable = (s: GameState, c: Color, v: number) =>
  s.tokens[c].map((p, i) => (canMove(p, v) ? i : -1)).filter((i) => i >= 0);

export function nextTurn(s: GameState) {
  s.roll = null;
  s.sixes = 0;
  const active = seated(s).filter((c) => !s.winners.includes(c));
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

export function wouldCapture(s: GameState, c: Color, np: number) {
  if (np > 50) return false;
  const idx = trackIdx(c, np);
  if (SAFE.has(idx)) return false;
  return COLORS.some((o) => o !== c && s.tokens[o].some((op) => op >= 0 && op <= 50 && trackIdx(o, op) === idx));
}

export function applyMove(s: GameState, c: Color, i: number, v: number) {
  const p = s.tokens[c][i];
  const np = p === -1 ? 0 : p + v;
  s.tokens[c][i] = np;
  s.roll = null;
  const captured: Color[] = [];
  if (np <= 50) {
    const idx = trackIdx(c, np);
    if (!SAFE.has(idx)) {
      for (const o of COLORS) {
        if (o === c) continue;
        s.tokens[o].forEach((op, j) => {
          if (op >= 0 && op <= 50 && trackIdx(o, op) === idx) {
            s.tokens[o][j] = -1;
            captured.push(o);
          }
        });
      }
    }
  }
  const who = seatName(s, c);
  if (p === -1) addLog(s, c, `${who} brought a token out.`);
  else if (np === FINISH) addLog(s, c, `${who} got a token home!`);
  else addLog(s, c, `${who} moved ${v}.`);
  if (captured.length) addLog(s, c, `${who} cut ${[...new Set(captured)].map((o) => seatName(s, o)).join(" & ")}!`);
  if (s.tokens[c].every((t) => t === FINISH)) {
    s.winners.push(c);
    addLog(s, c, `${who} finished in place ${s.winners.length}!`);
    nextTurn(s);
    return;
  }
  if (v === 6 || captured.length || np === FINISH) addLog(s, c, `${who} plays again.`);
  else nextTurn(s);
}

/**
 * Record a roll of v for colour c. Moves automatically when there is only one
 * real choice; otherwise leaves s.roll set so the player picks a token.
 * Returns false if the roll isn't allowed right now.
 */
export function applyRoll(s: GameState, c: Color, v: number): boolean {
  if (s.phase !== "playing" || s.turn !== c || s.roll) return false;
  const seq = (s.last?.seq || 0) + 1;
  s.last = { v, c, seq };
  addLog(s, c, `${seatName(s, c)} rolled ${v}.`);
  if (v === 6 && (s.sixes || 0) >= 2) {
    addLog(s, c, "Third 6 in a row. Turn passes.");
    nextTurn(s);
    return true;
  }
  s.sixes = v === 6 ? (s.sixes || 0) + 1 : 0;
  const opts = movable(s, c, v);
  if (!opts.length) {
    addLog(s, c, "No move possible.");
    nextTurn(s);
    return true;
  }
  if (new Set(opts.map((i) => s.tokens[c][i])).size === 1) {
    applyMove(s, c, opts[0], v);
    return true;
  }
  s.roll = v;
  return true;
}

/** Simple computer strategy: finish > capture > bring out > reach safety > advance furthest. */
export function chooseMove(s: GameState, c: Color, v: number) {
  let best = -1;
  let bestScore = -Infinity;
  for (const i of movable(s, c, v)) {
    const p = s.tokens[c][i];
    const np = p === -1 ? 0 : p + v;
    let sc = np * 0.5;
    if (np === FINISH) sc += 100;
    if (wouldCapture(s, c, np)) sc += 80;
    if (p === -1) sc += 60;
    if (np > 50 && p <= 50) sc += 30;
    if (np <= 50 && SAFE.has(trackIdx(c, np))) sc += 15;
    sc += Math.random();
    if (sc > bestScore) {
      bestScore = sc;
      best = i;
    }
  }
  return best;
}

export const validState = (s: unknown): s is GameState => {
  const o = s as GameState;
  return !!o && typeof o === "object" && !!o.tokens && !!o.seats && Array.isArray(o.winners) && Array.isArray(o.players);
};
