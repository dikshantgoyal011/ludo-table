"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getController } from "@/hooks/use-game";
import { isRoomCode, MODE_ORDER, MODES } from "@/lib/game/constants";
import type { Mode } from "@/lib/game/types";
import type { ActiveRoom } from "@/lib/services/types";

const ICONS: Record<Mode, [string, string]> = {
  online: ["#2563d4", "#1d9a52"],
  computer: ["#d8382e", "#a9c3ba"],
  local: ["#efb20a", "#d8382e"],
  friends: ["#1d9a52", "#efb20a"],
};

export function MenuScreen() {
  const router = useRouter();
  const [resume, setResume] = useState<Mode | null>(null);
  const [rejoin, setRejoin] = useState<ActiveRoom | null>(null);

  useEffect(() => {
    const game = getController();
    // Old invite links looked like /#abc123
    const hash = window.location.hash.slice(1).toLowerCase();
    if (isRoomCode(hash) && !hash.startsWith("pub")) {
      router.replace(`/r/${hash}`);
      return;
    }
    game.exitToMenu();
    setResume(game.savedOffline()?.mode ?? null);
    setRejoin(game.activeRoom());
  }, [router]);

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-4 py-2">
      <div className="flex flex-col gap-1">
        <h2 className="text-3xl leading-tight font-extrabold sm:text-4xl">How do you want to play?</h2>
        <p className="text-muted-foreground">Real dice rolls, every number equally likely.</p>
      </div>
      {rejoin && (
        <Button
          size="lg"
          className="w-full"
          onClick={() => {
            const path = getController().rejoin();
            if (path) router.push(path);
            else setRejoin(null);
          }}
        >
          Rejoin your {rejoin.mode === "online" ? "online" : "friends"} game
        </Button>
      )}
      {resume && (
        <Button
          size="lg"
          className="w-full"
          onClick={() => {
            if (getController().resumeOffline()) router.push("/game");
          }}
        >
          Continue your {MODES[resume].chip.toLowerCase()} game
        </Button>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {MODE_ORDER.map((key) => (
          <Link
            key={key}
            href={`/play/${key}`}
            className="flex flex-col items-start gap-2 rounded-2xl border border-border bg-card p-4 text-left transition outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring active:scale-[.98]"
          >
            <span className="flex gap-1" aria-hidden="true">
              {ICONS[key].map((col) => (
                <span key={col} className="h-3 w-3 rounded-full" style={{ background: col }} />
              ))}
            </span>
            <span className="text-xl leading-tight font-extrabold">{MODES[key].title}</span>
            <span className="text-sm leading-snug text-muted-foreground">{MODES[key].desc}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
