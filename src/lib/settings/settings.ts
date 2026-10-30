import type { ThemeId } from "@/lib/theme/themes";

export const SOUND_KEYS = [
  ["dice", "Dice roll"],
  ["move", "Token moving"],
  ["out", "Token comes out"],
  ["capture", "Cutting a token"],
  ["home", "Token reaches home"],
  ["turn", "Your turn"],
  ["chat", "Chat messages"],
  ["win", "Winning"],
] as const;

export type SoundName = (typeof SOUND_KEYS)[number][0];

export interface Settings {
  theme: ThemeId;
  /** true: tokens hop square by square; false: glide to the square */
  steps: boolean;
  sound: { all: boolean } & Record<SoundName, boolean>;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "darbar",
  steps: true,
  sound: { all: true, dice: true, move: true, out: true, capture: true, home: true, turn: true, chat: true, win: true },
};
