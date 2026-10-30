"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getController } from "@/hooks/use-game";
import { isRoomCode, MODE_ORDER, MODES } from "@/lib/game/constants";
import type { Mode } from "@/lib/game/types";
import { VARIANTS, type Variant } from "@/lib/game/variants";
import type { ActiveRoom } from "@/lib/services/types";
import { cn } from "@/lib/utils";

const ICONS: Record<Mode, [string, string]> = {
  online: ["#2563d4", "#1d9a52"],
  computer: ["#d8382e", "#a9c3ba"],
  local: ["#efb20a", "#d8382e"],
  friends: ["#1d9a52", "#efb20a"],
};

/**
 * Shared by both menus: sends old /#code invite links to their room, leaves any
 * game, and offers to rejoin or continue one.
 */
function ResumeButtons() {
  const router = useRouter();
  const [resume, setResume] = useState<Mode | null>(null);
  const [rejoin, setRejoin] = useState<ActiveRoom | null>(null);

  useEffect(() => {
    const game = getController();
    // Old invite links looked like /#abc123
    const hash = window.location.hash.slice(1).toLowerCase();
    if (isRoomCode(hash) && !hash.startsWith("pub")) {
      router.replace(`/r/${hash}`);
      return;
    }
    game.exitToMenu();
    setResume(game.savedOffline()?.mode ?? null);
    setRejoin(game.activeRoom());
  }, [router]);

  return (
    <>
      {rejoin && (
        <Button
          size="lg"
          className="w-full"
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
          className="w-full"
          onClick={() => {
            if (getController().resumeOffline()) router.push("/game");
          }}
        >
          Continue your {MODES[resume].chip.toLowerCase()} Ludo game
        </Button>
      )}
    </>
  );
}

/** Small board drawing for a game card. */
function MiniBoard({ kind, accent }: { kind: Variant["board"]; accent: string }) {
  const cols = ["#c8262b", "#16894a", "#e9a912", "#1f5fcc"];
  if (kind === "cross")
    return (
      <svg viewBox="0 0 30 30" className="h-full w-full" aria-hidden="true">
        <path d="M11 1h8v10h10v8H19v10h-8V19H1v-8h10z" fill="#f8f0da" stroke={accent} strokeWidth="1.2" strokeLinejoin="round" />
        <rect x="13.5" y="2.5" width="3" height="8" fill={cols[1]} />
        <rect x="19.5" y="13.5" width="8" height="3" fill={cols[2]} />
        <rect x="13.5" y="19.5" width="3" height="8" fill={cols[3]} />
        <rect x="2.5" y="13.5" width="8" height="3" fill={cols[0]} />
        <circle cx="15" cy="15" r="3" fill={accent} />
      </svg>
    );
  if (kind === "plane")
    return (
      <svg viewBox="0 0 30 30" className="h-full w-full" aria-hidden="true">
        <rect x="1" y="1" width="28" height="28" rx="5" fill="#f8f0da" stroke={accent} strokeWidth="1.2" />
        {[0, 1, 2, 3].map((k) => (
          <path key={k} d="M15 15 L15 3 A12 12 0 0 1 27 15 Z" fill={cols[k]} opacity=".9" transform={`rotate(${k * 90} 15 15)`} />
        ))}
        <path d="M15 8l1.6 5 5 1v1.6l-5-.6-.4 4 1.8 1.4V22L15 21l-3 1v-1.6l1.8-1.4-.4-4-5 .6V14l5-1z" fill="#fff" stroke="#333" strokeWidth=".5" />
      </svg>
    );
  const n = kind === "grid5" ? 5 : 7;
  const s = 28 / n;
  const mid = Math.floor(n / 2);
  const marks = [
    [mid, mid],
    [0, mid],
    [mid, 0],
    [n - 1, mid],
    [mid, n - 1],
  ];
  return (
    <svg viewBox="0 0 30 30" className="h-full w-full" aria-hidden="true">
      <rect x="1" y="1" width="28" height="28" rx="2" fill="#f3e2bc" stroke={accent} strokeWidth="1.2" />
      {Array.from({ length: n - 1 }, (_, i) => (
        <path key={i} d={`M${1 + s * (i + 1)} 1V29M1 ${1 + s * (i + 1)}H29`} stroke="#8a5a2a" strokeWidth=".5" />
      ))}
      {marks.map(([r, c], k) => (
        <path
          key={k}
          d={`M${1 + c * s + s * 0.2} ${1 + r * s + s * 0.2}l${s * 0.6} ${s * 0.6}m0 ${-s * 0.6}l${-s * 0.6} ${s * 0.6}`}
          stroke={k === 0 ? accent : cols[k - 1]}
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

/** Home page: every Ludo variation, the ones not built yet faded with "Coming soon". */
export function GameLibrary() {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-2">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-bold tracking-[0.18em] text-primary uppercase">Every Ludo ever played</p>
        <h2 className="text-3xl leading-tight font-extrabold sm:text-4xl">Which game do you want to play?</h2>
        <p className="text-muted-foreground">Each one plays like the Ludo you know, with a twist or two.</p>
      </div>
      <ResumeButtons />
      <ul className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 lg:grid-cols-3">
        {VARIANTS.map((v) => {
          const body = (
            <>
              <span className="flex items-start gap-3">
                <span className="h-14 w-14 shrink-0 rounded-xl p-1.5 shadow-inner" style={{ background: v.tint[0] }}>
                  <MiniBoard kind={v.board} accent={v.tint[1]} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-xl leading-tight font-extrabold">{v.name}</span>
                  <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: v.tint[1] }}>
                    {v.origin}
                  </span>
                </span>
              </span>
              <span className="text-sm leading-snug text-muted-foreground">{v.hint}</span>
            </>
          );
          const card =
            "relative flex h-full flex-col gap-2.5 overflow-hidden rounded-2xl border p-4 text-left";
          return (
            <li key={v.id}>
              {v.href ? (
                <Link
                  href={v.href}
                  className={cn(
                    card,
                    "border-primary/70 bg-card shadow-[0_0_0_1px_rgb(var(--c-gold)/.25),0_8px_24px_rgba(0,0,0,.25)] transition outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring active:scale-[.98]",
                  )}
                >
                  {body}
                  <span className="mt-auto self-start rounded-full bg-primary px-3 py-1 text-sm font-bold text-primary-foreground">Play now</span>
                </Link>
              ) : (
                <div className={cn(card, "border-border bg-card/60")} aria-disabled="true">
                  <div className="flex flex-col gap-2.5 opacity-45 grayscale-[35%]">{body}</div>
                  <span className="pointer-events-none absolute top-3 right-3 rotate-3 rounded-full border border-primary/70 bg-background/90 px-3 py-1 text-[11px] font-extrabold tracking-[0.18em] text-primary uppercase shadow-lg">
                    Coming soon
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Ludo: pick how to play. */
export function MenuScreen() {
  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-4 py-2">
      <div className="flex flex-col gap-1">
        <Link href="/" className="self-start text-sm font-bold tracking-[0.18em] text-primary uppercase underline-offset-4 hover:underline">
          ← All games
        </Link>
        <h2 className="text-3xl leading-tight font-extrabold sm:text-4xl">How do you want to play Ludo?</h2>
        <p className="text-muted-foreground">Random dice that give you a little help when you&apos;re stuck.</p>
      </div>
      <ResumeButtons />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {MODE_ORDER.map((key) => (
          <Link
            key={key}
            href={`/play/${key}`}
            className="flex flex-col items-start gap-2 rounded-2xl border border-border bg-card p-4 text-left transition outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring active:scale-[.98]"
          >
            <span className="flex gap-1" aria-hidden="true">
              {ICONS[key].map((col) => (
                <span key={col} className="h-3 w-3 rounded-full" style={{ background: col }} />
              ))}
            </span>
            <span className="text-xl leading-tight font-extrabold">{MODES[key].title}</span>
            <span className="text-sm leading-snug text-muted-foreground">{MODES[key].desc}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
