"use client";

// Pachisi variations: the list of switches (vs computer, this device, and the
// friends lobby, where only the room's creator changes them), and a short summary.
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { NO_VARIATIONS, VARIATION_INFO, type PachisiVariations } from "@/lib/game/pachisi/variations";
import { cn } from "@/lib/utils";

/** "Traditional rules", or which variations are on. */
export function variationsSummary(v: PachisiVariations) {
  const on = VARIATION_INFO.filter((x) => v[x.id]).map((x) => x.title);
  return on.length ? on.join(" · ") : "Traditional rules (no variations)";
}

/** Every variation with its switch. Without `onChange` it only shows them (others in a friends room). */
export function VariationsList({ value, onChange, className }: { value: PachisiVariations; onChange?: (v: PachisiVariations) => void; className?: string }) {
  return (
    <ul className={cn("flex flex-col gap-1.5", className)}>
      {VARIATION_INFO.map((x) => {
        const on = value[x.id];
        const id = `var-${x.id}`;
        return (
          <li key={x.id} className={cn("flex items-start gap-3 rounded-xl border px-3 py-2.5", on ? "border-primary/60 bg-primary/10" : "border-border bg-background/50")}>
            <div className="min-w-0 flex-1">
              <label htmlFor={onChange ? id : undefined} className="block text-sm leading-tight font-bold">
                {x.title}
              </label>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{x.text}</p>
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
 * Partners or everyone for themselves. Partners need two or four players; three
 * always play for themselves. Without `onChange` it only shows the choice.
 */
export function SidesPicker({ value, players, onChange }: { value: PachisiVariations; players: number; onChange?: (v: PachisiVariations) => void }) {
  if (players === 3) return <p className="text-xs leading-snug text-muted-foreground">With three players, everyone plays for themselves.</p>;
  const options = [
    { alone: false, title: players === 2 ? "A side each" : "Partners · 2 vs 2", text: players === 2 ? "Each of you plays both colors of one side." : "The player opposite you is your partner. A side wins with all 8 pieces home." },
    { alone: true, title: "Everyone for themselves", text: players === 2 ? "One color each." : "Each player plays their own color." },
  ];
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="How you play">
      {options.map((o) => {
        const on = value.alone === o.alone;
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

/** The variations screen before a game vs the computer or on this device. */
export function VariationsDialog({ open, onClose, value, onChange }: { open: boolean; onClose: () => void; value: PachisiVariations; onChange: (v: PachisiVariations) => void }) {
  const none = VARIATION_INFO.every((x) => !value[x.id]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] gap-3 overflow-y-auto p-4 sm:max-w-lg sm:p-5">
        <DialogTitle>Pachisi variations</DialogTitle>
        <DialogDescription>
          The rules of Pachisi differ from place to place. With everything off you play the traditional rules. Online games always use the traditional rules.
        </DialogDescription>
        <VariationsList value={value} onChange={onChange} />
        <div className="flex flex-wrap gap-2">
          <Button size="lg" className="flex-1" onClick={onClose}>
            <Check className="size-4" />
            Done
          </Button>
          <Button size="lg" variant="outline" disabled={none} onClick={() => onChange({ ...NO_VARIATIONS })}>
            All off
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
