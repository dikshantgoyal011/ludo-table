import { isMode } from "@/lib/game/constants";
import { validState } from "@/lib/game/rules";
import type { GameState } from "@/lib/game/types";
import type { GameSaveRepository, SavedGame } from "../types";
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
}
