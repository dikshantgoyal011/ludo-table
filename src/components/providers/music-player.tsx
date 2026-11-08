"use client";

// Plays the menu music on the screens outside a game (home, setup, the lobby),
// and fades it out as a game starts. Off with Settings → Music, while voice
// chat is on, and while the app is in the background. The music code loads
// as soon as the browser lets the page play sound: straight away where it allows
// that, otherwise at the first touch.
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useGame, useSettings } from "@/hooks/use-game";
import { audioContext, soundAllowed, tryAutoplay, UNLOCK_EVENTS } from "@/lib/audio/sfx";
import type { TrackId } from "@/lib/audio/music";

let loaded = false;

/** The menu's piece of music. */
export const MENU_TRACK: TrackId = "neelam";

/** Screens where a game is on (the lobby before it isn't). */
function useAtTable() {
  const game = useGame();
  const pathname = usePathname();
  const tableRoute = pathname === "/game" || pathname === "/room" || pathname.startsWith("/r/");
  const inLobby = game.isNet() && (!game.loaded || game.state.phase === "lobby");
  return tableRoute && !inLobby;
}

export function MusicPlayer() {
  const [settings] = useSettings();
  const game = useGame();
  const atTable = useAtTable();
  const [touched, setTouched] = useState(false);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    // (Music scheduled before the sound is let out waits for it: the audio clock stands still till then.)
    const touch = () => soundAllowed() && setTouched(true);
    const seen = () => setVisible(document.visibilityState === "visible");
    // No touch needed where the browser lets the page play sound straight away.
    void tryAutoplay().then((ok) => ok && setTouched(true));
    for (const ev of UNLOCK_EVENTS) document.addEventListener(ev, touch, { passive: true });
    document.addEventListener("visibilitychange", seen);
    return () => {
      for (const ev of UNLOCK_EVENTS) document.removeEventListener(ev, touch);
      document.removeEventListener("visibilitychange", seen);
    };
  }, []);
  const want = settings.music && touched && visible && !atTable && !game.voice.on;
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
