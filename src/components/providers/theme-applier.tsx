"use client";

import { useEffect } from "react";
import { useSettings } from "@/hooks/use-game";
import { unlockAudioOnFirstTouch } from "@/lib/audio/sfx";
import { preloadPeer } from "@/lib/net/peer-transport";
import { themeOf } from "@/lib/theme/themes";

/** Writes the chosen theme's colours onto the page. */
export function applyThemeToDocument(themeId: string) {
  const th = themeOf(themeId);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(th.vars)) root.style.setProperty("--c-" + k, v);
  root.style.setProperty("--pip", th.pip);
  root.style.colorScheme = th.scheme;
  // Not background-attachment: fixed. On phones that repaints the whole screen on every scroll.
  document.body.style.background = th.bg;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", th.meta);
}

export function ThemeApplier() {
  const [settings] = useSettings();
  useEffect(() => {
    applyThemeToDocument(settings.theme);
  }, [settings.theme]);
  useEffect(() => {
    unlockAudioOnFirstTouch();
    // Fetch the networking code in the background, so opening a room starts connecting at once.
    const t = setTimeout(preloadPeer, 1200);
    return () => clearTimeout(t);
  }, []);
  return null;
}
