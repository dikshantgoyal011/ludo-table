"use client";

import { Bot, MessageCircle } from "lucide-react";
import { useGame, useSettings } from "@/hooks/use-game";
import { COLORS, FINISH } from "@/lib/game/constants";
import type { Color } from "@/lib/game/types";
import { themeOf } from "@/lib/theme/themes";
import { cn } from "@/lib/utils";
import { Dice3D } from "./dice-3d";

/** Three bouncing dots for "typing…". */
export function TypingDots() {
  return (
    <span className="typing-dots" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

/**
 * Name tag at one corner of the board. Corners: 0 top-left, 1 top-right,
 * 2 bottom-right, 3 bottom-left. Shows the dice for whoever's turn it is.
 */
export function PlayerTag({ corner }: { corner: number }) {
  const game = useGame();
  const [settings] = useSettings();
  const th = themeOf(settings.theme);
  const c = COLORS.find((col) => game.cornerOf(col) === corner) as Color;
  const s = game.state;
  const seat = s.seats[c];
  const right = corner === 1 || corner === 2;
  const top = corner === 0 || corner === 1;
  const dieColor = game.dieColor();
  const isTurn = s.phase === "playing" && (dieColor || s.turn) === c;
  const hex = th.pieces[game.displayColor(c)];
  const you = game.isYou(c);

  const home = s.tokens[c].filter((p) => p === FINISH).length;
  const place = s.winners.indexOf(c);
  let meta = !seat
    ? s.phase === "lobby"
      ? "Waiting for a player"
      : "No player"
    : place >= 0
      ? `Finished #${place + 1}`
      : s.phase === "lobby"
        ? "Ready"
        : isTurn
          ? seat.bot
            ? seat.takeover
              ? "Bot playing…"
              : "Thinking…"
            : game.mine(s, c)
              ? s.roll
                ? "Pick a token"
                : "Your roll"
              : s.roll
                ? "Moving…"
                : "Rolling…"
          : `${home}/4 home` + (seat.bot && !seat.takeover ? " · Computer" : "");
  if (isTurn && seat && game.mode === "online" && !seat.bot) meta += ` · ${game.turnSecsLeft()}s`;
  // Offline: show how much offline time is left before the computer takes over.
  if (seat?.away && s.phase === "playing" && place < 0)
    meta = seat.bot ? "Offline" : `Offline · bot in ${Math.ceil(game.offlineLeft(seat) / 1000)}s`;

  const showChat = you && game.isNet() && game.online;
  const bubble = seat ? game.bubbles[seat.id] : undefined;
  const showBubble = !!bubble && Date.now() < bubble.until;
  const showTyping = !showBubble && !!seat && game.isTyping(seat.id);
  const takeover = !!seat?.takeover && s.phase === "playing";

  return (
    <div
      className={cn(
        "relative flex min-w-0 items-center gap-2 rounded-xl border-2 p-2 transition-colors",
        right && "flex-row-reverse text-right",
        isTurn ? "border-primary" : "border-transparent",
      )}
      style={{
        background: seat ? `color-mix(in srgb, ${hex} ${isTurn ? 34 : 18}%, transparent)` : "rgba(255,255,255,.03)",
        opacity: seat ? 1 : 0.5,
      }}
    >
      {showBubble && (
        <div
          className={cn(
            "pointer-events-none absolute z-20 max-w-[90%] rounded-xl bg-paper px-3 py-1.5 text-sm leading-snug font-semibold break-words text-[#23302c] shadow-lg",
            top ? "top-full mt-1.5" : "bottom-full mb-1.5",
            right ? "right-1" : "left-1",
          )}
        >
          {bubble!.text}
        </div>
      )}
      {showTyping && (
        <div
          className={cn(
            "pointer-events-none absolute z-20 flex items-center gap-1.5 rounded-xl bg-paper px-3 py-1.5 text-sm font-semibold text-[#23302c]/70 italic shadow-lg",
            top ? "top-full mt-1.5" : "bottom-full mb-1.5",
            right ? "right-1" : "left-1",
          )}
        >
          typing
          <TypingDots />
        </div>
      )}
      <div className={cn("flex min-w-0 flex-1 flex-col gap-0.5", right && "items-end")}>
        <div className={cn("flex max-w-full min-w-0 items-center gap-1.5 leading-tight font-bold", right && "flex-row-reverse")}>
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: seat ? hex : "rgb(var(--c-line))" }} />
          <span className="truncate text-sm sm:text-base">{seat ? seat.nick + (you ? " (you)" : "") : "Empty"}</span>
          {takeover &&
            (you ? (
              <button
                type="button"
                role="switch"
                aria-checked="true"
                aria-label="Bot is playing for you. Turn it off to play yourself."
                title="Turn the bot off and play yourself"
                onClick={game.takeBack}
                className="flex h-7 shrink-0 items-center gap-1 rounded-full bg-primary px-2 text-xs font-bold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
              >
                <Bot className="size-4" strokeWidth={2.2} />
                Bot on
                <span className="ml-0.5 flex h-4 w-7 items-center justify-end rounded-full bg-primary-foreground/30 p-0.5">
                  <span className="h-3 w-3 rounded-full bg-primary-foreground" />
                </span>
              </button>
            ) : (
              <span className="flex h-6 shrink-0 items-center gap-1 rounded-full bg-background/70 px-2 text-xs font-bold">
                <Bot className="size-3.5" strokeWidth={2.2} />
                Bot on
              </span>
            ))}
          {showChat && (
            <button
              type="button"
              aria-label="Open chat"
              onClick={() => game.openChat()}
              className="relative mx-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-background/70 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
            >
              <MessageCircle className="size-4" strokeWidth={2.2} />
              {game.unread > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] rounded-full bg-[#e5484d] px-1 text-center text-[11px] leading-[18px] font-bold text-white">
                  {game.unread > 9 ? "9+" : game.unread}
                </span>
              )}
            </button>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground tabular-nums">{meta}</div>
      </div>
      {/* Fixed-size slot so the layout doesn't jump when the dice moves */}
      <div className="flex h-12 w-12 shrink-0 items-center justify-center min-[400px]:h-14 min-[400px]:w-14 sm:h-16 sm:w-16">
        {dieColor === c && <Dice3D />}
      </div>
    </div>
  );
}
