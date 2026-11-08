"use client";

// Plays the menu music on the screens outside a game (home, setup, the lobby),
// and fades it out as a game starts. Off with Settings → Music, while voice
// chat is on, and while the app is in the background. The music code loads
// only once someone has touched the page (browsers allow sound only then).
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useGame, useSettings } from "@/hooks/use-game";
import { audioContext } from "@/lib/audio/sfx";
import type { TrackId } from "@/lib/audio/music";

let loaded = false;

/** The menu's piece of music. */
export const MENU_TRACK: TrackId = "neelam";

/** Screens where a game is on (the lobby before it isn't). */
export function useAtTable() {
  const game = useGame();
  const pathname = usePathname();
  const tableRoute = pathname === "/game" || pathname === "/room" || pathname.startsWith("/r/");
  const inLobby = game.isNet() && (!game.loaded || game.state.phase === "lobby");
  return tableRoute && !inLobby;
}

export function MusicPlayer() {
  const [settings] = useSettings();
  const game = useGame();
  const pathname = usePathname();
  const atTable = useAtTable();
  const [touched, setTouched] = useState(false);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const touch = () => setTouched(true);
    const seen = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("pointerdown", touch, {
      once: true,
      passive: true,
    });
    document.addEventListener("keydown", touch, { once: true });
    document.addEventListener("visibilitychange", seen);
    return () => {
      document.removeEventListener("pointerdown", touch);
      document.removeEventListener("keydown", touch);
      document.removeEventListener("visibilitychange", seen);
    };
  }, []);
  // (The preview page plays its own.)
  const want = settings.music && touched && visible && !atTable && !game.voice.on && pathname !== "/lab";
  useEffect(() => {
    if (!want && !loaded) return;
    let gone = false;
    void import("@/lib/audio/music").then((m) => {
      loaded = true;
      if (gone) return;
      const ctx = audioContext();
      if (want && ctx) m.playMusic(ctx, MENU_TRACK);
      else if (m.musicPlaying()) m.stopMusic(atTable ? 0.8 : 1.2);
    });
    return () => {
      gone = true;
    };
  }, [want, atTable]);
  return null;
}
