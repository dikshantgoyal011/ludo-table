"use client";

import { useEffect, useState } from "react";
import { GraduationCap, RotateCcw } from "lucide-react";
import { openTutorial } from "@/components/tutorial/tutorial";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { getController, useGame } from "@/hooks/use-game";
import { uiStore, useUi } from "@/lib/ui-store";

// The phone's Back button must not drop a player out of a game. While a game is
// on, an extra history entry sits on top of the game page: Back uses it up, and
// instead of leaving we put it back and ask "Leave this game?".
let armedAt = "";
let leaving = false;

function arm() {
  if (armedAt) return;
  window.history.pushState({ ...window.history.state, ludoGuard: true }, "");
  armedAt = window.location.href;
}
function disarm() {
  const was = armedAt;
  armedAt = "";
  // Game over (still on this page): drop the extra entry so Back works in one press again.
  if (was && !leaving && window.location.href === was && window.history.state?.ludoGuard) window.history.back();
}

/** Ask before leaving a game in progress when the player presses Back. */
export function useBackGuard() {
  const game = useGame();
  const guard = game.leaveNeedsConfirm();
  useEffect(() => {
    if (!guard) return;
    leaving = false;
    arm();
    const onBack = () => {
      armedAt = "";
      arm();
      // Back closes an open sheet first, like it does in apps.
      const g = getController();
      if (g.chatOpen) g.closeChat();
      else if (uiStore.get().tutorial) uiStore.set({ tutorial: null });
      else if (uiStore.get().profileOf) uiStore.set({ profileOf: null });
      else if (uiStore.get().settingsOpen) uiStore.set({ settingsOpen: false });
      else uiStore.set({ leaveOpen: "back" });
    };
    window.addEventListener("popstate", onBack);
    return () => {
      window.removeEventListener("popstate", onBack);
      disarm();
    };
  }, [guard]);
}

/**
 * The game menu: Keep playing, Restart, Leave. Opened by the Menu button (and the
 * title) as "Game menu", and by the phone's Back button as "Leave this game?".
 */
export function LeaveDialog() {
  const game = useGame();
  const router = useRouter();
  const ui = useUi();
  const [sure, setSure] = useState(false);
  const close = () => {
    setSure(false);
    uiStore.set({ leaveOpen: false });
  };
  const open = !!ui.leaveOpen && game.leaveNeedsConfirm();
  const fromBack = ui.leaveOpen === "back";
  // Restart: on this phone (vs computer, pass-and-play) or, by the room's creator, for the whole friends table. Not online with strangers.
  const canRestart = game.mode === "computer" || game.mode === "local" || (game.mode === "friends" && game.canRunTable());

  const what =
    game.mode === "local"
      ? "Leaving? You can pick this game up again from the home screen for the next hour."
      : game.mode === "computer"
        ? "Leaving ends this game."
        : "If you leave, the others keep playing and the computer takes over your tokens.";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent variant="center" className="items-center gap-3 p-6 text-center">
        <DialogTitle className="text-2xl leading-tight font-extrabold">{fromBack ? "Leave this game?" : "Game menu"}</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">{what}</DialogDescription>
        <div className="mt-2 flex w-full flex-col gap-2">
          <Button size="lg" onClick={close}>
            Keep playing
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => {
              close();
              openTutorial(game.state.game || "ludo");
            }}
          >
            <GraduationCap className="size-4" /> How to play
          </Button>
          {canRestart &&
            (!sure ? (
              <Button size="lg" variant="outline" onClick={() => setSure(true)}>
                <RotateCcw className="size-4" /> Restart game
              </Button>
            ) : (
              // One more tap, so a game isn't thrown away by accident
              <div className="flex flex-col gap-2 rounded-xl border border-border bg-background/50 p-3">
                <span className="text-sm font-semibold">
                  {game.mode === "friends" ? "Start over for everyone at the table?" : "Start over? All tokens go back home."}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => setSure(false)}>
                    No
                  </Button>
                  <Button
                    onClick={() => {
                      close();
                      game.reset();
                    }}
                  >
                    Yes, restart
                  </Button>
                </div>
              </div>
            ))}
          <Button
            size="lg"
            variant="destructive"
            onClick={() => {
              close();
              leaving = true;
              game.exitToMenu();
              router.replace("/");
            }}
          >
            Leave game
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
