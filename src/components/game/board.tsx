"use client";

import { memo, useEffect, useRef } from "react";
import { useGame, useSettings } from "@/hooks/use-game";
import { COLORS, SAFE, START } from "@/lib/game/constants";
import { HOMECOL, TRACK, YARD, YARD_SPOTS } from "@/lib/game/geometry";
import type { Color } from "@/lib/game/types";
import { themeOf, type Theme } from "@/lib/theme/themes";

function starPoints(cx: number, cy: number) {
  const pts: string[] = [];
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? 0.15 : 0.34;
    pts.push((cx + rr * Math.cos(a)).toFixed(3) + "," + (cy + rr * Math.sin(a)).toFixed(3));
  }
  return pts.join(" ");
}

/** The printed board. `paint(slot)` gives the colour a slot shows to this viewer. */
const BoardSurface = memo(function BoardSurface({ th, colorKey }: { th: Theme; colorKey: string }) {
  const shown = colorKey.split(",") as Color[];
  const hex = (slot: Color) => th.pieces[shown[COLORS.indexOf(slot)]];
  const light = (slot: Color) => th.light[shown[COLORS.indexOf(slot)]];
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

export function Board() {
  const game = useGame();
  const [settings] = useSettings();
  const th = themeOf(settings.theme);
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

  return (
    <div
      className="aspect-square w-full rounded-xl p-1.5 sm:p-2.5"
      style={{ background: th.frame, boxShadow: `0 14px 30px rgba(0,0,0,.4), inset 0 0 0 2px ${th.frameEdge}` }}
    >
      <svg viewBox="0 0 15 15" className="block h-full w-full touch-manipulation rounded-md" role="img" aria-label="Ludo board">
        <g ref={rotRef}>
          <BoardSurface th={th} colorKey={colorKey} />
          <g>
            {views.map((t) => (
              <g
                key={t.c + t.i}
                className={"token" + (t.movable ? " movable" : "") + (t.stepping ? " stepping" : "")}
                style={{ transform: `translate(${t.x}px,${t.y}px) scale(${t.scale})`, display: t.hidden ? "none" : undefined }}
              >
                <ellipse cx={0.03} cy={0.1} rx={0.34} ry={0.3} fill="rgba(0,0,0,.28)" />
                <circle r={0.34} stroke="#1b1b1b" strokeWidth={0.05} fill={hex(t.c)} />
                <circle r={0.17} fill="rgba(255,255,255,.85)" />
                <circle r={0.09} fill={hex(t.c)} />
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
