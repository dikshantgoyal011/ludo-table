"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useGame } from "@/hooks/use-game";
import { useMounted } from "@/hooks/use-mounted";
import { cleanRoomCode, isRoomCode } from "@/lib/game/constants";
import { GameScreen } from "./game-screen";

export function RoomScreen({ code }: { code: string }) {
  const game = useGame();
  const router = useRouter();
  const mounted = useMounted();
  const params = useSearchParams();
  const room = cleanRoomCode(code);
  const isNew = params.get("new") === "1";
  // The game a new room is set up for (someone joining plays whatever the room plays).
  const wanted = params.get("game") === "pachisi" ? "pachisi" : "ludo";

  useEffect(() => {
    if (!isRoomCode(room) || room.startsWith("pub")) {
      router.replace("/play/friends");
      return;
    }
    game.startFriends(room, wanted);
    if (isNew) game.setBanner(`New room ${room} is ready. Tap Invite to send your friends the link or the code.`);
  }, [room, isNew, wanted, game, router]);

  if (!mounted || game.mode !== "friends") return null;
  return <GameScreen />;
}
