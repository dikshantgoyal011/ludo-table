// Pachisi variations: rules that differ from place to place (mastersofgames.com,
// "The rules of Pachisi", Variations). All off is the traditional game, which is
// also what online tables always play.

export interface PachisiVariations {
  /**
   * Everyone plays for themselves, no partners. (Traditionally four play as two
   * sides of partners, and two players each play both colours of a side. Three
   * players always play for themselves.)
   */
  alone: boolean;
  /** Seven cowries instead of six (0 up 7, 1 up 10, 5 up 25, 6 up 35, 7 up 14). */
  sevenShells: boolean;
  /** Only 10 and 25 are graces. */
  twoGraces: boolean;
  /** A piece can only finish in the Charkoni with a grace throw. */
  graceHome: boolean;
  /** Two or more pieces of one side on a square can't be passed by the other side. */
  blockades: boolean;
  /** Three graces in a row: the third throw doesn't count and the player misses their next turn. */
  threeGraces: boolean;
  /** A grace's amount only moves pieces already out; the grace itself is a separate move of one square, or a piece onto the first square. */
  graceApart: boolean;
  /** Throw first (again and again on graces), then move one piece for each throw. */
  throwFirst: boolean;
}

export type VariationId = keyof PachisiVariations;

export const NO_VARIATIONS: PachisiVariations = {
  alone: false,
  sevenShells: false,
  twoGraces: false,
  graceHome: false,
  blockades: false,
  threeGraces: false,
  graceApart: false,
  throwFirst: false,
};

/** Shown on the variations screen and in the friends lobby, in this order. (Partners or not is chosen on its own: see SidesPicker.) */
export const VARIATION_INFO: { id: Exclude<VariationId, "alone">; title: string; text: string }[] = [
  { id: "throwFirst", title: "Throw first, then move", text: "Keep throwing while you get graces. Then move one piece for each throw: one piece several times, or several pieces." },
  { id: "graceApart", title: "Grace played separately", text: "A 6, 10 or 25 only moves a piece that's already out. The grace is an extra move of its own: one piece one square, or a new piece onto the first square. (Your very first piece can still come out with any throw.)" },
  { id: "twoGraces", title: "Only 10 and 25 are graces", text: "A 6 is an ordinary throw: it doesn't bring a piece out or give another throw." },
  { id: "sevenShells", title: "Seven cowries", text: "None up 7, one up 10, 2 to 4 up as counted, five up 25, six up 35, all seven up 14. 10, 25 and 35 are graces; 7 and 14 give another throw." },
  { id: "graceHome", title: "Home only with a grace", text: "A piece can only finish in the Charkoni with a grace throw of exactly the right number." },
  { id: "blockades", title: "Pairs block the way", text: "Two or more pieces of one side on a square can't be passed by the other side." },
  { id: "threeGraces", title: "Three graces in a row", text: "The third grace in a row doesn't count, and that player misses their next turn." },
];

/** Any value from storage or the network, as a full set of variations (unknown parts off). */
export function cleanVariations(v: unknown): PachisiVariations {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out = { ...NO_VARIATIONS };
  for (const k of Object.keys(out) as VariationId[]) out[k] = o[k] === true;
  return out;
}

/** How many of the listed variations are on (partners or not doesn't count). */
export const variationCount = (v: PachisiVariations) => VARIATION_INFO.filter((x) => v[x.id]).length;

/** Do these players play as partners? Only four (two sides of two) or two (a side each); three always play alone. */
export const playsInPairs = (v: PachisiVariations, players: number) => !v.alone && (players === 2 || players === 4);

export const sameVariations = (a: PachisiVariations, b: PachisiVariations) => (Object.keys(a) as VariationId[]).every((k) => a[k] === b[k]);
