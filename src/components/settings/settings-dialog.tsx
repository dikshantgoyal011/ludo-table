"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/hooks/use-game";
import { playSound } from "@/lib/audio/sfx";
import { COLORS } from "@/lib/game/constants";
import { BoardPreview } from "@/components/game/board";
import { BOARD_STYLE_IDS, BOARD_STYLES } from "@/lib/theme/boards";
import { THEME_IDS, THEMES, themeOf } from "@/lib/theme/themes";
import { uiStore, useUi } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">{children}</h3>;
}

/**
 * A choice card. The tick sits in the corner and is always there (just hidden
 * when not chosen), and labels stay on one line, so choosing something never
 * changes the size of anything.
 */
function Choice({ on, onClick, className, style, children }: { on: boolean; onClick: () => void; className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "relative min-w-0 rounded-xl border-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
        on ? "border-primary" : "border-transparent",
        className,
      )}
      style={style}
    >
      {children}
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1.5 right-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow transition-opacity",
          on ? "opacity-100" : "opacity-0",
        )}
      >
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    </button>
  );
}

export function SettingsDialog() {
  const { settingsOpen } = useUi();
  const [settings, save] = useSettings();

  return (
    <Dialog open={settingsOpen} onOpenChange={(o) => uiStore.set({ settingsOpen: o })}>
      <DialogContent className="max-h-[88vh]">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="sr-only">Theme, board, token movement and sounds</DialogDescription>
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
                  <Choice
                    key={key}
                    on={on}
                    onClick={() => save({ ...settings, theme: key })}
                    className="flex flex-col items-start gap-2 p-2.5 pr-7 text-sm font-bold"
                    style={{ background: th.bg, color: `rgb(${th.vars.ink})` }}
                  >
                    <span className="flex gap-1">
                      {COLORS.map((c) => (
                        <span key={c} className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10" style={{ background: th.pieces[c] }} />
                      ))}
                    </span>
                    <span className="block w-full truncate">{th.name}</span>
                  </Choice>
                );
              })}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <SectionTitle>Board</SectionTitle>
            <div className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-4">
              {(["auto", ...BOARD_STYLE_IDS] as const).map((key) => {
                const on = settings.board === key;
                const th = themeOf(settings.theme);
                const style = key === "auto" ? th.boardStyle : key;
                return (
                  <Choice key={key} on={on} onClick={() => save({ ...settings, board: key })} className="flex flex-col items-stretch gap-1.5 bg-secondary p-2">
                    <BoardPreview style={style} th={th} />
                    <span className="truncate text-xs leading-tight font-bold">{key === "auto" ? "Match theme" : BOARD_STYLES[key].name}</span>
                    <span className="truncate text-[11px] leading-tight text-muted-foreground">
                      {key === "auto" ? BOARD_STYLES[style].name : BOARD_STYLES[key].hint}
                    </span>
                  </Choice>
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
                  <Choice key={label} on={on} onClick={() => save({ ...settings, steps: val })} className="flex flex-col items-start gap-0.5 bg-secondary p-2.5 pr-7">
                    <span className="block w-full truncate text-sm font-bold">{label}</span>
                    <span className="block w-full truncate text-xs text-muted-foreground">{hint}</span>
                  </Choice>
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
