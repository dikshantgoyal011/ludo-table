// Pachisi: throwing the cowrie shells (six, or seven as a variation).
//
// The shells are left fair, with one help: stuck with every piece waiting in
// the centre (and the first one already gone, so only a grace brings one out),
// each throw that isn't a grace makes the graces more likely, until one comes.
import type { Color, GameState, LuckStats } from "../types";
import { P_FINISH } from "./board";
import { isGrace, shellsOf, SIX_SHELLS, type ShellSet } from "./throws";
import { cleanVariations } from "./variations";

/** Each throw stuck in the centre gives the grace throws this much more weight. */
export const COWRIE_STUCK_STEP = 0.6;

/** Throw the shells of `set`. `weights` for 0..n mouth-up shells (default: fair shells). Returns the squares to move. */
export function throwCowries(weights?: readonly number[], set: ShellSet = SIX_SHELLS): number {
  const w = weights || set.weights;
  const total = w.reduce((a, b) => a + b, 0);
  const u = new Uint32Array(1);
  crypto.getRandomValues(u);
  let r = (u[0] / 2 ** 32) * total;
  for (let k = 0; k < w.length; k++) {
    r -= w[k];
    if (r < 0) return set.move[k];
  }
  return set.move[3];
}

/** No piece on the board, at least one waiting in the centre, and only a grace can bring one out. */
const waiting = (s: GameState, c: Color) =>
  !!s.pachisi?.entered.includes(c) && s.tokens[c].every((p) => p === -1 || p === P_FINISH) && s.tokens[c].includes(-1);

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

/** Weights for 0..n shells landing mouth-up on c's next throw. */
export function cowrieWeights(s: GameState, c: Color): number[] {
  const v = cleanVariations(s.variations);
  const set = shellsOf(v);
  const w = [...set.weights];
  const stuck = statsOf(s, c).stuck;
  if (s.phase === "playing" && waiting(s, c) && stuck > 0) {
    const boost = 1 + COWRIE_STUCK_STEP * stuck;
    set.move.forEach((x, k) => {
      if (isGrace(v, x)) w[k] *= boost;
    });
  }
  return w;
}

/** Bookkeeping after c throws x (part of the rules, so every device agrees). */
export function recordThrow(s: GameState, c: Color, x: number) {
  const l = statsOf(s, c);
  l.stuck = waiting(s, c) && !isGrace(cleanVariations(s.variations), x) ? l.stuck + 1 : 0;
  l.last = [x, ...l.last].slice(0, 2);
  s.luck = { ...(s.luck || {}), [c]: l };
}
