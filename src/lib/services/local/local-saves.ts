import { isMode, isRoomCode } from "@/lib/game/constants";
import { validState } from "@/lib/game/rules";
import type { GameState } from "@/lib/game/types";
import type { ActiveRoom, GameSaveRepository, SavedGame } from "../types";
import { storage } from "../storage";

export class LocalGameSaveRepository implements GameSaveRepository {
  loadOffline(): SavedGame | null {
    const saved = storage.getJSON<SavedGame>("ludo.saved");
    if (!saved || !isMode(saved.mode) || !validState(saved.state)) return null;
    return saved;
  }
  saveOffline(save: SavedGame) {
    storage.setJSON("ludo.saved", save);
  }
  clearOffline() {
    storage.remove("ludo.saved");
  }
  loadRoom(code: string): GameState | null {
    const s = storage.getJSON<GameState>("ludo2.room." + code);
    return validState(s) ? s : null;
  }
  saveRoom(code: string, state: GameState) {
    storage.setJSON("ludo2.room." + code, state);
  }
  loadActiveRoom(): ActiveRoom | null {
    const a = storage.getJSON<ActiveRoom>("ludo.activeRoom");
    if (!a || (a.mode !== "online" && a.mode !== "friends") || !isRoomCode(a.room)) return null;
    // A game nobody has touched for 2 hours is long over.
    if (!(Date.now() - a.at < ACTIVE_ROOM_TTL)) return null;
    return a;
  }
  saveActiveRoom(room: ActiveRoom) {
    storage.setJSON("ludo.activeRoom", room);
  }
  clearActiveRoom() {
    storage.remove("ludo.activeRoom");
  }
}

const ACTIVE_ROOM_TTL = 2 * 60 * 60 * 1000;
