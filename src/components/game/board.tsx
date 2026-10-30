"use client";

import { memo, useEffect, useId, useRef } from "react";
import { useGame, useSettings } from "@/hooks/use-game";
import { COLORS, SAFE, START } from "@/lib/game/constants";
import { HOMECOL, TRACK, YARD, YARD_SPOTS } from "@/lib/game/geometry";
import type { Color } from "@/lib/game/types";
import type { BoardStyleId } from "@/lib/theme/boards";
import { themeOf, type Theme } from "@/lib/theme/themes";
import { cn } from "@/lib/utils";

function starPoints(cx: number, cy: number) {
  const pts: string[] = [];
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? 0.15 : 0.34;
    pts.push((cx + rr * Math.cos(a)).toFixed(3) + "," + (cy + rr * Math.sin(a)).toFixed(3));
  }
  return pts.join(" ");
}

/** Eight-pointed Mughal star. */
function star8(cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let k = 0; k < 16; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 8;
    const rr = k % 2 ? r * 0.55 : r;
    pts.push((cx + rr * Math.cos(a)).toFixed(3) + "," + (cy + rr * Math.sin(a)).toFixed(3));
  }
  return pts.join(" ");
}

/** Jharokha (palace window) arch filling a yard, its point at the top. */
function archPath(x0: number, y0: number) {
  const l = x0 + 0.75, r = x0 + 5.25, b = y0 + 5.25, s = y0 + 1.9, m = x0 + 3;
  return `M${l} ${b}V${s}C${l} ${y0 + 1} ${m - 0.8} ${y0 + 1} ${m} ${y0 + 0.5}C${m + 0.8} ${y0 + 1} ${r} ${y0 + 1} ${r} ${s}V${b}Z`;
}

const GOLD = "#d9a73e";
const GOLD_DARK = "#6b4a16";

interface SurfaceProps {
  th: Theme;
  colorKey: string;
  uid: string;
}

function useSlotColors(th: Theme, colorKey: string) {
  const shown = colorKey.split(",") as Color[];
  return {
    hex: (slot: Color) => th.pieces[shown[COLORS.indexOf(slot)]],
    light: (slot: Color) => th.light[shown[COLORS.indexOf(slot)]],
  };
}

/** Flat, bright board. `colorKey` is the colour each slot shows to this viewer. */
const ModernSurface = memo(function ModernSurface({ th, colorKey }: SurfaceProps) {
  const { hex, light } = useSlotColors(th, colorKey);
  return (
    <g>
      <rect x={0} y={0} width={15} height={15} fill={th.board} />
      {COLORS.map((c) => {
        const [r0, c0] = YARD[c];
        return (
          <g key={c}>
            <rect x={c0} y={r0} width={6} height={6} fill={hex(c)} />
            <rect x={c0 + 0.8} y={r0 + 0.8} width={4.4} height={4.4} rx={0.5} fill={th.board} />
            {YARD_SPOTS.map(([dy, dx]) => (
              <circle key={`${dy}${dx}`} cx={c0 + dx} cy={r0 + dy} r={0.62} strokeWidth={0.06} fill={light(c)} stroke={hex(c)} />
            ))}
          </g>
        );
      })}
      {TRACK.map(([r, c], idx) => {
        const startOf = COLORS.find((col) => START[col] === idx);
        return (
          <g key={idx}>
            <rect x={c} y={r} width={1} height={1} strokeWidth={0.035} stroke={th.stroke} fill={startOf ? hex(startOf) : th.track} />
            {SAFE.has(idx) && <polygon points={starPoints(c + 0.5, r + 0.5)} strokeWidth={0.03} stroke={th.stroke} fill={startOf ? th.track : th.star} />}
          </g>
        );
      })}
      {COLORS.map((c) =>
        HOMECOL[c].map(([r, cc]) => <rect key={`${c}${r}${cc}`} x={cc} y={r} width={1} height={1} strokeWidth={0.035} stroke={th.stroke} fill={hex(c)} />),
      )}
      <polygon points="6,6 6,9 7.5,7.5" fill={hex("red")} />
      <polygon points="6,6 9,6 7.5,7.5" fill={hex("green")} />
      <polygon points="9,6 9,9 7.5,7.5" fill={hex("yellow")} />
      <polygon points="6,9 9,9 7.5,7.5" fill={hex("blue")} />
      <rect x={6} y={6} width={3} height={3} fill="none" strokeWidth={0.05} stroke={th.stroke} />
      <rect x={0} y={0} width={15} height={15} fill="none" strokeWidth={0.08} stroke={th.stroke} />
    </g>
  );
});

/** Ivory and gold palace board: jewel-coloured yards under jharokha arches, Mughal stars. */
const RoyalSurface = memo(function RoyalSurface({ th, colorKey, uid }: SurfaceProps) {
  const { hex, light } = useSlotColors(th, colorKey);
  const id = (n: string) => `${uid}-${n}`;
  const url = (n: string) => `url(#${id(n)})`;
  return (
    <g>
      <defs>
        <linearGradient id={id("ivory")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fdf7e6" />
          <stop offset="1" stopColor="#efdfb8" />
        </linearGradient>
        <linearGradient id={id("gold")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff0b0" />
          <stop offset=".4" stopColor="#e2b048" />
          <stop offset=".75" stopColor="#a8741c" />
          <stop offset="1" stopColor="#f0cf72" />
        </linearGradient>
        <radialGradient id={id("sheen")} cx="35%" cy="28%" r="80%">
          <stop offset="0" stopColor="#fff" stopOpacity=".5" />
          <stop offset=".55" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".22" />
        </radialGradient>
        <linearGradient id={id("cell")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".28" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".14" />
        </linearGradient>
        <pattern id={id("jaali")} width="0.75" height="0.75" patternUnits="userSpaceOnUse">
          <path d="M.375 0L.75 .375L.375 .75L0 .375Z" fill="none" stroke="#fff" strokeOpacity=".22" strokeWidth=".035" />
        </pattern>
      </defs>
      <rect x={0} y={0} width={15} height={15} fill={url("ivory")} />
      {COLORS.map((c) => {
        const [r0, c0] = YARD[c];
        return (
          <g key={c}>
            <rect x={c0} y={r0} width={6} height={6} fill={hex(c)} />
            <rect x={c0} y={r0} width={6} height={6} fill={url("jaali")} />
            <rect x={c0} y={r0} width={6} height={6} fill={url("sheen")} />
            <rect x={c0 + 0.2} y={r0 + 0.2} width={5.6} height={5.6} rx={0.3} fill="none" stroke={url("gold")} strokeWidth={0.08} />
            {[
              [0.2, 0.2],
              [5.8, 0.2],
              [0.2, 5.8],
              [5.8, 5.8],
            ].map(([dx, dy]) => (
              <polygon key={`${dx}${dy}`} points={star8(c0 + dx, r0 + dy, 0.2)} fill={url("gold")} stroke={GOLD_DARK} strokeWidth={0.025} />
            ))}
            <path d={archPath(c0, r0)} fill={url("ivory")} stroke={GOLD_DARK} strokeWidth={0.17} />
            <path d={archPath(c0, r0)} fill="none" stroke={url("gold")} strokeWidth={0.09} />
            <circle cx={c0 + 3} cy={r0 + 0.36} r={0.13} fill={url("gold")} stroke={GOLD_DARK} strokeWidth={0.03} />
            {YARD_SPOTS.map(([dy, dx]) => (
              <g key={`${dy}${dx}`}>
                <circle cx={c0 + dx} cy={r0 + dy} r={0.62} fill={light(c)} stroke={url("gold")} strokeWidth={0.09} />
                <circle cx={c0 + dx} cy={r0 + dy} r={0.47} fill="none" stroke={hex(c)} strokeWidth={0.05} strokeOpacity={0.7} />
              </g>
            ))}
          </g>
        );
      })}
      {TRACK.map(([r, c], idx) => {
        const startOf = COLORS.find((col) => START[col] === idx);
        return (
          <g key={idx}>
            <rect x={c} y={r} width={1} height={1} strokeWidth={0.035} stroke="#b8954a" fill={startOf ? hex(startOf) : "#fffaf0"} />
            {startOf && <rect x={c} y={r} width={1} height={1} fill={url("cell")} />}
            {SAFE.has(idx) && (
              <polygon points={star8(c + 0.5, r + 0.5, 0.36)} fill={startOf ? "#fffaf0" : url("gold")} stroke={GOLD_DARK} strokeWidth={0.03} />
            )}
          </g>
        );
      })}
      {COLORS.map((c) =>
        HOMECOL[c].map(([r, cc]) => (
          <g key={`${c}${r}${cc}`}>
            <rect x={cc} y={r} width={1} height={1} fill={hex(c)} />
            <rect x={cc} y={r} width={1} height={1} fill={url("cell")} strokeWidth={0.035} stroke="#b8954a" />
          </g>
        )),
      )}
      <polygon points="6,6 6,9 7.5,7.5" fill={hex("red")} />
      <polygon points="6,6 9,6 7.5,7.5" fill={hex("green")} />
      <polygon points="9,6 9,9 7.5,7.5" fill={hex("yellow")} />
      <polygon points="6,9 9,9 7.5,7.5" fill={hex("blue")} />
      <rect x={6} y={6} width={3} height={3} fill={url("sheen")} />
      <path d="M6 6L9 9M9 6L6 9" stroke={url("gold")} strokeWidth={0.06} />
      <circle cx={7.5} cy={7.5} r={0.5} fill={url("gold")} stroke={GOLD_DARK} strokeWidth={0.04} />
      <polygon points={star8(7.5, 7.5, 0.34)} fill="#fff6dc" stroke={GOLD_DARK} strokeWidth={0.025} />
      <rect x={6} y={6} width={3} height={3} fill="none" strokeWidth={0.1} stroke={url("gold")} />
      <rect x={0.06} y={0.06} width={14.88} height={14.88} fill="none" strokeWidth={0.12} stroke={url("gold")} />
      <rect x={0} y={0} width={15} height={15} fill="none" strokeWidth={0.05} stroke={GOLD_DARK} />
    </g>
  );
});

/** Inlaid wooden board: stained yards, carved cups for the tokens, burnt-in rosettes. */
const CarvedSurface = memo(function CarvedSurface({ th, colorKey, uid }: SurfaceProps) {
  const { hex } = useSlotColors(th, colorKey);
  const id = (n: string) => `${uid}-${n}`;
  const url = (n: string) => `url(#${id(n)})`;
  const INK = "#5a3418";
  return (
    <g>
      <defs>
        <linearGradient id={id("wood")} x1="0" y1="0" x2="1" y2=".4">
          <stop offset="0" stopColor="#ecca92" />
          <stop offset=".5" stopColor="#deb176" />
          <stop offset="1" stopColor="#e7c088" />
        </linearGradient>
        <pattern id={id("grain")} width="15" height="1.1" patternUnits="userSpaceOnUse">
          <path d="M0 .3C2 .1 4 .55 7 .3S12 .05 15 .3M0 .85C3 .7 5 1 8 .8S13 .65 15 .85" fill="none" stroke="#9a6430" strokeOpacity=".22" strokeWidth=".04" />
        </pattern>
        <radialGradient id={id("cup")} cx="50%" cy="38%" r="60%">
          <stop offset="0" stopColor="#7a4a22" />
          <stop offset=".7" stopColor="#a8723e" />
          <stop offset="1" stopColor="#d9a86a" />
        </radialGradient>
      </defs>
      <rect x={0} y={0} width={15} height={15} fill={url("wood")} />
      <rect x={0} y={0} width={15} height={15} fill={url("grain")} />
      {COLORS.map((c) => {
        const [r0, c0] = YARD[c];
        return (
          <g key={c}>
            <rect x={c0} y={r0} width={6} height={6} fill={hex(c)} opacity={0.82} />
            <rect x={c0} y={r0} width={6} height={6} fill={url("grain")} />
            <rect x={c0 + 0.7} y={r0 + 0.7} width={4.6} height={4.6} rx={0.6} fill={url("wood")} stroke={INK} strokeWidth={0.1} />
            <rect x={c0 + 0.82} y={r0 + 0.82} width={4.36} height={4.36} rx={0.5} fill={url("grain")} stroke="#fff" strokeOpacity={0.35} strokeWidth={0.05} />
            {YARD_SPOTS.map(([dy, dx]) => (
              <g key={`${dy}${dx}`}>
                <circle cx={c0 + dx} cy={r0 + dy} r={0.6} fill={url("cup")} />
                <circle cx={c0 + dx} cy={r0 + dy} r={0.6} fill="none" stroke={hex(c)} strokeWidth={0.08} />
              </g>
            ))}
          </g>
        );
      })}
      {TRACK.map(([r, c], idx) => {
        const startOf = COLORS.find((col) => START[col] === idx);
        return (
          <g key={idx}>
            <rect x={c} y={r} width={1} height={1} strokeWidth={0.045} stroke={INK} fill={startOf ? hex(startOf) : "transparent"} fillOpacity={startOf ? 0.82 : 0} />
            {SAFE.has(idx) && (
              <g fill="none" stroke={startOf ? "#fff4dc" : INK} strokeWidth={0.05}>
                <circle cx={c + 0.5} cy={r + 0.5} r={0.3} />
                <polygon points={star8(c + 0.5, r + 0.5, 0.3)} />
              </g>
            )}
          </g>
        );
      })}
      {COLORS.map((c) =>
        HOMECOL[c].map(([r, cc]) => (
          <rect key={`${c}${r}${cc}`} x={cc} y={r} width={1} height={1} strokeWidth={0.045} stroke={INK} fill={hex(c)} fillOpacity={0.82} />
        )),
      )}
      <g opacity={0.85}>
        <polygon points="6,6 6,9 7.5,7.5" fill={hex("red")} />
        <polygon points="6,6 9,6 7.5,7.5" fill={hex("green")} />
        <polygon points="9,6 9,9 7.5,7.5" fill={hex("yellow")} />
        <polygon points="6,9 9,9 7.5,7.5" fill={hex("blue")} />
      </g>
      <path d="M6 6L9 9M9 6L6 9" stroke={INK} strokeWidth={0.05} />
      <circle cx={7.5} cy={7.5} r={0.45} fill={url("wood")} stroke={INK} strokeWidth={0.06} />
      <polygon points={star8(7.5, 7.5, 0.3)} fill="none" stroke={INK} strokeWidth={0.04} />
      <rect x={6} y={6} width={3} height={3} fill="none" strokeWidth={0.07} stroke={INK} />
      <rect x={0} y={0} width={15} height={15} fill="none" strokeWidth={0.1} stroke={INK} />
    </g>
  );
});

const SURFACES: Record<BoardStyleId, typeof ModernSurface> = { modern: ModernSurface, royal: RoyalSurface, carved: CarvedSurface };

/** The frame around the board, per design. */
function frameStyle(style: BoardStyleId, th: Theme): React.CSSProperties {
  if (style === "royal")
    return {
      background: "linear-gradient(145deg, #f6d985 0%, #c8962e 30%, #8a5d14 55%, #d9ab45 78%, #f3d27a 100%)",
      boxShadow: "0 14px 30px rgba(0,0,0,.45), inset 0 0 0 1.5px #fff1c2, inset 0 0 0 4px #7a5212, inset 0 0 0 5.5px #f0cf72",
    };
  if (style === "carved")
    return {
      background: "linear-gradient(145deg, #8a5430 0%, #5e3518 45%, #7a4824 70%, #4a2a12 100%)",
      boxShadow: "0 14px 30px rgba(0,0,0,.45), inset 0 0 0 1.5px #b07a48, inset 0 0 0 4px #3b2010, inset 0 0 0 5px #9a6a3e",
    };
  return { background: th.frame, boxShadow: `0 14px 30px rgba(0,0,0,.4), inset 0 0 0 2px ${th.frameEdge}` };
}

/** Gold rosettes on the corners of the royal frame. */
function FrameCorners() {
  return (
    <>
      {["left-0 top-0", "right-0 top-0", "left-0 bottom-0", "right-0 bottom-0"].map((pos) => (
        <svg key={pos} viewBox="-1 -1 2 2" className={cn("pointer-events-none absolute z-10 h-3.5 w-3.5 sm:h-5 sm:w-5", pos)} aria-hidden="true">
          <polygon points={star8(0, 0, 0.95)} fill="#f3d27a" stroke="#6b4a16" strokeWidth={0.1} />
          <circle r={0.32} fill="#c8262b" stroke="#6b4a16" strokeWidth={0.08} />
        </svg>
      ))}
    </>
  );
}

/** One token, drawn to suit the board. */
function TokenArt({ style, fill }: { style: BoardStyleId; fill: string }) {
  if (style === "royal")
    return (
      <>
        <ellipse cx={0.03} cy={0.11} rx={0.36} ry={0.31} fill="rgba(0,0,0,.32)" />
        <circle r={0.36} fill={GOLD} stroke={GOLD_DARK} strokeWidth={0.04} />
        <circle r={0.27} fill={fill} stroke="#fff3c4" strokeWidth={0.025} />
        <ellipse cx={-0.08} cy={-0.1} rx={0.12} ry={0.08} fill="rgba(255,255,255,.55)" />
        <circle r={0.08} fill="#fff1b8" stroke={GOLD_DARK} strokeWidth={0.02} />
      </>
    );
  if (style === "carved")
    return (
      <>
        <ellipse cx={0.03} cy={0.1} rx={0.35} ry={0.3} fill="rgba(0,0,0,.35)" />
        <circle r={0.34} fill={fill} stroke="#3b2414" strokeWidth={0.05} />
        <circle r={0.22} fill="none" stroke="rgba(0,0,0,.28)" strokeWidth={0.04} />
        <circle r={0.22} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth={0.02} transform="translate(-.02 -.02)" />
        <circle r={0.08} fill="#ecca92" stroke="#3b2414" strokeWidth={0.02} />
      </>
    );
  return (
    <>
      <ellipse cx={0.03} cy={0.1} rx={0.34} ry={0.3} fill="rgba(0,0,0,.28)" />
      <circle r={0.34} stroke="#1b1b1b" strokeWidth={0.05} fill={fill} />
      <circle r={0.17} fill="rgba(255,255,255,.85)" />
      <circle r={0.09} fill={fill} />
    </>
  );
}

/** The board design in use: the one picked in Settings, or the theme's own. */
export function useBoardStyle(): [BoardStyleId, Theme] {
  const [settings] = useSettings();
  const th = themeOf(settings.theme);
  return [settings.board === "auto" ? th.boardStyle : settings.board, th];
}

const svgId = (raw: string) => "b" + raw.replace(/[^a-zA-Z0-9]/g, "");

/** Small non-interactive board for the Settings picker. */
export function BoardPreview({ style, th }: { style: BoardStyleId; th: Theme }) {
  const uid = svgId(useId());
  const Surface = SURFACES[style];
  return (
    <div className="relative aspect-square w-full rounded-lg p-1" style={frameStyle(style, th)}>
      <svg viewBox="0 0 15 15" className="block h-full w-full rounded-sm" aria-hidden="true">
        <Surface th={th} colorKey={COLORS.join(",")} uid={uid} />
      </svg>
    </div>
  );
}

export function Board() {
  const game = useGame();
  const [style, th] = useBoardStyle();
  const uid = svgId(useId());
  const rotRef = useRef<SVGGElement>(null);

  // Rotation is driven by the controller (animated only when you join).
  useEffect(() => {
    const apply = () => {
      const a = game.rot.angle;
      rotRef.current?.setAttribute("transform", a ? `rotate(${a} 7.5 7.5)` : "");
    };
    apply();
    return game.onRotate(apply);
  }, [game]);

  const colorKey = COLORS.map((c) => game.displayColor(c)).join(",");
  // Tokens keep a fixed drawing order: moving an element within the SVG would
  // cancel its slide, which made some moves jump. Movable tokens get their
  // halo and tap target in a separate layer on top instead.
  const views = game.tokenViews();
  const movableViews = views.filter((t) => t.movable && !t.hidden);
  const hex = (slot: Color) => th.pieces[game.displayColor(slot)];
  const Surface = SURFACES[style];

  return (
    <div className={cn("relative aspect-square w-full rounded-xl", style === "modern" ? "p-1.5 sm:p-2.5" : "p-2 sm:p-3")} style={frameStyle(style, th)}>
      {style === "royal" && <FrameCorners />}
      <svg viewBox="0 0 15 15" className="block h-full w-full touch-manipulation rounded-md" role="img" aria-label="Ludo board">
        <g ref={rotRef}>
          <Surface th={th} colorKey={colorKey} uid={uid} />
          <g>
            {views.map((t) => (
              <g
                key={t.c + t.i}
                className={"token" + (t.movable ? " movable" : "") + (t.stepping ? " stepping" : "")}
                style={{ transform: `translate(${t.x}px,${t.y}px) scale(${t.scale})`, display: t.hidden ? "none" : undefined }}
              >
                <TokenArt style={style} fill={hex(t.c)} />
              </g>
            ))}
          </g>
          {/* Tokens you can move: halo + tap target, above every token. */}
          <g>
            {movableViews.map((t) => (
              <g
                key={t.c + t.i}
                className="token movable"
                tabIndex={0}
                role="button"
                aria-label="Move this token"
                style={{ transform: `translate(${t.x}px,${t.y}px) scale(${t.scale})`, transition: "none" }}
                onClick={(e) => {
                  (e.currentTarget as SVGGElement).blur();
                  game.move(t.c, t.i);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    game.move(t.c, t.i);
                  }
                }}
              >
                <circle className="halo" r={0.5} fill="none" stroke="#f2c94c" strokeWidth={0.13} />
                <circle r={0.62} fill="transparent" />
              </g>
            ))}
          </g>
        </g>
      </svg>
    </div>
  );
}
