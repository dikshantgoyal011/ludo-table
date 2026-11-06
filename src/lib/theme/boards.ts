/**
 * Board designs. Each theme has its own (see Theme.boardStyle); Settings can
 * pick a different one. Piece colours always come from the theme so tokens
 * match the name tags.
 */
export type BoardStyleId = "modern" | "sandstone" | "royal" | "carved";
export type BoardChoice = BoardStyleId | "auto";

export const BOARD_STYLES: Record<BoardStyleId, { name: string; hint: string }> = {
  modern: { name: "Modern", hint: "Clean, flat and bright" },
  sandstone: { name: "Sandstone", hint: "Red sandstone, lotus and gold" },
  royal: { name: "Royal Darbar", hint: "Ivory and gold, palace arches" },
  carved: { name: "Carved wood", hint: "Hand-carved, inlaid wood" },
};

export const BOARD_STYLE_IDS = Object.keys(BOARD_STYLES) as BoardStyleId[];
export const isBoardChoice = (v: unknown): v is BoardChoice => v === "auto" || (typeof v === "string" && v in BOARD_STYLES);

/**
 * Pachisi board designs: the traditional embroidered cloth, and one to match each
 * Ludo board design (so a theme dresses Pachisi too). "auto" follows the theme.
 */
export type PachisiStyle = "cloth" | BoardStyleId;
export type PachisiChoice = PachisiStyle | "auto";
export const PACHISI_STYLES: Record<PachisiStyle, { name: string; hint: string }> = {
  cloth: { name: "Embroidered cloth", hint: "Crimson cloth, gold thread" },
  sandstone: { name: "Sandstone", hint: "Red sandstone and marble" },
  royal: { name: "Royal Darbar", hint: "Ivory and gold on emerald" },
  carved: { name: "Carved wood", hint: "Inlaid wooden board" },
  modern: { name: "Modern", hint: "Clean, in the theme's colors" },
};
export const PACHISI_STYLE_IDS = Object.keys(PACHISI_STYLES) as PachisiStyle[];
export const isPachisiChoice = (v: unknown): v is PachisiChoice => v === "auto" || (typeof v === "string" && v in PACHISI_STYLES);

/**
 * Parchís board designs: the classic Spanish board (white squares, bright
 * houses), and one to match each Ludo board design. "auto" follows the theme.
 */
export type ParchisStyle = "classic" | BoardStyleId;
export type ParchisChoice = ParchisStyle | "auto";
export const PARCHIS_STYLES: Record<ParchisStyle, { name: string; hint: string }> = {
  classic: { name: "Classic Spanish", hint: "White squares, bright houses" },
  sandstone: { name: "Sandstone", hint: "Red sandstone and ivory" },
  royal: { name: "Royal Darbar", hint: "Ivory and gold on emerald" },
  carved: { name: "Carved wood", hint: "Inlaid wooden board" },
  modern: { name: "Modern", hint: "Clean, in the theme's colors" },
};
export const PARCHIS_STYLE_IDS = Object.keys(PARCHIS_STYLES) as ParchisStyle[];
export const isParchisChoice = (v: unknown): v is ParchisChoice => v === "auto" || (typeof v === "string" && v in PARCHIS_STYLES);
