"use client";

import { memo } from "react";
import { useSettings } from "@/hooks/use-game";
import { COLORS } from "@/lib/game/constants";
import { CASTLES, P_LAP_FROM, P_LAP_TO, P_SIZE, ROUTE } from "@/lib/game/pachisi/board";
import type { Color } from "@/lib/game/types";
import type { PachisiStyle } from "@/lib/theme/boards";
import { themeOf, type Theme } from "@/lib/theme/themes";
import { isLight, type BoardLook } from "./board-look";

// The Pachisi board: a cross of 3 x 8 squares per arm round the Charkoni (centre),
// drawn in one of several looks (see PACHISI_STYLES). "cloth" is the traditional
// embroidered cloth; the others follow the app's board designs and the theme.
// Only Pachisi uses this file.

/** The Pachisi board design in use: the one picked in Settings, or the one matching the theme. */
export function usePachisiStyle(): [PachisiStyle, Theme] {
  const [settings] = useSettings();
  const th = themeOf(settings.theme);
  return [settings.pachisiBoard === "auto" ? th.boardStyle : settings.pachisiBoard, th];
}

/** The Pachisi board for the game screen. `hex(slot)` / `light(slot)`: the colour each seat shows in. */
export function usePachisiLook(hex: (c: Color) => string, light: (c: Color) => string, uid: string): BoardLook {
  const [style, th] = usePachisiStyle();
  const look = pachisiLook(style, th);
  return {
    size: P_SIZE,
    label: "Pachisi board",
    frame: look.frame,
    frameClass: "p-2 sm:p-3",
    surface: <PachisiSurface look={look} hex={hex} light={light} uid={uid} />,
    // Pawns aren't round: they turn back, so they stand upright however the board is turned.
    token: (fill, lying) => (
      <g style={{ transform: "rotate(var(--unturn, 0deg))" }}>
        <g className="token-shadow">
          <PachisiPawnShadow />
        </g>
        <g className="token-art">
          <PachisiPawn fill={fill} shadow={false} lying={lying} />
        </g>
      </g>
    ),
    lightSquares: isLight(look.cell),
  };
}

interface Look {
  /** Behind the cross (the four corners) */
  field: string;
  /** Faint pattern over the field */
  motif: string;
  /** The cross itself and its squares */
  arm: string;
  cell: string;
  cellOpacity: number;
  /** Lines between squares, castle crosses, borders */
  thread: string;
  castle: string;
  gold: string;
  frame: React.CSSProperties;
}

export function pachisiLook(style: PachisiStyle, th: Theme): Look {
  const themeFrame: React.CSSProperties = { background: th.frame, boxShadow: `0 14px 30px rgba(0,0,0,.4), inset 0 0 0 2px ${th.frameEdge}` };
  switch (style) {
    case "cloth":
      return {
        field: "#1a2148",
        motif: "#e8b75a",
        arm: "#8e1b2a",
        cell: "#6e1220",
        cellOpacity: 0.35,
        thread: "#f3d48a",
        castle: "#fff1c9",
        gold: "#e8b75a",
        frame: { background: "radial-gradient(circle at 50% 40%, #5a3520, #2a160a 78%)", boxShadow: "inset 0 0 0 2px #c8962e, inset 0 0 0 5px #3a200e, 0 14px 30px rgba(0,0,0,.45)" },
      };
    case "sandstone":
      return { field: "#a4442c", motif: "#f2c46a", arm: "#f6e7c8", cell: "#fffaf0", cellOpacity: 1, thread: "#b8863a", castle: "#8a2f1c", gold: "#d9a73e", frame: themeFrame };
    case "royal":
      return { field: "#0f4a35", motif: "#e2b552", arm: "#f8f0da", cell: "#fffaf0", cellOpacity: 1, thread: "#c8962e", castle: "#0f4a35", gold: "#e2b552", frame: themeFrame };
    case "carved":
      return { field: "#5a3520", motif: "#c89a5a", arm: "#e9cfa0", cell: "#f2dcb4", cellOpacity: 1, thread: "#4a2e1c", castle: "#4a2e1c", gold: "#c89a5a", frame: themeFrame };
    default:
      return { field: th.board, motif: th.stroke, arm: th.board, cell: th.track, cellOpacity: 1, thread: th.stroke, castle: th.stroke, gold: th.star, frame: themeFrame };
  }
}

const OUTLINE = "M8 0h3v8h8v3h-8v8H8v-8H0V8h8z";

/** The board picture, 19 x 19 units. `hex(slot)` / `light(slot)`: the colour each seat shows in. */
export const PachisiSurface = memo(function PachisiSurface({
  look,
  hex,
  light,
  uid,
}: {
  look: Look;
  hex: (c: Color) => string;
  light: (c: Color) => string;
  uid: string;
}) {
  const id = (n: string) => `${uid}-${n}`;
  const url = (n: string) => `url(#${id(n)})`;
  // Each colour's own arm: its middle column (in its colour), its end square.
  const middles = COLORS.flatMap((c) => ROUTE[c].slice(0, P_LAP_FROM + 1).map((cell, k) => ({ c, cell, end: k === P_LAP_FROM })));
  const middleKeys = new Set(middles.map(({ cell }) => cell.join(",")));
  // Every outside square, once.
  const lap = ROUTE.red.slice(P_LAP_FROM, P_LAP_TO).filter((cell) => !middleKeys.has(cell.join(",")));
  // The corner each colour's arm turns into on the way round (decorated in its colour).
  const corner: Record<Color, [number, number]> = { red: [0, 0], green: [0, 11], yellow: [11, 11], blue: [11, 0] };
  return (
    <g>
      <defs>
        <pattern id={id("weave")} width="0.34" height="0.34" patternUnits="userSpaceOnUse">
          <path d="M0 .17h.34M.17 0v.34" stroke="#000" strokeOpacity=".12" strokeWidth=".035" />
        </pattern>
        <pattern id={id("motif")} width="1.2" height="1.2" patternUnits="userSpaceOnUse">
          <path d="M.6 .15L1.05 .6L.6 1.05L.15 .6Z" fill="none" stroke={look.motif} strokeOpacity=".18" strokeWidth=".05" />
        </pattern>
        <radialGradient id={id("centre")} cx="50%" cy="45%" r="70%">
          <stop offset="0" stopColor="#fff0c0" />
          <stop offset=".55" stopColor="#e8b75a" />
          <stop offset="1" stopColor="#a8741c" />
        </radialGradient>
      </defs>

      <rect width={19} height={19} fill={look.field} />
      <rect width={19} height={19} fill={url("motif")} />
      {/* Corners: each colour's corner, in its colour, with a star */}
      {COLORS.map((c) => {
        const [r0, c0] = corner[c];
        const cx = c0 + 4, cy = r0 + 4;
        return (
          <g key={c}>
            <rect x={c0 + 0.7} y={r0 + 0.7} width={6.6} height={6.6} rx={0.9} fill={hex(c)} opacity={0.22} />
            <rect x={c0 + 0.7} y={r0 + 0.7} width={6.6} height={6.6} rx={0.9} fill="none" stroke={look.gold} strokeWidth={0.1} strokeDasharray=".35 .18" />
            <polygon
              points={Array.from({ length: 16 }, (_, k) => {
                const a = (k / 16) * Math.PI * 2 - Math.PI / 2;
                const rr = k % 2 ? 0.9 : 1.9;
                return `${cx + Math.cos(a) * rr},${cy + Math.sin(a) * rr}`;
              }).join(" ")}
              fill={light(c)}
              fillOpacity={0.3}
              stroke={hex(c)}
              strokeWidth={0.1}
            />
          </g>
        );
      })}

      {/* The cross */}
      <path d={OUTLINE} fill={look.arm} />
      <path d={OUTLINE} fill={url("weave")} />
      {lap.map(([r, c]) => (
        <rect key={`${r},${c}`} x={c + 0.06} y={r + 0.06} width={0.88} height={0.88} rx={0.08} fill={look.cell} fillOpacity={look.cellOpacity} stroke={look.thread} strokeOpacity={0.75} strokeWidth={0.045} />
      ))}
      {/* Each arm's middle column in its colour: pieces go down it and come back up it */}
      {middles.map(({ c, cell: [r, cc], end }) => (
        <rect key={`m${r},${cc}`} x={cc + 0.06} y={r + 0.06} width={0.88} height={0.88} rx={0.08} fill={hex(c)} fillOpacity={end ? 1 : 0.8} stroke={look.thread} strokeOpacity={0.75} strokeWidth={0.045} />
      ))}
      {/* Castles: safe squares, marked with a cross */}
      {[...CASTLES].map((k) => {
        const [r, c] = k.split(",").map(Number);
        const onColour = middleKeys.has(k);
        return <path key={k} d={`M${c + 0.24} ${r + 0.24}l.52 .52m0 -.52l-.52 .52`} stroke={onColour ? "#fff" : look.castle} strokeWidth={0.11} strokeLinecap="round" />;
      })}

      {/* The Charkoni: four triangles, one per colour; its pieces wait here, and come home here */}
      <polygon points="8,8 8,11 9.5,9.5" fill={hex("red")} />
      <polygon points="8,8 11,8 9.5,9.5" fill={hex("green")} />
      <polygon points="11,8 11,11 9.5,9.5" fill={hex("yellow")} />
      <polygon points="8,11 11,11 9.5,9.5" fill={hex("blue")} />
      <path d="M8 8l3 3M11 8l-3 3" stroke={look.gold} strokeWidth={0.06} />
      <circle cx={9.5} cy={9.5} r={0.34} fill={url("centre")} stroke="#7a4e10" strokeWidth={0.04} />

      <path d={OUTLINE} fill="none" stroke={look.gold} strokeWidth={0.16} strokeLinejoin="round" />
      <rect x={8} y={8} width={3} height={3} fill="none" stroke={look.gold} strokeWidth={0.1} />
      {[
        [9.5, -0.05], [19.05, 9.5], [9.5, 19.05], [-0.05, 9.5],
      ].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r={0.16} fill={look.gold} />
      ))}
    </g>
  );
});

/** A Pachisi pawn: a wooden beehive with a gold knob. `lying`: on its side (on its way back, or home). */
export function PachisiPawn({ fill, shadow = true, lying = false }: { fill: string; shadow?: boolean; lying?: boolean }) {
  return (
    <>
      {shadow && <ellipse cx={0.04} cy={0.33} rx={0.34} ry={0.13} fill="rgba(0,0,0,.4)" />}
      <g transform={lying ? "translate(0 .1) rotate(-90) scale(.92)" : undefined}>
        <path d="M-.34 .28C-.36 -.06 -.2 -.38 0 -.42C.2 -.38 .36 -.06 .34 .28Q0 .4 -.34 .28Z" fill={fill} stroke="#20100a" strokeWidth={0.05} />
        <path d="M-.3 .06Q0 .14 .3 .06M-.26 -.14Q0 -.07 .26 -.14" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth={0.035} />
        <path d="M-.15 -.26Q-.2 -.02 -.17 .18" stroke="rgba(255,255,255,.45)" strokeWidth={0.06} strokeLinecap="round" fill="none" />
        <circle cy={-0.44} r={0.1} fill="#e8b75a" stroke="#7a4e10" strokeWidth={0.03} />
      </g>
    </>
  );
}

/** The pawn's shadow alone (drawn under it while it breathes, see board.tsx). */
export function PachisiPawnShadow() {
  return <ellipse cx={0.04} cy={0.33} rx={0.34} ry={0.13} fill="rgba(0,0,0,.4)" />;
}
