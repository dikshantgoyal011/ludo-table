"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { GameScreen } from "@/components/game/game-screen";
import { useGame } from "@/hooks/use-game";
import { useMounted } from "@/hooks/use-mounted";

/** Online, vs computer and pass-and-play games. */
export default function GamePage() {
  const game = useGame();
  const router = useRouter();
  const mounted = useMounted();
  const firstLook = useRef(true);

  // Opened directly with no game running (e.g. the page was reloaded): pick up
  // a computer / pass-and-play game that was in progress, otherwise go home.
  // Only on first opening: later, no game means it ended (go home).
  useEffect(() => {
    if (!mounted) return;
    const first = firstLook.current;
    firstLook.current = false;
    if (!game.mode && !(first && game.resumeAfterReload())) router.replace("/");
  }, [mounted, game, game.mode, router]);

  if (!mounted || !game.mode) return null;
  return <GameScreen />;
}
