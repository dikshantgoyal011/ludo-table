import type { BoardChoice, ChauparChoice, PachisiChoice, ParchisChoice } from "@/lib/theme/boards";
import type { ThemeId } from "@/lib/theme/themes";

export const SOUND_KEYS = [
  ["dice", "Dice roll"],
  ["cowries", "Cowrie throw (Pachisi)"],
  ["pasa", "Long dice throw (Chaupar)"],
  ["move", "Token moving"],
  ["out", "Token comes out"],
  ["safe", "Token lands on a safe square"],
  ["capture", "Cutting a token"],
  ["home", "Token reaches home"],
  ["turn", "Your turn"],
  ["chat", "Chat messages"],
  ["win", "Winning"],
] as const;

export type SoundName = (typeof SOUND_KEYS)[number][0];

export interface Settings {
  theme: ThemeId;
  /** Board design; "auto" uses the theme's own */
  board: BoardChoice;
  /** Pachisi board design; "auto" matches the theme */
  pachisiBoard: PachisiChoice;
  /** Parchís board design; "auto" matches the theme */
  parchisBoard: ParchisChoice;
  /** Chaupar board design; "auto" matches the theme */
  chauparBoard: ChauparChoice;
  /** true: tokens hop square by square; false: glide to the square */
  steps: boolean;
  sound: { all: boolean } & Record<SoundName, boolean>;
  /** Music on the menu and setup screens (never during a game) */
  music: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "maharaja",
  board: "auto",
  pachisiBoard: "auto",
  parchisBoard: "auto",
  chauparBoard: "auto",
  steps: true,
  sound: { all: true, dice: true, cowries: true, pasa: true, move: true, out: true, safe: true, capture: true, home: true, turn: true, chat: true, win: true },
  music: true,
};
