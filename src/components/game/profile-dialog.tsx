"use client";

import { Bot, Mic, MicOff, Pencil, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useGame } from "@/hooks/use-game";
import { defaultAvatar } from "@/lib/avatars";
import { countryName, flagUrl } from "@/lib/country";
import { FINISH, MAX_MISSES, NAMES } from "@/lib/game/constants";
import { uiStore, useUi } from "@/lib/ui-store";
import { Avatar } from "./avatar";
import { useBoardStyle } from "./board";

const ORDINAL = ["1st", "2nd", "3rd", "4th"];

/** A player's profile, opened from their name on the name tags. */
export function ProfileDialog() {
  const game = useGame();
  const { profileOf: c } = useUi();
  const [, th] = useBoardStyle();
  const seat = c ? game.state.seats[c] : undefined;
  const close = () => uiStore.set({ profileOf: null });
  if (!c || !seat) return null;

  const s = game.state;
  const you = game.isYou(c);
  const looks = you ? game.myLooks() : seat;
  const cc = looks.cc;
  const bot = !!seat.bot && !seat.takeover;
  const hex = th.pieces[game.displayColor(c)];
  const home = s.tokens[c].filter((p) => p === FINISH).length;
  const place = s.winners.indexOf(c);
  const inVoice = !you && !seat.bot && game.voice.on && game.inVoice(seat.id);

  const facts: [string, React.ReactNode][] = [
    ["Colour", <span key="c" className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ background: hex }} />{NAMES[game.displayColor(c)]}</span>],
    ["Tokens home", `${home} of 4`],
  ];
  if (place >= 0) facts.push(["Finished", ORDINAL[place]]);
  if (seat.out) facts.push(["Status", seat.left ? "Left the game" : `Out after missing ${MAX_MISSES} turns`]);
  else if (s.phase === "playing" && game.awayInfo(seat).away) facts.push(["Status", "Offline right now"]);
  if (game.mode === "online" && (seat.misses || 0) > 0 && !seat.out) facts.push(["Turns missed", `${seat.misses} of ${MAX_MISSES}`]);
  if (seat.takeover) facts.push(["Playing", "The computer is playing for them"]);

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent variant="center" className="items-center gap-3 p-6 text-center">
        <div className="rounded-full p-1" style={{ background: `color-mix(in srgb, ${hex} 35%, transparent)` }}>
          <Avatar av={bot ? "bot" : (looks.av ?? defaultAvatar(seat.id))} size={88} ring={hex} />
        </div>
        <DialogTitle className="max-w-full text-2xl leading-tight font-extrabold break-words">{seat.nick}</DialogTitle>
        <DialogDescription asChild>
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm font-semibold text-muted-foreground">
            {cc && (
              <span className="flex items-center gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={flagUrl(cc)} alt="" width={24} height={16} className="h-4 w-6 rounded-[3px] shadow-[0_0_0_1px_rgba(0,0,0,.25)]" />
                {countryName(cc)}
              </span>
            )}
            {bot && (
              <span className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-foreground">
                <Bot className="size-3.5" /> Computer player
              </span>
            )}
            {you && <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-bold text-foreground">You</span>}
          </div>
        </DialogDescription>

        <dl className="mt-1 grid w-full grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl bg-background/60 px-4 py-3 text-left text-sm">
          {facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="flex justify-end text-right font-bold">{v}</dd>
            </div>
          ))}
        </dl>

        {inVoice && (
          <div className="flex w-full items-center justify-between gap-2 rounded-xl bg-background/60 px-4 py-2 text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              {game.micOffFor(seat.id) ? <MicOff className="size-4" /> : <Mic className="size-4 text-[#4ade80]" />}
              {game.micOffFor(seat.id) ? "Mic off" : "Mic on"}
            </span>
            <Button size="sm" variant={game.hears(seat.id) ? "outline" : "default"} onClick={() => game.toggleHear(seat.id)}>
              {game.hears(seat.id) ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              {game.hears(seat.id) ? "Stop hearing" : "Hear them"}
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground">Games played and wins will show here once player accounts arrive.</p>

        <div className="mt-1 flex w-full flex-col gap-2">
          {you && (
            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                close();
                uiStore.set({ settingsOpen: true });
              }}
            >
              <Pencil className="size-4" /> Edit my picture and country
            </Button>
          )}
          <Button size="lg" onClick={close}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
