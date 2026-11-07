"use client";

import { memo, useId, useMemo } from "react";
import { useSettings } from "@/hooks/use-game";
import { COLORS } from "@/lib/game/constants";
import { CASA, PASILLO, SALIDA, SEGUROS, squareCell, X_SIZE, X_TRACK } from "@/lib/game/parchis/board";
import type { Color } from "@/lib/game/types";
import type { BoardStyleId, ParchisStyle } from "@/lib/theme/boards";
import { themeOf, type Theme } from "@/lib/theme/themes";
import { cn } from "@/lib/utils";
import { isLight, svgId, type BoardLook } from "./board-look";
import { FrameCorners, frameStyle, TokenArt, TokenShadow } from "./ludo-board";

// The Parchís board: a cross of 3 x 8 squares per arm, the four houses in the
// corners and the metas in the middle, the 68 squares numbered as on a Spanish
// board. Each design dresses it its own way (see SKINS), and each has night
// colours for the Dark theme. Only Parchís uses this file.

/** The Parchís board design in use: the one picked in Settings, or the one matching the theme. */
export function useParchisStyle(): [ParchisStyle, Theme] {
  const [settings] = useSettings();
  const th = themeOf(settings.theme);
  return [settings.parchisBoard === "auto" ? th.parchisStyle : settings.parchisBoard, th];
}

interface Look {
  style: ParchisStyle;
  night: boolean;
  th: Theme;
  /** The tokens' design (the Ludo tokens of the matching board) */
  token: BoardStyleId;
  frame: React.CSSProperties;
  corners?: "rosette" | "lotus";
  /** Are the squares light (ripples are then drawn dark)? */
  light: boolean;
}

export function parchisLook(style: ParchisStyle, th: Theme): Look {
  const night = !!th.night;
  const frame: React.CSSProperties =
    style === "classic"
      ? night
        ? { background: "linear-gradient(145deg, #2a2b30 0%, #16171a 100%)", boxShadow: "0 14px 30px rgba(0,0,0,.55), inset 0 0 0 1.5px #4a4d55, inset 0 0 0 4px #0b0c0e" }
        : { background: "linear-gradient(145deg, #7a4a26 0%, #4e2c14 50%, #6a3e1e 100%)", boxShadow: "0 14px 30px rgba(0,0,0,.45), inset 0 0 0 1.5px #b07a48, inset 0 0 0 4px #33190a" }
      : frameStyle(style, th);
  return {
    style,
    night,
    th,
    token: style === "classic" ? "modern" : style,
    frame,
    corners: night ? undefined : style === "royal" ? "rosette" : style === "sandstone" ? "lotus" : undefined,
    light: !night && (style !== "modern" || isLight(th.track)),
  };
}

/** Outline of the cross. */
const CROSS = "M8 0h3v8h8v3h-8v8H8v-8H0V8h8z";
/** The metas in the middle: each colour's triangle, by its pasillo. */
const META: Record<Color, string> = { yellow: "8,11 11,11 9.5,9.5", green: "11,8 11,11 9.5,9.5", red: "8,8 11,8 9.5,9.5", blue: "8,8 8,11 9.5,9.5" };
const SALIDA_OF = new Map(COLORS.map((c) => [SALIDA[c], c]));

function star8(cx: number, cy: number, r: number, inner = 0.55) {
  return Array.from({ length: 16 }, (_, k) => {
    const a = -Math.PI / 2 + (k * Math.PI) / 8;
    const rr = k % 2 ? r * inner : r;
    return `${(cx + rr * Math.cos(a)).toFixed(3)},${(cy + rr * Math.sin(a)).toFixed(3)}`;
  }).join(" ");
}

/** What one design draws for each part of the board. */
interface Skin {
  defs?: React.ReactNode;
  /** Behind everything */
  field: React.ReactNode;
  house: (c: Color, r0: number, c0: number) => React.ReactNode;
  /** A square round the board: `salida` its colour if it's one's salida; `safe` a seguro. */
  square: (n: number, r: number, c: number, salida: Color | undefined, safe: boolean) => React.ReactNode;
  pasillo: (c: Color, r: number, cc: number, k: number) => React.ReactNode;
  centre: React.ReactNode;
  edge: React.ReactNode;
  /** The square numbers' colour (salidas: white). */
  number: string;
}

type Paint = { hex: (c: Color) => string; light: (c: Color) => string; url: (n: string) => string; id: (n: string) => string };

const num = (n: number, r: number, c: number, fill: string, opacity = 0.75) => (
  <text x={c + 0.5} y={r + 0.6} fontSize={0.3} fontWeight={700} textAnchor="middle" fill={fill} fillOpacity={opacity} style={{ fontFamily: "var(--font-display)" }}>
    {n}
  </text>
);

/** Classic Spanish: white squares, grey seguros with a ring, solid bright houses with a white circle, black lines. */
function classicSkin(night: boolean, { hex, light }: Paint): Skin {
  const P = night
    ? { field: "#1a1b1f", cell: "#26282d", seguro: "#3a3d44", line: "#5a5e66", ring: "#c9ccd2", text: "#9aa0a8" }
    : { field: "#f3ecdc", cell: "#ffffff", seguro: "#d5d9de", line: "#2b2b2b", ring: "#2b2b2b", text: "#6b6b6b" };
  return {
    field: <rect width={X_SIZE} height={X_SIZE} fill={P.field} />,
    house: (c, r0, c0) => (
      <g>
        <rect x={c0 + 0.2} y={r0 + 0.2} width={7.6} height={7.6} rx={0.5} fill={hex(c)} fillOpacity={night ? 0.75 : 1} stroke={P.line} strokeWidth={0.08} />
        <circle cx={c0 + 4} cy={r0 + 4} r={2.85} fill={night ? light(c) : "#ffffff"} stroke={P.line} strokeWidth={0.08} />
      </g>
    ),
    square: (n, r, c, salida, safe) => (
      <g>
        <rect x={c} y={r} width={1} height={1} fill={salida ? hex(salida) : safe ? P.seguro : P.cell} stroke={P.line} strokeWidth={0.04} />
        {safe && <circle cx={c + 0.5} cy={r + 0.5} r={0.32} fill="none" stroke={salida ? "#fff" : P.ring} strokeOpacity={0.7} strokeWidth={0.05} />}
      </g>
    ),
    pasillo: (c, r, cc) => <rect x={cc} y={r} width={1} height={1} fill={hex(c)} fillOpacity={night ? 0.7 : 0.9} stroke={P.line} strokeWidth={0.04} />,
    centre: (
      <>
        {COLORS.map((c) => (
          <polygon key={c} points={META[c]} fill={hex(c)} stroke={P.line} strokeWidth={0.05} />
        ))}
      </>
    ),
    edge: <path d={CROSS} fill="none" stroke={P.line} strokeWidth={0.1} strokeLinejoin="round" />,
    number: P.text,
  };
}

/**
 * Sandstone: a red sandstone board, ivory squares with sandstone lines, each
 * house a carved panel with a lotus, the sun on the seguros. Night: dark sandstone.
 */
function sandstoneSkin(night: boolean, { hex, light, url, id }: Paint): Skin {
  const P = night
    ? { stone: ["#4a2016", "#2a120b"], cell: "#2e1710", line: "#6a4528", gold: "#c98a3a", text: "#b08860", panel: "#3a1c12" }
    : { stone: ["#c25a3e", "#8e3220"], cell: "#fff6e6", line: "#b07a4a", gold: "#e8a940", text: "#9a6a3a", panel: "#f6e2c0" };
  const lotus = (cx: number, cy: number, r: number, fill: string, stroke: string) =>
    Array.from({ length: 8 }, (_, k) => {
      const w = r * 0.42;
      return <path key={k} d={`M${cx} ${cy}Q${cx + w} ${cy - r * 0.55} ${cx} ${cy - r}Q${cx - w} ${cy - r * 0.55} ${cx} ${cy}Z`} fill={fill} stroke={stroke} strokeWidth={0.05} transform={`rotate(${k * 45} ${cx} ${cy})`} />;
    });
  return {
    defs: (
      <>
        <linearGradient id={id("stone")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={P.stone[0]} />
          <stop offset="1" stopColor={P.stone[1]} />
        </linearGradient>
        <pattern id={id("grit")} width="0.6" height="0.6" patternUnits="userSpaceOnUse">
          <circle cx=".12" cy=".2" r=".025" fill="#000" fillOpacity=".15" />
          <circle cx=".42" cy=".46" r=".02" fill="#fff" fillOpacity=".15" />
        </pattern>
      </>
    ),
    field: (
      <>
        <rect width={X_SIZE} height={X_SIZE} fill={url("stone")} />
        <rect width={X_SIZE} height={X_SIZE} fill={url("grit")} />
      </>
    ),
    house: (c, r0, c0) => (
      <g>
        <rect x={c0 + 0.35} y={r0 + 0.35} width={7.3} height={7.3} rx={0.4} fill={hex(c)} fillOpacity={night ? 0.6 : 0.85} stroke={P.gold} strokeWidth={0.1} />
        <rect x={c0 + 0.35} y={r0 + 0.35} width={7.3} height={7.3} rx={0.4} fill={url("grit")} />
        <rect x={c0 + 0.8} y={r0 + 0.8} width={6.4} height={6.4} rx={0.3} fill="none" stroke={P.gold} strokeOpacity={0.6} strokeWidth={0.05} />
        <circle cx={c0 + 4} cy={r0 + 4} r={2.7} fill={P.panel} fillOpacity={night ? 1 : 0.92} stroke={P.gold} strokeWidth={0.1} />
        {lotus(c0 + 4, r0 + 4, 2.3, light(c), hex(c))}
        <circle cx={c0 + 4} cy={r0 + 4} r={0.35} fill={P.gold} />
      </g>
    ),
    square: (n, r, c, salida, safe) => (
      <g>
        <rect x={c} y={r} width={1} height={1} fill={salida ? hex(salida) : P.cell} stroke={P.line} strokeWidth={0.045} />
        {safe &&
          Array.from({ length: 8 }, (_, k) => {
            const a = (k * Math.PI) / 4;
            return <line key={k} x1={c + 0.5 + Math.cos(a) * 0.24} y1={r + 0.5 + Math.sin(a) * 0.24} x2={c + 0.5 + Math.cos(a) * 0.4} y2={r + 0.5 + Math.sin(a) * 0.4} stroke={salida ? "#fff" : P.gold} strokeWidth={0.06} strokeLinecap="round" />;
          })}
      </g>
    ),
    pasillo: (c, r, cc) => <rect x={cc} y={r} width={1} height={1} fill={hex(c)} fillOpacity={night ? 0.65 : 0.85} stroke={P.line} strokeWidth={0.045} />,
    centre: (
      <>
        {COLORS.map((c) => (
          <polygon key={c} points={META[c]} fill={hex(c)} />
        ))}
        <path d="M8 8l3 3M11 8l-3 3" stroke={P.gold} strokeWidth={0.06} />
        <g>{lotus(9.5, 9.5, 0.8, P.panel, P.gold)}</g>
      </>
    ),
    edge: (
      <>
        <path d={CROSS} fill="none" stroke={P.gold} strokeWidth={0.14} strokeLinejoin="round" />
        <rect x={8} y={8} width={3} height={3} fill="none" stroke={P.gold} strokeWidth={0.08} />
      </>
    ),
    number: P.text,
  };
}

/**
 * Royal Darbar: an emerald board edged in gold, ivory squares framed in gold,
 * each house a jewel-coloured panel with gold lattice (jaali) under a palace
 * arch, gold stars on the seguros. Night: black onyx and gold.
 */
function royalSkin(night: boolean, { hex, light, url, id }: Paint): Skin {
  const P = night
    ? { field: ["#0d1f19", "#08120e"], cell: "#221f27", line: "#7a5e26", dark: "#0b0a0d", text: "#a88a50", arch: "#2a2730" }
    : { field: ["#13563f", "#0a3526"], cell: "#fffaf0", line: "#c49a42", dark: "#6b4a16", text: "#8a6a2a", arch: "#fdf6e3" };
  const arch = (x0: number, y0: number) => {
    const l = x0 + 1.4, r = x0 + 6.6, b = y0 + 6.6, s = y0 + 2.8, m = x0 + 4;
    return `M${l} ${b}V${s}C${l} ${y0 + 1.6} ${m - 1} ${y0 + 1.6} ${m} ${y0 + 0.9}C${m + 1} ${y0 + 1.6} ${r} ${y0 + 1.6} ${r} ${s}V${b}Z`;
  };
  return {
    defs: (
      <>
        <linearGradient id={id("field")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={P.field[0]} />
          <stop offset="1" stopColor={P.field[1]} />
        </linearGradient>
        <linearGradient id={id("gold")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff0b0" />
          <stop offset=".4" stopColor="#e2b048" />
          <stop offset=".75" stopColor="#a8741c" />
          <stop offset="1" stopColor="#f0cf72" />
        </linearGradient>
        <pattern id={id("jaali")} width="0.8" height="0.8" patternUnits="userSpaceOnUse">
          <path d="M.4 0L.8 .4L.4 .8L0 .4Z" fill="none" stroke="#fff" strokeOpacity=".25" strokeWidth=".04" />
        </pattern>
      </>
    ),
    field: <rect width={X_SIZE} height={X_SIZE} fill={url("field")} />,
    house: (c, r0, c0) => (
      <g>
        <rect x={c0 + 0.3} y={r0 + 0.3} width={7.4} height={7.4} rx={0.3} fill={hex(c)} fillOpacity={night ? 0.7 : 1} />
        <rect x={c0 + 0.3} y={r0 + 0.3} width={7.4} height={7.4} rx={0.3} fill={url("jaali")} />
        <rect x={c0 + 0.3} y={r0 + 0.3} width={7.4} height={7.4} rx={0.3} fill="none" stroke={url("gold")} strokeWidth={0.12} />
        <path d={arch(c0, r0)} fill={P.arch} stroke={P.dark} strokeWidth={0.18} />
        <path d={arch(c0, r0)} fill="none" stroke={url("gold")} strokeWidth={0.1} />
        <path d={arch(c0, r0)} fill={light(c)} fillOpacity={night ? 0.5 : 0.35} />
        <circle cx={c0 + 4} cy={r0 + 0.75} r={0.2} fill={url("gold")} stroke={P.dark} strokeWidth={0.03} />
      </g>
    ),
    square: (n, r, c, salida, safe) => (
      <g>
        <rect x={c} y={r} width={1} height={1} fill={salida ? hex(salida) : P.cell} stroke={P.line} strokeOpacity={0.7} strokeWidth={0.035} />
        <rect x={c + 0.07} y={r + 0.07} width={0.86} height={0.86} fill="none" stroke={url("gold")} strokeOpacity={0.8} strokeWidth={0.03} />
        {safe && <polygon points={star8(c + 0.5, r + 0.5, 0.38)} fill={salida ? P.cell : url("gold")} fillOpacity={0.9} stroke={P.dark} strokeWidth={0.025} />}
      </g>
    ),
    pasillo: (c, r, cc) => (
      <g>
        <rect x={cc} y={r} width={1} height={1} fill={hex(c)} fillOpacity={night ? 0.75 : 1} stroke={P.line} strokeWidth={0.035} />
        <rect x={cc + 0.07} y={r + 0.07} width={0.86} height={0.86} fill="none" stroke={url("gold")} strokeWidth={0.03} />
      </g>
    ),
    centre: (
      <>
        {COLORS.map((c) => (
          <polygon key={c} points={META[c]} fill={hex(c)} />
        ))}
        <path d="M8 8l3 3M11 8l-3 3" stroke={url("gold")} strokeWidth={0.07} />
        <circle cx={9.5} cy={9.5} r={0.5} fill={url("gold")} stroke={P.dark} strokeWidth={0.04} />
        <polygon points={star8(9.5, 9.5, 0.34)} fill={P.arch} stroke={P.dark} strokeWidth={0.025} />
      </>
    ),
    edge: (
      <>
        <path d={CROSS} fill="none" stroke={url("gold")} strokeWidth={0.18} strokeLinejoin="round" />
        <rect x={8} y={8} width={3} height={3} fill="none" stroke={url("gold")} strokeWidth={0.1} />
        <rect x={0.08} y={0.08} width={18.84} height={18.84} fill="none" stroke={url("gold")} strokeWidth={0.14} />
      </>
    ),
    number: P.text,
  };
}

/**
 * Carved wood: one board of polished wood with the squares cut in as grooves,
 * the numbers burnt in, each house stained in its colour with four carved cups,
 * brass rosettes on the seguros. Night: ebony.
 */
function carvedSkin(night: boolean, { hex, url, id }: Paint): Skin {
  const P = night
    ? { wood: ["#3b2a1f", "#22170f", "#33251a"], grain: "#d9b07a", groove: "#0c0705", lip: "#6a4a30", brass: "#b8923e", text: "#c9a06a" }
    : { wood: ["#e3b87e", "#c48a4c", "#dba468"], grain: "#6a3a14", groove: "#4a2810", lip: "#f6dcae", brass: "#e8c25a", text: "#5a3418" };
  const cups: [number, number][] = [[2.65, 2.65], [5.35, 2.65], [2.65, 5.35], [5.35, 5.35]];
  return {
    defs: (
      <>
        <linearGradient id={id("wood")} x1="0" y1="0" x2="1" y2=".35">
          <stop offset="0" stopColor={P.wood[0]} />
          <stop offset=".5" stopColor={P.wood[1]} />
          <stop offset="1" stopColor={P.wood[2]} />
        </linearGradient>
        <pattern id={id("grain")} width="19" height="1.3" patternUnits="userSpaceOnUse">
          <path d="M0 .35C3 .1 6 .6 9.5 .35S16 .1 19 .35M0 .95C4 .8 7 1.15 11 .9S16 .75 19 .95" fill="none" stroke={P.grain} strokeOpacity={night ? 0.16 : 0.28} strokeWidth=".05" />
        </pattern>
        <radialGradient id={id("cup")} cx="50%" cy="38%" r="60%">
          <stop offset="0" stopColor="#000" stopOpacity=".55" />
          <stop offset=".75" stopColor="#000" stopOpacity=".2" />
          <stop offset="1" stopColor="#fff" stopOpacity=".25" />
        </radialGradient>
        <radialGradient id={id("brass")} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#fff2b8" />
          <stop offset=".5" stopColor={P.brass} />
          <stop offset="1" stopColor="#7a5414" />
        </radialGradient>
      </>
    ),
    field: (
      <>
        <rect width={X_SIZE} height={X_SIZE} fill={url("wood")} />
        <rect width={X_SIZE} height={X_SIZE} fill={url("grain")} />
      </>
    ),
    house: (c, r0, c0) => (
      <g>
        <rect x={c0 + 0.4} y={r0 + 0.4} width={7.2} height={7.2} rx={0.8} fill={hex(c)} fillOpacity={night ? 0.5 : 0.62} />
        <rect x={c0 + 0.4} y={r0 + 0.4} width={7.2} height={7.2} rx={0.8} fill={url("grain")} />
        <rect x={c0 + 0.4} y={r0 + 0.4} width={7.2} height={7.2} rx={0.8} fill="none" stroke={P.groove} strokeWidth={0.12} />
        <path d={`M${c0 + 0.55} ${r0 + 7.45}H${c0 + 7.45}V${r0 + 0.55}`} fill="none" stroke={P.lip} strokeOpacity={0.5} strokeWidth={0.05} />
        {cups.map(([dx, dy]) => (
          <circle key={`${dx}${dy}`} cx={c0 + dx} cy={r0 + dy} r={0.78} fill={url("cup")} stroke={P.groove} strokeWidth={0.05} />
        ))}
      </g>
    ),
    square: (n, r, c, salida, safe) => (
      <g>
        {salida && <rect x={c + 0.05} y={r + 0.05} width={0.9} height={0.9} fill={hex(salida)} fillOpacity={0.75} />}
        <rect x={c} y={r} width={1} height={1} fill="none" stroke={P.groove} strokeOpacity={0.8} strokeWidth={0.06} />
        <path d={`M${c + 0.06} ${r + 0.94}H${c + 0.94}V${r + 0.06}`} fill="none" stroke={P.lip} strokeOpacity={0.4} strokeWidth={0.03} />
        {safe && <polygon points={star8(c + 0.5, r + 0.5, 0.36, 0.6)} fill={url("brass")} fillOpacity={0.9} stroke={P.groove} strokeWidth={0.03} />}
      </g>
    ),
    pasillo: (c, r, cc) => (
      <g>
        <rect x={cc + 0.05} y={r + 0.05} width={0.9} height={0.9} fill={hex(c)} fillOpacity={night ? 0.5 : 0.6} />
        <rect x={cc} y={r} width={1} height={1} fill="none" stroke={P.groove} strokeOpacity={0.8} strokeWidth={0.06} />
      </g>
    ),
    centre: (
      <>
        {COLORS.map((c) => (
          <polygon key={c} points={META[c]} fill={hex(c)} fillOpacity={0.65} />
        ))}
        <path d="M8 8l3 3M11 8l-3 3" stroke={P.groove} strokeWidth={0.06} />
        <circle cx={9.5} cy={9.5} r={0.5} fill={url("wood")} stroke={P.groove} strokeWidth={0.07} />
        <polygon points={star8(9.5, 9.5, 0.36)} fill={url("brass")} stroke={P.groove} strokeWidth={0.03} />
      </>
    ),
    edge: <path d={CROSS} fill="none" stroke={P.groove} strokeWidth={0.12} strokeLinejoin="round" />,
    number: P.text,
  };
}

/** Modern: flat, in the theme's colours: rounded squares with gaps, rounded houses, no lines. */
function modernSkin(night: boolean, { hex, light }: Paint, th: Theme): Skin {
  const text = night ? "#8a909c" : th.stroke;
  return {
    field: <rect width={X_SIZE} height={X_SIZE} fill={th.board} />,
    house: (c, r0, c0) => (
      <g>
        <rect x={c0 + 0.35} y={r0 + 0.35} width={7.3} height={7.3} rx={1.1} fill={hex(c)} />
        <rect x={c0 + 1.4} y={r0 + 1.4} width={5.2} height={5.2} rx={2.6} fill={light(c)} />
      </g>
    ),
    square: (n, r, c, salida, safe) => (
      <g>
        <rect x={c + 0.06} y={r + 0.06} width={0.88} height={0.88} rx={0.16} fill={salida ? hex(salida) : safe ? th.star : th.track} fillOpacity={safe && !salida ? 0.45 : 1} />
      </g>
    ),
    pasillo: (c, r, cc) => <rect x={cc + 0.06} y={r + 0.06} width={0.88} height={0.88} rx={0.16} fill={hex(c)} fillOpacity={0.85} />,
    centre: (
      <>
        {COLORS.map((c) => (
          <polygon key={c} points={META[c]} fill={hex(c)} />
        ))}
        <circle cx={9.5} cy={9.5} r={0.3} fill={th.track} />
      </>
    ),
    edge: null,
    number: text,
  };
}

/** The board picture, 19 x 19 units. `hex(slot)` / `light(slot)`: the colour each seat shows in. */
export const ParchisSurface = memo(function ParchisSurface({ look, hex, light, uid }: { look: Look; hex: (c: Color) => string; light: (c: Color) => string; uid: string }) {
  const id = (n: string) => `${uid}-${n}`;
  const paint: Paint = { hex, light, id, url: (n) => `url(#${id(n)})` };
  const skin =
    look.style === "classic"
      ? classicSkin(look.night, paint)
      : look.style === "sandstone"
        ? sandstoneSkin(look.night, paint)
        : look.style === "royal"
          ? royalSkin(look.night, paint)
          : look.style === "carved"
            ? carvedSkin(look.night, paint)
            : modernSkin(look.night, paint, look.th);
  return (
    <g>
      {skin.defs && <defs>{skin.defs}</defs>}
      {skin.field}
      {COLORS.map((c) => {
        const [r0, c0] = CASA[c];
        return <g key={c}>{skin.house(c, r0, c0)}</g>;
      })}
      {Array.from({ length: X_TRACK }, (_, k) => {
        const n = k + 1;
        const [r, c] = squareCell(n);
        const salida = SALIDA_OF.get(n);
        return (
          <g key={n}>
            {skin.square(n, r, c, salida, SEGUROS.has(n))}
            {num(n, r, c, salida ? "#ffffff" : skin.number)}
          </g>
        );
      })}
      {COLORS.flatMap((c) => PASILLO[c].map(([r, cc], k) => <g key={`${c}${k}`}>{skin.pasillo(c, r, cc, k)}</g>))}
      {skin.centre}
      {skin.edge}
    </g>
  );
});

/** The Parchís board for the game screen. `hex(slot)` / `light(slot)`: the colour each seat shows in. */
export function useParchisLook(hex: (c: Color) => string, light: (c: Color) => string, uid: string): BoardLook {
  const [style, th] = useParchisStyle();
  const look = parchisLook(style, th);
  return {
    size: X_SIZE,
    label: "Parchís board",
    frame: look.frame,
    frameClass: "p-2 sm:p-3",
    corners: look.corners ? <FrameCorners kind={look.corners} /> : undefined,
    surface: <ParchisSurface look={look} hex={hex} light={light} uid={uid} />,
    token: (fill) => (
      <>
        <g className="token-shadow">
          <TokenShadow style={look.token} />
        </g>
        <g className="token-art">
          <TokenArt style={look.token} fill={fill} shadow={false} />
        </g>
      </>
    ),
    lightSquares: look.light,
  };
}

/** One token as it looks on this board design (home page demo, How to play). */
export function ParchisToken({ fill, style }: { fill: string; style?: ParchisStyle }) {
  const [inUse, th] = useParchisStyle();
  return <TokenArt style={parchisLook(style ?? inUse, th).token} fill={fill} />;
}

/**
 * A Parchís board on its own (home page demo, How to play, Settings); `children`
 * are drawn on top in board units 0-19. `style`: a design to show (default: the one in use).
 */
export function ParchisBoardPreview({ children, className, style }: { children?: React.ReactNode; className?: string; style?: ParchisStyle }) {
  const uid = svgId(useId());
  const [inUse, th] = useParchisStyle();
  // Kept the same between renders, so the board itself (memo) isn't drawn again for every move of the demo.
  const look = useMemo(() => parchisLook(style ?? inUse, th), [style, inUse, th]);
  const hex = useMemo(() => (c: Color) => th.pieces[c], [th]);
  const light = useMemo(() => (c: Color) => th.light[c], [th]);
  return (
    <div className={cn("relative aspect-square w-full rounded-xl p-1.5", className)} style={look.frame}>
      <div className="relative h-full w-full">
        <svg viewBox={`0 0 ${X_SIZE} ${X_SIZE}`} className="board-layer absolute inset-0 block h-full w-full rounded-sm" aria-hidden="true">
          <ParchisSurface look={look} hex={hex} light={light} uid={uid} />
        </svg>
        {children && (
          <svg viewBox={`0 0 ${X_SIZE} ${X_SIZE}`} className="board-layer absolute inset-0 block h-full w-full" aria-hidden="true">
            {children}
          </svg>
        )}
      </div>
    </div>
  );
}
