import type { Color, Mode } from "./types";

// Internal seats ("slots"), clockwise around the board. Game logic always
// works in slots; what colour a slot looks like is decided per viewer.
export const COLORS: Color[] = ["red", "green", "yellow", "blue"];
export const CI: Record<Color, number> = { red: 0, green: 1, yellow: 2, blue: 3 };
export const NAMES: Record<Color, string> = { red: "Red", green: "Green", yellow: "Yellow", blue: "Blue" };

/** Which slots are used for 1..4 players. Two players sit opposite each other. */
export const SLOTS_FOR: Color[][] = [[], ["red"], ["red", "yellow"], ["red", "green", "yellow"], ["red", "green", "yellow", "blue"]];

/** Online: time per turn. Not rolling in time counts as a missed turn. */
export const ONLINE_TURN_LIMIT = 15_000;
/** Online: the last this share of a turn's time is its warning: the ring glows and pulses, and on my own turn it ticks. */
export const TURN_WARN_SHARE = 0.3;
/** Online: each missed turn takes this much off that player's turn time. */
export const MISS_PENALTY = 2_000;
/** Online: this many missed turns and the player is out of the game. */
export const MAX_MISSES = 5;
/** Online: once a player is offline, the computer plays for them after this long (friends wait longer, see the controller). */
export const OFFLINE_ALLOWANCE = 15_000;
/**
 * Online, once at most one player is still connected: anyone offline this
 * long in total (the computer having played for them since OFFLINE_ALLOWANCE)
 * has left the game for good. If only one player is left, they win.
 */
export const ABANDON_MS = 90_000;
/** Online/friends: a player we haven't heard from for this long counts as offline. (Mobile connections stall for a few seconds now and then.) */
export const AWAY_GRACE = 8_000;
/** Online/friends: every device says "I'm here" this often. */
export const PING_MS = 1_000;
/** Guests: if the host has been silent this long, it's gone; take over the table. */
export const HOST_SILENT_MS = 10_000;
/** How long a "typing…" hint lasts without a fresh signal. */
export const TYPING_TTL = 4_000;
/** Online: once a table is full it starts after this short countdown. */
export const ONLINE_FULL_START_DELAY = 3_000;
/** How long the dice tumbles before it lands. */
export const DICE_ROLL_MS = 820;
/** A remote roll animates the dice first; tokens wait this long before moving. */
export const REMOTE_MOVE_DELAY = DICE_ROLL_MS + 120;
/** Step-by-step token movement: time per square. */
export const STEP_MS = 140;

export const PLAYER_COUNTS = [2, 3, 4] as const;
export type PlayerCount = (typeof PLAYER_COUNTS)[number];

export const MODES: Record<Mode, { title: string; desc: string; chip: string }> = {
  online: { title: "Play online", desc: "Get matched with players from anywhere who are looking for a game.", chip: "Online" },
  computer: { title: "Play with computer", desc: "You against 1 to 3 computer players.", chip: "Vs computer" },
  local: { title: "Play on this device", desc: "2 to 4 players pass one phone around.", chip: "This device" },
  friends: { title: "Play with friends", desc: "Private room. Share a code or invite link.", chip: "Friends" },
};

export const MODE_ORDER: Mode[] = ["online", "computer", "local", "friends"];

export const QUICK_CHAT = ["👋 Hi!", "Good luck!", "Nice move!", "Hurry up! ⏳", "Oops 😅", "Good game!"];

export const isColor = (v: unknown): v is Color => typeof v === "string" && (COLORS as string[]).includes(v);
export const isMode = (v: unknown): v is Mode => typeof v === "string" && v in MODES;

/** Room codes: 3 to 12 letters or numbers. */
export const cleanRoomCode = (v: string) => v.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
export const isRoomCode = (v: string) => /^[a-z0-9]{3,12}$/.test(v);
export const newRoomCode = () => Math.random().toString(36).slice(2, 8);
/**
 * Where to open friends room `code` from inside the app (a page built ahead of
 * time; invite links use /r/code). `extra`: more of the query, e.g. "new=1&game=pachisi".
 */
export const roomPath = (code: string, extra = "") => `/room?c=${encodeURIComponent(code)}${extra ? "&" + extra : ""}`;
/** Longest player name. */
export const NICK_MAX = 24;
