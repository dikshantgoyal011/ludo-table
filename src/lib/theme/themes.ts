import type { Color } from "@/lib/game/types";

export interface Theme {
  name: string;
  /** Page background (CSS background value) */
  bg: string;
  /** Browser UI colour (meta theme-color) */
  meta: string;
  scheme: "dark" | "light";
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

export type ThemeId = "classic" | "king" | "midnight" | "wood" | "candy";

export const THEMES: Record<ThemeId, Theme> = {
  classic: {
    name: "Classic felt",
    bg: "radial-gradient(900px 600px at 30% 10%, #143630, transparent 70%), #0f2a24",
    meta: "#0f2a24",
    scheme: "dark",
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
  king: {
    name: "Ludo King",
    bg: "radial-gradient(900px 700px at 50% 0%, #3d4fd1, transparent 70%), linear-gradient(170deg, #2a1f8f 0%, #16247a 55%, #0b154f 100%)",
    meta: "#16247a",
    scheme: "dark",
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
    bg: "radial-gradient(900px 600px at 70% 0%, #1d2a52, transparent 70%), #0a0f1f",
    meta: "#0a0f1f",
    scheme: "dark",
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
    bg: "radial-gradient(900px 600px at 30% 10%, #5a3720, transparent 70%), #2b1a10",
    meta: "#2b1a10",
    scheme: "dark",
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
    bg: "linear-gradient(160deg, #ffe3f1 0%, #ece6ff 55%, #dff3ff 100%)",
    meta: "#ffe3f1",
    scheme: "light",
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
export const isThemeId = (v: unknown): v is ThemeId => typeof v === "string" && v in THEMES;
export const themeOf = (id: string) => THEMES[id as ThemeId] || THEMES.classic;
