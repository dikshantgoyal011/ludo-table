// Pachisi rules. Only Pachisi uses this file: changes to Ludo never come here.
// Functions take a state and change it in place; callers work on a copy (see
// GameController.commit).
//
// Like Ludo: come out on a grace throw (6, 10, 25), go round, home by an exact
// throw, cut rivals off the castles, another throw on a grace throw / cut / home.
// Pachisi adds choices: a player may skip a throw, two of their pieces on a
// square may move together (and only a pair can cut a pair), and at the end of
// its round a piece may go home or round again.
import { COLORS } from "../constants";
import { addLog, nextTurn, seatName } from "../table";
import type { Color, GameState, MoveChoice, MoveOpt, Rulebook } from "../types";
import {
  CASTLES,
  COWRIE_MOVE,
  isCastle,
  isGrace,
  lapIndex,
  P_EXTRA,
  P_FINISH,
  P_LAP_TO,
  pachisiAdvance,
  pachisiPoint,
  pachisiSteps,
  passesRoundEnd,
  squareOf,
} from "./board";
import { cowrieWeights, recordThrow, throwCowries } from "./cowries";

/** Another of c's pieces on the same square as piece i (the two can move together), or -1. */
export function pairOf(s: GameState, c: Color, i: number) {
  const p = s.tokens[c][i];
  if (p === -1 || p === P_FINISH) return -1;
  return s.tokens[c].findIndex((q, j) => j !== i && q === p);
}

/** How many pieces of each other colour stand on square `sq`. */
function rivalsAt(s: GameState, c: Color, sq: string) {
  const out: Partial<Record<Color, number>> = {};
  for (const o of COLORS) {
    if (o === c) continue;
    const n = s.tokens[o].filter((op) => squareOf(o, op) === sq).length;
    if (n) out[o] = n;
  }
  return out;
}

/** Every way piece i of c can move with a throw of v. */
export function moveChoices(s: GameState, c: Color, i: number, v: number): MoveChoice[] {
  const p = s.tokens[c][i];
  const out: MoveChoice[] = [];
  const pairs = pairOf(s, c, i) >= 0 ? [false, true] : [false];
  for (const extra of passesRoundEnd(p, v) ? [false, true] : [false]) {
    const to = pachisiAdvance(p, v, extra);
    if (to === null) continue;
    // No landing on a castle a rival holds.
    const sq = squareOf(c, to);
    if (sq && CASTLES.has(sq) && Object.keys(rivalsAt(s, c, sq)).length) continue;
    for (const pair of pairs) out.push({ to, extra, pair });
  }
  return out;
}
const canMoveToken = (s: GameState, c: Color, i: number, v: number) => moveChoices(s, c, i, v).length > 0;
export const movable = (s: GameState, c: Color, v: number) => s.tokens[c].map((_, i) => (canMoveToken(s, c, i, v) ? i : -1)).filter((i) => i >= 0);

/** The rivals `movers` pieces of c landing on np would cut. A single piece can't cut a pair (only a pair can). */
function cutsAt(s: GameState, c: Color, np: number, movers: number): Color[] {
  const sq = squareOf(c, np);
  if (!sq || isCastle(c, np)) return [];
  const rivals = rivalsAt(s, c, sq);
  return (Object.keys(rivals) as Color[]).filter((o) => (rivals[o] as number) <= movers);
}
export const wouldCapture = (s: GameState, c: Color, np: number, movers = 1) => cutsAt(s, c, np, movers).length > 0;

export function applyMove(s: GameState, c: Color, i: number, v: number, opt: MoveOpt = {}) {
  const p = s.tokens[c][i];
  const choices = moveChoices(s, c, i, v);
  const pick = choices.find((o) => !!o.extra === !!opt.extra && !!o.pair === !!opt.pair) || choices.find((o) => !o.extra && !o.pair) || choices[0];
  if (!pick) return;
  const np = pick.to;
  const movers = pick.pair ? [i, pairOf(s, c, i)] : [i];
  const cut = cutsAt(s, c, np, movers.length);
  const sq = squareOf(c, np);
  for (const o of cut) s.tokens[o] = s.tokens[o].map((op) => (squareOf(o, op) === sq ? -1 : op));
  for (const k of movers) s.tokens[c][k] = np;
  s.roll = null;
  const who = seatName(s, c);
  if (p === -1) addLog(s, c, `${who} brought a piece out.`);
  else if (np === P_FINISH) addLog(s, c, `${who} got ${pick.pair ? "two pieces" : "a piece"} home!`);
  else addLog(s, c, `${who} moved ${pick.pair ? "two pieces" : ""} ${v}${pick.extra ? ", going round again" : ""}.`.replace("  ", " "));
  if (cut.length) addLog(s, c, `${who} cut ${cut.map((o) => seatName(s, o)).join(" & ")}!`);
  if (s.tokens[c].every((t) => t === P_FINISH)) {
    s.winners.push(c);
    addLog(s, c, `${who} finished in place ${s.winners.length}!`);
    nextTurn(s);
    return;
  }
  if (isGrace(v) || cut.length || np === P_FINISH) addLog(s, c, `${who} plays again.`);
  else nextTurn(s);
}

/** c chooses not to move with this throw. A grace throw still earns the next throw. */
export function passMove(s: GameState, c: Color) {
  if (s.phase !== "playing" || s.turn !== c || !s.roll) return false;
  const v = s.roll;
  s.roll = null;
  addLog(s, c, `${seatName(s, c)} didn't move.`);
  if (isGrace(v)) addLog(s, c, `${seatName(s, c)} throws again.`);
  else nextTurn(s);
  return true;
}

/**
 * Record a throw of v for colour c. Never moves by itself: it's always the
 * player's choice (they may also skip). Returns false if the throw isn't allowed right now.
 */
export function applyRoll(s: GameState, c: Color, v: number): boolean {
  if (s.phase !== "playing" || s.turn !== c || s.roll) return false;
  recordThrow(s, c, v);
  const seq = (s.last?.seq || 0) + 1;
  const prev = s.last;
  s.last = { v, c, seq };
  addLog(s, c, `${seatName(s, c)} threw ${v}.`);
  // The same grace throw three times in a row (6, 6, 6 / 10, 10, 10 / 25, 25, 25) is burned and the turn passes.
  // A mixed run (10, 6, 25) is fine. s.sixes counts the run of the same grace throw.
  const run = isGrace(v) && prev?.c === c && prev.v === v ? (s.sixes || 0) + 1 : isGrace(v) ? 1 : 0;
  if (run >= 3) {
    addLog(s, c, `Third ${v} in a row: it's burned. Turn passes.`);
    nextTurn(s);
    return true;
  }
  s.sixes = run;
  if (!movable(s, c, v).length) {
    addLog(s, c, "No move possible.");
    nextTurn(s);
    return true;
  }
  s.roll = v;
  return true;
}

/**
 * Computer players: which piece to move with v, and how. Finish > cut > bring
 * out > head home > reach a castle > advance furthest. A pair moves together
 * when that cuts, and pieces always head home rather than go round again.
 */
export function chooseMove(s: GameState, c: Color, v: number): { i: number; opt: MoveOpt } {
  let best = { i: -1, opt: {} as MoveOpt };
  let bestScore = -Infinity;
  s.tokens[c].forEach((p, i) => {
    for (const ch of moveChoices(s, c, i, v)) {
      const np = ch.to;
      const movers = ch.pair ? 2 : 1;
      // Progress: a piece on another round counts only where it is on the lap.
      const ahead = np >= P_EXTRA ? (lapIndex(np) as number) : np;
      let sc = ahead * 0.5;
      if (ch.extra) sc -= 40;
      if (np === P_FINISH) sc += 100;
      const cut = cutsAt(s, c, np, movers);
      if (cut.length) sc += 80 + (ch.pair ? 20 : 0);
      if (p === -1) sc += 60;
      if (np > P_LAP_TO && np <= P_FINISH && p <= P_LAP_TO) sc += 30;
      if (isCastle(c, np)) sc += 15;
      if (ch.pair && !cut.length) sc -= 5;
      sc += Math.random();
      if (sc > bestScore) {
        bestScore = sc;
        best = { i, opt: { pair: ch.pair, extra: ch.extra } };
      }
    }
  });
  return best;
}

/** How far a piece has got: 0 waiting in the centre, up to 84 home (a piece on another round counts where it is on the lap). */
const pieceProgress = (p: number) => (p < 0 ? 0 : p >= P_EXTRA ? (lapIndex(p) as number) + 1 : p + 1);

export const pachisi: Rulebook = {
  id: "pachisi",
  finish: P_FINISH,
  isBonus: isGrace,
  roll: (s, c) => throwCowries(cowrieWeights(s, c)),
  validRoll: (v) => COWRIE_MOVE.includes(v),
  applyRoll,
  moveChoices,
  applyMove,
  pass: passMove,
  chooseMove,
  steps: pachisiSteps,
  point: pachisiPoint,
  progress: (s, c) => s.tokens[c].reduce((a, p) => a + pieceProgress(p), 0),
};
