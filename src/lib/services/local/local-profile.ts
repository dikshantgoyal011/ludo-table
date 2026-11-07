import { isAvatar } from "@/lib/avatars";
import { isCountry } from "@/lib/country";
import { isColor, NICK_MAX } from "@/lib/game/constants";
import { cleanFor, noVariations, VARIED_GAMES, type VariedGame } from "@/lib/game/variations";
import type { Profile, ProfileRepository } from "../types";
import { Emitter, storage } from "../storage";

const DEFAULT_PROFILE: Profile = {
  nick: "",
  country: "",
  avatar: -1,
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
  variations: { pachisi: noVariations("pachisi"), parchis: noVariations("parchis"), chaupar: noVariations("chaupar") },
  saveVariations: { pachisi: false, parchis: false, chaupar: false },
};
/** Where each game's variations are kept. */
const VAR_KEYS: Record<VariedGame, string> = { pachisi: "ludo.pachisiVariations", parchis: "ludo.parchisVariations", chaupar: "ludo.chauparVariations" };

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
    const country = storage.get("ludo.country");
    if (isCountry(country)) p.country = country;
    const avatar = Number(storage.get("ludo.avatar") ?? -1);
    if (isAvatar(avatar)) p.avatar = avatar;
    const color = storage.get("ludo.pref");
    if (isColor(color)) p.color = color;
    p.cpuCount = okCount(Number(storage.get("ludo.cpuCount")), 2);
    p.onlineCount = okCount(Number(storage.get("ludo.onlineCount")), 2);
    const ls = storage.getJSON<Profile["localSetup"]>("ludo.localSetup");
    if (ls && Array.isArray(ls.rows) && ls.rows.length === 4 && ls.rows.every((r) => r && isColor(r.color))) {
      p.localSetup = { count: okCount(ls.count, 2), rows: ls.rows.map((r) => ({ name: String(r.name || "").slice(0, NICK_MAX), color: r.color })) };
    }
    // Rules are only remembered when saved as my preferences.
    const saved = storage.getJSON<Record<string, unknown>>("ludo.saveVariations") || {};
    for (const g of VARIED_GAMES) {
      p.saveVariations[g] = saved[g] === true;
      p.variations[g] = p.saveVariations[g] ? cleanFor(g, storage.getJSON(VAR_KEYS[g])) : noVariations(g);
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
    if (patch.country !== undefined) storage.set("ludo.country", p.country);
    if (patch.avatar !== undefined) storage.set("ludo.avatar", String(p.avatar));
    if (patch.color) storage.set("ludo.pref", p.color);
    if (patch.cpuCount) storage.set("ludo.cpuCount", String(p.cpuCount));
    if (patch.onlineCount) storage.set("ludo.onlineCount", String(p.onlineCount));
    if (patch.localSetup) storage.setJSON("ludo.localSetup", p.localSetup);
    if (patch.variations) for (const g of VARIED_GAMES) storage.setJSON(VAR_KEYS[g], p.variations[g]);
    if (patch.saveVariations) storage.setJSON("ludo.saveVariations", p.saveVariations);
    this.emitter.emit();
  }
}
