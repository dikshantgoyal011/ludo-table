// How devices at the same table talk to each other.
//
// The current implementation (peer-transport.ts) is peer-to-peer: the first
// browser to open a room becomes its host and everyone else connects to it.
// A future backend can implement the same interface on top of WebSockets,
// with the server playing the host role, and the game code stays as it is.

import type { ChatMessage, Color, GameState } from "@/lib/game/types";

/** A player's voice chat status, as the host shares it with the table. */
export interface VoiceMember {
  /** Player id. */
  id: string;
  /** Where to call them (their transport address). */
  peerId: string;
  /** Their own microphone is muted. */
  muted: boolean;
}

export type NetMessage =
  | { type: "hello"; id: string }
  | { type: "join"; id: string; nick: string }
  | { type: "leave"; id: string }
  | { type: "start" }
  | { type: "state"; state: GameState }
  | ({ type: "chat" } & ChatMessage)
  | { type: "chatHistory"; msgs: ChatMessage[] }
  | { type: "typing"; id: string; on: boolean }
  /** "I'm still here", both ways. The host answers a guest's ping right away. */
  | { type: "ping"; id: string }
  /** Guest to host: take my seat back from the computer. */
  | { type: "takeBack"; id: string }
  /**
   * Guest to host: I rolled v / I picked token i. The host is the one place
   * the game changes, so two devices can never change it at the same moment.
   */
  | { type: "roll"; id: string; c: Color; v: number }
  | { type: "move"; id: string; c: Color; i: number }
  /**
   * "My dice is spinning and will show v" (roll number `seq`), sent the moment
   * the player taps it, so everyone's dice spins together instead of one
   * dice-animation later. The host relays a guest's. The game itself only
   * changes with the roll that follows.
   */
  | { type: "dice"; id: string; c: Color; v: number; seq: number }
  /** Guest to host: my voice chat status (on = false: I left voice chat). */
  | { type: "voice"; id: string; peerId: string; on: boolean; muted: boolean }
  /** Host to everyone: who is in voice chat. */
  | { type: "voiceRoster"; list: VoiceMember[] };

/** An audio call with one other player (voice chat). */
export interface VoiceCall {
  /** Player id of the other end. */
  readonly pid: string;
  /** Their transport address. */
  readonly peerId: string;
  answer(stream: MediaStream): void;
  onStream(cb: (stream: MediaStream) => void): void;
  onClose(cb: () => void): void;
  close(): void;
}

/** One connected guest, as seen by the host. */
export interface PeerLink {
  /** Player id this connection belongs to, once known. */
  pid?: string;
  readonly open: boolean;
  send(msg: NetMessage): void;
}

export interface RoomEvents {
  /** This device now hosts the room. */
  hosting(): void;
  /** This device is connected to the room's host as a guest. */
  joinedHost(): void;
  /** Host side: a guest connected / sent something / went away. */
  peerOpened(link: PeerLink): void;
  peerMessage(link: PeerLink, msg: NetMessage): void;
  peerClosed(link: PeerLink): void;
  /** Guest side: a message from the host. */
  hostMessage(msg: NetMessage): void;
  /**
   * The connection was lost. "host-left": the host closed, so this device
   * should try to take over; "network": a network problem, try again.
   */
  lost(reason: "host-left" | "network"): void;
}

export interface RoomTransport {
  readonly isHost: boolean;
  /** Connect to the room `code`, hosting it if nobody else is. */
  open(code: string, events: RoomEvents): Promise<void>;
  /** Host: to every guest except `except`. Guest: to the host. */
  broadcast(msg: NetMessage, except?: PeerLink): void;
  /** Guest only: send to the host. */
  sendToHost(msg: NetMessage): boolean;
  /** Number of guests currently connected (host only). */
  guestCount(): number;
  /** This device's address for direct calls, once connected. */
  peerId(): string | null;
  /** Voice chat: call another player directly. `myPid` tells them who's calling. */
  call(peerId: string, myPid: string, stream: MediaStream): VoiceCall | null;
  /** Voice chat: incoming calls. */
  onCall(cb: (call: VoiceCall) => void): void;
  /**
   * Look at room `code` without joining or hosting it: the game its host is
   * running, or null if nobody is hosting it (or they don't answer).
   */
  probe?(code: string): Promise<GameState | null>;
  close(): void;
}

export type TransportFactory = () => RoomTransport;
