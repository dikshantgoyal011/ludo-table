"use client";

import { useEffect } from "react";
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
      else if (uiStore.get().profileOf) uiStore.set({ profileOf: null });
      else if (uiStore.get().settingsOpen) uiStore.set({ settingsOpen: false });
      else uiStore.set({ leaveOpen: true });
    };
    window.addEventListener("popstate", onBack);
    return () => {
      window.removeEventListener("popstate", onBack);
      disarm();
    };
  }, [guard]);
}

/** "Leave this game?" — from Back, the Menu button or the title. */
export function LeaveDialog() {
  const game = useGame();
  const router = useRouter();
  const ui = useUi();
  const close = () => uiStore.set({ leaveOpen: false });
  const offline = game.mode === "computer" || game.mode === "local";
  const open = ui.leaveOpen && game.leaveNeedsConfirm();

  const what =
    game.mode === "local"
      ? "You can pick this game up again from the home screen for the next hour."
      : game.mode === "computer"
        ? "This game will end."
        : "The others keep playing, and the computer takes over your tokens.";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent variant="center" className="items-center gap-3 p-6 text-center">
        <DialogTitle className="text-2xl leading-tight font-extrabold">Leave this game?</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">{what}</DialogDescription>
        <div className="mt-2 flex w-full flex-col gap-2">
          <Button size="lg" onClick={close}>
            Keep playing
          </Button>
          {offline && (
            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                close();
                game.reset();
              }}
            >
              Restart game
            </Button>
          )}
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
