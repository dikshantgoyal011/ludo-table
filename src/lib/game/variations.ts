// Each game's variations, for the screens and the engine that work with any of
// them (setup, the friends lobby, the controller). The rules themselves read
// their own game's (pachisi/variations.ts, parchis/variations.ts).
import { cleanVariations, NO_VARIATIONS, VARIATION_INFO } from "./pachisi/variations";
import { cleanParchisVariations, NO_PARCHIS_VARIATIONS, PARCHIS_VARIATION_INFO } from "./parchis/variations";
import type { GameId } from "./types";

/** A game's variations: which are on. */
export type Variations = Record<string, boolean>;

export interface VariationInfo {
  id: string;
  title: string;
  text: string;
  /** Its page in How to play. */
  lesson?: string;
}

interface VariationSet {
  none: Variations;
  /** The switches, in order. */
  info: VariationInfo[];
  clean(v: unknown): Variations;
  /** What playing with none on is called. */
  plain: string;
}

const SETS: Partial<Record<GameId, VariationSet>> = {
  pachisi: { none: NO_VARIATIONS, info: VARIATION_INFO, clean: cleanVariations, plain: "Traditional rules" },
  parchis: { none: NO_PARCHIS_VARIATIONS, info: PARCHIS_VARIATION_INFO, clean: cleanParchisVariations, plain: "Classic rules" },
};

/** Does this game have variations? */
export const hasVariations = (g: GameId | undefined): g is "pachisi" | "parchis" => !!g && !!SETS[g];
/** The game's switches (none for a game without variations). */
export const variationInfo = (g: GameId | undefined): VariationInfo[] => (g && SETS[g]?.info) || [];
/** Any value, as the game's full set of variations (unknown parts off). */
export const cleanFor = (g: GameId | undefined, v: unknown): Variations => (g && SETS[g]?.clean(v)) || {};
export const noVariations = (g: GameId | undefined): Variations => ({ ...((g && SETS[g]?.none) || {}) });
/** "Traditional rules" / "Classic rules". */
export const plainRules = (g: GameId | undefined) => (g && SETS[g]?.plain) || "Standard rules";
/** How many of the listed switches are on. */
export const countOn = (g: GameId | undefined, v: Variations) => variationInfo(g).filter((x) => v[x.id]).length;
