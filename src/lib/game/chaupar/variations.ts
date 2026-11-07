// Chaupar variations: the game is played a little differently from place to
// place (mastersofgames.com, "Chaupar": the long dice marked 3 and 4, and "A
// Chaupar variation from Haryana": capturing before going home, super-pieces
// moving with doubles, partners moving each other's pieces). All off is the
// standard game, which is also what online tables play (Solo or 2 vs 2, as
// each player picks).

export type ChauparVariations = {
  /**
   * Solo: everyone plays for themselves, no partners (the default). Otherwise
   * four play 2 vs 2, partners opposite, and two players each play both colours
   * of a side. Three players always play solo.
   */
  alone: boolean;
  /** Long dice marked 1, 3, 4 and 6 (3 opposite 4) instead of 1, 2, 5 and 6. */
  threeFour: boolean;
  /** Haryana: a side has to capture a rival piece before any of its pieces can go home; until then they go round again. */
  captureFirst: boolean;
  /**
   * Haryana: when two dice match, a super-piece that can move by both together
   * must (6, 6 and 2: it moves 12), and a single piece then takes the third dice.
   */
  pairMoves: boolean;
  /** Haryana: in 2 vs 2, either partner can move any of the side's eight pieces. */
  sharePieces: boolean;
};

export type ChauparVariationId = keyof ChauparVariations;

export const NO_CHAUPAR_VARIATIONS: ChauparVariations = { alone: true, threeFour: false, captureFirst: false, pairMoves: false, sharePieces: false };

/**
 * Shown on the variations screen and in the friends lobby, in this order.
 * `lesson`: its page in How to play. (Solo or 2 vs 2 is chosen on its own: see SidesPicker.)
 */
export const CHAUPAR_VARIATION_INFO: { id: Exclude<ChauparVariationId, "alone">; title: string; text: string; lesson: string }[] = [
  { id: "threeFour", title: "Dice with 3 and 4", text: "The long dice show 1, 3, 4 and 6 instead of 1, 2, 5 and 6.", lesson: "c-three-four" },
  { id: "captureFirst", title: "Capture before going home", text: "Your pieces can't go home until you've captured a rival piece. Until then, they go round again.", lesson: "c-capture-first" },
  { id: "pairMoves", title: "Doubles move super-pieces", text: "When two dice match, a super-piece moves by both together: 6, 6 and 2 moves it 12. A single piece then moves the third dice.", lesson: "c-pairs" },
  { id: "sharePieces", title: "Move your partner's pieces", text: "In 2 vs 2, you can move any of your team's eight pieces.", lesson: "c-share" },
];

/** Any value from storage or the network, as a full set of variations (unknown parts off; solo unless it says otherwise). */
export function cleanChauparVariations(v: unknown): ChauparVariations {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out = { ...NO_CHAUPAR_VARIATIONS };
  for (const k of Object.keys(out) as ChauparVariationId[]) out[k] = k === "alone" ? o[k] !== false : o[k] === true;
  return out;
}

/** Do these players play as partners? Only four (2 vs 2) or two (a side each); three always play solo. */
export const chauparPairs = (v: ChauparVariations, players: number) => !v.alone && (players === 2 || players === 4);
