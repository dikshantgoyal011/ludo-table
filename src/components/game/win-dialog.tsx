"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useGame, useSettings } from "@/hooks/use-game";
import { themeOf } from "@/lib/theme/themes";

/** Winner popup: shown when the first player gets all tokens home, and again with final rankings. */
export function WinDialog() {
  const game = useGame();
  const router = useRouter();
  const [settings] = useSettings();
  const th = themeOf(settings.theme);
  const s = game.state;
  const first = s.winners[0];
  const seat = first ? s.seats[first] : undefined;
  const meWon = !!first && game.isYou(first);

  return (
    <Dialog open={game.winOpen && !!first} onOpenChange={(o) => !o && game.closeWinner()}>
      <DialogContent variant="center" className="items-center gap-3 p-6 text-center">
        <div className="text-5xl leading-none" aria-hidden="true">
          🏆
        </div>
        <DialogTitle className="text-3xl leading-tight font-extrabold">{meWon ? "You win!" : `${seat?.nick || "Someone"} wins!`}</DialogTitle>
        <DialogDescription className="sr-only">Final positions</DialogDescription>
        <ol className="flex w-full flex-col gap-1.5 text-left">
          {s.winners.map((c, k) => (
            <li key={c} className="flex items-center gap-2 rounded-lg bg-background/60 px-3 py-2 text-sm font-bold">
              <span className="w-6 text-muted-foreground">#{k + 1}</span>
              <span className="h-3 w-3 rounded-full" style={{ background: th.pieces[game.displayColor(c)] }} />
              <span className="truncate">{s.seats[c]?.nick || c}</span>
            </li>
          ))}
        </ol>
        <div className="mt-2 flex w-full flex-col gap-2">
          <Button size="lg" onClick={() => game.playAgain()}>
            {game.mode === "online" ? "Find another game" : "Play again"}
          </Button>
          {!game.winFinal && (
            <Button size="lg" variant="outline" onClick={() => game.closeWinner()}>
              Continue game
            </Button>
          )}
          <Button
            size="lg"
            variant="outline"
            onClick={() => {
              game.exitToMenu();
              router.push("/ludo");
            }}
          >
            Back to menu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
