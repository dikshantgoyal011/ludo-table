"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
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
  // A room being created (new=1); otherwise joining one, which only works if someone hosts it.
  const create = params.get("new") === "1";

  useEffect(() => {
    if (!isRoomCode(room) || room.startsWith("pub")) {
      router.replace("/play/friends");
      return;
    }
    // (A new room's lobby shows its code and Invite right away.)
    game.startFriends(room, wanted, create);
  }, [room, wanted, create, game, router]);

  if (!mounted || game.mode !== "friends") return null;
  if (game.noRoom === room) return <NoRoom code={room} game={wanted} onRetry={() => game.startFriends(room, wanted)} />;
  return <GameScreen />;
}

/** Joining a code nobody is hosting: say so (no room is made from it). */
function NoRoom({ code, game, onRetry }: { code: string; game: string; onRetry: () => void }) {
  const back = `/play/friends${game === "ludo" ? "" : `?game=${game}`}`;
  return (
    <div role="alert" className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-8 text-center">
      <div className="text-lg font-bold">
        No room with the code <span className="font-mono tracking-wider">{code}</span>
      </div>
      <p className="text-sm text-muted-foreground">Check the code with your friend. A room is only open while the friend who created it has it open.</p>
      <div className="grid w-full grid-cols-2 gap-2">
        <Button variant="outline" size="lg" onClick={onRetry}>
          Try again
        </Button>
        <Button size="lg" asChild>
          <Link href={back}>Back</Link>
        </Button>
      </div>
    </div>
  );
}
