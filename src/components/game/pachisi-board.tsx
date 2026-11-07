"use client";

import { memo } from "react";
import { useSettings } from "@/hooks/use-game";
import { COLORS } from "@/lib/game/constants";
import { CASTLES, P_LAP_FROM, P_SIZE, ROUTE } from "@/lib/game/pachisi/board";
import type { Color } from "@/lib/game/types";
import type { PachisiStyle } from "@/lib/theme/boards";
import { themeOf, type Theme } from "@/lib/theme/themes";
import { isLight, type BoardLook } from "./board-look";
import { frameStyle } from "./ludo-board";

// The Pachisi board. A real one is a cloth cut into a cross: four arms of 3 x 8
// squares round the Charkoni (centre). Every design here is that cross on its
// own, except Modern, a square board with the corners between the arms filled
// in. Each design also has night colours (the Dark theme). Chaupar, played on
// the same cross, borrows its shapes and pawns (chaupar-board.tsx).

/** The Pachisi board design in use: the one picked in Settings, or the one matching the theme. */
export function usePachisiStyle(): [PachisiStyle, Theme] {
  const [settings] = useSettings();
  const th = themeOf(settings.theme);
  return [settings.pachisiBoard === "auto" ? th.pachisiStyle : settings.pachisiBoard, th];
}

/** How a design is dressed: which picture it draws, and the frame round it. */
interface Look {
  style: PachisiStyle;
  night: boolean;
  th: Theme;
  /** The cross alone (no square board round it). */
  cross: boolean;
  frame: React.CSSProperties;
  /** Are the squares light (ripples are then drawn dark)? */
  light: boolean;
}

export function pachisiLook(style: PachisiStyle, th: Theme): Look {
  const night = !!th.night;
  const cross = style !== "modern";
  return {
    style,
    night,
    th,
    cross,
    // The cross lies on the page itself; the square board has the theme's frame.
    frame: cross ? {} : frameStyle("modern", th),
    light: !night && (style === "royal" || style === "carved" || (style === "modern" && isLight(th.track))),
  };
}

/** The Pachisi board for the game screen. `hex(slot)` / `light(slot)`: the colour each seat shows in. */
export function usePachisiLook(hex: (c: Color) => string, light: (c: Color) => string, uid: string): BoardLook {
  const [style, th] = usePachisiStyle();
  const look = pachisiLook(style, th);
  return {
    size: P_SIZE,
    label: "Pachisi board",
    frame: look.frame,
    frameClass: look.cross ? "p-0" : "p-2 sm:p-3",
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
    lightSquares: look.light,
  };
}

// ---------------------------------------------------------------- the cross, in cells
export type Cell = [number, number];
export const OUTLINE = "M8 0h3v8h8v3h-8v8H8v-8H0V8h8z";
/** Every square of the cross (4 arms of 3 x 8). */
export const CELLS: Cell[] = [];
for (let r = 0; r < 19; r++) for (let c = 0; c < 19; c++) if ((r >= 8 && r <= 10) !== (c >= 8 && c <= 10)) CELLS.push([r, c]);
/** Each colour's own column: down it at the start, back up it to come home (its arm's end included). */
export const MIDDLE = new Map<string, Color>(COLORS.flatMap((c) => ROUTE[c].slice(0, P_LAP_FROM + 1).map((cell) => [cell.join(","), c] as [string, Color])));
/** The end of each arm (a castle, in the colour's column). */
export const ENDS = new Set(COLORS.map((c) => ROUTE[c][P_LAP_FROM].join(",")));
/** The Charkoni's four triangles, one per colour: its pieces wait in it, and come home to it. */
export const TRIANGLE: Record<Color, string> = { red: "8,8 8,11 9.5,9.5", green: "8,8 11,8 9.5,9.5", yellow: "11,8 11,11 9.5,9.5", blue: "8,11 11,11 9.5,9.5" };
const isCastle = (k: string) => CASTLES.has(k);

/** An eight-pointed star round (cx, cy). */
export function star8(cx: number, cy: number, r: number, inner = 0.55) {
  return Array.from({ length: 16 }, (_, k) => {
    const a = -Math.PI / 2 + (k * Math.PI) / 8;
    const rr = k % 2 ? r * inner : r;
    return `${(cx + rr * Math.cos(a)).toFixed(3)},${(cy + rr * Math.sin(a)).toFixed(3)}`;
  }).join(" ");
}
/** The castle's cross (✕) in square (r, c). */
const castleX = (r: number, c: number, s = 0.26) => `M${c + 0.5 - s} ${r + 0.5 - s}L${c + 0.5 + s} ${r + 0.5 + s}M${c + 0.5 + s} ${r + 0.5 - s}L${c + 0.5 - s} ${r + 0.5 + s}`;

/** A soft shadow under the cross, so it lies on the page like a cloth or a board. */
export function CrossShadow({ id, night }: { id: string; night: boolean }) {
  return (
    <filter id={id} x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="0.2" stdDeviation="0.25" floodColor="#000" floodOpacity={night ? 0.7 : 0.45} />
    </filter>
  );
}

type SurfaceProps = { look: Look; hex: (c: Color) => string; light: (c: Color) => string; uid: string };

/** The board picture, 19 x 19 units. `hex(slot)` / `light(slot)`: the colour each seat shows in. */
export const PachisiSurface = memo(function PachisiSurface(props: SurfaceProps) {
  switch (props.look.style) {
    case "authentic":
      return <RedCloth {...props} />;
    case "cloth":
      return <Patchwork {...props} />;
    case "sandstone":
      return <Courtyard {...props} />;
    case "royal":
      return <Royal {...props} />;
    case "carved":
      return <Carved {...props} />;
    default:
      return <Modern {...props} />;
  }
});

/**
 * Traditional red cloth: one crimson cloth, every square stitched in gold
 * thread, the castles embroidered. No player colours, but a faint thread of
 * each colour runs along the column its pieces come home by.
 */
function RedCloth({ look, hex, uid }: SurfaceProps) {
  const id = (n: string) => `${uid}-${n}`;
  // (A deep oxblood, so red pieces still stand out on it; night: dark wine.)
  const P = look.night
    ? { cloth: ["#3e101b", "#22070d"], thread: "#c9a04a", deep: "#150407" }
    : { cloth: ["#981a2c", "#5e0a16"], thread: "#f4cd6a", deep: "#45060f" };
  return (
    <g>
      <defs>
        <CrossShadow id={id("shadow")} night={look.night} />
        <radialGradient id={id("cloth")} cx="50%" cy="45%" r="70%">
          <stop offset="0" stopColor={P.cloth[0]} />
          <stop offset="1" stopColor={P.cloth[1]} />
        </radialGradient>
        <pattern id={id("weave")} width="0.3" height="0.3" patternUnits="userSpaceOnUse">
          <path d="M0 .15h.3M.15 0v.3" stroke="#000" strokeOpacity=".14" strokeWidth=".03" />
        </pattern>
      </defs>
      <path d={OUTLINE} fill={`url(#${id("cloth")})`} filter={`url(#${id("shadow")})`} />
      <path d={OUTLINE} fill={`url(#${id("weave")})`} />
      {CELLS.map(([r, c]) => {
        const k = `${r},${c}`;
        const own = MIDDLE.get(k);
        return (
          <g key={k}>
            {/* Its own column: just a whisper of the colour, and a thread of it */}
            {own && <rect x={c + 0.1} y={r + 0.1} width={0.8} height={0.8} fill={hex(own)} fillOpacity={look.night ? 0.2 : 0.16} />}
            <rect x={c + 0.1} y={r + 0.1} width={0.8} height={0.8} fill="none" stroke={own ? hex(own) : P.thread} strokeOpacity={own ? 0.85 : 0.8} strokeWidth={0.045} strokeDasharray=".11 .07" />
            {isCastle(k) && (
              <>
                <path d={castleX(r, c)} stroke={P.thread} strokeWidth={0.1} strokeLinecap="round" />
                <circle cx={c + 0.5} cy={r + 0.5} r={0.07} fill={P.thread} />
              </>
            )}
          </g>
        );
      })}
      {/* The Charkoni: a gold rosette, the four triangles barely tinted */}
      <rect x={8} y={8} width={3} height={3} fill={P.deep} />
      {COLORS.map((c) => (
        <polygon key={c} points={TRIANGLE[c]} fill={hex(c)} fillOpacity={0.22} />
      ))}
      <path d="M8 8l3 3M11 8l-3 3" stroke={P.thread} strokeWidth={0.05} strokeDasharray=".14 .08" />
      <polygon points={star8(9.5, 9.5, 0.62)} fill="none" stroke={P.thread} strokeWidth={0.06} />
      <circle cx={9.5} cy={9.5} r={0.2} fill={P.thread} />
      <path d={OUTLINE} fill="none" stroke={P.thread} strokeWidth={0.12} strokeLinejoin="round" />
      <path d={OUTLINE} fill="none" stroke={P.deep} strokeWidth={0.04} strokeLinejoin="round" transform="translate(9.5 9.5) scale(.985) translate(-9.5 -9.5)" />
      <rect x={8} y={8} width={3} height={3} fill="none" stroke={P.thread} strokeWidth={0.08} />
    </g>
  );
}

/**
 * Patchwork cloth: squares of printed cotton in saffron, indigo, green and rose,
 * sewn together with white running stitch, mirror work (shisha) on the castles,
 * and each colour's column in its own colour.
 */
function Patchwork({ look, hex, uid }: SurfaceProps) {
  const id = (n: string) => `${uid}-${n}`;
  const patches = look.night ? ["#6a4614", "#1c2a52", "#173f2c", "#55172f", "#3a3026"] : ["#e9a23b", "#2f4c8e", "#2e7d4f", "#c0395f", "#f3e4c4"];
  const seam = look.night ? "#0b0a10" : "#5a1426";
  const stitch = look.night ? "#c9c2b4" : "#fffaf0";
  return (
    <g>
      <defs>
        <CrossShadow id={id("shadow")} night={look.night} />
        <pattern id={id("print")} width="0.25" height="0.25" patternUnits="userSpaceOnUse">
          <circle cx=".125" cy=".125" r=".035" fill="#fff" fillOpacity=".3" />
        </pattern>
        <radialGradient id={id("mirror")} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".45" stopColor="#c9d2dc" />
          <stop offset="1" stopColor="#6f7a86" />
        </radialGradient>
      </defs>
      <path d={OUTLINE} fill={seam} filter={`url(#${id("shadow")})`} />
      {CELLS.map(([r, c]) => {
        const k = `${r},${c}`;
        const own = MIDDLE.get(k);
        const fill = own ? hex(own) : patches[(r * 2 + c * 3) % patches.length];
        return (
          <g key={k}>
            <rect x={c + 0.05} y={r + 0.05} width={0.9} height={0.9} fill={fill} />
            <rect x={c + 0.05} y={r + 0.05} width={0.9} height={0.9} fill={`url(#${id("print")})`} />
            <rect x={c + 0.13} y={r + 0.13} width={0.74} height={0.74} fill="none" stroke={stitch} strokeOpacity={0.75} strokeWidth={0.035} strokeDasharray=".09 .07" />
            {isCastle(k) && (
              <g>
                {/* Mirror work: a little round mirror, its embroidered ring and petals */}
                {[0, 1, 2, 3].map((q) => {
                  const a = (q * Math.PI) / 2 + Math.PI / 4;
                  return <circle key={q} cx={c + 0.5 + Math.cos(a) * 0.3} cy={r + 0.5 + Math.sin(a) * 0.3} r={0.06} fill={stitch} />;
                })}
                <circle cx={c + 0.5} cy={r + 0.5} r={0.22} fill={seam} />
                <circle cx={c + 0.5} cy={r + 0.5} r={0.17} fill={`url(#${id("mirror")})`} />
              </g>
            )}
          </g>
        );
      })}
      {/* The Charkoni: four triangles of cloth round a big mirror */}
      {COLORS.map((c) => (
        <polygon key={c} points={TRIANGLE[c]} fill={hex(c)} stroke={seam} strokeWidth={0.08} />
      ))}
      <circle cx={9.5} cy={9.5} r={0.46} fill={seam} />
      <circle cx={9.5} cy={9.5} r={0.36} fill={`url(#${id("mirror")})`} />
      <path d={OUTLINE} fill="none" stroke={seam} strokeWidth={0.16} strokeLinejoin="round" />
      <path d={OUTLINE} fill="none" stroke={stitch} strokeOpacity={0.6} strokeWidth={0.04} strokeDasharray=".14 .1" transform="translate(9.5 9.5) scale(.982) translate(-9.5 -9.5)" />
    </g>
  );
}

/**
 * Sandstone courtyard: the cross as it is laid into the floor of a palace
 * courtyard (as at Fatehpur Sikri): slabs of red sandstone, each one carved
 * and set in a grid of white marble, marble stars on the castles. Like the red
 * cloth it is one warm red with no player colours on the squares; only each
 * colour's column is inlaid in a slip of coloured stone, its arm's end in full.
 */
function Courtyard({ look, hex, uid }: SurfaceProps) {
  const id = (n: string) => `${uid}-${n}`;
  const url = (n: string) => `url(#${id(n)})`;
  // (A brick red, warmer and lighter than the cloth's crimson; night: dark burnt stone.)
  const P = look.night
    ? { stone: ["#5a2216", "#2c0e08"], marble: "#a8988a", vein: "#6a5a50", gold: "#b8862e", deep: "#1a0704" }
    : { stone: ["#c4583a", "#8a311d"], marble: "#f7ecd8", vein: "#c9b9a0", gold: "#f2c46a", deep: "#4e1408" };
  return (
    <g>
      <defs>
        <CrossShadow id={id("shadow")} night={look.night} />
        <radialGradient id={id("stone")} cx="50%" cy="42%" r="72%">
          <stop offset="0" stopColor={P.stone[0]} />
          <stop offset="1" stopColor={P.stone[1]} />
        </radialGradient>
        {/* Grit and the stone's bedding lines */}
        <pattern id={id("grit")} width="0.6" height="0.6" patternUnits="userSpaceOnUse">
          <circle cx=".1" cy=".2" r=".022" fill="#000" fillOpacity=".16" />
          <circle cx=".42" cy=".47" r=".018" fill="#fff" fillOpacity=".14" />
          <circle cx=".5" cy=".08" r=".012" fill="#fff" fillOpacity=".1" />
        </pattern>
        <pattern id={id("bed")} width="19" height="1.7" patternUnits="userSpaceOnUse">
          <path d="M0 .5C4 .35 8 .7 12 .5S17 .35 19 .5M0 1.25C5 1.15 9 1.4 13 1.2S17 1.1 19 1.25" fill="none" stroke="#fff" strokeOpacity={look.night ? 0.05 : 0.09} strokeWidth=".06" />
        </pattern>
        <linearGradient id={id("marble")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={look.night ? 0.15 : 0.6} />
          <stop offset="1" stopColor={P.marble} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={OUTLINE} fill={url("stone")} filter={url("shadow")} />
      <path d={OUTLINE} fill={url("bed")} />
      {CELLS.map(([r, c]) => {
        const k = `${r},${c}`;
        const own = MIDDLE.get(k);
        return (
          <g key={k}>
            {/* A carved slab: lit from the top left */}
            <path d={`M${c + 0.05} ${r + 0.95}V${r + 0.05}H${c + 0.95}`} fill="none" stroke="#fff" strokeOpacity={look.night ? 0.08 : 0.22} strokeWidth={0.04} />
            <path d={`M${c + 0.05} ${r + 0.95}H${c + 0.95}V${r + 0.05}`} fill="none" stroke={P.deep} strokeOpacity={0.4} strokeWidth={0.04} />
            {/* Its own column: a tile of coloured stone set in marble (the arm's end: the whole slab) */}
            {own && (ENDS.has(k)
              ? <rect x={c} y={r} width={1} height={1} fill={hex(own)} />
              : <rect x={c + 0.22} y={r + 0.22} width={0.56} height={0.56} rx={0.06} fill={hex(own)} fillOpacity={look.night ? 0.7 : 0.85} stroke={P.marble} strokeWidth={0.045} />)}
            {isCastle(k) && (
              <>
                <polygon points={star8(c + 0.5, r + 0.5, 0.38, 0.5)} fill={P.marble} stroke={P.deep} strokeOpacity={0.5} strokeWidth={0.025} />
                <circle cx={c + 0.5} cy={r + 0.5} r={0.09} fill={own ? hex(own) : P.stone[1]} />
              </>
            )}
          </g>
        );
      })}
      {/* The marble grid the slabs are set in */}
      <path d={OUTLINE} fill={url("grit")} />
      <path
        d={CELLS.map(([r, c]) => `M${c} ${r}h1v1h-1z`).join("")}
        fill="none" stroke={P.marble} strokeOpacity={look.night ? 0.55 : 0.85} strokeWidth={0.06}
      />
      {/* The Charkoni: a white marble square, the colours inlaid, a red stone lotus */}
      <rect x={8} y={8} width={3} height={3} fill={P.marble} />
      {COLORS.map((c) => (
        <polygon key={c} points={TRIANGLE[c]} fill={hex(c)} />
      ))}
      <rect x={8} y={8} width={3} height={3} fill={url("marble")} fillOpacity={0.5} />
      <path d="M8 8l3 3M11 8l-3 3" stroke={P.marble} strokeWidth={0.1} />
      <polygon points={star8(9.5, 9.5, 0.6, 0.5)} fill={P.stone[0]} stroke={P.marble} strokeWidth={0.05} />
      <circle cx={9.5} cy={9.5} r={0.2} fill={P.gold} stroke={P.deep} strokeWidth={0.03} />
      <rect x={8} y={8} width={3} height={3} fill="none" stroke={P.gold} strokeWidth={0.07} />
      {/* A marble kerb round the cross, a gold line inside it */}
      <path d={OUTLINE} fill="none" stroke={P.marble} strokeWidth={0.2} strokeLinejoin="round" />
      <path d={OUTLINE} fill="none" stroke={P.vein} strokeOpacity={0.6} strokeWidth={0.04} strokeLinejoin="round" />
      <path d={OUTLINE} fill="none" stroke={P.gold} strokeWidth={0.04} strokeLinejoin="round" transform="translate(9.5 9.5) scale(.982) translate(-9.5 -9.5)" />
    </g>
  );
}

/**
 * Royal Darbar: an ivory cross edged in gold, every square framed in a gold
 * line, gold stars on the castles, and the colours' columns inlaid in coloured
 * stone (pietra dura) under a polish. Night: black onyx and gold.
 */
function Royal({ look, hex, uid }: SurfaceProps) {
  const id = (n: string) => `${uid}-${n}`;
  const url = (n: string) => `url(#${id(n)})`;
  const P = look.night ? { ivory: ["#2b2830", "#17151b"], line: "#8a6a2a", dark: "#0c0b0e" } : { ivory: ["#fffaf0", "#efdfb8"], line: "#c49a42", dark: "#6b4a16" };
  return (
    <g>
      <defs>
        <CrossShadow id={id("shadow")} night={look.night} />
        <linearGradient id={id("ivory")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={P.ivory[0]} />
          <stop offset="1" stopColor={P.ivory[1]} />
        </linearGradient>
        <linearGradient id={id("gold")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff0b0" />
          <stop offset=".4" stopColor="#e2b048" />
          <stop offset=".75" stopColor="#a8741c" />
          <stop offset="1" stopColor="#f0cf72" />
        </linearGradient>
        <linearGradient id={id("polish")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".35" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".2" />
        </linearGradient>
      </defs>
      <path d={OUTLINE} fill={url("ivory")} filter={url("shadow")} />
      {CELLS.map(([r, c]) => {
        const k = `${r},${c}`;
        const own = MIDDLE.get(k);
        return (
          <g key={k}>
            {own && (
              <>
                <rect x={c + 0.08} y={r + 0.08} width={0.84} height={0.84} rx={0.08} fill={hex(own)} />
                <rect x={c + 0.08} y={r + 0.08} width={0.84} height={0.84} rx={0.08} fill={url("polish")} />
              </>
            )}
            <rect x={c} y={r} width={1} height={1} fill="none" stroke={P.line} strokeOpacity={0.55} strokeWidth={0.03} />
            <rect x={c + 0.08} y={r + 0.08} width={0.84} height={0.84} rx={0.08} fill="none" stroke={url("gold")} strokeWidth={0.04} />
            {isCastle(k) && <polygon points={star8(c + 0.5, r + 0.5, 0.36)} fill={url("gold")} stroke={P.dark} strokeWidth={0.025} />}
          </g>
        );
      })}
      {/* The Charkoni: jewel triangles under a gold dome */}
      {COLORS.map((c) => (
        <polygon key={c} points={TRIANGLE[c]} fill={hex(c)} />
      ))}
      <rect x={8} y={8} width={3} height={3} fill={url("polish")} />
      <path d="M8 8l3 3M11 8l-3 3" stroke={url("gold")} strokeWidth={0.07} />
      <circle cx={9.5} cy={9.5} r={0.52} fill={url("gold")} stroke={P.dark} strokeWidth={0.04} />
      <polygon points={star8(9.5, 9.5, 0.36)} fill={P.ivory[0]} stroke={P.dark} strokeWidth={0.025} />
      <rect x={8} y={8} width={3} height={3} fill="none" stroke={url("gold")} strokeWidth={0.1} />
      {/* Gold edging with a fine dark line inside */}
      <path d={OUTLINE} fill="none" stroke={url("gold")} strokeWidth={0.22} strokeLinejoin="round" />
      <path d={OUTLINE} fill="none" stroke={P.dark} strokeWidth={0.035} strokeLinejoin="round" transform="translate(9.5 9.5) scale(.98) translate(-9.5 -9.5)" />
      {/* A gold finial at each arm's end */}
      {[[9.5, 0], [19, 9.5], [9.5, 19], [0, 9.5]].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r={0.2} fill={url("gold")} stroke={P.dark} strokeWidth={0.03} />
      ))}
    </g>
  );
}

/**
 * Carved wood: a cross of polished wood with the squares cut in as grooves,
 * brass inlay on the castles, and the colours' columns stained into the wood.
 * Night: ebony.
 */
function Carved({ look, hex, uid }: SurfaceProps) {
  const id = (n: string) => `${uid}-${n}`;
  const url = (n: string) => `url(#${id(n)})`;
  const P = look.night
    ? { wood: ["#3b2a1f", "#22170f", "#33251a"], grain: "#d9b07a", groove: "#0c0705", lip: "#6a4a30", brass: "#b8923e" }
    : { wood: ["#d9a66a", "#b97c40", "#cf9858"], grain: "#6a3a14", groove: "#4a2810", lip: "#f2cf98", brass: "#e8c25a" };
  return (
    <g>
      <defs>
        <CrossShadow id={id("shadow")} night={look.night} />
        <linearGradient id={id("wood")} x1="0" y1="0" x2="1" y2=".35">
          <stop offset="0" stopColor={P.wood[0]} />
          <stop offset=".5" stopColor={P.wood[1]} />
          <stop offset="1" stopColor={P.wood[2]} />
        </linearGradient>
        <pattern id={id("grain")} width="19" height="1.3" patternUnits="userSpaceOnUse">
          <path d="M0 .35C3 .1 6 .6 9.5 .35S16 .1 19 .35M0 .95C4 .8 7 1.15 11 .9S16 .75 19 .95" fill="none" stroke={P.grain} strokeOpacity={look.night ? 0.16 : 0.28} strokeWidth=".05" />
        </pattern>
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
        return (
          <g key={k}>
            {own && <rect x={c + 0.05} y={r + 0.05} width={0.9} height={0.9} fill={hex(own)} fillOpacity={look.night ? 0.55 : 0.6} />}
            {/* A cut groove: dark, with the light catching its far edge */}
            <rect x={c} y={r} width={1} height={1} fill="none" stroke={P.groove} strokeOpacity={0.8} strokeWidth={0.07} />
            <path d={`M${c + 0.06} ${r + 0.94}H${c + 0.94}V${r + 0.06}`} fill="none" stroke={P.lip} strokeOpacity={0.45} strokeWidth={0.03} />
            {isCastle(k) && (
              <g>
                <circle cx={c + 0.5} cy={r + 0.5} r={0.3} fill={url("brass")} stroke={P.groove} strokeWidth={0.04} />
                <path d={castleX(r, c, 0.16)} stroke={P.groove} strokeWidth={0.06} strokeLinecap="round" />
              </g>
            )}
          </g>
        );
      })}
      {/* The Charkoni: stained triangles round a carved rosette */}
      {COLORS.map((c) => (
        <polygon key={c} points={TRIANGLE[c]} fill={hex(c)} fillOpacity={0.65} />
      ))}
      <path d="M8 8l3 3M11 8l-3 3" stroke={P.groove} strokeWidth={0.06} />
      <circle cx={9.5} cy={9.5} r={0.5} fill={url("wood")} stroke={P.groove} strokeWidth={0.07} />
      <polygon points={star8(9.5, 9.5, 0.36)} fill={url("brass")} stroke={P.groove} strokeWidth={0.03} />
      <rect x={8} y={8} width={3} height={3} fill="none" stroke={P.groove} strokeWidth={0.08} />
      <path d={OUTLINE} fill="none" stroke={P.groove} strokeWidth={0.14} strokeLinejoin="round" />
      <path d={OUTLINE} fill="none" stroke={P.lip} strokeOpacity={0.4} strokeWidth={0.04} strokeLinejoin="round" transform="translate(9.5 9.5) scale(.985) translate(-9.5 -9.5)" />
    </g>
  );
}

/**
 * Modern: a square board in the theme's own colours, the one design with its
 * corners filled in: a soft panel of each colour between the arms, the cross
 * sunk into the board as a channel of rounded squares, each colour's column in
 * its pale shade, castles marked with a star.
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
        const cx = c0 + 4, cy = r0 + 4;
        return (
          <g key={c}>
            <rect x={c0 + 0.45} y={r0 + 0.45} width={7.1} height={7.1} rx={1.1} fill={light(c)} />
            <rect x={c0 + 1.25} y={r0 + 1.25} width={5.5} height={5.5} rx={0.8} fill="none" stroke={hex(c)} strokeOpacity={0.28} strokeWidth={0.09} />
            <circle cx={cx} cy={cy} r={1.75} fill={hex(c)} />
            <circle cx={cx} cy={cy} r={1.15} fill="none" stroke={th.board} strokeOpacity={0.9} strokeWidth={0.16} />
            <polygon points={star8(cx, cy, 0.55, 0.5)} fill={th.board} fillOpacity={0.9} />
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
          <g key={k}>
            <rect x={c + 0.08} y={r + 0.08} width={0.84} height={0.84} rx={0.18} fill={own ? (end ? hex(own) : light(own)) : th.track}
              stroke={own ? hex(own) : th.stroke} strokeOpacity={own ? (end ? 0 : 0.45) : look.night ? 0.9 : 0.24} strokeWidth={0.04} />
            {isCastle(k) && <polygon points={star8(c + 0.5, r + 0.5, 0.3, 0.5)} fill={end ? "#fff" : own ? hex(own) : th.star} />}
          </g>
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
