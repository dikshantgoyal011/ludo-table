// Dice odds that keep the game engaging. Every roll is still random; the
// chance of each number just leans a little with the state of the game:
//
//  1. Stuck at the start: every roll without a 6 while all your tokens wait in
//     the yard makes a 6 a bit more likely, until one comes out.
//  3. Cuts: a number that would let you cut an opponent's token is a bit more
//     likely, more so when that opponent is ahead of you.
//  4. Home stretch: a token near home needs an exact number. After a couple of
//     misses that number gets more likely with every further miss.
//  5. No droughts or streaks: a number you haven't rolled for a long time gets
//     more likely; rolling the same number again, or a third 6 in a row (which
//     loses the turn), gets a bit less likely.
//  6. Tight finish: when two or more players are close to winning, the dice is
//     completely fair for everyone.
//
// Each number always stays between MIN_P and MAX_P (a fair dice is 1/6 = 16.7%).
// Everything is computed from the game state alone, so every device gets the
// same odds and the same bookkeeping. The same rules apply to every player.
import { COLORS, FINISH, SAFE } from "./constants";
import { trackIdx } from "./geometry";
import type { Color, GameState, LuckStats } from "./types";

export const MIN_P = 0.1;
export const MAX_P = 0.3;

/** How strongly each rule leans (tuned with thousands of simulated games). */
export const TUNING = {
  /** 1. Each roll stuck in the yard: the 6 gets this much more weight. */
  STUCK_STEP: 0.25,
  /** 3. Weight for a number that cuts; more when the cut player is ahead of you. */
  CUT_BOOST: 1.03,
  CUT_BOOST_BEHIND: 1.2,
  /** 4. Misses near home that are free; after that each miss adds this much weight. */
  HOME_FREE_MISSES: 1,
  HOME_STEP: 0.4,
  /** 5. A number not seen for more than this many rolls gets DROUGHT_STEP more weight per roll. */
  DROUGHT_AFTER: 9,
  DROUGHT_STEP: 0.25,
  /** 5. Same number as the last two rolls / a third 6 in a row. */
  REPEAT_DAMP: 0.75,
  THIRD_SIX_DAMP: 0.6,
  /** 6. A player this close to winning (squares left for all four tokens) counts as close. */
  CLOSE_TO_WIN: 24,
};
const T = TUNING;

export const FAIR: readonly number[] = [1, 1, 1, 1, 1, 1].map((x) => x / 6);

const freshStats = (): LuckStats => ({ since: [0, 0, 0, 0, 0, 0], stuck: 0, homeMiss: 0, last: [] });

/** A player's stats, with defaults for anything missing (older saves, other app versions). */
export function luckOf(s: GameState, c: Color): LuckStats {
  const l = s.luck?.[c];
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.min(x, 1000) : 0);
  if (!l || typeof l !== "object") return freshStats();
  return {
    since: Array.from({ length: 6 }, (_, k) => num(Array.isArray(l.since) ? l.since[k] : 0)),
    stuck: num(l.stuck),
    homeMiss: num(l.homeMiss),
    last: Array.isArray(l.last) ? l.last.filter((v) => typeof v === "number").slice(0, 2) : [],
  };
}

/** No token on the board and at least one waiting in the yard. */
const waitingToStart = (s: GameState, c: Color) => s.tokens[c].every((p) => p === -1 || p === FINISH) && s.tokens[c].includes(-1);

/** Exact numbers that would bring a token home (tokens 6 or fewer squares away). */
const homeNeeds = (s: GameState, c: Color) => [...new Set(s.tokens[c].filter((p) => p >= 50 && p < FINISH).map((p) => FINISH - p))];

/** How far a player has got: 0 for a token in the yard, up to 57 for one home. */
export const progress = (s: GameState, c: Color) => s.tokens[c].reduce((a, p) => a + (p < 0 ? 0 : p + 1), 0);

/** Squares left for all of a player's tokens (a token in the yard counts the full way). */
const squaresLeft = (s: GameState, c: Color) => s.tokens[c].reduce((a, p) => a + (p < 0 ? FINISH + 1 : FINISH - p), 0);

/** 6. Two or more players still playing who are close to winning. */
export function tightFinish(s: GameState) {
  const playing = COLORS.filter((c) => s.seats[c] && !s.winners.includes(c) && !s.seats[c]?.out);
  return playing.filter((c) => squaresLeft(s, c) <= T.CLOSE_TO_WIN).length >= 2;
}

/** 3. For each roll 1-6: the opponents a token of c could cut with it. */
function cutTargets(s: GameState, c: Color): Color[][] {
  const out: Color[][] = [[], [], [], [], [], []];
  for (const p of s.tokens[c]) {
    if (p < 0 || p > 50) continue;
    for (let d = 1; d <= 6; d++) {
      const np = p + d;
      if (np > 50) break;
      const idx = trackIdx(c, np);
      if (SAFE.has(idx)) continue;
      for (const o of COLORS) {
        if (o === c || !s.seats[o]) continue;
        if (s.tokens[o].some((op) => op >= 0 && op <= 50 && trackIdx(o, op) === idx) && !out[d - 1].includes(o)) out[d - 1].push(o);
      }
    }
  }
  return out;
}

/**
 * Turn weights into chances that add up to 1 with every one inside
 * [MIN_P, MAX_P]: p = clamp(k * w) for the one scale k that makes them add up
 * to 1 (found by bisection; the sum only grows with k, from 6 * MIN_P to 6 * MAX_P).
 */
export function clampOdds(w: number[]): number[] {
  const ws = w.map((x) => (Number.isFinite(x) && x > 0 ? x : 1e-9));
  const at = (k: number) => ws.map((x) => Math.min(MAX_P, Math.max(MIN_P, k * x)));
  const sum = (p: number[]) => p.reduce((a, b) => a + b, 0);
  let lo = 0;
  let hi = 1;
  while (sum(at(hi)) < 1) hi *= 2;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (sum(at(mid)) < 1) lo = mid;
    else hi = mid;
  }
  const p = at(hi);
  // Remove the last rounding error so the chances add up to exactly 1.
  const s = sum(p);
  return p.map((x) => x / s);
}

export interface Odds {
  /** Chance of each face 1-6 (index 0-5), summing to 1. */
  p: number[];
  /** Which rules leaned on this roll (for tests and tuning). */
  why: string[];
}

/** The odds for c's next roll in state s. */
export function diceOdds(s: GameState, c: Color): Odds {
  if (s.phase !== "playing" || !s.tokens[c]) return { p: [...FAIR], why: [] };
  if (tightFinish(s)) return { p: [...FAIR], why: ["tight-finish"] };
  const l = luckOf(s, c);
  const w = [1, 1, 1, 1, 1, 1];
  const why: string[] = [];

  // 1. Stuck at the start.
  if (waitingToStart(s, c) && l.stuck > 0) {
    w[5] *= 1 + T.STUCK_STEP * l.stuck;
    why.push("stuck-start");
  }

  // 3. Cuts: only the one number that cuts the player furthest ahead, so a
  // crowded board doesn't turn every roll into a cut (that made games longer).
  const cuts = cutTargets(s, c);
  let best = -1;
  let bestProgress = -1;
  cuts.forEach((owners, k) => {
    for (const o of owners) {
      const pr = progress(s, o);
      if (pr > bestProgress) ((bestProgress = pr), (best = k));
    }
  });
  if (best >= 0) {
    w[best] *= bestProgress > progress(s, c) ? T.CUT_BOOST_BEHIND : T.CUT_BOOST;
    why.push("cut");
  }

  // 4. Home stretch.
  const needs = homeNeeds(s, c);
  if (needs.length && l.homeMiss > T.HOME_FREE_MISSES) {
    for (const d of needs) w[d - 1] *= 1 + T.HOME_STEP * (l.homeMiss - T.HOME_FREE_MISSES);
    why.push("home-stretch");
  }

  // 5. Droughts and streaks.
  l.since.forEach((n, k) => {
    if (n > T.DROUGHT_AFTER) {
      w[k] *= 1 + T.DROUGHT_STEP * (n - T.DROUGHT_AFTER);
      if (!why.includes("drought")) why.push("drought");
    }
  });
  if (l.last.length === 2 && l.last[0] === l.last[1] && l.last[0] >= 1 && l.last[0] <= 6) {
    w[l.last[0] - 1] *= T.REPEAT_DAMP;
    why.push("repeat");
  }
  if ((s.sixes || 0) >= 2) {
    w[5] *= T.THIRD_SIX_DAMP;
    why.push("third-six");
  }

  return { p: why.length ? clampOdds(w) : [...FAIR], why };
}

/**
 * Bookkeeping after c rolls v, from the state before the roll changes anything.
 * Part of the rules (applyRoll), so every device keeps the same numbers.
 */
export function recordRoll(s: GameState, c: Color, v: number) {
  const l = luckOf(s, c);
  l.since = l.since.map((n, k) => (k === v - 1 ? 0 : n + 1));
  l.stuck = waitingToStart(s, c) && v !== 6 ? l.stuck + 1 : 0;
  const needs = homeNeeds(s, c);
  l.homeMiss = needs.length && !needs.includes(v) ? l.homeMiss + 1 : 0;
  l.last = [v, ...l.last].slice(0, 2);
  s.luck = { ...(s.luck || {}), [c]: l };
}
