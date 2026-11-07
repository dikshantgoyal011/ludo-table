// Parchís rules. Only Parchís uses this file: changes to Ludo or Pachisi never come here.
// Functions take a state and change it in place; callers work on a copy (see
// GameController.commit).
//
// The traditional Spanish game (Spanish Wikipedia, "Parchís"), with one dice:
// - Every piece starts in its house. A 5 brings one out onto its salida, and
//   with a piece in the house and room on the salida it must. Coming out onto
//   a salida where a rival shares the square with another piece captures it
//   (of two rivals there, the one that came last).
// - A 6 rolls again. Once none of the player's pieces is in the house, a 6
//   counts as 7. A third 6 in a row sends the last piece moved back home
//   (unless it's in its pasillo already), and the turn passes.
// - Landing on a lone rival on an ordinary square captures it (back to its
//   house), and the player counts 20 with any one piece. A piece reaching its
//   meta lets the player count 10 with another. A count that no piece can make is lost.
// - Two pieces at most on a square. Two of one colour make a barrier no piece
//   can pass or land on; rolling a 6 with a barrier, the player must open it
//   (if it can move). Two colours can share a seguro (safe square), and nobody
//   is captured there.
// - The meta takes the exact count. Moving is compulsory: the player chooses
//   which piece, when more than one can move.
// - Turns go round counter-clockwise, the way the pieces move. First to bring
//   all four pieces to the meta wins; the others play on for the places.
import { COLORS } from "../constants";
import { addLog, nextTurn, seatName, seated } from "../table";
import type { Color, GameState, MoveChoice, MoveOpt, ParchisTurn, Rulebook } from "../types";
import { isSeguro, keyOf, parchisPoint, parchisSteps, SEGUROS, squareOf, X_FINISH, X_LAST_SHARED, X_PASILLO, X_TRACK } from "./board";

/** Turns go round counter-clockwise, the way the pieces move (top-left, bottom-left, bottom-right, top-right). */
export const X_TURN_ORDER: Color[] = ["red", "blue", "yellow", "green"];
/** The bonus counts: for a capture, and for a piece reaching its meta. */
export const COUNT_CAPTURE = 20;
export const COUNT_HOME = 10;

/** A dice move (1-7), not a bonus count. */
const isDie = (u: number) => u <= 7;

/** The turn in progress, without changing the state (fresh if what's stored is another colour's). */
function peek(s: GameState): ParchisTurn {
  const t = s.parchis;
  if (t && t.c === s.turn && Array.isArray(t.hand)) return t;
  return { c: s.turn, hand: [], again: false, moved: 0, sixPiece: null };
}
/** The turn in progress, stored in the state so it can be changed. */
function turnOf(s: GameState): ParchisTurn {
  const t = peek(s);
  s.parchis = { ...t, hand: [...t.hand] };
  return s.parchis;
}

/** The pieces (any colour) on the square with key k. */
function piecesAt(s: GameState, k: string) {
  const out: { c: Color; i: number }[] = [];
  for (const o of COLORS) s.tokens[o].forEach((p, i) => keyOf(o, p) === k && out.push({ c: o, i }));
  return out;
}
/** Two pieces of one colour on a square round the board: a barrier. */
function barrierAt(s: GameState, k: string) {
  const here = piecesAt(s, k);
  return here.length >= 2 && here.every((x) => x.c === here[0].c);
}

interface Move {
  i: number;
  to: number;
  /** The rival piece it captures. */
  cap: { c: Color; i: number } | null;
}

/** Where piece i of c goes with a move of u, and whom it captures (null: it can't). */
function moveOf(s: GameState, c: Color, i: number, u: number): Move | null {
  const p = s.tokens[c][i];
  if (p >= X_FINISH || !(u > 0)) return null;
  if (p === -1) {
    // Out of the house: only with a 5 of the dice, onto a salida that isn't its own barrier.
    if (u !== 5) return null;
    const here = piecesAt(s, keyOf(c, 0) as string);
    if (here.filter((x) => x.c === c).length >= 2) return null;
    // A full salida: the piece coming out captures the rival there (of two, the one that came last).
    const came = (x: { c: Color; i: number }) => s.parchisAt?.[x.c]?.[x.i] ?? 0;
    const rivals = here.filter((x) => x.c !== c).sort((a, b) => came(a) - came(b));
    return { i, to: 0, cap: here.length >= 2 ? rivals[rivals.length - 1] : null };
  }
  const to = p + u;
  if (to > X_FINISH) return null;
  // No passing a barrier.
  for (let q = p + 1; q < to; q++) {
    const k = keyOf(c, q);
    if (k && q <= X_LAST_SHARED && barrierAt(s, k)) return null;
  }
  if (to === X_FINISH) return { i, to, cap: null };
  const here = piecesAt(s, keyOf(c, to) as string);
  if (here.length >= 2) return null;
  const rival = here.find((x) => x.c !== c);
  // A lone rival on an ordinary square is captured; on a seguro the two share it.
  return { i, to, cap: rival && !isSeguro(c, to) ? rival : null };
}

/** c's pieces standing in one of its own barriers. */
function barrierPieces(s: GameState, c: Color) {
  return s.tokens[c].map((p, i) => (p >= 0 && p <= X_LAST_SHARED && barrierAt(s, keyOf(c, p) as string) ? i : -1)).filter((i) => i >= 0);
}

/**
 * Every move c may make with u, after the rules that force one: a 5 must bring
 * a piece out if one can come out, and a 6 (or 7) must open a barrier if it can.
 */
function legal(s: GameState, c: Color, u: number): Move[] {
  const all = s.tokens[c].map((_, i) => moveOf(s, c, i, u)).filter((m): m is Move => !!m);
  if (isDie(u)) {
    if (u === 5) {
      const out = all.filter((m) => s.tokens[c][m.i] === -1);
      if (out.length) return out;
    }
    if (u >= 6) {
      const inBarrier = new Set(barrierPieces(s, c));
      const opening = all.filter((m) => inBarrier.has(m.i));
      if (opening.length) return opening;
    }
  }
  return all;
}

export function moveChoices(s: GameState, c: Color, i: number, v: number): MoveChoice[] {
  const t = peek(s);
  const hand = t.hand.length ? t.hand : [v];
  const out: MoveChoice[] = [];
  for (const u of new Set(hand)) for (const m of legal(s, c, u)) if (m.i === i) out.push({ to: m.to, use: u });
  return out;
}
export const movable = (s: GameState, c: Color, v: number) => s.tokens[c].map((_, i) => (moveChoices(s, c, i, v).length ? i : -1)).filter((i) => i >= 0);

/** The turn passes to the next colour (round the table counter-clockwise). */
function endTurn(s: GameState) {
  nextTurn(s);
  s.parchis = { c: s.turn, hand: [], again: false, moved: 0, sixPiece: null };
}

/**
 * After a roll or a move: make the next move from hand (by itself when only one
 * piece can make it), roll again if a 6 is owed, or the turn passes. Counts no
 * piece can make are lost.
 */
function carryOn(s: GameState, c: Color) {
  const t = turnOf(s);
  const who = seatName(s, c);
  for (const u of t.hand)
    if (!legal(s, c, u).length) addLog(s, c, isDie(u) ? "No move possible." : `${who} can't count ${u}: no piece can move that far.`);
  t.hand = t.hand.filter((u) => legal(s, c, u).length > 0);
  if (t.hand.length) {
    const u = t.hand[0];
    const moves = legal(s, c, u);
    // Only one real choice (pieces in the same place count once): make it.
    if (t.hand.length === 1 && new Set(moves.map((m) => `${s.tokens[c][m.i]}>${m.to}`)).size === 1) {
      s.roll = u;
      applyMove(s, c, moves[0].i, u, { use: u });
      return;
    }
    s.roll = u;
    return;
  }
  s.roll = null;
  if (t.again) {
    t.again = false;
    addLog(s, c, `${who} rolls again.`);
    return;
  }
  endTurn(s);
}

export function applyMove(s: GameState, c: Color, i: number, v: number, opt: MoveOpt = {}) {
  const pick = moveChoices(s, c, i, v).find((o) => opt.use === undefined || o.use === opt.use);
  if (!pick) return;
  const u = pick.use as number;
  const m = moveOf(s, c, i, u);
  if (!m) return;
  const t = turnOf(s);
  const p = s.tokens[c][i];
  s.tokens[c][i] = m.to;
  if (m.cap) s.tokens[m.cap.c][m.cap.i] = -1;
  const k = t.hand.indexOf(u);
  if (k >= 0) t.hand.splice(k, 1);
  t.moved++;
  const at = (s.parchisAt ??= {});
  (at[c] ??= [0, 0, 0, 0])[i] = (s.last?.seq || 0) * 100 + t.moved;
  // The last piece moved after a 6 (a bonus count too) is the one a third 6 sends home. (s.sixes is only above 0 while this roll is a 6.)
  if ((s.sixes || 0) > 0) t.sixPiece = i;
  s.roll = null;
  const who = seatName(s, c);
  if (p === -1) addLog(s, c, `${who} brought a piece out.`);
  else if (m.to === X_FINISH) addLog(s, c, `${who} got a piece to the meta!`);
  else addLog(s, c, isDie(u) ? `${who} moved ${u}.` : `${who} counted ${u}.`);
  if (m.cap) {
    addLog(s, c, `${who} captured ${seatName(s, m.cap.c)}! Counts ${COUNT_CAPTURE}.`);
    t.hand.push(COUNT_CAPTURE);
  }
  if (s.tokens[c].every((x) => x === X_FINISH)) {
    s.winners.push(c);
    addLog(s, c, `${who} finished in place ${s.winners.length}!`);
    endTurn(s);
    return;
  }
  if (m.to === X_FINISH) {
    addLog(s, c, `Counts ${COUNT_HOME}.`);
    t.hand.push(COUNT_HOME);
  }
  carryOn(s, c);
}

/** Record c's roll of v. Returns false if the roll isn't allowed right now. */
export function applyRoll(s: GameState, c: Color, v: number): boolean {
  if (s.phase !== "playing" || s.turn !== c || s.roll || !Number.isInteger(v) || v < 1 || v > 6) return false;
  const t = turnOf(s);
  s.last = { v, c, seq: (s.last?.seq || 0) + 1 };
  t.moved = 0;
  const who = seatName(s, c);
  addLog(s, c, `${who} rolled ${v}.`);
  const run = v === 6 ? (s.sixes || 0) + 1 : 0;
  if (run >= 3) {
    const k = t.sixPiece;
    const p = k === null ? -1 : s.tokens[c][k];
    if (k !== null && p >= 0 && p <= X_LAST_SHARED) {
      s.tokens[c][k] = -1;
      addLog(s, c, "Third 6 in a row: the last piece moved goes back home.");
    } else addLog(s, c, "Third 6 in a row: it doesn't count.");
    t.hand = [];
    t.again = false;
    endTurn(s);
    return true;
  }
  s.sixes = run;
  // With no piece left in the house, a 6 counts as 7.
  const seven = v === 6 && !s.tokens[c].includes(-1);
  if (seven) addLog(s, c, "No piece in the house: the 6 counts as 7.");
  t.hand = [seven ? 7 : v];
  t.again = v === 6;
  carryOn(s, c);
  return true;
}

/** Square number (1-68) of a piece, or null off the shared track. */
const sq = (c: Color, p: number) => squareOf(c, p);
/** Could a rival piece reach square n with one roll (1-7) from behind it? */
function threatened(s: GameState, c: Color, n: number) {
  for (const o of COLORS) {
    if (o === c || !s.seats[o]) continue;
    for (const q of s.tokens[o]) {
      const m = q >= 0 && q <= X_LAST_SHARED ? sq(o, q) : null;
      if (m === null) continue;
      const d = (n - m + X_TRACK) % X_TRACK;
      if (d >= 1 && d <= 7 && q + d <= X_LAST_SHARED) return true;
    }
  }
  return false;
}

/**
 * Computer players: which piece to move, and with which move in hand. Meta >
 * capture > out of the house > into the pasillo > safety > progress, keeping
 * clear of rivals just behind.
 */
export function chooseMove(s: GameState, c: Color, v: number): { i: number; opt: MoveOpt } {
  const t = peek(s);
  const hand = t.hand.length ? t.hand : [v];
  let best = { i: -1, opt: {} as MoveOpt };
  let bestScore = -Infinity;
  for (const u of new Set(hand))
    for (const m of legal(s, c, u)) {
      const p = s.tokens[c][m.i];
      let sc = m.to * 0.4;
      if (m.to === X_FINISH) sc += 100;
      if (m.cap) sc += 90;
      if (p === -1) sc += 60;
      if (m.to >= X_PASILLO && p < X_PASILLO) sc += 35;
      const n = sq(c, m.to);
      if (n !== null) {
        if (SEGUROS.has(n)) sc += 15;
        else if (threatened(s, c, n)) sc -= 25;
        if (s.tokens[c].some((x, j) => j !== m.i && keyOf(c, x) === keyOf(c, m.to))) sc += 6; // a barrier
      }
      // Getting a piece out of danger.
      const from = p >= 0 ? sq(c, p) : null;
      if (from !== null && !SEGUROS.has(from) && threatened(s, c, from)) sc += 12;
      sc += Math.random();
      if (sc > bestScore) {
        bestScore = sc;
        best = { i: m.i, opt: { use: u } };
      }
    }
  return best;
}

const rollDice = () => 1 + Math.floor(Math.random() * 6);

/** As a game starts: turns go round counter-clockwise, and whoever rolls highest goes first. */
function setup(s: GameState) {
  s.order = [...X_TURN_ORDER];
  delete s.teams;
  s.skip = {};
  let field = seated(s);
  for (let k = 0; k < 30 && field.length > 1; k++) {
    const rolled = field.map(() => rollDice());
    const top = Math.max(...rolled);
    field = field.filter((_, j) => rolled[j] === top);
  }
  s.turn = field[0] || seated(s)[0];
  s.roll = null;
  s.sixes = 0;
  s.parchis = { c: s.turn, hand: [], again: false, moved: 0, sixPiece: null };
  delete s.parchisAt;
  addLog(s, s.turn, `Everyone rolled the dice: ${seatName(s, s.turn)} rolled highest.`);
}

export const parchis: Rulebook = {
  id: "parchis",
  finish: X_FINISH,
  counts: [2, 3, 4],
  isBonus: (v) => v === 6,
  roll: () => rollDice(),
  validRoll: (v) => Number.isInteger(v) && v >= 1 && v <= 6,
  applyRoll,
  moveChoices,
  applyMove,
  pass: null,
  chooseMove,
  steps: parchisSteps,
  point: parchisPoint,
  progress: (s, c) => s.tokens[c].reduce((a, p) => a + (p < 0 ? 0 : p + 1), 0),
  setup,
  stage: (s) => peek(s).moved,
  hand: (s) => peek(s).hand,
};
