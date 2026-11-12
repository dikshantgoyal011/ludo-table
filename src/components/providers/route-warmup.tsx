"use client";

// Every screen of the app, fetched ahead of time: once the first page has a quiet
// moment, and again every few minutes (Next keeps a prefetched page for five),
// so no tap ever waits for the network. The links between screens all go to these
// plain addresses (which game is picked travels with the player, not the address),
// so each one is a page that's already here.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { whenIdle } from "@/lib/busy";
import { detectCountry } from "@/lib/country";

export const SCREENS = ["/", "/play/online", "/play/computer", "/play/local", "/play/friends", "/game", "/room"];
const AGAIN_MS = 4 * 60_000;

export function RouteWarmup() {
  const router = useRouter();
  useEffect(() => {
    const warm = () => SCREENS.forEach((path) => router.prefetch(path));
    const cancel = whenIdle(() => {
      warm();
      // (Worked out now, in a quiet moment, rather than on the tap that starts a game: it's slow on a phone.)
      detectCountry();
    }, 1500);
    const timer = setInterval(() => document.visibilityState === "visible" && warm(), AGAIN_MS);
    // Back in front after a while: fetch again before the next tap.
    const back = () => document.visibilityState === "visible" && warm();
    document.addEventListener("visibilitychange", back);
    return () => {
      cancel();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", back);
    };
  }, [router]);
  return null;
}
