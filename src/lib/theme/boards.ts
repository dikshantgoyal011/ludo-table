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
