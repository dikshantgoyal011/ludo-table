// "The player just tapped to go somewhere": animations that are only decoration
// (the home page's demo game) hold still for a moment, so the next page gets
// the phone's full attention. On a slow phone the demo otherwise competed with
// opening the page the player asked for.

let until = 0;

/** Called on a tap that opens another page. */
export function goingSomewhere(ms = 4000) {
  until = Date.now() + ms;
}

/** Should decoration hold still right now? */
export const holdDecoration = () => Date.now() < until || (typeof document !== "undefined" && document.hidden);

/** Run `cb` once the phone has a quiet moment (at most `max` ms from now). */
export function whenIdle(cb: () => void, max = 2500) {
  if (typeof window === "undefined") return () => {};
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(cb, { timeout: max });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(cb, Math.min(max, 800));
  return () => window.clearTimeout(id);
}
