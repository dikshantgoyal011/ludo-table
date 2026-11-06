"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useGame } from "@/hooks/use-game";
import { useMounted } from "@/hooks/use-mounted";
import { cleanRoomCode, isRoomCode } from "@/lib/game/constants";
import { isGameId } from "@/lib/game/rules";
import { GameScreen } from "./game-screen";

export function RoomScreen({ code }: { code: string }) {
  const game = useGame();
  const router = useRouter();
  const mounted = useMounted();
  const params = useSearchParams();
  const room = cleanRoomCode(code);
  // The game a new room is set up for (someone joining plays whatever the room plays).
  const asked = params.get("game");
  const wanted = isGameId(asked) ? asked : "ludo";

  useEffect(() => {
    if (!isRoomCode(room) || room.startsWith("pub")) {
      router.replace("/play/friends");
      return;
    }
    // (A new room's lobby shows its code and Invite right away.)
    game.startFriends(room, wanted);
  }, [room, wanted, game, router]);

  if (!mounted || game.mode !== "friends") return null;
  return <GameScreen />;
}
