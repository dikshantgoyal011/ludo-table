// Which rules a table plays by. Each game keeps its own rules in its own folder
// (ludo/, pachisi/, parchis/) behind the same Rulebook shape (types.ts); everything else
// asks rulesFor(state) and never checks which game it is. What all games share
// (seats, turns, missed turns, the log) is in table.ts.
import { ludo } from "./ludo/rules";
import { pachisi } from "./pachisi/rules";
import { parchis } from "./parchis/rules";
import type { Color, GameId, GameState, Rulebook } from "./types";

export * from "./table";

const RULEBOOKS: Record<GameId, Rulebook> = { ludo, pachisi, parchis };
/** The games that can be played (the rest of the home page's list is coming soon). */
export const GAME_IDS = Object.keys(RULEBOOKS) as GameId[];
export const isGameId = (v: unknown): v is GameId => typeof v === "string" && (GAME_IDS as string[]).includes(v);

/** The rules of the game played at this table (or of the game named). A table without a game is Ludo. */
export const rulesFor = (g: GameState | GameId | null | undefined): Rulebook =>
  RULEBOOKS[(typeof g === "string" ? g : g?.game) || "ludo"] || ludo;

/** Position of a token that is home. */
export const finishOf = (s: GameState) => rulesFor(s).finish;

/** c's tokens that can move with a roll of v. */
export const movable = (s: GameState, c: Color, v: number) => {
  const r = rulesFor(s);
  return s.tokens[c].map((_, i) => (r.moveChoices(s, c, i, v).length ? i : -1)).filter((i) => i >= 0);
};
