import { DEFAULT_SETTINGS, type Settings } from "@/lib/settings/settings";
import { isThemeId } from "@/lib/theme/themes";
import type { SettingsRepository } from "../types";
import { Emitter, storage } from "../storage";

export class LocalSettingsRepository implements SettingsRepository {
  private settings: Settings = structuredClone(DEFAULT_SETTINGS);
  private loaded = false;
  private emitter = new Emitter();
  subscribe = this.emitter.subscribe;

  async load() {
    this.hydrate();
  }

  private hydrate() {
    if (this.loaded || typeof window === "undefined") return;
    this.loaded = true;
    const sv = storage.getJSON<Partial<Settings>>("ludo.settings");
    if (!sv || typeof sv !== "object") return;
    const s = this.settings;
    if (isThemeId(sv.theme)) s.theme = sv.theme;
    if (typeof sv.steps === "boolean") s.steps = sv.steps;
    if (sv.sound && typeof sv.sound === "object") {
      for (const k of Object.keys(s.sound) as (keyof Settings["sound"])[]) {
        const v = (sv.sound as Record<string, unknown>)[k];
        if (typeof v === "boolean") s.sound[k] = v;
      }
    }
  }

  get(): Settings {
    this.hydrate();
    return this.settings;
  }

  async save(next: Settings) {
    this.settings = next;
    storage.setJSON("ludo.settings", next);
    this.emitter.emit();
  }
}
