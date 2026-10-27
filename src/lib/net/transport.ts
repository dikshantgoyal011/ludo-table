// How devices at the same table talk to each other.
//
// The current implementation (peer-transport.ts) is peer-to-peer: the first
// browser to open a room becomes its host and everyone else connects to it.
// A future backend can implement the same interface on top of WebSockets,
// with the server playing the host role, and the game code stays as it is.

import type { ChatMessage, GameState } from "@/lib/game/types";

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
  | { type: "takeBack"; id: string };

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
  close(): void;
}

export type TransportFactory = () => RoomTransport;
