"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { goingSomewhere } from "@/lib/busy";
import { useRouter } from "next/navigation";
import { Bot, ChevronRight, Globe, GraduationCap, Smartphone, Sparkles, Users, type LucideIcon } from "lucide-react";
import { openTutorial } from "@/lib/ui-store";
import { Button } from "@/components/ui/button";
import { getController, useSettings } from "@/hooks/use-game";
import { isRoomCode, MODE_ORDER, MODES, roomPath } from "@/lib/game/constants";
import type { GameId, Mode } from "@/lib/game/types";
import { variantById, type Variant } from "@/lib/game/variants";
import type { ActiveRoom } from "@/lib/services/types";
import type { BoardStyleId } from "@/lib/theme/boards";
import { themeOf } from "@/lib/theme/themes";
import { cn } from "@/lib/utils";
import { GameStrip } from "./game-picker";
import { GamePreview } from "./game-preview";

const MODE_ICONS: Record<Mode, LucideIcon> = { online: Globe, computer: Bot, local: Smartphone, friends: Users };
const MODE_SHORT: Record<Mode, string> = {
  online: "Matched with players anywhere",
  computer: "You against 1 to 3 bots",
  local: "Pass one phone around",
  friends: "Private room with a link",
};

/** Remembered between visits, and shared with the setup screens' game switcher. */
const GAME_KEY = "ludo.game";
export function rememberGame(id: string) {
  try {
    localStorage.setItem(GAME_KEY, id);
  } catch {
    /* private mode */
  }
}
function rememberedGame() {
  try {
    return localStorage.getItem(GAME_KEY);
  } catch {
    return null;
  }
}
const never = () => () => {};
/** The game to show: ?game= in the address, else the one picked last time (if it's one we have). */
function gameBefore() {
  const id = new URLSearchParams(window.location.search).get("game") || rememberedGame();
  return id && variantById(id).id === id ? id : null;
}

/**
 * Sends old /#code invite links to their room, leaves any game, and offers to
 * rejoin an online / friends game that's still on, or continue a recent
 * pass-and-play game. (Games against the computer aren't offered: starting a
 * new one is just as quick.)
 */
function ResumeButtons() {
  const router = useRouter();
  const [resume, setResume] = useState<Mode | null>(null);
  const [rejoin, setRejoin] = useState<ActiveRoom | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const game = getController();
    // Old invite links looked like /#abc123
    const hash = window.location.hash.slice(1).toLowerCase();
    if (isRoomCode(hash) && !hash.startsWith("pub")) {
      router.replace(roomPath(hash));
      return;
    }
    game.exitToMenu();
    setNotice(game.takeNotice());
    setResume(game.savedOffline()?.mode ?? null);
    // Only offer to rejoin once the table confirms the game is still on with me in it.
    let alive = true;
    void game.checkActiveRoom().then((a) => alive && setRejoin(a));
    return () => {
      alive = false;
    };
  }, [router]);

  if (!rejoin && !resume && !notice) return null;
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {notice && (
        <div role="status" className="flex w-full items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
          <span>{notice}</span>
          <button type="button" className="shrink-0 font-bold text-primary" onClick={() => setNotice("")}>
            OK
          </button>
        </div>
      )}
      {rejoin && (
        <Button
          size="lg"
          className="w-full sm:flex-1"
          onClick={() => {
            const path = getController().rejoin();
            if (path) router.push(path);
            else setRejoin(null);
          }}
        >
          Rejoin your {rejoin.mode === "online" ? "online" : "friends"} game
        </Button>
      )}
      {resume && (
        <Button
          size="lg"
          className="w-full sm:flex-1"
          onClick={() => {
            if (getController().resumeOffline()) router.push("/game");
          }}
        >
          Continue your {MODES[resume].chip.toLowerCase()} game
        </Button>
      )}
    </div>
  );
}

/**
 * A mode card's line, swapped for "Opening…" from the moment it's tapped until
 * its page is there (see .mode-card in globals.css). Done by marking the card
 * itself, without React: Next's useLinkStatus, and even a state change on the
 * tap, made these navigations take half a second or more on a slow phone,
 * instead of a few milliseconds.
 */
function Opening({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={className}>
      <span className="mode-line">{children}</span>
      <span className="mode-opening items-center gap-1.5" aria-hidden="true">
        <span className="lobby-spinner size-3.5! shrink-0 border-2!" />
        Opening…
      </span>
    </span>
  );
}
/** Mark a tapped card as opening (and unmark it if its page never came). */
function markOpening(a: HTMLElement) {
  a.dataset.opening = "1";
  setTimeout(() => delete a.dataset.opening, 15000);
}

/**
 * The four ways to play a game that's ready. On a phone: Play online as one wide
 * button with the other three as tiles under it (all of it on the screen without
 * scrolling); from tablets up, four cards.
 */
function PlayModes({ game }: { game: string }) {
  const router = useRouter();
  const href = (key: Mode) => `/play/${key}${game === "ludo" ? "" : `?game=${game}`}`;
  // Fetch all four pages straight away. (Next only fetches links on the screen, and on
  // a phone these are below the demo: the first tap then had to wait for the network.)
  useEffect(() => {
    MODE_ORDER.forEach((key) => router.prefetch(href(key)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, router]);
  return (
    <div className="grid grid-cols-3 gap-2 md:grid-cols-2 md:gap-2.5">
      {MODE_ORDER.map((key, k) => {
        const Icon = MODE_ICONS[key];
        const primary = k === 0;
        return (
          <Link
            key={key}
            href={href(key)}
            // The demo holds still, so the page asked for opens as fast as the phone can.
            onClick={(e) => {
              goingSomewhere();
              markOpening(e.currentTarget);
            }}
            className={cn(
              "mode-card hover-lift",
              "group flex rounded-2xl border outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[.97]",
              // From tablets up: the icon beside the title and line.
              "md:flex-row md:items-center md:justify-start md:gap-3 md:p-3 md:text-left",
              primary
                ? "mode-primary col-span-3 items-center gap-3 border-transparent px-3.5 py-2.5 text-left text-[#2a1206] shadow-[0_10px_24px_rgba(0,0,0,.3)] md:col-span-1"
                : "flex-col items-center justify-center gap-1 border-primary/45 bg-background/40 px-1.5 py-2 text-center hover:border-primary hover:bg-background/60",
            )}
          >
            <span className={cn("flex shrink-0 items-center justify-center rounded-full md:h-9 md:w-9", primary ? "h-9 w-9 bg-[#2a1d06]/15" : "h-8 w-8 bg-primary/15 text-primary ring-1 ring-primary/40")}>
              <Icon className="size-[18px]" strokeWidth={2.2} />
            </span>
            {primary ? (
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-base leading-tight font-extrabold md:text-[15px]">{MODES[key].title}</span>
                <Opening className="text-xs leading-snug text-[#2a1d06]/75">{MODE_SHORT[key]}</Opening>
              </span>
            ) : (
              <>
                {/* A phone's tile: just its short name. */}
                <Opening className="text-[13px] leading-tight font-extrabold md:hidden">{MODES[key].chip}</Opening>
                <span className="hidden min-w-0 flex-col md:flex">
                  <span className="text-[15px] leading-tight font-extrabold">{MODES[key].title}</span>
                  <Opening className="text-xs leading-snug text-muted-foreground">{MODE_SHORT[key]}</Opening>
                </span>
              </>
            )}
            {primary && <ChevronRight className="size-5 shrink-0 opacity-70 transition-[translate] group-hover:translate-x-0.5 md:hidden" aria-hidden="true" />}
          </Link>
        );
      })}
    </div>
  );
}

/** What crowns the preview's frame: follows the theme's own board design. */
type Crown = "dome" | "crown" | "none";
const CROWN: Record<BoardStyleId, Crown> = { royal: "dome", sandstone: "crown", carved: "none", modern: "none" };

const crownGold = (
  <defs>
    <linearGradient id="arch-crown" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stopColor="#a8721a" />
      <stop offset=".4" stopColor="#ffe9a0" />
      <stop offset="1" stopColor="#8a5a10" />
    </linearGradient>
  </defs>
);

/** Gold dome (Royal Darbar) or a jewelled crown (Maharaja, as in the logo) on top of the arch. */
function ArchCrown({ kind }: { kind: Crown }) {
  if (kind === "none") return null;
  if (kind === "dome")
    return (
      <svg viewBox="-60 -120 120 130" className="absolute -top-7 left-1/2 h-14 w-14 -translate-x-1/2 drop-shadow-[0_4px_6px_rgba(0,0,0,.45)]" aria-hidden="true">
        {crownGold}
        <g stroke="#4a2e06" strokeWidth="4" strokeLinejoin="round">
          <rect x="-40" y="-14" width="80" height="22" rx="4" fill="url(#arch-crown)" />
          <path d="M-36 -14 C-52 -42 -18 -58 0 -80 C18 -58 52 -42 36 -14 Z" fill="url(#arch-crown)" />
          <path d="M0 -80 V-102" strokeWidth="5" strokeLinecap="round" />
          <circle cx="0" cy="-92" r="6" fill="url(#arch-crown)" />
        </g>
      </svg>
    );
  // A jewelled royal crown, as in the app logo.
  return (
    <svg viewBox="-75 -90 150 140" className="absolute -top-9 left-1/2 h-[4.2rem] w-[4.2rem] -translate-x-1/2 drop-shadow-[0_4px_6px_rgba(0,0,0,.45)]" aria-hidden="true">
      {crownGold}
      <g stroke="#4e140a" strokeWidth="4" strokeLinejoin="round">
        <path d="M-54 14 L-62 -46 L-30 -16 L0 -66 L30 -16 L62 -46 L54 14 Z" fill="url(#arch-crown)" />
        <circle cx="-62" cy="-50" r="8" fill="url(#arch-crown)" />
        <circle cx="0" cy="-72" r="9" fill="url(#arch-crown)" />
        <circle cx="62" cy="-50" r="8" fill="url(#arch-crown)" />
        <rect x="-56" y="8" width="112" height="28" rx="7" fill="url(#arch-crown)" />
        <ellipse cx="0" cy="22" rx="10" ry="9" fill="#d42a2a" strokeWidth="3" />
        <ellipse cx="-32" cy="22" rx="7" ry="7" fill="#1f8a4c" strokeWidth="3" />
        <ellipse cx="32" cy="22" rx="7" ry="7" fill="#2458c8" strokeWidth="3" />
        <ellipse cx="0" cy="-28" rx="7" ry="9" fill="#d42a2a" strokeWidth="3" />
      </g>
    </svg>
  );}

/**
 * The selected game: its name, its live preview in a palace arch, the ways to
 * play it, and what it is. On a phone in that order, the preview sized so the
 * ways to play are on the screen without scrolling (see .showcase); from tablets
 * up, the preview beside the rest.
 */
function Showcase({ v, onPick }: { v: Variant; onPick: (id: string) => void }) {
  const [settings] = useSettings();
  const crown = CROWN[themeOf(settings.theme).boardStyle];
  const howTo = v.ready && (v.id === "ludo" || v.id === "pachisi");
  return (
    <section
      key={v.id}
      aria-label={v.name}
      className="showcase darbar-jaali showcase-fade gap-2.5 rounded-[24px] border border-primary/35 bg-card/60 px-3 py-3 shadow-[0_18px_50px_rgba(0,0,0,.35)] sm:px-6 sm:py-5 md:gap-x-8 md:gap-y-3.5 md:rounded-[28px]"
    >
      <div className="sc-title flex items-end justify-between gap-3 px-1 md:px-0">
        <div className="flex min-w-0 flex-col gap-0.5 md:gap-1.5">
          <span className="truncate text-[10px] font-bold tracking-[0.2em] text-primary uppercase md:text-xs">{v.origin}</span>
          <h2 className="brand-gold brand-title text-[1.9rem] leading-none md:text-5xl md:leading-[1.05]">{v.name}</h2>
        </div>
        {howTo && (
          <Button variant="outline" size="sm" className="shrink-0 md:hidden" onClick={() => openTutorial(v.id as GameId)}>
            <GraduationCap className="size-4" /> How to play
          </Button>
        )}
      </div>

      <div className={cn("sc-preview darbar-arch", crown === "crown" ? "mt-8" : crown === "dome" ? "mt-6" : "mt-1", themeOf(settings.theme).boardStyle === "modern" && "showcase-plain")}>
        <ArchCrown kind={crown} />
        <GamePreview variant={v} />
      </div>

      <div className="sc-about flex min-w-0 flex-col gap-3 pt-1 md:gap-4 md:pt-0">
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{v.hint}</p>
        <ul className="flex flex-col gap-1.5">
          {v.points.map((p) => (
            <li key={p} className="flex items-start gap-2 text-sm font-semibold">
              <svg viewBox="-1 -1 2 2" className="mt-[3px] h-3.5 w-3.5 shrink-0" aria-hidden="true">
                <polygon points="0,-1 .22,-.22 1,0 .22,.22 0,1 -.22,.22 -1,0 -.22,-.22" fill="rgb(var(--c-gold))" />
              </svg>
              {p}
            </li>
          ))}
        </ul>
        {howTo && (
          <Button variant="outline" className="hidden self-start md:inline-flex" onClick={() => openTutorial(v.id as GameId)}>
            <GraduationCap className="size-4" /> How to play {v.name}
          </Button>
        )}
      </div>

      <div className="sc-modes min-w-0">
        {v.ready ? (
          <PlayModes game={v.id} />
        ) : (
          <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-primary/50 bg-background/40 p-4">
            <span className="flex items-center gap-2 text-sm font-extrabold tracking-[0.16em] text-primary uppercase">
              <Sparkles className="size-4" /> Coming soon
            </span>
            <p className="text-sm text-muted-foreground">We&apos;re building {v.name} right now. Until then, the classic is ready to play.</p>
            <Button className="self-start" onClick={() => onPick("ludo")}>
              Play Ludo meanwhile
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

/** Home page: pick a game, watch it play, and start it right here. */
export function GameHub({ initial }: { initial?: string }) {
  // ?game= in the link wins, then the game picked last time. Read while drawing, so
  // coming back from a Pachisi screen shows Pachisi from the first frame (not Ludo
  // for a moment).
  const before = useSyncExternalStore(never, gameBefore, () => null);
  const [chosen, setSelected] = useState<string | null>(null);
  const selected = initial || chosen || before || "ludo";
  // Hold on to it (the address it came from is about to change) and remember it.
  useEffect(() => {
    if (initial || !before) return;
    setSelected((c) => c ?? before);
    rememberGame(before);
  }, [initial, before]);

  const pick = (id: string) => {
    setSelected(id);
    rememberGame(id);
    // Keep the address shareable without navigating.
    window.history.replaceState(null, "", id === "ludo" ? "/" : `/?game=${id}`);
  };

  const v = variantById(selected);
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-3 sm:gap-4">
      {/* The strip comes first on every menu screen, so it never moves between them, and stays put. */}
      <GameStrip selected={selected} onSelect={pick} />
      <div className="app-scroll home-stage gap-3">
        <ResumeButtons />
        <Showcase v={v} onPick={pick} />
      </div>
    </div>
  );
}
