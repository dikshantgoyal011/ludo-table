"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGame, useProfile, useSettings } from "@/hooks/use-game";
import { COLORS } from "@/lib/game/constants";
import { seated } from "@/lib/game/rules";
import type { Color } from "@/lib/game/types";
import { themeOf } from "@/lib/theme/themes";
import { ColorPicker } from "./pickers";

/** Before and after a game: what's happening and the main action. */
export function TurnCard() {
  const game = useGame();
  const router = useRouter();
  const [settings] = useSettings();
  const [profile] = useProfile();
  const th = themeOf(settings.theme);
  const s = game.state;
  const n = s.players.length;
  const net = game.isNet();

  let swatch = "rgb(var(--c-line))";
  let label = "";
  let title = "";
  let hint = "";
  let action: React.ReactNode = null;

  if (!game.loaded) {
    label = game.searching ? "Finding a table" : "Connecting";
    title = game.searching ? `Looking for a ${game.wantCount}-player game…` : "Setting up the table";
  } else if (s.phase === "lobby") {
    swatch = th.pieces[profile.color];
    if (game.mode === "online") {
      const cap = game.capacity();
      label = `${cap}-player public table`;
      if (!game.joined()) {
        title = n >= cap ? "This table is full" : "Join the game";
        hint = "Type your name, pick your color and tap Join game.";
      } else if (n < cap) {
        const more = cap - n;
        title = `Waiting for ${more} more player${more > 1 ? "s" : ""}…`;
        hint = `${n} of ${cap} here. Anyone who picks a ${cap}-player online game right now will join you.`;
      } else {
        title = "Table is full!";
        hint = s.startAt ? `Starting in ${game.secsLeft(s.startAt)}s.` : "Starting…";
      }
    } else {
      label = "Waiting to start";
      if (!game.joined()) {
        title = n >= 4 ? "This table is full" : "Join the game";
        hint = "Type your name, pick your color and tap Join game.";
      } else if (n < 2) {
        title = "Waiting for friends";
        hint = "Tap Invite and send the link. Each friend joins on their own phone.";
      } else {
        title = `${n} players ready`;
        hint = "Anyone at the table can press Start.";
      }
      if (game.joined())
        action = (
          <Button disabled={n < 2} onClick={game.start}>
            Start game
          </Button>
        );
    }
  } else if (s.phase === "done") {
    swatch = s.winners[0] ? th.pieces[game.displayColor(s.winners[0])] : "#f2c94c";
    label = "Game over";
    title = s.winners[0] ? `${s.seats[s.winners[0]]?.nick || "Someone"} wins!` : "Game over";
    hint = s.winners.map((c, k) => `${k + 1}. ${s.seats[c]?.nick || c}`).join("   ");
    action = (
      <Button
        onClick={() => {
          game.playAgain();
          if (game.mode === "online") router.push("/game");
        }}
      >
        {game.mode === "online" ? "Find another game" : "Play again"}
      </Button>
    );
  } else return null;

  if (!net && s.phase === "lobby") return null;

  return (
    <section className="flex items-center gap-4 rounded-2xl border border-border bg-card p-3 sm:p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: swatch }} />
          <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">{label}</span>
        </div>
        <div className="text-lg leading-tight font-bold sm:text-xl">{title}</div>
        <div className="min-h-[2.5rem] text-sm leading-snug text-muted-foreground">{hint}</div>
        {action && <div className="mt-1 flex flex-wrap gap-2">{action}</div>}
      </div>
    </section>
  );
}

/** Players list, name / colour (online & friends), join / leave, restart. */
export function PlayersPanel() {
  const game = useGame();
  const [settings] = useSettings();
  const [profile, saveProfile] = useProfile();
  const th = themeOf(settings.theme);
  const renameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const s = game.state;
  const net = game.isNet();
  const joined = game.joined();
  const playing = s.phase === "playing";

  const list: { p: { id: string; nick: string }; slot?: Color }[] =
    s.phase === "lobby"
      ? s.players.map((p) => ({ p, slot: COLORS.find((c) => s.seats[c]?.id === p.id) }))
      : seated(s).map((c) => ({ p: s.seats[c]!, slot: c }));

  const cap = game.mode === "online" ? game.capacity() : 4;

  return (
    <section className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Players</h2>
        {game.loaded && game.mode !== "online" && (
          <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
            {!game.confirmReset ? (
              (playing || (game.mode === "friends" && s.players.length > 0)) && (
                <Button variant="destructive" size="xs" onClick={() => game.setConfirmReset(true)}>
                  {playing ? "Restart" : "Clear table"}
                </Button>
              )
            ) : (
              <>
                <span className="text-xs text-muted-foreground">{playing ? "Restart for everyone?" : "Remove everyone?"}</span>
                <Button variant="destructive" size="xs" onClick={playing ? game.reset : game.clearSeats}>
                  Yes
                </Button>
                <Button variant="outline" size="xs" onClick={() => game.setConfirmReset(false)}>
                  No
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {net && s.phase === "lobby" && game.loaded && (
        <Input
          maxLength={16}
          placeholder="Your name"
          autoComplete="nickname"
          aria-label="Your name"
          value={profile.nick}
          onChange={(e) => {
            saveProfile({ nick: e.target.value });
            if (renameTimer.current) clearTimeout(renameTimer.current);
            renameTimer.current = setTimeout(() => game.renameInLobby(), 600);
          }}
        />
      )}

      {net && game.loaded && !game.colorLocked() && (
        <div className="flex flex-col gap-1.5">
          <div className="text-xs text-muted-foreground">
            Your color <span className="opacity-80">(only changes how the board looks on your phone)</span>
          </div>
          <ColorPicker
            value={profile.color}
            onChange={(color) => {
              saveProfile({ color });
              game.colorChanged();
            }}
          />
        </div>
      )}
      {net && game.loaded && game.colorLocked() && game.mySlot() && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: th.pieces[game.myColor()] }} />
          Your color is locked until this game ends.
        </div>
      )}

      {net && game.loaded && s.phase === "lobby" && !joined && (
        <Button size="lg" className="h-11 w-full" disabled={s.players.length >= cap} onClick={game.join}>
          {s.players.length >= cap ? "Table is full" : "Join game"}
        </Button>
      )}
      {net && game.loaded && s.phase === "lobby" && joined && game.mode === "friends" && (
        <Button variant="outline" className="self-start" onClick={game.leave}>
          Leave
        </Button>
      )}
      {net && game.loaded && s.phase !== "lobby" && !game.mySlot() && (
        <div className="text-sm text-muted-foreground">You&apos;re watching this game. You can join the next one.</div>
      )}

      <ol className="flex flex-col gap-1.5">
        {!list.length && <li className="text-sm text-muted-foreground">No one has joined yet.</li>}
        {list.map(({ p, slot }, k) => {
          const you = (net && p.id === game.myId) || (game.mode === "computer" && p.id === "me");
          const place = slot ? s.winners.indexOf(slot) : -1;
          const dot = slot && (s.phase !== "lobby" || joined || !net) ? th.pieces[game.displayColor(slot)] : "rgb(var(--c-muted))";
          return (
            <li key={p.id} className="flex min-w-0 items-center gap-2 rounded-lg bg-background/60 px-2.5 py-2 text-sm">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: dot }} />
              <span className="min-w-0 flex-1 truncate font-bold">
                {p.nick}
                {you ? " (you)" : ""}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {place >= 0
                  ? `#${place + 1}`
                  : slot && s.seats[slot]?.out
                    ? "Out"
                    : slot && s.seats[slot]?.takeover
                      ? "Bot on"
                      : slot && s.seats[slot]?.bot
                        ? "Computer"
                        : slot && playing && game.awayInfo(s.seats[slot]!).away
                          ? "Offline"
                          : `P${k + 1}`}
              </span>
            </li>
          );
        })}
        {game.mode === "online" && s.phase === "lobby" && game.loaded &&
          Array.from({ length: Math.max(0, cap - list.length) }, (_, k) => (
            <li key={"open" + k} className="flex items-center gap-2 rounded-lg border border-dashed border-border px-2.5 py-2 text-sm text-muted-foreground">
              <span className="h-3 w-3 shrink-0 rounded-full border border-border" />
              Open seat
            </li>
          ))}
      </ol>
    </section>
  );
}
