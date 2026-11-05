"use client";

import { useSyncExternalStore } from "react";

const never = () => () => {};

/**
 * false during the server render and while the page is first hydrated; true
 * straight away on a page opened from inside the app (no blank first frame, so
 * nothing changes size a moment after it opens).
 */
export function useMounted() {
  return useSyncExternalStore(never, () => true, () => false);
}
