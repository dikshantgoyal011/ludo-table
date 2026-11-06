"use client";

// The board on the game screen, for every game: tokens moving, the ripples on
// tokens you can move, tapping them, and choosing how to move. What the board
// itself looks like comes from each game's own file (ludo-board.tsx, pachisi-board.tsx).
import { useEffect, useId, useRef, useState } from "react";
import { useGame, useSettings } from "@/hooks/use-game";
import type { TokenView } from "@/lib/game/controller";
import { COLORS } from "@/lib/game/constants";
import { GRACE_STEP } from "@/lib/game/pachisi/throws";
import type { Color, GameId, MoveChoice } from "@/lib/game/types";
import { themeOf } from "@/lib/theme/themes";
import { cn } from "@/lib/utils";
import { svgId, type BoardLook } from "./board-look";
import { useLudoLook } from "./ludo-board";
import { usePachisiLook } from "./pachisi-board";
import { useParchisLook } from "./parchis-board";

/** Ripples around tokens you can move. */
const RIPPLE_ON_LIGHT = { ring: "#24170f", edge: "rgba(255,255,255,.8)" };
const RIPPLE_ON_DARK = { ring: "#ffffff", edge: "rgba(0,0,0,.55)" };

export function Board() {
  const game = useGame();
  const [settings] = useSettings();
  const th = themeOf(settings.theme);
  const uid = svgId(useId());
  const rotRef = useRef<HTMLDivElement>(null);

  // Rotation is driven by the controller (animated only when you join).
  useEffect(() => {
    const apply = () => {
      const a = game.rot.angle;
      const el = rotRef.current;
      if (!el) return;
      el.style.transform = a ? `rotate(${a}deg)` : "";
      // Pachisi pawns aren't round: they turn back, so they stand upright however the board is turned.
      el.style.setProperty("--unturn", `${-a}deg`);
    };
    apply();
    return game.onRotate(apply);
  }, [game]);

  const colorKey = COLORS.map((c) => game.displayColor(c)).join(",");
  // Tokens keep a fixed drawing order: moving an element within the SVG would
  // cancel its slide, which made some moves jump. Movable tokens get their
  // ripples and tap target in a separate layer on top instead.
  const views = game.tokenViews();
  const movableViews = views.filter((t) => t.movable && !t.hidden);
  const hex = (slot: Color) => th.pieces[game.displayColor(slot)];
  const light = (slot: Color) => th.light[game.displayColor(slot)];
  // Each game's own board (all are worked out, so switching games keeps the hooks in order).
  const looks: Record<GameId, BoardLook> = {
    ludo: useLudoLook(colorKey, uid, game.rot.target),
    pachisi: usePachisiLook(hex, light, uid),
    parchis: useParchisLook(hex, light, uid),
  };
  const look = looks[game.state.game || "ludo"];
  const size = look.size;
  // Ripples dark on light squares, light on dark ones.
  const ripple = look.lightSquares ? RIPPLE_ON_LIGHT : RIPPLE_ON_DARK;

  // A token that can move more than one way (Pachisi: which throw to use; home or round again) asks how.
  const [pick, setPick] = useState<{ c: Color; i: number; seq: number; hand: string } | null>(null);
  const seq = game.state.last?.seq || 0;
  const hand = game.hand().join(",");
  const pickView = pick && pick.seq === seq && pick.hand === hand ? movableViews.find((t) => t.c === pick.c && t.i === pick.i) : undefined;
  const pickChoices = pickView ? game.choicesFor(pickView.c, pickView.i) : [];
  const tapToken = (t: TokenView) => {
    const choices = game.choicesFor(t.c, t.i);
    if (choices.length > 1) setPick({ c: t.c, i: t.i, seq, hand });
    else {
      setPick(null);
      game.move(t.c, t.i, choices[0] ? { use: choices[0].use, extra: choices[0].extra } : {});
    }
  };

  return (
    <div className={cn("relative aspect-square w-full rounded-xl", look.frameClass)} style={look.frame}>
      {look.corners}
      {/*
        Two layers: the printed board is drawn once and kept by the GPU; only the
        light token layer above it repaints while tokens move. (Repainting the
        whole board for every step of a token made phones stutter.)
      */}
      <div ref={rotRef} className="relative h-full w-full overflow-hidden rounded-md">
        <svg viewBox={`0 0 ${size} ${size}`} className="board-layer absolute inset-0 block h-full w-full" aria-hidden="true">
          {look.surface}
        </svg>
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="board-layer absolute inset-0 block h-full w-full touch-manipulation"
          role="img"
          aria-label={look.label}
          onClick={() => setPick(null)}
        >
          <g>
            {views.map((t) => (
              <g
                key={t.c + t.i}
                className={"token" + (t.movable ? " movable" : "") + (t.stepping ? " stepping" : "") + (t.returning ? " returning" : "")}
                style={{ transform: `translate(${t.x}px,${t.y}px) scale(${t.scale})`, display: t.hidden ? "none" : undefined }}
              >
                {look.token(hex(t.c), t.lying)}
              </g>
            ))}
          </g>
          {/* Tokens you can move: ripples and the tap target, above every token. */}
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
                  e.stopPropagation();
                  (e.currentTarget as SVGGElement).blur();
                  tapToken(t);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    tapToken(t);
                  }
                }}
              >
                {/* Dark on a light board, light on a dark one, each with a thin edge of the other so it also shows on coloured squares */}
                {/* Two ripples half a beat apart, so there's always one spreading out */}
                {["", " late"].map((k) => (
                  <g key={k} className={"token-ripple" + k}>
                    <circle r={0.42} fill="none" stroke={ripple.edge} strokeWidth={0.15} />
                    <circle r={0.42} fill="none" stroke={ripple.ring} strokeWidth={0.09} />
                  </g>
                ))}
                <circle r={0.62} fill="transparent" />
              </g>
            ))}
          </g>
        </svg>
        {pickView && pickChoices.length > 1 && (
          <MoveChooser
            t={pickView}
            size={size}
            angle={game.rot.target}
            choices={pickChoices}
            onPick={(ch) => {
              setPick(null);
              game.move(pickView.c, pickView.i, { use: ch.use, extra: ch.extra });
            }}
          />
        )}
      </div>
    </div>
  );
}

/** What a choice does, in a word or two. */
function choiceLabel(ch: MoveChoice, all: MoveChoice[]) {
  const throws = new Set(all.map((o) => o.use)).size > 1;
  // This throw can take it home or round again.
  const twoWays = all.some((o) => o.use === ch.use && !!o.extra !== !!ch.extra);
  const way = ch.extra ? "Round again" : "Head home";
  const by = ch.use === GRACE_STEP ? "Grace · 1 square" : `Move ${ch.use}`;
  if (!throws) return twoWays ? way : by;
  return twoWays ? `${by} · ${way.toLowerCase()}` : by;
}

/**
 * Next to a token: how to move it. Kept upright and on the board however the
 * board is turned (it opens below tokens near the top, and inwards near the sides).
 */
function MoveChooser({ t, size, angle, choices, onPick }: { t: TokenView; size: number; angle: number; choices: MoveChoice[]; onPick: (ch: MoveChoice) => void }) {
  const r = (angle * Math.PI) / 180;
  const dx = t.x - size / 2;
  const dy = t.y - size / 2;
  const sx = Math.cos(r) * dx - Math.sin(r) * dy;
  const sy = Math.sin(r) * dx + Math.cos(r) * dy;
  const below = sy < 0;
  const align = sx < -size * 0.22 ? "left" : sx > size * 0.22 ? "right" : "center";
  return (
    <div className="absolute z-10 size-0" style={{ left: `${(t.x / size) * 100}%`, top: `${(t.y / size) * 100}%`, transform: "rotate(var(--unturn, 0deg))" }}>
      <div
        role="menu"
        aria-label="How to move"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "badge-pop absolute flex flex-col gap-1 rounded-xl bg-paper p-1.5 shadow-[0_6px_18px_rgba(0,0,0,.45)]",
          below ? "top-4" : "bottom-4",
          align === "left" ? "-left-3" : align === "right" ? "-right-3" : "left-1/2 -translate-x-1/2",
        )}
      >
        {choices.map((ch) => (
          <button
            key={`${ch.use}${!!ch.extra}`}
            type="button"
            role="menuitem"
            onClick={() => onPick(ch)}
            className="h-9 rounded-lg bg-primary px-3 text-sm font-bold whitespace-nowrap text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
          >
            {choiceLabel(ch, choices)}
          </button>
        ))}
      </div>
    </div>
  );
}
