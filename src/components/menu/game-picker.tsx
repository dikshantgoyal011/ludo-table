"use client";

import { useEffect, useRef } from "react";
import { VARIANTS } from "@/lib/game/variants";
import { cn } from "@/lib/utils";
import { MiniBoard } from "./mini-board";

/**
 * The game strip at the top of the home and setup screens: the same heading,
 * cards and position on both, so moving between them doesn't jump or resize.
 */
export function GameStrip({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-sm font-bold tracking-[0.2em] text-primary uppercase">Every Ludo ever played</h2>
        <span className="hidden text-xs text-muted-foreground sm:inline lg:hidden">Swipe to see them all</span>
      </div>
      <GamePicker selected={selected} onSelect={onSelect} />
    </div>
  );
}

/**
 * Every game in a row you can swipe through. `compact`: small chips (setup
 * screens), otherwise cards (home page). Games not built yet are faded and
 * marked "Soon", but can still be picked to preview them.
 */
export function GamePicker({ selected, onSelect, compact = false }: { selected: string; onSelect: (id: string) => void; compact?: boolean }) {
  const rowRef = useRef<HTMLDivElement>(null);

  // Keep the chosen game in view.
  useEffect(() => {
    const el = rowRef.current?.querySelector<HTMLElement>(`[data-game="${selected}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [selected]);

  return (
    <div
      ref={rowRef}
      role="tablist"
      aria-label="Choose a game"
      className={cn("-mx-3 flex snap-x snap-mandatory scroll-px-3 gap-2.5 overflow-x-auto px-3 pt-1.5 pb-2 sm:scroll-px-0 [scrollbar-width:none] sm:mx-0 sm:px-0", compact ? "gap-2" : "lg:grid lg:grid-cols-7 lg:overflow-visible")}
    >
      {VARIANTS.map((v) => {
        const on = v.id === selected;
        return (
          <button
            key={v.id}
            type="button"
            role="tab"
            data-game={v.id}
            aria-selected={on}
            onClick={() => onSelect(v.id)}
            className={cn(
              "group relative shrink-0 snap-start rounded-2xl border text-left transition outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[.97]",
              compact ? "flex items-center gap-2 py-1.5 pr-3 pl-1.5" : "flex w-[124px] flex-col gap-1.5 p-2 sm:w-[150px] sm:gap-2 sm:p-2.5 lg:w-auto",
              on
                ? "border-primary bg-[linear-gradient(160deg,rgb(var(--c-panel)),rgb(var(--c-felt2)))] shadow-[0_0_0_1px_rgb(var(--c-gold)/.5),0_8px_22px_rgba(0,0,0,.35)]"
                : "border-border bg-card/70 hover:border-primary/60",
            )}
          >
            <span
              className={cn("block shrink-0 rounded-xl p-1 shadow-inner", compact ? "h-8 w-8" : "h-11 w-full p-1 sm:h-14 sm:p-1.5", !v.ready && "opacity-55 grayscale-[45%]")}
              // Ludo, the game everyone knows, sits in the theme's own colours; the others in their era's.
              style={{
                background:
                  v.id === "ludo"
                    ? "radial-gradient(circle at 50% 30%, rgb(var(--c-panel)), rgb(var(--c-felt)))"
                    : `radial-gradient(circle at 50% 30%, ${v.tint[0]}cc, ${v.tint[0]})`,
              }}
            >
              <span className={cn("mx-auto block h-full", !compact && "w-11 sm:w-14")}>
                <MiniBoard kind={v.board} accent={v.tint[1]} />
              </span>
            </span>
            <span className={cn("flex min-w-0 flex-col", !v.ready && !on && "opacity-60")}>
              <span className={cn("truncate leading-tight font-extrabold", compact ? "text-sm" : "text-[15px] sm:text-base")}>{v.name}</span>
              {!compact && <span className="truncate text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{v.origin}</span>}
            </span>
            {!v.ready && (
              <span
                className={cn(
                  "absolute rounded-full border border-primary/60 bg-background/90 font-extrabold tracking-[0.14em] text-primary uppercase shadow",
                  compact ? "-top-1.5 -right-1 px-1.5 py-px text-[9px]" : "top-1.5 right-1.5 px-2 py-0.5 text-[10px]",
                )}
              >
                Soon
              </span>
            )}
            {on && !compact && <span className="absolute inset-x-6 -bottom-px h-[3px] rounded-full bg-primary" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
