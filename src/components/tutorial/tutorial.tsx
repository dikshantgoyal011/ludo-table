"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BoardPreview, TokenArt, useBoardStyle } from "@/components/game/ludo-board";
import { CowrieView, Shell } from "@/components/game/cowries";
import { DiceView, newSpin, type DiceRoll } from "@/components/game/dice-3d";
import { ChauparBoardPreview, ChauparPawn } from "@/components/game/chaupar-board";
import { PachisiPawn } from "@/components/game/pachisi-board";
import { newPasaSpin, PasaView, RESTING } from "@/components/game/pasa";
import { PachisiBoardPreview } from "@/components/menu/game-preview";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { stackSquare } from "@/lib/game/chaupar/board";
import { sayThrow, throwOf, validThrow } from "@/lib/game/chaupar/dice";
import { COLORS, DICE_ROLL_MS } from "@/lib/game/constants";
import { rulesFor } from "@/lib/game/rules";
import { P_LAP_FROM, P_LAP_TO, ROUTE } from "@/lib/game/pachisi/board";
import { SEVEN_SHELLS, SIX_SHELLS } from "@/lib/game/pachisi/throws";
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
  // roll2: the second dice (Parchís with two dice). Chaupar: roll is both long dice as one number (3 and 6: 36).
  | { roll: number; roll2?: number; by: Color }
  // (Chaupar: a pair moving together.)
  | { move: [Color, number | number[], number] }
  | { cut: [Color, number] }
  | { wait: number };
interface Lesson {
  /** For opening How to play right at this lesson (a variation's "See how it plays"). */
  id?: string;
  title: string;
  text: string;
  tokens: Tokens;
  steps: Action[];
  /** Lesson about the throw itself: show the cowrie values table. */
  shells?: boolean;
  /** Pachisi with seven cowries (a variation). */
  seven?: boolean;
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
      title: "Solo or 2 vs 2",
      text: "You play solo unless you pick 2 vs 2. Then partners sit opposite (Red with Yellow, Green with Blue), never cut each other, and a team wins when all eight of its pieces are home. With two players, you can each play two colors.",
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
    // The variations (off unless the table turns them on).
    {
      id: "p-throw-first",
      title: "Variation: throw first, then move",
      text: "Keep throwing while you get 6, 10 or 25. When you stop, use each throw to move: here 10, then 6, then 3.",
      tokens: { red: [5, -1, -1, -1] },
      steps: [{ wait: 500 }, { roll: 10, by: "red" }, { roll: 6, by: "red" }, { roll: 3, by: "red" }, { move: ["red", 0, 15] }, { move: ["red", 0, 21] }, { move: ["red", 0, 24] }, { wait: 1400 }],
    },
    {
      id: "p-grace-apart",
      title: "Variation: bonus step",
      text: "A 6, 10 or 25 moves a piece that's already out. Then you get a bonus step: move a piece 1 square, or bring a new piece out, like here.",
      tokens: { red: [5, -1, -1, -1] },
      steps: [{ wait: 600 }, { roll: 10, by: "red" }, { move: ["red", 0, 15] }, { wait: 400 }, { move: ["red", 1, 0] }, { wait: 1400 }],
    },
    {
      id: "p-two-graces",
      title: "Variation: 6 is a normal throw",
      text: "A 6 just moves 6 squares. Only 10 and 25 bring a piece out and give you another throw.",
      tokens: { red: [4, -1, -1, -1] },
      steps: [{ wait: 600 }, { roll: 6, by: "red" }, { move: ["red", 0, 10] }, { wait: 1600 }],
    },
    {
      id: "p-seven",
      title: "Variation: seven shells",
      text: "Throw seven cowries instead of six. The table shows what each throw is worth. 10, 25 and 35 bring a piece out; 7 and 14 also give another throw.",
      tokens: { red: [-1, -1, -1, -1] },
      steps: [{ wait: 500 }, { roll: 7, by: "red" }, { wait: 700 }, { roll: 35, by: "red" }, { wait: 700 }, { roll: 14, by: "red" }, { wait: 1200 }],
      shells: true,
      seven: true,
    },
    {
      id: "p-grace-home",
      title: "Variation: finish with a big throw",
      text: "Only a 6, 10 or 25 takes a piece into the center (with seven shells: 7, 10, 14, 25 or 35), and it doesn't need the exact number. This one is 7 away: a 10 takes it home.",
      tokens: { red: [76, 83, 83, -1] },
      steps: [{ wait: 600 }, { roll: 10, by: "red" }, { move: ["red", 0, 83] }, { wait: 1600 }],
    },
    {
      id: "p-blockades",
      title: "Variation: pairs block the way",
      text: "Two of your pieces on one square make a block: the other side can't pass it. Green has to stop right behind.",
      tokens: { red: [14, 14, -1, -1], green: [sameSquare("green", "red", 11), -1, -1, -1] },
      steps: [{ wait: 600 }, { roll: 2, by: "green" }, { move: ["green", 0, sameSquare("green", "red", 13)] }, { wait: 1800 }],
    },
    {
      id: "p-three-graces",
      title: "Variation: no three in a row",
      text: "Throw 6, 10 or 25 three times in a row and the third one doesn't count. You also miss your next turn.",
      tokens: { red: [20, -1, -1, -1] },
      steps: [{ wait: 600 }, { roll: 25, by: "red" }, { move: ["red", 0, 45] }, { roll: 10, by: "red" }, { move: ["red", 0, 55] }, { roll: 6, by: "red" }, { wait: 1800 }],
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
      text: "A 6 gives you another roll, and once none of your pieces is left in the house it counts as 7. But a third 6 in a row sends the last piece you moved home.",
      tokens: { red: [10, 20, 30, 40] },
      steps: [{ wait: 600 }, { roll: 6, by: "red" }, { move: ["red", 0, 17] }, { wait: 1400 }],
    },
    {
      title: "Up your pasillo to the meta",
      text: "After the round, go up your own colored pasillo to your meta in the middle, by the exact count. Each piece that reaches it lets you count 10 with another. First to bring all four in wins.",
      tokens: { red: [67, 30, -1, -1] },
      steps: [{ wait: 600 }, { roll: 4, by: "red" }, { move: ["red", 0, 71] }, { wait: 500 }, { move: ["red", 1, 40] }, { wait: 1400 }],
    },
    // The variations (off unless the table turns them on).
    {
      id: "x-two-dice",
      title: "Variation: two dice",
      text: "Roll two dice and use each one: one piece with each, or one piece with both. A 5 on a dice, or two dice adding up to 5 (like 2 and 3), brings a piece out.",
      tokens: { red: [-1, 10, -1, -1] },
      steps: [{ wait: 600 }, { roll: 2, roll2: 3, by: "red" }, { move: ["red", 0, 0] }, { wait: 700 }, { roll: 4, roll2: 2, by: "red" }, { move: ["red", 1, 14] }, { move: ["red", 0, 2] }, { wait: 1400 }],
    },
    {
      title: "Variation: doubles roll again",
      text: "Doubles give you another roll. If you have a barrier, doubles must open it. With two dice, a 6 is just a 6.",
      tokens: { red: [12, 12, 30, -1] },
      steps: [{ wait: 600 }, { roll: 3, roll2: 3, by: "red" }, { move: ["red", 0, 15] }, { move: ["red", 2, 33] }, { wait: 1600 }],
    },
    {
      id: "x-start-out",
      title: "Variation: a piece out from the start",
      text: "Everyone begins with one piece already out on their salida, so the game gets going from the first roll.",
      tokens: { red: [0, -1, -1, -1], yellow: [0, -1, -1, -1] },
      steps: [{ wait: 600 }, { roll: 4, by: "red" }, { move: ["red", 0, 4] }, { wait: 1400 }],
    },
    {
      id: "x-mixed",
      title: "Variation: mixed barriers",
      text: "Two pieces of any colors on a safe square make a barrier. Nobody can pass until one of them moves on.",
      tokens: { red: [7, -1, -1, -1], yellow: [sameSquareX("yellow", "red", 7), -1, -1, -1], green: [sameSquareX("green", "red", 4), -1, -1, -1] },
      steps: [{ wait: 600 }, { roll: 2, by: "green" }, { move: ["green", 0, sameSquareX("green", "red", 6)] }, { wait: 1800 }],
    },
    {
      id: "x-pairs",
      title: "Variation: play in pairs",
      text: "With four players, you team up with the player opposite: Red with Yellow, Green with Blue. When one of you brings all four pieces in, you both win.",
      tokens: { red: [67, 71, 71, 71], yellow: [sameSquareX("yellow", "red", 20), -1, -1, -1] },
      steps: [{ wait: 600 }, { roll: 4, by: "red" }, { move: ["red", 0, 71] }, { wait: 1800 }],
    },
  ],
  chaupar: [
    {
      title: "Two long dice",
      text: "Throw two long dice, each marked 1, 3, 4 and 6. Move two pawns, one by each dice, or one pawn by both added up. Here the 4 moves one pawn and the 3 another.",
      tokens: { red: [5, 6, 11, 11] },
      steps: [{ wait: 600 }, { roll: 43, by: "red" }, { move: ["red", 1, 10] }, { move: ["red", 2, 14] }, { wait: 1400 }],
    },
    {
      title: "Round the cross and home",
      text: "Your pawns start on squares 6 and 7 of your Belly, the middle of your arm, and two together (a pair) on 12. Go counter-clockwise round the cross, then back down your Belly into Home. Only your pawns enter your Belly, and they're safe there.",
      tokens: { red: [5, 6, 11, 11], green: [5, 6, 11, 11], yellow: [5, 6, 11, 11], blue: [5, 6, 11, 11] },
      steps: [{ wait: 1200 }, { roll: 46, by: "red" }, { move: ["red", 2, 21] }, { wait: 1400 }],
    },
    {
      title: "An opening 1-1 or 6-6",
      text: "If your very first throw is 1-1 or 6-6, a pawn of your pair on square 12 jumps straight to square 24.",
      tokens: { red: [5, 6, 11, 11] },
      steps: [{ wait: 600 }, { roll: 11, by: "red" }, { move: ["red", 2, 23] }, { wait: 1600 }],
    },
    {
      title: "Land on a rival to capture it",
      text: "Outside the Belly there are no safe squares: land on a rival pawn and it's captured. It comes back in at the top of its Belly, and until it does, none of its other pawns can move. A capture gives no extra throw.",
      tokens: { red: [20, 5, 6, 11], green: [sameSquare("green", "red", 27), -1, -1, -1] },
      steps: [{ wait: 600 }, { roll: 34, by: "red" }, { move: ["red", 0, 27] }, { cut: ["green", 0] }, { wait: 1400 }],
    },
    {
      title: "Kajalvun: a pair on square 34",
      text: "Square 34, counted from your arm, is marked in your color. Land a pawn on another of yours there to make a pair: that's Kajalvun. Until then, two of your pawns can't share a square. After it, a doublet gives you another throw, and pairs can be made anywhere.",
      tokens: { red: [33, 29, 83, 83] },
      steps: [{ wait: 600 }, { roll: 13, by: "red" }, { move: ["red", 1, 33] }, { wait: 1800 }],
    },
    {
      title: "Pairs move on doublets",
      text: "A pair moves together only on a doublet, by one dice: 4-4 moves it 4. Only a pair can capture a pair, and any pawn can jump over one. After Kajalvun a doublet throws again: all your throws come first, then you move.",
      tokens: { red: [33, 33, 20, 83] },
      steps: [{ wait: 600 }, { roll: 44, by: "red" }, { roll: 31, by: "red" }, { move: ["red", [0, 1], 37] }, { move: ["red", 2, 24] }, { wait: 1400 }],
    },
    {
      title: "Ool Olangvun",
      text: "The Kajalvun pair can't be split, and moves together only once. Then one of your pawns has to pass over it, and not be captured on the next player's turn: that's Ool Olangvun, and the pair is free. If the pair is captured first, you do Kajalvun again.",
      tokens: { red: [37, 37, 30, 83] },
      steps: [{ wait: 600 }, { roll: 63, by: "red" }, { move: ["red", 2, 39] }, { wait: 1800 }],
    },
    {
      title: "Every throw must be played",
      text: "You can't skip: a dice is only lost when nothing can use it. Home takes the exact count: here the 3 takes this pawn in, and the 6 is lost.",
      tokens: { red: [80, 83, 83, 83] },
      steps: [{ wait: 600 }, { roll: 63, by: "red" }, { move: ["red", 0, 83] }, { wait: 1600 }],
    },
    {
      title: "Too big for Home",
      text: "A throw too big for Home, that no other pawn can use, takes the pawn in and back out. Still inside your Belly, it tries again; past it, it goes round the cross again. This pawn needed 2 and threw 6-6: the first 6 takes it in and back out to square 4.",
      tokens: { red: [81, 83, 83, 83] },
      steps: [{ wait: 600 }, { roll: 66, by: "red" }, { move: ["red", 0, 79] }, { wait: 1600 }],
    },
    {
      title: "Solo or 2 vs 2",
      text: "You play solo unless you pick 2 vs 2. Then partners sit opposite (Red with Yellow, Green with Blue) and never capture each other. With all four of your pawns home, you miss four turns, then play your partner's. A team wins with all eight home.",
      tokens: { red: [80, 83, 83, 83], yellow: [sameSquare("yellow", "red", 30), 40, 50, 60] },
      steps: [{ wait: 600 }, { roll: 31, by: "red" }, { move: ["red", 0, 83] }, { wait: 1800 }],
    },
    {
      title: "Khado Karvo",
      text: "In 2 vs 2, with all four pawns home you can instead bring one straight back out to capture, without a throw, a pawn of the next player on its own arm's last stretch before its Belly (once they've done Ool Olangvun).",
      tokens: { red: [83, 83, 83, 83], blue: [70, 50, 40, 83] },
      steps: [{ wait: 900 }, { move: ["red", 0, sameSquare("red", "blue", 70)] }, { cut: ["blue", 0] }, { wait: 1800 }],
    },
  ],
};

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Plays one lesson's scene on the board, over and over. */
function Scene({ game, lesson }: { game: GameId; lesson: Lesson }) {
  const pachisi = game === "pachisi";
  const parchis = game === "parchis";
  const chaupar = game === "chaupar";
  const pasaSpins = useRef([newPasaSpin(), newPasaSpin()]).current;
  const [style, th] = useBoardStyle();
  const [pos, setPos] = useState<Tokens>(lesson.tokens);
  const [walking, setWalking] = useState("");
  const [pulse, setPulse] = useState("");
  const [roll, setRoll] = useState<{ v: number; v2?: number; by: Color; r: DiceRoll | null; r2?: DiceRoll | null; rolling: boolean }>({ v: 3, by: "red", r: null, rolling: false });
  const spin = useRef(newSpin()).current;
  const spin2 = useRef(newSpin()).current;
  // Parchís with two dice: the lesson shows both.
  const twoDice = lesson.steps.some((a) => "roll2" in a);

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
            const at = Date.now();
            setRoll({ v: a.roll, v2: a.roll2, by: a.by, r: { id, value: a.roll, at }, r2: a.roll2 ? { id, value: a.roll2, at } : null, rolling: true });
            await wait(DICE_ROLL_MS + 100);
            setRoll((r) => ({ ...r, rolling: false }));
            await wait(450);
          } else if ("move" in a) {
            const [c, which, to] = a.move;
            // (Chaupar: a pair's pawns move together.)
            const idx = Array.isArray(which) ? which : [which];
            const from = cur[c]![idx[0]];
            // The token you'd tap ripples first, like in the game.
            setPulse(c + idx[0]);
            await wait(900);
            setPulse("");
            // Out of the centre onto the first square: one glide. Further out, it walks from there.
            if (from === -1 && to === 0) {
              idx.forEach((i) => (cur[c]![i] = to));
              setPos(JSON.parse(JSON.stringify(cur)));
              await wait(500);
            } else {
              setWalking(idx.map((i) => c + i).join(","));
              // (Chaupar's route can carry on round the cross: its own steps.)
              const path = chaupar ? rulesFor(game).steps(from, to) : Array.from({ length: Math.max(0, to - from) }, (_, k) => from + 1 + k);
              for (const p of path) {
                if (!alive) break;
                idx.forEach((i) => (cur[c]![i] = p));
                setPos(JSON.parse(JSON.stringify(cur)));
                await wait((pachisi || chaupar) && path.length > 12 ? 95 : 170);
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
  }, [lesson, pachisi, chaupar, game]);

  // Tokens sharing a square sit side by side, as on the real board (a Chaupar pair stands as a stack).
  const groups: Record<string, { c: Color; i: number; p: number; x: number; y: number; lying?: boolean }[]> = {};
  for (const c of COLORS)
    (pos[c] || []).forEach((p, i) => {
      const b = rulesFor(game).point(c, i, p);
      (groups[b.key] ||= []).push({ c, i, p, x: b.x, y: b.y, lying: b.lying });
    });
  const pieces: { key: string; c: Color; x: number; y: number; s: number; home: boolean; lying?: boolean; lift?: number; badge?: number }[] = [];
  Object.values(groups).forEach((list) => {
    if (chaupar) {
      for (const t of stackSquare(list)) pieces.push({ key: t.c + t.i, c: t.c, lying: t.lying, x: t.x, y: t.y, s: t.scale, home: t.p === -1, lift: t.lift, badge: t.badge });
      return;
    }
    list.forEach((t, k) => {
      const n = list.length;
      const ang = (k / n) * Math.PI * 2 - Math.PI / 4;
      pieces.push({ key: t.c + t.i, c: t.c, lying: t.lying, x: t.x + (n > 1 ? Math.cos(ang) * 0.2 : 0), y: t.y + (n > 1 ? Math.sin(ang) * 0.2 : 0), s: n > 2 ? 0.62 : n > 1 ? 0.75 : 1, home: pos[t.c]![t.i] === -1 });
    });
  });
  pieces.sort((a, b) => (a.key < b.key ? -1 : 1));
  const walkers = walking ? walking.split(",") : [];
  const layer = pieces.map((t) => (
    <g key={t.key} className={cn("token", walkers.includes(t.key) && "stepping", t.home && "returning")} style={{ transform: `translate(${t.x}px,${t.y}px) scale(${t.s})` }}>
      {pulse === t.key &&
        ["", " late"].map((k) => (
          <g key={k} className={"token-ripple" + k}>
            <circle r={0.42} fill="none" stroke="rgba(255,255,255,.8)" strokeWidth={0.15} />
            <circle r={0.42} fill="none" stroke="#24170f" strokeWidth={0.09} />
          </g>
        ))}
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
  // Chaupar: the two long dice of the throw (before the first: at rest).
  const sticks = validThrow(roll.v) ? throwOf(roll.v) : RESTING;

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="w-full max-w-[300px]">
        {chaupar ? (
          <ChauparBoardPreview>{layer}</ChauparBoardPreview>
        ) : pachisi ? (
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
          {roll.r
            ? roll.rolling
              ? pachisi || chaupar
                ? "Throwing…"
                : "Rolling…"
              : chaupar
                ? `Threw ${sayThrow(sticks)}`
                : pachisi
                  ? `Threw ${roll.v}`
                  : roll.v2
                    ? `Rolled ${roll.v} and ${roll.v2}`
                    : `Rolled ${roll.v}`
            : "Your turn"}
        </span>
        {chaupar ? (
          <PasaView dice={sticks} roll={roll.r} rolling={roll.rolling} spins={pasaSpins} label="Long dice" />
        ) : pachisi ? (
          <CowrieView value={roll.v} roll={roll.r} rolling={roll.rolling} shell={lesson.seven ? 25 : 28} set={lesson.seven ? SEVEN_SHELLS : SIX_SHELLS} label="Cowrie shells" />
        ) : (
          <>
            <DiceView spin={spin} face={roll.v} roll={roll.r} rolling={roll.rolling} size={40} label="Dice" />
            {twoDice && <DiceView spin={spin2} face={roll.v2 || 3} roll={roll.r2 || null} rolling={roll.rolling} size={40} label="Second dice" />}
          </>
        )}
      </div>
    </div>
  );
}

/** The cowrie values, as a small table: how many mouth-up, and the move (the graces stand out). */
function ShellTable({ seven = false }: { seven?: boolean }) {
  const set = seven ? SEVEN_SHELLS : SIX_SHELLS;
  const rows = set.move.map((v, up) => [up, v] as [number, number]);
  const grace = (v: number) => (seven ? v === 10 || v === 25 || v === 35 : v === 6 || v === 10 || v === 25);
  return (
    <div className={cn("grid w-full gap-1 rounded-xl bg-background/60 p-2 text-center", seven ? "grid-cols-8" : "grid-cols-7")}>
      {rows.map(([up, v]) => (
        <div key={up} className={cn("flex flex-col items-center gap-0.5 rounded-lg py-1", grace(v) && "bg-primary/20 ring-1 ring-primary/50")}>
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
  const { tutorial, tutorialAt } = useUi();
  const [step, setStep] = useState(0);
  // (Opened from a variation: start at its lesson.)
  useEffect(() => setStep(tutorial && tutorialAt ? Math.max(0, LESSONS[tutorial].findIndex((l) => l.id === tutorialAt)) : 0), [tutorial, tutorialAt]);
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
        {lesson.shells && <ShellTable seven={lesson.seven} />}
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
