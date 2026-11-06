// Shared game types. Everything here is plain data so a game state can be
// saved, sent over the network or (later) stored by a backend unchanged.
import type { PachisiVariations } from "./pachisi/variations";

export type Color = "red" | "green" | "yellow" | "blue";

/** How the game is being played. */
export type Mode = "online" | "computer" | "local" | "friends";

/** Which game: Ludo, Pachisi (cross board, cowrie shells) or Parchís (Spain's: one dice, bonus counts, barriers). */
export type GameId = "ludo" | "pachisi" | "parchis";

export type Phase = "lobby" | "playing" | "done";

/** Ludo: -1 = in the yard, 0-50 = on the track, 51-55 = home column, 56 = finished (Pachisi: see pachisi/board.ts) */
export type TokenPos = number;

/** How a player shows up to others: country code (e.g. "IN") and picture number (avatar.tsx). Both optional. */
export interface Looks {
  cc?: string;
  av?: number;
}

export interface Seat extends Looks {
  id: string;
  nick: string;
  bot?: boolean;
  /** Online/friends: the computer is playing for this (absent) person until they take back control. */
  takeover?: boolean;
  /** Online/friends: the person has lost their connection. */
  away?: boolean;
  /** When they were last heard from before going away (host clock, ms epoch). */
  awayAt?: number;
  /** Online: turns this person let run out without rolling. */
  misses?: number;
  /** Out of the game (missed too many turns, or left). Their tokens leave the board. */
  out?: boolean;
  /** Out because they left (online: offline too long), not for missed turns. */
  left?: boolean;
}

export interface Player extends Looks {
  id: string;
  nick: string;
}

export interface LastRoll {
  v: number;
  c: Color;
  seq: number;
}

/** Per player: what their recent rolls were like (see luck.ts). */
export interface LuckStats {
  /** For faces 1-6 (index 0-5): this player's rolls since that face last came up. */
  since: number[];
  /** Rolls in a row without a 6 while no token of theirs is on the board. */
  stuck: number;
  /** Rolls in a row that missed the exact number a token near home needs. */
  homeMiss: number;
  /** This player's last two rolls, newest first. */
  last: number[];
}

export interface LogLine {
  c: Color | "";
  t: string;
}

export interface GameState {
  /** Which game is played at this table (absent: Ludo). */
  game?: GameId;
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
  /** Friends rooms: player id of whoever created the room; only they start and restart games. */
  owner?: string;
  log: LogLine[];
  /**
   * Which game this is (new for every game started). A saved copy of one game
   * is never accepted into another: a player coming back with an old, finished
   * game must not replace a new table.
   */
  gid?: string;
  /** Each player's recent rolls, for the dice odds (luck.ts). */
  luck?: Partial<Record<Color, LuckStats>>;
  /** Version, bumped on every change; newer always wins on the network. */
  v?: number;
  /** Partners: colours that play as one side and win together (Pachisi). Absent: everyone plays for themselves. */
  teams?: Color[][];
  /** The order turns go round in (absent: COLORS order). */
  order?: Color[];
  /** Turns a colour has to miss. */
  skip?: Partial<Record<Color, number>>;
  /** Friends lobby: ids of the players who are ready to start. */
  ready?: string[];
  /** Friends lobby (Pachisi): ids of the players who agreed to the variations, as of `variationsV`. */
  agreed?: string[];
  /** Pachisi: the variations this table plays (absent: none, the traditional rules). */
  variations?: PachisiVariations;
  /** Bumped whenever the variations change, so an agreement is always to the rules on show. */
  variationsV?: number;
  /** Pachisi: the throws of the turn being played. */
  pachisi?: PachisiTurn;
  /** Parchís: the moves of the turn being played. */
  parchis?: ParchisTurn;
}

/** Parchís: the turn in progress. */
export interface ParchisTurn {
  /** Whose turn this is about (anything for another colour is stale). */
  c: Color | null;
  /** Moves still to make: the dice (a 6 counting 7 once all pieces are out), then any bonus counts (20 for a capture, 10 for a piece home). */
  hand: number[];
  /** Another roll is owed once these are made (the roll was a 6). */
  again: boolean;
  /** Moves made since the last roll (devices use it to tell their own moves apart). */
  moved: number;
  /** The piece moved with the last 6 this turn (a third 6 sends it home). */
  sixPiece: number | null;
}

/** Pachisi: the turn in progress. */
export interface PachisiTurn {
  /** Whose turn this is about (anything for another colour is stale). */
  c: Color | null;
  /** Throws still to be played this turn (1: a grace played separately). */
  hand: number[];
  /** A throw is owed once these are played (a grace, when throws are played one at a time). */
  again: boolean;
  /** Moves made since the last throw (devices use it to tell their own moves apart). */
  moved: number;
  /** Colours whose first piece has left the Charkoni (after that, coming out takes a grace). */
  entered: Color[];
}

/** How a move is made (Pachisi): `use` which throw in hand; `extra` round again instead of home. */
export interface MoveOpt {
  use?: number;
  extra?: boolean;
}
/** One way a token can move: where it lands, and how. */
export interface MoveChoice extends MoveOpt {
  to: number;
}

/** Where a token is drawn on its game's board, in board units. */
export interface Point {
  x: number;
  y: number;
  /** Tokens sharing a key sit on the same square. */
  key: string;
  /** Pachisi: drawn lying on its side (on its way back up, or home). */
  lying?: boolean;
}

/**
 * One game's rules. The engine (controller, table) only ever asks the rulebook
 * of the game being played (rulesFor in rules.ts), so each game's rules live in
 * their own folder and changing one game can't touch another.
 */
export interface Rulebook {
  id: GameId;
  /** Position of a token that is home. */
  finish: number;
  /** Player counts this game is played with. */
  counts: number[];
  /** The roll that brings a token out and earns another roll (Ludo's 6). */
  isBonus(v: number, s?: GameState): boolean;
  /** A random roll for c, with this game's odds. */
  roll(s: GameState, c: Color): number;
  /** A number someone could really have rolled at this table (checked on rolls from the network). */
  validRoll(v: number, s?: GameState): boolean;
  /** Called as each game starts, once the players are seated (partners, who goes first). */
  setup?(s: GameState): void;
  /** Changes with every move made with the same roll (absent: a roll has one move). Lets a device tell whether its move has reached the host. */
  stage?(s: GameState): number;
  /** The throws still to play, for showing them (absent: just the roll). */
  hand?(s: GameState): number[];
  /** Record c's roll of v. Returns false if the roll isn't allowed right now. */
  applyRoll(s: GameState, c: Color, v: number): boolean;
  /** Every way token i of c can move with v (none: it can't move). */
  moveChoices(s: GameState, c: Color, i: number, v: number): MoveChoice[];
  /** Move token i of c by v, the way `opt` says. */
  applyMove(s: GameState, c: Color, i: number, v: number, opt?: MoveOpt): void;
  /** c chooses not to move with the roll in hand; null in games where that isn't allowed. */
  pass: ((s: GameState, c: Color) => boolean) | null;
  /** Computer players: which token to move with v, and how (i = -1: none can move). */
  chooseMove(s: GameState, c: Color, v: number): { i: number; opt: MoveOpt };
  /** The positions a token passes through from a to b, b included (for step-by-step animation). */
  steps(a: number, b: number): number[];
  /** Where token i of c is drawn at position p. */
  point(c: Color, i: number, p: number): Point;
  /** How far c has got (to rank players who haven't finished). */
  progress(s: GameState, c: Color): number;
}

export interface ChatMessage {
  mid: string;
  id: string;
  nick: string;
  text: string;
  ts: number;
}
