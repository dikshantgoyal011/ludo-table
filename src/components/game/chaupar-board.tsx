"use client";

import { memo, useId, useMemo } from "react";
import { useSettings } from "@/hooks/use-game";
import { COLORS } from "@/lib/game/constants";
import { P_SIZE } from "@/lib/game/pachisi/board";
import type { Color } from "@/lib/game/types";
import type { ChauparStyle } from "@/lib/theme/boards";
import { themeOf, type Theme } from "@/lib/theme/themes";
import { cn } from "@/lib/utils";
import { isLight, type BoardLook } from "./board-look";
import { frameStyle } from "./ludo-board";
import { CELLS, CrossShadow, ENDS, MIDDLE, OUTLINE, PachisiPawn, PachisiPawnShadow, star8, TRIANGLE, type Cell } from "./pachisi-board";

// The Chaupar board: Pachisi's cross (pachisi-board.tsx has its shapes and the
// pawns), with no castles, since Chaupar has none: every square round the cross
// is the same. Each design is the cross alone, except Modern, a square board.
// Each has night colours too (the Dark theme). Only Chaupar uses this file.

/** The Chaupar board design in use: the one picked in Settings, or the one matching the theme. */
export function useChauparStyle(): [ChauparStyle, Theme] {
  const [settings] = useSettings();
  const th = themeOf(settings.theme);
  return [settings.chauparBoard === "auto" ? th.chauparStyle : settings.chauparBoard, th];
}

/** How a design is dressed: which picture it draws, and the frame round it. */
interface Look {
  style: ChauparStyle;
  night: boolean;
  th: Theme;
  /** The cross alone (no square board round it). */
  cross: boolean;
  frame: React.CSSProperties;
  /** Are the squares light (ripples are then drawn dark)? */
  light: boolean;
}

export function chauparLook(style: ChauparStyle, th: Theme): Look {
  const night = !!th.night;
  const cross = style !== "modern";
  return {
    style,
    night,
    th,
    cross,
    frame: cross ? {} : frameStyle("modern", th),
    light: !night && (style === "marble" || style === "print" || style === "phulkari" || (style === "modern" && isLight(th.track))),
  };
}

/** The Chaupar board for the game screen. `hex(slot)` / `light(slot)`: the colour each seat shows in. */
export function useChauparLook(hex: (c: Color) => string, light: (c: Color) => string, uid: string): BoardLook {
  const [style, th] = useChauparStyle();
  const look = chauparLook(style, th);
  return {
    size: P_SIZE,
    label: "Chaupar board",
    frame: look.frame,
    frameClass: look.cross ? "p-0" : "p-2 sm:p-3",
    surface: <ChauparSurface look={look} hex={hex} light={light} uid={uid} />,
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
    lightSquares: look.light,
  };
}

type SurfaceProps = { look: Look; hex: (c: Color) => string; light: (c: Color) => string; uid: string };

/** The board picture, 19 x 19 units. `hex(slot)` / `light(slot)`: the colour each seat shows in. */
export const ChauparSurface = memo(function ChauparSurface(props: SurfaceProps) {
  switch (props.look.style) {
    case "velvet":
      return <Velvet {...props} />;
    case "marble":
      return <Marble {...props} />;
    case "print":
      return <BlockPrint {...props} />;
    case "inlay":
      return <Inlay {...props} />;
    case "phulkari":
      return <Phulkari {...props} />;
    default:
      return <Modern {...props} />;
  }
});

/** The whole grid of squares as one path (for inlaid / printed lines). */
const GRID = CELLS.map(([r, c]) => `M${c} ${r}h1v1h-1z`).join("");
/** The outline drawn a little inside itself (scale about the centre). */
const inset = (k: number) => `translate(9.5 9.5) scale(${k}) translate(-9.5 -9.5)`;

/**
 * Velvet and gold (zardozi): a cross of plum velvet, every square edged in gold
 * thread with a bead at each corner, a gold medallion in the Charkoni and a
 * beaded gold border. The colours' columns are patches of coloured velvet.
 */
function Velvet({ look, hex, uid }: SurfaceProps) {
  const id = (n: string) => `${uid}-${n}`;
  const url = (n: string) => `url(#${id(n)})`;
  const P = look.night
    ? { velvet: ["#2e1029", "#120410"], gold: "#b88a3a", bead: "#d9b56a", deep: "#08020a" }
    : { velvet: ["#64204f", "#2a0a23"], gold: "#e9b65a", bead: "#fff0b8", deep: "#1a0516" };
  return (
    <g>
      <defs>
        <CrossShadow id={id("shadow")} night={look.night} />
        <radialGradient id={id("velvet")} cx="50%" cy="42%" r="72%">
          <stop offset="0" stopColor={P.velvet[0]} />
          <stop offset="1" stopColor={P.velvet[1]} />
        </radialGradient>
        {/* The pile, and the soft shine velvet has where the light falls */}
        <pattern id={id("pile")} width="0.18" height="0.18" patternUnits="userSpaceOnUse">
          <path d="M0 .18L.18 0" stroke="#fff" strokeOpacity={look.night ? 0.03 : 0.05} strokeWidth=".04" />
        </pattern>
        <radialGradient id={id("sheen")} cx="35%" cy="28%" r="60%">
          <stop offset="0" stopColor="#fff" stopOpacity={look.night ? 0.06 : 0.14} />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("zari")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={P.bead} />
          <stop offset=".45" stopColor={P.gold} />
          <stop offset=".8" stopColor={look.night ? "#7a5a1e" : "#a8741c"} />
          <stop offset="1" stopColor={P.bead} />
        </linearGradient>
      </defs>
      <path d={OUTLINE} fill={url("velvet")} filter={url("shadow")} />
      <path d={OUTLINE} fill={url("pile")} />
      {CELLS.map(([r, c]) => {
        const k = `${r},${c}`;
        const own = MIDDLE.get(k);
        const end = ENDS.has(k);
        return (
          <g key={k}>
            {own && <rect x={c + 0.08} y={r + 0.08} width={0.84} height={0.84} rx={0.06} fill={hex(own)} fillOpacity={end ? 0.95 : look.night ? 0.45 : 0.55} />}
            <rect x={c + 0.08} y={r + 0.08} width={0.84} height={0.84} rx={0.06} fill="none" stroke={url("zari")} strokeWidth={0.045} />
            {[
              [c + 0.08, r + 0.08],
              [c + 0.92, r + 0.08],
              [c + 0.08, r + 0.92],
              [c + 0.92, r + 0.92],
            ].map(([x, y]) => (
              <circle key={`${x}${y}`} cx={x} cy={y} r={0.045} fill={P.bead} />
            ))}
          </g>
        );
      })}
      <path d={OUTLINE} fill={url("sheen")} />
      {/* The Charkoni: the colours' triangles and a gold medallion of eight petals */}
      <rect x={8} y={8} width={3} height={3} fill={P.deep} />
      {COLORS.map((c) => (
        <polygon key={c} points={TRIANGLE[c]} fill={hex(c)} fillOpacity={0.5} />
      ))}
      <path d="M8 8l3 3M11 8l-3 3" stroke={url("zari")} strokeWidth={0.05} />
      <circle cx={9.5} cy={9.5} r={0.92} fill={P.deep} fillOpacity={0.7} stroke={url("zari")} strokeWidth={0.07} />
      {Array.from({ length: 8 }, (_, k) => (
        <ellipse key={k} cx={9.5} cy={9.5 - 0.48} rx={0.15} ry={0.36} fill={url("zari")} transform={`rotate(${k * 45} 9.5 9.5)`} />
      ))}
      <circle cx={9.5} cy={9.5} r={0.2} fill={P.deep} stroke={P.bead} strokeWidth={0.05} />
      <rect x={8} y={8} width={3} height={3} fill="none" stroke={url("zari")} strokeWidth={0.08} />
      {/* A gold border, a line of beads inside it */}
      <path d={OUTLINE} fill="none" stroke={url("zari")} strokeWidth={0.2} strokeLinejoin="round" />
      <path d={OUTLINE} fill="none" stroke={P.deep} strokeWidth={0.03} strokeLinejoin="round" transform={inset(0.984)} />
      <path d={OUTLINE} fill="none" stroke={P.bead} strokeWidth={0.07} strokeLinecap="round" strokeDasharray=".001 .16" transform={inset(0.972)} />
    </g>
  );
}

/**
 * Marble inlay (pietra dura), as in a Mughal palace: white marble with grey
 * veins, the squares set out in thin lines of black stone, the colours' columns
 * inlaid in polished coloured stone, and a stone flower in the Charkoni.
 * Night: black marble with pale lines.
 */
function Marble({ look, hex, uid }: SurfaceProps) {
  const id = (n: string) => `${uid}-${n}`;
  const url = (n: string) => `url(#${id(n)})`;
  const P = look.night
    ? { marble: ["#2c2c33", "#18181c"], vein: "#6a6a76", line: "#d8cfbd", gold: "#a8843a", onyx: "#0c0c0f" }
    : { marble: ["#fdfbf6", "#e8e2d6"], vein: "#b3ab9e", line: "#2d2a28", gold: "#c9a24a", onyx: "#1f1d1c" };
  const stones = { petal: "#b8323a", petal2: "#d9a441", leaf: "#3c8a5a", heart: "#2f4fa8" };
  return (
    <g>
      <defs>
        <CrossShadow id={id("shadow")} night={look.night} />
        <linearGradient id={id("marble")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={P.marble[0]} />
          <stop offset="1" stopColor={P.marble[1]} />
        </linearGradient>
        <clipPath id={id("cross")}>
          <path d={OUTLINE} />
        </clipPath>
        <linearGradient id={id("polish")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".4" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".18" />
        </linearGradient>
      </defs>
      <path d={OUTLINE} fill={url("marble")} filter={url("shadow")} />
      {/* The stone's veins */}
      <g clipPath={url("cross")} fill="none" stroke={P.vein} strokeLinecap="round">
        <path d="M-1 4C3 5 5 2 9 4S14 9 20 7" strokeWidth={0.05} strokeOpacity={0.5} />
        <path d="M2 20C4 15 7 16 8 12S12 6 11 -1" strokeWidth={0.07} strokeOpacity={0.35} />
        <path d="M-1 11C4 10 6 13 10 12S16 15 20 14" strokeWidth={0.04} strokeOpacity={0.45} />
        <path d="M13 20C12 16 15 14 14 11" strokeWidth={0.05} strokeOpacity={0.4} />
        <path d="M4 9.5C5 8.8 6.5 9.6 7.5 9" strokeWidth={0.03} strokeOpacity={0.5} />
      </g>
      {CELLS.map(([r, c]) => {
        const k = `${r},${c}`;
        const own = MIDDLE.get(k);
        if (!own) return null;
        const end = ENDS.has(k);
        const m = end ? 0.07 : 0.15;
        return (
          <g key={k}>
            <rect x={c + m} y={r + m} width={1 - 2 * m} height={1 - 2 * m} rx={0.05} fill={hex(own)} />
            <rect x={c + m} y={r + m} width={1 - 2 * m} height={1 - 2 * m} rx={0.05} fill={url("polish")} />
          </g>
        );
      })}
      {/* The black stone lines the squares are set out in */}
      <path d={GRID} fill="none" stroke={P.line} strokeOpacity={look.night ? 0.55 : 0.75} strokeWidth={0.045} />
      {/* The Charkoni: stone triangles, an onyx octagon, a flower of inlaid stones */}
      {COLORS.map((c) => (
        <polygon key={c} points={TRIANGLE[c]} fill={hex(c)} />
      ))}
      <rect x={8} y={8} width={3} height={3} fill={url("polish")} />
      <path d="M8 8l3 3M11 8l-3 3" stroke={P.marble[0]} strokeWidth={0.08} />
      <polygon points={star8(9.5, 9.5, 0.98, 0.92).split(" ").filter((_, k) => k % 2 === 0).join(" ")} fill={P.onyx} stroke={P.gold} strokeWidth={0.05} />
      {Array.from({ length: 4 }, (_, k) => (
        <ellipse key={`l${k}`} cx={9.5} cy={9.5 - 0.55} rx={0.11} ry={0.26} fill={stones.leaf} transform={`rotate(${k * 90 + 45} 9.5 9.5)`} />
      ))}
      {Array.from({ length: 8 }, (_, k) => (
        <ellipse key={k} cx={9.5} cy={9.5 - 0.32} rx={0.12} ry={0.26} fill={k % 2 ? stones.petal2 : stones.petal} transform={`rotate(${k * 45} 9.5 9.5)`} />
      ))}
      <circle cx={9.5} cy={9.5} r={0.14} fill={stones.heart} stroke={P.gold} strokeWidth={0.03} />
      <rect x={8} y={8} width={3} height={3} fill="none" stroke={P.line} strokeWidth={0.07} />
      {/* A kerb of marble, a fine inlaid band of red and green inside it */}
      <path d={OUTLINE} fill="none" stroke={P.marble[1]} strokeWidth={0.2} strokeLinejoin="round" />
      <path d={OUTLINE} fill="none" stroke={P.line} strokeWidth={0.04} strokeLinejoin="round" />
      <path d={OUTLINE} fill="none" stroke={stones.leaf} strokeOpacity={0.8} strokeWidth={0.035} strokeLinejoin="round" transform={inset(0.985)} />
      <path d={OUTLINE} fill="none" stroke={stones.petal} strokeOpacity={0.75} strokeWidth={0.03} strokeLinejoin="round" transform={inset(0.976)} />
    </g>
  );
}

/**
 * Block print: unbleached cotton printed by hand with carved wooden blocks
 * (Sanganer, Bagru): indigo lines, a little madder flower in the corners of
 * each square, the colours' columns printed in their colour with resist dots,
 * and a dotted indigo border. Night: indigo-dyed cloth printed in cream.
 */
function BlockPrint({ look, hex, uid }: SurfaceProps) {
  const id = (n: string) => `${uid}-${n}`;
  const url = (n: string) => `url(#${id(n)})`;
  const P = look.night
    ? { cloth: "#1c2442", ink: "#e9dcc0", madder: "#d0664f", band: "#0f1530" }
    : { cloth: "#f3e5c8", ink: "#22346e", madder: "#a83a2c", band: "#22346e" };
  return (
    <g>
      <defs>
        <CrossShadow id={id("shadow")} night={look.night} />
        <pattern id={id("weave")} width="0.22" height="0.22" patternUnits="userSpaceOnUse">
          <path d="M0 .11h.22M.11 0v.22" stroke={look.night ? "#fff" : "#7a5a2a"} strokeOpacity={look.night ? 0.04 : 0.1} strokeWidth=".03" />
        </pattern>
        {/* Resist dots: little rings left undyed where the colour was printed */}
        <pattern id={id("dots")} width="0.3" height="0.3" patternUnits="userSpaceOnUse">
          <circle cx=".075" cy=".075" r=".035" fill="#fff" fillOpacity=".55" />
          <circle cx=".225" cy=".225" r=".035" fill="#fff" fillOpacity=".55" />
        </pattern>
      </defs>
      <path d={OUTLINE} fill={P.cloth} filter={url("shadow")} />
      <path d={OUTLINE} fill={url("weave")} />
      {CELLS.map(([r, c]) => {
        const k = `${r},${c}`;
        const own = MIDDLE.get(k);
        return (
          <g key={k}>
            {own ? (
              <>
                <rect x={c + 0.07} y={r + 0.07} width={0.86} height={0.86} fill={hex(own)} fillOpacity={ENDS.has(k) ? 0.95 : 0.72} />
                <rect x={c + 0.07} y={r + 0.07} width={0.86} height={0.86} fill={url("dots")} />
              </>
            ) : (
              // A tiny printed flower (a buti) in two corners of the square
              [
                [c + 0.2, r + 0.2],
                [c + 0.8, r + 0.8],
              ].map(([x, y]) => (
                <g key={`${x}${y}`} fill={P.madder} fillOpacity={0.6}>
                  <circle cx={x} cy={y} r={0.045} />
                  {[0, 1, 2, 3].map((q) => (
                    <circle key={q} cx={x + Math.cos((q * Math.PI) / 2) * 0.08} cy={y + Math.sin((q * Math.PI) / 2) * 0.08} r={0.03} />
                  ))}
                </g>
              ))
            )}
            <rect x={c + 0.07} y={r + 0.07} width={0.86} height={0.86} fill="none" stroke={P.ink} strokeOpacity={0.8} strokeWidth={0.045} />
          </g>
        );
      })}
      {/* The Charkoni: an indigo square, the colours printed over it, a cream star */}
      <rect x={8} y={8} width={3} height={3} fill={P.band} />
      {COLORS.map((c) => (
        <polygon key={c} points={TRIANGLE[c]} fill={hex(c)} fillOpacity={0.8} />
      ))}
      <rect x={8} y={8} width={3} height={3} fill={url("dots")} />
      <path d="M8 8l3 3M11 8l-3 3" stroke={look.night ? P.ink : P.cloth} strokeWidth={0.06} />
      <polygon points={star8(9.5, 9.5, 0.7, 0.5)} fill={look.night ? P.ink : P.cloth} stroke={P.band} strokeWidth={0.04} />
      <circle cx={9.5} cy={9.5} r={0.16} fill={P.madder} />
      {/* A printed border: an indigo band with cream dots */}
      <path d={OUTLINE} fill="none" stroke={P.band} strokeWidth={0.26} strokeLinejoin="round" />
      <path d={OUTLINE} fill="none" stroke={look.night ? P.ink : P.cloth} strokeWidth={0.07} strokeLinecap="round" strokeDasharray=".001 .2" />
      <path d={OUTLINE} fill="none" stroke={P.madder} strokeOpacity={0.7} strokeWidth={0.03} strokeLinejoin="round" transform={inset(0.98)} />
    </g>
  );
}

/**
 * Rosewood inlay (the inlaid boxes of Mysore and Surat): dark polished
 * rosewood, the squares laid out in lines of bone, the colours' columns stained
 * into the wood, a brass star in the Charkoni and a banded border of brass and
 * bone. Night: ebony.
 */
function Inlay({ look, hex, uid }: SurfaceProps) {
  const id = (n: string) => `${uid}-${n}`;
  const url = (n: string) => `url(#${id(n)})`;
  const P = look.night
    ? { wood: ["#2b1b14", "#120a07", "#22160f"], grain: "#000", bone: "#bdb2a0", brass: "#a8843a" }
    : { wood: ["#73381f", "#3d1a0e", "#5a2b19"], grain: "#1e0a03", bone: "#f2e6cc", brass: "#d9ac4c" };
  return (
    <g>
      <defs>
        <CrossShadow id={id("shadow")} night={look.night} />
        <linearGradient id={id("wood")} x1="0" y1="0" x2="1" y2=".35">
          <stop offset="0" stopColor={P.wood[0]} />
          <stop offset=".5" stopColor={P.wood[1]} />
          <stop offset="1" stopColor={P.wood[2]} />
        </linearGradient>
        <pattern id={id("grain")} width="19" height="0.9" patternUnits="userSpaceOnUse">
          <path d="M0 .25C3 .1 6 .45 9.5 .25S16 .1 19 .25M0 .7C4 .6 8 .85 12 .65S17 .55 19 .7" fill="none" stroke={P.grain} strokeOpacity={0.35} strokeWidth=".05" />
        </pattern>
        <linearGradient id={id("polish")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={look.night ? 0.05 : 0.12} />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={id("brass")} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#fff2b8" />
          <stop offset=".5" stopColor={P.brass} />
          <stop offset="1" stopColor="#7a5414" />
        </radialGradient>
      </defs>
      <path d={OUTLINE} fill={url("wood")} filter={url("shadow")} />
      <path d={OUTLINE} fill={url("grain")} />
      {CELLS.map(([r, c]) => {
        const k = `${r},${c}`;
        const own = MIDDLE.get(k);
        if (!own) return null;
        return (
          <g key={k}>
            <rect x={c} y={r} width={1} height={1} fill={hex(own)} fillOpacity={ENDS.has(k) ? 0.85 : look.night ? 0.45 : 0.55} />
            <rect x={c + 0.14} y={r + 0.14} width={0.72} height={0.72} fill="none" stroke={P.bone} strokeOpacity={0.6} strokeWidth={0.025} />
          </g>
        );
      })}
      <path d={OUTLINE} fill={url("polish")} />
      {/* Lines of bone between the squares, a brass pin where they cross */}
      <path d={GRID} fill="none" stroke={P.bone} strokeOpacity={0.85} strokeWidth={0.05} />
      {/* The Charkoni: stained triangles round a brass star */}
      {COLORS.map((c) => (
        <polygon key={c} points={TRIANGLE[c]} fill={hex(c)} fillOpacity={0.62} />
      ))}
      <path d="M8 8l3 3M11 8l-3 3" stroke={P.bone} strokeWidth={0.05} />
      <polygon points={star8(9.5, 9.5, 0.78, 0.5)} fill={url("brass")} stroke={P.grain} strokeWidth={0.04} />
      <circle cx={9.5} cy={9.5} r={0.22} fill={P.bone} stroke={P.grain} strokeWidth={0.03} />
      <rect x={8} y={8} width={3} height={3} fill="none" stroke={P.bone} strokeWidth={0.07} />
      {/* A banded border: brass, then a broken line of bone, as in inlaid boxes */}
      <path d={OUTLINE} fill="none" stroke={url("brass")} strokeWidth={0.16} strokeLinejoin="round" />
      <path d={OUTLINE} fill="none" stroke={P.bone} strokeWidth={0.05} strokeDasharray=".22 .1" transform={inset(0.982)} />
      <path d={OUTLINE} fill="none" stroke={P.brass} strokeOpacity={0.8} strokeWidth={0.025} strokeLinejoin="round" transform={inset(0.97)} />
    </g>
  );
}

/**
 * Phulkari, the embroidery of Punjab and Haryana: a hand-spun cloth covered in
 * silk floss darned in straight stitches, square by square in pink, orange and
 * gold, each square's stitches turned the other way from its neighbours', the
 * colours' columns in their colour, nested diamonds in the Charkoni. Night: a
 * black cloth, the silk as bright.
 */
function Phulkari({ look, hex, uid }: SurfaceProps) {
  const id = (n: string) => `${uid}-${n}`;
  const url = (n: string) => `url(#${id(n)})`;
  const P = look.night
    ? { cloth: "#1b1117", seam: "#05020a", floss: ["#e0458a", "#f29a3a", "#f2c84a"], leaf: "#3fb07a" }
    : { cloth: "#fff5ec", seam: "#7a1f45", floss: ["#e0458a", "#f39a38", "#f2c230"], leaf: "#2e9e6a" };
  return (
    <g>
      <defs>
        <CrossShadow id={id("shadow")} night={look.night} />
        {/* Straight darning stitches, one way and the other */}
        <pattern id={id("across")} width="1" height="0.12" patternUnits="userSpaceOnUse">
          <path d="M.08 .06h.84" stroke="#fff" strokeOpacity=".38" strokeWidth=".035" strokeLinecap="round" />
        </pattern>
        <pattern id={id("down")} width="0.12" height="1" patternUnits="userSpaceOnUse">
          <path d="M.06 .08v.84" stroke="#fff" strokeOpacity=".38" strokeWidth=".035" strokeLinecap="round" />
        </pattern>
      </defs>
      <path d={OUTLINE} fill={P.cloth} filter={url("shadow")} />
      {CELLS.map(([r, c]) => {
        const k = `${r},${c}`;
        const own = MIDDLE.get(k);
        const fill = own ? hex(own) : P.floss[(r + c) % 3];
        return (
          <g key={k}>
            <rect x={c + 0.08} y={r + 0.08} width={0.84} height={0.84} rx={0.04} fill={fill} fillOpacity={own ? (ENDS.has(k) ? 1 : 0.85) : look.night ? 0.62 : 0.5} />
            <rect x={c + 0.08} y={r + 0.08} width={0.84} height={0.84} rx={0.04} fill={url((r + c) % 2 ? "across" : "down")} />
            <rect x={c + 0.08} y={r + 0.08} width={0.84} height={0.84} rx={0.04} fill="none" stroke={P.seam} strokeOpacity={look.night ? 0.8 : 0.35} strokeWidth={0.03} />
          </g>
        );
      })}
      {/* The Charkoni: the colours' triangles, nested diamonds of silk (a bagh) */}
      <rect x={8} y={8} width={3} height={3} fill={P.cloth} />
      {COLORS.map((c) => (
        <polygon key={c} points={TRIANGLE[c]} fill={hex(c)} fillOpacity={0.75} />
      ))}
      {[0.95, 0.68, 0.42].map((d, k) => (
        <polygon key={d} points={`9.5,${9.5 - d} ${9.5 + d},9.5 9.5,${9.5 + d} ${9.5 - d},9.5`} fill={P.floss[k]} stroke={P.seam} strokeOpacity={0.5} strokeWidth={0.03} />
      ))}
      <polygon points="9.5,9.32 9.68,9.5 9.5,9.68 9.32,9.5" fill={P.leaf} />
      <rect x={8} y={8} width={3} height={3} fill="none" stroke={P.seam} strokeOpacity={0.6} strokeWidth={0.06} />
      {/* A stitched edge: a pink hem, a running stitch of gold inside it */}
      <path d={OUTLINE} fill="none" stroke={P.floss[0]} strokeWidth={0.18} strokeLinejoin="round" />
      <path d={OUTLINE} fill="none" stroke={P.floss[2]} strokeWidth={0.05} strokeDasharray=".16 .1" transform={inset(0.983)} />
    </g>
  );
}

/**
 * Modern: a square board in the theme's own colours, the cross sunk into it as a
 * channel of rounded squares, each colour's column in its pale shade. In the
 * corners, each colour's panel shows a set of three long dice.
 */
function Modern({ look, hex, light }: SurfaceProps) {
  const th = look.th;
  // Each colour's corner: the one on its left, seen from its seat (red west, green north, yellow east, blue south).
  const corner: Record<Color, Cell> = { red: [0, 0], green: [0, 11], yellow: [11, 11], blue: [11, 0] };
  return (
    <g>
      <rect width={19} height={19} rx={0.5} fill={th.board} />
      {COLORS.map((c) => {
        const [r0, c0] = corner[c];
        return (
          <g key={c}>
            <rect x={c0 + 0.45} y={r0 + 0.45} width={7.1} height={7.1} rx={1.1} fill={light(c)} />
            {/* Three long dice, showing 1, 2 and 6 */}
            {[1, 2, 6].map((n, k) => {
              const y = r0 + 2.35 + k * 1.25;
              return (
                <g key={k}>
                  <rect x={c0 + 1.5} y={y} width={5} height={0.95} rx={0.3} fill={hex(c)} />
                  {Array.from({ length: n }, (_, q) => (
                    <circle key={q} cx={c0 + 4 + (q - (n - 1) / 2) * 0.62} cy={y + 0.475} r={0.17} fill={th.board} />
                  ))}
                </g>
              );
            })}
          </g>
        );
      })}
      {/* The channel the cross sits in */}
      <path d={OUTLINE} fill={look.night ? "#000" : th.stroke} fillOpacity={look.night ? 0.3 : 0.14} />
      {CELLS.map(([r, c]) => {
        const k = `${r},${c}`;
        const own = MIDDLE.get(k);
        const end = ENDS.has(k);
        return (
          <rect key={k} x={c + 0.08} y={r + 0.08} width={0.84} height={0.84} rx={0.18} fill={own ? (end ? hex(own) : light(own)) : th.track}
            stroke={own ? hex(own) : th.stroke} strokeOpacity={own ? (end ? 0 : 0.45) : look.night ? 0.9 : 0.24} strokeWidth={0.04} />
        );
      })}
      {/* The Charkoni: four colour triangles with gaps between them */}
      <rect x={8} y={8} width={3} height={3} fill={th.board} />
      {COLORS.map((c) => (
        <polygon key={c} points={TRIANGLE[c]} fill={hex(c)} stroke={th.board} strokeWidth={0.12} strokeLinejoin="round" />
      ))}
      <circle cx={9.5} cy={9.5} r={0.42} fill={th.board} />
      <circle cx={9.5} cy={9.5} r={0.2} fill={th.track} stroke={th.stroke} strokeOpacity={0.4} strokeWidth={0.04} />
    </g>
  );
}

/**
 * A Chaupar board on its own (home page demo, How to play, Settings); `children`
 * are drawn on top in board units 0-19. `style`: a design to show (default: the one in use).
 */
export function ChauparBoardPreview({ children, className, style }: { children?: React.ReactNode; className?: string; style?: ChauparStyle }) {
  const uid = "cp" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const [inUse, th] = useChauparStyle();
  // Kept the same between renders, so the board itself (memo) isn't drawn again for every move of the demo.
  const look = useMemo(() => chauparLook(style ?? inUse, th), [style, inUse, th]);
  const hex = useMemo(() => (c: Color) => th.pieces[c], [th]);
  const light = useMemo(() => (c: Color) => th.light[c], [th]);
  return (
    <div className={cn("relative aspect-square w-full rounded-xl p-1.5", className)} style={look.frame}>
      <div className="relative h-full w-full">
        <svg viewBox={`0 0 ${P_SIZE} ${P_SIZE}`} className="board-layer absolute inset-0 block h-full w-full rounded-sm" aria-hidden="true">
          <ChauparSurface look={look} hex={hex} light={light} uid={uid} />
        </svg>
        {children && (
          <svg viewBox={`0 0 ${P_SIZE} ${P_SIZE}`} className="board-layer absolute inset-0 block h-full w-full" aria-hidden="true">
            {children}
          </svg>
        )}
      </div>
    </div>
  );
}

/**
 * One pawn of a super-piece's stack: lifted up the screen (however the board is
 * turned) to its place in the stack, the top one showing how many there are.
 */
export function StackLift({ lift = 0, badge, children }: { lift?: number; badge?: number; children: React.ReactNode }) {
  if (!lift && !badge) return <>{children}</>;
  return (
    <g style={lift ? { transform: `rotate(var(--unturn, 0deg)) translate(0px, ${-lift}px) rotate(calc(var(--unturn, 0deg) * -1))` } : undefined}>
      {children}
      {badge && <StackBadge n={badge} />}
    </g>
  );
}

/** A Chaupar pawn for the boards that don't turn (How to play, the home page): in its stack, if it's in one. */
export function ChauparPawn({ fill, lying, lift, badge }: { fill: string; lying?: boolean; lift?: number; badge?: number }) {
  return (
    <StackLift lift={lift} badge={badge}>
      <PachisiPawn fill={fill} lying={lying} />
    </StackLift>
  );
}

/** How many pieces a super-piece is: a small round label by its top pawn, upright however the board is turned. */
export function StackBadge({ n }: { n: number }) {
  return (
    <g style={{ transform: "rotate(var(--unturn, 0deg))" }} aria-hidden="true">
      {/* (Beside the pawn's shoulder rather than over its top, so a stack on the board's edge keeps its number in view.) */}
      <g transform="translate(.4 -.17)">
        <circle r={0.27} fill="#fffaf0" stroke="#20100a" strokeWidth={0.05} />
        <text y={0.115} textAnchor="middle" fontSize={0.34} fontWeight={800} fill="#20100a" fontFamily="var(--font-baloo), system-ui, sans-serif">
          {n}
        </text>
      </g>
    </g>
  );
}
