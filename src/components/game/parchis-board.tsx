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
// board. "classic" is the traditional look; the others follow the app's board
// designs and the theme. Only Parchís uses this file.

/** The Parchís board design in use: the one picked in Settings, or the one matching the theme. */
export function useParchisStyle(): [ParchisStyle, Theme] {
  const [settings] = useSettings();
  const th = themeOf(settings.theme);
  return [settings.parchisBoard === "auto" ? th.boardStyle : settings.parchisBoard, th];
}

interface Look {
  /** Behind the cross and the houses */
  field: string;
  /** The squares round the board, the safe ones, and the lines between them */
  cell: string;
  seguro: string;
  line: string;
  /** Square numbers */
  number: string;
  /** Rims and the centre */
  gold: string;
  /** How strongly the houses and pasillos take their colour */
  casa: number;
  pasillo: number;
  /** The tokens' design (the Ludo tokens of the matching board) */
  token: BoardStyleId;
  frame: React.CSSProperties;
  corners?: "rosette" | "lotus";
}

export function parchisLook(style: ParchisStyle, th: Theme): Look {
  switch (style) {
    case "classic":
      return {
        field: "#f3ecdc",
        cell: "#ffffff",
        seguro: "#d5d9de",
        line: "#2b2b2b",
        number: "#6b6b6b",
        gold: "#2b2b2b",
        casa: 1,
        pasillo: 0.85,
        token: "modern",
        frame: { background: "linear-gradient(145deg, #7a4a26 0%, #4e2c14 50%, #6a3e1e 100%)", boxShadow: "0 14px 30px rgba(0,0,0,.45), inset 0 0 0 1.5px #b07a48, inset 0 0 0 4px #33190a" },
      };
    case "sandstone":
      return { field: "#a4442c", cell: "#fffaf0", seguro: "#f0d6a4", line: "#8a4a22", number: "#9a6a3a", gold: "#e8a940", casa: 0.9, pasillo: 0.8, token: "sandstone", frame: frameStyle("sandstone", th), corners: "lotus" };
    case "royal":
      return { field: "#0f4a35", cell: "#fffaf0", seguro: "#ecdcb2", line: "#a87a22", number: "#8a6a2a", gold: "#e2b552", casa: 0.9, pasillo: 0.8, token: "royal", frame: frameStyle("royal", th), corners: "rosette" };
    case "carved":
      return { field: "#5a3520", cell: "#f2dcb4", seguro: "#d6b47e", line: "#4a2e1c", number: "#6a4a2c", gold: "#c89a5a", casa: 0.85, pasillo: 0.75, token: "carved", frame: frameStyle("carved", th) };
    default:
      return { field: th.board, cell: th.track, seguro: th.board, line: th.stroke, number: th.stroke, gold: th.star, casa: 0.9, pasillo: 0.75, token: "modern", frame: frameStyle("modern", th) };
  }
}

/** Outline of the cross. */
const CROSS = "M8 0h3v8h8v3h-8v8H8v-8H0V8h8z";
/** The metas in the middle: each colour's triangle, by its pasillo. */
const META: Record<Color, string> = { yellow: "8,11 11,11 9.5,9.5", green: "11,8 11,11 9.5,9.5", red: "8,8 11,8 9.5,9.5", blue: "8,8 8,11 9.5,9.5" };

/** The board picture, 19 x 19 units. `hex(slot)` / `light(slot)`: the colour each seat shows in. */
export const ParchisSurface = memo(function ParchisSurface({ look, hex, light, uid }: { look: Look; hex: (c: Color) => string; light: (c: Color) => string; uid: string }) {
  const id = (n: string) => `${uid}-${n}`;
  const salidaOf = new Map(COLORS.map((c) => [SALIDA[c], c]));
  return (
    <g>
      <defs>
        <radialGradient id={id("centre")} cx="50%" cy="45%" r="70%">
          <stop offset="0" stopColor="#fff0c0" />
          <stop offset=".55" stopColor="#e8b75a" />
          <stop offset="1" stopColor="#a8741c" />
        </radialGradient>
      </defs>
      <rect width={X_SIZE} height={X_SIZE} fill={look.field} />

      {/* The houses: each colour's corner, with a ring where its pieces wait */}
      {COLORS.map((c) => {
        const [r0, c0] = CASA[c];
        return (
          <g key={c}>
            <rect x={c0 + 0.2} y={r0 + 0.2} width={7.6} height={7.6} rx={0.7} fill={hex(c)} fillOpacity={look.casa} stroke={look.line} strokeOpacity={0.6} strokeWidth={0.08} />
            <circle cx={c0 + 4} cy={r0 + 4} r={2.85} fill={light(c)} fillOpacity={0.9} stroke={look.line} strokeOpacity={0.5} strokeWidth={0.07} />
            <circle cx={c0 + 4} cy={r0 + 4} r={2.45} fill="none" stroke={hex(c)} strokeOpacity={0.6} strokeWidth={0.06} strokeDasharray=".3 .18" />
          </g>
        );
      })}

      {/* The cross: 68 numbered squares round it */}
      <path d={CROSS} fill={look.cell} />
      {Array.from({ length: X_TRACK }, (_, k) => {
        const n = k + 1;
        const [r, cc] = squareCell(n);
        const salida = salidaOf.get(n);
        const safe = SEGUROS.has(n);
        const fill = salida ? hex(salida) : safe ? look.seguro : look.cell;
        // Numbers sit along each square's outer side.
        return (
          <g key={n}>
            <rect x={cc} y={r} width={1} height={1} fill={fill} fillOpacity={salida ? 0.9 : 1} stroke={look.line} strokeOpacity={0.55} strokeWidth={0.04} />
            {safe && <circle cx={cc + 0.5} cy={r + 0.5} r={0.3} fill="none" stroke={salida ? "#fff" : look.line} strokeOpacity={salida ? 0.95 : 0.55} strokeWidth={0.06} />}
            <text x={cc + 0.5} y={r + 0.56} fontSize={0.3} fontWeight={700} textAnchor="middle" fill={salida ? "#fff" : look.number} fillOpacity={0.75} style={{ fontFamily: "var(--font-display)" }}>
              {n}
            </text>
          </g>
        );
      })}
      {/* Each colour's pasillo, in its colour, up to its meta */}
      {COLORS.flatMap((c) =>
        PASILLO[c].map(([r, cc], k) => <rect key={`${c}${k}`} x={cc} y={r} width={1} height={1} fill={hex(c)} fillOpacity={look.pasillo} stroke={look.line} strokeOpacity={0.55} strokeWidth={0.04} />),
      )}

      {/* The metas */}
      {COLORS.map((c) => (
        <polygon key={c} points={META[c]} fill={hex(c)} stroke={look.line} strokeOpacity={0.6} strokeWidth={0.05} />
      ))}
      <circle cx={9.5} cy={9.5} r={0.36} fill={`url(#${id("centre")})`} stroke="#7a4e10" strokeWidth={0.04} />

      <path d={CROSS} fill="none" stroke={look.gold} strokeWidth={0.14} strokeLinejoin="round" />
      <rect x={8} y={8} width={3} height={3} fill="none" stroke={look.gold} strokeWidth={0.08} />
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
    lightSquares: isLight(look.cell),
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
