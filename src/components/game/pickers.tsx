"use client";

import { useSettings } from "@/hooks/use-game";
import { COLORS, NAMES, PLAYER_COUNTS } from "@/lib/game/constants";
import type { Color } from "@/lib/game/types";
import { themeOf } from "@/lib/theme/themes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** Four colour buttons. `disabled` colours are taken by someone else. */
export function ColorPicker({ value, onChange, disabled = [] }: { value: Color; onChange: (c: Color) => void; disabled?: Color[] }) {
  const [settings] = useSettings();
  const hex = themeOf(settings.theme).pieces;
  return (
    <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Color">
      {COLORS.map((c) => {
        const on = c === value;
        const off = disabled.includes(c) && !on;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={off}
            onClick={() => onChange(c)}
            className="flex h-11 items-center justify-center rounded-lg border-2 text-sm font-bold text-white outline-none active:scale-95 focus-visible:ring-2 focus-visible:ring-ink disabled:cursor-not-allowed"
            style={{ background: hex[c], borderColor: on ? "#f2c94c" : "transparent", opacity: off ? 0.2 : on ? 1 : 0.55 }}
          >
            {on ? "✓ " : ""}
            {NAMES[c]}
          </button>
        );
      })}
    </div>
  );
}

/** 2 / 3 / 4 players */
export function CountPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Number of players">
      {PLAYER_COUNTS.map((n) => (
        <Button
          key={n}
          role="radio"
          aria-checked={n === value}
          variant={n === value ? "default" : "outline"}
          className="h-10"
          onClick={() => onChange(n)}
        >
          {n} players
        </Button>
      ))}
    </div>
  );
}

/** A labelled group. A <div>, not a <label>: a label would forward clicks to its first button. */
export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
