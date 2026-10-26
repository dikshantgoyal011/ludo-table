import type { AuthService, User } from "../types";
import { Emitter, storage } from "../storage";

/**
 * Guest identity kept in this browser. A real sign-in provider can replace
 * this class; it only has to keep `currentUser().id` stable for a player.
 */
export class GuestAuthService implements AuthService {
  private user: User = { id: "", kind: "guest" };
  private emitter = new Emitter();
  subscribe = this.emitter.subscribe;

  async load() {
    this.hydrate();
  }

  private hydrate() {
    if (this.user.id) return;
    let id = storage.get("ludo.cid");
    if (!id) {
      id = "c" + Math.random().toString(36).slice(2, 10);
      storage.set("ludo.cid", id);
    }
    // ?p=NAME gives a tab its own identity (handy for testing on one device).
    try {
      const p = new URLSearchParams(window.location.search).get("p");
      if (p && /^[a-z0-9]{1,16}$/i.test(p)) id = "t" + p;
    } catch {
      /* ignore */
    }
    this.user = { id, kind: "guest" };
  }

  currentUser(): User {
    if (!this.user.id && typeof window !== "undefined") this.hydrate();
    return this.user;
  }
}
