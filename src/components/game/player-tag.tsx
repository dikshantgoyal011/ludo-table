"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Bot, MessageCircle, Mic, MicOff, UserRound, Volume2, VolumeX } from "lucide-react";
import { useGame, useSettings } from "@/hooks/use-game";
import { defaultAvatar } from "@/lib/avatars";
import { countryName, flagUrl } from "@/lib/country";
import { COLORS, MAX_MISSES, TURN_WARN_SHARE } from "@/lib/game/constants";
import { finishOf } from "@/lib/game/rules";
import type { Color, Seat } from "@/lib/game/types";
import { themeOf } from "@/lib/theme/themes";
import { uiStore } from "@/lib/ui-store";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { CowrieRow } from "./cowries";
import { Dice3D } from "./dice-3d";
import { PasaRow } from "./pasa";

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

/** The turn ring's line (the tag's colour bar is 4px: the line sits inside it where they meet). */
const RING_W = 3;
/**
 * Turn timer: a warm ivory line round the tag as its border, on the tag's own
 * edge and corners, starting from the player's colour bar. As the time goes it
 * leaves the bar and draws away round both sides towards the far edge, so what's
 * left is always clear to see, to the last moment. In its last TURN_WARN_SHARE
 * it turns gold and pulses (and it ticks, controller). Restarted for each throw via `key`.
 */
function TurnRing({ limit, startedAt, right }: { limit: number; startedAt: number; right: boolean }) {
  // Measured once, so re-renders don't shift the animation.
  const [elapsed] = useState(() => Math.max(0, Date.now() - startedAt));
  const ref = useRef<SVGSVGElement>(null);
  // The tag's size and corner, to draw the border exactly on its edge (the tag grows, say with Pachisi's cowries).
  const [box, setBox] = useState<{ w: number; h: number; r: number } | null>(null);
  useLayoutEffect(() => {
    const tag = ref.current?.parentElement;
    if (!tag) return;
    const measure = () => setBox({ w: tag.offsetWidth, h: tag.offsetHeight, r: parseFloat(getComputedStyle(tag).borderTopLeftRadius) || 12 });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(tag);
    return () => ro.disconnect();
  }, []);
  const left = Math.min(elapsed, limit);
  const run = { animationDuration: `${limit}ms`, animationDelay: `-${left}ms` };
  const warn = { animationDelay: `${limit * (1 - TURN_WARN_SHARE) - left}ms` };
  let halves: string[] = [];
  if (box && box.w > 2 * box.r && box.h >= 2 * box.r) {
    // From the middle of the far edge, one half over the top and one under the bottom, ending in the
    // middle of the bar. (A line drains from its end: it lets go of the bar first.)
    const { w, h } = box;
    const i = RING_W / 2;
    const r = Math.max(0, box.r - i);
    const R = box.r;
    halves = [
      `M ${w - i} ${h / 2} L ${w - i} ${R} A ${r} ${r} 0 0 0 ${w - R} ${i} L ${R} ${i} A ${r} ${r} 0 0 0 ${i} ${R} L ${i} ${h / 2}`,
      `M ${w - i} ${h / 2} L ${w - i} ${h - R} A ${r} ${r} 0 0 1 ${w - R} ${h - i} L ${R} ${h - i} A ${r} ${r} 0 0 1 ${i} ${h - R} L ${i} ${h / 2}`,
    ];
  }
  return (
    <svg ref={ref} className="pointer-events-none absolute inset-0 z-10 size-full overflow-visible" aria-hidden="true">
      {box && (
        // (A right-hand tag has its bar on the right: the same drawing, mirrored.)
        <g transform={right ? `translate(${box.w} 0) scale(-1 1)` : undefined}>
          {halves.map((d) => (
            <path key={"t" + d} className="turn-ring-track" d={d} />
          ))}
          {/* A thin dark edge under the line, so it reads on any colour (a yellow tag's bright side too). */}
          {halves.map((d) => (
            <path key={"h" + d} className="turn-ring turn-ring-halo" d={d} pathLength={100} style={run} />
          ))}
          <g className="turn-ring-glow">
            {halves.map((d) => (
              <path key={d} className="turn-ring" d={d} pathLength={100} style={run} />
            ))}
          </g>
          {/* The last stretch: a lighter line over it, fading in and out (only opacity: the same in every browser). */}
          <g className="turn-ring-warn" style={warn}>
            {halves.map((d) => (
              <path key={"w" + d} className="turn-ring turn-ring-hot" d={d} pathLength={100} style={run} />
            ))}
          </g>
        </g>
      )}
    </svg>
  );
}

/** The player's country flag; a tap shows the country's name for a moment. */
function Flag({ cc, below }: { cc: string; below: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setOpen(false), 2500);
    return () => clearTimeout(t);
  }, [open]);
  const name = countryName(cc);
  return (
    <span className="relative flex shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={name}
        title={name}
        className="flex h-6 items-center rounded outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={flagUrl(cc)} alt="" width={21} height={14} className="h-3.5 w-[21px] rounded-[3px] shadow-[0_0_0_1px_rgba(0,0,0,.25),0_1px_2px_rgba(0,0,0,.3)]" />
      </button>
      {open && (
        <span
          role="status"
          className={cn(
            "badge-pop pointer-events-none absolute left-1/2 z-30 -translate-x-1/2 rounded-full bg-paper px-2.5 py-1 text-xs font-bold whitespace-nowrap text-[#23302c] shadow-lg",
            below ? "top-full mt-1" : "bottom-full mb-1",
          )}
        >
          {name}
        </span>
      )}
    </span>
  );
}

/** Out of the game, or offline (friends: with the time before the computer plays for them). Missed turns show on their own (the missed-turns badge). */
function statusNote(game: ReturnType<typeof useGame>, seat: Seat, place: number): { text: string; tone: "red" | "amber" | "grey" } | null {
  const s = game.state;
  if (seat.out) return seat.left ? { text: "Left the game", tone: "grey" } : { text: `Out · missed ${MAX_MISSES} turns`, tone: "red" };
  if (s.phase !== "playing" || place >= 0) return null;
  if (game.awayInfo(seat).away) {
    const left = Math.ceil(game.offlineLeft(seat) / 1000);
    // (At 0 the computer is about to play for them: it takes the host's next check, or the table being taken over.)
    // (Online nobody stands in: the game goes on, and their turns run out as missed turns.)
    if (game.mode === "online") return { text: "Offline", tone: "red" };
    return { text: seat.bot ? "Offline" : left > 0 ? `Offline · bot in ${left}s` : "Offline · bot taking over", tone: "red" };
  }
  return null;
}

/**
 * Name tag at one corner of the board. Corners: 0 top-left, 1 top-right,
 * 2 bottom-right, 3 bottom-left. The player's picture turns into the dice on
 * their turn, and the tag lights up in their colour from its outer edge.
 */
export function PlayerTag({ corner }: { corner: number }) {
  const game = useGame();
  // Tapping the name offers "View profile" for a few seconds.
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (!menu) return;
    const t = setTimeout(() => setMenu(false), 4000);
    return () => clearTimeout(t);
  }, [menu]);
  const th = themeOf(useSettings()[0].theme);
  const c = COLORS.find((col) => game.cornerOf(col) === corner) as Color;
  const s = game.state;
  const seat = s.seats[c];
  const right = corner === 1 || corner === 2;
  const top = corner === 0 || corner === 1;
  const dieColor = game.dieColor();
  const isTurn = s.phase === "playing" && (dieColor || s.turn) === c;
  const hex = th.pieces[game.displayColor(c)];
  const you = game.isYou(c);

  const home = s.tokens[c].filter((p) => p === finishOf(s)).length;
  const place = s.winners.indexOf(c);
  // Partners (Pachisi): a colour with all its pieces home just says so; the side wins together.
  const sides = !!s.teams;
  const timer = game.turnTimerOn(c);
  const note = seat ? statusNote(game, seat, place) : null;
  // Online: turns missed so far (each one takes 2s off their turns; 5 and they're out): the tag's four dots,
  // mine by my name. (Elsewhere the dots are tokens home; online the board shows those.)
  const missDots = game.mode === "online" && s.phase === "playing" && place < 0 && !!seat && !seat.out;
  const missed = missDots ? seat.misses || 0 : 0;
  const away = !!note && note.text.startsWith("Offline");

  const showChat = you && game.isNet() && game.online;
  const showHear = !!seat && !you && !seat.bot && game.voice.on && game.inVoice(seat.id);
  const bubble = seat ? game.bubbles[seat.id] : undefined;
  const showBubble = !!bubble && Date.now() < bubble.until;
  const showTyping = !showBubble && !!seat && game.isTyping(seat.id);
  const takeover = !!seat?.takeover && s.phase === "playing";
  const pachisi = s.game === "pachisi";
  const chaupar = s.game === "chaupar";
  // Pachisi's cowries and Chaupar's long dice get a row of their own under the name.
  const thrownRow = pachisi || chaupar;
  // Parchís: a move the dice doesn't show (a 6 counting 7, or a bonus count of 20 / 10) waits in hand.
  const pending = s.game === "parchis" && s.turn === c && !game.rolling ? game.hand().find((u) => u >= 7) : undefined;
  const count = pending && pending >= 7 ? (pending >= 10 ? `Count ${pending}` : "Move 7") : "";
  // My own flag always comes from my settings (also in a game started before I picked one).
  const cc = seat ? (you ? game.myLooks().cc : seat.cc) : undefined;

  // Nobody in this corner: nothing to show (the space stays, so the others keep their corners).
  if (!seat) return <div aria-hidden="true" />;

  return (
    <div
      className={cn(
        "relative flex min-w-0 items-center gap-2 rounded-xl py-1.5 transition-[background] duration-300",
        // Pachisi, Chaupar: the cowries / long dice get a full row of their own under the name (they need room to be read).
        thrownRow && "flex-wrap gap-y-1.5",
        right ? "flex-row-reverse pr-3 pl-1.5 text-right" : "pr-1.5 pl-3",
        isTurn ? "tag-spotlight" : "tag-edge",
        right && "tag-right",
      )}
      style={{
        // Waiting: just a bar of the player's colour on the outer edge. Their turn: the bar
        // glows and their colour surges across from it (see .tag-spotlight, .tag-fx).
        ["--spot" as string]: hex,
        opacity: seat.out ? 0.5 : away ? 0.75 : 1,
      }}
    >
      {isTurn && (
        <span className="tag-fx" aria-hidden="true">
          <span className="tag-fx-base" />
          <span className="tag-fx-surge" />
          <span className="tag-fx-surge" />
        </span>
      )}
      {timer && <TurnRing key={game.turnId()} limit={game.turnLimit(c)} startedAt={game.turnSeenAt} right={right} />}
      {/* Finished: a medal with the place, while the others play on. */}
      {place >= 0 && (
        <span
          className={cn(
            "medal-pop pointer-events-none absolute z-20 flex h-8 min-w-8 items-center justify-center rounded-full px-1.5 text-xs font-extrabold shadow-[0_3px_8px_rgba(0,0,0,.45)] ring-2 ring-white/70",
            top ? "-bottom-2.5" : "-top-2.5",
            right ? "left-2" : "right-2",
            place === 0 || sides
              ? "bg-[linear-gradient(145deg,#fff1b8,#e2b048_55%,#a8741c)] text-[#3a2606]"
              : place === 1
                ? "bg-[linear-gradient(145deg,#f4f6f8,#a9b2bd)] text-[#2b3138]"
                : place === 2
                  ? "bg-[linear-gradient(145deg,#f0c39a,#b06c35)] text-[#3a1d08]"
                  : "bg-secondary text-foreground",
          )}
          aria-label={sides ? "All four pieces home" : `Finished ${["1st", "2nd", "3rd", "4th"][place]}`}
        >
          {sides ? "Home" : ["1st", "2nd", "3rd", "4th"][place]}
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

      {/* The player's picture; on their turn it turns into the dice (same spot, so nothing moves). Pachisi, Chaupar: always the picture. */}
      <div className="flex size-[38px] shrink-0 items-center justify-center min-[400px]:size-[42px] sm:size-[46px]">
        {dieColor === c && !thrownRow ? (
          <Dice3D />
        ) : seat ? (
          <span className="flex size-[34px] items-center justify-center min-[400px]:size-[38px] sm:size-[42px]">
            <Avatar av={seat.bot && !seat.takeover ? "bot" : you ? (game.myLooks().av ?? 0) : (seat.av ?? defaultAvatar(seat.id))} className="size-full" ring={hex} />
          </span>
        ) : (
          <span className="size-[34px] rounded-full border border-dashed border-foreground/25 min-[400px]:size-[38px]" />
        )}
      </div>

      <div className={cn("flex min-w-0 flex-1 flex-col gap-1", right && "items-end")}>
        {/* Name and flag; the name gets the rest of the tag's width and is cut short only if it doesn't fit there */}
        <div className={cn("relative flex max-w-full min-w-0 items-center gap-1.5 leading-tight font-bold", right && "flex-row-reverse")}>
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            aria-expanded={menu}
            className="min-w-0 truncate rounded text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-base"
          >
            {seat.nick}
          </button>
          {cc ? (
            <Flag cc={cc} below={top} />
          ) : (
            you && (
              // My country isn't known: a quiet button to pick it
              <button
                type="button"
                onClick={() => uiStore.set({ settingsOpen: true })}
                aria-label="Choose your country"
                title="Choose your country"
                className="flex h-3.5 w-[21px] shrink-0 items-center justify-center rounded-[3px] border border-dashed border-foreground/40 text-[10px] leading-none font-bold text-muted-foreground"
              >
                +
              </button>
            )
          )}
          {/* My missed turns: by my name (the row below is full with my buttons). */}
          {missDots && showChat && <MissDots missed={missed} />}
          {menu && (
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                uiStore.set({ profileOf: c });
              }}
              className={cn(
                "badge-pop absolute z-30 flex items-center gap-1.5 rounded-full bg-paper px-3 py-1.5 text-xs font-bold whitespace-nowrap text-[#23302c] shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
                top ? "top-full mt-1.5" : "bottom-full mb-1.5",
                right ? "right-0" : "left-0",
              )}
            >
              <UserRound className="size-3.5" strokeWidth={2.4} />
              View profile
            </button>
          )}
        </div>
        {seat && (
          <div className={cn("flex h-6 max-w-full min-w-0 items-center gap-1.5 min-[380px]:h-7", right && "flex-row-reverse")}>
            {takeover && you ? (
              <button
                type="button"
                role="switch"
                aria-checked="true"
                aria-label="Bot is playing for you. Turn it off to play yourself."
                title="Turn the bot off and play yourself"
                onClick={game.takeBack}
                className="flex h-6 shrink-0 items-center gap-1 rounded-full bg-primary px-2 text-xs font-bold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
              >
                <Bot className="size-4" strokeWidth={2.2} />
                Bot on
              </button>
            ) : note ? (
              <span
                className={cn(
                  "min-w-0 truncate rounded-full px-2 py-0.5 text-[11px] font-bold",
                  note.tone === "red" ? "bg-[#dc2626]/35 text-[#fecaca]" : note.tone === "amber" ? "bg-[#d97706]/35 text-[#fde68a]" : "bg-foreground/12 text-foreground/80",
                )}
              >
                {note.text}
              </span>
            ) : showChat ? (
              <>
                <VoiceButton
                  on={game.voice.micOn}
                  onClick={() => void game.toggleMic()}
                  label={game.voice.micOn ? "Turn my microphone off" : "Turn my microphone on"}
                  ring={game.voice.micOn && game.isSpeaking(seat.id)}
                >
                  {game.voice.micOn ? <Mic className="size-4" strokeWidth={2.2} /> : <MicOff className="size-4" strokeWidth={2.2} />}
                </VoiceButton>
                <VoiceButton
                  on={game.speakerOn()}
                  onClick={() => game.toggleSpeaker()}
                  label={game.speakerOn() ? "Turn my speaker off (stop hearing everyone)" : "Turn my speaker on (hear everyone)"}
                >
                  {game.speakerOn() ? <Volume2 className="size-4" strokeWidth={2.2} /> : <VolumeX className="size-4" strokeWidth={2.2} />}
                </VoiceButton>
                <button
                  type="button"
                  aria-label="Open chat"
                  onClick={() => game.openChat()}
                  className="relative flex size-6 shrink-0 items-center justify-center rounded-lg bg-background/70 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95 min-[380px]:size-7"
                >
                  <MessageCircle className="size-4" strokeWidth={2.2} />
                  {game.unread > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] rounded-full bg-[#e5484d] px-1 text-center text-[11px] leading-[18px] font-bold text-white">
                      {game.unread > 9 ? "9+" : game.unread}
                    </span>
                  )}
                </button>
              </>
            ) : missDots ? (
              <MissDots missed={missed} />
            ) : (
              s.phase !== "lobby" && <HomeDots home={home} color={hex} />
            )}
            {count && (
              <span className="badge-pop shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] leading-none font-extrabold whitespace-nowrap text-primary-foreground shadow" title={count}>
                {count}
              </span>
            )}
            {/* Another player: hear them or not (for me only); a small mic-off mark when they aren't talking */}
            {showHear && !note && (
              <VoiceButton
                on={game.hears(seat.id)}
                onClick={() => game.toggleHear(seat.id)}
                label={game.hears(seat.id) ? `Stop hearing ${seat.nick}` : `Hear ${seat.nick}`}
                ring={game.hears(seat.id) && game.isSpeaking(seat.id)}
              >
                {game.hears(seat.id) ? <Volume2 className="size-4" strokeWidth={2.2} /> : <VolumeX className="size-4" strokeWidth={2.2} />}
                {game.micOffFor(seat.id) && (
                  <MicOff className="absolute -right-1 -bottom-1 size-3.5 rounded-full bg-background p-0.5 text-muted-foreground" strokeWidth={2.6} />
                )}
              </VoiceButton>
            )}
          </div>
        )}
      </div>
      {/*
        Pachisi: the cowries sit with the player whose turn it is, big enough to count at a glance.
        Every tag keeps the row's space, so nothing jumps as the cowries go round the table.
      */}
      {pachisi && <CowrieRow c={c} isTurn={isTurn} right={right} />}
      {chaupar && <PasaRow c={c} isTurn={isTurn} right={right} />}
    </div>
  );
}

/**
 * Online: the turns a player has missed, as four dots (one more miss after
 * these and they're out). They fill amber, then deepen to red as the last
 * chances go; the last one left pulses gently.
 */
function MissDots({ missed }: { missed: number }) {
  const n = MAX_MISSES - 1;
  const label = missed ? `Missed ${missed} of ${MAX_MISSES} turns` : "No turns missed";
  return (
    <span className={cn("miss-dots", missed >= n && "miss-dots-last")} role="img" aria-label={label} title={label}>
      {Array.from({ length: n }, (_, k) => (
        <span key={k} className={cn("miss-dot", k < missed && "miss-dot-on")} data-step={k < missed ? Math.min(missed, n) : undefined} />
      ))}
    </span>
  );
}

/** Tokens home: four dots, filled in the player's colour. */
function HomeDots({ home, color }: { home: number; color: string }) {
  return (
    <span className="flex shrink-0 gap-[3px]" role="img" aria-label={`${home} of 4 tokens home`}>
      {[0, 1, 2, 3].map((k) => (
        <span
          key={k}
          className="h-[7px] w-[7px] rounded-full"
          style={k < home ? { background: color, boxShadow: "0 0 0 1px rgba(255,255,255,.55)" } : { background: "rgb(var(--c-ink) / .22)" }}
        />
      ))}
    </span>
  );
}

/** A round voice chat switch: green when on, muted grey when off. */
function VoiceButton({ on, onClick, label, ring, children }: { on: boolean; onClick: () => void; label: string; ring?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      title={label}
      className={cn(
        "relative flex size-6 shrink-0 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95 min-[380px]:size-7",
        on ? "bg-[#16a34a] text-white" : "bg-background/70 text-muted-foreground",
        ring && "ring-2 ring-[#4ade80] ring-offset-1 ring-offset-transparent",
      )}
    >
      {children}
    </button>
  );
}
