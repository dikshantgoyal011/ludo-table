// Tiny store for app-wide UI bits that aren't part of a game (e.g. whether
// the settings sheet is open).
import { useSyncExternalStore } from "react";

import type { Color, GameId } from "@/lib/game/types";

/**
 * leaveOpen: the game menu is open, from the Menu button or the phone's Back button.
 * profileOf: whose player profile is open (the colour of their seat).
 * tutorial: How to play is open, for this game.
 */
type UiState = { settingsOpen: boolean; leaveOpen: false | "menu" | "back"; profileOf: Color | null; tutorial: GameId | null };

let ui: UiState = { settingsOpen: false, leaveOpen: false, profileOf: null, tutorial: null };
const listeners = new Set<() => void>();

export const uiStore = {
  get: () => ui,
  set(patch: Partial<UiState>) {
    ui = { ...ui, ...patch };
    listeners.forEach((fn) => fn());
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

const SERVER: UiState = { settingsOpen: false, leaveOpen: false, profileOf: null, tutorial: null };
export function useUi() {
  return useSyncExternalStore(uiStore.subscribe, uiStore.get, () => SERVER);
}
