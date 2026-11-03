import type { CSSProperties, ReactNode } from "react";

/**
 * How one game's board looks, for the shared board (board.tsx): each game draws
 * its own surface, frame and tokens (ludo-board.tsx, pachisi-board.tsx), and
 * the shared board adds the moving tokens, ripples and taps on top.
 */
export interface BoardLook {
  /** Board units across (the SVG viewBox). */
  size: number;
  /** For screen readers. */
  label: string;
  /** The frame around the board. */
  frame: CSSProperties;
  frameClass: string;
  /** Ornaments on the frame. */
  corners?: ReactNode;
  /** The printed board, drawn once below the tokens. */
  surface: ReactNode;
  /** One token, in a slot's colour (`lying`: Pachisi, laid on its side). */
  token: (fill: string, lying?: boolean) => ReactNode;
  /** Are the squares light (ripples are then drawn dark)? */
  lightSquares: boolean;
}

/** Is this "#rrggbb" colour light (perceived brightness over half)? */
export function isLight(hex: string) {
  const n = parseInt(hex.slice(1, 7), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 128;
}

export const svgId = (raw: string) => "b" + raw.replace(/[^a-zA-Z0-9]/g, "");
