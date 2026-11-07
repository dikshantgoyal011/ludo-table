// Pachisi rules. Only Pachisi uses this file: changes to Ludo never come here.
// Functions take a state and change it in place; callers work on a copy (see
// GameController.commit).
//
// The traditional rules (mastersofgames.com, "The rules of Pachisi"):
// - Traditionally four play as partners, partners opposite: red with yellow,
//   green with blue (2 vs 2). With two players, each plays both colours of one
//   side. A side wins when all eight of its pieces are home. Turns go round
//   anti-clockwise. Here everyone plays solo unless 2 vs 2 is picked (always
//   solo with three).
// - Throw the cowries and move one piece by the throw. A grace (6, 10 or 25)
//   may bring a piece out of the Charkoni instead, and gives another throw.
// - The first piece of each colour can come out with any throw; after that,
//   coming out (also after being cut) takes a grace. Coming out, a piece counts
//   the first square of its arm as 1.
// - Landing on the other side's pieces off a castle sends them all back to the
//   Charkoni, and gives another throw. No landing on a castle the other side holds.
// - Moving is never compulsory (Skip). At the end of its round a piece may go
//   round again instead of home. Home only by the exact throw.
// Variations change some of this (variations.ts).
import { COLORS } from "../constants";
import { addLog, nextTurn, seatName, seated, teamOf } from "../table";
import type { Color, GameState, MoveChoice, MoveOpt, PachisiTurn, Rulebook } from "../types";
import {
  CASTLES,
  lapIndex,
  P_EXTRA,
  P_FINISH,
  P_LAP_TO,
  pachisiAdvance,
  pachisiPoint,
  pachisiSteps,
  passesRoundEnd,
  isCastle,
  squareOf,
} from "./board";
import { cowrieWeights, recordThrow, throwCowries } from "./cowries";
import { GRACE_STEP, homeThrow, isGrace, shellsOf, throwsAgain } from "./throws";
import { cleanVariations, playsInPairs, type PachisiVariations } from "./variations";

/** Partners sit opposite each other. */
export const TEAMS: Color[][] = [
  ["red", "yellow"],
  ["green", "blue"],
];
/** Turns go round anti-clockwise, the way the pieces move: west, south, east, north. */
export const TURN_ORDER: Color[] = ["red", "blue", "yellow", "green"];

const varsOf = (s: GameState) => cleanVariations(s.variations);

/** The turn in progress, without changing the state (fresh if what's stored is another colour's). */
function peek(s: GameState): PachisiTurn {
  const t = s.pachisi;
  const entered = t && Array.isArray(t.entered) ? t.entered : [];
  if (t && t.c === s.turn && Array.isArray(t.hand)) return { ...t, entered };
  return { c: s.turn, hand: [], again: false, moved: 0, entered };
}
/** The turn in progress, stored in the state so it can be changed. */
function turnOf(s: GameState): PachisiTurn {
  const t = peek(s);
  s.pachisi = { ...t, hand: [...t.hand], entered: [...t.entered] };
  return s.pachisi;
}

/** The colours on the other side with a piece on square `sq`. */
function enemiesAt(s: GameState, c: Color, sq: string): Color[] {
  const mine = teamOf(s, c);
  return COLORS.filter((o) => !mine.includes(o) && s.tokens[o].some((op) => squareOf(o, op) === sq));
}
/** Blockades: two or more pieces of one side of the other on square `sq`. */
function blockedFor(s: GameState, c: Color, sq: string) {
  const mine = teamOf(s, c);
  const sides = (s.teams || COLORS.map((o) => [o])).filter((t) => !t.some((o) => mine.includes(o)));
  return sides.some((t) => t.reduce((n, o) => n + s.tokens[o].filter((op) => squareOf(o, op) === sq).length, 0) >= 2);
}

/** Can a piece `d` squares from home still get there, with the throws these rules have? */
function canStillFinish(v: PachisiVariations, d: number): boolean {
  const steps = [...shellsOf(v).move, ...(v.graceApart ? [GRACE_STEP] : [])];
  const finishes = (x: number) => !v.graceHome || homeThrow(v, x) || x === GRACE_STEP;
  // (Finishing with a big throw: any big enough one takes it home.)
  return steps.some((x) => (x === d ? finishes(x) : (v.graceHome && homeThrow(v, x) && x > d) || (x < d && canStillFinish(v, d - x))));
}

/** May c's piece go from p to `to` with the throw u? */
function allowed(s: GameState, v: PachisiVariations, c: Color, p: number, to: number, u: number) {
  // No landing on a castle the other side holds.
  const sq = squareOf(c, to);
  if (sq && CASTLES.has(sq) && enemiesAt(s, c, sq).length) return false;
  if (to === P_FINISH && v.graceHome && !homeThrow(v, u) && u !== GRACE_STEP) return false;
  // Never stop up the middle where no throw could ever take it home (it would be stuck for good).
  if (to > P_LAP_TO && to < P_FINISH && !canStillFinish(v, P_FINISH - to)) return false;
  if (v.blockades)
    for (const q of pachisiSteps(p, to).slice(0, -1)) {
      const qs = squareOf(c, q);
      if (qs && blockedFor(s, c, qs)) return false;
    }
  return true;
}

/**
 * Every way piece i of c can move: with each throw still in hand (or with v,
 * when nothing is in hand), home or round again.
 */
export function moveChoices(s: GameState, c: Color, i: number, v: number): MoveChoice[] {
  const vars = varsOf(s);
  const t = peek(s);
  const hand = t.hand.length ? t.hand : [v];
  const p = s.tokens[c][i];
  const out: MoveChoice[] = [];
  for (const u of new Set(hand)) {
    if (!(u > 0)) continue;
    if (p === -1) {
      // The first piece out can go with any throw; after that it takes a grace (or the grace itself, played separately).
      const first = !t.entered.includes(c);
      if (!first && !(vars.graceApart ? u === GRACE_STEP : isGrace(vars, u))) continue;
    }
    for (const extra of passesRoundEnd(p, u) ? [false, true] : [false]) {
      let to = pachisiAdvance(p, u, extra);
      // Finishing with a big throw (a variation): it takes a piece on its way home all the way in, no exact count needed.
      const homeward = (p > P_LAP_TO && p < P_FINISH) || passesRoundEnd(p, u);
      if (to === null && !extra && vars.graceHome && homeThrow(vars, u) && homeward) to = P_FINISH;
      if (to === null || !allowed(s, vars, c, p, to, u)) continue;
      out.push({ to, extra, use: u });
    }
  }
  return out;
}
export const movable = (s: GameState, c: Color, v: number) => s.tokens[c].map((_, i) => (moveChoices(s, c, i, v).length ? i : -1)).filter((i) => i >= 0);
/** Can any of the throws in hand be used? */
const usable = (s: GameState, c: Color) => peek(s).hand.length > 0 && movable(s, c, 0).length > 0;

/** The other side's colours that a piece of c landing on np would cut (never on a castle). */
function cutsAt(s: GameState, c: Color, np: number): Color[] {
  const sq = squareOf(c, np);
  if (!sq || CASTLES.has(sq)) return [];
  return enemiesAt(s, c, sq);
}
export const wouldCapture = (s: GameState, c: Color, np: number) => cutsAt(s, c, np).length > 0;

/** The turn passes to the next colour (round the table anti-clockwise). */
function endTurn(s: GameState) {
  const entered = peek(s).entered;
  nextTurn(s);
  s.pachisi = { c: s.turn, hand: [], again: false, moved: 0, entered: [...entered] };
}

/** After a move or a skip: carry on with the throws in hand, throw again if one is owed, or the turn passes. */
function carryOn(s: GameState, c: Color) {
  const t = turnOf(s);
  if (usable(s, c)) {
    s.roll = t.hand[0];
    return;
  }
  if (t.hand.length) addLog(s, c, t.hand.length > 1 ? "The other throws can't be used." : "The other throw can't be used.");
  t.hand = [];
  s.roll = null;
  if (t.again) {
    t.again = false;
    addLog(s, c, `${seatName(s, c)} throws again.`);
    return;
  }
  endTurn(s);
}

export function applyMove(s: GameState, c: Color, i: number, v: number, opt: MoveOpt = {}) {
  const choices = moveChoices(s, c, i, v);
  const fits = (o: MoveChoice) => opt.use === undefined || o.use === opt.use;
  const pick = choices.find((o) => fits(o) && !!o.extra === !!opt.extra) || choices.find((o) => fits(o) && !o.extra) || choices.find(fits);
  if (!pick) return;
  const t = turnOf(s);
  const p = s.tokens[c][i];
  const np = pick.to;
  const cut = cutsAt(s, c, np);
  const sq = squareOf(c, np);
  for (const o of cut) s.tokens[o] = s.tokens[o].map((op) => (squareOf(o, op) === sq ? -1 : op));
  s.tokens[c][i] = np;
  const k = t.hand.indexOf(pick.use as number);
  if (k >= 0) t.hand.splice(k, 1);
  t.moved++;
  if (p === -1 && !t.entered.includes(c)) t.entered.push(c);
  s.roll = null;
  const who = seatName(s, c);
  const by = pick.use === GRACE_STEP ? "the grace" : `${pick.use}`;
  if (p === -1) addLog(s, c, `${who} brought a piece out with ${by}.`);
  else if (np === P_FINISH) addLog(s, c, `${who} got a piece home!`);
  else addLog(s, c, `${who} moved ${by}${pick.extra ? ", going round again" : ""}.`);
  if (cut.length) addLog(s, c, `${who} cut ${cut.map((o) => seatName(s, o)).join(" & ")}!`);
  if (s.tokens[c].every((x) => x === P_FINISH)) {
    s.winners.push(c);
    const side = teamOf(s, c);
    // Everyone for themselves: places, as the others play on.
    if (!s.teams) addLog(s, c, `${who} finished in place ${s.winners.length}!`);
    else addLog(s, c, `${who} has all four pieces home!`);
    if (s.teams && side.every((x) => s.winners.includes(x) || s.seats[x]?.out)) {
      // The whole side is home: it wins (its colours come first in the results).
      s.winners = [...s.winners.filter((x) => side.includes(x)), ...s.winners.filter((x) => !side.includes(x))];
      const names = [...new Set(side.map((x) => seatName(s, x)))];
      addLog(s, c, `${names.join(" & ")} ${names.length > 1 ? "win" : "wins"}!`);
    }
    endTurn(s);
    return;
  }
  // A cut gives another throw straight away (any throws left in hand wait).
  if (cut.length) {
    addLog(s, c, `${who} throws again.`);
    return;
  }
  carryOn(s, c);
}

/** c chooses not to move with the throws in hand. A throw still owed (a grace) comes next. */
export function passMove(s: GameState, c: Color) {
  if (s.phase !== "playing" || s.turn !== c || !s.roll) return false;
  const t = turnOf(s);
  t.hand = [];
  t.moved++;
  addLog(s, c, `${seatName(s, c)} didn't move.`);
  carryOn(s, c);
  return true;
}

/**
 * Record a throw of v for colour c. Never moves by itself: it's always the
 * player's choice (they may also skip). Returns false if the throw isn't allowed right now.
 */
export function applyRoll(s: GameState, c: Color, v: number): boolean {
  if (s.phase !== "playing" || s.turn !== c || s.roll) return false;
  const vars = varsOf(s);
  if (!shellsOf(vars).move.includes(v)) return false;
  const t = turnOf(s);
  recordThrow(s, c, v);
  s.last = { v, c, seq: (s.last?.seq || 0) + 1 };
  t.moved = 0;
  const who = seatName(s, c);
  addLog(s, c, `${who} threw ${v}.`);
  const grace = isGrace(vars, v);
  // s.sixes counts the graces in a row this turn.
  const run = grace ? (s.sixes || 0) + 1 : 0;
  if (vars.threeGraces && run >= 3) {
    addLog(s, c, `Third grace in a row: it doesn't count, and ${who} misses their next turn.`);
    s.skip = { ...(s.skip || {}), [c]: (s.skip?.[c] || 0) + 1 };
    s.sixes = 0;
    t.again = false;
    carryOn(s, c);
    return true;
  }
  s.sixes = run;
  t.hand.push(v);
  if (grace && vars.graceApart) t.hand.push(GRACE_STEP);
  if (throwsAgain(vars, v)) {
    // Throwing first: keep throwing until a throw that isn't a grace, then move.
    if (vars.throwFirst) {
      addLog(s, c, `${who} throws again.`);
      return true;
    }
    t.again = true;
  }
  if (!usable(s, c)) addLog(s, c, "No move possible.");
  carryOn(s, c);
  return true;
}

/**
 * Computer players: which piece to move, with which throw, and how. Finish >
 * cut > bring out > head home > reach a castle > advance furthest. Pieces
 * always head home rather than go round again.
 */
export function chooseMove(s: GameState, c: Color, v: number): { i: number; opt: MoveOpt } {
  let best = { i: -1, opt: {} as MoveOpt };
  let bestScore = -Infinity;
  // The best move that isn't going round again.
  let plain = { i: -1, opt: {} as MoveOpt };
  let plainScore = -Infinity;
  s.tokens[c].forEach((p, i) => {
    for (const ch of moveChoices(s, c, i, v)) {
      const np = ch.to;
      // Progress: a piece on another round counts only where it is on the lap.
      const ahead = np >= P_EXTRA ? (lapIndex(np) as number) : np;
      let sc = ahead * 0.5;
      if (ch.extra) sc -= 40;
      if (np === P_FINISH) sc += 100;
      if (cutsAt(s, c, np).length) sc += 80;
      if (p === -1) sc += 60;
      if (np > P_LAP_TO && np <= P_FINISH && p <= P_LAP_TO) sc += 30;
      if (isCastle(c, np)) sc += 15;
      sc += Math.random();
      if (sc > bestScore) {
        bestScore = sc;
        best = { i, opt: { use: ch.use, extra: ch.extra } };
      }
      if (!ch.extra && sc > plainScore) {
        plainScore = sc;
        plain = { i, opt: { use: ch.use, extra: false } };
      }
    }
  });
  // Never round again: make the best other move, or with none, let the throw go
  // (moving isn't compulsory), so the piece waits near home for the exact throw,
  // as a player would. (Standing in for an offline player, the computer sent their piece round again.)
  if (best.opt.extra) return plain;
  return best;
}

/**
 * As a game starts. Partners (the traditional game, for two or four players):
 * the sides sit opposite, and with two players each takes both colours of one
 * side. Otherwise (and always with three) everyone plays their own colour.
 * Everyone throws the cowries and the highest throw goes first.
 */
function setup(s: GameState) {
  const people = seated(s).filter((c, k, all) => all.findIndex((o) => s.seats[o]!.id === s.seats[c]!.id) === k);
  const pairs = playsInPairs(varsOf(s), people.length);
  if (pairs && people.length === 2) {
    const [a, b] = people.map((c) => s.seats[c]!);
    const sideA = TEAMS.find((t) => t.includes(people[0]))!;
    const sideB = TEAMS.find((t) => t !== sideA)!;
    s.seats = {};
    sideA.forEach((c) => (s.seats[c] = { ...a }));
    sideB.forEach((c) => (s.seats[c] = { ...b }));
  }
  if (pairs) s.teams = TEAMS.map((t) => [...t]);
  else delete s.teams;
  s.order = [...TURN_ORDER];
  s.skip = {};
  const set = shellsOf(varsOf(s));
  let field = seated(s);
  for (let k = 0; k < 30 && field.length > 1; k++) {
    const thrown = field.map(() => throwCowries(undefined, set));
    const top = Math.max(...thrown);
    field = field.filter((_, j) => thrown[j] === top);
  }
  s.turn = field[0] || seated(s)[0];
  s.roll = null;
  s.sixes = 0;
  s.pachisi = { c: s.turn, hand: [], again: false, moved: 0, entered: [] };
  addLog(s, s.turn, `Everyone threw the cowries: ${seatName(s, s.turn)} threw highest.`);
}

/** How far a piece has got: 0 waiting in the centre, up to 84 home (a piece on another round counts where it is on the lap). */
const pieceProgress = (p: number) => (p < 0 ? 0 : p >= P_EXTRA ? (lapIndex(p) as number) + 1 : p + 1);

export const pachisi: Rulebook = {
  id: "pachisi",
  finish: P_FINISH,
  // Two, three or four (as partners, two or four).
  counts: [2, 3, 4],
  isBonus: (v, s) => throwsAgain(cleanVariations(s?.variations), v),
  roll: (s, c) => throwCowries(cowrieWeights(s, c), shellsOf(varsOf(s))),
  validRoll: (v, s) => shellsOf(cleanVariations(s?.variations)).move.includes(v),
  applyRoll,
  moveChoices,
  applyMove,
  pass: passMove,
  chooseMove,
  steps: pachisiSteps,
  point: pachisiPoint,
  progress: (s, c) => s.tokens[c].reduce((a, p) => a + pieceProgress(p), 0),
  setup,
  stage: (s) => peek(s).moved,
  hand: (s) => peek(s).hand,
};
