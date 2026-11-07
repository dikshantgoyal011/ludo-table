// Parchís variations: the ways it's also played (casualarena.com, "Parcheesi
// rules": two dice, a piece out from the start, two-colour barriers, pairs).
// All off is the classic one-dice game, which is also what online tables play.

export type ParchisVariations = {
  /**
   * Two dice, each played on its own, in either order. A 5 on a dice, or the two
   * adding up to 5, must bring a piece out. Doubles roll again, and must open a
   * barrier (the other dice can't close it again). A 6 is just a 6.
   */
  twoDice: boolean;
  /** Everyone starts with one piece on its salida, three in the house. */
  startOut: boolean;
  /** Two pieces of different colours sharing a seguro make a barrier too. */
  mixedBarriers: boolean;
  /** Four players: the two opposite each other are partners, and a pair wins when either brings all four pieces in. */
  pairs: boolean;
};

export type ParchisVariationId = keyof ParchisVariations;

export const NO_PARCHIS_VARIATIONS: ParchisVariations = { twoDice: false, startOut: false, mixedBarriers: false, pairs: false };

/** Shown on the variations screen and in the friends lobby, in this order. `lesson`: its page in How to play. */
export const PARCHIS_VARIATION_INFO: { id: ParchisVariationId; title: string; text: string; lesson: string }[] = [
  { id: "twoDice", title: "Two dice", text: "Roll two dice and use each one to move. Doubles roll again.", lesson: "x-two-dice" },
  { id: "startOut", title: "Start with a piece out", text: "Everyone begins with one piece already on the board.", lesson: "x-start-out" },
  { id: "mixedBarriers", title: "Mixed barriers", text: "Two pieces of any colors on a safe square make a barrier nobody can pass.", lesson: "x-mixed" },
  { id: "pairs", title: "Play in pairs", text: "Four players: you team up with the player opposite. One of you finishing wins it for both.", lesson: "x-pairs" },
];

/** Any value from storage or the network, as a full set of variations (unknown parts off). */
export function cleanParchisVariations(v: unknown): ParchisVariations {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out = { ...NO_PARCHIS_VARIATIONS };
  for (const k of Object.keys(out) as ParchisVariationId[]) out[k] = o[k] === true;
  return out;
}

/** Do these players play in pairs? Only four can. */
export const parchisPairs = (v: ParchisVariations, players: number) => v.pairs && players === 4;
