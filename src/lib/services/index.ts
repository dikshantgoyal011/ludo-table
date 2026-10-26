// The one place that decides where data lives. Swap these for API-backed
// implementations when the backend arrives.
import { GuestAuthService } from "./local/local-auth";
import { LocalProfileRepository } from "./local/local-profile";
import { LocalGameSaveRepository } from "./local/local-saves";
import { LocalSettingsRepository } from "./local/local-settings";
import type { Services } from "./types";

export function createServices(): Services {
  return {
    auth: new GuestAuthService(),
    profile: new LocalProfileRepository(),
    settings: new LocalSettingsRepository(),
    saves: new LocalGameSaveRepository(),
  };
}

let instance: Services | null = null;
/** App-wide services (created once, on first use). */
export function getServices(): Services {
  if (!instance) instance = createServices();
  return instance;
}

export type * from "./types";
