"use client";

import { useEffect, useRef, useState } from "react";
import { BoardPreview, TokenArt, useBoardStyle } from "@/components/game/board";
import { DiceView, newSpin, type DiceRoll } from "@/components/game/dice-3d";
import { COLORS, DICE_ROLL_MS, FINISH, NAMES, SLOTS_FOR } from "@/lib/game/constants";
import { rollDie } from "@/lib/game/dice";
import { basePoint } from "@/lib/game/geometry";
import { applyMove, applyRoll, chooseMove, clone, freshState } from "@/lib/game/rules";
import type { Color, GameState } from "@/lib/game/types";
import type { Variant } from "@/lib/game/variants";
import { cn } from "@/lib/utils";

const COLS = ["#c8262b", "#16894a", "#e9a912", "#1f5fcc"];

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** setTimeout that waits while the tab is hidden, so the demo never runs in the background. */
function useTimers() {
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return (ms: number) =>
    new Promise<void>((res) => {
      const go = () => (document.hidden ? timers.current.push(setTimeout(go, 400)) : res());
      timers.current.push(setTimeout(go, ms));
    });
}

// ---------------------------------------------------------------- thrown things
function Pips({ v }: { v: number }) {
  const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  return (
    <span className="grid h-full w-full grid-cols-3 grid-rows-3 place-items-center p-[16%]">
      {Array.from({ length: 9 }, (_, k) => (
        <span key={k} className={cn("h-[72%] w-[72%] rounded-full", PIPS[v].includes(k) && "bg-[#1b1b22]")} />
      ))}
    </span>
  );
}

/** A small flat dice that tumbles while `rolling`. */
function MiniDie({ v, rolling }: { v: number; rolling: boolean }) {
  return (
    <span className={cn("demo-die block h-9 w-9 rounded-[22%] bg-[linear-gradient(160deg,#fff,#e9e9ef)] shadow-[inset_0_-2px_3px_rgba(0,0,0,.15),0_3px_6px_rgba(0,0,0,.35)]", rolling && "demo-tumble")}>
      <Pips v={v} />
    </span>
  );
}

/** Cowrie shells / stick dice / two dice, thrown every few seconds. */
function Thrown({ kind }: { kind: Variant["thrown"] }) {
  const count = kind === "cowries" ? 6 : kind === "sticks" ? 3 : 2;
  const [up, setUp] = useState<number[]>(() => Array.from({ length: count }, (_, k) => (k % 2 ? 1 : 0)));
  const [tossing, setTossing] = useState(false);
  const wait = useTimers();
  useEffect(() => {
    if (reducedMotion()) return;
    let alive = true;
    (async () => {
      while (alive) {
        await wait(1900);
        if (!alive) return;
        setTossing(true);
        await wait(750);
        if (!alive) return;
        setUp(Array.from({ length: count }, () => (kind === "two-dice" || kind === "dice" ? rollDie() : kind === "sticks" ? [1, 2, 5, 6][Math.floor(Math.random() * 4)] : Math.random() < 0.5 ? 1 : 0)));
        setTossing(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  if (kind === "dice") return <MiniDie v={up[0] || 4} rolling={tossing} />;
  if (kind === "two-dice")
    return (
      <span className="flex items-center gap-2">
        <MiniDie v={up[0] || 3} rolling={tossing} />
        <MiniDie v={up[1] || 5} rolling={tossing} />
      </span>
    );
  if (kind === "sticks")
    return (
      <span className="flex items-center gap-1.5">
        {up.map((v, k) => (
          <span key={k} className={cn("demo-stick relative flex h-[14px] w-16 items-center justify-around rounded-[4px] bg-[linear-gradient(180deg,#f6e7c4,#d9b77a)] px-1 shadow-[0_2px_4px_rgba(0,0,0,.35)]", tossing && "demo-tumble")} style={{ animationDelay: `${k * 70}ms` }}>
            {Array.from({ length: Math.min(v, 6) }, (_, i) => (
              <span key={i} className="h-[5px] w-[5px] rounded-full bg-[#5a3418]" />
            ))}
          </span>
        ))}
      </span>
    );
  const shown = up.filter(Boolean).length;
  return (
    <span className="flex items-center gap-2">
      <span className="flex items-center gap-1">
        {up.map((u, k) => (
          <svg key={k} viewBox="0 0 20 26" className={cn("h-7 w-5 drop-shadow", tossing && "demo-tumble")} style={{ animationDelay: `${k * 60}ms` }} aria-hidden="true">
            <ellipse cx="10" cy="13" rx="9" ry="12" fill={u ? "#fbf3e2" : "#efe1c2"} stroke="#b89a68" strokeWidth="1" />
            {u ? (
              <path d="M10 3.5v19" stroke="#6b4a26" strokeWidth="2.2" strokeLinecap="round" />
            ) : (
              <ellipse cx="9" cy="10" rx="4" ry="5" fill="#fff" opacity=".6" />
            )}
            {u ? <path d="M8 6h4M8 10h4M8 14h4M8 18h4" stroke="#6b4a26" strokeWidth=".9" /> : null}
          </svg>
        ))}
      </span>
      {!tossing && <span className="min-w-6 rounded-full bg-primary/15 px-2 text-sm font-extrabold text-primary tabular-nums">{shown || "–"}</span>}
    </span>
  );
}

// ---------------------------------------------------------------- Ludo: a real game played by the computer
type Shown = Record<Color, number[]>;

function freshDemo(players: number): GameState {
  const s = freshState();
  s.phase = "playing";
  for (const c of SLOTS_FOR[players]) s.seats[c] = { id: c, nick: NAMES[c], bot: true };
  s.turn = SLOTS_FOR[players][0];
  // Play a little first, so tokens are already out on the board.
  for (let k = 0; k < 70 && s.phase === "playing"; k++) {
    const c = s.turn!;
    applyRoll(s, c, rollDie());
    if (s.roll) applyMove(s, c, chooseMove(s, c, s.roll), s.roll);
  }
  return s.phase === "playing" ? s : freshDemo(players);
}

function LudoDemo({ twoDice = false }: { twoDice?: boolean }) {
  const [style, th] = useBoardStyle();
  const game = useRef<GameState | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [walking, setWalking] = useState<string | null>(null);
  // The same 3D dice as the game, each with its own orientation.
  const spinA = useRef(newSpin()).current;
  const spinB = useRef(newSpin()).current;
  const [dice, setDice] = useState<{ c: Color; rolling: boolean; a: DiceRoll | null; b: DiceRoll | null; faceA: number; faceB: number; note: string }>({
    c: "red",
    rolling: false,
    a: null,
    b: null,
    faceA: 3,
    faceB: 5,
    note: "",
  });
  const wait = useTimers();

  useEffect(() => {
    let alive = true;
    const s0 = freshDemo(4);
    game.current = s0;
    const pos: Shown = clone(s0.tokens);
    setShown(clone(pos));
    if (reducedMotion()) return;

    /** Apply a roll of v for c and walk the token exactly that far (or out of the yard on a 6). */
    const play = async (s: GameState, c: Color, v: number) => {
      const before = clone(s.tokens);
      applyRoll(s, c, v);
      if (s.roll) applyMove(s, c, chooseMove(s, c, s.roll), s.roll);
      const moved = before[c].some((a, i) => s.tokens[c][i] > a);
      setDice((d) => ({ ...d, note: moved ? "" : "no move" }));
      for (let i = 0; i < 4 && alive; i++) {
        const a = before[c][i];
        const b = s.tokens[c][i];
        if (b <= a) continue;
        if (a === -1) {
          pos[c][i] = 0;
          setShown(clone(pos));
          await wait(420);
          continue;
        }
        setWalking(c + i);
        for (let p = a + 1; p <= b && alive; p++) {
          pos[c][i] = p;
          setShown(clone(pos));
          await wait(170);
        }
        setWalking(null);
      }
      // Tokens it cut fly back to their yard.
      for (const col of COLORS)
        for (let i = 0; i < 4; i++)
          if (s.tokens[col][i] === -1 && pos[col][i] !== -1) {
            pos[col][i] = -1;
            setShown(clone(pos));
            await wait(400);
          }
      Object.assign(pos, clone(s.tokens));
      setShown(clone(pos));
    };

    (async () => {
      let id = 0;
      while (alive) {
        let s = game.current!;
        if (s.phase !== "playing") {
          await wait(1500);
          s = game.current = freshDemo(4);
          Object.assign(pos, clone(s.tokens));
          setShown(clone(pos));
        }
        const c = s.turn!;
        // The number is decided as the dice is thrown; the dice lands on it, then the token moves it.
        const v1 = rollDie();
        const v2 = twoDice ? rollDie() : 0;
        const at = Date.now();
        id++;
        setDice((d) => ({ ...d, c, rolling: true, note: "", a: { id, value: v1, at }, b: twoDice ? { id, value: v2, at } : null }));
        await wait(DICE_ROLL_MS + 150);
        if (!alive) return;
        setDice((d) => ({ ...d, rolling: false, faceA: v1, faceB: v2 || d.faceB }));
        await wait(200);
        await play(s, c, v1);
        // Two dice: the same player moves the second number too.
        if (twoDice && alive && s.phase === "playing") {
          if (s.turn !== c || s.roll) {
            s.turn = c;
            s.roll = null;
          }
          await wait(250);
          await play(s, c, v2);
        }
        await wait(650);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Tokens sharing a square sit side by side (same idea as the real board).
  const tokens: { key: string; c: Color; x: number; y: number; scale: number; home: boolean }[] = [];
  if (shown) {
    const groups: Record<string, { c: Color; i: number; x: number; y: number }[]> = {};
    for (const c of COLORS)
      shown[c].forEach((p, i) => {
        if (p === FINISH && !game.current?.seats[c]) return;
        const b = basePoint(c, i, p);
        (groups[b.key] ||= []).push({ c, i, x: b.x, y: b.y });
      });
    Object.values(groups).forEach((list) =>
      list.forEach((t, k) => {
        const n = list.length;
        const ang = (k / n) * Math.PI * 2 - Math.PI / 4;
        tokens.push({ key: t.c + t.i, home: shown[t.c][t.i] === -1, c: t.c, x: t.x + (n > 1 ? Math.cos(ang) * 0.2 : 0), y: t.y + (n > 1 ? Math.sin(ang) * 0.2 : 0), scale: n > 2 ? 0.62 : n > 1 ? 0.75 : 1 });
      }),
    );
    // Fixed order, so moving tokens keep their slide (see tokenViews in the controller).
    tokens.sort((a, b) => (a.key < b.key ? -1 : 1));
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <BoardPreview style={style} th={th} className="rounded-xl p-1.5">
        {tokens.map((t) => (
          <g key={t.key} className={cn("token", walking === t.key && "stepping", t.home && "returning")} style={{ transform: `translate(${t.x}px,${t.y}px) scale(${t.scale})` }}>
            <TokenArt style={style} fill={th.pieces[t.c]} />
          </g>
        ))}
      </BoardPreview>
      <div className="flex min-h-12 items-center gap-3 text-sm font-bold">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full ring-2 ring-white/30" style={{ background: th.pieces[dice.c] }} />
          {NAMES[dice.c]} {dice.rolling ? "rolls…" : `rolled${dice.note ? " · " + dice.note : ""}`}
        </span>
        <DiceView spin={spinA} face={dice.faceA} roll={dice.a} rolling={dice.rolling} size={40} label="Dice" />
        {twoDice && <DiceView spin={spinB} face={dice.faceB} roll={dice.b} rolling={dice.rolling} size={40} label="Second dice" />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the other boards (drawn, with tokens travelling round them)
/** True when the player asked for less motion (read after mounting, so server and browser render alike). */
function useStill() {
  const [still, setStill] = useState(false);
  useEffect(() => setStill(reducedMotion()), []);
  return still;
}

/**
 * A pawn that follows `path` for ever, starting `begin` seconds in. With less
 * motion asked for, it stays put at that point (the same timing, slowed to a stop).
 */
function Traveller({ path, dur, begin, children }: { path: string; dur: number; begin: number; children: React.ReactNode }) {
  const slow = useStill() ? 1e6 : 1;
  return (
    <g>
      <g className="demo-bob">{children}</g>
      <animateMotion dur={`${dur * slow}s`} begin={`${-begin * slow}s`} repeatCount="indefinite" path={path} rotate="0" calcMode="linear" />
    </g>
  );
}

/** Pachisi / Chaupar: an embroidered cross-shaped cloth. 19 x 19 cells. */
function ClothBoard({ v }: { v: Variant }) {
  const [bg, gold] = v.tint;
  const cells: React.ReactNode[] = [];
  const arm = (x0: number, y0: number, w: number, h: number) => {
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) cells.push(<rect key={`${x0 + x}-${y0 + y}`} x={x0 + x} y={y0 + y} width={1} height={1} fill="none" stroke={gold} strokeOpacity={0.55} strokeWidth={0.05} />);
  };
  arm(8, 0, 3, 8);
  arm(8, 11, 3, 8);
  arm(0, 8, 8, 3);
  arm(11, 8, 8, 3);
  // castle squares (marked with a cross)
  const castles = [
    [8, 3], [10, 3], [8, 15], [10, 15], [3, 8], [3, 10], [15, 8], [15, 10],
  ];
  // round the outside of the cross through the cell centres
  const loop = "M8.5 0.5V8.5H0.5V10.5H8.5V18.5H10.5V10.5H18.5V8.5H10.5V0.5Z";
  return (
    <svg viewBox="-0.5 -0.5 20 20" className="block aspect-square w-full" aria-hidden="true">
      <defs>
        <pattern id={`weave-${v.id}`} width="0.5" height="0.5" patternUnits="userSpaceOnUse">
          <path d="M0 .25h.5M.25 0v.5" stroke="#000" strokeOpacity=".12" strokeWidth=".04" />
        </pattern>
      </defs>
      <path d="M8 0h3v8h8v3h-8v8H8v-8H0V8h8z" fill={bg} stroke={gold} strokeWidth="0.18" strokeLinejoin="round" />
      <path d="M8 0h3v8h8v3h-8v8H8v-8H0V8h8z" fill={`url(#weave-${v.id})`} />
      {cells}
      {castles.map(([x, y]) => (
        <path key={`${x}${y}`} d={`M${x + 0.2} ${y + 0.2}l.6 .6m0 -.6l-.6 .6`} stroke="#fff3d0" strokeWidth="0.09" strokeLinecap="round" />
      ))}
      <rect x="8" y="8" width="3" height="3" fill={gold} />
      <path d="M8 8l3 3M11 8l-3 3" stroke={bg} strokeWidth="0.08" />
      {COLS.map((col, k) => (
        <Traveller key={col} path={loop} dur={26} begin={k * 6.5}>
          <path d="M-.36 .3C-.36 -.1 -.2 -.42 0 -.46C.2 -.42 .36 -.1 .36 .3Z" fill={col} stroke="#2a1608" strokeWidth=".06" />
          <circle cy="-.5" r=".09" fill={gold} />
        </Traveller>
      ))}
    </svg>
  );
}

/** Chowka Bara / Challas Aath: a grid chalked on the floor; tokens spiral in to the centre. */
function FloorGrid({ v }: { v: Variant }) {
  const n = v.board === "grid5" ? 5 : 7;
  const mid = Math.floor(n / 2);
  const safe = [
    [mid, mid], [0, mid], [mid, 0], [n - 1, mid], [mid, n - 1],
  ];
  // Outer ring, then the next ring in, ending in the centre (cell centres).
  const pts: [number, number][] = [];
  for (let ring = 0; ring <= mid; ring++) {
    const a = ring, b = n - 1 - ring;
    if (a === b) {
      pts.push([a, a]);
      break;
    }
    for (let y = a; y < b; y++) pts.push([a, y]);
    for (let x = a; x < b; x++) pts.push([x, b]);
    for (let y = b; y > a; y--) pts.push([b, y]);
    for (let x = b; x > a; x--) pts.push([x, a]);
  }
  const path = "M" + pts.map(([x, y]) => `${x + 0.5} ${y + 0.5}`).join("L");
  return (
    <svg viewBox={`-0.4 -0.4 ${n + 0.8} ${n + 0.8}`} className="block aspect-square w-full" aria-hidden="true">
      <defs>
        <radialGradient id={`floor-${v.id}`} cx="50%" cy="40%" r="75%">
          <stop offset="0" stopColor="#b8643a" />
          <stop offset="1" stopColor="#6e3418" />
        </radialGradient>
      </defs>
      <rect x="-0.4" y="-0.4" width={n + 0.8} height={n + 0.8} rx="0.4" fill={`url(#floor-${v.id})`} />
      {Array.from({ length: n + 1 }, (_, i) => (
        <path key={i} d={`M${i} 0V${n}M0 ${i}H${n}`} stroke="#fff6e6" strokeOpacity=".85" strokeWidth=".06" strokeLinecap="round" />
      ))}
      {safe.map(([x, y], k) => (
        <path key={k} d={`M${x + 0.18} ${y + 0.18}l.64 .64m0 -.64l-.64 .64`} stroke={k ? "#fff6e6" : v.tint[1]} strokeWidth=".08" strokeLinecap="round" />
      ))}
      {COLS.map((col, k) => (
        <Traveller key={col} path={path} dur={n === 5 ? 18 : 26} begin={k * (n === 5 ? 4.5 : 6.5)}>
          <circle r=".28" fill={col} stroke="#1c0f06" strokeWidth=".05" />
          <circle r=".1" cx="-.08" cy="-.08" fill="#fff" opacity=".55" />
        </Traveller>
      ))}
    </svg>
  );
}

/** Aeroplane Chess: a ring of coloured squares; planes fly round it. */
function PlaneBoard({ v }: { v: Variant }) {
  const slow = useStill() ? 1e6 : 1;
  const ring: React.ReactNode[] = [];
  const N = 13;
  const loop = "M1.5 1.5H13.5V13.5H1.5Z";
  for (let k = 0; k < N; k++)
    ["top", "right", "bottom", "left"].forEach((side, s) => {
      const t = k / (N - 1);
      const x = side === "top" ? 1 + t * 12 : side === "right" ? 13 : side === "bottom" ? 13 - t * 12 : 1;
      const y = side === "top" ? 1 : side === "right" ? 1 + t * 12 : side === "bottom" ? 13 : 13 - t * 12;
      ring.push(<rect key={`${side}${k}`} x={x} y={y} width={0.95} height={0.95} rx={0.18} fill={COLS[(k + s) % 4]} opacity={0.9} />);
    });
  return (
    <svg viewBox="0 0 15 15" className="block aspect-square w-full" aria-hidden="true">
      <rect width="15" height="15" rx="1" fill="#f8f0da" />
      {ring}
      {COLS.map((col, k) => (
        <path key={col} d="M7.5 7.5L7.5 3.2A4.3 4.3 0 0 1 11.8 7.5Z" fill={col} opacity=".85" transform={`rotate(${k * 90} 7.5 7.5)`} />
      ))}
      <circle cx="7.5" cy="7.5" r="1.1" fill={v.tint[1]} stroke="#7a5a12" strokeWidth=".08" />
      {COLS.map((col, k) => (
        <g key={col}>
          <path d="M.5 0L-.15 .18V.42L-.32 .5V.6L0 .55L.32 .6V.5L.15 .42V.18Z" transform="rotate(90) scale(1.6)" fill={col} stroke="#fff" strokeWidth=".06" />
          <animateMotion dur={`${20 * slow}s`} begin={`${-k * 5 * slow}s`} repeatCount="indefinite" path={loop} rotate="auto" />
        </g>
      ))}
    </svg>
  );
}

/** The animated preview for a game. */
export function GamePreview({ variant }: { variant: Variant }) {
  if (variant.id === "ludo") return <LudoDemo />;
  if (variant.id === "parchis") return <LudoDemo twoDice />;
  const board =
    variant.board === "cloth" ? <ClothBoard v={variant} /> : variant.board === "plane" ? <PlaneBoard v={variant} /> : <FloorGrid v={variant} />;
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="w-full overflow-hidden rounded-xl p-1.5 shadow-[0_10px_24px_rgba(0,0,0,.4)]"
        style={{
          // Pachisi / Chaupar: the cloth lies on a dark carved table; the rest sit in a gold frame.
          background:
            variant.board === "cloth"
              ? "radial-gradient(circle at 50% 45%, #5a3520, #2a160a 75%), #2a160a"
              : `linear-gradient(145deg, ${variant.tint[1]}, #8a5d14)`,
          boxShadow: variant.board === "cloth" ? "inset 0 0 0 2px #c8962e, 0 10px 24px rgba(0,0,0,.4)" : undefined,
        }}
      >
        {board}
      </div>
      <div className="flex min-h-9 items-center gap-2 text-sm font-bold text-muted-foreground">
        <Thrown kind={variant.thrown} />
      </div>
    </div>
  );
}
