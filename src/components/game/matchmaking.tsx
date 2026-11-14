"use client";

// Online, before the game: looking for players. A radar sweeps round my picture
// and flags light up where it looks; the seats fill in as players sit down, and
// a line underneath changes every few seconds (where it's looking, a tip for the game).
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useGame, useSettings } from "@/hooks/use-game";
import { defaultAvatar } from "@/lib/avatars";
import { countryName, flagUrl } from "@/lib/country";
import { COLORS } from "@/lib/game/constants";
import { PLACES } from "@/lib/game/personas";
import { variantById } from "@/lib/game/variants";
import { themeOf } from "@/lib/theme/themes";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";

interface Blip {
  id: number;
  cc: string;
  x: number;
  y: number;
}

const BLIP_EVERY_MS = 650;
const BLIP_LIFE_MS = 2600;
const TIP_EVERY_MS = 6000;

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function Matchmaking() {
  const game = useGame();
  const router = useRouter();
  const th = themeOf(useSettings()[0].theme);
  const s = game.state;
  const v = variantById(game.loaded ? s.game || "ludo" : game.wantGame);
  const cap = game.loaded ? game.capacity() : game.wantCount;
  const me = game.myLooks();
  const others = game.loaded ? s.players.filter((p) => p.id !== game.myId) : [];
  const joined = game.loaded && game.joined();
  const n = others.length + 1;
  const full = joined && n >= cap;

  // A second's tick: the time spent looking, and the countdown once the table is full.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Flags lighting up round the radar while it looks.
  const [blips, setBlips] = useState<Blip[]>([]);
  const nextId = useRef(0);
  useEffect(() => {
    if (full) return setBlips([]);
    const t = setInterval(() => {
      const a = Math.random() * Math.PI * 2;
      const r = 26 + Math.random() * 16;
      const b = { id: nextId.current++, cc: PLACES[Math.floor(Math.random() * PLACES.length)], x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a) };
      setBlips((all) => [...all.filter((x) => x.id > b.id - Math.ceil(BLIP_LIFE_MS / BLIP_EVERY_MS)), b]);
    }, BLIP_EVERY_MS);
    return () => clearInterval(t);
  }, [full]);

  // The line under the heading: where it's looking, and tips for the game, in turn.
  const tips = useMemo(
    () => [
      ...v.points.map((p) => `Tip: ${p}.`),
      `Checking open ${v.name} tables`,
      "Looking for players worldwide",
    ],
    [v],
  );
  const [tip, setTip] = useState(0);
  // Every other line is a place it's looking in: picked as the line comes up, and kept until the next one.
  const [place, setPlace] = useState(() => PLACES[Math.floor(Math.random() * PLACES.length)]);
  useEffect(() => {
    if (full) return;
    const t = setInterval(() => {
      setTip((k) => k + 1);
      setPlace(PLACES[Math.floor(Math.random() * PLACES.length)]);
    }, TIP_EVERY_MS);
    return () => clearInterval(t);
  }, [full]);
  const placeLine = tip % 2 === 0 ? `Searching for players in ${countryName(place)}` : null;
  const line = placeLine || tips[Math.floor(tip / 2) % tips.length];

  const since = game.searchSince || now;
  const more = cap - n;
  const heading = !game.loaded || !joined ? "Finding players" : full ? "Table full!" : "Finding players";
  const sub = full
    ? s.startAt
      ? `Starting in ${game.secsLeft(s.startAt)}s…`
      : "Starting…"
    : `Waiting for ${more} more player${more > 1 ? "s" : ""} · ${cap}-player ${v.name}`;

  const slotOf = (id: string) => COLORS.find((c) => s.seats[c]?.id === id);
  const ringFor = (id: string) => {
    const c = slotOf(id);
    return c ? th.pieces[game.displayColor(c)] : "rgb(var(--c-gold))";
  };

  return (
    <section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-4 py-5 text-center" aria-live="polite">
      <div className="mm-radar">
        {!full && <div className="mm-sweep" aria-hidden="true" />}
        {blips.map((b) => (
          <span key={b.id} className="mm-blip" style={{ left: `${b.x}%`, top: `${b.y}%` }} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={flagUrl(b.cc)} alt="" width={22} height={15} />
          </span>
        ))}
        <div className="mm-me">
          {!full && <span className="mm-pulse" aria-hidden="true" />}
          {!full && <span className="mm-pulse" aria-hidden="true" />}
          <Avatar av={me.av ?? 0} className="relative size-full" ring={ringFor(game.myId)} />
        </div>
      </div>

      <div className="flex flex-col items-center gap-1">
        <h2 className="text-xl font-extrabold">
          {heading}
          {!full && <span className="mm-dots" aria-hidden="true" />}
        </h2>
        <p role="status" className="text-sm text-muted-foreground">
          {sub}
        </p>
      </div>

      <ol className="flex flex-wrap items-start justify-center gap-3" aria-label="Seats">
        <Seat label="You" av={me.av ?? 0} cc={me.cc} ring={ringFor(game.myId)} />
        {others.map((p) => (
          <Seat key={p.id} label={p.nick} av={p.av ?? defaultAvatar(p.id)} cc={p.cc} ring={ringFor(p.id)} arrived />
        ))}
        {Array.from({ length: Math.max(0, cap - n) }, (_, k) => (
          <li key={"open" + k} className="flex w-16 flex-col items-center gap-1">
            <span className="mm-seat mm-seat-open flex items-center justify-center text-lg font-bold text-primary/60">?</span>
            <span className="text-[11px] text-muted-foreground">Searching</span>
          </li>
        ))}
      </ol>

      {!full && (
        <p key={line} className="mm-tip min-h-10 max-w-xs text-sm leading-snug text-foreground/85">
          {line}
          {placeLine ? "…" : ""}
        </p>
      )}

      <div className="flex w-full items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">{full ? "Get ready!" : `Searching · ${clock(now - since)}`}</span>
        {!full && (
          <Button variant="outline" size="sm" onClick={() => router.replace("/play/online", { scroll: false })}>
            Cancel
          </Button>
        )}
      </div>
    </section>
  );
}

function Seat({ label, av, cc, ring, arrived }: { label: string; av: number; cc?: string; ring: string; arrived?: boolean }) {
  return (
    <li className={cn("flex w-16 flex-col items-center gap-1", arrived && "mm-seat-in")}>
      <span className="mm-seat">
        <Avatar av={av} className="size-full" ring={ring} />
        {cc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={flagUrl(cc)} alt={countryName(cc)} width={18} height={12} className="absolute -right-1 -bottom-0.5 h-3 w-[18px] rounded-[2px] shadow-[0_0_0_1px_rgba(0,0,0,.35)]" />
        )}
      </span>
      <span className="w-full truncate text-[11px] font-semibold">{label}</span>
    </li>
  );
}
