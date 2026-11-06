"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BoardPreview, TokenArt, useBoardStyle } from "@/components/game/ludo-board";
import { CowrieView, Shell } from "@/components/game/cowries";
import { DiceView, newSpin, type DiceRoll } from "@/components/game/dice-3d";
import { PachisiPawn } from "@/components/game/pachisi-board";
import { PachisiBoardPreview } from "@/components/menu/game-preview";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { COLORS, DICE_ROLL_MS } from "@/lib/game/constants";
import { rulesFor } from "@/lib/game/rules";
import { P_LAP_FROM, P_LAP_TO, ROUTE } from "@/lib/game/pachisi/board";
import { SALIDA, squareOf as xSquareOf } from "@/lib/game/parchis/board";
import { variantById } from "@/lib/game/variants";
import { ParchisBoardPreview, ParchisToken } from "@/components/game/parchis-board";
import type { Color, GameId } from "@/lib/game/types";
import { uiStore, useUi } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

// How to play: a few short lessons for each game, each a little scene that plays
// on the real board in a loop (a roll, a highlighted token, its move), with a caption.

type Tokens = Partial<Record<Color, number[]>>;
type Action =
  | { roll: number; by: Color }
  | { move: [Color, number, number] }
  | { cut: [Color, number] }
  | { wait: number };
interface Lesson {
  title: string;
  text: string;
  tokens: Tokens;
  steps: Action[];
  /** Lesson about the throw itself: show the cowrie values table. */
  shells?: boolean;
}

/** Pachisi: the position colour `c` has on the square where colour `of` stands at position p. */
const sameSquare = (c: Color, of: Color, p: number) => {
  const [r, cc] = ROUTE[of][p];
  return ROUTE[c].findIndex(([a, b], i) => i >= P_LAP_FROM && i <= P_LAP_TO && a === r && b === cc);
};
/** Parchís: the position colour `c` has on the square where colour `of` stands at position p. */
const sameSquareX = (c: Color, of: Color, p: number) => ((xSquareOf(of, p) as number) - SALIDA[c] + 68) % 68;

const LESSONS: Record<GameId, Lesson[]> = {
  ludo: [
    {
      title: "Roll a 6 to come out",
      text: "Your tokens wait in your corner. A 6 brings one out onto your start square, and you roll again.",
      tokens: { red: [-1, -1, -1, -1] },
      steps: [{ wait: 600 }, { roll: 6, by: "red" }, { move: ["red", 0, 0] }, { wait: 1400 }],
    },
    {
      title: "Move by what you roll",
      text: "Roll the dice and move one token that many squares, round the board clockwise.",
      tokens: { red: [4, -1, -1, -1] },
      steps: [{ wait: 600 }, { roll: 4, by: "red" }, { move: ["red", 0, 8] }, { wait: 1400 }],
    },
    {
      title: "Land on a rival to cut it",
      text: "Land exactly on someone else's token and it goes back to their corner. A cut gives you another roll.",
      tokens: { red: [15, -1, -1, -1], green: [5, -1, -1, -1] },
      steps: [{ wait: 600 }, { roll: 3, by: "red" }, { move: ["red", 0, 18] }, { cut: ["green", 0] }, { wait: 1400 }],
    },
    {
      title: "Stars are safe",
      text: "Nobody can be cut on a star or a start square. Two colors can share it.",
      tokens: { red: [5, -1, -1, -1], green: [47, -1, -1, -1] },
      steps: [{ wait: 600 }, { roll: 3, by: "red" }, { move: ["red", 0, 8] }, { wait: 1800 }],
    },
    {
      title: "Up your color to the middle",
      text: "After one lap, go up your own colored lane. Reaching the middle needs the exact number.",
      tokens: { red: [47, 56, 56, -1] },
      steps: [{ wait: 600 }, { roll: 6, by: "red" }, { move: ["red", 0, 53] }, { roll: 3, by: "red" }, { move: ["red", 0, 56] }, { wait: 1400 }],
    },
    {
      title: "Roll again, and win",
      text: "A 6, a cut, or a token reaching home: roll again. Bring all four tokens home first to win.",
      tokens: { red: [50, 56, 56, 56] },
      steps: [{ wait: 600 }, { roll: 6, by: "red" }, { move: ["red", 0, 56] }, { wait: 1800 }],
    },
  ],
  pachisi: [
    {
      title: "Throw the cowrie shells",
      text: "Six shells instead of a dice. Count the ones landing mouth-up: 2 to 6 moves that many. One up moves 10, none up moves 25!",
      tokens: { red: [-1, -1, -1, -1] },
      steps: [{ wait: 500 }, { roll: 3, by: "red" }, { wait: 900 }, { roll: 10, by: "red" }, { wait: 900 }, { roll: 25, by: "red" }, { wait: 1200 }],
      shells: true,
    },
    {
      title: "Coming out of the center",
      text: "All your pieces start in the center, the Charkoni. Your first piece can come out with any throw; after that, it takes a grace: 6, 10 or 25. Count the first square of your arm as 1. A grace also gives you another throw.",
      tokens: { red: [-1, -1, -1, -1] },
      steps: [{ wait: 600 }, { roll: 10, by: "red" }, { move: ["red", 0, 9] }, { wait: 1400 }],
    },
    {
      title: "Down your arm, then round the cross",
      text: "Go down the middle of your own arm, then counter-clockwise round the outside of the cross. A 25 carries you a long way!",
      tokens: { red: [2, -1, -1, -1] },
      steps: [{ wait: 600 }, { roll: 25, by: "red" }, { move: ["red", 0, 27] }, { wait: 1400 }],
    },
    {
      title: "Land on the other side to send it back",
      text: "Land exactly on the other side's pieces and they all go back to the center: they need a grace to come out again. You throw again.",
      tokens: { red: [14, -1, -1, -1], green: [sameSquare("green", "red", 18), -1, -1, -1] },
      steps: [{ wait: 600 }, { roll: 4, by: "red" }, { move: ["red", 0, 18] }, { cut: ["green", 0] }, { wait: 1400 }],
    },
    {
      title: "Castles are safe",
      text: "Squares marked ✕ are castles. Nobody can be sent back from one, and you can't land on a castle where the other side is sitting.",
      tokens: { red: [9, -1, -1, -1] },
      steps: [{ wait: 600 }, { roll: 2, by: "red" }, { move: ["red", 0, 11] }, { wait: 1800 }],
    },
    {
      title: "Play with a partner",
      text: "Traditionally you play in pairs: partners sit opposite (Red with Yellow, Green with Blue), never cut each other, and a side wins when all eight of its pieces are home. With two players, each plays both colors of a side. You can also play everyone for themselves.",
      tokens: { red: [14, -1, -1, -1], yellow: [sameSquare("yellow", "red", 18), -1, -1, -1] },
      steps: [{ wait: 600 }, { roll: 4, by: "red" }, { move: ["red", 0, 18] }, { wait: 1800 }],
    },
    {
      title: "It's your choice",
      text: "You don't have to move: tap Skip to let a throw go, say to stay safe on a castle. At the end of its round a piece can head home or go round again, to help a partner who's behind.",
      tokens: { red: [70, -1, -1, -1] },
      steps: [{ wait: 600 }, { roll: 10, by: "red" }, { move: ["red", 0, 80] }, { wait: 1800 }],
    },
    {
      title: "Back up your arm to the center",
      text: "Come back up the middle of your arm, the piece lying on its side. You need the exact number to reach the center (one mouth-up is always 10, never 1). First home wins: all four pieces, or with partners all eight of your side's.",
      tokens: { red: [72, 83, 83, -1] },
      steps: [{ wait: 600 }, { roll: 6, by: "red" }, { move: ["red", 0, 78] }, { roll: 5, by: "red" }, { move: ["red", 0, 83] }, { wait: 1400 }],
    },
  ],
  parchis: [
    {
      title: "A 5 brings a piece out",
      text: "Your four pieces start in your house. A 5 brings one out onto your salida, the colored square by your house. If you roll a 5 and can bring one out, you must.",
      tokens: { red: [-1, -1, -1, -1] },
      steps: [{ wait: 600 }, { roll: 5, by: "red" }, { move: ["red", 0, 0] }, { wait: 1400 }],
    },
    {
      title: "Round the 68 squares",
      text: "Roll the dice and move one piece that many squares, counter-clockwise round the board. Moving is compulsory: if a piece can move, one must.",
      tokens: { red: [3, -1, -1, -1] },
      steps: [{ wait: 600 }, { roll: 4, by: "red" }, { move: ["red", 0, 7] }, { wait: 1400 }],
    },
    {
      title: "Capture, and count 20",
      text: "Land on a rival standing alone on an ordinary square and it goes back to its house. Then count 20: move any one of your pieces 20 squares.",
      tokens: { red: [10, -1, -1, -1], yellow: [sameSquareX("yellow", "red", 13), -1, -1, -1] },
      steps: [{ wait: 600 }, { roll: 3, by: "red" }, { move: ["red", 0, 13] }, { cut: ["yellow", 0] }, { wait: 500 }, { move: ["red", 0, 33] }, { wait: 1400 }],
    },
    {
      title: "Grey squares are safe",
      text: "On a seguro (grey, with a ring) and on the salidas nobody is captured: two colors can share the square. Two pieces at most fit on any square.",
      tokens: { red: [5, -1, -1, -1], yellow: [sameSquareX("yellow", "red", 7), -1, -1, -1] },
      steps: [{ wait: 600 }, { roll: 2, by: "red" }, { move: ["red", 0, 7] }, { wait: 1800 }],
    },
    {
      title: "Two of a color make a barrier",
      text: "Two of your pieces on one square make a barrier: no piece can pass it or land on it, not even yours. Roll a 6 while you have a barrier and you must open it.",
      tokens: { red: [15, 18, -1, -1], yellow: [sameSquareX("yellow", "red", 14), -1, -1, -1] },
      steps: [{ wait: 600 }, { roll: 3, by: "red" }, { move: ["red", 0, 18] }, { wait: 1800 }],
    },
    {
      title: "A 6 rolls again",
      text: "A 6 gives you another roll, and once none of your pieces is left in the house it counts as 7. But a third 6 in a row sends the piece you moved with the last 6 home.",
      tokens: { red: [10, 20, 30, 40] },
      steps: [{ wait: 600 }, { roll: 6, by: "red" }, { move: ["red", 0, 17] }, { wait: 1400 }],
    },
    {
      title: "Up your pasillo to the meta",
      text: "After the round, go up your own colored pasillo to your meta in the middle, by the exact count. Each piece that reaches it lets you count 10 with another. First to bring all four in wins.",
      tokens: { red: [67, 30, -1, -1] },
      steps: [{ wait: 600 }, { roll: 4, by: "red" }, { move: ["red", 0, 71] }, { wait: 500 }, { move: ["red", 1, 40] }, { wait: 1400 }],
    },
  ],
};

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Plays one lesson's scene on the board, over and over. */
function Scene({ game, lesson }: { game: GameId; lesson: Lesson }) {
  const pachisi = game === "pachisi";
  const parchis = game === "parchis";
  const [style, th] = useBoardStyle();
  const [pos, setPos] = useState<Tokens>(lesson.tokens);
  const [walking, setWalking] = useState("");
  const [pulse, setPulse] = useState("");
  const [roll, setRoll] = useState<{ v: number; by: Color; r: DiceRoll | null; rolling: boolean }>({ v: 3, by: "red", r: null, rolling: false });
  const spin = useRef(newSpin()).current;

  useEffect(() => {
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) => new Promise<void>((res) => timers.push(setTimeout(res, ms)));
    const cur: Tokens = JSON.parse(JSON.stringify(lesson.tokens));
    setPos(JSON.parse(JSON.stringify(cur)));
    if (reducedMotion()) return;
    let id = 0;
    (async () => {
      while (alive) {
        Object.assign(cur, JSON.parse(JSON.stringify(lesson.tokens)));
        setPos(JSON.parse(JSON.stringify(cur)));
        for (const a of lesson.steps) {
          if (!alive) return;
          if ("wait" in a) await wait(a.wait);
          else if ("roll" in a) {
            id++;
            setRoll({ v: a.roll, by: a.by, r: { id, value: a.roll, at: Date.now() }, rolling: true });
            await wait(DICE_ROLL_MS + 100);
            setRoll((r) => ({ ...r, rolling: false }));
            await wait(450);
          } else if ("move" in a) {
            const [c, i, to] = a.move;
            const from = cur[c]![i];
            // The token you'd tap ripples first, like in the game.
            setPulse(c + i);
            await wait(900);
            setPulse("");
            // Out of the centre onto the first square: one glide. Further out, it walks from there.
            if (from === -1 && to === 0) {
              cur[c]![i] = to;
              setPos(JSON.parse(JSON.stringify(cur)));
              await wait(500);
            } else {
              setWalking(c + i);
              for (let p = from + 1; p <= to && alive; p++) {
                cur[c]![i] = p;
                setPos(JSON.parse(JSON.stringify(cur)));
                await wait(pachisi && to - from > 12 ? 95 : 170);
              }
              setWalking("");
            }
          } else if ("cut" in a) {
            const [c, i] = a.cut;
            await wait(150);
            cur[c]![i] = -1;
            setPos(JSON.parse(JSON.stringify(cur)));
            await wait(700);
          }
        }
        await wait(500);
      }
    })();
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, [lesson, pachisi]);

  // Tokens sharing a square sit side by side, as on the real board.
  const groups: Record<string, { c: Color; i: number; x: number; y: number; lying?: boolean }[]> = {};
  for (const c of COLORS)
    (pos[c] || []).forEach((p, i) => {
      const b = rulesFor(game).point(c, i, p);
      (groups[b.key] ||= []).push({ c, i, x: b.x, y: b.y, lying: b.lying });
    });
  const pieces: { key: string; c: Color; x: number; y: number; s: number; home: boolean; lying?: boolean }[] = [];
  Object.values(groups).forEach((list) =>
    list.forEach((t, k) => {
      const n = list.length;
      const ang = (k / n) * Math.PI * 2 - Math.PI / 4;
      pieces.push({ key: t.c + t.i, c: t.c, lying: t.lying, x: t.x + (n > 1 ? Math.cos(ang) * 0.2 : 0), y: t.y + (n > 1 ? Math.sin(ang) * 0.2 : 0), s: n > 2 ? 0.62 : n > 1 ? 0.75 : 1, home: pos[t.c]![t.i] === -1 });
    }),
  );
  pieces.sort((a, b) => (a.key < b.key ? -1 : 1));
  const layer = pieces.map((t) => (
    <g key={t.key} className={cn("token", walking === t.key && "stepping", t.home && "returning")} style={{ transform: `translate(${t.x}px,${t.y}px) scale(${t.s})` }}>
      {pulse === t.key &&
        ["", " late"].map((k) => (
          <g key={k} className={"token-ripple" + k}>
            <circle r={0.42} fill="none" stroke="rgba(255,255,255,.8)" strokeWidth={0.15} />
            <circle r={0.42} fill="none" stroke="#24170f" strokeWidth={0.09} />
          </g>
        ))}
      {pachisi ? <PachisiPawn fill={th.pieces[t.c]} lying={t.lying} /> : parchis ? <ParchisToken fill={th.pieces[t.c]} /> : <TokenArt style={style} fill={th.pieces[t.c]} />}
    </g>
  ));

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="w-full max-w-[300px]">
        {pachisi ? (
          <PachisiBoardPreview>{layer}</PachisiBoardPreview>
        ) : parchis ? (
          <ParchisBoardPreview>{layer}</ParchisBoardPreview>
        ) : (
          <BoardPreview style={style} th={th} className="rounded-xl p-1.5">
            {layer}
          </BoardPreview>
        )}
      </div>
      <div className="flex min-h-12 items-center gap-3 text-sm font-bold">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full ring-2 ring-white/30" style={{ background: th.pieces[roll.by] }} />
          {roll.r ? (roll.rolling ? (pachisi ? "Throwing…" : "Rolling…") : pachisi ? `Threw ${roll.v}` : `Rolled ${roll.v}`) : "Your turn"}
        </span>
        {pachisi ? (
          <CowrieView value={roll.v} roll={roll.r} rolling={roll.rolling} shell={28} label="Cowrie shells" />
        ) : (
          <DiceView spin={spin} face={roll.v} roll={roll.r} rolling={roll.rolling} size={40} label="Dice" />
        )}
      </div>
    </div>
  );
}

/** The cowrie values, as a small table: how many mouth-up, and the move. */
function ShellTable() {
  const rows: [number, number][] = [
    [0, 25],
    [1, 10],
    [2, 2],
    [3, 3],
    [4, 4],
    [5, 5],
    [6, 6],
  ];
  return (
    <div className="grid w-full grid-cols-7 gap-1 rounded-xl bg-background/60 p-2 text-center">
      {rows.map(([up, v]) => (
        <div key={up} className={cn("flex flex-col items-center gap-0.5 rounded-lg py-1", (v === 6 || v === 10 || v === 25) && "bg-primary/20 ring-1 ring-primary/50")}>
          <span className="text-[10px] font-semibold text-muted-foreground">{up} up</span>
          <Shell up={up > 0} className="h-5 w-4" />
          <span className="text-sm font-extrabold tabular-nums">{v}</span>
        </div>
      ))}
    </div>
  );
}

/** How to play, for the game in uiStore.tutorial. */
export function TutorialDialog() {
  const { tutorial } = useUi();
  const [step, setStep] = useState(0);
  useEffect(() => setStep(0), [tutorial]);
  if (!tutorial) return null;
  const lessons = LESSONS[tutorial];
  const lesson = lessons[step];
  const last = step === lessons.length - 1;
  const close = () => uiStore.set({ tutorial: null });
  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent variant="center" className="max-h-[92dvh] items-center gap-3 overflow-y-auto p-4 text-center sm:p-6">
        <span className="text-xs font-bold tracking-[0.2em] text-primary uppercase">
          How to play {variantById(tutorial).name} · {step + 1} of {lessons.length}
        </span>
        <DialogTitle className="text-2xl leading-tight font-extrabold">{lesson.title}</DialogTitle>
        <DialogDescription className="min-h-[3.75rem] text-sm leading-snug text-muted-foreground">{lesson.text}</DialogDescription>
        {lesson.shells && <ShellTable />}
        <Scene key={`${tutorial}${step}`} game={tutorial} lesson={lesson} />
        <div className="flex gap-1.5" aria-hidden="true">
          {lessons.map((_, k) => (
            <span key={k} className={cn("h-1.5 rounded-full transition-all", k === step ? "w-5 bg-primary" : "w-1.5 bg-foreground/25")} />
          ))}
        </div>
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="outline" size="lg" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            <ChevronLeft className="size-4" /> Back
          </Button>
          {last ? (
            <Button size="lg" onClick={close}>
              Got it!
            </Button>
          ) : (
            <Button size="lg" onClick={() => setStep((s) => s + 1)}>
              Next <ChevronRight className="size-4" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Open How to play for a game. */
