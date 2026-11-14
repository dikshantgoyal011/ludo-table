"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SkipForward } from "lucide-react";
import { useGame } from "@/hooks/use-game";
import { DICE_ROLL_MS } from "@/lib/game/constants";
import { GRACE_STEP, mouthsUp, shellsOf, SIX_SHELLS, type ShellSet } from "@/lib/game/pachisi/throws";
import { cleanVariations } from "@/lib/game/pachisi/variations";
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

/** Which of the shells land mouth-up for a throw of v: always the same picture for the same seed. */
function pattern(set: ShellSet, v: number, seed: number) {
  const up0 = mouthsUp(set, v);
  const n = up0 < 0 ? 3 : up0;
  const order = Array.from({ length: set.n }, (_, k) => k);
  let x = (seed * 2654435761) >>> 0;
  for (let k = set.n - 1; k > 0; k--) {
    x = (x * 1103515245 + 12345) >>> 0;
    const j = x % (k + 1);
    [order[k], order[j]] = [order[j], order[k]];
  }
  const up = new Set(order.slice(0, n));
  return order.map((_, k) => up.has(k));
}

/**
 * Six (or seven) cowrie shells lying in a tray, as big as the space allows: they
 * tumble when thrown and land showing the throw (count the ones mouth-up; with
 * six, none = 25 and one = 10). The game's dice for Pachisi.
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
  set = SIX_SHELLS,
  className,
}: {
  /** Which shells are thrown (six, or seven as a variation). */
  set?: ShellSet;
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
  const ups = pattern(set, roll && busy ? roll.value : value, id);
  const mid = (set.n - 1) / 2;
  return (
    <button
      type="button"
      disabled={!ready}
      onClick={onClick}
      aria-label={label ?? (ready ? "Throw the cowries" : `Cowries: ${mouthsUp(set, value)} mouth-up, ${value}`)}
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
              ["--dx" as string]: `${(k - mid) * shell * 0.12}px`,
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
  const set = shellsOf(cleanVariations(game.variations()));
  const turn = game.dieColor() === c;
  const canRoll = turn && game.canRollNow();
  // Thrown this turn: the throw in play. Not yet: the shells as this player last left them.
  const thrown = turn && (game.rolling || s.last?.c === c);
  const last = thrown ? (!game.rolling && s.last?.c === c ? s.last.v : game.dieFace) : s.luck?.[c]?.last?.[0];
  const v = set.move.includes(last || 0) ? (last as number) : 3;
  return (
    <CowrieView
      set={set}
      value={v}
      roll={turn ? game.diceRoll : null}
      rolling={turn && game.rolling}
      seed={(s.last?.seq || 0) + c.length}
      ready={canRoll}
      dim={!turn}
      onClick={() => game.roll()}
      label={canRoll ? "Throw the cowries" : thrown ? `Threw ${mouthsUp(set, v)} mouth-up: ${v}` : "Cowrie shells"}
      shell={set.n > 6 ? shell - 3 : shell}
      className="min-w-0 flex-1"
    />
  );
}

/** The cowries' size on a name tag: always this size (what goes with them has a place of its own, TurnCallout). */
const TAG_SHELL = 22;

/**
 * Pachisi's row on a name tag: the cowries, only for the player whose turn it
 * is. Every tag keeps the row's space, so nothing jumps as the cowries go round
 * the table. (The throws still to play and Skip don't fit beside full-size cowries
 * on a phone: they're in the turn's callout.)
 */
export function CowrieRow({ c, isTurn, right }: { c: Color; isTurn: boolean; right: boolean }) {
  return <div className={cn("flex h-[34px] min-w-0 basis-full items-center gap-1.5", right && "flex-row-reverse")}>{isTurn && <TagCowries c={c} shell={TAG_SHELL} />}</div>;
}

/**
 * Pachisi: what goes with the turn's cowries, in a quiet chip by the player's
 * tag: the throws still to play, and on my own turn a small Skip. It stays in
 * the background (dark glass like the tags, fading in a moment after the throw)
 * so the eye goes to the pieces that can move first. It never covers the board
 * or anything else: it opens away from the board (under a tag below it, over one
 * above it); where the screen has no room there, beside the tag in the row's
 * empty other place (two players); failing that, it takes the place of the tag's
 * own buttons row for the moment (the name stays in view).
 */
export function TurnCallout({ c, isTurn, top, right }: { c: Color; isTurn: boolean; top: boolean; right: boolean }) {
  const game = useGame();
  const s = game.state;
  // Throws waiting to be played: shown when there's more than the one just thrown (throwing first, a separate grace).
  const hand = isTurn && s.turn === c && !game.rolling ? game.hand() : [];
  const showHand = hand.length > 1 || (hand.length === 1 && hand[0] !== s.last?.v);
  const mine = isTurn && game.mine(s, c);
  const pass = mine && game.canPass();
  // (Mine, with throws in hand and none to move with yet: throw again.)
  const again = mine && showHand && !s.roll && !game.rolling;
  const open = isTurn && (showHand || pass);
  const ref = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState<{ at: "away" | "beside" | "row"; box?: React.CSSProperties }>({ at: "away" });
  // Room away from the board: to the scrolling area's edge (beyond it, it would be cut off).
  useLayoutEffect(() => {
    const el = ref.current;
    const tag = el?.parentElement;
    if (!el || !tag || !open) return;
    const place = () => {
      const t = tag.getBoundingClientRect();
      const area = el.closest(".app-scroll")?.getBoundingClientRect();
      if (!area) return;
      const room = top ? t.top - area.top : area.bottom - t.bottom;
      if (room >= CALLOUT_H + 10) return setSpot({ at: "away" });
      // The row's other place, empty: an empty cell holds nothing.
      const other = [...(tag.parentElement?.children || [])].find((x) => x !== tag) as HTMLElement | undefined;
      if (other && !other.children.length && other.offsetWidth > 100) return setSpot({ at: "beside", box: { maxWidth: other.offsetWidth - 12 } });
      // The tag's buttons row: the chip lies exactly over it.
      const row = tag.querySelector<HTMLElement>(".tag-controls");
      if (!row) return setSpot({ at: "away" });
      const r = row.getBoundingClientRect();
      setSpot({ at: "row", box: { top: r.top - t.top - 2, left: r.left - t.left - 2, width: r.width + 4, height: r.height + 4 } });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, top, pass, showHand, again]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      role="group"
      aria-label={pass ? "Your throw" : "Throws to play"}
      className={cn(
        "turn-callout absolute",
        spot.at === "row" ? "turn-callout-row" : spot.at === "beside" ? "turn-callout-beside" : top ? "turn-callout-above" : "turn-callout-below",
        right && "turn-callout-right",
      )}
      style={spot.box}
    >
      {showHand && (
        <span className="turn-callout-hand" aria-label={`Throws to play: ${hand.map((x) => (x === GRACE_STEP ? "grace" : x)).join(", ")}`} title="Throws to play">
          {hand.map((x, k) => (
            <span key={k} className={cn(k > 0 && "border-l border-current/30 pl-1")}>
              {x === GRACE_STEP ? "G" : x}
            </span>
          ))}
        </span>
      )}
      {pass ? (
        <button type="button" onClick={game.pass} title="Don't move with this throw" className="turn-callout-skip">
          <SkipForward className="size-3" strokeWidth={2.6} aria-hidden="true" />
          Skip<span className="turn-callout-more"> throw</span>
        </button>
      ) : again ? (
        <span className="turn-callout-note">throw again</span>
      ) : null}
    </div>
  );
}

/** The chip's height (the room it needs away from the board, with its gap). */
const CALLOUT_H = 30;
