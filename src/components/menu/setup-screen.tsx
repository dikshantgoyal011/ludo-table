"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
} from "@/lib/game/constants";
import type { Color, Mode } from "@/lib/game/types";
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
      maxLength={16}
      placeholder="Your name"
      autoComplete="nickname"
      aria-label="Your name"
      value={profile.nick}
      onChange={(e) => save({ nick: e.target.value })}
    />
  );
}

/** Make sure no two pass-and-play players share a colour. */
function fixLocalColors(setup: Profile["localSetup"]): Profile["localSetup"] {
  const rows = setup.rows.map((r) => ({ ...r }));
  const used = new Set<Color>();
  for (let k = 0; k < setup.count; k++) {
    const r = rows[k];
    if (used.has(r.color)) r.color = COLORS.find((c) => !used.has(c)) as Color;
    used.add(r.color);
  }
  return { ...setup, rows };
}

export function SetupScreen({ mode }: { mode: Mode }) {
  const router = useRouter();
  const mounted = useMounted();
  const [profile, save] = useProfile();
  const [error, setError] = useState("");
  const [code, setCode] = useState("");

  // Opening a setup screen leaves any table that was running.
  useEffect(() => {
    getController().exitToMenu();
  }, []);

  const go = (path: string) => router.push(path);
  // The same game strip, in the same place, as on the home page: switch game in one tap.
  const strip = (
    <GameStrip
      selected="ludo"
      onSelect={(id) => {
        rememberGame(id);
        if (id !== "ludo") go(`/?game=${id}`);
      }}
    />
  );

  if (!mounted)
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 py-1">
        {strip}
        <Card className="mx-auto min-h-[420px] w-full max-w-xl" />
      </div>
    );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 py-1">
      {strip}
      <Card className="mx-auto w-full max-w-xl">
        <nav
          aria-label="How to play"
          className="grid grid-cols-4 gap-1 rounded-xl bg-background/50 p-1"
        >
          {MODE_ORDER.map((m) => (
            <Link
              key={m}
              href={`/play/${m}`}
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
          <CardTitle>Ludo · {MODES[mode].title}</CardTitle>
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
                value={profile.onlineCount}
                onChange={(onlineCount) => save({ onlineCount })}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                You&apos;ll only be matched with people who also picked a{" "}
                {profile.onlineCount}-player game.
              </p>
            </Field>
            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                getController().startOnline(profile.onlineCount);
                go("/game");
              }}
            >
              Find a {profile.onlineCount}-player game
            </Button>
            <p className="text-xs text-muted-foreground">
              The game starts as soon as the table is full. You have 15 seconds a turn; miss 5 turns and you&apos;re out.
              If someone goes offline, the computer plays for them until they&apos;re back.
            </p>
          </>
        )}

        {mode === "friends" && (
          <>
            <Button
              size="lg"
              className="w-full"
              onClick={() => go(`/r/${newRoomCode()}`)}
            >
              Create a room
            </Button>
            <div className="text-center text-xs tracking-widest text-muted-foreground uppercase">
              or
            </div>
            <div className="flex gap-2">
              <Input
                className="font-mono"
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
                  go(`/r/${v}`);
                }}
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
                value={profile.cpuCount}
                onChange={(cpuCount) => save({ cpuCount })}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                You plus {profile.cpuCount - 1} computer player
                {profile.cpuCount > 2 ? "s" : ""}.
              </p>
            </Field>
            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                getController().startComputer(profile.cpuCount);
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
            onStart={() => go("/game")}
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
  );
}

function LocalSetup({
  profile,
  save,
  onStart,
}: {
  profile: Profile;
  save: (p: Partial<Profile>) => void;
  onStart: () => void;
}) {
  const setup = profile.localSetup;
  const update = (next: Profile["localSetup"]) => save({ localSetup: next });
  return (
    <>
      <div className="flex flex-col gap-4">
        <Field label="Players">
          <CountPicker
            value={setup.count}
            onChange={(count) => update(fixLocalColors({ ...setup, count }))}
          />
        </Field>
        {setup.rows.slice(0, setup.count).map((row, k) => {
          const taken = setup.rows
            .slice(0, setup.count)
            .filter((_, j) => j !== k)
            .map((r) => r.color);
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
                maxLength={16}
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
          const fixed = fixLocalColors(setup);
          update(fixed);
          getController().startLocal(fixed.rows.slice(0, fixed.count));
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
