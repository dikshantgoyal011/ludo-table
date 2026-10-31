"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useGame } from "@/hooks/use-game";
import { DICE_ROLL_MS } from "@/lib/game/constants";
import { cn } from "@/lib/utils";

// A real 3D cube. Opposite faces add up to 7, like a real dice.
// Face placement on the cube and the cube rotation that brings each face to the front:
const FACES: { v: number; place: string }[] = [
  { v: 1, place: "rotateY(0deg)" },
  { v: 6, place: "rotateY(180deg)" },
  { v: 3, place: "rotateY(90deg)" },
  { v: 4, place: "rotateY(-90deg)" },
  { v: 2, place: "rotateX(90deg)" },
  { v: 5, place: "rotateX(-90deg)" },
];
const SHOW: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  6: { x: 0, y: 180 },
  3: { x: 0, y: -90 },
  4: { x: 0, y: 90 },
  2: { x: -90, y: 0 },
  5: { x: 90, y: 0 },
};
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
// Outward normal of each face before the cube turns (CSS axes: y points down, z towards the viewer).
const NORMALS: Record<number, [number, number, number]> = { 1: [0, 0, 1], 6: [0, 0, -1], 3: [1, 0, 0], 4: [-1, 0, 0], 2: [0, -1, 0], 5: [0, 1, 0] };
// Light comes from in front of the dice, slightly top-left, so the face up front stays bright white.
const LIGHT = (() => {
  const l = [-0.2, -0.35, 0.92];
  const m = Math.hypot(...l);
  return l.map((c) => c / m);
})();

/** A dice's orientation and the last roll it played (kept outside React so it survives remounts). */
export interface DiceSpin {
  angles: { x: number; y: number; z: number };
  handled: number;
}
export const newSpin = (): DiceSpin => ({ angles: { x: 0, y: 0, z: 0 }, handled: 0 });

// The game's dice: its orientation survives the dice moving from one name tag to another.
const gameSpin = newSpin();

const cubeTransform = (a: DiceSpin["angles"]) => `rotateZ(${a.z}deg) rotateX(${a.x}deg) rotateY(${a.y}deg)`;

/** Darkens each face by how far it turns away from the light, so the cube reads as solid. */
function shadeFaces(cube: HTMLElement, a: DiceSpin["angles"], ms: number) {
  const r = (d: number) => (d * Math.PI) / 180;
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(r(a.x)), Math.sin(r(a.x)), Math.cos(r(a.y)), Math.sin(r(a.y)), Math.cos(r(a.z)), Math.sin(r(a.z))];
  cube.querySelectorAll<HTMLElement>(".dice-face").forEach((face) => {
    const [x0, y0, z0] = NORMALS[Number(face.dataset.v)];
    // Same order as cubeTransform: rotateY first, then rotateX, then rotateZ.
    const x1 = x0 * cy + z0 * sy, z1 = -x0 * sy + z0 * cy;
    const y2 = y0 * cx - z1 * sx, z2 = y0 * sx + z1 * cx;
    const x3 = x1 * cz - y2 * sz, y3 = x1 * sz + y2 * cz;
    const lit = Math.max(0, x3 * LIGHT[0] + y3 * LIGHT[1] + z2 * LIGHT[2]);
    const light = face.querySelector<HTMLElement>(".dice-light");
    if (!light) return;
    light.style.transition = ms > 0 ? `opacity ${ms}ms cubic-bezier(.15,.65,.25,1)` : "none";
    light.style.opacity = Math.min(0.5, Math.max(0, (0.82 - lit) * 0.75)).toFixed(3);
  });
}
/** Lands on `v` after a few full tumbles, always spinning forward. At rest the dice faces you flat. */
function aimAt(a: DiceSpin["angles"], v: number, spins: boolean) {
  const t = SHOW[v] || SHOW[1];
  const next = (cur: number, base: number, turns: number) => {
    let n = base + Math.ceil((cur - base) / 360) * 360;
    if (spins) n += turns * 360;
    return n;
  };
  a.x = next(a.x, t.x, spins ? 2 + Math.floor(Math.random() * 2) : 0);
  a.y = next(a.y, t.y, spins ? 1 + Math.floor(Math.random() * 2) : 0);
  // Land square-on: a full spin while rolling, always ending at 0.
  a.z = next(a.z, 0, spins ? 1 : 0);
}

function Face({ v, place }: { v: number; place: string }) {
  return (
    <div className="dice-face" data-v={v} style={{ transform: `${place} translateZ(calc(var(--die) / 2))` }}>
      {Array.from({ length: 9 }, (_, k) => (PIPS[v].includes(k) ? <span key={k} className={cn("dice-pip", v === 1 && "dice-pip-one")} /> : <span key={k} />))}
      <span className="dice-light" />
    </div>
  );
}

export interface DiceRoll {
  id: number;
  value: number;
  at: number;
}

/**
 * A 3D dice. Tumbles and lands on `roll.value` whenever a new roll comes in;
 * otherwise shows `face`. Used by the game and by the home page's demo.
 */
export function DiceView({
  spin,
  face,
  roll,
  rolling,
  ready = false,
  onClick,
  label,
  size,
}: {
  spin: DiceSpin;
  face: number;
  roll: DiceRoll | null;
  rolling: boolean;
  ready?: boolean;
  onClick?: () => void;
  label?: string;
  /** Edge length in px (default: the CSS --die, which grows with the screen) */
  size?: number;
}) {
  const cubeRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLButtonElement>(null);

  // Show the current face without animating when the dice first appears.
  useLayoutEffect(() => {
    const cube = cubeRef.current;
    if (!cube) return;
    if (!rolling) aimAt(spin.angles, face, false);
    cube.style.transition = "none";
    cube.style.transform = cubeTransform(spin.angles);
    shadeFaces(cube, spin.angles, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new roll: tumble and land on the rolled number.
  useEffect(() => {
    const cube = cubeRef.current;
    const root = rootRef.current;
    if (!cube || !root || !roll || roll.id === spin.handled) return;
    spin.handled = roll.id;
    const left = Math.max(0, DICE_ROLL_MS - (Date.now() - roll.at));
    aimAt(spin.angles, roll.value, left > 200);
    root.style.setProperty("--roll-ms", `${left}ms`);
    root.classList.remove("rolling");
    void root.offsetWidth;
    if (left > 0) root.classList.add("rolling");
    cube.style.transition = left > 0 ? `transform ${left}ms cubic-bezier(.15,.65,.25,1)` : "none";
    requestAnimationFrame(() => {
      cube.style.transform = cubeTransform(spin.angles);
      shadeFaces(cube, spin.angles, left);
    });
    const t = setTimeout(() => root.classList.remove("rolling"), left);
    return () => clearTimeout(t);
  }, [roll, spin]);

  // Keep the face in sync when no roll animation is running (e.g. after a reload).
  useEffect(() => {
    const cube = cubeRef.current;
    if (!cube || rolling) return;
    const t = SHOW[face];
    const norm = (a: number) => ((Math.round(a) % 360) + 360) % 360;
    const a = spin.angles;
    if (norm(a.x) !== norm(t.x) || norm(a.y) !== norm(t.y) || norm(a.z) !== 0) {
      aimAt(a, face, false);
      cube.style.transition = "transform 300ms ease-out";
      cube.style.transform = cubeTransform(a);
      shadeFaces(cube, a, 300);
    }
  });

  return (
    <button
      ref={rootRef}
      type="button"
      className={cn("dice shrink-0 rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-ring disabled:cursor-default", ready && "ready")}
      style={size ? ({ "--die": `${size}px` } as React.CSSProperties) : undefined}
      disabled={!ready}
      aria-label={label ?? (ready ? "Roll the dice" : `Dice showing ${face}`)}
      onClick={onClick}
    >
      <span className="dice-shadow" aria-hidden="true" />
      <div className="dice-hop" aria-hidden="true">
        <div ref={cubeRef} className="dice-cube">
          <div className="dice-core" style={{ transform: "rotateX(90deg)" }} />
          <div className="dice-core" style={{ transform: "rotateY(90deg)" }} />
          <div className="dice-core" />
          {FACES.map((f) => (
            <Face key={f.v} {...f} />
          ))}
        </div>
      </div>
    </button>
  );
}

/** The game's dice, for whoever's turn it is. */
export function Dice3D() {
  const game = useGame();
  const canRoll = game.canRollNow();
  return (
    <DiceView
      spin={gameSpin}
      face={game.dieFace}
      roll={game.diceRoll}
      rolling={game.rolling}
      ready={canRoll}
      onClick={() => game.roll()}
      label={canRoll ? "Roll the dice" : `Dice showing ${game.dieFace}`}
    />
  );
}
