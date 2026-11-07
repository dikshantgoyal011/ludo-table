// Pachisi throws: what the cowrie shells score, and which throws are graces.
//
// Six shells (the usual game): count the ones landing mouth-up, 2 to 6 move that
// many, one up moves 10 and none up 25. 6, 10 and 25 are graces: a grace brings
// a piece out of the Charkoni and gives another throw.
// Seven shells (a variation, Wikipedia "Pachisi"): none up 7, one up 10, 2 to 4
// as counted, five up 25, six up 35, all seven up 14. 10, 25 and 35 are graces;
// 7 and 14 give another throw but bring no piece out.
import type { PachisiVariations } from "./variations";

export interface ShellSet {
  /** How many shells are thrown. */
  n: number;
  /** Squares moved, by the number of shells mouth-up. */
  move: number[];
  /** Fair shells: chances of 0..n mouth-up (binomial). */
  weights: number[];
}

export const SIX_SHELLS: ShellSet = { n: 6, move: [25, 10, 2, 3, 4, 5, 6], weights: [1, 6, 15, 20, 15, 6, 1] };
export const SEVEN_SHELLS: ShellSet = { n: 7, move: [7, 10, 2, 3, 4, 25, 35, 14], weights: [1, 7, 21, 35, 35, 21, 7, 1] };

/**
 * The grace itself, when graces are played separately (a variation): it moves
 * one piece one square, or brings a piece onto the first square. No throw scores 1.
 */
export const GRACE_STEP = 1;

export const shellsOf = (v: PachisiVariations) => (v.sevenShells ? SEVEN_SHELLS : SIX_SHELLS);
/** How many shells lie mouth-up for a throw of v (-1: not a throw of this set). */
export const mouthsUp = (set: ShellSet, v: number) => set.move.indexOf(v);

/** The grace throws: they bring a piece out (unless played separately) and give another throw. */
export function isGrace(v: PachisiVariations, x: number) {
  const graces = v.sevenShells ? [10, 25, 35] : [6, 10, 25];
  return (v.twoGraces ? graces.filter((g) => g === 10 || g === 25) : graces).includes(x);
}
/** Throws that give another throw: the graces, and with seven shells 7 and 14 too. */
export const throwsAgain = (v: PachisiVariations, x: number) => isGrace(v, x) || (v.sevenShells && (x === 7 || x === 14));
/**
 * "Finish with a big throw" (a variation): the throws that can take a piece home,
 * from anywhere on its way in (no exact count needed: the home stretch is only 8
 * squares, and needing exactly a 6, or with seven shells a 7, left pieces waiting
 * so long that games never ended). Six shells: 6, 10 and 25, even when 6 is a
 * normal throw; seven shells: 7, 10, 14, 25 and 35.
 */
export const homeThrow = (v: PachisiVariations, x: number) => (v.sevenShells ? [7, 10, 14, 25, 35] : [6, 10, 25]).includes(x);
