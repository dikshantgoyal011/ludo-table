// Shared game types. Everything here is plain data so a game state can be
// saved, sent over the network or (later) stored by a backend unchanged.

export type Color = "red" | "green" | "yellow" | "blue";

/** How the game is being played. */
export type Mode = "online" | "computer" | "local" | "friends";

export type Phase = "lobby" | "playing" | "done";

/** -1 = in the yard, 0-50 = on the track, 51-55 = home column, 56 = finished */
export type TokenPos = number;

export interface Seat {
  id: string;
  nick: string;
  bot?: boolean;
  /** Online/friends: the computer is playing for this (absent) person until they take back control. */
  takeover?: boolean;
  /** Online/friends: the person has lost their connection. */
  away?: boolean;
  /** When they went away (host clock, ms epoch). */
  awayAt?: number;
  /** Offline time left this game (ms), not counting the current absence. Unset = the full allowance. */
  bank?: number;
}

export interface Player {
  id: string;
  nick: string;
}

export interface LastRoll {
  v: number;
  c: Color;
  seq: number;
}

export interface LogLine {
  c: Color | "";
  t: string;
}

export interface GameState {
  phase: Phase;
  players: Player[];
  seats: Partial<Record<Color, Seat>>;
  tokens: Record<Color, TokenPos[]>;
  turn: Color | null;
  roll: number | null;
  sixes: number;
  winners: Color[];
  last: LastRoll | null;
  /** Online lobby: when the table starts on its own (ms epoch) */
  startAt: number | null;
  turnAt: number;
  /** Online tables only: how many players this table is for (2, 3 or 4). */
  capacity?: number;
  log: LogLine[];
  /** Version, bumped on every change; newer always wins on the network. */
  v?: number;
}

export interface ChatMessage {
  mid: string;
  id: string;
  nick: string;
  text: string;
  ts: number;
}
