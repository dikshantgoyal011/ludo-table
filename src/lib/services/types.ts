// Contracts between the app and wherever user data lives.
//
// Today every service is backed by the browser (localStorage). When a backend
// is added (accounts, saved profiles, game history, a game server), write new
// classes that implement these same interfaces and switch them on in
// `src/lib/services/index.ts`. Nothing in the UI or the game code has to change.
//
// Repositories are "cache first": `load()` hydrates once at start-up
// (from the browser today, from an API later), after which `get()` is
// synchronous and `save()` writes through in the background.

import type { Variations } from "@/lib/game/variations";
import type { Color, GameState, Mode } from "@/lib/game/types";
import type { Settings } from "@/lib/settings/settings";

// ---------------------------------------------------------------- auth
export interface User {
  /** Stable id used to recognise this player at a table. */
  id: string;
  /** "guest" today; "account" once sign-in exists. */
  kind: "guest" | "account";
  displayName?: string;
  email?: string;
}

export interface AuthService {
  load(): Promise<void>;
  /** Always returns someone: a guest until the player signs in. */
  currentUser(): User;
  subscribe(listener: () => void): () => void;
  /** Not available yet; implement with a real provider later. */
  signIn?(): Promise<void>;
  signOut?(): Promise<void>;
}

// ---------------------------------------------------------------- profile
export interface LocalSetupRow {
  name: string;
  color: Color;
}

export interface Profile {
  nick: string;
  /** Country code shown with my name ("" = guess from the phone). */
  country: string;
  /** My picture (avatar.tsx); -1 = the default one for my player id. */
  avatar: number;
  /** The colour this player likes to see as their own corner. */
  color: Color;
  /** Online: preferred table size. */
  onlineCount: number;
  /** Vs computer: total players including you. */
  cpuCount: number;
  /** Pass-and-play setup remembered between games. */
  localSetup: { count: number; rows: LocalSetupRow[] };
  /**
   * Pachisi, Parchís: my saved rules ("Save my preferences"), used for every new
   * game vs the computer, on this device and in rooms I create. Not saved: every
   * new game starts with the standard rules and I choose again.
   */
  variations: Record<"pachisi" | "parchis", Variations>;
  saveVariations: Record<"pachisi" | "parchis", boolean>;
}

export interface ProfileRepository {
  load(): Promise<void>;
  get(): Profile;
  save(patch: Partial<Profile>): Promise<void>;
  subscribe(listener: () => void): () => void;
}

// ---------------------------------------------------------------- settings
export interface SettingsRepository {
  load(): Promise<void>;
  get(): Settings;
  save(next: Settings): Promise<void>;
  subscribe(listener: () => void): () => void;
}

// ---------------------------------------------------------------- saved games
export interface SavedGame {
  mode: Mode;
  state: GameState;
  /** When it was last saved (ms epoch). */
  at?: number;
}

/** The online / friends game this player is seated in, so they can rejoin after closing the page. */
export interface ActiveRoom {
  mode: "online" | "friends";
  room: string;
  /** Online: table size. */
  count: number;
  /** Last time it was saved (ms epoch). */
  at: number;
  /** Which game it was (GameState.gid), so a new game at that table isn't mistaken for it. */
  gid?: string;
}

export interface GameSaveRepository {
  /** The unfinished computer / pass-and-play game, if any. */
  loadOffline(): SavedGame | null;
  saveOffline(save: SavedGame): void;
  clearOffline(): void;
  /** Last known state of a network room (lets a host carry on after a reload). */
  loadRoom(code: string): GameState | null;
  saveRoom(code: string, state: GameState): void;
  /** The network game to offer "Rejoin" for, if any. */
  loadActiveRoom(): ActiveRoom | null;
  saveActiveRoom(room: ActiveRoom): void;
  clearActiveRoom(): void;
}

export interface Services {
  auth: AuthService;
  profile: ProfileRepository;
  settings: SettingsRepository;
  saves: GameSaveRepository;
}
