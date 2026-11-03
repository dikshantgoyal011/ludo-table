// Pachisi: the cross-shaped board and cowrie throws, played by the traditional
// rules (Wikipedia "Pachisi"; mastersofgames.com, "The rules of Pachisi"):
//
// - Every piece starts in the Charkoni, the centre. A grace throw (6, 10 or 25)
//   brings one onto the first square of its own arm's middle column, and the
//   player throws again.
// - A piece goes down the middle column of its own arm, counter-clockwise round
//   the outside of the cross, and back up the same middle column to the
//   Charkoni: 84 squares. It must reach the Charkoni by an exact throw.
// - 12 castles (safe squares): the end of every arm's middle column, and the
//   squares four in from the ends of the outer columns. No capture on a castle,
//   and no landing on a castle an opponent holds.
//
// The board is 19 x 19 cells: four arms of 3 x 8 cells round a 3 x 3 centre.
// Positions of a piece: -1 in the Charkoni waiting to come out, 0-6 going down
// its own middle column, 7-75 round the cross (7 and 75 are its own arm's end),
// 76-82 back up its middle column, 83 home in the Charkoni.
import type { Color, Point } from "../types";

export const P_SIZE = 19;
/** First and last position round the shared outside of the cross. */
export const P_LAP_FROM = 7;
export const P_LAP_TO = 75;
export const P_FINISH = 83;

/** Cowrie throw: 6 shells, the ones landing mouth-up counted. 0 up moves 25, 1 up moves 10, else the count. */
export const COWRIE_MOVE = [25, 10, 2, 3, 4, 5, 6];
export const mouthsUp = (v: number) => (v === 25 ? 0 : v === 10 ? 1 : v);
/** Grace throws: bring a piece out, and throw again. */
export const isGrace = (v: number) => v === 6 || v === 10 || v === 25;

type Cell = [number, number]; // [row, col]

// The route for the south arm, which belongs to blue. The other arms are the same route turned.
const SOUTH: Cell[] = (() => {
  const r: Cell[] = [];
  for (let y = 11; y <= 18; y++) r.push([y, 9]); // down the middle of my arm (positions 0-7; 7 is its end)
  for (let y = 18; y >= 11; y--) r.push([y, 10]); // up the right side of my arm
  for (let x = 11; x <= 18; x++) r.push([10, x]); // out along the east arm
  r.push([9, 18]);
  for (let x = 18; x >= 11; x--) r.push([8, x]);
  for (let y = 7; y >= 0; y--) r.push([y, 10]); // north arm
  r.push([0, 9]);
  for (let y = 0; y <= 7; y++) r.push([y, 8]);
  for (let x = 7; x >= 0; x--) r.push([8, x]); // west arm
  r.push([9, 0]);
  for (let x = 0; x <= 7; x++) r.push([10, x]);
  for (let y = 11; y <= 18; y++) r.push([y, 8]); // down the left side of my arm
  for (let y = 18; y >= 11; y--) r.push([y, 9]); // back up the middle (75 is the end of my arm again)
  return r;
})();

/** Quarter turns (clockwise) from the south arm to each colour's arm: red west, green north, yellow east, blue south. */
const TURNS: Record<Color, number> = { blue: 0, red: 1, green: 2, yellow: 3 };
const turnCell = ([r, c]: Cell, k: number): Cell => {
  let p: Cell = [r, c];
  for (let i = 0; i < k; i++) p = [p[1], 18 - p[0]];
  return p;
};
/** A point (x, y) in board units, turned like the cells. */
const turnPoint = (x: number, y: number, k: number): [number, number] => {
  let p: [number, number] = [x, y];
  for (let i = 0; i < k; i++) p = [19 - p[1], p[0]];
  return p;
};

export const ROUTE: Record<Color, Cell[]> = {
  red: SOUTH.map((p) => turnCell(p, TURNS.red)),
  green: SOUTH.map((p) => turnCell(p, TURNS.green)),
  yellow: SOUTH.map((p) => turnCell(p, TURNS.yellow)),
  blue: SOUTH,
};

const key = ([r, c]: Cell) => `${r},${c}`;

/** Castles: each arm's end (position 7) and the square four in from the end on both outer columns (positions 11 and 71). */
export const CASTLES = new Set<string>((["red", "green", "yellow", "blue"] as Color[]).flatMap((c) => [ROUTE[c][7], ROUTE[c][11], ROUTE[c][71]].map(key)));

// Another round: at the end of its round a piece may go round again instead of
// back up its arm (sources: "it is possible for a piece, upon completing its
// circuit, to carry on around the board for a second time"). Positions from 84
// on are those later rounds: 84 is the square after its arm's end, and so on.
export const P_EXTRA = 84;
const LAP_LEN = 68;

/** Where round the outside of the cross a piece is (7-75 on its own route), or null in the centre / its middle column. */
export const lapIndex = (p: number): number | null =>
  p >= P_LAP_FROM && p <= P_LAP_TO ? p : p >= P_EXTRA ? P_LAP_FROM + 1 + ((p - P_EXTRA) % LAP_LEN) : null;

/**
 * Where a piece at p lands with a throw of v, going home at the end of its
 * round (`extra` false) or round again (`extra` true). null: not possible
 * (home needs the exact number, and never one square short of it).
 */
export function pachisiAdvance(p: number, v: number, extra = false): number | null {
  if (p === -1) return isGrace(v) ? 0 : null;
  if (p >= P_FINISH && p < P_EXTRA) return null;
  if (p > P_LAP_TO && p < P_FINISH) {
    const np = p + v; // already on the way up
    return np <= P_FINISH && np !== P_FINISH - 1 ? np : null;
  }
  const at = p >= P_EXTRA ? (lapIndex(p) as number) : p;
  const t = at + v;
  if (t <= P_LAP_TO) return extra ? null : p + v; // doesn't reach the end of the round
  if (extra) return p >= P_EXTRA ? p + v : P_EXTRA + (t - (P_LAP_TO + 1));
  return t <= P_FINISH && t !== P_FINISH - 1 ? t : null; // up the middle (76-82) or home (83)
}
/** The positions a piece passes through moving from a to b (for step-by-step animation), b included. */
export function pachisiSteps(a: number, b: number): number[] {
  const out: number[] = [];
  let p = a;
  for (let k = 0; k < 200 && p !== b; k++) {
    if (p === -1) p = 0;
    else if (p === P_LAP_TO && b >= P_EXTRA) p = P_EXTRA; // round again
    else if (p >= P_EXTRA && b < P_EXTRA && lapIndex(p) === P_LAP_TO) p = P_LAP_TO + 1; // home from a later round
    else p++;
    out.push(p);
  }
  return out;
}

/** Would this throw take the piece past the end of its round (so it can choose: home, or round again)? */
export const passesRoundEnd = (p: number, v: number) => {
  if (p === -1 || (p > P_LAP_TO && p < P_EXTRA)) return false;
  const at = p >= P_EXTRA ? (lapIndex(p) as number) : p;
  return at + v > P_LAP_TO;
};

/** The square a piece is on, as a key two colours can compare (only round the outside: the middle columns are private). */
export const squareOf = (c: Color, p: number) => {
  const l = lapIndex(p);
  return l === null ? null : key(ROUTE[c][l]);
};
export const isCastle = (c: Color, p: number) => {
  const sq = squareOf(c, p);
  return !!sq && CASTLES.has(sq);
};

/** Where pieces sit in the Charkoni (centre), in each colour's own triangle: waiting to come out, and home. */
const WAIT_PT: [number, number] = [9.05, 10.5];
const HOME_PT: [number, number] = [9.95, 10.5];

export function pachisiPoint(c: Color, i: number, p: number): Point {
  if (p === -1 || (p >= P_FINISH && p < P_EXTRA)) {
    const [x, y] = turnPoint(...(p === -1 ? WAIT_PT : HOME_PT), TURNS[c]);
    return { x, y, key: (p === -1 ? "w" : "f") + c, lying: p >= P_FINISH };
  }
  if (p >= P_EXTRA) {
    const [r, cc] = ROUTE[c][lapIndex(p) as number];
    return { x: cc + 0.5, y: r + 0.5, key: "t" + key([r, cc]), lying: false };
  }
  const [r, cc] = ROUTE[c][p];
  // Pieces on their way back up the middle are laid on their side, as on a real board.
  return { x: cc + 0.5, y: r + 0.5, key: p >= P_LAP_FROM && p <= P_LAP_TO ? "t" + key([r, cc]) : `m${c}${p}`, lying: p > P_LAP_TO };
}

/** Chances of 0-6 shells landing mouth-up (6 fair shells): 1, 6, 15, 20, 15, 6, 1 out of 64. */
export const COWRIE_WEIGHTS = [1, 6, 15, 20, 15, 6, 1];
