"use client";

import { useSyncExternalStore } from "react";
import { GameController } from "@/lib/game/controller";
import { getServices } from "@/lib/services";
import type { Profile } from "@/lib/services/types";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings/settings";

let controller: GameController | null = null;

/** The one table this browser tab is playing at. */
export function getController(): GameController {
  if (!controller) controller = new GameController(getServices());
  return controller;
}

/** Re-renders whenever the game changes. */
export function useGame(): GameController {
  const c = getController();
  useSyncExternalStore(c.subscribe, c.getVersion, () => 0);
  return c;
}

const SERVER_PROFILE: Profile = {
  nick: "",
  color: "red",
  onlineCount: 2,
  cpuCount: 2,
  localSetup: { count: 2, rows: [] },
};

export function useProfile(): [Profile, (patch: Partial<Profile>) => void] {
  const repo = getServices().profile;
  const profile = useSyncExternalStore(repo.subscribe, () => repo.get(), () => SERVER_PROFILE);
  return [profile, (patch) => void repo.save(patch)];
}

export function useSettings(): [Settings, (next: Settings) => void] {
  const repo = getServices().settings;
  const settings = useSyncExternalStore(repo.subscribe, () => repo.get(), () => DEFAULT_SETTINGS);
  return [
    settings,
    (next) => {
      void repo.save(next);
      getController().refresh();
    },
  ];
}
