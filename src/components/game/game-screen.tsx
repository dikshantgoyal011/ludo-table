"use client";

import { useGame } from "@/hooks/use-game";
import { cn } from "@/lib/utils";
import { Board } from "./board";
import { ChatDialog } from "./chat-dialog";
import { PlayerTag } from "./player-tag";
import { PlayersPanel, TurnCard } from "./side-panel";
import { WinDialog } from "./win-dialog";

export function GameScreen() {
  const game = useGame();
  const net = game.isNet();

  return (
    <>
      {net && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              game.net.kind === "ok" ? "bg-[#4ade80]" : game.net.kind === "bad" ? "bg-[#f87171]" : "bg-muted-foreground",
            )}
          />
          <span>{game.net.text}</span>
        </div>
      )}
      {game.banner && <div className="rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-sm break-words">{game.banner}</div>}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
        {/* Board with a name tag at each corner */}
        <div className="mx-auto flex w-full max-w-[min(100%,640px)] flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <PlayerTag corner={0} />
            <PlayerTag corner={1} />
          </div>
          <Board />
          <div className="grid grid-cols-2 gap-2">
            <PlayerTag corner={3} />
            <PlayerTag corner={2} />
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-3">
          {/* The turn box is only for before and after a game; during play the corner tags show whose turn it is. */}
          {!(game.loaded && game.state.phase === "playing") && <TurnCard />}
          <PlayersPanel />
        </aside>
      </div>

      <ChatDialog />
      <WinDialog />
    </>
  );
}
