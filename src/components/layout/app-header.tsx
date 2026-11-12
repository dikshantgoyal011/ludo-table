"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu as MenuIcon, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGame } from "@/hooks/use-game";
import { MODES } from "@/lib/game/constants";
import { variantById } from "@/lib/game/variants";
import { uiStore } from "@/lib/ui-store";

export function AppHeader() {
  const game = useGame();
  const router = useRouter();
  const pathname = usePathname();

  const onMenu = pathname === "/" || pathname === "/ludo";
  const inGame = pathname === "/game" || pathname === "/room" || pathname.startsWith("/r/");
  // The home page loads at once when the logo or Menu is tapped.
  useEffect(() => {
    if (!onMenu) router.prefetch("/");
  }, [onMenu, router]);
  // Back to the home screen (from a game in progress: only after "Leave this game?").
  // The home page leaves the table itself once it's there: leaving first emptied this
  // screen while the home page was still on its way.
  const goMenu = () => {
    if (inGame && game.leaveNeedsConfirm()) {
      uiStore.set({ leaveOpen: "menu" });
      return;
    }
    router.push("/", { scroll: false });
  };

  return (
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
  );
}
