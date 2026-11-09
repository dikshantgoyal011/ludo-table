// Chaupar: the same cross-shaped board as Pachisi (pachisi/board.ts has its
// squares and each colour's route), gone round once. Each colour counts the
// squares from its own arm: 1-7 down the middle of the arm (its Belly), 8 the
// arm's end, 9-75 counter-clockwise round the cross, 8 again, and back up 7-1
// into Home, the centre. The rules are in rules.ts, the dice in dice.ts.
//
// Positions of a pawn: square n is position n - 1 on the way out (0-6 down its
// Belly, 7-74 round the cross), then 75 its arm's end again, 76-82 back up its
// Belly (squares 7 to 1), 83 home. -1: captured, off the board until it comes back in.
import type { Color } from "../types";
import { P_FINISH, P_LAP_TO } from "../pachisi/board";

export const C_FINISH = P_FINISH;
/** Where each colour's pawns start: one on square 6, one on 7, and two together (a pair) on 12. */
export const C_START = [5, 6, 11, 11];
/** The pair it starts with: pawns 2 and 3, on square 12. */
export const C_START_PAIR = [2, 3];
export const C_START_AT = 11;
/** Square 34, where Kajalvun is done (each colour's own square 34). */
export const C_KAJAL = 33;
/** Square 24: an opening 1-1 or 6-6 sends a pawn of the pair on 12 here. */
export const C_OPEN_TO = 23;

/**
 * Where a pawn at p lands moving d squares (null: past Home, which needs the
 * exact count). Coming back in (-1), it's put on square 1 and moves on from there.
 */
export function chauparAdvance(p: number, d: number): number | null {
  if (p >= C_FINISH || !(d > 0)) return null;
  if (p === -1) return d;
  return p + d <= C_FINISH ? p + d : null;
}

/**
 * A throw too big for Home, when nothing else can use it: the pawn goes in and
 * back out by the rest. Still inside its Belly, it's still on its way home
 * (square 2 is position 81); beyond it, it has to go round again.
 */
export function chauparBounce(p: number, d: number): number {
  const e = p + d - C_FINISH;
  return e <= 7 ? C_FINISH - e : e - 1;
}

/** The positions a pawn passes through from a to b (for step-by-step animation), b included. */
export function chauparSteps(a: number, b: number): number[] {
  // (Khado Karvo: straight out of Home onto the square.)
  if (a === C_FINISH) return [b];
  const out: number[] = [];
  if (b > a) {
    for (let p = a + 1; p <= b; p++) out.push(p);
    return out;
  }
  // Past Home and back out: down its Belly again, or out of it and round again.
  for (let p = a + 1; p <= C_FINISH; p++) out.push(p);
  if (b > P_LAP_TO) for (let p = C_FINISH - 1; p >= b; p--) out.push(p);
  else for (let p = 0; p <= b; p++) out.push(p);
  return out;
}

/**
 * The pawns sharing one square, laid out for drawing. Two pawns of one colour
 * at one position are a pair: they stand in a stack, the top one showing how
 * many. Different pawns sit side by side, as in the other games.
 */
export function stackSquare<T extends { c: Color; i: number; p: number; x: number; y: number }>(list: T[]) {
  const stacks: T[][] = [];
  for (const t of [...list].sort((a, b) => a.i - b.i)) {
    // (Only on the board: pawns waiting to come back in, or home, are each on their own.)
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
