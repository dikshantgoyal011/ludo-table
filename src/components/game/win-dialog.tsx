"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useGame, useSettings } from "@/hooks/use-game";
import { NAMES } from "@/lib/game/constants";
import { themeOf } from "@/lib/theme/themes";
import { cn } from "@/lib/utils";
import { standings } from "./standings";

const ORDINAL = ["1st", "2nd", "3rd", "4th"];
const MEDAL = ["bg-[linear-gradient(145deg,#ffe9a0,#d9a73e)] text-[#3a2606]", "bg-[linear-gradient(145deg,#f4f6f8,#a9b2bd)] text-[#2b3138]", "bg-[linear-gradient(145deg,#f0c39a,#b06c35)] text-[#3a1d08]"];

/**
 * Result popup. When the game is over: final rankings for everyone, and two
 * choices: play again (in a friends room, back to its lobby, where the next
 * game starts) or the main menu. It stays until one is picked, and the board
 * stays as it was behind it. While others play on: only the player who just
 * finished sees it (their place).
 */
export function WinDialog() {
  const game = useGame();
  const router = useRouter();
  const [settings] = useSettings();
  const th = themeOf(settings.theme);
  const s = game.state;
  const first = s.winners[0];
  const final = game.winFinal;
  // Everyone at the table (with partners: each side), finishers in order, then the rest by how far they got.
  const rows = standings(game, final);
  const myPlace = rows.find((r) => r.you)?.place ?? -1;
  const sides = !!s.teams;
  const top = rows[0];

  const title = !final
    ? myPlace === 0
      ? "You finished 1st!"
      : `You finished ${ORDINAL[myPlace] || ""}!`
    : top?.you
      ? sides && top.name.includes("&")
        ? "Your side wins!"
        : "You win!"
      : `${top ? top.name : first ? s.seats[first]?.nick || NAMES[first] : "Someone"} ${sides && top?.name.includes("&") ? "win" : "wins"}!`;
  const sub = final && myPlace > 0 ? (sides ? "Your side came 2nd." : `You came ${ORDINAL[myPlace]}.`) : !final ? "The others are still playing." : sides ? "All eight pieces home." : "";

  return (
    <Dialog open={game.winOpen && !!first} onOpenChange={(o) => !o && !final && game.closeWinner()}>
      <DialogContent
        variant="center"
        className="items-center gap-3 p-6 text-center"
        // (The game is over: one of the two choices has to be made.)
        onInteractOutside={(e) => final && e.preventDefault()}
        onEscapeKeyDown={(e) => final && e.preventDefault()}
      >
        <div className="text-5xl leading-none" aria-hidden="true">
          {myPlace === 0 ? "🏆" : final ? "🎲" : "🏅"}
        </div>
        <DialogTitle className="text-3xl leading-tight font-extrabold">{title}</DialogTitle>
        <DialogDescription className={cn(sub ? "text-sm text-muted-foreground" : "sr-only")}>{sub || "Final positions"}</DialogDescription>
        <ol className="flex w-full flex-col gap-1.5 text-left">
          {rows.map(({ colors, place, note, name, you }) => (
            <li key={colors.join()} className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold", you ? "bg-primary/15 ring-1 ring-primary/50" : "bg-background/60")}>
              <span className={cn("flex h-6 min-w-9 items-center justify-center rounded-full px-1.5 text-xs font-extrabold", place !== null ? MEDAL[place] || "bg-secondary" : "bg-secondary text-muted-foreground")}>
                {place !== null ? ORDINAL[place] : "–"}
              </span>
              <span className="flex shrink-0 gap-0.5">
                {colors.map((c) => (
                  <span key={c} className="h-3 w-3 rounded-full" style={{ background: th.pieces[game.displayColor(c)] }} />
                ))}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {name}
                {you ? " (you)" : ""}
              </span>
              {note && <span className="shrink-0 text-xs font-semibold text-muted-foreground">{note}</span>}
            </li>
          ))}
        </ol>
        <div className="mt-2 flex w-full flex-col gap-2">
          {final ? (
            <Button
              size="lg"
              disabled={game.againAsked}
              onClick={() => {
                // (Rules not saved as my preferences: choose them again first.)
                const choose = game.againPath();
                if (!choose) return game.playAgain();
                game.closeWinner();
                router.push(choose);
              }}
            >
              {game.mode === "online" ? "Find another game" : game.againAsked ? "Back to the room…" : "Play again"}
            </Button>
          ) : (
            <Button size="lg" onClick={() => game.closeWinner()}>
              Watch the rest
            </Button>
          )}
          {!final && game.mode === "online" && (
            <Button size="lg" variant="outline" onClick={() => game.playAgain()}>
              Find another game
            </Button>
          )}
          <Button
            size="lg"
            variant="outline"
            onClick={() => {
              // The home page leaves the table once it's there (leaving first emptied this screen while it loaded).
              game.closeWinner();
              router.push("/");
            }}
          >
            Main menu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
