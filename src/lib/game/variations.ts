// Each game's variations, for the screens and the engine that work with any of
// them (setup, the friends lobby, the controller). The rules themselves read
// their own game's (pachisi/variations.ts, parchis/variations.ts, chaupar/variations.ts).
import { CHAUPAR_VARIATION_INFO, cleanChauparVariations, NO_CHAUPAR_VARIATIONS } from "./chaupar/variations";
import { cleanVariations, NO_VARIATIONS, VARIATION_INFO } from "./pachisi/variations";
import { cleanParchisVariations, NO_PARCHIS_VARIATIONS, PARCHIS_VARIATION_INFO } from "./parchis/variations";
import type { GameId } from "./types";

/** A game's variations: which are on. */
export type Variations = Record<string, boolean>;

/** The games with variations. */
export type VariedGame = "pachisi" | "parchis" | "chaupar";
export const VARIED_GAMES: VariedGame[] = ["pachisi", "parchis", "chaupar"];

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

const SETS: Record<VariedGame, VariationSet> = {
  pachisi: { none: NO_VARIATIONS, info: VARIATION_INFO, clean: cleanVariations, plain: "Traditional rules" },
  parchis: { none: NO_PARCHIS_VARIATIONS, info: PARCHIS_VARIATION_INFO, clean: cleanParchisVariations, plain: "Classic rules" },
  chaupar: { none: NO_CHAUPAR_VARIATIONS, info: CHAUPAR_VARIATION_INFO, clean: cleanChauparVariations, plain: "Standard rules" },
};

/** Does this game have variations? */
export const hasVariations = (g: GameId | undefined): g is VariedGame => !!g && g in SETS;
/**
 * Is Solo or 2 vs 2 picked for this game on its own (the `alone` variation, also
 * online, where a table only finds players who picked the same)?
 */
export const hasSides = (g: GameId | undefined): g is "pachisi" | "chaupar" => g === "pachisi" || g === "chaupar";
/** Do these variations say Solo (no partners)? Solo unless they say otherwise. */
export const playsSolo = (v: Variations | undefined) => v?.alone !== false;
/** The game's switches (none for a game without variations). */
export const variationInfo = (g: GameId | undefined): VariationInfo[] => (hasVariations(g) ? SETS[g].info : []);
/** Any value, as the game's full set of variations (unknown parts off). */
export const cleanFor = (g: GameId | undefined, v: unknown): Variations => (hasVariations(g) ? SETS[g].clean(v) : {});
export const noVariations = (g: GameId | undefined): Variations => ({ ...(hasVariations(g) ? SETS[g].none : {}) });
/** "Traditional rules" / "Classic rules" / "Standard rules". */
export const plainRules = (g: GameId | undefined) => (hasVariations(g) ? SETS[g].plain : "Standard rules");
/** How many of the listed switches are on. */
export const countOn = (g: GameId | undefined, v: Variations) => variationInfo(g).filter((x) => v[x.id]).length;
