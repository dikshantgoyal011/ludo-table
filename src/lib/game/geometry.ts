// Board geometry on a 15 x 15 grid. [row, col] pairs.
import { COLORS, FINISH, START } from "./constants";
import type { Color } from "./types";

export const TRACK: [number, number][] = [];
const push = (r: number, c: number) => TRACK.push([r, c]);
for (let c = 1; c <= 5; c++) push(6, c);
for (let r = 5; r >= 0; r--) push(r, 6);
push(0, 7);
for (let r = 0; r <= 5; r++) push(r, 8);
for (let c = 9; c <= 14; c++) push(6, c);
push(7, 14);
for (let c = 14; c >= 9; c--) push(8, c);
for (let r = 9; r <= 14; r++) push(r, 8);
push(14, 7);
for (let r = 14; r >= 9; r--) push(r, 6);
for (let c = 5; c >= 0; c--) push(8, c);
push(7, 0);
push(6, 0);

export const HOMECOL: Record<Color, [number, number][]> = {
  red: [1, 2, 3, 4, 5].map((c) => [7, c] as [number, number]),
  green: [1, 2, 3, 4, 5].map((r) => [r, 7] as [number, number]),
  yellow: [13, 12, 11, 10, 9].map((c) => [7, c] as [number, number]),
  blue: [13, 12, 11, 10, 9].map((r) => [r, 7] as [number, number]),
};

export const YARD: Record<Color, [number, number]> = { red: [0, 0], green: [0, 9], yellow: [9, 9], blue: [9, 0] };
export const YARD_SPOTS: [number, number][] = [[2, 2], [2, 4], [4, 2], [4, 4]];
export const FINISH_PT: Record<Color, [number, number]> = { red: [6.55, 7.5], green: [7.5, 6.55], yellow: [8.45, 7.5], blue: [7.5, 8.45] };

export const trackIdx = (c: Color, p: number) => (START[c] + p) % 52;

export interface Point {
  x: number;
  y: number;
  /** Tokens sharing a key sit on the same square. */
  key: string;
}

/** Where token i of colour c sits when it is at position p. */
export function basePoint(c: Color, i: number, p: number): Point {
  if (p === -1) {
    const [r0, c0] = YARD[c];
    const d = YARD_SPOTS[i];
    return { x: c0 + d[1], y: r0 + d[0], key: "y" + c + i };
  }
  if (p <= 50) {
    const [r, cc] = TRACK[trackIdx(c, p)];
    return { x: cc + 0.5, y: r + 0.5, key: "t" + trackIdx(c, p) };
  }
  if (p < FINISH) {
    const [r, cc] = HOMECOL[c][p - 51];
    return { x: cc + 0.5, y: r + 0.5, key: "h" + c + p };
  }
  const [x, y] = FINISH_PT[c];
  return { x, y, key: "f" + c };
}

export const ALL_COLORS = COLORS;
