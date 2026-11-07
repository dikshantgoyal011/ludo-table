// Pachisi variations: rules that differ from place to place (mastersofgames.com,
// "The rules of Pachisi", Variations). All off is the traditional game, which is
// also what online tables always play (Solo or 2 vs 2, as each player picks).

export type PachisiVariations = {
  /**
   * Solo: everyone plays for themselves, no partners (the default). Otherwise
   * four play 2 vs 2, partners opposite, and two players each play both colours
   * of a side, as traditionally. Three players always play solo.
   */
  alone: boolean;
  /** Seven cowries instead of six (0 up 7, 1 up 10, 5 up 25, 6 up 35, 7 up 14). */
  sevenShells: boolean;
  /** Only 10 and 25 are graces. */
  twoGraces: boolean;
  /** A piece can only finish in the Charkoni with a big throw (see homeThrow in throws.ts). */
  graceHome: boolean;
  /** Two or more pieces of one side on a square can't be passed by the other side. */
  blockades: boolean;
  /** Three graces in a row: the third throw doesn't count and the player misses their next turn. */
  threeGraces: boolean;
  /** A grace's amount only moves pieces already out; the grace itself is a separate move of one square, or a piece onto the first square. */
  graceApart: boolean;
  /** Throw first (again and again on graces), then move one piece for each throw. */
  throwFirst: boolean;
};

export type VariationId = keyof PachisiVariations;

export const NO_VARIATIONS: PachisiVariations = {
  alone: true,
  sevenShells: false,
  twoGraces: false,
  graceHome: false,
  blockades: false,
  threeGraces: false,
  graceApart: false,
  throwFirst: false,
};

/**
 * Shown on the variations screen and in the friends lobby, in this order.
 * `lesson`: its page in How to play. (Solo or 2 vs 2 is chosen on its own: see SidesPicker.)
 */
export const VARIATION_INFO: { id: Exclude<VariationId, "alone">; title: string; text: string; lesson: string }[] = [
  { id: "throwFirst", title: "Throw first, then move", text: "Keep throwing while you get 6, 10 or 25. Then use each throw to move.", lesson: "p-throw-first" },
  { id: "graceApart", title: "Bonus step", text: "A 6, 10 or 25 moves a piece that's already out, plus a bonus: one piece 1 square, or a new piece out.", lesson: "p-grace-apart" },
  { id: "twoGraces", title: "6 is a normal throw", text: "Only 10 and 25 bring a piece out and give another throw.", lesson: "p-two-graces" },
  { id: "sevenShells", title: "Seven shells", text: "Throw 7 cowries instead of 6. Big throws: 25, 35 and 14.", lesson: "p-seven" },
  { id: "graceHome", title: "Finish with a big throw", text: "Only a 6, 10 or 25 takes a piece into the center, from anywhere on its way in. No exact number needed.", lesson: "p-grace-home" },
  { id: "blockades", title: "Pairs block the way", text: "Two of your pieces on one square: nobody else can pass.", lesson: "p-blockades" },
  { id: "threeGraces", title: "No three in a row", text: "A third 6, 10 or 25 in a row doesn't count, and you miss your next turn.", lesson: "p-three-graces" },
];

/** Any value from storage or the network, as a full set of variations (unknown parts off; solo unless it says otherwise). */
export function cleanVariations(v: unknown): PachisiVariations {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out = { ...NO_VARIATIONS };
  for (const k of Object.keys(out) as VariationId[]) out[k] = k === "alone" ? o[k] !== false : o[k] === true;
  return out;
}

/** Do these players play as partners? Only four (2 vs 2) or two (a side each); three always play solo. */
export const playsInPairs = (v: PachisiVariations, players: number) => !v.alone && (players === 2 || players === 4);
