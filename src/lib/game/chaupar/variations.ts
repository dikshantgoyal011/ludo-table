// Chaupar has no variations: it's played by one set of rules (rules.ts). The
// only choice is Solo or 2 vs 2, which online tables match on too.

export type ChauparVariations = {
  /**
   * Solo: everyone plays for themselves, no partners (the default). Otherwise
   * four play 2 vs 2, partners opposite, and two players each play both colours
   * of a side. Three players always play solo.
   */
  alone: boolean;
};

export type ChauparVariationId = keyof ChauparVariations;

export const NO_CHAUPAR_VARIATIONS: ChauparVariations = { alone: true };

/** Shown on the variations screen and in the friends lobby: none (Solo or 2 vs 2 is chosen on its own: see SidesPicker). */
export const CHAUPAR_VARIATION_INFO: { id: Exclude<ChauparVariationId, "alone">; title: string; text: string; lesson: string }[] = [];

/** Any value from storage or the network, as a full set of variations (solo unless it says otherwise). */
export function cleanChauparVariations(v: unknown): ChauparVariations {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { alone: o.alone !== false };
}

/** Do these players play as partners? Only four (2 vs 2) or two (a side each); three always play solo. */
export const chauparPairs = (v: ChauparVariations, players: number) => !v.alone && (players === 2 || players === 4);
