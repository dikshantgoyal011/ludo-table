// Pachisi: throwing the six cowrie shells.
//
// The shells are left fair, with one help: stuck with every piece waiting in
// the centre, each throw that doesn't bring one out makes a bonus throw (6, 10
// or 25: 0, 1 or 6 shells mouth-up) more likely, until one comes out.
import type { Color, GameState, LuckStats } from "../types";
import { COWRIE_MOVE, COWRIE_WEIGHTS, isGrace, P_FINISH } from "./board";

/** Each throw stuck in the centre gives the bonus throws this much more weight. */
export const COWRIE_STUCK_STEP = 0.6;

/** Throw 6 cowries. `weights` for 0-6 mouth-up shells (default: fair shells). Returns the squares to move. */
export function throwCowries(weights: readonly number[] = COWRIE_WEIGHTS): number {
  const total = weights.reduce((a, b) => a + b, 0);
  const u = new Uint32Array(1);
  crypto.getRandomValues(u);
  let r = (u[0] / 2 ** 32) * total;
  for (let k = 0; k < weights.length; k++) {
    r -= weights[k];
    if (r < 0) return COWRIE_MOVE[k];
  }
  return COWRIE_MOVE[3];
}

/** No piece on the board and at least one waiting in the centre. */
const waiting = (s: GameState, c: Color) => s.tokens[c].every((p) => p === -1 || p === P_FINISH) && s.tokens[c].includes(-1);

const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.min(x, 1000) : 0);
/** c's throw stats (stored in the shared `luck` field), with defaults for anything missing. */
function statsOf(s: GameState, c: Color): LuckStats {
  const l = s.luck?.[c];
  const ok = !!l && typeof l === "object";
  return {
    since: ok && Array.isArray(l.since) ? l.since.map(num) : [0, 0, 0, 0, 0, 0],
    stuck: ok ? num(l.stuck) : 0,
    homeMiss: ok ? num(l.homeMiss) : 0,
    last: ok && Array.isArray(l.last) ? l.last.filter((v) => typeof v === "number").slice(0, 2) : [],
  };
}

/** Weights for 0-6 shells landing mouth-up on c's next throw. */
export function cowrieWeights(s: GameState, c: Color): number[] {
  const w = [...COWRIE_WEIGHTS];
  const stuck = statsOf(s, c).stuck;
  if (s.phase === "playing" && waiting(s, c) && stuck > 0) {
    const boost = 1 + COWRIE_STUCK_STEP * stuck;
    for (const k of [0, 1, 6]) w[k] *= boost;
  }
  return w;
}

/** Bookkeeping after c throws v (part of the rules, so every device agrees). */
export function recordThrow(s: GameState, c: Color, v: number) {
  const l = statsOf(s, c);
  l.stuck = waiting(s, c) && !isGrace(v) ? l.stuck + 1 : 0;
  l.last = [v, ...l.last].slice(0, 2);
  s.luck = { ...(s.luck || {}), [c]: l };
}
