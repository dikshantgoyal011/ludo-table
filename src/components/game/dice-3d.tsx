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

// The cube's orientation survives the dice moving from one name tag to another.
const angles = { x: -18, y: 22, z: 0 };
let handledRoll = 0;

const cubeTransform = () => `rotateZ(${angles.z}deg) rotateX(${angles.x}deg) rotateY(${angles.y}deg)`;
/** Lands on `v` after a few full tumbles, always spinning forward. */
function aimAt(v: number, spins: boolean) {
  const t = SHOW[v] || SHOW[1];
  // A small tilt keeps it looking 3D while still showing the top face clearly.
  const tiltX = -14;
  const tiltY = t.x === 0 ? 16 : 0;
  const next = (cur: number, base: number, turns: number) => {
    let n = base + Math.ceil((cur - base) / 360) * 360;
    if (spins) n += turns * 360;
    return n;
  };
  angles.x = next(angles.x, t.x + tiltX, spins ? 2 + Math.floor(Math.random() * 2) : 0);
  angles.y = next(angles.y, t.y + tiltY, spins ? 1 + Math.floor(Math.random() * 2) : 0);
  angles.z = spins ? (Math.random() * 16 - 8) : angles.z;
}

function Face({ v, place }: { v: number; place: string }) {
  return (
    <div className="dice-face" style={{ transform: `${place} translateZ(calc(var(--die) / 2))` }}>
      {Array.from({ length: 9 }, (_, k) => (PIPS[v].includes(k) ? <span key={k} className="dice-pip" /> : <span key={k} />))}
    </div>
  );
}

export function Dice3D() {
  const game = useGame();
  const cubeRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLButtonElement>(null);
  const canRoll = game.canRollNow();
  const roll = game.diceRoll;

  // Show the current face without animating when the dice first appears.
  useLayoutEffect(() => {
    const cube = cubeRef.current;
    if (!cube) return;
    if (!game.rolling) aimAt(game.dieFace, false);
    cube.style.transition = "none";
    cube.style.transform = cubeTransform();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new roll: tumble and land on the rolled number.
  useEffect(() => {
    const cube = cubeRef.current;
    const root = rootRef.current;
    if (!cube || !root || !roll || roll.id === handledRoll) return;
    handledRoll = roll.id;
    const left = Math.max(0, DICE_ROLL_MS - (Date.now() - roll.at));
    aimAt(roll.value, left > 200);
    root.style.setProperty("--roll-ms", `${left}ms`);
    root.classList.remove("rolling");
    void root.offsetWidth;
    if (left > 0) root.classList.add("rolling");
    cube.style.transition = left > 0 ? `transform ${left}ms cubic-bezier(.15,.65,.25,1)` : "none";
    requestAnimationFrame(() => {
      cube.style.transform = cubeTransform();
    });
    const t = setTimeout(() => root.classList.remove("rolling"), left);
    return () => clearTimeout(t);
  }, [roll]);

  // Keep the face in sync when no roll animation is running (e.g. after a reload).
  useEffect(() => {
    const cube = cubeRef.current;
    if (!cube || game.rolling) return;
    const t = SHOW[game.dieFace];
    const norm = (a: number) => ((Math.round(a) % 360) + 360) % 360;
    const wantX = norm(t.x - 14);
    const wantY = norm(t.y + (t.x === 0 ? 16 : 0));
    if (norm(angles.x) !== wantX || norm(angles.y) !== wantY) {
      aimAt(game.dieFace, false);
      cube.style.transition = "transform 300ms ease-out";
      cube.style.transform = cubeTransform();
    }
  });

  return (
    <button
      ref={rootRef}
      type="button"
      className={cn("dice shrink-0 rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-ring disabled:cursor-default", canRoll && "ready")}
      disabled={!canRoll}
      aria-label={canRoll ? "Roll the dice" : `Dice showing ${game.dieFace}`}
      onClick={() => game.roll()}
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
