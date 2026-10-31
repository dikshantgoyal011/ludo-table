"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Globe, Smartphone, Sparkles, Users, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getController, useSettings } from "@/hooks/use-game";
import { isRoomCode, MODE_ORDER, MODES } from "@/lib/game/constants";
import type { Mode } from "@/lib/game/types";
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
      router.replace(`/r/${hash}`);
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
          Rejoin your {rejoin.mode === "online" ? "online" : "friends"} Ludo game
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
          Continue your {MODES[resume].chip.toLowerCase()} Ludo game
        </Button>
      )}
    </div>
  );
}

/** The four ways to play a game that's ready. */
function PlayModes() {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {MODE_ORDER.map((key, k) => {
        const Icon = MODE_ICONS[key];
        const primary = k === 0;
        return (
          <Link
            key={key}
            href={`/play/${key}`}
            className={cn(
              "group flex min-h-[92px] flex-col justify-between gap-2 rounded-2xl border p-3 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[.97]",
              primary
                ? "mode-primary border-transparent text-[#2a1206] shadow-[0_10px_24px_rgba(0,0,0,.3)]"
                : "border-primary/45 bg-background/40 hover:border-primary hover:bg-background/60",
            )}
          >
            <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", primary ? "bg-[#2a1d06]/15" : "bg-primary/15 text-primary ring-1 ring-primary/40")}>
              <Icon className="size-[18px]" strokeWidth={2.2} />
            </span>
            <span className="flex flex-col">
              <span className="text-[15px] leading-tight font-extrabold">{MODES[key].title}</span>
              <span className={cn("text-xs leading-snug", primary ? "text-[#2a1d06]/75" : "text-muted-foreground")}>{MODE_SHORT[key]}</span>
            </span>
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

/** The selected game: its live preview in a palace arch, what it is, and how to play it. */
function Showcase({ v, onPick }: { v: Variant; onPick: (id: string) => void }) {
  const [settings] = useSettings();
  const crown = CROWN[themeOf(settings.theme).boardStyle];
  return (
    <section
      key={v.id}
      aria-label={v.name}
      className={cn(
        "darbar-jaali showcase-fade grid grid-cols-1 gap-5 rounded-[28px] border border-primary/35 bg-card/60 px-4 pb-5",
        crown === "crown" ? "pt-11" : crown === "dome" ? "pt-9" : "pt-5",
        " shadow-[0_18px_50px_rgba(0,0,0,.35)] sm:px-6 sm:pb-6 md:grid-cols-[minmax(0,400px)_minmax(0,1fr)] md:items-center md:gap-8",
      )}
    >
      <div className={cn("darbar-arch mx-auto w-full max-w-[300px] sm:max-w-[400px]", themeOf(settings.theme).boardStyle === "modern" && "showcase-plain")}>
        <ArchCrown kind={crown} />
        <GamePreview variant={v} />
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold tracking-[0.2em] text-primary uppercase">{v.origin}</span>
          <h2 className="brand-gold brand-title text-[2.6rem] leading-[1.05] sm:text-5xl">{v.name}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{v.hint}</p>
        </div>
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
        {v.ready ? (
          <>
            <PlayModes />
            <p className="text-xs text-muted-foreground">Random dice that give you a little help when you&apos;re stuck.</p>
          </>
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
  const [selected, setSelected] = useState(initial || "ludo");

  // ?game= in the link wins, then the game picked last time.
  useEffect(() => {
    if (initial) return;
    const fromUrl = new URLSearchParams(window.location.search).get("game");
    const id = fromUrl || rememberedGame();
    if (id && variantById(id).id === id) setSelected(id);
  }, [initial]);

  const pick = (id: string) => {
    setSelected(id);
    rememberGame(id);
    // Keep the address shareable without navigating.
    window.history.replaceState(null, "", id === "ludo" ? "/" : `/?game=${id}`);
  };

  const v = variantById(selected);
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 py-1">
      {/* The strip comes first on every menu screen, so it never moves between them. */}
      <GameStrip selected={selected} onSelect={pick} />
      <ResumeButtons />
      <Showcase v={v} onPick={pick} />
    </div>
  );
}
