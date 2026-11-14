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
// Variations change some of this (variations.ts): two dice, a piece out from
// the start, two-colour barriers on the seguros, and pairs.
import { COLORS } from "../constants";
import { addLog, nextTurn, noteStep, seatName, seated, teamOf } from "../table";
import { PLAIN, type Style } from "../personas";
import type { Color, GameState, MoveChoice, MoveOpt, ParchisTurn, Rulebook } from "../types";
import { isSeguro, keyOf, parchisPoint, parchisSteps, SEGUROS, squareOf, X_FINISH, X_LAST_SHARED, X_PASILLO, X_TRACK } from "./board";
import { cleanParchisVariations, parchisPairs, type ParchisVariations } from "./variations";

/** Turns go round counter-clockwise, the way the pieces move (top-left, bottom-left, bottom-right, top-right). */
export const X_TURN_ORDER: Color[] = ["red", "blue", "yellow", "green"];
/** Pairs: the colours opposite each other play together. */
export const X_TEAMS: Color[][] = [
  ["red", "yellow"],
  ["green", "blue"],
];
/** The bonus counts: for a capture, and for a piece reaching its meta. */
export const COUNT_CAPTURE = 20;
export const COUNT_HOME = 10;
/** Two dice: a move made with both dice at once (they add up to 5: a piece comes out). */
export const X_BOTH = 100;

/** A dice move (1-7), not a bonus count. */
const isDie = (u: number) => u <= 7;
const varsOf = (s: GameState): ParchisVariations => cleanParchisVariations(s.variations);
/** Two dice: a roll is sent as one number, 10 x the first dice + the second (3 and 4: 34). */
export const diceOf = (v: number): [number, number] => [Math.floor(v / 10), v % 10];
const isPair = (v: number) => Number.isInteger(v) && v >= 11 && v <= 66 && v % 10 >= 1 && v % 10 <= 6;

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
/** Two pieces of one colour on a square round the board: a barrier (two colours on a seguro too, with that variation). */
function barrierAt(s: GameState, k: string) {
  const here = piecesAt(s, k);
  if (here.length < 2) return false;
  if (here.every((x) => x.c === here[0].c)) return true;
  return varsOf(s).mixedBarriers && k[0] === "t" && SEGUROS.has(Number(k.slice(1)));
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

/** c's pieces standing in one of its own barriers (two of its colour on a square). */
function barrierPieces(s: GameState, c: Color) {
  const mine = s.tokens[c];
  return mine.map((p, i) => (p >= 0 && p <= X_LAST_SHARED && mine.filter((q) => q === p).length >= 2 ? i : -1)).filter((i) => i >= 0);
}

/** Two dice: can both dice still bring a piece out together (they add up to 5, neither used yet)? */
function bothDice(s: GameState, t: ParchisTurn) {
  const d = t.dice;
  return !!d && d.length === 2 && d[0] + d[1] === 5 && t.hand.includes(d[0]) && t.hand.includes(d[1]);
}

/**
 * Every move c may make with u, after the rules that force one: a 5 must bring
 * a piece out if one can come out, and a 6 (or 7) must open a barrier if it can.
 * Two dice: two adding up to 5 must bring a piece out together, and doubles
 * (not a 6) must open a barrier, which the other dice can't then close again.
 */
function legal(s: GameState, c: Color, u: number): Move[] {
  const v = varsOf(s);
  const t = peek(s);
  if (u === X_BOTH) {
    if (!v.twoDice || !bothDice(s, t)) return [];
    return s.tokens[c].map((p, i) => (p === -1 ? moveOf(s, c, i, 5) : null)).filter((m): m is Move => !!m);
  }
  let all = s.tokens[c].map((_, i) => moveOf(s, c, i, u)).filter((m): m is Move => !!m);
  if (isDie(u)) {
    if (v.twoDice && legal(s, c, X_BOTH).length) return [];
    if (u === 5) {
      const out = all.filter((m) => s.tokens[c][m.i] === -1);
      if (out.length) return out;
    }
    const doubles = !!t.dice && t.dice[0] === t.dice[1];
    if (v.twoDice ? doubles && !t.broke : u >= 6) {
      const inBarrier = new Set(barrierPieces(s, c));
      const opening = all.filter((m) => inBarrier.has(m.i));
      if (opening.length) return opening;
    }
    const b = v.twoDice ? t.broke : null;
    if (b) all = all.filter((m) => !(m.i === b.j && keyOf(c, m.to) === keyOf(c, s.tokens[c][b.i])));
  }
  return all;
}

/** The moves in hand, as the player can pick them (two dice adding up to 5: also both at once). */
function uses(s: GameState): number[] {
  const t = peek(s);
  const out = [...new Set(t.hand)];
  if (varsOf(s).twoDice && bothDice(s, t)) out.push(X_BOTH);
  return out;
}

export function moveChoices(s: GameState, c: Color, i: number, v: number): MoveChoice[] {
  const t = peek(s);
  const hand = t.hand.length ? uses(s) : [v];
  const out: MoveChoice[] = [];
  for (const u of hand) for (const m of legal(s, c, u)) if (m.i === i) out.push({ to: m.to, use: u });
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
 * piece can make it), roll again if a 6 is owed, or the turn passes. Moves no
 * piece can make wait while others can be made (one may open the way), and are
 * lost once none can.
 */
function carryOn(s: GameState, c: Color) {
  const t = turnOf(s);
  const who = seatName(s, c);
  const playable = uses(s).filter((u) => legal(s, c, u).length > 0);
  if (!playable.length) {
    for (const u of t.hand) addLog(s, c, isDie(u) ? "No move possible." : `${who} can't count ${u}: no piece can move that far.`);
    t.hand = [];
  }
  if (t.hand.length) {
    const u = playable[0];
    const moves = legal(s, c, u);
    s.roll = u;
    // Only one real choice (pieces in the same place count once): make it. Out of the house, though, the
    // player picks which piece, unless only one is left there.
    const fromHouse = moves.filter((m) => s.tokens[c][m.i] === -1).length > 1;
    if (playable.length === 1 && !fromHouse && new Set(moves.map((m) => `${s.tokens[c][m.i]}>${m.to}`)).size === 1) applyMove(s, c, moves[0].i, u, { use: u });
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
  const both = u === X_BOTH;
  const m = moveOf(s, c, i, both ? 5 : u);
  if (!m) return;
  const t = turnOf(s);
  const p = s.tokens[c][i];
  // Two dice, doubles: opening a barrier (the other piece in it mustn't close it again).
  if (varsOf(s).twoDice && t.dice?.[0] === t.dice?.[1] && !t.broke && isDie(u) && barrierPieces(s, c).includes(i)) {
    const j = s.tokens[c].findIndex((q, k) => k !== i && q === p);
    t.broke = { i, j };
  }
  s.tokens[c][i] = m.to;
  noteStep(s, [{ c, i, a: p, b: m.to }], m.cap ? [{ ...m.cap, a: s.tokens[m.cap.c][m.cap.i] }] : []);
  if (m.cap) s.tokens[m.cap.c][m.cap.i] = -1;
  for (const d of both ? (t.dice as number[]) : [u]) {
    const k = t.hand.indexOf(d);
    if (k >= 0) t.hand.splice(k, 1);
  }
  t.moved++;
  const at = (s.parchisAt ??= {});
  (at[c] ??= [0, 0, 0, 0])[i] = (s.last?.seq || 0) * 100 + t.moved;
  // The last piece moved after a 6 (a bonus count too) is the one a third 6 sends home. (s.sixes is only above 0 while this roll is a 6.)
  if ((s.sixes || 0) > 0) t.sixPiece = i;
  s.roll = null;
  const who = seatName(s, c);
  if (p === -1) addLog(s, c, both ? `${who} brought a piece out with both dice.` : `${who} brought a piece out.`);
  else if (m.to === X_FINISH) addLog(s, c, `${who} got a piece to the meta!`);
  else addLog(s, c, isDie(u) ? `${who} moved ${u}.` : `${who} counted ${u}.`);
  if (m.cap) {
    addLog(s, c, `${who} captured ${seatName(s, m.cap.c)}! Counts ${COUNT_CAPTURE}.`);
    t.hand.push(COUNT_CAPTURE);
  }
  if (s.tokens[c].every((x) => x === X_FINISH)) {
    s.winners.push(c);
    if (s.teams) {
      // Pairs: one of a pair home wins it for both (its colours come first in the results).
      const side = teamOf(s, c).filter((x) => s.seats[x]);
      s.winners = [...side, ...s.winners.filter((x) => !side.includes(x))];
      const names = [...new Set(side.map((x) => seatName(s, x)))];
      addLog(s, c, `${who} brought all four pieces in: ${names.join(" & ")} ${names.length > 1 ? "win" : "wins"}!`);
    } else addLog(s, c, `${who} finished in place ${s.winners.length}!`);
    endTurn(s);
    return;
  }
  if (m.to === X_FINISH) {
    addLog(s, c, `Counts ${COUNT_HOME}.`);
    t.hand.push(COUNT_HOME);
  }
  carryOn(s, c);
}

/** Record c's roll of v (two dice: see diceOf). Returns false if the roll isn't allowed right now. */
export function applyRoll(s: GameState, c: Color, v: number): boolean {
  if (s.phase !== "playing" || s.turn !== c || s.roll || !validRoll(v, s)) return false;
  const t = turnOf(s);
  s.last = { v, c, seq: (s.last?.seq || 0) + 1 };
  t.moved = 0;
  const who = seatName(s, c);
  if (varsOf(s).twoDice) {
    // Two dice: each played on its own; doubles roll again. (No 7s, no third-6 rule.)
    const [a, b] = diceOf(v);
    addLog(s, c, a === b ? `${who} rolled double ${a}!` : `${who} rolled ${a} and ${b}.`);
    t.dice = [a, b];
    t.hand = [a, b];
    t.again = a === b;
    t.broke = null;
    carryOn(s, c);
    return true;
  }
  addLog(s, c, `${who} rolled ${v}.`);
  const run = v === 6 ? (s.sixes || 0) + 1 : 0;
  if (run >= 3) {
    const k = t.sixPiece;
    const p = k === null ? -1 : s.tokens[c][k];
    if (k !== null && p >= 0 && p <= X_LAST_SHARED) {
      noteStep(s, [], [{ c, i: k, a: p }]);
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
  const mine = teamOf(s, c);
  for (const o of COLORS) {
    if (mine.includes(o) || !s.seats[o]) continue;
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
 * clear of rivals just behind (and never capturing a partner).
 */
export function chooseMove(s: GameState, c: Color, v: number, w?: Style): { i: number; opt: MoveOpt } {
  const k = w || PLAIN;
  const t = peek(s);
  const hand = t.hand.length ? uses(s) : [v];
  const side = teamOf(s, c);
  let best = { i: -1, opt: {} as MoveOpt };
  let bestScore = -Infinity;
  for (const u of hand)
    for (const m of legal(s, c, u)) {
      const p = s.tokens[c][m.i];
      let sc = m.to * 0.4 * k.advance;
      if (m.to === X_FINISH) sc += 100 * k.home;
      if (m.cap) sc += side.includes(m.cap.c) ? -120 : 90 * k.capture;
      if (p === -1) sc += 60 * k.enter;
      if (m.to >= X_PASILLO && p < X_PASILLO) sc += 35 * k.home;
      const n = sq(c, m.to);
      if (n !== null) {
        if (SEGUROS.has(n)) sc += 15 * k.safe;
        else if (threatened(s, c, n)) sc -= 25 * k.risk;
        if (s.tokens[c].some((x, j) => j !== m.i && keyOf(c, x) === keyOf(c, m.to))) sc += 6 * k.safe; // a barrier
      }
      // Getting a piece out of danger.
      const from = p >= 0 ? sq(c, p) : null;
      if (from !== null && !SEGUROS.has(from) && threatened(s, c, from)) sc += 12 * k.risk;
      // A persona's own way: the piece furthest on, or the ones behind.
      if (w && p >= 0) sc += w.lead * p * 0.3;
      sc += Math.random() * k.noise;
      if (sc > bestScore) {
        bestScore = sc;
        best = { i: m.i, opt: { use: u } };
      }
    }
  return best;
}

const rollDice = () => 1 + Math.floor(Math.random() * 6);
function validRoll(v: number, s?: GameState) {
  if (s && varsOf(s).twoDice) return isPair(v);
  return Number.isInteger(v) && v >= 1 && v <= 6;
}

/**
 * As a game starts: turns go round counter-clockwise, and whoever rolls highest
 * goes first. Pairs (four players): the colours opposite play together. A piece
 * out from the start: one of each colour on its salida.
 */
function setup(s: GameState) {
  const v = varsOf(s);
  s.order = [...X_TURN_ORDER];
  if (parchisPairs(v, seated(s).length)) s.teams = X_TEAMS.map((t) => [...t]);
  else delete s.teams;
  s.skip = {};
  if (v.startOut) for (const c of seated(s)) s.tokens[c][0] = 0;
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
  // (Two dice: doubles roll again.)
  isBonus: (v, s) => (s && varsOf(s).twoDice ? diceOf(v)[0] === diceOf(v)[1] : v === 6),
  roll: (s) => (varsOf(s).twoDice ? rollDice() * 10 + rollDice() : rollDice()),
  validRoll,
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
  safe: isSeguro,
};
