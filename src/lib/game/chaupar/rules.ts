// Chaupar rules. Only Chaupar uses this file: changes to the other games never come here.
// Functions take a state and change it in place; callers work on a copy (see
// GameController.commit).
//
// The rules (mastersofgames.com, "Chaupar": played as Pachisi, with these differences):
// - Three long dice instead of cowries, each marked 1, 2, 5 and 6. No graces,
//   and no throw ever gives another throw.
// - No castles: a piece can be captured anywhere round the cross (never in a
//   colour's own middle column, which nobody else enters).
// - The pieces start on the board, on squares 6, 7, 23 and 24 counted from the
//   Charkoni. A captured piece goes back to the Charkoni and comes out again
//   with any dice, counting the first square of its arm as 1.
// - Two pieces of one colour landing on one square join into a super-piece and
//   move as one from then on (three or four the same). A super-piece can only
//   be captured by one at least as big; a smaller piece can't land on it.
// - Each dice is played on its own: three pieces, one piece three times, or any
//   mix (a piece moved 2 to join another, then the pair 7 more).
// - Moving is compulsory: a dice is only lost when nothing can use it.
// - Home by the exact count. Partners go home one at a time ("all the blacks
//   must be got home before a yellow piece can go home"): once one of a side has
//   a piece home, the other can't bring one in until all four of the first are.
// - Everyone plays solo unless 2 vs 2 is picked (always solo with three; with
//   two, a side each). Turns go round counter-clockwise, the way the pieces move.
// Variations change some of this (variations.ts).
import { COLORS } from "../constants";
import { addLog, nextTurn, seatName, seated, teamOf } from "../table";
import type { ChauparTurn, Color, GameState, MoveChoice, MoveOpt, Rulebook } from "../types";
import { P_LAP_FROM, P_LAP_TO, pachisiPoint, ROUTE, squareOf } from "../pachisi/board";
import { C_FINISH, C_START, chauparAdvance, chauparSteps } from "./board";
import { facesOf, sayThrow, throwDice, throwOf, validThrow } from "./dice";
import { chauparPairs, cleanChauparVariations, type ChauparVariations } from "./variations";

/** Partners sit opposite each other. */
export const C_TEAMS: Color[][] = [
  ["red", "yellow"],
  ["green", "blue"],
];
/** Turns go round counter-clockwise, the way the pieces move: west, south, east, north. */
export const C_TURN_ORDER: Color[] = ["red", "blue", "yellow", "green"];
/** A super-piece moving with two matching dice together (a variation): 100 + the dice (a pair of 6s: 106), moving both. */
export const C_PAIR = 100;
/** How far a move goes: one dice, or both dice of a pair. */
export const distOf = (u: number) => (u > C_PAIR ? 2 * (u - C_PAIR) : u);

const varsOf = (s: GameState): ChauparVariations => cleanChauparVariations(s.variations);

/** The turn in progress, without changing the state (fresh if what's stored is another colour's). */
function peek(s: GameState): ChauparTurn {
  const t = s.chaupar;
  const cut = t && Array.isArray(t.cut) ? t.cut : [];
  if (t && t.c === s.turn && Array.isArray(t.hand)) return { ...t, dice: Array.isArray(t.dice) ? t.dice : [], cut };
  return { c: s.turn, hand: [], dice: [], moved: 0, cut };
}
/** The turn in progress, stored in the state so it can be changed. */
function turnOf(s: GameState): ChauparTurn {
  const t = peek(s);
  s.chaupar = { ...t, hand: [...t.hand], dice: [...t.dice], cut: [...t.cut] };
  return s.chaupar;
}

/** The colours whose pieces c moves: its own, and with "move your partner's pieces" (2 vs 2) its partner's too. */
function handles(s: GameState, c: Color): Color[] {
  if (!s.teams || !varsOf(s).sharePieces) return [c];
  return [c, ...teamOf(s, c).filter((o) => o !== c && !!s.seats[o] && !s.seats[o]!.out)];
}

/** Pieces of one colour on one position on the board are one piece (a super-piece). */
const onBoard = (p: number) => p >= 0 && p < C_FINISH;
/** Piece j of h and the pieces joined with it, lowest first. */
function groupOf(s: GameState, h: Color, j: number): number[] {
  const p = s.tokens[h][j];
  if (!onBoard(p)) return [j];
  return s.tokens[h].map((q, k) => (q === p ? k : -1)).filter((k) => k >= 0);
}

/** The other side's pieces on the square where h would land at `to`: each piece (or super-piece) by its colour and the pieces in it. */
function rivalsAt(s: GameState, h: Color, to: number): { o: Color; idx: number[] }[] {
  const sq = squareOf(h, to);
  if (!sq) return [];
  const mine = teamOf(s, h);
  const out: { o: Color; idx: number[] }[] = [];
  for (const o of COLORS) {
    if (mine.includes(o)) continue;
    const at = new Map<number, number[]>();
    s.tokens[o].forEach((q, k) => {
      if (squareOf(o, q) === sq) at.set(q, [...(at.get(q) || []), k]);
    });
    for (const idx of at.values()) out.push({ o, idx });
  }
  return out;
}

/** Has h's side captured a rival piece yet? */
const sideCaptured = (s: GameState, h: Color) => peek(s).cut.some((o) => teamOf(s, h).includes(o));
/** Capture before going home (a variation): until its side has captured, a piece goes round again instead of up home. */
const goesRound = (s: GameState, v: ChauparVariations, h: Color) => v.captureFirst && !sideCaptured(s, h);
/** May h bring a piece home now? Not while its partner is part-way home (partners go home one at a time). */
function mayFinish(s: GameState, v: ChauparVariations, h: Color) {
  if (goesRound(s, v, h)) return false;
  return teamOf(s, h).every((o) => {
    if (o === h || !s.seats[o] || s.seats[o]!.out) return true;
    const home = s.tokens[o].filter((q) => q === C_FINISH).length;
    return home === 0 || home === 4;
  });
}

interface Move {
  /** The piece's number for c (k * 4 + j: piece j of the k-th colour c moves). */
  k: number;
  h: Color;
  j: number;
  /** The pieces moving together (a super-piece: more than one). */
  group: number[];
  to: number;
  use: number;
  /** The rival pieces it captures. */
  cut: { o: Color; idx: number[] }[];
}

/** The moves in hand: each dice, and with "doubles move super-pieces" each pair of matching dice. */
function uses(s: GameState): number[] {
  const t = peek(s);
  const out = [...new Set(t.hand)];
  if (varsOf(s).pairMoves) for (const d of new Set(t.hand)) if (t.hand.filter((x) => x === d).length >= 2) out.push(C_PAIR + d);
  return out;
}

/** Every move c can make with u (a dice, or a pair: see C_PAIR), before the rule that a pair goes to a super-piece. */
function movesWith(s: GameState, c: Color, u: number): Move[] {
  const v = varsOf(s);
  const t = peek(s);
  // The dice it takes have to be in hand.
  if (u > C_PAIR ? t.hand.filter((d) => d === u - C_PAIR).length < 2 : !t.hand.includes(u)) return [];
  const out: Move[] = [];
  handles(s, c).forEach((h, n) => {
    s.tokens[h].forEach((p, j) => {
      const group = groupOf(s, h, j);
      // A super-piece moves as one, by its first piece.
      if (group[0] !== j) return;
      // (A pair together is only for a super-piece: a single piece plays each dice on its own.)
      if (u > C_PAIR && !(v.pairMoves && group.length > 1)) return;
      const to = chauparAdvance(p, distOf(u), goesRound(s, v, h));
      if (to === null || (to === C_FINISH && !mayFinish(s, v, h))) return;
      const rivals = rivalsAt(s, h, to);
      // No landing on a bigger piece of the other side.
      if (rivals.some((r) => r.idx.length > group.length)) return;
      out.push({ k: n * 4 + j, h, j, group, to, use: u, cut: rivals });
    });
  });
  return out;
}

/**
 * The moves c may make with u. Doubles move super-pieces (a variation): with a
 * pair in hand that a super-piece can move with, it must, first; the third dice
 * then goes to a single piece, if one can take it.
 */
function legal(s: GameState, c: Color, u: number): Move[] {
  if (u > C_PAIR || !varsOf(s).pairMoves) return movesWith(s, c, u);
  if (uses(s).some((x) => x > C_PAIR && movesWith(s, c, x).length > 0)) return [];
  const all = movesWith(s, c, u);
  const singles = all.filter((m) => m.group.length === 1);
  return peek(s).paired && singles.length ? singles : all;
}

export function moveChoices(s: GameState, c: Color, i: number, _v: number): MoveChoice[] {
  const out: MoveChoice[] = [];
  for (const u of uses(s)) for (const m of legal(s, c, u)) if (m.k === i) out.push({ to: m.to, use: u });
  return out;
}

/** The turn passes to the next colour (round the table counter-clockwise). */
function endTurn(s: GameState) {
  const cut = peek(s).cut;
  nextTurn(s);
  s.chaupar = { c: s.turn, hand: [], dice: [], moved: 0, cut: [...cut] };
}

/**
 * After a throw or a move: the next move from hand (made by itself when there's
 * only one), or the turn passes once nothing is left. Dice nothing can use wait
 * while others can be played (a move may open the way), and are lost once none can.
 */
function carryOn(s: GameState, c: Color) {
  const t = turnOf(s);
  const playable = uses(s).filter((u) => legal(s, c, u).length > 0);
  if (!playable.length) {
    if (t.hand.length) addLog(s, c, t.hand.length === t.dice.length ? "No move possible." : t.hand.length > 1 ? "The other dice can't be used." : "The last dice can't be used.");
    t.hand = [];
    s.roll = null;
    endTurn(s);
    return;
  }
  const u = playable[0];
  s.roll = u;
  // Only one thing to do: do it.
  const moves = legal(s, c, u);
  if (playable.length === 1 && new Set(moves.map((m) => `${m.h}${s.tokens[m.h][m.j]}>${m.to}`)).size === 1) applyMove(s, c, moves[0].k, u, { use: u });
}

export function applyMove(s: GameState, c: Color, i: number, v: number, opt: MoveOpt = {}) {
  const pick = moveChoices(s, c, i, v).find((o) => opt.use === undefined || o.use === opt.use);
  if (!pick) return;
  const u = pick.use as number;
  const m = legal(s, c, u).find((x) => x.k === i);
  if (!m) return;
  const t = turnOf(s);
  const from = s.tokens[m.h][m.j];
  for (const j of m.group) s.tokens[m.h][j] = m.to;
  for (const r of m.cut) for (const k of r.idx) s.tokens[r.o][k] = -1;
  for (const d of u > C_PAIR ? [u - C_PAIR, u - C_PAIR] : [u]) {
    const k = t.hand.indexOf(d);
    if (k >= 0) t.hand.splice(k, 1);
  }
  if (u > C_PAIR) t.paired = true;
  t.moved++;
  s.roll = null;
  const who = seatName(s, c);
  // (Moving a partner's piece; one person playing both colours of a side just moves.)
  const theirs = s.seats[m.h]?.id !== s.seats[c]?.id ? ` ${seatName(s, m.h)}'s` : "";
  const what = m.group.length > 1 ? `${theirs || " a"} super-piece` : theirs ? `${theirs} piece` : "";
  const by = u > C_PAIR ? `a pair of ${u - C_PAIR}s (${distOf(u)})` : `${u}`;
  if (from === -1) addLog(s, c, `${who} brought${theirs ? `${theirs} piece` : " a piece"} back in with ${by}.`);
  else if (m.to === C_FINISH) addLog(s, c, `${who} got${what || " a piece"} home!`);
  else addLog(s, c, `${who} moved${what} ${by}.`);
  if (m.cut.length) {
    if (!t.cut.includes(c)) t.cut.push(c);
    addLog(s, c, `${who} captured ${m.cut.map((r) => (r.idx.length > 1 ? `${seatName(s, r.o)}'s super-piece` : seatName(s, r.o))).join(" & ")}!`);
  }
  const joined = m.to === C_FINISH ? 0 : s.tokens[m.h].filter((q) => q === m.to).length;
  if (joined > m.group.length) addLog(s, c, `${joined} pieces joined into a super-piece.`);
  if (s.tokens[m.h].every((x) => x === C_FINISH)) {
    const side = teamOf(s, m.h);
    const sideHome = side.every((o) => !s.seats[o] || s.seats[o]!.out || s.tokens[o].every((x) => x === C_FINISH));
    const sharing = !!s.teams && varsOf(s).sharePieces;
    if (!s.teams) addLog(s, c, `${seatName(s, m.h)} finished in place ${s.winners.length + 1}!`);
    else addLog(s, c, `${seatName(s, m.h)} has all four pieces home!`);
    // Moving each other's pieces, a side plays on with both colours' turns until all eight are home.
    if (!sharing || sideHome) for (const o of sharing ? side : [m.h]) if (s.seats[o] && !s.seats[o]!.out && !s.winners.includes(o)) s.winners.push(o);
    if (s.teams && sideHome) {
      // The whole side is home: it wins (its colours come first in the results).
      s.winners = [...s.winners.filter((x) => side.includes(x)), ...s.winners.filter((x) => !side.includes(x))];
      const names = [...new Set(side.filter((x) => s.seats[x]).map((x) => seatName(s, x)))];
      addLog(s, c, `${names.join(" & ")} ${names.length > 1 ? "win" : "wins"}!`);
    }
    if (s.winners.includes(c)) {
      endTurn(s);
      return;
    }
  }
  carryOn(s, c);
}

/** Record c's throw of v (three dice: see dice.ts). Returns false if the throw isn't allowed right now. */
export function applyRoll(s: GameState, c: Color, v: number): boolean {
  if (s.phase !== "playing" || s.turn !== c || s.roll || !validThrow(v, facesOf(varsOf(s)))) return false;
  const t = turnOf(s);
  const dice = throwOf(v);
  s.last = { v, c, seq: (s.last?.seq || 0) + 1 };
  t.moved = 0;
  t.dice = dice;
  t.hand = [...dice];
  delete t.paired;
  addLog(s, c, `${seatName(s, c)} threw ${sayThrow(dice)}.`);
  carryOn(s, c);
  return true;
}

/** Each square round the cross by its place in the ring (0-67, the way the pieces go). */
const RING = new Map<string, number>(ROUTE.blue.slice(P_LAP_FROM, P_LAP_TO).map(([r, cc], k) => [`${r},${cc}`, k]));
/** Could a rival piece at least `size` strong reach the square at h's position p with one throw's worth (up to 12)? */
function threatened(s: GameState, h: Color, p: number, size: number) {
  const sq = squareOf(h, p);
  const at = sq === null ? undefined : RING.get(sq);
  if (at === undefined) return false;
  const mine = teamOf(s, h);
  for (const o of COLORS) {
    if (mine.includes(o) || !s.seats[o]) continue;
    for (const q of new Set(s.tokens[o])) {
      if (s.tokens[o].filter((x) => x === q).length < size) continue;
      const from = q >= P_LAP_FROM && q <= P_LAP_TO ? RING.get(squareOf(o, q) as string) : undefined;
      if (from === undefined) continue;
      const d = (at - from + 68) % 68;
      if (d >= 1 && d <= 12 && q + d <= P_LAP_TO) return true;
    }
  }
  return false;
}

/**
 * Computer players: which piece to move, and with which dice. Home > capture
 * (more for bigger) > out of reach (up its own column, joining up) > progress,
 * keeping clear of rivals just behind.
 */
export function chooseMove(s: GameState, c: Color, _v: number): { i: number; opt: MoveOpt } {
  let best = { i: -1, opt: {} as MoveOpt };
  let bestScore = -Infinity;
  for (const u of uses(s))
    for (const m of legal(s, c, u)) {
      const p = s.tokens[m.h][m.j];
      const size = m.group.length;
      let sc = distOf(u) * 0.5 * size;
      if (m.to === C_FINISH) sc += 100 * size;
      const caught = m.cut.reduce((n, r) => n + r.idx.length, 0);
      if (caught) sc += 70 * caught + (varsOf(s).captureFirst && !sideCaptured(s, c) ? 60 : 0);
      if (p === -1) sc += 40;
      if (m.to > P_LAP_TO && p <= P_LAP_TO && p >= P_LAP_FROM) sc += 30;
      if (m.to !== C_FINISH && s.tokens[m.h].some((q, k) => q === m.to && !m.group.includes(k))) sc += 18;
      if (threatened(s, m.h, m.to, size)) sc -= 30 * size;
      if (p >= P_LAP_FROM && p <= P_LAP_TO && threatened(s, m.h, p, size)) sc += 15 * size;
      sc += Math.random();
      if (sc > bestScore) {
        bestScore = sc;
        best = { i: m.k, opt: { use: u } };
      }
    }
  return best;
}

/**
 * As a game starts. Partners (two or four players, 2 vs 2 picked): the sides
 * sit opposite, and with two players each takes both colours of one side.
 * Everyone's pieces go on their starting squares, and whoever throws highest goes first.
 */
function setup(s: GameState) {
  const v = varsOf(s);
  const people = seated(s).filter((c, k, all) => all.findIndex((o) => s.seats[o]!.id === s.seats[c]!.id) === k);
  const pairs = chauparPairs(v, people.length);
  if (pairs && people.length === 2) {
    const [a, b] = people.map((c) => s.seats[c]!);
    const sideA = C_TEAMS.find((t) => t.includes(people[0]))!;
    const sideB = C_TEAMS.find((t) => t !== sideA)!;
    s.seats = {};
    sideA.forEach((c) => (s.seats[c] = { ...a }));
    sideB.forEach((c) => (s.seats[c] = { ...b }));
  }
  if (pairs) s.teams = C_TEAMS.map((t) => [...t]);
  else delete s.teams;
  s.order = [...C_TURN_ORDER];
  s.skip = {};
  for (const c of COLORS) s.tokens[c] = s.seats[c] ? [...C_START] : [-1, -1, -1, -1];
  const faces = facesOf(v);
  let field = seated(s);
  for (let k = 0; k < 30 && field.length > 1; k++) {
    const thrown = field.map(() => throwOf(throwDice(faces)).reduce((a, b) => a + b, 0));
    const top = Math.max(...thrown);
    field = field.filter((_, j) => thrown[j] === top);
  }
  s.turn = field[0] || seated(s)[0];
  s.roll = null;
  s.sixes = 0;
  s.chaupar = { c: s.turn, hand: [], dice: [], moved: 0, cut: [] };
  addLog(s, s.turn, `Everyone threw the dice: ${seatName(s, s.turn)} threw highest.`);
}

export const chaupar: Rulebook = {
  id: "chaupar",
  finish: C_FINISH,
  counts: [2, 3, 4],
  // (No throw gives another throw.)
  isBonus: () => false,
  roll: (s) => throwDice(facesOf(varsOf(s))),
  validRoll: (v, s) => validThrow(v, facesOf(cleanChauparVariations(s?.variations))),
  applyRoll,
  moveChoices,
  applyMove,
  pass: null,
  chooseMove,
  steps: chauparSteps,
  point: pachisiPoint,
  progress: (s, c) => s.tokens[c].reduce((a, p) => a + (p < 0 ? 0 : p + 1), 0),
  setup,
  stage: (s) => peek(s).moved,
  hand: (s) => peek(s).hand,
  handles,
  melds: true,
};
