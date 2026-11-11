// Chaupar rules. Only Chaupar uses this file: changes to the other games never come here.
// Functions take a state and change it in place; callers work on a copy (see
// GameController.commit).
//
// The rules (as played in Gujarat, where it's called Chopat):
// - Two long dice, each marked 1, 3, 4 and 6. A throw moves two pawns, one by
//   each dice, or one pawn by both added up.
// - Each colour counts the squares from its own arm (board.ts): 1-7 are its
//   Belly, which only its own pawns enter. A pawn is safe there, and nowhere
//   else: there are no safe squares round the cross.
// - The pawns start on squares 6 and 7, and two together (a pair) on 12. The
//   first seat round the table starts (Black, on a real cloth); turns go round
//   counter-clockwise, the way the pawns move.
// - A colour's first throw: 1-1 or 6-6 sends a pawn of the pair on 12 twelve
//   squares on, to 24.
// - Kajalvun: a pawn landing on another of its colour on its square 34 makes a
//   pair there. Until then no two of its pawns may share a square (but the pair
//   it starts with). After it, pairs can be made anywhere, and a doublet throws
//   again: all the throws are made first, then played.
// - A pair moves together only on a doublet, by one dice (4-4: 4 squares), and
//   only a pair can capture a pair. A pair can be split any time by moving one
//   of its pawns, and any pawn can jump over a pair.
// - The pair made at Kajalvun (the Jug) can't be split. It may move together
//   once, on the turn's first doublet (Jugne Uthavavun); then a single pawn of
//   its colour has to pass over it (Ool Olangvun) and not be captured on the next
//   player's turn. Only then is it an ordinary pair. Captured before that, it's
//   lost, and Kajalvun has to be done again. (With no pawn left behind it to
//   pass over it, it's freed.)
// - With two pairs on the board, the first holds true status; the other is a
//   false pair, which a single pawn can capture.
// - Landing on a rival pawn captures it (Tod): it leaves the board, and comes
//   back in at the top of its Belly: put on square 1 and moved by the throw.
//   Until all its captured pawns are back in, a colour moves nothing else. No
//   extra throw for a capture.
// - Moving is compulsory: a dice is only lost when nothing can use it.
// - Home by the exact count. A throw too big for anything else takes a pawn on
//   its way in past Home and back out: still in its Belly it tries again, beyond
//   it, it goes round again.
// - Everyone plays solo unless 2 vs 2 is picked: partners sit opposite. A
//   partner with all four pawns home misses four turns, then plays the
//   partner's pawns; or on its first turn it can do Khado Karvo: a pawn comes
//   back out of Home to capture, without a throw, a pawn of the next player (if
//   they've done Ool Olangvun) on the last stretch of their own arm before
//   their Belly. A side wins with all eight of its pawns home.
import { COLORS } from "../constants";
import { addLog, inPlay, nextTurn, noteStep, seatName, seated, teamOf } from "../table";
import type { ChauparSide, ChauparTurn, Color, GameState, MoveChoice, MoveOpt, Rulebook } from "../types";
import { P_LAP_FROM, P_LAP_TO, pachisiPoint, ROUTE, squareOf } from "../pachisi/board";
import { C_FINISH, C_KAJAL, C_OPEN_TO, C_START, C_START_AT, C_START_PAIR, chauparAdvance, chauparBounce, chauparSteps } from "./board";
import { isDoublet, sayThrow, throwDice, throwOf, validThrow } from "./dice";
import { chauparPairs, cleanChauparVariations } from "./variations";

/** Partners sit opposite each other. */
export const C_TEAMS: Color[][] = [
  ["red", "yellow"],
  ["green", "blue"],
];
/** Turns go round counter-clockwise, the way the pawns move: west, south, east, north. */
export const C_TURN_ORDER: Color[] = ["red", "blue", "yellow", "green"];

/**
 * How a move is played (MoveOpt.use): 1-6 one dice; C_SUM + n both dice of a
 * throw added up (n squares); C_PAIR + n a pair together on a doublet of n;
 * C_KHADO + k Khado Karvo, capturing the k-th pawn (or pair) that can be.
 */
export const C_SUM = 20;
export const C_PAIR = 40;
export const C_KHADO = 90;
/** How far a move goes. */
export const distOf = (u: number) => (u >= C_KHADO ? 0 : u > C_PAIR ? u - C_PAIR : u > C_SUM ? u - C_SUM : u);
/** The squares (on their own arm) where the next player's pawns can be captured by Khado Karvo: its last stretch before the Belly. */
const KHADO_FROM = 67;

const fresh = (c: Color | null, sides: ChauparTurn["sides"]): ChauparTurn => ({ c, hand: [], dice: [], moved: 0, sides });
/** The turn in progress, without changing the state (fresh if what's stored is another colour's). */
function peek(s: GameState): ChauparTurn {
  const t = s.chaupar;
  const sides = t && t.sides && typeof t.sides === "object" ? t.sides : {};
  if (t && t.c === s.turn && Array.isArray(t.hand) && t.hand.every(Array.isArray) && Array.isArray(t.dice)) return { ...t, sides };
  return fresh(s.turn, sides);
}
/** The turn in progress, stored in the state so it can be changed. */
function turnOf(s: GameState): ChauparTurn {
  const t = peek(s);
  s.chaupar = { ...t, hand: t.hand.map((h) => [...h]), dice: t.dice.map((d) => [...d]), sides: JSON.parse(JSON.stringify(t.sides)) };
  return s.chaupar;
}
/** The turn in progress, for the screens. */
export const chauparTurn = (s: GameState) => peek(s);
const sideOf = (s: GameState, h: Color): ChauparSide => peek(s).sides[h] || {};
/** h's side, to change (in the turn stored in the state). */
function sideFor(t: ChauparTurn, h: Color): ChauparSide {
  return (t.sides[h] ||= {});
}

/** The partner c plays for once its own pawns are all home (partners), or null. */
function aided(s: GameState, c: Color): Color | null {
  if (!s.teams || sideOf(s, c).done !== "aid") return null;
  return teamOf(s, c).find((o) => o !== c && !!s.seats[o] && !s.seats[o]!.out) || null;
}
/** The colours whose pawns c moves: its own, and once all its own are home in 2 vs 2 (and it has missed its four turns), its partner's. */
function handles(s: GameState, c: Color): Color[] {
  const p = aided(s, c);
  return p ? [c, p] : [c];
}
/** Does a doublet throw again for c? Once Kajalvun is done (by c, or by the partner it plays for). */
function throwsAgain(s: GameState, c: Color) {
  const p = aided(s, c);
  return !!sideOf(s, c).kajal || (!!p && !!sideOf(s, p).kajal);
}

const onBoard = (p: number) => p >= 0 && p < C_FINISH;
const cellOf = (h: Color, p: number) => ROUTE[h][p].join(",");
const same = (a: number[] | undefined, b: number[]) => !!a && a.length === b.length && a.every((x, k) => x === b[k]);
/** Pawn j of h and the other pawn on its position with it (a pair), lowest first. */
function groupOf(s: GameState, h: Color, j: number): number[] {
  const p = s.tokens[h][j];
  if (!onBoard(p)) return [j];
  return s.tokens[h].map((q, k) => (q === p ? k : -1)).filter((k) => k >= 0);
}
/** Is this h's starting pair, still together on square 12? */
const isStartPair = (s: GameState, h: Color, g: number[]) => !!sideOf(s, h).start && same(g, C_START_PAIR) && s.tokens[h][g[0]] === C_START_AT;
/** h's pairs made during the game (not the one it starts with), each its two pawns. */
function pairsOf(s: GameState, h: Color): number[][] {
  const out: number[][] = [];
  s.tokens[h].forEach((p, j) => {
    const g = groupOf(s, h, j);
    if (g.length === 2 && g[0] === j && onBoard(p) && !isStartPair(s, h, g)) out.push(g);
  });
  return out;
}
/** A false pair: h's second pair while another holds true status (a single pawn can capture it). */
const falsePair = (s: GameState, h: Color, g: number[]) => g.length === 2 && pairsOf(s, h).some((x) => same(x, g)) && !same(sideOf(s, h).truePair, g);

/** What landing at `to` does: the rival pawns it captures, and whether it's Kajalvun. null: it can't land there. */
function landing(s: GameState, h: Color, mover: number[], to: number): { cut: { o: Color; idx: number[] }[]; kajal: boolean } | null {
  if (to === C_FINISH) return { cut: [], kajal: false };
  const side = sideOf(s, h);
  // Its own pawns: two can share a square (a pair), never three, and before Kajalvun only on square 34.
  const cell = cellOf(h, to);
  const own = s.tokens[h].map((_, k) => k).filter((k) => !mover.includes(k) && onBoard(s.tokens[h][k]) && cellOf(h, s.tokens[h][k]) === cell);
  let kajal = false;
  if (own.length) {
    if (mover.length > 1 || own.length > 1 || s.tokens[h][own[0]] !== to) return null;
    if (!side.kajal) {
      if (to !== C_KAJAL) return null;
      kajal = true;
    }
  }
  // Round the cross: rival pawns there are captured; a pair only by a pair (or a false pair, by anyone).
  const sq = squareOf(h, to);
  if (!sq) return { cut: [], kajal };
  const mine = teamOf(s, h);
  const cut: { o: Color; idx: number[] }[] = [];
  for (const o of COLORS) {
    if (o === h) continue;
    const at = new Map<number, number[]>();
    s.tokens[o].forEach((q, k) => {
      if (squareOf(o, q) === sq) at.set(q, [...(at.get(q) || []), k]);
    });
    if (!at.size) continue;
    // (Never onto a partner's pawn.)
    if (mine.includes(o)) return null;
    for (const idx of at.values()) {
      if (idx.length > 1 && mover.length < 2 && !falsePair(s, o, idx)) return null;
      cut.push({ o, idx });
    }
  }
  return { cut, kajal };
}

interface Move {
  /** The pawn's number for c (k * 4 + j: pawn j of the k-th colour c moves). */
  k: number;
  h: Color;
  j: number;
  /** The pawns moving (a pair: two). */
  group: number[];
  from: number;
  to: number;
  use: number;
  /** The rival pawns it captures. */
  cut: { o: Color; idx: number[] }[];
  kajal: boolean;
  /** Past Home and back out (only when nothing else can move). */
  bounce?: boolean;
}

/** The ways to play the throws in hand: each dice, each throw added up, and a doublet's pair move. */
function uses(t: ChauparTurn): number[] {
  const out = new Set<number>();
  for (const h of t.hand) {
    for (const d of h) out.add(d);
    if (h.length === 2) {
      out.add(C_SUM + h[0] + h[1]);
      if (h[0] === h[1]) out.add(C_PAIR + h[0]);
    }
  }
  return [...out];
}
/** Which throw in hand a move played as u takes. The Jug moves only with the turn's first doublet. -1: none. */
function throwFor(t: ChauparTurn, u: number, jug = false): number {
  if (u > C_PAIR) {
    const d = u - C_PAIR;
    if (jug) {
      const k = t.dice.findIndex(isDoublet);
      return k >= 0 && t.dice[k][0] === d && t.hand[k].length === 2 ? k : -1;
    }
    return t.hand.findIndex((h) => h.length === 2 && h[0] === d && h[1] === d);
  }
  if (u > C_SUM) return t.hand.findIndex((h) => h.length === 2 && h[0] + h[1] === u - C_SUM);
  return t.hand.findIndex((h) => h.includes(u));
}

/** Every move c can make with the throws in hand (`bounce`: only those going past Home and back out). */
function movesFor(s: GameState, c: Color, bounce: boolean): Move[] {
  const t = peek(s);
  const codes = uses(t);
  const out: Move[] = [];
  handles(s, c).forEach((h, n) => {
    const side = sideOf(s, h);
    // Captured pawns come back in before anything else moves.
    const waiting = s.tokens[h].includes(-1);
    s.tokens[h].forEach((p, j) => {
      if (p >= C_FINISH || (waiting && p !== -1)) return;
      const group = groupOf(s, h, j);
      // A pair moves (or splits) by its first pawn.
      if (group[0] !== j) return;
      const jug = same(side.jug, group);
      for (const u of codes) {
        const pair = u > C_PAIR;
        if (pair) {
          // Pairs move together on a doublet, once Kajalvun is done; the Jug only once, until it's passed over.
          if (group.length < 2 || !side.kajal || (jug && side.ool !== 0) || throwFor(t, u, jug) < 0) continue;
        } else if (jug) continue; // (the Jug can't be split)
        const mover = pair ? group : [j];
        const d = distOf(u);
        let to = chauparAdvance(p, d);
        if (bounce) {
          if (to !== null || pair) continue;
          to = chauparBounce(p, d);
        }
        if (to === null) continue;
        const land = landing(s, h, mover, to);
        if (land) out.push({ k: n * 4 + j, h, j, group: mover, from: p, to, use: u, cut: land.cut, kajal: land.kajal, bounce });
      }
    });
  });
  return out;
}

/** Khado Karvo: the next player (an opponent) once they've done Ool Olangvun, and their pawns c could capture: on the last stretch of their own arm. */
function khadoTargets(s: GameState, c: Color): { o: Color; idx: number[]; to: number }[] {
  if (!s.teams) return [];
  const order = s.order || COLORS;
  const active = inPlay(s);
  const i = order.indexOf(c);
  let o: Color | null = null;
  for (let k = 1; k < 4 && !o; k++) {
    const x = order[(i + k) % 4];
    if (active.includes(x) && !teamOf(s, c).includes(x)) o = x;
  }
  if (!o || !sideOf(s, o).oolDone) return [];
  const out: { o: Color; idx: number[]; to: number }[] = [];
  const seen = new Set<number>();
  s.tokens[o].forEach((p, j) => {
    if (p < KHADO_FROM || p > P_LAP_TO || seen.has(p)) return;
    seen.add(p);
    const sq = squareOf(o, p);
    const to = ROUTE[c].findIndex((cell, q) => q > P_LAP_FROM && q < P_LAP_TO && cell.join(",") === sq);
    if (to >= 0) out.push({ o, idx: groupOf(s, o, j), to });
  });
  return out;
}
function khadoMoves(s: GameState, c: Color): Move[] {
  const home = s.tokens[c].map((p, k) => (p === C_FINISH ? k : -1)).filter((k) => k >= 0);
  return khadoTargets(s, c)
    .map((x, n) => ({ x, n }))
    .filter(({ x }) => home.length >= x.idx.length)
    .map(({ x, n }) => ({ k: home[0], h: c, j: home[0], group: home.slice(0, x.idx.length), from: C_FINISH, to: x.to, use: C_KHADO + n, cut: [{ o: x.o, idx: x.idx }], kajal: false }));
}

/** Everything c may do now: Khado Karvo when it's offered; otherwise the moves in hand, and only with none of those, going past Home and back out. */
function allMoves(s: GameState, c: Color): Move[] {
  if (peek(s).khado) return khadoMoves(s, c);
  const normal = movesFor(s, c, false);
  return normal.length ? normal : movesFor(s, c, true);
}

export function moveChoices(s: GameState, c: Color, i: number, _v: number): MoveChoice[] {
  return allMoves(s, c)
    .filter((m) => m.k === i)
    .map((m) => ({ to: m.to, use: m.use }));
}

/** After a capture: what it does to the rival's Kajalvun and Ool Olangvun. */
function afterCut(s: GameState, t: ChauparTurn, c: Color, r: { o: Color; idx: number[] }) {
  const side = sideFor(t, r.o);
  const who = seatName(s, r.o);
  if (side.jug && r.idx.some((k) => side.jug!.includes(k))) {
    for (const k of ["jug", "ool", "passer", "watch", "kajal"] as const) delete side[k];
    addLog(s, c, `${who}'s Kajalvun pair was captured: Kajalvun has to be done again.`);
  } else if (side.ool === 2 && side.passer !== undefined && r.idx.includes(side.passer)) {
    side.ool = 1;
    delete side.passer;
    delete side.watch;
    addLog(s, c, `The pawn that passed over ${who}'s pair was captured: Ool Olangvun has to be done again.`);
  }
}

/** After every change: the pair it starts with, the Jug, and which pair holds true status. */
function tidy(s: GameState, t: ChauparTurn) {
  for (const h of seated(s)) {
    const side = t.sides[h];
    if (!side) continue;
    if (side.start && !C_START_PAIR.every((k) => s.tokens[h][k] === C_START_AT)) delete side.start;
    if (side.jug) {
      const at = s.tokens[h][side.jug[0]];
      const free = () => {
        for (const k of ["jug", "ool", "passer", "watch"] as const) delete side[k];
      };
      // Home (or gone): it's over.
      if (at !== s.tokens[h][side.jug[1]] || !onBoard(at)) free();
      else if (side.ool === 1 && !s.tokens[h].some((q, k) => !side.jug!.includes(k) && (q === -1 || (onBoard(q) && q < at)))) {
        free();
        addLog(s, h, `No pawn is left behind ${seatName(s, h)}'s pair to pass over it: it's free.`);
      }
    }
    const pairs = pairsOf(s, h);
    if (side.jug) side.truePair = [...side.jug];
    else if (!pairs.some((g) => same(side.truePair, g))) {
      if (pairs.length) side.truePair = pairs[0];
      else delete side.truePair;
    }
  }
}

/** The turn passes to the next colour (round the table counter-clockwise). */
function endTurn(s: GameState) {
  const t = turnOf(s);
  const sides = t.sides;
  const c = s.turn;
  if (c) watched(s, sides, c);
  nextTurn(s);
  // A pawn of c's passed over its pair this turn: it has to come through the next player's turn.
  if (c && sides[c]?.ool === 2 && !sides[c]!.watch && s.turn) sides[c]!.watch = s.turn;
  s.chaupar = fresh(s.turn, sides);
  // A partner with all four pawns home, on its first turn: Khado Karvo, or miss four turns.
  for (let k = 0; k < 8 && s.phase === "playing" && s.turn; k++) {
    const n: Color = s.turn;
    if (sides[n]?.done !== "wait") return;
    if (khadoMoves(s, n).length) {
      s.chaupar.khado = true;
      s.roll = C_KHADO;
      addLog(s, n, `${seatName(s, n)} can bring a pawn back out to capture (Khado Karvo), or miss four turns.`);
      return;
    }
    missFour(s, sides, n);
    watched(s, sides, n);
    nextTurn(s);
    s.chaupar = fresh(s.turn, sides);
  }
}
/** c's turn is over: anyone's pawn that passed over their pair on the turn before has come through it, and Ool Olangvun is done. */
function watched(s: GameState, sides: ChauparTurn["sides"], c: Color) {
  for (const o of COLORS) {
    const side = sides[o];
    if (!side || side.ool !== 2 || !side.watch || (side.watch !== c && inPlay(s).includes(side.watch))) continue;
    for (const k of ["jug", "ool", "passer", "watch"] as const) delete side[k];
    side.oolDone = true;
    addLog(s, o, `${seatName(s, o)} did Ool Olangvun: the pair is free.`);
  }
}
/** n misses this turn and three more, then plays its partner's pawns. */
function missFour(s: GameState, sides: ChauparTurn["sides"], n: Color) {
  sides[n] = { ...sides[n], done: "aid" };
  s.skip = { ...(s.skip || {}), [n]: 3 };
  const p = teamOf(s, n).find((o) => o !== n);
  addLog(s, n, `${seatName(s, n)} misses this turn and three more, then plays ${p ? `${seatName(s, p)}'s` : "the partner's"} pawns.`);
}

/**
 * After a throw or a move: the next move (made by itself when there's only one
 * thing to do), or the turn passes once nothing can be played. Dice nothing can
 * use wait while others can be played (a move may open the way), and are lost once none can.
 */
function carryOn(s: GameState, c: Color) {
  const t = turnOf(s);
  const moves = allMoves(s, c);
  if (!moves.length) {
    const left = t.hand.flat().length;
    if (left) addLog(s, c, left === t.dice.flat().length ? "No move possible." : left > 1 ? "The other dice can't be used." : "The last dice can't be used.");
    t.hand = [];
    s.roll = null;
    endTurn(s);
    return;
  }
  // (Anything: which move is up to the player.)
  s.roll = 1;
  // Only one thing to do: do it. (Pawns coming back in each count: the player picks which, unless only one is waiting.)
  if (!t.khado && new Set(moves.map((m) => `${m.h}${m.from === -1 ? m.j : m.from}>${m.to}:${m.use}`)).size === 1) applyMove(s, c, moves[0].k, 1, { use: moves[0].use });
}

/** The rival pawns a move captures, where they stand (for the move record). */
const capsOf = (s: GameState, cut: { o: Color; idx: number[] }[]) => cut.flatMap((r) => r.idx.map((k) => ({ c: r.o, i: k, a: s.tokens[r.o][k] })));

const name = (s: GameState, c: Color, h: Color) => (s.seats[h]?.id !== s.seats[c]?.id ? `${seatName(s, h)}'s ` : "");

export function applyMove(s: GameState, c: Color, i: number, _v: number, opt: MoveOpt = {}) {
  const m = allMoves(s, c).find((x) => x.k === i && (opt.use === undefined || x.use === opt.use));
  if (!m) return;
  const t = turnOf(s);
  const who = seatName(s, c);
  const side = sideFor(t, m.h);
  // Khado Karvo: out of Home onto the rival's square, capturing it. That's the turn.
  if (m.use >= C_KHADO) {
    noteStep(s, m.group.map((j) => ({ c, i: j, a: m.from, b: m.to })), capsOf(s, m.cut));
    for (const j of m.group) s.tokens[c][j] = m.to;
    for (const r of m.cut) for (const k of r.idx) s.tokens[r.o][k] = -1;
    delete side.done;
    delete t.khado;
    t.moved++;
    s.roll = null;
    addLog(s, c, `Khado Karvo! ${who} brought ${m.group.length > 1 ? "two pawns" : "a pawn"} back out and captured ${seatName(s, m.cut[0].o)}${m.group.length > 1 ? "'s pair" : ""}.`);
    tidy(s, t);
    endTurn(s);
    return;
  }
  const jug = same(side.jug, m.group) ? [...side.jug!] : null;
  const jugAt = side.jug ? s.tokens[m.h][side.jug[0]] : -2;
  // The dice it takes: one of a throw, or all of it.
  const k = throwFor(t, m.use, !!jug);
  if (k < 0) return;
  if (m.use > C_SUM) t.hand[k] = [];
  else t.hand[k].splice(t.hand[k].indexOf(m.use), 1);
  noteStep(s, m.group.map((j) => ({ c: m.h, i: j, a: m.from, b: m.to })), capsOf(s, m.cut));
  for (const j of m.group) s.tokens[m.h][j] = m.to;
  for (const r of m.cut) for (const q of r.idx) s.tokens[r.o][q] = -1;
  t.moved++;
  s.roll = null;
  const whose = name(s, c, m.h);
  const what = m.group.length > 1 ? `${whose || "a "}pair` : whose ? `${whose}pawn` : "";
  const by = m.use > C_PAIR ? `a doublet of ${distOf(m.use)}s (${distOf(m.use)})` : `${distOf(m.use)}`;
  if (m.from === -1) addLog(s, c, `${who} brought ${whose ? `${whose}pawn` : "a pawn"} back in with ${by}.`);
  else if (m.to === C_FINISH) addLog(s, c, `${who} got ${what || "a pawn"} home!`);
  else if (m.bounce) addLog(s, c, `${who}'s ${what || "pawn"} went past Home with ${by}, and back out.`);
  else addLog(s, c, `${who} moved ${what ? what + " " : ""}${by}.`);
  if (m.cut.length) addLog(s, c, `${who} captured ${m.cut.map((r) => (r.idx.length > 1 ? `${seatName(s, r.o)}'s pair` : seatName(s, r.o))).join(" & ")}!`);
  for (const r of m.cut) afterCut(s, t, c, r);
  if (m.kajal) {
    side.kajal = true;
    side.jug = s.tokens[m.h].map((q, j) => (q === m.to ? j : -1)).filter((j) => j >= 0);
    side.ool = 0;
    addLog(s, c, `Kajalvun! ${seatName(s, m.h)} made a pair on square 34: doublets now throw again.`);
  } else if (jug) {
    // Jugne Uthavavun: now a pawn has to pass over it.
    side.ool = 1;
    addLog(s, c, `${seatName(s, m.h)}'s pair moved together: now one of its pawns has to pass over it (Ool Olangvun).`);
  } else if (m.group.length === 1 && side.jug && side.ool === 1 && !m.bounce && m.from < jugAt && m.to > jugAt) {
    side.ool = 2;
    side.passer = m.j;
    delete side.watch;
    addLog(s, c, `${seatName(s, m.h)}'s pawn passed over the pair. If it isn't captured on the next turn, that's Ool Olangvun.`);
  }
  tidy(s, t);
  if (s.tokens[m.h].every((x) => x === C_FINISH)) {
    if (!s.teams) {
      if (!s.winners.includes(m.h)) s.winners.push(m.h);
      addLog(s, c, `${seatName(s, m.h)} finished in place ${s.winners.length}!`);
      if (m.h === c) {
        endTurn(s);
        return;
      }
    } else {
      const team = teamOf(s, m.h).filter((o) => s.seats[o] && !s.seats[o]!.out);
      if (team.every((o) => s.tokens[o].every((x) => x === C_FINISH))) {
        // The whole side is home: it wins (its colours come first in the results).
        for (const o of team) if (!s.winners.includes(o)) s.winners.push(o);
        s.winners = [...s.winners.filter((x) => team.includes(x)), ...s.winners.filter((x) => !team.includes(x))];
        const names = [...new Set(team.map((x) => seatName(s, x)))];
        addLog(s, c, `${names.join(" & ")} ${names.length > 1 ? "win" : "wins"}!`);
        endTurn(s);
        return;
      }
      side.done = "wait";
      addLog(s, c, `${seatName(s, m.h)} has all four pawns home!`);
    }
  }
  carryOn(s, c);
}

/** Khado Karvo offered: c lets it go, and misses four turns instead. */
export function passMove(s: GameState, c: Color) {
  if (s.phase !== "playing" || s.turn !== c || !peek(s).khado) return false;
  const t = turnOf(s);
  delete t.khado;
  t.moved++;
  missFour(s, t.sides, c);
  s.roll = null;
  endTurn(s);
  return true;
}

/** Record c's throw of v (two dice: see dice.ts). Returns false if the throw isn't allowed right now. */
export function applyRoll(s: GameState, c: Color, v: number): boolean {
  if (s.phase !== "playing" || s.turn !== c || s.roll || !validThrow(v) || peek(s).khado) return false;
  const t = turnOf(s);
  const dice = throwOf(v);
  const who = seatName(s, c);
  s.last = { v, c, seq: (s.last?.seq || 0) + 1 };
  t.moved = 0;
  t.dice.push(dice);
  t.hand.push([...dice]);
  addLog(s, c, `${who} threw ${sayThrow(dice)}.`);
  const side = sideFor(t, c);
  if (!side.opened) {
    side.opened = true;
    // The opening throw: 1-1 or 6-6 sends a pawn of the pair on 12 to 24.
    const land = isDoublet(dice) && (dice[0] === 1 || dice[0] === 6) && side.start ? landing(s, c, [C_START_PAIR[0]], C_OPEN_TO) : null;
    if (land) {
      noteStep(s, [{ c, i: C_START_PAIR[0], a: C_START_AT, b: C_OPEN_TO }], capsOf(s, land.cut));
      s.tokens[c][C_START_PAIR[0]] = C_OPEN_TO;
      for (const r of land.cut) for (const q of r.idx) s.tokens[r.o][q] = -1;
      t.hand[t.hand.length - 1] = [];
      t.moved++;
      addLog(s, c, `An opening ${dice[0]}-${dice[1]}: a pawn of ${who}'s pair on 12 jumps to 24.`);
      for (const r of land.cut) afterCut(s, t, c, r);
      tidy(s, t);
    }
  }
  // After Kajalvun a doublet throws again: all the throws first, then the moves.
  if (isDoublet(dice) && throwsAgain(s, c)) {
    addLog(s, c, `${who} throws again.`);
    s.roll = null;
    return true;
  }
  carryOn(s, c);
  return true;
}

/** Each square round the cross by its place in the ring (0-67, the way the pawns go). */
const RING = new Map<string, number>(ROUTE.blue.slice(P_LAP_FROM, P_LAP_TO).map((cell, k) => [cell.join(","), k]));
/**
 * The chance one throw takes a rival exactly d squares (index d): as one dice
 * or both added up, out of the 16 ways two dice can fall. A pair: by one dice
 * of a doublet.
 */
const REACH = [0, 7, 1, 7, 9, 2, 8, 4, 1, 2, 2, 0, 1].map((n) => n / 16);
const PAIR_REACH = [0, 1, 0, 1, 1, 0, 1].map((n) => n / 16);
/** How likely h's pawn at position p is to be captured on a rival's next throw, if it stood there now (`pair`: a pair with true status, which only a pair can capture). */
function danger(s: GameState, h: Color, p: number, pair: boolean) {
  const sq = squareOf(h, p);
  const at = sq === null ? undefined : RING.get(sq);
  if (at === undefined) return 0;
  const mine = teamOf(s, h);
  let safe = 1;
  for (const o of COLORS) {
    if (mine.includes(o) || !s.seats[o] || s.seats[o]!.out) continue;
    for (const q of new Set(s.tokens[o])) {
      const n = s.tokens[o].filter((x) => x === q).length;
      if (pair && n < 2) continue;
      const from = q >= P_LAP_FROM && q <= P_LAP_TO ? RING.get(squareOf(o, q) as string) : undefined;
      if (from === undefined) continue;
      const d = (at - from + 68) % 68;
      const chance = (pair ? PAIR_REACH : REACH)[d] || 0;
      if (chance && q + d <= P_LAP_TO) safe *= 1 - chance;
    }
  }
  return 1 - safe;
}
/** What a pawn at p is worth: how far it has come (a captured one starts again). */
const worth = (p: number) => (p < 0 ? 0 : p >= C_FINISH ? 0 : 12 + p);

/**
 * Computer players: which pawn to move, and how. Weighs what each move gains
 * (squares, a pawn home, rivals captured, Kajalvun, passing over the pair)
 * against the risk of being captured where it lands, and rewards getting a
 * pawn out of danger (into its Belly, into a pair, away from rivals behind).
 * Never past Home unless it has to.
 */
export function chooseMove(s: GameState, c: Color, _v: number): { i: number; opt: MoveOpt } {
  let best = { i: -1, opt: {} as MoveOpt };
  let bestScore = -Infinity;
  for (const m of allMoves(s, c)) {
    const side = sideOf(s, m.h);
    const size = m.group.length;
    let sc = distOf(m.use) * size;
    if (m.use >= C_KHADO) sc += 500;
    if (m.to === C_FINISH) sc += 40 * size;
    // (Capturing is weighed at half what a rival pawn has come: chasing captures made long games, and won no more of them.)
    for (const r of m.cut) for (const q of r.idx) sc += (10 + worth(s.tokens[r.o][q])) / 2;
    if (m.kajal) sc += 60;
    else if (m.to === C_KAJAL && size === 1 && !side.kajal) sc += 6;
    if (side.jug && side.ool === 1 && size === 1 && m.from < s.tokens[m.h][side.jug[0]] && m.to > s.tokens[m.h][side.jug[0]]) sc += 40;
    if (m.bounce) sc -= 30;
    // The risk where it lands, and the risk it leaves behind (both counted twice over: what it could lose).
    // Joining another pawn makes a pair, which only a pair can capture (unless it's a second pair, a false
    // one); splitting a pair leaves a single behind.
    const joined = m.to !== C_FINISH && s.tokens[m.h].some((q, k) => q === m.to && !m.group.includes(k));
    const there = joined ? 2 : size;
    const truePair = there > 1 && (joined ? m.kajal || !pairsOf(s, m.h).length : !falsePair(s, m.h, m.group));
    if (m.use < C_KHADO && m.to !== C_FINISH) sc -= 2 * danger(s, m.h, m.to, truePair) * worth(m.to) * there;
    if (m.from >= P_LAP_FROM && m.from <= P_LAP_TO) {
      const was = groupOf(s, m.h, m.j);
      sc += 2 * danger(s, m.h, m.from, was.length > 1 && !falsePair(s, m.h, was)) * worth(m.from) * size;
      // (Splitting a pair: the pawn left behind is a single now.)
      if (was.length > size) sc -= 2 * (danger(s, m.h, m.from, false) - danger(s, m.h, m.from, !falsePair(s, m.h, was))) * worth(m.from);
    }
    sc += Math.random();
    if (sc > bestScore) {
      bestScore = sc;
      best = { i: m.k, opt: { use: m.use } };
    }
  }
  return best;
}

/**
 * As a game starts. Partners (two or four players, 2 vs 2 picked): the sides
 * sit opposite, and with two players each takes both colours of one side.
 * Everyone's pawns go on their starting squares, and the first seat round the table starts.
 */
function setup(s: GameState) {
  const v = cleanChauparVariations(s.variations);
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
  const sides: ChauparTurn["sides"] = {};
  for (const c of COLORS) {
    s.tokens[c] = s.seats[c] ? [...C_START] : [-1, -1, -1, -1];
    if (s.seats[c]) sides[c] = { start: true };
  }
  s.turn = C_TURN_ORDER.find((c) => s.seats[c]) || seated(s)[0];
  s.roll = null;
  s.sixes = 0;
  s.chaupar = fresh(s.turn, sides);
}

export const chaupar: Rulebook = {
  id: "chaupar",
  finish: C_FINISH,
  counts: [2, 3, 4],
  isBonus: (v, s) => !!s?.turn && isDoublet(throwOf(v)) && throwsAgain(s, s.turn),
  roll: () => throwDice(),
  validRoll: (v) => validThrow(v),
  applyRoll,
  moveChoices,
  applyMove,
  pass: passMove,
  chooseMove,
  steps: chauparSteps,
  point: pachisiPoint,
  progress: (s, c) => s.tokens[c].reduce((a, p) => a + (p < 0 ? 0 : p + 1), 0),
  setup,
  stage: (s) => peek(s).moved,
  hand: (s) => peek(s).hand.flat(),
  handles,
  melds: true,
};
