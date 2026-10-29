"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/hooks/use-game";
import { playSound } from "@/lib/audio/sfx";
import { COLORS } from "@/lib/game/constants";
import { THEME_IDS, THEMES } from "@/lib/theme/themes";
import { uiStore, useUi } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">{children}</h3>;
}

export function SettingsDialog() {
  const { settingsOpen } = useUi();
  const [settings, save] = useSettings();

  return (
    <Dialog open={settingsOpen} onOpenChange={(o) => uiStore.set({ settingsOpen: o })}>
      <DialogContent className="max-h-[88vh]">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="sr-only">Theme, token movement and sounds</DialogDescription>
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              Done
            </Button>
          </DialogClose>
        </div>
        <div className="flex flex-col gap-5 overflow-y-auto overscroll-contain px-4 py-4">
          <section className="flex flex-col gap-2">
            <SectionTitle>Theme</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              {THEME_IDS.map((key) => {
                const th = THEMES[key];
                const on = settings.theme === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => save({ ...settings, theme: key })}
                    className={cn(
                      "flex flex-col items-start gap-2 rounded-xl border-2 p-2.5 text-left text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
                      on ? "border-primary" : "border-transparent",
                    )}
                    style={{ background: th.bg, color: `rgb(${th.vars.ink})` }}
                  >
                    <span className="flex gap-1">
                      {COLORS.map((c) => (
                        <span key={c} className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10" style={{ background: th.pieces[c] }} />
                      ))}
                    </span>
                    <span>
                      {on ? "✓ " : ""}
                      {th.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <SectionTitle>Token movement</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  [true, "Step by step", "Hops square by square"],
                  [false, "Glide", "Slides straight to the square"],
                ] as const
              ).map(([val, label, hint]) => {
                const on = settings.steps === val;
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => save({ ...settings, steps: val })}
                    className={cn(
                      "flex flex-col items-start gap-0.5 rounded-xl border-2 bg-secondary p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
                      on ? "border-primary" : "border-transparent",
                    )}
                  >
                    <span className="text-sm font-bold">
                      {on ? "✓ " : ""}
                      {label}
                    </span>
                    <span className="text-xs text-muted-foreground">{hint}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="flex flex-col gap-1">
            <SectionTitle>Sound</SectionTitle>
            <label className="flex items-center justify-between gap-3 px-1 py-2 text-sm font-semibold">
              <span>Game sounds</span>
              <Switch
                checked={settings.sound.all}
                onCheckedChange={(v) => {
                  save({ ...settings, sound: { ...settings.sound, all: v } });
                  if (v) playSound("dice");
                }}
              />
            </label>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
