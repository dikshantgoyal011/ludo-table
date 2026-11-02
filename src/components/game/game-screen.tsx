"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useGame } from "@/hooks/use-game";
import { cn } from "@/lib/utils";
import { Board } from "./board";
import { ChatDialog } from "./chat-dialog";
import { LeaveDialog, useBackGuard } from "./leave-dialog";
import { PlayerTag } from "./player-tag";
import { ProfileDialog } from "./profile-dialog";
import { PlayersPanel, TurnCard } from "./side-panel";
import { WinDialog } from "./win-dialog";

export function GameScreen() {
  const game = useGame();
  const net = game.isNet();
  const playing = game.loaded && game.state.phase === "playing";
  useBackGuard();

  // While a game is on, the screen is locked to one phone screen: nothing scrolls,
  // the board takes the room that's left (see .in-game in globals.css).
  useEffect(() => {
    if (!playing) return;
    // Notes from before the start ("Tap Invite…") are done with.
    if (game.banner) game.setBanner("");
    document.documentElement.classList.add("in-game");
    return () => document.documentElement.classList.remove("in-game");
  }, [playing]);

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", playing && "flex-1")}>
      {net && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              game.net.kind === "ok" ? "bg-[#4ade80]" : game.net.kind === "bad" ? "bg-[#f87171]" : "bg-muted-foreground",
            )}
          />
          <span className="truncate">{game.net.text}</span>
        </div>
      )}
      {game.banner && (playing ? <Toast text={game.banner} /> : <div className="rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-sm break-words">{game.banner}</div>)}

      <div className={cn("grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6", playing && "min-h-0 flex-1")}>
        {/* Board with a name tag at each corner */}
        <div className={cn("mx-auto flex w-full max-w-[min(100%,640px)] flex-col gap-2", playing && "min-h-0 justify-center")}>
          <div className="grid grid-cols-2 gap-2">
            <PlayerTag corner={0} />
            <PlayerTag corner={1} />
          </div>
          <div className="board-fit">
            <div className="board-size">
              <Board />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <PlayerTag corner={3} />
            <PlayerTag corner={2} />
          </div>
        </div>

        {/* During play the corner tags say it all; on phones the side panel only comes back after the game. */}
        <aside className={cn("min-w-0 flex-col gap-3", playing ? "hidden min-h-0 overflow-y-auto lg:flex" : "flex")}>
          {!playing && <TurnCard />}
          <PlayersPanel />
        </aside>
      </div>

      <ChatDialog />
      <WinDialog />
      <LeaveDialog />
      <ProfileDialog />
    </div>
  );
}

/** A note over the game (it mustn't push the board around); fades after a few seconds or on a tap. */
function Toast({ text }: { text: string }) {
  const [hidden, setHidden] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setHidden(text), 6000);
    return () => clearTimeout(t);
  }, [text]);
  if (hidden === text) return null;
  return (
    <button
      type="button"
      onClick={() => setHidden(text)}
      className="toast-in fixed inset-x-3 top-[calc(env(safe-area-inset-top,0px)+4.25rem)] z-40 mx-auto flex max-w-md items-start gap-2 rounded-xl border border-primary/50 bg-card/95 px-3 py-2.5 text-left text-sm break-words shadow-[0_8px_24px_rgba(0,0,0,.45)] backdrop-blur"
    >
      <span className="min-w-0 flex-1">{text}</span>
      <X className="mt-0.5 size-4 shrink-0 opacity-70" aria-label="Close" />
    </button>
  );
}
