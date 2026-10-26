"use client";

import { useEffect } from "react";
import { useSettings } from "@/hooks/use-game";
import { unlockAudioOnFirstTouch } from "@/lib/audio/sfx";
import { themeOf } from "@/lib/theme/themes";

/** Writes the chosen theme's colours onto the page. */
export function applyThemeToDocument(themeId: string) {
  const th = themeOf(themeId);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(th.vars)) root.style.setProperty("--c-" + k, v);
  root.style.setProperty("--pip", th.pip);
  root.style.colorScheme = th.scheme;
  document.body.style.background = th.bg;
  document.body.style.backgroundAttachment = "fixed";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", th.meta);
}

export function ThemeApplier() {
  const [settings] = useSettings();
  useEffect(() => {
    applyThemeToDocument(settings.theme);
  }, [settings.theme]);
  useEffect(() => {
    unlockAudioOnFirstTouch();
  }, []);
  return null;
}
