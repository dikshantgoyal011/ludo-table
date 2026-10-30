"use client";

import { useState } from "react";
import { Bot, MessageCircle, Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { useGame, useSettings } from "@/hooks/use-game";
import { COLORS, FINISH, MAX_MISSES } from "@/lib/game/constants";
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
 * Turn timer drawn around the name tag's edge, draining as time runs out
 * (green, then yellow, then red). Restarted for each turn via `key`.
 */
function TurnRing({ limit, startedAt }: { limit: number; startedAt: number }) {
  // Measured once, so re-renders don't shift the animation.
  const [elapsed] = useState(() => Math.max(0, Date.now() - startedAt));
  return (
    <svg className="pointer-events-none absolute -inset-0.5 z-10 h-[calc(100%+4px)] w-[calc(100%+4px)] overflow-visible" aria-hidden="true">
      <rect className="turn-ring-track" x="1.5" y="1.5" rx="13" />
      <rect
        className="turn-ring"
        x="1.5"
        y="1.5"
        rx="13"
        pathLength={100}
        style={{ animationDuration: `${limit}ms`, animationDelay: `-${Math.min(elapsed, limit)}ms` }}
      />
    </svg>
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
  const timer = game.turnTimerOn(c);
  if (timer) meta += ` · ${game.turnSecsLeft(c)}s`;
  // Offline: show how long until the computer takes over.
  const away = seat && s.phase === "playing" && place < 0 ? game.awayInfo(seat).away : false;
  if (away && seat) meta = seat.bot ? "Offline" : `Offline · bot in ${Math.ceil(game.offlineLeft(seat) / 1000)}s`;
  if (seat?.out) meta = seat.left ? "Left the game" : "Out · missed 5 turns";

  const showChat = you && game.isNet() && game.online;
  const bubble = seat ? game.bubbles[seat.id] : undefined;
  const showBubble = !!bubble && Date.now() < bubble.until;
  const showTyping = !showBubble && !!seat && game.isTyping(seat.id);
  const takeover = !!seat?.takeover && s.phase === "playing";
  // Online: 5 dots, one turns red for every missed turn.
  const showMisses = game.mode === "online" && s.phase !== "lobby" && !!seat;
  const misses = seat?.misses || 0;

  return (
    <div
      className={cn(
        "relative flex min-w-0 items-center gap-2 rounded-xl border-2 p-2 transition-colors",
        right && "flex-row-reverse text-right",
        isTurn && !timer ? "border-primary" : "border-transparent",
      )}
      style={{
        background: seat ? `color-mix(in srgb, ${hex} ${isTurn ? 34 : 18}%, transparent)` : "rgba(255,255,255,.03)",
        opacity: !seat || seat.out ? 0.5 : away ? 0.7 : 1,
      }}
    >
      {timer && <TurnRing key={game.turnId()} limit={game.turnLimit(c)} startedAt={game.turnSeenAt} />}
      {/* Finished: a medal with the place, while the others play on. */}
      {place >= 0 && (
        <span
          className={cn(
            "medal-pop pointer-events-none absolute z-20 flex h-8 min-w-8 items-center justify-center rounded-full px-1.5 text-xs font-extrabold shadow-[0_3px_8px_rgba(0,0,0,.45)] ring-2 ring-white/70",
            top ? "-bottom-2.5" : "-top-2.5",
            right ? "left-2" : "right-2",
            place === 0
              ? "bg-[linear-gradient(145deg,#fff1b8,#e2b048_55%,#a8741c)] text-[#3a2606]"
              : place === 1
                ? "bg-[linear-gradient(145deg,#f4f6f8,#a9b2bd)] text-[#2b3138]"
                : place === 2
                  ? "bg-[linear-gradient(145deg,#f0c39a,#b06c35)] text-[#3a1d08]"
                  : "bg-secondary text-foreground",
          )}
          aria-label={`Finished ${["1st", "2nd", "3rd", "4th"][place]}`}
        >
          {["1st", "2nd", "3rd", "4th"][place]}
        </span>
      )}
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
          {/* Voice chat: my mic, or a speaker to mute this player for me */}
          {seat && showChat && (
            <button
              type="button"
              onClick={() => void game.toggleMic()}
              aria-label={!game.voice.on ? "Join voice chat" : game.voice.micMuted ? "Unmute my microphone" : "Mute my microphone"}
              aria-pressed={game.voice.on && !game.voice.micMuted}
              title={!game.voice.on ? "Join voice chat" : game.voice.micMuted ? "Unmute my mic" : "Mute my mic"}
              className={cn(
                "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
                !game.voice.on
                  ? "bg-background/70 text-muted-foreground"
                  : game.voice.micMuted
                    ? "bg-[#ef4444] text-white"
                    : "bg-[#16a34a] text-white",
                game.voice.on && !game.voice.micMuted && game.isSpeaking(seat.id) && "ring-2 ring-[#4ade80] ring-offset-1 ring-offset-transparent",
              )}
            >
              {game.voice.on && !game.voice.micMuted ? <Mic className="size-4" strokeWidth={2.2} /> : <MicOff className="size-4" strokeWidth={2.2} />}
            </button>
          )}
          {seat && !you && game.inVoice(seat.id) &&
            (game.voice.on ? (
              <button
                type="button"
                onClick={() => game.mutePeer(seat.id, !game.voice.isPeerMuted(seat.id))}
                aria-label={game.voice.isPeerMuted(seat.id) ? `Unmute ${seat.nick}` : `Mute ${seat.nick} for me`}
                aria-pressed={game.voice.isPeerMuted(seat.id)}
                title={game.voice.isPeerMuted(seat.id) ? `Unmute ${seat.nick}` : `Mute ${seat.nick} (only for you)`}
                className={cn(
                  "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
                  game.voice.isPeerMuted(seat.id) ? "bg-[#ef4444] text-white" : "bg-background/70 text-foreground",
                  game.isSpeaking(seat.id) && "ring-2 ring-[#4ade80]",
                )}
              >
                {game.voice.isPeerMuted(seat.id) ? <VolumeX className="size-4" strokeWidth={2.2} /> : <Volume2 className="size-4" strokeWidth={2.2} />}
                {game.micMutedBy(seat.id) && (
                  <MicOff className="absolute -right-1 -bottom-1 size-3.5 rounded-full bg-background p-0.5 text-[#f87171]" strokeWidth={2.6} />
                )}
              </button>
            ) : (
              <span title={`${seat.nick} is in voice chat`} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-background/50 text-muted-foreground">
                <Mic className="size-3.5" strokeWidth={2.2} />
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
        <div className={cn("flex max-w-full min-w-0 items-center gap-1.5", right && "flex-row-reverse")}>
          {showMisses && (
            <span className="flex shrink-0 gap-[3px]" role="img" aria-label={`${misses} of ${MAX_MISSES} turns missed`}>
              {Array.from({ length: MAX_MISSES }, (_, k) => (
                <span
                  key={k}
                  className={cn("h-[7px] w-[7px] rounded-full", k < misses ? "bg-[#ef4444]" : "bg-foreground/25")}
                  style={k < misses ? { boxShadow: "0 0 4px rgba(239,68,68,.8)" } : undefined}
                />
              ))}
            </span>
          )}
          <span className={cn("truncate text-xs tabular-nums", away || seat?.out ? "font-semibold text-[#f87171]" : "text-muted-foreground")}>{meta}</span>
        </div>
      </div>
      {/* Fixed-size slot so the layout doesn't jump when the dice moves */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center min-[400px]:h-11 min-[400px]:w-11 sm:h-[52px] sm:w-[52px]">
        {dieColor === c && <Dice3D />}
      </div>
    </div>
  );
}
