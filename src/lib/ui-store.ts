// Tiny store for app-wide UI bits that aren't part of a game (e.g. whether
// the settings sheet is open).
import { useSyncExternalStore } from "react";

import type { Color } from "@/lib/game/types";

/** profileOf: whose player profile is open (the colour of their seat). */
type UiState = { settingsOpen: boolean; leaveOpen: boolean; profileOf: Color | null };

let ui: UiState = { settingsOpen: false, leaveOpen: false, profileOf: null };
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

const SERVER: UiState = { settingsOpen: false, leaveOpen: false, profileOf: null };
export function useUi() {
  return useSyncExternalStore(uiStore.subscribe, uiStore.get, () => SERVER);
}
