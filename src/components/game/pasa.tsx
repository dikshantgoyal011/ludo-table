"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useGame } from "@/hooks/use-game";
import { DICE_ROLL_MS } from "@/lib/game/constants";
import { FACES_25, facesOf, ringOf, sayThrow, throwOf, validThrow } from "@/lib/game/chaupar/dice";
import { cleanChauparVariations } from "@/lib/game/chaupar/variations";
import type { Color } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import type { DiceRoll } from "./dice-3d";

// Chaupar's three long dice (pasa): four-sided sticks of bone, each face marked
// with ringed dots. Each is a real 3D stick that rolls over its long side when
// thrown and lands showing the throw.

/** A stick's turn round its long side, and the last throw it played (kept outside React so it survives remounts). */
export interface PasaSpin {
  a: number;
  handled: number;
}
export const newPasaSpin = (): PasaSpin => ({ a: 0, handled: 0 });

/** The face at index k of the ring is in front when the stick is turned to -k quarter turns: the nearest such turn at or below `cur`, then `spins` more. */
function aim(cur: number, k: number, spins: number) {
  const base = -k * 90;
  return base + Math.floor((cur - base) / 360) * 360 - spins * 360;
}

/** Darkens each face by how far it's turned away (so the stick reads as solid). */
function shade(prism: HTMLElement, a: number, ms: number) {
  prism.querySelectorAll<HTMLElement>(".pasa-shade").forEach((el, k) => {
    const lit = Math.max(0, Math.cos(((a + k * 90) * Math.PI) / 180));
    el.style.transition = ms > 0 ? `opacity ${ms}ms cubic-bezier(.15,.65,.25,1)` : "none";
    el.style.opacity = ((1 - lit) * 0.55).toFixed(3);
  });
}

/** One face: n ringed dots in a row along the stick. */
function Pips({ n }: { n: number }) {
  const gap = Math.min(5.4, 30 / Math.max(n, 1));
  return (
    <svg viewBox="0 0 36 10" preserveAspectRatio="none" aria-hidden="true">
      {Array.from({ length: n }, (_, q) => {
        const x = 18 + (q - (n - 1) / 2) * gap;
        return (
          <g key={q}>
            <circle cx={x} cy={5} r={1.9} fill="none" stroke="#4a2a12" strokeWidth={0.75} />
            <circle cx={x} cy={5} r={0.75} fill="#4a2a12" />
          </g>
        );
      })}
    </svg>
  );
}

function LongDie({ face, roll, rolling, spin, ring, used, k }: { face: number; roll: DiceRoll | null; rolling: boolean; spin: PasaSpin; ring: number[]; used: boolean; k: number }) {
  const prismRef = useRef<HTMLDivElement>(null);
  const at = (v: number) => Math.max(0, ring.indexOf(v));
  // Show the current face without animating when the stick first appears.
  useLayoutEffect(() => {
    const p = prismRef.current;
    if (!p) return;
    if (!rolling) spin.a = aim(spin.a, at(face), 0);
    p.style.transition = "none";
    p.style.transform = `rotateX(${spin.a}deg)`;
    shade(p, spin.a, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // A new throw: roll over a few times and land on it.
  useEffect(() => {
    const p = prismRef.current;
    if (!p || !roll || roll.id === spin.handled) return;
    spin.handled = roll.id;
    const left = Math.max(0, DICE_ROLL_MS - (Date.now() - roll.at));
    spin.a = aim(spin.a, at(roll.value), left > 200 ? 2 + (k % 2) : 0);
    p.style.transition = left > 0 ? `transform ${left}ms cubic-bezier(.15,.65,.25,1)` : "none";
    requestAnimationFrame(() => {
      p.style.transform = `rotateX(${spin.a}deg)`;
      shade(p, spin.a, left);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roll, spin]);
  // Keep the face in sync when no throw is playing (e.g. after a reload).
  useEffect(() => {
    const p = prismRef.current;
    if (!p || rolling) return;
    const want = -at(face) * 90;
    if (((((spin.a - want) % 360) + 360) % 360) !== 0) {
      spin.a = aim(spin.a, at(face), 0);
      p.style.transition = "transform 300ms ease-out";
      p.style.transform = `rotateX(${spin.a}deg)`;
      shade(p, spin.a, 300);
    }
  });
  return (
    <span className={cn("pasa-die", used && "pasa-used")} style={{ ["--k" as string]: k, ["--tilt" as string]: `${((k * 37) % 9) - 4}deg` }}>
      <span className="pasa-hop">
        <span ref={prismRef} className="pasa-prism">
          {ring.map((v, q) => (
            <span key={q} className="pasa-face" style={{ transform: `rotateX(${q * 90}deg) translateZ(calc(var(--ph) / 2))` }}>
              <Pips n={v} />
              <span className="pasa-shade" />
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}

/**
 * The three long dice in a tray, as a button: they bob while waiting to be
 * thrown, roll when thrown, and show the throw; `used` dice (already played) go dim.
 */
export function PasaView({
  dice,
  used = [false, false, false],
  roll,
  rolling,
  ready = false,
  onClick,
  label,
  faces = FACES_25,
  spins,
  className,
  style,
}: {
  dice: number[];
  used?: boolean[];
  /** The throw (all three dice as one number, see dice.ts). */
  roll: DiceRoll | null;
  rolling: boolean;
  ready?: boolean;
  onClick?: () => void;
  label?: string;
  faces?: number[];
  /** Each stick's turn (the game's survive the dice moving from one name tag to another). */
  spins: PasaSpin[];
  className?: string;
  style?: React.CSSProperties;
}) {
  const ring = ringOf(faces);
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
  // One throw for each stick, made once per throw (a new object would start the roll again).
  const rolls = useMemo(() => (roll ? throwOf(roll.value).map((value) => ({ ...roll, value })) : [null, null, null]), [roll]);
  return (
    <button
      type="button"
      disabled={!ready}
      onClick={onClick}
      aria-label={label ?? (ready ? "Throw the dice" : `Dice: ${sayThrow(dice)}`)}
      className={cn(
        "cowries pasa relative flex shrink-0 items-center justify-center rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-ring disabled:cursor-default",
        ready && !busy && "cowries-ready",
        busy && "pasa-roll",
        className,
      )}
      style={{ ["--toss-ms" as string]: `${DICE_ROLL_MS}ms`, ...style }}
    >
      {[0, 1, 2].map((k) => (
        <LongDie key={k} k={k} face={dice[k]} roll={rolls[k]} rolling={busy} spin={spins[k]} ring={ring} used={!busy && !!used[k]} />
      ))}
    </button>
  );
}

/** Which of the dice thrown are already played, given the ones still in hand. */
export function usedDice(dice: number[], left: number[] | null) {
  if (!left) return dice.map(() => false);
  const rest = [...left];
  return dice.map((d) => {
    const k = rest.indexOf(d);
    if (k < 0) return true;
    rest.splice(k, 1);
    return false;
  });
}

// The game's three sticks: they keep their turn as the dice go round the table.
const gameSpins = [newPasaSpin(), newPasaSpin(), newPasaSpin()];

/** The long dice on the name tag of the player whose turn it is: thrown here, showing the throw until it's played. */
export function TagPasa({ c }: { c: Color }) {
  const game = useGame();
  const s = game.state;
  const faces = facesOf(cleanChauparVariations(game.variations()));
  const turn = game.dieColor() === c;
  const canRoll = turn && game.canRollNow();
  // Thrown this turn: the throw in play. Not yet: the sticks at rest.
  const thrown = turn && (game.rolling || s.last?.c === c);
  const v = thrown ? (!game.rolling && s.last?.c === c ? s.last.v : game.dieFace) : 0;
  const dice = validThrow(v, faces) ? throwOf(v) : [faces[0], faces[1], faces[3]];
  const left = thrown && !game.rolling ? (s.roll ? game.hand() : []) : null;
  return (
    <PasaView
      dice={dice}
      used={usedDice(dice, left)}
      faces={faces}
      spins={gameSpins}
      roll={turn ? game.diceRoll : null}
      rolling={turn && game.rolling}
      ready={canRoll}
      onClick={() => game.roll()}
      label={canRoll ? "Throw the dice" : thrown ? `Threw ${sayThrow(dice)}` : "Long dice"}
    />
  );
}

/** Chaupar's row on a name tag: the long dice, only for the player whose turn it is (every tag keeps the row's space, so nothing jumps). */
export function PasaRow({ c, isTurn, right }: { c: Color; isTurn: boolean; right: boolean }) {
  return <div className={cn("flex h-[34px] basis-full items-center gap-1.5", right && "flex-row-reverse")}>{isTurn && <TagPasa c={c} />}</div>;
}
