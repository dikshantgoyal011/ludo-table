import { isColor } from "@/lib/game/constants";
import type { Profile, ProfileRepository } from "../types";
import { Emitter, storage } from "../storage";

const DEFAULT_PROFILE: Profile = {
  nick: "",
  color: "red",
  onlineCount: 2,
  cpuCount: 2,
  localSetup: {
    count: 2,
    rows: [
      { name: "", color: "red" },
      { name: "", color: "yellow" },
      { name: "", color: "green" },
      { name: "", color: "blue" },
    ],
  },
};

const okCount = (n: unknown, fallback: number) => (n === 2 || n === 3 || n === 4 ? n : fallback);

/** Profile kept in this browser. Keys match the original single-page app. */
export class LocalProfileRepository implements ProfileRepository {
  private profile: Profile = structuredClone(DEFAULT_PROFILE);
  private loaded = false;
  private emitter = new Emitter();
  subscribe = this.emitter.subscribe;

  async load() {
    this.hydrate();
  }

  private hydrate() {
    if (this.loaded || typeof window === "undefined") return;
    this.loaded = true;
    const p = this.profile;
    p.nick = storage.get("ludo.nick") || "";
    const color = storage.get("ludo.pref");
    if (isColor(color)) p.color = color;
    p.cpuCount = okCount(Number(storage.get("ludo.cpuCount")), 2);
    p.onlineCount = okCount(Number(storage.get("ludo.onlineCount")), 2);
    const ls = storage.getJSON<Profile["localSetup"]>("ludo.localSetup");
    if (ls && Array.isArray(ls.rows) && ls.rows.length === 4 && ls.rows.every((r) => r && isColor(r.color))) {
      p.localSetup = { count: okCount(ls.count, 2), rows: ls.rows.map((r) => ({ name: String(r.name || "").slice(0, 16), color: r.color })) };
    }
  }

  get(): Profile {
    this.hydrate();
    return this.profile;
  }

  async save(patch: Partial<Profile>) {
    this.hydrate();
    this.profile = { ...this.profile, ...patch };
    const p = this.profile;
    if (patch.nick !== undefined) storage.set("ludo.nick", p.nick.trim());
    if (patch.color) storage.set("ludo.pref", p.color);
    if (patch.cpuCount) storage.set("ludo.cpuCount", String(p.cpuCount));
    if (patch.onlineCount) storage.set("ludo.onlineCount", String(p.onlineCount));
    if (patch.localSetup) storage.setJSON("ludo.localSetup", p.localSetup);
    this.emitter.emit();
  }
}
