// Tiny store for app-wide UI bits that aren't part of a game (e.g. whether
// the settings sheet is open).
import { useSyncExternalStore } from "react";

type UiState = { settingsOpen: boolean };

let ui: UiState = { settingsOpen: false };
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

const SERVER: UiState = { settingsOpen: false };
export function useUi() {
  return useSyncExternalStore(uiStore.subscribe, uiStore.get, () => SERVER);
}
