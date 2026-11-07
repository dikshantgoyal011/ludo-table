// Chaupar: the same cross-shaped board as Pachisi (pachisi/board.ts has its
// squares and each colour's route), gone round once: down the middle of your
// own arm, counter-clockwise round the cross, and back up the middle to the
// Charkoni. The rules are in rules.ts, the dice in dice.ts.
//
// Positions of a piece: -1 in the Charkoni (captured, waiting to come back in),
// 0-6 down its own middle column, 7-75 round the cross (7 and 75 are its own
// arm's end), 76-82 back up its middle column, 83 home. A piece that goes round
// again instead of up home (a variation, until its side has captured) carries
// on from 75 to 8: positions round the cross are the same squares every round.
import type { Color } from "../types";
import { P_FINISH, P_LAP_FROM, P_LAP_TO } from "../pachisi/board";

export const C_FINISH = P_FINISH;
/** Where each colour's pieces start: squares 6, 7, 23 and 24 counted from the Charkoni. */
export const C_START = [5, 6, 22, 23];
/** Squares round the cross. */
const LAP = 68;

/**
 * Where a piece at p lands moving d squares (null: it can't). From the Charkoni
 * it counts the first square of its arm as 1. `round`: at the end of its round
 * it goes round again instead of up home. Home only by the exact count.
 */
export function chauparAdvance(p: number, d: number, round: boolean): number | null {
  if (p >= C_FINISH || !(d > 0)) return null;
  if (p === -1) return d - 1;
  const t = p + d;
  if (p > P_LAP_TO) return t <= C_FINISH ? t : null; // already on the way up
  if (t <= P_LAP_TO) return t;
  if (round) return t - LAP;
  return t <= C_FINISH ? t : null;
}

/** The positions a piece passes through from a to b (for step-by-step animation), b included. */
export function chauparSteps(a: number, b: number): number[] {
  const out: number[] = [];
  let p = a;
  for (let k = 0; k < 120 && p !== b; k++) {
    // (Round again: from its arm's end on round the cross.)
    p = p === -1 ? 0 : p === P_LAP_TO && b < P_LAP_TO ? P_LAP_FROM + 1 : p + 1;
    out.push(p);
  }
  return out;
}

/**
 * The pieces sharing one square, laid out for drawing. Pieces of one colour at
 * one position are one piece (a super-piece): they stand in a stack, the top
 * one showing how many. Different pieces sit side by side, as in the other games.
 */
export function stackSquare<T extends { c: Color; i: number; p: number; x: number; y: number }>(list: T[]) {
  const stacks: T[][] = [];
  for (const t of [...list].sort((a, b) => a.i - b.i)) {
    // (Only on the board: pieces waiting in the Charkoni, or home, are each on their own.)
    const st = t.p >= 0 && t.p < C_FINISH ? stacks.find((g) => g[0].c === t.c && g[0].p === t.p) : undefined;
    if (st) st.push(t);
    else stacks.push([t]);
  }
  const n = stacks.length;
  const out: (T & { scale: number; lift: number; badge?: number })[] = [];
  stacks.forEach((st, k) => {
    let { x, y } = st[0];
    let scale = st.length > 1 ? 0.84 : 1;
    if (n > 1) {
      scale = n > 2 ? 0.62 : 0.75;
      const off = n > 2 ? 0.22 : 0.2;
      const ang = (k / n) * Math.PI * 2 - Math.PI / 4;
      x += Math.cos(ang) * off;
      y += Math.sin(ang) * off;
    }
    // Lifted (up the screen, however the board is turned) one above the other, the stack centred on the square.
    st.forEach((t, h) => out.push({ ...t, x, y, scale, lift: (h - (st.length - 1) / 2) * 0.24, badge: st.length > 1 && h === st.length - 1 ? st.length : undefined }));
  });
  return out;
}
