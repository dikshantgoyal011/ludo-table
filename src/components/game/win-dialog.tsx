"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useGame, useSettings } from "@/hooks/use-game";
import { COLORS, NAMES } from "@/lib/game/constants";
import { progress } from "@/lib/game/luck";
import type { Color } from "@/lib/game/types";
import { themeOf } from "@/lib/theme/themes";
import { cn } from "@/lib/utils";

const ORDINAL = ["1st", "2nd", "3rd", "4th"];
const MEDAL = ["bg-[linear-gradient(145deg,#ffe9a0,#d9a73e)] text-[#3a2606]", "bg-[linear-gradient(145deg,#f4f6f8,#a9b2bd)] text-[#2b3138]", "bg-[linear-gradient(145deg,#f0c39a,#b06c35)] text-[#3a1d08]"];

/**
 * Result popup. When the game is over: final rankings for everyone. While
 * others play on: only the player who just finished sees it (their place).
 */
export function WinDialog() {
  const game = useGame();
  const router = useRouter();
  const [settings] = useSettings();
  const th = themeOf(settings.theme);
  const s = game.state;
  const first = s.winners[0];
  const final = game.winFinal;
  const me = COLORS.find((c) => s.seats[c] && game.isYou(c));
  const myPlace = me ? s.winners.indexOf(me) : -1;

  // Everyone at the table: finishers in order, then the rest by how far they got.
  const rest = COLORS.filter((c) => s.seats[c] && !s.winners.includes(c)).sort((a, b) => progress(s, b) - progress(s, a));
  const rows: { c: Color; place: number | null; note: string }[] = [
    ...s.winners.map((c, k) => ({ c, place: k, note: "" })),
    ...rest.map((c) => ({ c, place: null, note: s.seats[c]?.out ? "Out" : final ? "" : "Still playing" })),
  ];
  const name = (c: Color) => (s.seats[c]?.nick || NAMES[c]) + (game.isYou(c) ? " (you)" : "");

  const title = !final
    ? myPlace === 0
      ? "You finished 1st!"
      : `You finished ${ORDINAL[myPlace] || ""}!`
    : first && game.isYou(first)
      ? "You win!"
      : `${first ? s.seats[first]?.nick || NAMES[first] : "Someone"} wins!`;
  const sub = final && myPlace > 0 ? `You came ${ORDINAL[myPlace]}.` : !final ? "The others are still playing." : "";

  return (
    <Dialog open={game.winOpen && !!first} onOpenChange={(o) => !o && game.closeWinner()}>
      <DialogContent variant="center" className="items-center gap-3 p-6 text-center">
        <div className="text-5xl leading-none" aria-hidden="true">
          {myPlace === 0 ? "🏆" : final ? "🎲" : "🏅"}
        </div>
        <DialogTitle className="text-3xl leading-tight font-extrabold">{title}</DialogTitle>
        <DialogDescription className={cn(sub ? "text-sm text-muted-foreground" : "sr-only")}>{sub || "Final positions"}</DialogDescription>
        <ol className="flex w-full flex-col gap-1.5 text-left">
          {rows.map(({ c, place, note }) => (
            <li key={c} className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold", game.isYou(c) ? "bg-primary/15 ring-1 ring-primary/50" : "bg-background/60")}>
              <span className={cn("flex h-6 min-w-9 items-center justify-center rounded-full px-1.5 text-xs font-extrabold", place !== null ? MEDAL[place] || "bg-secondary" : "bg-secondary text-muted-foreground")}>
                {place !== null ? ORDINAL[place] : "–"}
              </span>
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: th.pieces[game.displayColor(c)] }} />
              <span className="min-w-0 flex-1 truncate">{name(c)}</span>
              {note && <span className="shrink-0 text-xs font-semibold text-muted-foreground">{note}</span>}
            </li>
          ))}
        </ol>
        <div className="mt-2 flex w-full flex-col gap-2">
          {final ? (
            <Button size="lg" onClick={() => game.playAgain()}>
              {game.mode === "online" ? "Find another game" : "Play again"}
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
              game.exitToMenu();
              router.push("/");
            }}
          >
            Back to menu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
