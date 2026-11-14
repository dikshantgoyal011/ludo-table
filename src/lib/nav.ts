// Which screen came before this one, inside the app: Back can go there instead of
// leaving the app (a page opened straight from a link has nothing before it).

let pages = 0;

/** A new screen is showing (called on every change of page). */
export function notePage() {
  pages++;
}

/** Is there a screen of this app to go back to? */
export const canGoBack = () => pages > 1;
