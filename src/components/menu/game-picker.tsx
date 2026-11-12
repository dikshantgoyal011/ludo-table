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
      <div className="strip-heading flex items-end justify-between gap-3">
        <h2 className="text-sm font-bold tracking-[0.2em] text-primary uppercase">Choose a game</h2>
        <span className="hidden text-xs text-muted-foreground sm:inline lg:hidden">Swipe to see them all</span>
      </div>
      <GamePicker selected={selected} onSelect={onSelect} />
    </div>
  );
}

/**
 * Every game in a row you can swipe through: small chips on a phone (so the
 * ways to play fit on the screen below), cards from tablets up. Games not built
 * yet are faded and marked "Soon", but can still be picked to preview them.
 */
export function GamePicker({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  const rowRef = useRef<HTMLDivElement>(null);

  // Keep the chosen game in view (sideways only: never moves the page). Measured once the screen is
  // drawn: measuring while it's being put up made the browser lay the whole new page out an extra time.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const row = rowRef.current;
      const el = row?.querySelector<HTMLElement>(`[data-game="${selected}"]`);
      if (!row || !el) return;
      const left = el.offsetLeft - row.offsetLeft;
      if (left < row.scrollLeft || left + el.offsetWidth > row.scrollLeft + row.clientWidth)
        row.scrollTo({ left: Math.max(0, left - 12), behavior: "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [selected]);

  return (
    <div
      ref={rowRef}
      role="tablist"
      aria-label="Choose a game"
      className="-mx-3 flex snap-x snap-mandatory scroll-px-3 gap-2 overflow-x-auto px-3 pt-1.5 pb-2 [scrollbar-width:none] sm:mx-0 sm:scroll-px-0 sm:gap-2.5 sm:px-0 lg:grid lg:grid-cols-7 lg:overflow-visible"
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
              "hover-lift group relative flex shrink-0 snap-start items-center gap-2 rounded-2xl border py-1.5 pr-3 pl-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[.97]",
              "sm:w-[150px] sm:flex-col sm:items-stretch sm:gap-2 sm:p-2.5 lg:w-auto",
              on
                ? "border-primary bg-[linear-gradient(160deg,rgb(var(--c-panel)),rgb(var(--c-felt2)))] shadow-[0_0_0_1px_rgb(var(--c-gold)/.5),0_8px_22px_rgba(0,0,0,.35)]"
                : "border-border bg-card/70 hover:border-primary/60",
            )}
          >
            <span
              className={cn("block h-8 w-8 shrink-0 rounded-xl p-1 shadow-inner sm:h-12 sm:w-full sm:p-1.5", !v.ready && "opacity-55 grayscale-[45%]")}
              // Ludo, the game everyone knows, sits in the theme's own colours; the others in their era's.
              style={{
                background:
                  v.id === "ludo"
                    ? "radial-gradient(circle at 50% 30%, rgb(var(--c-panel)), rgb(var(--c-felt)))"
                    : `radial-gradient(circle at 50% 30%, ${v.tint[0]}cc, ${v.tint[0]})`,
              }}
            >
              <span className="mx-auto block h-full sm:w-12">
                <MiniBoard kind={v.board} accent={v.tint[1]} />
              </span>
            </span>
            <span className={cn("flex min-w-0 flex-col", !v.ready && !on && "opacity-60")}>
              <span className="truncate text-sm leading-tight font-extrabold sm:text-base">{v.name}</span>
              <span className="hidden truncate text-[11px] font-semibold tracking-wide text-muted-foreground uppercase sm:block">{v.origin}</span>
            </span>
            {!v.ready && (
              <span className="absolute -top-1.5 -right-1 rounded-full border border-primary/60 bg-background/90 px-1.5 py-px text-[9px] font-extrabold tracking-[0.14em] text-primary uppercase shadow sm:top-1.5 sm:right-1.5 sm:px-2 sm:py-0.5 sm:text-[10px]">
                Soon
              </span>
            )}
            {on && <span className="absolute inset-x-6 -bottom-px hidden h-[3px] rounded-full bg-primary sm:block" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
