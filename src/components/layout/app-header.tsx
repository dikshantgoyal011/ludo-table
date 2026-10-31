"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGame } from "@/hooks/use-game";
import { cleanRoomCode, MODES, newRoomCode } from "@/lib/game/constants";
import { uiStore } from "@/lib/ui-store";

export function AppHeader() {
  const game = useGame();
  const router = useRouter();
  const pathname = usePathname();
  const [roomOpen, setRoomOpen] = useState(false);
  const [code, setCode] = useState("");

  const onMenu = pathname === "/" || pathname === "/ludo";
  const inGame = pathname === "/game" || pathname.startsWith("/r/");
  const friends = inGame && game.mode === "friends";

  // Back to the home screen (from a game: only after "Leave game?" when others are playing).
  const goMenu = () => {
    if (inGame && !game.requestMenu()) return;
    game.exitToMenu();
    router.push("/");
  };

  const joinRoom = () => {
    const v = cleanRoomCode(code);
    if (v.length < 3) {
      game.setBanner("Room codes are 3 to 12 letters or numbers.");
      return;
    }
    setCode("");
    setRoomOpen(false);
    router.push(`/r/${v}`);
  };

  const invite = async () => {
    const link = game.inviteLink();
    if (!link) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Ludo Darbar", text: `Join my Ludo room ${game.room}`, url: link });
        return;
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      game.setBanner(`Invite link copied: ${link}`);
    } catch {
      game.setBanner(`Send this link to your friends: ${link}`);
    }
  };

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="shrink-0 leading-none">
          <a
            href="/"
            aria-label="Ludo Darbar, home"
            onClick={(e) => {
              e.preventDefault();
              if (pathname === "/") {
                window.scrollTo({ top: 0, behavior: "smooth" });
                return;
              }
              if (inGame && !game.requestMenu()) {
                game.setBanner("Tap Ludo Darbar again to leave this game.");
                return;
              }
              game.exitToMenu();
              router.push("/");
            }}
            className="flex items-center gap-2 rounded-xl whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[.98] sm:gap-2.5"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={44} height={44} className="h-9 w-9 shrink-0 min-[420px]:h-10 min-[420px]:w-10 sm:h-12 sm:w-12" />
            <span className="brand-gold brand-title pt-1 text-2xl min-[420px]:text-[1.7rem] sm:text-4xl">Ludo Darbar</span>
          </a>
        </h1>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          {inGame && game.mode && (
            <span className="hidden rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm font-semibold text-muted-foreground sm:inline">
              {MODES[game.mode].chip}
            </span>
          )}
          {friends && (
            <>
              <button
                type="button"
                aria-expanded={roomOpen}
                aria-label="Room code"
                onClick={() => setRoomOpen((o) => !o)}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 text-sm font-semibold whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-2.5"
              >
                <span className="hidden text-muted-foreground min-[420px]:inline">Room</span>
                <span className="font-mono tracking-wider">{game.room || "------"}</span>
              </button>
              <Button size="sm" onClick={invite}>
                Invite
              </Button>
            </>
          )}
          <Button variant="outline" size="icon" aria-label="Settings" onClick={() => uiStore.set({ settingsOpen: true })}>
            <SettingsIcon className="size-[18px]" />
          </Button>
          {!onMenu && (
            <Button variant="outline" size="sm" onClick={goMenu}>
              {game.confirmMenu ? "Leave game?" : "Menu"}
            </Button>
          )}
        </div>
      </header>

      {friends && roomOpen && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center">
          <div className="flex flex-1 gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && joinRoom()}
              maxLength={12}
              placeholder="Enter a room code"
              autoComplete="off"
              autoCapitalize="off"
              aria-label="Room code to join"
              className="font-mono"
              autoFocus
            />
            <Button variant="outline" className="h-10 px-4" onClick={joinRoom}>
              Join
            </Button>
          </div>
          <Button
            variant="outline"
            className="h-10 px-4"
            onClick={() => {
              setRoomOpen(false);
              router.push(`/r/${newRoomCode()}?new=1`);
            }}
          >
            Start a new room
          </Button>
        </div>
      )}
    </>
  );
}
