"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu as MenuIcon, Music, Settings as SettingsIcon } from "lucide-react";
import { InviteDialog } from "@/components/game/invite-dialog";
import { useAtTable } from "@/components/providers/music-player";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGame, useSettings } from "@/hooks/use-game";
import { cn } from "@/lib/utils";
import { cleanRoomCode, MODES, newRoomCode, roomPath } from "@/lib/game/constants";
import { variantById } from "@/lib/game/variants";
import { uiStore } from "@/lib/ui-store";

export function AppHeader() {
  const game = useGame();
  const router = useRouter();
  const pathname = usePathname();
  const [settings, saveSettings] = useSettings();
  const atTable = useAtTable();
  const [roomOpen, setRoomOpen] = useState(false);
  const [code, setCode] = useState("");

  const onMenu = pathname === "/" || pathname === "/ludo";
  const inGame = pathname === "/game" || pathname === "/room" || pathname.startsWith("/r/");
  // The home page loads at once when the logo or Menu is tapped.
  useEffect(() => {
    if (!onMenu) router.prefetch("/");
  }, [onMenu, router]);
  // Room code and Invite are for gathering players after a game (the lobby shows its own; hidden while
  // a game is on, so the header stays one line).
  const friends = inGame && game.mode === "friends" && game.loaded && game.state.phase === "done";

  // Back to the home screen (from a game in progress: only after "Leave this game?").
  // The home page leaves the table itself once it's there: leaving first emptied this
  // screen while the home page was still on its way.
  const goMenu = () => {
    if (inGame && game.leaveNeedsConfirm()) {
      uiStore.set({ leaveOpen: "menu" });
      return;
    }
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
    router.push(roomPath(v));
  };

  const [inviteOpen, setInviteOpen] = useState(false);
  const invite = () => {
    if (game.inviteLink()) setInviteOpen(true);
  };

  return (
    <>
      <header className="app-bar flex flex-wrap items-center justify-between gap-2">
        <h1 className="shrink-0 leading-none">
          <a
            href="/"
            aria-label="Ludo Darbar, home"
            onClick={(e) => {
              e.preventDefault();
              if (pathname === "/") {
                document.querySelector(".app-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
                return;
              }
              goMenu();
            }}
            className="flex items-center gap-2 rounded-xl whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[.98] sm:gap-2.5"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={44} height={44} className="h-9 w-9 shrink-0 min-[420px]:h-10 min-[420px]:w-10 sm:h-12 sm:w-12" />
            <span className="flex flex-col">
              <span className="brand-gold brand-title pt-1 text-2xl leading-none min-[420px]:text-[1.7rem] sm:text-4xl">Ludo Darbar</span>
              {/* The app's tagline */}
              <span className="mt-0.5 text-[10px] leading-none font-bold tracking-[0.18em] text-primary/90 uppercase sm:text-xs">Every Ludo ever played</span>
            </span>
          </a>
        </h1>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          {inGame && game.mode && (
            <span className="hidden rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm font-semibold text-muted-foreground sm:inline">
              {game.state.game && game.state.game !== "ludo" ? `${variantById(game.state.game).name} · ` : ""}
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
          {/* Music on / off, where the music plays (outside a game) */}
          {!atTable && (
            <Button
              variant="outline"
              size="icon"
              aria-label={settings.music ? "Turn the music off" : "Turn the music on"}
              aria-pressed={settings.music}
              title={settings.music ? "Music on" : "Music off"}
              onClick={() => saveSettings({ ...settings, music: !settings.music })}
              className="relative"
            >
              <Music className={cn("size-[18px]", !settings.music && "opacity-45")} />
              {!settings.music && <span aria-hidden="true" className="absolute h-[2px] w-6 rotate-45 rounded-full bg-current" />}
            </Button>
          )}
          <Button variant="outline" size="icon" aria-label="Settings" onClick={() => uiStore.set({ settingsOpen: true })}>
            <SettingsIcon className="size-[18px]" />
          </Button>
          {!onMenu && (
            <Button variant="outline" size="sm" onClick={goMenu}>
              {/* In a game it opens the game menu (restart, leave) */}
              {inGame && game.leaveNeedsConfirm() && <MenuIcon className="size-4" />}
              Menu
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
              router.push(roomPath(newRoomCode(), `new=1${game.state.game && game.state.game !== "ludo" ? `&game=${game.state.game}` : ""}`));
            }}
          >
            Start a new room
          </Button>
        </div>
      )}
      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </>
  );
}
