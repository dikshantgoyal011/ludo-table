"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ColorPicker, CountPicker, Field } from "@/components/game/pickers";
import { getController, useProfile } from "@/hooks/use-game";
import { useMounted } from "@/hooks/use-mounted";
import {
  cleanRoomCode,
  COLORS,
  MODE_ORDER,
  MODES,
  newRoomCode,
  NICK_MAX,
  roomPath,
} from "@/lib/game/constants";
import type { Color, GameId, Mode } from "@/lib/game/types";
import { cleanVariations } from "@/lib/game/pachisi/variations";
import { isGameId, rulesFor } from "@/lib/game/rules";
import { countOn, hasVariations, plainRules, type Variations } from "@/lib/game/variations";
import { variantById } from "@/lib/game/variants";
import { clearRulesChoice, SidesPicker, useRulesChoice, VariationsDialog, variationsSummary } from "@/components/game/variations";
import type { Profile } from "@/lib/services/types";
import { cn } from "@/lib/utils";
import { GameStrip } from "./game-picker";
import { rememberGame } from "./menu-screen";

/** Name input that saves to the profile as you type. */
function NameInput({
  profile,
  save,
}: {
  profile: Profile;
  save: (p: Partial<Profile>) => void;
}) {
  return (
    <Input
      maxLength={NICK_MAX}
      placeholder="Your name"
      autoComplete="nickname"
      aria-label="Your name"
      value={profile.nick}
      onChange={(e) => save({ nick: e.target.value })}
    />
  );
}

/**
 * Make sure no two pass-and-play players share a colour. `pairs` (Pachisi as
 * partners) with two players: each also plays the colour opposite theirs, so
 * that one is taken too.
 */
function fixLocalColors(setup: Profile["localSetup"], pairs = false): Profile["localSetup"] {
  const rows = setup.rows.map((r) => ({ ...r }));
  const used = new Set<Color>();
  const sides = pairs && setup.count === 2;
  for (let k = 0; k < setup.count; k++) {
    const r = rows[k];
    if (used.has(r.color)) r.color = COLORS.find((c) => !used.has(c)) as Color;
    used.add(r.color);
    if (sides) used.add(COLORS[(COLORS.indexOf(r.color) + 2) % 4]);
  }
  return { ...setup, rows };
}

export function SetupScreen({ mode }: { mode: Mode }) {
  const router = useRouter();
  const mounted = useMounted();
  const [profile, save] = useProfile();
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  // Which game: ?game= in the address (Ludo when absent). Read from the router, so a
  // page opened from inside the app has the right game from its very first frame
  // (reading it after opening showed Ludo for a moment on every Pachisi screen).
  const query = useSearchParams();
  const [picked, setGame] = useState<GameId | null>(null);
  const asked = query.get("game");
  const game: GameId = picked ?? (isGameId(asked) ? asked : "ludo");
  const v = variantById(game);
  const gameQuery = game === "ludo" ? "" : `?game=${game}`;
  const pachisi = game === "pachisi";
  // Player counts this game is played with.
  const counts = rulesFor(game).counts;
  const fit = (n: number) => (counts.includes(n) ? n : counts.includes(4) && n > 2 ? 4 : counts[0]);
  const [varsOpen, setVarsOpen] = useState(false);
  // (Pachisi / Parchís: the rules for this game: my saved preferences, or the standard ones.)
  const withVars = hasVariations(game);
  const rules = useRulesChoice(game);
  const vars: Variations = rules.value;
  const saveVars = rules.set;
  const n = countOn(game, vars);
  // Pachisi: Solo or 2 vs 2.
  const sidesField = (players: number) =>
    pachisi && (
      <Field label="How you play">
        <SidesPicker value={cleanVariations(vars)} players={players} onChange={saveVars} />
      </Field>
    );
  const rulesField = withVars && (mode === "computer" || mode === "local") && (
    <Field label="Rules">
      <button
        type="button"
        onClick={() => setVarsOpen(true)}
        className="hover-lift flex w-full items-center gap-3 rounded-xl border border-border bg-background/50 px-3 py-2.5 text-left outline-none hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring active:scale-[.99]"
      >
        <span className="min-w-0 flex-1 text-sm">
          <span className="block font-bold">{n ? `${n} variation${n > 1 ? "s" : ""} on` : plainRules(game)}</span>
          <span className="block text-xs text-muted-foreground">
            {n ? variationsSummary(game, vars) : "No variations. Tap to choose some."}
            {rules.saved && " · Saved"}
          </span>
        </span>
        <span className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground">Variations</span>
      </button>
      <VariationsDialog game={game} open={varsOpen} onClose={() => setVarsOpen(false)} value={vars} onChange={saveVars} saved={rules.saved} onSave={rules.setSaved} />
    </Field>
  );

  // Opening a setup screen leaves any table that was running.
  useEffect(() => {
    getController().exitToMenu();
  }, []);
  // The home page opens on the game last looked at.
  useEffect(() => rememberGame(game), [game]);

  // Going on to a room or a game: show it's on its way (and don't start a second one).
  const [opening, startOpening] = useTransition();
  const go = (path: string) => startOpening(() => router.push(path));
  // Ready before the tap: the room and game pages load at once.
  useEffect(() => {
    router.prefetch("/room");
    router.prefetch("/game");
  }, [router]);
  // The same game strip, in the same place, as on the home page: switch game in one tap.
  const strip = (
    <GameStrip
      selected={game}
      onSelect={(id) => {
        rememberGame(id);
        // Another playable game: stay on this screen with it; one that's coming: show it on the home page.
        if (variantById(id).ready && isGameId(id)) {
          setGame(id);
          router.replace(`/play/${mode}${id === "ludo" ? "" : `?game=${id}`}`);
        } else go(`/?game=${id}`);
      }}
    />
  );

  // (Only on a fresh load, before the saved profile is read; opened from inside the app it's drawn at once.)
  if (!mounted) return <SetupSkeleton strip={strip} />;

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-3 sm:gap-4">
      {strip}
      <div className="app-scroll">
      <Card className="mx-auto w-full max-w-xl">
        <nav
          aria-label="How to play"
          className="grid grid-cols-4 gap-1 rounded-xl bg-background/50 p-1"
        >
          {MODE_ORDER.map((m) => (
            <Link
              key={m}
              href={`/play/${m}${gameQuery}`}
              replace
              aria-current={m === mode ? "page" : undefined}
              className={cn(
                "rounded-lg px-1 py-1.5 text-center text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm",
                m === mode
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {MODES[m].chip}
            </Link>
          ))}
        </nav>
        <CardHeader>
          <CardTitle>{v.name} · {MODES[mode].title}</CardTitle>
          <CardDescription>{MODES[mode].desc}</CardDescription>
        </CardHeader>

        {error && (
          <div className="rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
            {error}
          </div>
        )}

        {(mode === "online" || mode === "friends" || mode === "computer") && (
          <>
            <Field label="Your name">
              <NameInput profile={profile} save={save} />
            </Field>
            <Field label="Your color">
              <ColorPicker
                value={profile.color}
                onChange={(color) => save({ color })}
              />
            </Field>
          </>
        )}

        {mode === "online" && (
          <>
            <Field label="Game type">
              <CountPicker
                counts={counts}
                value={fit(profile.onlineCount)}
                onChange={(onlineCount) => save({ onlineCount })}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                You&apos;ll only be matched with people who also picked a{" "}
                {fit(profile.onlineCount)}-player game{pachisi && fit(profile.onlineCount) !== 3 ? `, ${cleanVariations(vars).alone ? "Solo" : fit(profile.onlineCount) === 2 ? "two colors each" : "2 vs 2"}` : ""}.
              </p>
            </Field>
            {sidesField(fit(profile.onlineCount))}
            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                getController().startOnline(fit(profile.onlineCount), game, !cleanVariations(vars).alone);
                clearRulesChoice(game);
                go("/game");
              }}
            >
              Find a {fit(profile.onlineCount)}-player game
            </Button>
            <p className="text-xs text-muted-foreground">
              The game starts as soon as the table is full. You have 15 seconds a turn; miss 5 turns and you&apos;re out.
              If someone goes offline, the computer plays for them until they&apos;re back.
              {withVars && ` Online games use the ${plainRules(game).toLowerCase()}, without variations.`}
            </p>
          </>
        )}

        {mode === "friends" && (
          <>
            <Button
              size="lg"
              className="w-full"
              disabled={opening}
              onClick={() => go(roomPath(newRoomCode(), game === "ludo" ? "" : `game=${game}`))}
            >
              {opening ? "Opening the room…" : "Create a room"}
            </Button>
            <div className="text-center text-xs tracking-widest text-muted-foreground uppercase">
              or
            </div>
            <div className="flex gap-2">
              <Input
                className="font-mono tracking-wider placeholder:font-sans placeholder:tracking-normal"
                placeholder="Friend's room code"
                maxLength={12}
                autoCapitalize="off"
                autoComplete="off"
                aria-label="Friend's room code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    document.getElementById("joinFriendRoom")?.click();
                }}
              />
              <Button
                id="joinFriendRoom"
                variant="outline"
                className="h-10 px-4"
                onClick={() => {
                  const v = cleanRoomCode(code);
                  if (v.length < 3) {
                    setError("Room codes are 3 to 12 letters or numbers.");
                    return;
                  }
                  go(roomPath(v));
                }}
                disabled={opening}
              >
                Join
              </Button>
            </div>
          </>
        )}

        {mode === "computer" && (
          <>
            <Field label="Players">
              <CountPicker
                counts={counts}
                value={fit(profile.cpuCount)}
                onChange={(cpuCount) => save({ cpuCount })}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                You plus {fit(profile.cpuCount) - 1} computer player{fit(profile.cpuCount) > 2 ? "s" : ""}.
              </p>
            </Field>
            {sidesField(fit(profile.cpuCount))}
            {rulesField}
            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                getController().startComputer(fit(profile.cpuCount), game, withVars ? vars : undefined);
                clearRulesChoice(game);
                go("/game");
              }}
            >
              Start game
            </Button>
          </>
        )}

        {mode === "local" && (
          <LocalSetup
            profile={profile}
            save={save}
            game={game}
            counts={counts}
            rules={rulesField}
            sides={sidesField}
            vars={vars}
            onStart={() => {
              clearRulesChoice(game);
              go("/game");
            }}
          />
        )}

        <Button
          variant="outline"
          className="self-start"
          onClick={() => go(`/${gameQuery}`)}
        >
          ← All games
        </Button>
      </Card>
      </div>
    </div>
  );
}

/** The setup screen's frame while it's on its way: the game strip and an empty card, in their places. */
export function SetupSkeleton({ strip }: { strip?: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-3 sm:gap-4">
      {strip ?? <GameStrip selected="" onSelect={() => {}} />}
      <div className="app-scroll">
        <Card className="mx-auto min-h-[420px] w-full max-w-xl" />
      </div>
    </div>
  );
}

function LocalSetup({
  profile,
  save,
  game,
  counts,
  rules,
  sides,
  vars,
  onStart,
}: {
  profile: Profile;
  save: (p: Partial<Profile>) => void;
  game: GameId;
  counts: number[];
  rules: React.ReactNode;
  sides: (players: number) => React.ReactNode;
  /** The rules picked for this game (Pachisi, Parchís). */
  vars: Variations;
  onStart: () => void;
}) {
  const withVars = hasVariations(game);
  const saved = profile.localSetup;
  const count = counts.includes(saved.count) ? saved.count : counts[counts.length - 1];
  // Pachisi, two colors each: two players each play a side (the colour picked and the one opposite).
  const pairs = game === "pachisi" && !cleanVariations(vars).alone;
  const setup = fixLocalColors({ ...saved, count }, pairs);
  const update = (next: Profile["localSetup"]) => save({ localSetup: next });
  return (
    <>
      <div className="flex flex-col gap-4">
        <Field label="Players">
          <CountPicker
            counts={counts}
            value={setup.count}
            onChange={(count) => update(fixLocalColors({ ...setup, count }, pairs))}
          />
        </Field>
        {sides(setup.count)}
        {rules}
        {setup.rows.slice(0, setup.count).map((row, k) => {
          const taken = setup.rows
            .slice(0, setup.count)
            .filter((_, j) => j !== k)
            .map((r) => r.color)
            // Pachisi as partners, two players: the other player's partner colour is theirs too.
            .flatMap((c) => (pairs && setup.count === 2 ? [c, COLORS[(COLORS.indexOf(c) + 2) % 4]] : [c]));
          const setRow = (patch: Partial<typeof row>) =>
            update({
              ...setup,
              rows: setup.rows.map((r, j) =>
                j === k ? { ...r, ...patch } : r,
              ),
            });
          return (
            <div
              key={k}
              className="flex flex-col gap-2 rounded-xl border border-border bg-background/50 p-3"
            >
              <div className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                Player {k + 1}
              </div>
              <Input
                maxLength={NICK_MAX}
                placeholder={`Player ${k + 1}`}
                aria-label={`Player ${k + 1} name`}
                value={row.name}
                onChange={(e) => setRow({ name: e.target.value })}
              />
              <ColorPicker
                value={row.color}
                disabled={taken}
                onChange={(c) => !taken.includes(c) && setRow({ color: c })}
              />
            </div>
          );
        })}
      </div>
      <Button
        size="lg"
        className="w-full"
        onClick={() => {
          const fixed = fixLocalColors(setup, pairs);
          update(fixed);
          getController().startLocal(fixed.rows.slice(0, fixed.count), game, withVars ? vars : undefined);
          onStart();
        }}
      >
        Start game
      </Button>
      <p className="text-xs text-muted-foreground">
        Each player needs a different color. Pass the phone when it&apos;s
        someone else&apos;s turn.
      </p>
    </>
  );
}
