"use client";

// Before an online or friends game: everyone gathers here, and the board only
// shows once the game has begun. Friends rooms: everyone marks themselves ready
// (and, in Pachisi and Parchís, agrees to the rules) before the creator can start.
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Crown, MessageCircle, Mic, MicOff, UserPlus, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGame, useProfile, useSettings } from "@/hooks/use-game";
import { defaultAvatar } from "@/lib/avatars";
import { countryName, flagUrl } from "@/lib/country";
import { COLORS, NICK_MAX } from "@/lib/game/constants";
import { cleanVariations, playsInPairs } from "@/lib/game/pachisi/variations";
import { cleanParchisVariations, parchisPairs } from "@/lib/game/parchis/variations";
import { countOn, hasVariations, noVariations, plainRules } from "@/lib/game/variations";
import type { Player } from "@/lib/game/types";
import { variantById } from "@/lib/game/variants";
import { themeOf } from "@/lib/theme/themes";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { InviteDialog } from "./invite-dialog";
import { ColorPicker } from "./pickers";
import { SavePreferences, SidesPicker, VariationsList } from "./variations";

const list = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** The lobby's cards: one look for all of them. */
function Panel({ title, aside, children, className }: { title?: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3 rounded-2xl border border-border bg-card p-4", className)}>
      {(title || aside) && (
        <div className={cn("flex items-center justify-between gap-2", aside && "min-h-8")}>
          {title && <h3 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">{title}</h3>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function LobbyScreen() {
  const game = useGame();
  const s = game.state;

  if (!game.loaded)
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-10 text-center">
        <div className="lobby-spinner" aria-hidden="true" />
        <div className="text-lg font-bold">{game.searching ? `Looking for a ${game.wantCount}-player ${variantById(game.wantGame).name} table…` : "Connecting to the room…"}</div>
        <div className="text-sm text-muted-foreground">{game.net.text}</div>
      </div>
    );

  // Pachisi, Parchís: the rules (variations) get a card of their own.
  const rules = hasVariations(s.game);
  return (
    <div className={cn("mx-auto flex w-full flex-col gap-3", rules ? "max-w-xl lg:max-w-5xl" : "max-w-xl")}>
      {game.banner && <div className="rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-sm break-words">{game.banner}</div>}
      <div className={cn("grid grid-cols-1 gap-3", rules && "lg:grid-cols-2 lg:items-start")}>
        <div className="flex min-w-0 flex-col gap-3">
          {game.mode === "friends" ? <RoomCard /> : <TableCard />}
          <PlayersCard />
          <YouCard />
        </div>
        {rules && <RulesCard />}
      </div>
      <ActionBar />
    </div>
  );
}

/** Small "Live" line: how this device is connected. */
function NetLine() {
  const game = useGame();
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("h-2 w-2 shrink-0 rounded-full", game.net.kind === "ok" ? "bg-[#4ade80]" : game.net.kind === "bad" ? "bg-[#f87171]" : "bg-muted-foreground")} />
      <span className="truncate">{game.net.text}</span>
    </span>
  );
}

/** Friends room: which game, the room code, and how to bring friends in. */
function RoomCard() {
  const game = useGame();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  const v = variantById(game.state.game || "ludo");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(game.room || "");
      setCopied(true);
    } catch {
      setInviteOpen(true);
    }
  };
  return (
    <Panel title={`${v.name} · Friends room`} aside={<NetLine />}>
      <div className="flex flex-col items-center gap-1 rounded-xl bg-background/60 px-4 py-3">
        <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Room code</span>
        <span className="font-mono text-3xl font-bold tracking-[0.2em] select-all" aria-label="Room code">
          {game.room}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button size="lg" className="h-11" onClick={() => setInviteOpen(true)}>
          <UserPlus className="size-4" /> Invite friends
        </Button>
        <Button size="lg" variant="outline" className="h-11" onClick={() => void copy()}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Code copied" : "Copy code"}
        </Button>
      </div>
      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </Panel>
  );
}

/** Online: which table, how full it is, and when it starts. */
function TableCard() {
  const game = useGame();
  const s = game.state;
  const cap = game.capacity();
  const n = s.players.length;
  const v = variantById(s.game || "ludo");
  const more = cap - n;
  const text = !game.joined()
    ? n >= cap
      ? "This table is full."
      : "Join to take a seat."
    : more > 0
      ? `Waiting for ${more} more player${more > 1 ? "s" : ""}… Anyone who picks a ${cap}-player ${v.name} game now joins you.`
      : s.startAt
        ? `Table full! Starting in ${game.secsLeft(s.startAt)}s…`
        : "Table full! Starting…";
  return (
    <Panel title={`${v.name} · ${cap}-player online table`} aside={<NetLine />}>
      <div className="flex items-center gap-3 rounded-xl bg-background/60 px-4 py-3">
        {more > 0 && <div className="lobby-spinner shrink-0 scale-75" aria-hidden="true" />}
        <p role="status" className="text-sm leading-snug">
          {text}
        </p>
      </div>
    </Panel>
  );
}

function PlayersCard() {
  const game = useGame();
  const th = themeOf(useSettings()[0].theme);
  const s = game.state;
  const friends = game.mode === "friends";
  const pachisi = s.game === "pachisi";
  const n = s.players.length;
  const cap = friends ? 4 : game.capacity();
  const owner = friends ? game.roomOwnerId() : "";
  const vars = game.variations();
  // Pachisi (Parchís in pairs): who plays with whom, by the order people joined.
  const nick = (k: number) => s.players[k]?.nick || `Player ${k + 1}`;
  const partners = `Partners: ${nick(0)} & ${nick(2)} against ${nick(1)} & ${nick(3)}.`;
  const sides =
    s.game === "parchis"
      ? cleanParchisVariations(vars).pairs
        ? parchisPairs(cleanParchisVariations(vars), n)
          ? partners
          : "Pairs need four players: until then, everyone plays solo."
        : ""
      : !pachisi || n < 2
        ? ""
        : !playsInPairs(cleanVariations(vars), n)
          ? "Everyone plays solo."
          : n === 2
            ? `${nick(0)} plays Red & Yellow, ${nick(1)} plays Green & Blue.`
            : partners;
  return (
    <Panel title={`Players ${n}/${cap}`} aside={game.online && <VoiceRow />}>
      <ol className="flex flex-col gap-1.5" aria-label="Players">
        {s.players.map((p) => {
          const slot = COLORS.find((c) => s.seats[c]?.id === p.id);
          return (
            <PlayerRow
              key={p.id}
              p={p}
              you={p.id === game.myId}
              host={p.id === owner}
              ready={!friends || p.id === owner || !!s.ready?.includes(p.id)}
              agreed={!hasVariations(s.game) || !friends ? null : p.id === owner || !!s.agreed?.includes(p.id)}
              friends={friends}
              ring={slot ? th.pieces[game.displayColor(slot)] : "rgb(var(--c-muted))"}
            />
          );
        })}
        {Array.from({ length: Math.max(0, cap - n) }, (_, k) => (
          <li key={"open" + k} className="flex h-12 items-center gap-2.5 rounded-xl border border-dashed border-border px-3 text-sm text-muted-foreground">
            <span className="size-8 shrink-0 rounded-full border border-dashed border-foreground/25" />
            Open seat
          </li>
        ))}
      </ol>
      {sides && <p className="text-xs leading-snug text-muted-foreground">{sides}</p>}
    </Panel>
  );
}

function PlayerRow({ p, you, host, ready, agreed, friends, ring }: { p: Player; you: boolean; host: boolean; ready: boolean; agreed: boolean | null; friends: boolean; ring: string }) {
  const game = useGame();
  const cc = you ? game.myLooks().cc : p.cc;
  const av = you ? (game.myLooks().av ?? 0) : (p.av ?? defaultAvatar(p.id));
  const talking = game.isSpeaking(p.id);
  return (
    <li className={cn("flex h-12 items-center gap-2.5 rounded-xl px-3", you ? "bg-primary/12 ring-1 ring-primary/40" : "bg-background/60")}>
      <span className={cn("size-8 shrink-0 rounded-full", talking && "ring-2 ring-[#4ade80] ring-offset-1 ring-offset-transparent")}>
        <Avatar av={av} className="size-full" ring={ring} />
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="truncate text-sm font-bold">
          {p.nick}
          {you ? " (you)" : ""}
        </span>
        {cc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={flagUrl(cc)} alt={countryName(cc)} title={countryName(cc)} width={21} height={14} className="h-3.5 w-[21px] shrink-0 rounded-[3px] shadow-[0_0_0_1px_rgba(0,0,0,.25)]" />
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {host && (
          <Badge tone="gold">
            <Crown className="size-3" /> Host
          </Badge>
        )}
        {agreed !== null && !host && <Badge tone={agreed ? "green" : "grey"}>{agreed ? "Agreed" : "Reading rules"}</Badge>}
        {friends && !host && <Badge tone={ready ? "green" : "grey"}>{ready ? "Ready" : "Not ready"}</Badge>}
      </span>
    </li>
  );
}

function Badge({ tone, children }: { tone: "gold" | "green" | "grey"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-bold whitespace-nowrap",
        tone === "gold" ? "bg-[#e2b048]/25 text-[#f2c94c]" : tone === "green" ? "bg-[#16a34a]/25 text-[#4ade80]" : "bg-foreground/10 text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

/** Pachisi, Parchís: the rules everyone plays by. In a friends room the creator picks them and everyone agrees. */
function RulesCard() {
  const game = useGame();
  const s = game.state;
  const g = s.game || "ludo";
  const friends = game.mode === "friends";
  const iRun = friends && game.canRunTable();
  const vars = game.variations();
  const n = s.players.length;
  const on = countOn(g, vars);
  const iAgreed = game.haveAgreed();
  const plain = plainRules(g).toLowerCase();
  const [profile, saveProfile] = useProfile();
  const saved = hasVariations(g) && profile.saveVariations[g];
  const cap = game.capacity();
  return (
    <Panel title="Rules" aside={<span className="text-xs font-semibold text-muted-foreground">{on ? `${on} variation${on > 1 ? "s" : ""} on` : plainRules(g).split(" ")[0]}</span>}>
      {!friends ? (
        <p className="text-sm text-muted-foreground">
          Online games use the {plain}, without variations
          {g !== "pachisi" || cap === 3 ? "." : cleanVariations(vars).alone ? ", playing Solo." : cap === 2 ? ", two colors each." : ", playing 2 vs 2."}
        </p>
      ) : (
        <>
          <p className="text-sm leading-snug text-muted-foreground">
            {iRun
              ? "Choose how you play. Everyone has to agree before the game can start; any change asks everyone again."
              : `${game.roomOwnerName()} chooses how you play. Look it over, then agree.`}
          </p>
          {g === "pachisi" && <SidesPicker value={cleanVariations(vars)} players={n >= 2 ? n : 4} onChange={iRun ? (next) => game.setVariations(next) : undefined} />}
          <VariationsList game={g} value={vars} onChange={iRun ? (next) => game.setVariations(next) : undefined} />
          {iRun && hasVariations(g) && (
            <SavePreferences
              game={g}
              on={saved}
              onChange={(on) => saveProfile({ saveVariations: { ...profile.saveVariations, [g]: on }, variations: { ...profile.variations, [g]: on ? vars : noVariations(g) } })}
            />
          )}
          {game.joined() && !iRun && iAgreed && (
            <Button variant="outline" className="self-start" onClick={() => game.agree(false)}>
              <Check className="size-4" /> You agreed · take it back
            </Button>
          )}
        </>
      )}
    </Panel>
  );
}

/** My name and color (and leaving the room). */
function YouCard() {
  const game = useGame();
  const [profile, saveProfile] = useProfile();
  const renameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <Panel title="You">
      <Input
        maxLength={NICK_MAX}
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
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">Your color, only for how the board looks on your phone</span>
        <ColorPicker
          value={profile.color}
          onChange={(color) => {
            saveProfile({ color });
            game.colorChanged();
          }}
        />
      </div>
      {game.joined() && game.mode === "friends" && (
        <Button variant="outline" className="self-start" onClick={game.leave}>
          Leave the room
        </Button>
      )}
    </Panel>
  );
}

/** The one thing to do next, and what we're waiting for: always in reach at the bottom of the screen. */
function ActionBar() {
  const game = useGame();
  const s = game.state;
  const friends = game.mode === "friends";
  const rules = hasVariations(s.game);
  const joined = game.joined();
  const n = s.players.length;
  const cap = friends ? 4 : game.capacity();
  const iRun = friends && game.canRunTable();
  if (joined && !friends) return null; // online: the table starts by itself
  const wait = game.waitingFor();
  const iAmReady = game.amReady();
  const iAgreed = game.haveAgreed();
  const status = !joined
    ? ""
    : n < 2
      ? "Waiting for friends to join."
      : wait.notReady.length
        ? `Waiting for ${list(wait.notReady)} to get ready.`
        : wait.notAgreed.length
          ? `Waiting for ${list(wait.notAgreed)} to agree to the rules.`
          : iRun
            ? "Everyone's ready."
            : `Everyone's ready. ${game.roomOwnerName()} starts the game.`;
  const big = "h-12 w-full text-base";
  return (
    <div className="sticky bottom-0 z-10 flex flex-col gap-1.5 rounded-2xl border border-border bg-card/95 p-2 pb-[max(.5rem,env(safe-area-inset-bottom))] shadow-[0_-6px_18px_rgba(0,0,0,.35)] backdrop-blur">
      {!joined ? (
        <Button size="lg" className={big} disabled={n >= cap} onClick={game.join}>
          {n >= cap ? "Table is full" : "Join game"}
        </Button>
      ) : iRun ? (
        <Button size="lg" className={cn(big, "disabled:bg-foreground/10 disabled:text-muted-foreground disabled:opacity-100")} disabled={!game.canStart()} onClick={game.start}>
          Start game
        </Button>
      ) : rules && !iAgreed ? (
        <Button size="lg" className={big} onClick={() => game.agree(true)}>
          I agree to these rules
        </Button>
      ) : (
        <Button size="lg" variant={iAmReady ? "outline" : "default"} className={cn(big, iAmReady && "border-[#16a34a] text-[#4ade80]")} onClick={() => game.setReady(!iAmReady)}>
          {iAmReady ? (
            <>
              <Check className="size-5" /> Ready · tap if you&apos;re not
            </>
          ) : (
            "I'm ready"
          )}
        </Button>
      )}
      {status && (
        <p role="status" className="px-2 text-center text-xs leading-snug text-muted-foreground">
          {status}
        </p>
      )}
    </div>
  );
}

/** Voice chat and chat, here too: friends can talk while they wait. */
function VoiceRow() {
  const game = useGame();
  const mic = game.voice.micOn;
  const spk = game.speakerOn();
  const btn = "relative flex size-8 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95";
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className={cn(btn, mic ? "bg-[#16a34a] text-white" : "bg-background/70 text-muted-foreground")} aria-pressed={mic} aria-label={mic ? "Turn my microphone off" : "Turn my microphone on"} onClick={() => void game.toggleMic()}>
        {mic ? <Mic className="size-4" /> : <MicOff className="size-4" />}
      </button>
      <button type="button" className={cn(btn, spk ? "bg-[#16a34a] text-white" : "bg-background/70 text-muted-foreground")} aria-pressed={spk} aria-label={spk ? "Turn my speaker off" : "Turn my speaker on"} onClick={() => game.toggleSpeaker()}>
        {spk ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
      </button>
      <button type="button" className={cn(btn, "bg-background/70 text-foreground")} aria-label="Open chat" onClick={() => game.openChat()}>
        <MessageCircle className="size-4" />
        {game.unread > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[18px] rounded-full bg-[#e5484d] px-1 text-center text-[11px] leading-[18px] font-bold text-white">{game.unread > 9 ? "9+" : game.unread}</span>}
      </button>
    </div>
  );
}
