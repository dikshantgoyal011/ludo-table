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
  isRoomCode,
  MODE_ORDER,
  MODES,
  newRoomCode,
  NICK_MAX,
  roomPath,
} from "@/lib/game/constants";
import type { Color, GameId, Mode } from "@/lib/game/types";
import { isGameId, rulesFor } from "@/lib/game/rules";
import { countOn, hasSides, hasVariations, plainRules, playsSolo, variationInfo, type Variations } from "@/lib/game/variations";
import { variantById } from "@/lib/game/variants";
import { clearRulesChoice, SidesPicker, useRulesChoice, VariationsDialog, variationsSummary } from "@/components/game/variations";
import type { Profile } from "@/lib/services/types";
import { cn } from "@/lib/utils";
import { GameStrip } from "./game-picker";
import { rememberedGame, rememberGame } from "./menu-screen";

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
 * Make sure no two pass-and-play players share a colour. `pairs` (Pachisi, Chaupar as
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
  // Play with friends: creating a room, or joining one (two separate choices).
  const [way, setWay] = useState<"create" | "join">("create");
  // Which game: ?game= in the address, else the one picked last (the app's own links are plain
  // addresses, already fetched: see RouteWarmup), else Ludo. Read while drawing, so the screen
  // has the right game from its very first frame.
  const query = useSearchParams();
  const [picked, setGame] = useState<GameId | null>(null);
  const asked = query.get("game");
  const last = rememberedGame();
  const game: GameId = picked ?? (isGameId(asked) ? asked : isGameId(last) && variantById(last).ready ? last : "ludo");
  const v = variantById(game);
  const gameQuery = game === "ludo" ? "" : `?game=${game}`;
  // Pachisi, Chaupar: Solo or 2 vs 2 is picked on its own.
  const sided = hasSides(game);
  // Player counts this game is played with.
  const counts = rulesFor(game).counts;
  const fit = (n: number) => (counts.includes(n) ? n : counts.includes(4) && n > 2 ? 4 : counts[0]);
  const [varsOpen, setVarsOpen] = useState(false);
  // (Games with variations: the rules for this game: my saved preferences, or the standard ones.)
  const withVars = hasVariations(game);
  const rules = useRulesChoice(game);
  const vars: Variations = rules.value;
  const saveVars = rules.set;
  const n = countOn(game, vars);
  // Pachisi, Chaupar: Solo or 2 vs 2.
  const sidesField = (players: number) =>
    sided && (
      <Field label="How you play">
        <SidesPicker value={vars} players={players} onChange={saveVars} />
      </Field>
    );
  // (Not for a game whose only choice is Solo or 2 vs 2: Chaupar.)
  const rulesField = withVars && variationInfo(game).length > 0 && (mode === "computer" || mode === "local") && (
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
  // Remembered, and shown in the address (to share or reload), without going anywhere.
  useEffect(() => {
    rememberGame(game);
    const url = `/play/${mode}${gameQuery}`;
    if (location.pathname + location.search !== url) window.history.replaceState(null, "", url);
  }, [game, mode, gameQuery]);

  // Going on to a room or a game: show it's on its way (and don't start a second one).
  const [opening, startOpening] = useTransition();
  const go = (path: string) => startOpening(() => router.push(path, { scroll: false }));
  // Ready before the tap: the room and game pages load at once. A new room's code is picked now, so
  // its page (an address of its own) is fetched before Create a room is tapped.
  const [newCode, setNewCode] = useState(newRoomCode);
  const createPath = roomPath(newCode, `new=1${game === "ludo" ? "" : `&game=${game}`}`);
  useEffect(() => {
    router.prefetch("/room");
    router.prefetch("/game");
  }, [router]);
  useEffect(() => {
    if (mode === "friends") router.prefetch(createPath);
  }, [mode, createPath, router]);
  // Joining: the room's page is fetched while its code is typed.
  useEffect(() => {
    const v = cleanRoomCode(code);
    if (mode !== "friends" || !isRoomCode(v)) return;
    const t = setTimeout(() => router.prefetch(roomPath(v)), 150);
    return () => clearTimeout(t);
  }, [mode, code, router]);
  // The same game strip, in the same place, as on the home page: switch game in one tap.
  const strip = (
    <GameStrip
      selected={game}
      onSelect={(id) => {
        rememberGame(id);
        // Another playable game: stay on this screen with it; one that's coming: show it on the home page.
        // (The address follows by itself, without a trip to the network.)
        if (variantById(id).ready && isGameId(id)) setGame(id);
        else go("/");
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
              href={`/play/${m}`}
              scroll={false}
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
                {fit(profile.onlineCount)}-player game{sided && fit(profile.onlineCount) !== 3 ? `, ${playsSolo(vars) ? "Solo" : fit(profile.onlineCount) === 2 ? "two colors each" : "2 vs 2"}` : ""}.
              </p>
            </Field>
            {sidesField(fit(profile.onlineCount))}
            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                getController().startOnline(fit(profile.onlineCount), game, !playsSolo(vars));
                clearRulesChoice(game);
                go("/game");
              }}
            >
              Find a {fit(profile.onlineCount)}-player game
            </Button>
            <p className="text-xs text-muted-foreground">
              The game starts as soon as the table is full. You have 15 seconds a turn; miss 5 turns and you&apos;re out.
              If your time runs out, your turn is played for you and counts as missed. The game goes on without anyone who goes offline.
              {withVars && ` Online games use the ${plainRules(game).toLowerCase()}, without variations.`}
            </p>
          </>
        )}

        {mode === "friends" && (
          <>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Create or join a room">
              {(
                [
                  ["create", "Create a room", "Get a code to send your friends"],
                  ["join", "Join a room", "Use the code a friend sent you"],
                ] as const
              ).map(([id, title, text]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={way === id}
                  onClick={() => {
                    setWay(id);
                    setError("");
                  }}
                  className={cn(
                    "flex flex-col gap-0.5 rounded-xl border-2 px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[.98]",
                    way === id ? "border-primary bg-primary/12" : "border-border bg-background/50",
                  )}
                >
                  <span className="text-sm leading-tight font-bold">{title}</span>
                  <span className="text-xs leading-snug text-muted-foreground">{text}</span>
                </button>
              ))}
            </div>
            {way === "create" ? (
              <>
                <p className="text-xs leading-snug text-muted-foreground">
                  You get a room code and an invite link to send. When your friends are in, you start the game.
                </p>
                <Button
                  size="lg"
                  className="w-full"
                  disabled={opening}
                  onClick={() => {
                    go(createPath);
                    // (Back here later: a new room gets a new code.)
                    setTimeout(() => setNewCode(newRoomCode()), 1000);
                  }}
                >
                  {opening ? "Opening the room…" : "Create a room"}
                </Button>
              </>
            ) : (
              <>
                <Field label="Room code">
                  <Input
                    className="h-11 font-mono text-base tracking-wider placeholder:font-sans placeholder:tracking-normal"
                    placeholder="The code your friend sent"
                    maxLength={12}
                    autoCapitalize="off"
                    autoComplete="off"
                    aria-label="Room code"
                    aria-invalid={!!error}
                    aria-describedby="roomCodeNote"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      setError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") document.getElementById("joinFriendRoom")?.click();
                    }}
                  />
                  {/* What a code looks like, and what's wrong with this one: always one line here, so nothing moves. */}
                  <p id="roomCodeNote" role={error ? "alert" : undefined} className={cn("mt-1.5 min-h-4 text-xs leading-4", error ? "font-semibold text-[#fca5a5]" : "text-muted-foreground")}>
                    {error || "3 to 12 letters or numbers"}
                  </p>
                </Field>
                <Button
                  id="joinFriendRoom"
                  size="lg"
                  className="w-full"
                  onClick={() => {
                    const v = cleanRoomCode(code);
                    if (v.length < 3) {
                      setError(v ? "Too short: codes are 3 to 12 letters or numbers" : "Enter the code your friend sent");
                      return;
                    }
                    go(roomPath(v));
                  }}
                  disabled={opening}
                >
                  {opening ? "Joining…" : "Join the room"}
                </Button>
              </>
            )}
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
          onClick={() => go("/")}
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
  /** The rules picked for this game (games with variations). */
  vars: Variations;
  onStart: () => void;
}) {
  const withVars = hasVariations(game);
  const saved = profile.localSetup;
  const count = counts.includes(saved.count) ? saved.count : counts[counts.length - 1];
  // Pachisi, Chaupar, two colors each: two players each play a side (the colour picked and the one opposite).
  const pairs = hasSides(game) && !playsSolo(vars);
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
            // Partners (Pachisi, Chaupar), two players: the other player's partner colour is theirs too.
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
