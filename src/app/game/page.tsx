"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { GameScreen } from "@/components/game/game-screen";
import { useGame } from "@/hooks/use-game";
import { useMounted } from "@/hooks/use-mounted";

/** Online, vs computer and pass-and-play games. */
export default function GamePage() {
  const game = useGame();
  const router = useRouter();
  const mounted = useMounted();

  // Opened directly (e.g. after a reload) with no game running: offer the menu,
  // which shows "Continue your game" when there is a saved one.
  useEffect(() => {
    if (mounted && !game.mode) router.replace("/ludo");
  }, [mounted, game.mode, router]);

  if (!mounted || !game.mode) return null;
  return <GameScreen />;
}
