import type { Color } from "@/lib/game/types";
import type { BoardStyleId } from "./boards";

/** How the "Ludo Darbar" title is lettered in a theme (CSS variables --brand-*). */
export interface BrandStyle {
  /** "serif": the royal Rozha One; "round": the friendly Baloo 2 used across the app */
  font: "serif" | "round";
  /** Fill of the letters (a CSS background, clipped to the text) */
  fill: string;
  /** CSS filter for depth/glow so the title stands out on the theme's background */
  shadow: string;
}

export interface Theme {
  name: string;
  /** Page background (CSS background value) */
  bg: string;
  /** Browser UI colour (meta theme-color) */
  meta: string;
  scheme: "dark" | "light";
  /** The board design this theme uses unless Settings picks another */
  boardStyle: BoardStyleId;
  /** The "Ludo Darbar" title */
  brand: BrandStyle;
  /** UI colours as "r g b" triplets, exposed as CSS variables --c-NAME */
  vars: Record<"felt" | "felt2" | "panel" | "line" | "ink" | "muted" | "paper" | "gold", string>;
  frame: string;
  frameEdge: string;
  board: string;
  track: string;
  stroke: string;
  star: string;
  pip: string;
  pieces: Record<Color, string>;
  light: Record<Color, string>;
}

/** ("king" is kept as the id of Sapphire so saved settings carry over.) */
export type ThemeId = "maharaja" | "darbar" | "classic" | "king" | "midnight" | "wood" | "candy";

export const THEMES: Record<ThemeId, Theme> = {
  // A royal Indian court: crimson, saffron and gold.
  maharaja: {
    name: "Maharaja",
    boardStyle: "sandstone",
    bg: "radial-gradient(900px 620px at 50% 0%, #8e1d2c, transparent 70%), linear-gradient(170deg, #64101e 0%, #3c0814 60%, #23040b 100%)",
    meta: "#3c0814",
    scheme: "dark",
    brand: {
      font: "serif",
      fill: "linear-gradient(180deg, #fff3c4 0%, #ffc85a 42%, #e8862a 72%, #ffd98f 100%)",
      shadow: "drop-shadow(0 1px 0 rgba(70, 12, 4, 0.95)) drop-shadow(0 3px 6px rgba(0, 0, 0, 0.4))",
    },
    vars: { felt: "60 8 20", felt2: "86 15 32", panel: "102 22 40", line: "160 104 46", ink: "255 243 224", muted: "236 200 166", paper: "255 246 230", gold: "246 172 58" },
    frame: "linear-gradient(145deg, #c4553a, #8f2f1f 45%, #b44a30 70%, #6e2316)",
    frameEdge: "#f2c46a",
    board: "#fbf1dc",
    track: "#fffaf0",
    stroke: "#8a5a26",
    star: "#e0a640",
    pip: "#2a1206",
    pieces: { red: "#d42a2a", green: "#1f8a4c", yellow: "#f2b01e", blue: "#2458c8" },
    light: { red: "#f6c9c4", green: "#c2e4cd", yellow: "#fae4a6", blue: "#c6d4f2" },
  },
  // A Mughal-style court: emerald, gold and domes.
  darbar: {
    name: "Royal Darbar",
    boardStyle: "royal",
    bg: "radial-gradient(900px 620px at 50% 0%, #135c41, transparent 70%), linear-gradient(170deg, #0b3d2c 0%, #072a1e 60%, #041a12 100%)",
    meta: "#072a1e",
    scheme: "dark",
    brand: {
      font: "serif",
      fill: "linear-gradient(180deg, #fff1b8 0%, #f0c55a 45%, #c38a22 70%, #f4d27a 100%)",
      shadow: "drop-shadow(0 1px 0 rgba(60, 36, 4, 0.9)) drop-shadow(0 3px 6px rgba(0, 0, 0, 0.35))",
    },
    vars: { felt: "7 42 30", felt2: "12 61 44", panel: "15 72 52", line: "120 98 46", ink: "250 242 218", muted: "200 190 152", paper: "250 243 222", gold: "232 184 74" },
    frame: "linear-gradient(145deg, #f6d985, #c8962e 40%, #8a5d14 75%, #e2b552)",
    frameEdge: "#fbe3a0",
    board: "#f8f0da",
    track: "#fffaf0",
    stroke: "#6a5226",
    star: "#cfae5e",
    pip: "#2a1d0c",
    pieces: { red: "#c8262b", green: "#16894a", yellow: "#e9a912", blue: "#1f5fcc" },
    light: { red: "#f3c6c3", green: "#bfe3cc", yellow: "#f8e3a6", blue: "#c4d4f3" },
  },
  classic: {
    name: "Classic felt",
    boardStyle: "modern",
    bg: "radial-gradient(900px 600px at 30% 10%, #143630, transparent 70%), #0f2a24",
    meta: "#0f2a24",
    scheme: "dark",
    brand: {
      font: "round",
      fill: "linear-gradient(180deg, #fffbe9 0%, #f7e3a0 55%, #e9c45c 100%)",
      shadow: "drop-shadow(0 2px 0 rgba(0, 0, 0, 0.35)) drop-shadow(0 3px 8px rgba(0, 0, 0, 0.3))",
    },
    vars: { felt: "15 42 36", felt2: "20 54 48", panel: "26 63 56", line: "44 90 81", ink: "243 239 226", muted: "169 195 186", paper: "247 242 227", gold: "242 201 76" },
    frame: "#3b2a1c",
    frameEdge: "#5a4029",
    board: "#f7f2e3",
    track: "#fffdf6",
    stroke: "#23302c",
    star: "#9aa59f",
    pip: "#23302c",
    pieces: { red: "#d8382e", green: "#1d9a52", yellow: "#efb20a", blue: "#2563d4" },
    light: { red: "#f4c7c3", green: "#bfe6cd", yellow: "#fbe7a8", blue: "#c3d4f6" },
  },
  // Bright royal blue with a golden board.
  king: {
    name: "Sapphire",
    boardStyle: "modern",
    bg: "radial-gradient(900px 700px at 50% 0%, #3d4fd1, transparent 70%), linear-gradient(170deg, #2a1f8f 0%, #16247a 55%, #0b154f 100%)",
    meta: "#16247a",
    scheme: "dark",
    brand: {
      font: "round",
      fill: "linear-gradient(180deg, #fffbe0 0%, #ffd84a 45%, #ffa400 100%)",
      shadow: "drop-shadow(0 2px 0 #0b154f) drop-shadow(0 4px 8px rgba(5, 10, 50, 0.55))",
    },
    vars: { felt: "13 22 82", felt2: "31 45 150", panel: "36 52 168", line: "86 108 220", ink: "255 255 255", muted: "196 205 250", paper: "255 255 255", gold: "255 196 0" },
    frame: "linear-gradient(145deg, #ffd54f, #f5a400 55%, #c77800)",
    frameEdge: "#ffe082",
    board: "#ffffff",
    track: "#ffffff",
    stroke: "#5b5b6b",
    star: "#b8bccb",
    pip: "#1a1a2e",
    pieces: { red: "#e8262d", green: "#1fa64a", yellow: "#ffcc00", blue: "#1e7be6" },
    light: { red: "#ffd2d3", green: "#c9f0d5", yellow: "#fff3b0", blue: "#cfe3ff" },
  },
  midnight: {
    name: "Midnight",
    boardStyle: "modern",
    bg: "radial-gradient(900px 600px at 70% 0%, #1d2a52, transparent 70%), #0a0f1f",
    meta: "#0a0f1f",
    scheme: "dark",
    brand: {
      font: "round",
      fill: "linear-gradient(180deg, #ffffff 0%, #c9ecff 45%, #7dd3fc 100%)",
      shadow: "drop-shadow(0 0 10px rgba(125, 211, 252, 0.45)) drop-shadow(0 2px 0 rgba(0, 0, 0, 0.5))",
    },
    vars: { felt: "10 15 31", felt2: "20 28 54", panel: "24 33 64", line: "52 64 108", ink: "232 238 255", muted: "150 163 204", paper: "236 241 255", gold: "125 211 252" },
    frame: "#141c38",
    frameEdge: "#34416e",
    board: "#e6ebf7",
    track: "#f6f8ff",
    stroke: "#283252",
    star: "#8a95b8",
    pip: "#1e2742",
    pieces: { red: "#f0454f", green: "#22c55e", yellow: "#eab308", blue: "#3b82f6" },
    light: { red: "#fbd0d3", green: "#c4f0d4", yellow: "#f7e8b0", blue: "#cddffd" },
  },
  wood: {
    name: "Wooden",
    boardStyle: "carved",
    bg: "radial-gradient(900px 600px at 30% 10%, #5a3720, transparent 70%), #2b1a10",
    meta: "#2b1a10",
    scheme: "dark",
    brand: {
      font: "serif",
      fill: "linear-gradient(180deg, #fff0d2 0%, #f0c27a 45%, #c8843a 75%, #f2cf92 100%)",
      shadow: "drop-shadow(0 1px 0 rgba(40, 20, 6, 0.95)) drop-shadow(0 3px 6px rgba(0, 0, 0, 0.4))",
    },
    vars: { felt: "43 26 16", felt2: "62 39 24", panel: "76 48 30", line: "116 80 52", ink: "251 241 226", muted: "217 192 162", paper: "250 240 220", gold: "234 174 84" },
    frame: "linear-gradient(145deg, #8a5430, #5e3518)",
    frameEdge: "#a8703f",
    board: "#f2e1bf",
    track: "#fbf0da",
    stroke: "#4a2e1c",
    star: "#b39773",
    pip: "#3b2414",
    pieces: { red: "#b93a2b", green: "#3d7d38", yellow: "#d9a326", blue: "#2e5d9d" },
    light: { red: "#efc9bf", green: "#cfe2c4", yellow: "#f3e1ad", blue: "#c6d5ea" },
  },
  candy: {
    name: "Candy",
    boardStyle: "modern",
    bg: "linear-gradient(160deg, #ffe3f1 0%, #ece6ff 55%, #dff3ff 100%)",
    meta: "#ffe3f1",
    scheme: "light",
    brand: {
      font: "round",
      fill: "linear-gradient(180deg, #a03ab8 0%, #e0367e 100%)",
      shadow: "drop-shadow(0 2px 0 rgba(255, 255, 255, 0.9)) drop-shadow(0 3px 6px rgba(160, 58, 184, 0.25))",
    },
    vars: { felt: "255 244 250", felt2: "252 232 244", panel: "255 255 255", line: "238 202 226", ink: "67 34 78", muted: "132 101 142", paper: "255 255 255", gold: "255 120 186" },
    frame: "linear-gradient(145deg, #ff9bd0, #c59cff)",
    frameEdge: "#ffd0ea",
    board: "#ffffff",
    track: "#ffffff",
    stroke: "#a77b9c",
    star: "#e3b6d4",
    pip: "#4a2a55",
    pieces: { red: "#ff5577", green: "#2fc486", yellow: "#ffbf2e", blue: "#5a87ff" },
    light: { red: "#ffd6df", green: "#c9f3e0", yellow: "#ffeec2", blue: "#d7e2ff" },
  },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];
export const DEFAULT_THEME: ThemeId = "maharaja";
export const isThemeId = (v: unknown): v is ThemeId => typeof v === "string" && v in THEMES;
export const themeOf = (id: string) => THEMES[id as ThemeId] || THEMES[DEFAULT_THEME];

/** CSS variables for the title lettering (set on <html> with the theme's colours). */
export function brandVars(b: BrandStyle): Record<string, string> {
  return {
    "--brand-font": b.font === "serif" ? "var(--font-brand)" : "var(--font-display)",
    "--brand-weight": b.font === "serif" ? "400" : "800",
    "--brand-fill": b.fill,
    "--brand-shadow": b.shadow,
  };
}
