// Player pictures are numbered 0 .. AVATAR_COUNT-1 (drawn in components/game/avatar.tsx).

export const AVATAR_COUNT = 12;

/** The picture someone gets until they pick one: always the same for the same player id. */
export function defaultAvatar(id: string) {
  let h = 0;
  for (let k = 0; k < id.length; k++) h = (h * 31 + id.charCodeAt(k)) | 0;
  return Math.abs(h) % AVATAR_COUNT;
}

export const isAvatar = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < AVATAR_COUNT;
