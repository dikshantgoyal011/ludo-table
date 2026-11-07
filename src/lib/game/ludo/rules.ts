// Ludo rules. Only Ludo uses this file: changes to Pachisi never come here.
// Functions take a state and change it in place; callers work on a copy (see
// GameController.commit).
import { COLORS } from "../constants";
import { addLog, nextTurn, seatName } from "../table";
import type { Color, GameState, MoveChoice, Rulebook } from "../types";
import { basePoint, FINISH, SAFE, trackIdx } from "./board";
import { rollDie } from "./dice";
import { diceOdds, progress, recordRoll } from "./luck";

export const canMove = (p: number, v: number) => p !== FINISH && (p === -1 ? v === 6 : p + v <= FINISH);
export const movable = (s: GameState, c: Color, v: number) =>
  s.tokens[c].map((p, i) => (canMove(p, v) ? i : -1)).filter((i) => i >= 0);

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
  recordRoll(s, c, v);
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

export const ludo: Rulebook = {
  id: "ludo",
  finish: FINISH,
  counts: [2, 3, 4],
  isBonus: (v) => v === 6,
  // Random, with odds that lean on the state of the game (luck.ts).
  roll: (s, c) => rollDie(diceOdds(s, c).p),
  validRoll: (v) => Number.isInteger(v) && v >= 1 && v <= 6,
  applyRoll,
  moveChoices: (s, c, i, v): MoveChoice[] => {
    const p = s.tokens[c][i];
    return canMove(p, v) ? [{ to: p === -1 ? 0 : p + v }] : [];
  },
  applyMove: (s, c, i, v) => applyMove(s, c, i, v),
  pass: null,
  chooseMove: (s, c, v) => ({ i: chooseMove(s, c, v), opt: {} }),
  steps: (a, b) => Array.from({ length: Math.max(0, b - a) }, (_, k) => a + k + 1),
  point: basePoint,
  progress,
  safe: (c, p) => p >= 0 && p <= 50 && SAFE.has(trackIdx(c, p)),
};
