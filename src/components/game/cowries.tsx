"use client";

import { useEffect, useState } from "react";
import { useGame } from "@/hooks/use-game";
import { DICE_ROLL_MS } from "@/lib/game/constants";
import { COWRIE_MOVE, mouthsUp } from "@/lib/game/pachisi/board";
import type { Color } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import type { DiceRoll } from "./dice-3d";

/** One cowrie shell: mouth-up (the toothed slit shows) or face-down (its smooth back). */
export function Shell({ up, className, style }: { up: boolean; className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 20 26" className={className} style={style} aria-hidden="true">
      <ellipse cx="10.6" cy="14" rx="8.6" ry="11" fill="rgba(0,0,0,.3)" />
      {up ? (
        <>
          <ellipse cx="10" cy="13" rx="8.6" ry="11.2" fill="#fbf1dc" stroke="#9b7a48" strokeWidth="1" />
          <path d="M10 3.6C8.6 8 8.6 18 10 22.4C11.4 18 11.4 8 10 3.6Z" fill="#5b3a1c" />
          <path d="M8.3 7.5h1.5M8.1 10.5h1.8M8.1 13.5h1.8M8.1 16.5h1.8M8.3 19.4h1.5M10.2 7.5h1.5M10.1 10.5h1.8M10.1 13.5h1.8M10.1 16.5h1.8M10.2 19.4h1.5" stroke="#fbf1dc" strokeWidth=".9" />
        </>
      ) : (
        <>
          <ellipse cx="10" cy="13" rx="8.6" ry="11.2" fill="#c9a26b" stroke="#7a5630" strokeWidth="1" />
          <ellipse cx="8" cy="9" rx="4.2" ry="5.2" fill="#fff6e0" opacity=".5" />
          <path d="M5 18Q10 21.5 15 18" stroke="#8f6a3a" strokeWidth=".9" fill="none" />
        </>
      )}
    </svg>
  );
}

/** Which of the 6 shells land mouth-up for a throw of v: always the same picture for the same seed. */
function pattern(v: number, seed: number) {
  const n = mouthsUp(v);
  const order = [0, 1, 2, 3, 4, 5];
  let x = (seed * 2654435761) >>> 0;
  for (let k = 5; k > 0; k--) {
    x = (x * 1103515245 + 12345) >>> 0;
    const j = x % (k + 1);
    [order[k], order[j]] = [order[j], order[k]];
  }
  const up = new Set(order.slice(0, n));
  return order.map((_, k) => up.has(k));
}

/**
 * Six cowrie shells lying in a tray, as big as the space allows: they tumble when
 * thrown and land showing the throw (count the ones mouth-up; none = 25, one = 10).
 * The game's dice for Pachisi.
 */
export function CowrieView({
  value,
  roll,
  rolling,
  seed = 0,
  ready = false,
  dim = false,
  onClick,
  label,
  shell = 26,
  className,
}: {
  value: number;
  roll: DiceRoll | null;
  rolling: boolean;
  /** Picks which shells lie mouth-up when there's no roll to go by */
  seed?: number;
  ready?: boolean;
  /** Not this player's turn: their last throw, quieter */
  dim?: boolean;
  onClick?: () => void;
  label?: string;
  /** Shell height in px */
  shell?: number;
  className?: string;
}) {
  const [tossing, setTossing] = useState(false);
  useEffect(() => {
    if (!roll) return;
    const left = Math.max(0, DICE_ROLL_MS - (Date.now() - roll.at));
    if (!left) return;
    setTossing(true);
    const t = setTimeout(() => setTossing(false), left);
    return () => clearTimeout(t);
  }, [roll]);
  const busy = tossing || rolling;
  const id = roll?.id ?? seed;
  // While thrown, the landing comes from the throw itself (the shells land showing it).
  const ups = pattern(roll && busy ? roll.value : value, id);
  return (
    <button
      type="button"
      disabled={!ready}
      onClick={onClick}
      aria-label={label ?? (ready ? "Throw the cowries" : `Cowries: ${mouthsUp(value)} mouth-up, ${value}`)}
      className={cn(
        "cowries relative flex shrink-0 items-center justify-center rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-ring disabled:cursor-default",
        ready && !busy && "cowries-ready",
        dim && "opacity-60",
        className,
      )}
      style={{ gap: shell * 0.14, padding: `${shell * 0.16}px ${shell * 0.3}px`, ["--toss-ms" as string]: `${DICE_ROLL_MS}ms` }}
    >
      {ups.map((u, k) => {
        // Each shell lies at its own slight angle; thrown, it flies up, flips over a few times and lands at that angle.
        const tilt = ((k * 37 + id * 11) % 40) - 20;
        const spin = (k % 2 ? 1 : -1) * 360 * (1 + ((k * 53 + id * 7) % 2));
        const flips = 2 + ((k + id) % 2); // whole turns before landing
        return (
          <span
            key={k}
            className={cn("cowrie relative shrink-0", busy && "cowrie-hop")}
            style={{
              width: shell * 0.78,
              height: shell,
              ["--tilt" as string]: `${tilt}deg`,
              ["--spin" as string]: `${spin + tilt}deg`,
              ["--dx" as string]: `${(k - 2.5) * shell * 0.12}px`,
              ["--k" as string]: k,
              animationDelay: busy ? `${k * 30}ms` : undefined,
            }}
          >
            {busy ? (
              <span className="cowrie-flip absolute inset-0" style={{ ["--flip" as string]: `${flips * 360 + (u ? 0 : 180)}deg`, animationDelay: `${k * 30}ms` }}>
                <Shell up className="cowrie-face absolute inset-0 size-full" />
                <Shell up={false} className="cowrie-face cowrie-back absolute inset-0 size-full" />
              </span>
            ) : (
              <Shell up={u} className="absolute inset-0 size-full" />
            )}
          </span>
        );
      })}
    </button>
  );
}

/**
 * The cowries on the name tag of the player whose turn it is: they bob while
 * waiting to be thrown, are thrown here, and show the throw until it's used.
 */
export function TagCowries({ c, shell }: { c: Color; shell: number }) {
  const game = useGame();
  const s = game.state;
  const turn = game.dieColor() === c;
  const canRoll = turn && game.canRollNow();
  // Thrown this turn: the throw in play. Not yet: the shells as this player last left them.
  const thrown = turn && (game.rolling || s.last?.c === c);
  const last = thrown ? game.dieFace : s.luck?.[c]?.last?.[0];
  const v = COWRIE_MOVE.includes(last || 0) ? (last as number) : 3;
  return (
    <CowrieView
      value={v}
      roll={turn ? game.diceRoll : null}
      rolling={turn && game.rolling}
      seed={(s.last?.seq || 0) + c.length}
      ready={canRoll}
      dim={!turn}
      onClick={() => game.roll()}
      label={canRoll ? "Throw the cowries" : thrown ? `Threw ${mouthsUp(v)} mouth-up: ${v}` : "Cowrie shells"}
      shell={shell}
      className="min-w-0 flex-1"
    />
  );
}

/**
 * Pachisi's row on a name tag: the cowries (only for the player whose turn it is)
 * and Skip. Every tag keeps the row's space, so nothing jumps as the cowries go round the table.
 */
export function CowrieRow({ c, isTurn, right }: { c: Color; isTurn: boolean; right: boolean }) {
  const game = useGame();
  return (
    <div className={cn("flex h-[34px] basis-full items-center gap-1.5", right && "flex-row-reverse")}>
      {isTurn && <TagCowries c={c} shell={22} />}
      {isTurn && game.canPass() && (
        <button
          type="button"
          onClick={game.pass}
          title="Don't move with this throw"
          className="badge-pop h-8 shrink-0 rounded-full border-2 border-foreground/45 px-3 text-xs font-bold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
        >
          Skip
        </button>
      )}
    </div>
  );
}
