"use client";

// Variations (Pachisi, Parchís, Chaupar): the list of switches (vs computer, this device,
// and the friends lobby, where only the room's creator changes them), and a short summary.
import { useEffect, useReducer } from "react";
import { Check, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useProfile } from "@/hooks/use-game";
import type { GameId } from "@/lib/game/types";
import { countOn, hasVariations, noVariations, plainRules, playsSolo, variationInfo, type Variations } from "@/lib/game/variations";
import { variantById } from "@/lib/game/variants";
import { openTutorial } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

/** "Traditional rules", or which variations are on. */
export function variationsSummary(game: GameId, v: Variations) {
  const on = variationInfo(game).filter((x) => v[x.id]).map((x) => x.title);
  return on.length ? on.join(" · ") : `${plainRules(game)} (no variations)`;
}

// The rules being chosen for the next game, per game, until it starts (then they're
// forgotten, unless saved as my preferences).
const drafts: Partial<Record<GameId, Variations>> = {};
const draftListeners = new Set<() => void>();
const draftChanged = () => draftListeners.forEach((fn) => fn());
/** The next game has started: its rules choice starts again from my preferences (or the standard rules). */
export function clearRulesChoice(game: GameId) {
  delete drafts[game];
  draftChanged();
}

/**
 * The rules picked for the next game of `game` (setup screens), and my saved
 * preferences: without them, every new game starts with the standard rules.
 */
export function useRulesChoice(game: GameId) {
  const [profile, save] = useProfile();
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    draftListeners.add(redraw);
    return () => {
      draftListeners.delete(redraw);
    };
  }, []);
  if (!hasVariations(game)) return { value: {} as Variations, set: () => {}, saved: false, setSaved: () => {} };
  const saved = profile.saveVariations[game];
  const value = drafts[game] ?? (saved ? profile.variations[game] : noVariations(game));
  return {
    value,
    saved,
    set(v: Variations) {
      drafts[game] = v;
      if (saved) save({ variations: { ...profile.variations, [game]: v } });
      draftChanged();
    },
    /** Save these rules as my preferences for this game (or stop: back to the standard rules next time). */
    setSaved(on: boolean) {
      // (This game keeps the rules on show either way.)
      drafts[game] = value;
      save({ saveVariations: { ...profile.saveVariations, [game]: on }, variations: { ...profile.variations, [game]: on ? value : noVariations(game) } });
    },
  };
}

/** "Save my preferences" for a game's rules: with it on, every new game uses them until they're changed. */
export function SavePreferences({ game, on, onChange }: { game: GameId; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border px-3 py-2.5", on ? "border-primary/60 bg-primary/10" : "border-dashed border-border")}>
      <div className="min-w-0 flex-1">
        <label htmlFor={`save-${game}`} className="block text-sm leading-tight font-bold">
          Save my preferences
        </label>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
          {on ? `Every new ${variantById(game).name} game uses these rules, until you change them.` : "Off: each new game starts with the standard rules."}
        </p>
      </div>
      <Switch id={`save-${game}`} checked={on} onCheckedChange={onChange} aria-label="Save my preferences" className="mt-0.5" />
    </div>
  );
}

/** Every variation with its switch, and a way to see it in How to play. Without `onChange` it only shows them (others in a friends room). */
export function VariationsList({ game, value, onChange, className }: { game: GameId; value: Variations; onChange?: (v: Variations) => void; className?: string }) {
  const info = variationInfo(game);
  // (Chaupar has none: only Solo or 2 vs 2.)
  if (!info.length) return null;
  const allOn = info.every((x) => value[x.id]);
  return (
    <ul className={cn("flex flex-col gap-1.5", className)}>
      {onChange && (
        // One switch for all of them.
        <li className="flex items-center gap-3 rounded-xl bg-foreground/5 px-3 py-2">
          <label htmlFor={`var-all-${game}`} className="min-w-0 flex-1 text-sm font-bold">
            All variations
            <span className="ml-1.5 text-xs font-semibold text-muted-foreground">{countOn(game, value)} of {info.length} on</span>
          </label>
          <Switch
            id={`var-all-${game}`}
            checked={allOn}
            onCheckedChange={(c) => onChange({ ...value, ...Object.fromEntries(info.map((x) => [x.id, c])) })}
            aria-label="All variations"
          />
        </li>
      )}
      {info.map((x) => {
        const on = !!value[x.id];
        const id = `var-${x.id}`;
        return (
          <li key={x.id} className={cn("flex items-start gap-3 rounded-xl border px-3 py-2.5", on ? "border-primary/60 bg-primary/10" : "border-border bg-background/50")}>
            <div className="min-w-0 flex-1">
              <label htmlFor={onChange ? id : undefined} className="block text-sm leading-tight font-bold">
                {x.title}
              </label>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{x.text}</p>
              {x.lesson && (
                <button
                  type="button"
                  onClick={() => openTutorial(game, x.lesson)}
                  className="mt-1 inline-flex items-center gap-1 rounded text-xs font-bold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <GraduationCap className="size-3.5" /> See how it plays
                </button>
              )}
            </div>
            {onChange ? (
              <Switch id={id} checked={on} onCheckedChange={(c) => onChange({ ...value, [x.id]: c })} aria-label={x.title} className="mt-0.5" />
            ) : (
              <span className={cn("mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-bold", on ? "bg-primary text-primary-foreground" : "bg-foreground/10 text-muted-foreground")}>
                {on ? "On" : "Off"}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Pachisi, Chaupar: Solo, or 2 vs 2 (two players: two colors each). Three
 * players always play solo. Without `onChange` it only shows the choice.
 */
export function SidesPicker({ value, players, onChange }: { value: Variations; players: number; onChange?: (v: Variations) => void }) {
  if (players === 3) return <p className="text-xs leading-snug text-muted-foreground">With three players, everyone plays solo.</p>;
  const options = [
    { alone: true, title: "Solo", text: players === 2 ? "One color each." : "Everyone plays on their own." },
    { alone: false, title: players === 2 ? "Two colors each" : "2 vs 2", text: players === 2 ? "You each play two colors, opposite each other." : "Team up with the player opposite you." },
  ];
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="How you play">
      {options.map((o) => {
        const on = playsSolo(value) === o.alone;
        return (
          <button
            key={String(o.alone)}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={!onChange && !on}
            onClick={() => onChange?.({ ...value, alone: o.alone })}
            className={cn(
              "flex flex-col gap-0.5 rounded-xl border-2 px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
              on ? "border-primary bg-primary/12" : "border-border bg-background/50",
              !onChange && !on && "opacity-45",
              onChange && "active:scale-[.98]",
            )}
          >
            <span className="flex items-center gap-1.5 text-sm leading-tight font-bold">
              {on && <Check className="size-3.5 shrink-0" strokeWidth={3} />}
              {o.title}
            </span>
            <span className="text-xs leading-snug text-muted-foreground">{o.text}</span>
          </button>
        );
      })}
    </div>
  );
}

const ABOUT: Partial<Record<GameId, string>> = {
  pachisi: "Pachisi is played a little differently from place to place. Turn on any rules you like.",
  parchis: "Parchís is played a few different ways. Turn on any rules you like.",
};

/** The variations screen before a game vs the computer or on this device. */
export function VariationsDialog({
  game,
  open,
  onClose,
  value,
  onChange,
  saved,
  onSave,
}: {
  game: GameId;
  open: boolean;
  onClose: () => void;
  value: Variations;
  onChange: (v: Variations) => void;
  saved: boolean;
  onSave: (on: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] gap-3 overflow-y-auto p-4 sm:max-w-lg sm:p-5">
        <DialogTitle>{variantById(game).name} variations</DialogTitle>
        <DialogDescription>
          {ABOUT[game]} All off: the {plainRules(game).toLowerCase()}.
        </DialogDescription>
        <VariationsList game={game} value={value} onChange={onChange} />
        <SavePreferences game={game} on={saved} onChange={onSave} />
        <Button size="lg" onClick={onClose}>
          <Check className="size-4" />
          Done
        </Button>
      </DialogContent>
    </Dialog>
  );
}
