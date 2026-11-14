"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { rememberGame } from "@/components/menu/menu-screen";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useGame, useSettings } from "@/hooks/use-game";
import { defaultAvatar } from "@/lib/avatars";
import { NAMES } from "@/lib/game/constants";
import type { Color } from "@/lib/game/types";
import { themeOf } from "@/lib/theme/themes";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
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
  // Who's crowned: the winner (with partners, the winning side's players); a player who has just finished, while the rest play on, gets their medal.
  const crowned = final || myPlace === 0;
  const hero = (final ? top?.colors : rows.find((r) => r.you)?.colors) || [];
  const faces = [...new Map(hero.map((c) => [s.seats[c]?.id || c, c] as const)).values()];
  const many = faces.length > 1;
  const sub = final && myPlace > 0 ? (sides ? "Your side came 2nd." : `You came ${ORDINAL[myPlace]}.`) : !final ? "The others are still playing." : sides ? "All eight pieces home." : "";

  return (
    <Dialog open={game.winOpen && !!first} onOpenChange={(o) => !o && !final && game.closeWinner()}>
      <DialogContent
        variant="center"
        className="win-card items-center gap-3 p-6 pt-4 text-center"
        // (The game is over: one of the two choices has to be made.)
        onInteractOutside={(e) => final && e.preventDefault()}
        onEscapeKeyDown={(e) => final && e.preventDefault()}
      >
        <div className="win-stage" aria-hidden="true">
          <span className="win-rays" />
          <span className="win-glow" />
          {crowned && (
            <>
              <span className="win-spark" style={{ left: "8%", top: "28%" }}>✦</span>
              <span className="win-spark" style={{ right: "6%", top: "18%", animationDelay: "-0.8s" }}>✦</span>
              <span className="win-spark" style={{ right: "14%", bottom: "8%", animationDelay: "-1.5s" }}>✧</span>
            </>
          )}
          <span className="win-hero">
            {crowned && <CrownArt className="win-crown" />}
            <span className="flex">
              {faces.map((c, k) => (
                <span key={c} className={cn("win-face", many && k > 0 && "-ml-5", many && "size-20")}>
                  <Avatar av={faceOf(game, c)} className="size-full" />
                </span>
              ))}
            </span>
            {!crowned && myPlace > 0 && <span className={cn("win-medal", MEDAL[myPlace] || "bg-secondary")}>{ORDINAL[myPlace]}</span>}
          </span>
        </div>
        {crowned && <div className="win-ribbon brand-title">{many ? "Champions of the Darbar" : "Champion of the Darbar"}</div>}
        <DialogTitle className="brand-title brand-gold text-4xl leading-tight">{title}</DialogTitle>
        <DialogDescription className={cn(sub ? "text-sm text-muted-foreground" : "sr-only")}>{sub || "Final positions"}</DialogDescription>
        <ol className="flex w-full flex-col gap-1.5 text-left">
          {rows.map(({ colors, place, note, name, you }) => (
            <li
              key={colors.join()}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold",
                place === 0 ? "bg-[linear-gradient(90deg,rgb(var(--c-gold)/.28),rgb(var(--c-gold)/.08))] ring-1 ring-primary/60" : you ? "bg-primary/15 ring-1 ring-primary/50" : "bg-background/60",
              )}
            >
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
                // (The setup screen opens on this game.)
                rememberGame(s.game || "ludo");
                router.push(choose, { scroll: false });
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
              router.push("/", { scroll: false });
            }}
          >
            Main menu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The picture of the player at seat c (the computer's own, vs computer). */
function faceOf(game: ReturnType<typeof useGame>, c: Color): number | "bot" {
  const seat = game.state.seats[c];
  if (game.isYou(c)) return game.myLooks().av ?? 0;
  if (seat?.bot && !seat.takeover) return "bot";
  return seat?.av ?? defaultAvatar(seat?.id || c);
}

/** The champion's crown: gold, with jewels and pearls. */
function CrownArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 44" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="crownGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3c4" />
          <stop offset=".45" stopColor="#f2c14e" />
          <stop offset="1" stopColor="#a8741c" />
        </linearGradient>
      </defs>
      <path d="M6 38 L3 12 L18 24 L32 4 L46 24 L61 12 L58 38 Z" fill="url(#crownGold)" stroke="#7a4f0e" strokeWidth="1.6" strokeLinejoin="round" />
      <rect x="5" y="34" width="54" height="8" rx="2.5" fill="url(#crownGold)" stroke="#7a4f0e" strokeWidth="1.6" />
      <circle cx="3" cy="11" r="3" fill="#fff6dc" stroke="#7a4f0e" strokeWidth="1.2" />
      <circle cx="32" cy="4" r="3.4" fill="#fff6dc" stroke="#7a4f0e" strokeWidth="1.2" />
      <circle cx="61" cy="11" r="3" fill="#fff6dc" stroke="#7a4f0e" strokeWidth="1.2" />
      <path d="M32 18 l5 7 -5 7 -5 -7 Z" fill="#e5484d" stroke="#7a1d1d" strokeWidth="1.2" />
      <circle cx="17" cy="29" r="3" fill="#2fb36b" stroke="#145c35" strokeWidth="1.1" />
      <circle cx="47" cy="29" r="3" fill="#2f7fd6" stroke="#173f6b" strokeWidth="1.1" />
      <circle cx="16" cy="38" r="1.8" fill="#e5484d" />
      <circle cx="32" cy="38" r="1.8" fill="#2fb36b" />
      <circle cx="48" cy="38" r="1.8" fill="#e5484d" />
    </svg>
  );
}
