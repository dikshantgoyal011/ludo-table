"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { BoardPreview, TokenArt, useBoardStyle } from "@/components/game/ludo-board";
import { PachisiPawn, PachisiSurface, pachisiLook, usePachisiStyle } from "@/components/game/pachisi-board";
import { ParchisBoardPreview, ParchisToken } from "@/components/game/parchis-board";
import { ChauparBoardPreview, ChauparPawn } from "@/components/game/chaupar-board";
import { CowrieView } from "@/components/game/cowries";
import { DiceView, newSpin, type DiceRoll } from "@/components/game/dice-3d";
import { newPasaSpin, PasaView } from "@/components/game/pasa";

import { stackSquare } from "@/lib/game/chaupar/board";
import { throwOf, validThrow } from "@/lib/game/chaupar/dice";
import { COLORS, DICE_ROLL_MS, NAMES, SLOTS_FOR } from "@/lib/game/constants";
import { rollDie } from "@/lib/game/ludo/dice";
import { P_SIZE } from "@/lib/game/pachisi/board";
import { clone, freshState, rulesFor } from "@/lib/game/rules";
import type { Color, GameId, GameState } from "@/lib/game/types";
import type { Variant } from "@/lib/game/variants";
import type { PachisiStyle } from "@/lib/theme/boards";
import { holdDecoration, whenIdle } from "@/lib/busy";
import { cn } from "@/lib/utils";

const COLS = ["#c8262b", "#16894a", "#e9a912", "#1f5fcc"];

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * setTimeout for the demos that holds still while they're no use: the tab is
 * hidden, the demo is scrolled off the screen (`seen` false), or the player
 * just tapped to open another page (see busy.ts).
 */
function useTimers(seen?: React.RefObject<boolean>) {
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return (ms: number) =>
    new Promise<void>((res) => {
      const go = () => (holdDecoration() || seen?.current === false ? timers.current.push(setTimeout(go, 400)) : res());
      timers.current.push(setTimeout(go, ms));
    });
}

/** Is this element on the screen? (A ref, read by the demo's timers: no re-renders.) */
function useOnScreen<T extends Element>() {
  const el = useRef<T>(null);
  const seen = useRef(true);
  useEffect(() => {
    if (!el.current || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => (seen.current = e.isIntersecting));
    io.observe(el.current);
    return () => io.disconnect();
  }, []);
  return [el, seen] as const;
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


/**
 * The computer's moves with the roll in hand (or none: games that allow it let
 * the roll go). Parchís can add moves to the same roll (count 20 / count 10), and
 * Chaupar plays two dice (and the throws a doublet adds): those are made too.
 */
function botMove(s: GameState, c: Color) {
  const r = rulesFor(s);
  const many = s.game === "parchis" || s.game === "chaupar";
  for (let k = 0; k < (many ? 12 : 1) && s.roll && s.turn === c && s.phase === "playing"; k++) {
    const { i, opt } = r.chooseMove(s, c, s.roll);
    if (i >= 0) r.applyMove(s, c, i, s.roll, opt);
    else r.pass?.(s, c);
  }
}

function freshDemo(players: number, game: GameId = "ludo"): GameState {
  const s = freshState();
  if (game !== "ludo") s.game = game;
  s.phase = "playing";
  for (const c of SLOTS_FOR[players]) s.seats[c] = { id: c, nick: NAMES[c], bot: true };
  s.turn = SLOTS_FOR[players][0];
  // Play a little first, so tokens are already out on the board. (Chaupar's pawns start out on the board.)
  const rules = rulesFor(game);
  rules.setup?.(s);
  for (let k = 0; k < (game === "chaupar" ? 12 : 70) && s.phase === "playing"; k++) {
    const c = s.turn!;
    rules.applyRoll(s, c, rules.roll(s, c));
    botMove(s, c);
  }
  return s.phase === "playing" ? s : freshDemo(players, game);
}

/** A real game played by the computer: Ludo on the theme's board, Pachisi on its cloth, Parchís, or Chaupar. */
function LudoDemo({ twoDice = false, game: kind = "ludo" }: { twoDice?: boolean; game?: GameId }) {
  const pachisi = kind === "pachisi";
  const parchis = kind === "parchis";
  const chaupar = kind === "chaupar";
  // (Thrown, not rolled: cowries and long dice.)
  const throws = pachisi || chaupar;
  const pasaSpins = useRef([newPasaSpin(), newPasaSpin()]).current;
  const rules = rulesFor(kind);
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
  const [box, seen] = useOnScreen<HTMLDivElement>();
  // The shells / dice under the board shrink to fit beside the "Yellow threw" line when the
  // preview is narrow (a short phone), instead of sticking out of the frame; narrower
  // still, the line keeps just the player's colour.
  const label = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(999);
  const [labelW, setLabelW] = useState(0);
  useEffect(() => {
    const el = box.current;
    const lab = label.current;
    if (!el || !lab || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      setWidth(el.clientWidth);
      setLabelW(lab.offsetWidth);
    });
    ro.observe(el);
    ro.observe(lab);
    return () => ro.disconnect();
  }, [box]);
  const dieCount = twoDice ? 2 : 1;
  const narrow = width < (pachisi || chaupar ? 250 : twoDice ? 230 : 170);
  const room = narrow ? width - 28 : width - labelW - 12;
  // A tray of six shells is about 6.1 shells wide; a dice is its size wide (plus the gap between two);
  // the tray of two long dice about 2.7 sticks.
  const shellPx = Math.max(13, Math.min(22, Math.floor(room / 6.1)));
  const diePx = Math.max(26, Math.min(40, Math.floor((room - (dieCount - 1) * 12) / dieCount)));
  const stickPx = Math.max(24, Math.min(46, Math.floor(room / 2.7)));
  const wait = useTimers(seen);

  useEffect(() => {
    let alive = true;
    const s0 = freshDemo(4, kind);
    game.current = s0;
    const pos: Shown = clone(s0.tokens);
    setShown(clone(pos));
    if (reducedMotion()) return;
    // The demo only starts once the page can answer taps (it's decoration: it waits its turn).
    let cancelIdle = () => {};
    const begin = new Promise<void>((res) => {
      cancelIdle = whenIdle(res, 3000);
    });

    /** Apply a roll of v for c and walk the token exactly that far (or out of the yard on a 6). */
    const play = async (s: GameState, c: Color, v: number) => {
      const before = clone(s.tokens);
      rules.applyRoll(s, c, v);
      botMove(s, c);
      // The pieces that moved; pieces going the same way together walk together (a Chaupar pair).
      const moves: { col: Color; idx: number[]; a: number; b: number }[] = [];
      for (const col of COLORS)
        for (let i = 0; i < 4; i++) {
          const a = before[col][i];
          const b = s.tokens[col][i];
          if (b === a || b === -1) continue;
          const m = moves.find((x) => x.col === col && x.a === a && x.b === b);
          if (m) m.idx.push(i);
          else moves.push({ col, idx: [i], a, b });
        }
      setDice((d) => ({ ...d, note: moves.length ? "" : "no move" }));
      for (const { col, idx, a, b } of moves) {
        if (!alive) break;
        // Out of the yard onto the first square: one glide. (A Pachisi piece coming out further walks from there.)
        if (a === -1 && b === 0) {
          idx.forEach((i) => (pos[col][i] = 0));
          setShown(clone(pos));
          await wait(420);
          continue;
        }
        setWalking(idx.map((i) => col + i).join(","));
        for (const p of rules.steps(a, b)) {
          if (!alive) break;
          idx.forEach((i) => (pos[col][i] = p));
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
      await begin;
      let id = 0;
      while (alive) {
        let s = game.current!;
        if (s.phase !== "playing") {
          await wait(1500);
          s = game.current = freshDemo(4, kind);
          Object.assign(pos, clone(s.tokens));
          setShown(clone(pos));
        }
        const c = s.turn!;
        // The number is decided as the dice is thrown; the dice lands on it, then the token moves it.
        const v1 = rules.roll(s, c);
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
      cancelIdle();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Tokens sharing a square sit side by side (same idea as the real board; a Chaupar pair stands as a stack).
  const tokens: { key: string; c: Color; x: number; y: number; scale: number; home: boolean; lying?: boolean; lift?: number; badge?: number }[] = [];
  if (shown) {
    const groups: Record<string, { c: Color; i: number; p: number; x: number; y: number; lying?: boolean }[]> = {};
    for (const c of COLORS)
      shown[c].forEach((p, i) => {
        if (p === rules.finish && !game.current?.seats[c]) return;
        // (Chaupar: only seated colours have pieces.)
        if (chaupar && !game.current?.seats[c]) return;
        const b = rules.point(c, i, p);
        (groups[b.key] ||= []).push({ c, i, p, x: b.x, y: b.y, lying: b.lying });
      });
    Object.values(groups).forEach((list) => {
      if (chaupar) {
        for (const t of stackSquare(list)) tokens.push({ key: t.c + t.i, c: t.c, x: t.x, y: t.y, scale: t.scale, home: t.p === -1, lying: t.lying, lift: t.lift, badge: t.badge });
        return;
      }
      list.forEach((t, k) => {
        const n = list.length;
        const ang = (k / n) * Math.PI * 2 - Math.PI / 4;
        tokens.push({ lying: t.lying, key: t.c + t.i, home: shown[t.c][t.i] === -1, c: t.c, x: t.x + (n > 1 ? Math.cos(ang) * 0.2 : 0), y: t.y + (n > 1 ? Math.sin(ang) * 0.2 : 0), scale: n > 2 ? 0.62 : n > 1 ? 0.75 : 1 });
      });
    });
    // Fixed order, so moving tokens keep their slide (see tokenViews in the controller).
    tokens.sort((a, b) => (a.key < b.key ? -1 : 1));
  }

  const walkers = walking ? walking.split(",") : [];
  const pieces = tokens.map((t) => (
    <g key={t.key} className={cn("token", walkers.includes(t.key) && "stepping", t.home && "returning")} style={{ transform: `translate(${t.x}px,${t.y}px) scale(${t.scale})` }}>
      {chaupar ? (
        <ChauparPawn fill={th.pieces[t.c]} lying={t.lying} lift={t.lift} badge={t.badge} />
      ) : pachisi ? (
        <PachisiPawn fill={th.pieces[t.c]} lying={t.lying} />
      ) : parchis ? (
        <ParchisToken fill={th.pieces[t.c]} />
      ) : (
        <TokenArt style={style} fill={th.pieces[t.c]} />
      )}
    </g>
  ));
  return (
    <div ref={box} className="flex flex-col items-center gap-2 md:gap-3">
      {chaupar ? (
        <ChauparBoardPreview>{pieces}</ChauparBoardPreview>
      ) : pachisi ? (
        <PachisiBoardPreview>{pieces}</PachisiBoardPreview>
      ) : parchis ? (
        <ParchisBoardPreview>{pieces}</ParchisBoardPreview>
      ) : (
        <BoardPreview style={style} th={th} className="rounded-xl p-1.5">
          {pieces}
        </BoardPreview>
      )}
      <div className="flex min-h-11 max-w-full items-center justify-center gap-3 text-sm font-bold md:min-h-12">
        {/* One line, however wide the shells: "Blue threw · no move" */}
        <span ref={label} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          <span className="h-3 w-3 rounded-full ring-2 ring-white/30" style={{ background: th.pieces[dice.c] }} />
          <span className={cn(narrow && "sr-only")}>
            {NAMES[dice.c]} {dice.rolling ? (throws ? "throws…" : "rolls…") : `${throws ? "threw" : "rolled"}${dice.note ? " · " + dice.note : ""}`}
          </span>
        </span>
        {chaupar ? (
          <PasaView
            dice={validThrow(dice.faceA) ? throwOf(dice.faceA) : [3, 6]}
            roll={dice.a}
            rolling={dice.rolling}
            spins={pasaSpins}
            label="Long dice"
            style={{ ["--pw" as string]: `${stickPx}px`, ["--ph" as string]: `${Math.round(stickPx * 0.29)}px` }}
          />
        ) : pachisi ? (
          <CowrieView value={dice.faceA} roll={dice.a} rolling={dice.rolling} shell={shellPx} label="Cowrie shells" />
        ) : (
          <DiceView spin={spinA} face={dice.faceA} roll={dice.a} rolling={dice.rolling} size={diePx} label="Dice" />
        )}
        {twoDice && <DiceView spin={spinB} face={dice.faceB} roll={dice.b} rolling={dice.rolling} size={diePx} label="Second dice" />}
      </div>
    </div>
  );
}

/**
 * A Pachisi board on its own (home page demo, tutorials, Settings); `children` are
 * drawn on top in board units 0-19. `style`: a design to show (default: the one in use).
 */
export function PachisiBoardPreview({ children, className, style }: { children?: React.ReactNode; className?: string; style?: PachisiStyle }) {
  const uid = "pp" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const [inUse, th] = usePachisiStyle();
  // Kept the same between renders, so the board itself (memo) isn't drawn again for every move of the demo.
  const look = useMemo(() => pachisiLook(style ?? inUse, th), [style, inUse, th]);
  const hex = useMemo(() => (c: Color) => th.pieces[c], [th]);
  const light = useMemo(() => (c: Color) => th.light[c], [th]);
  return (
    <div className={cn("relative aspect-square w-full rounded-xl p-1.5", className)} style={look.frame}>
      <div className="relative h-full w-full">
        <svg viewBox={`0 0 ${P_SIZE} ${P_SIZE}`} className="board-layer absolute inset-0 block h-full w-full rounded-sm" aria-hidden="true">
          <PachisiSurface look={look} hex={hex} light={light} uid={uid} />
        </svg>
        {children && (
          <svg viewBox={`0 0 ${P_SIZE} ${P_SIZE}`} className="board-layer absolute inset-0 block h-full w-full" aria-hidden="true">
            {children}
          </svg>
        )}
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
  if (variant.id === "pachisi") return <LudoDemo game="pachisi" />;
  if (variant.id === "parchis") return <LudoDemo game="parchis" />;
  if (variant.id === "chaupar") return <LudoDemo game="chaupar" />;
  const board =
    variant.board === "cloth" || variant.board === "velvet" ? <ClothBoard v={variant} /> : variant.board === "plane" ? <PlaneBoard v={variant} /> : <FloorGrid v={variant} />;
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="w-full overflow-hidden rounded-xl p-1.5 shadow-[0_10px_24px_rgba(0,0,0,.4)]"
        style={{
          // Pachisi / Chaupar: the cloth lies on a dark carved table; the rest sit in a gold frame.
          background:
            variant.board === "cloth" || variant.board === "velvet"
              ? "radial-gradient(circle at 50% 45%, #5a3520, #2a160a 75%), #2a160a"
              : `linear-gradient(145deg, ${variant.tint[1]}, #8a5d14)`,
          boxShadow: variant.board === "cloth" || variant.board === "velvet" ? "inset 0 0 0 2px #c8962e, 0 10px 24px rgba(0,0,0,.4)" : undefined,
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
