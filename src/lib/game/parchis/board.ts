// Parchís: the Spanish board (Spanish Wikipedia, "Parchís"). The rules are in rules.ts.
//
// - A cross of four arms, 3 squares wide and 8 long, round the centre (the
//   metas), on a 19 x 19 grid. A house (casa) in each corner.
// - 68 squares round the outside, numbered the way the pieces go, counter-
//   clockwise. Each colour comes out onto its salida (5, 22, 39, 56), goes
//   round, and at the end of its arm's middle column (68, 17, 34, 51) turns up
//   its own pasillo: 7 squares to its meta in the centre. 72 squares in all,
//   the meta by the exact count.
// - 12 safe squares (seguros): the four salidas, the four ends of the arms, and
//   the square opposite each salida on its arm.
//
// Corners follow the app's slots (constants.ts): red top-left, green top-right,
// yellow bottom-right, blue bottom-left.
// Positions of a piece: -1 in its house, 0-63 round the board (0 its salida,
// 63 the square before its pasillo), 64-70 up its pasillo, 71 at its meta.
import type { Color, Point } from "../types";

export const X_SIZE = 19;
export const X_TRACK = 68;
/** Last position round the shared outside, and the first up the pasillo. */
export const X_LAST_SHARED = 63;
export const X_PASILLO = 64;
export const X_FINISH = 71;

type Cell = [number, number]; // [row, col]

/** Each colour's salida (where it comes out), by square number. */
export const SALIDA: Record<Color, number> = { yellow: 5, green: 22, red: 39, blue: 56 };
/** The safe squares (seguros), by square number. */
export const SEGUROS = new Set([5, 12, 17, 22, 29, 34, 39, 46, 51, 56, 63, 68]);

/** Square n (1-68) on the grid. */
export function squareCell(n: number): Cell {
  if (n <= 8) return [18 - (n - 1), 10];
  if (n <= 16) return [10, 11 + (n - 9)];
  if (n === 17) return [9, 18];
  if (n <= 25) return [8, 18 - (n - 18)];
  if (n <= 33) return [7 - (n - 26), 10];
  if (n === 34) return [0, 9];
  if (n <= 42) return [n - 35, 8];
  if (n <= 50) return [8, 7 - (n - 43)];
  if (n === 51) return [9, 0];
  if (n <= 59) return [10, n - 52];
  if (n <= 67) return [11 + (n - 60), 8];
  return [18, 9];
}

/** Each colour's pasillo, from its arm's end in towards the centre. */
export const PASILLO: Record<Color, Cell[]> = {
  yellow: [17, 16, 15, 14, 13, 12, 11].map((r) => [r, 9] as Cell),
  green: [17, 16, 15, 14, 13, 12, 11].map((c) => [9, c] as Cell),
  red: [1, 2, 3, 4, 5, 6, 7].map((r) => [r, 9] as Cell),
  blue: [1, 2, 3, 4, 5, 6, 7].map((c) => [9, c] as Cell),
};

/** Each house's corner (top-left cell of its 8 x 8 square). */
export const CASA: Record<Color, Cell> = { red: [0, 0], green: [0, 11], yellow: [11, 11], blue: [11, 0] };
/** Where the pieces arrive in the centre: each colour's own triangle, next to its pasillo. */
const META_PT: Record<Color, [number, number]> = { yellow: [9.5, 10.4], green: [10.4, 9.5], red: [9.5, 8.6], blue: [8.6, 9.5] };
const CASA_SPOTS: [number, number][] = [[-1.35, -1.35], [1.35, -1.35], [-1.35, 1.35], [1.35, 1.35]];

/** The square number (1-68) a piece of c at position p stands on, or null (house, pasillo, meta). */
export const squareOf = (c: Color, p: number): number | null => (p >= 0 && p <= X_LAST_SHARED ? ((SALIDA[c] - 1 + p) % X_TRACK) + 1 : null);
/** A key two colours can compare: the same key, the same square (pasillos are each colour's own). */
export const keyOf = (c: Color, p: number): string | null => {
  const n = squareOf(c, p);
  if (n !== null) return "t" + n;
  return p >= X_PASILLO && p < X_FINISH ? `h${c}${p}` : null;
};
export const isSeguro = (c: Color, p: number) => {
  const n = squareOf(c, p);
  return n !== null && SEGUROS.has(n);
};

/** The positions a piece passes through from a to b, b included (for step-by-step animation). */
export const parchisSteps = (a: number, b: number): number[] => (a === -1 ? [0] : Array.from({ length: Math.max(0, b - a) }, (_, k) => a + k + 1));

export function parchisPoint(c: Color, i: number, p: number): Point {
  if (p === -1) {
    const [r0, c0] = CASA[c];
    const [dx, dy] = CASA_SPOTS[i];
    return { x: c0 + 4 + dx, y: r0 + 4 + dy, key: "y" + c + i };
  }
  if (p >= X_FINISH) {
    const [x, y] = META_PT[c];
    return { x, y, key: "f" + c };
  }
  const [r, cc] = p >= X_PASILLO ? PASILLO[c][p - X_PASILLO] : squareCell(squareOf(c, p) as number);
  return { x: cc + 0.5, y: r + 0.5, key: keyOf(c, p) as string };
}
