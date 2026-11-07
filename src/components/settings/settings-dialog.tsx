"use client";

// Settings: a short main page of grouped rows (profile, look, play), each detailed
// choice on a page of its own. Board designs sit behind one "Boards" row (a list
// of games, each opening its own page of designs), so Settings stays short and
// quick to open however many games there are.
import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Avatar } from "@/components/game/avatar";
import { BoardPreview } from "@/components/game/ludo-board";
import { PachisiBoardPreview } from "@/components/menu/game-preview";
import { ParchisBoardPreview } from "@/components/game/parchis-board";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { getController, useGame, useProfile, useSettings } from "@/hooks/use-game";
import { playSound } from "@/lib/audio/sfx";
import { AVATAR_COUNT, defaultAvatar } from "@/lib/avatars";
import { countriesByName, countryName, detectCountry, flagUrl } from "@/lib/country";
import { COLORS, NICK_MAX } from "@/lib/game/constants";
import type { GameId } from "@/lib/game/types";
import type { Settings } from "@/lib/settings/settings";
import { BOARD_STYLE_IDS, BOARD_STYLES, PACHISI_STYLE_IDS, PACHISI_STYLES, PARCHIS_STYLE_IDS, PARCHIS_STYLES } from "@/lib/theme/boards";
import { THEME_IDS, THEMES, themeOf, type Theme } from "@/lib/theme/themes";
import { uiStore, useUi } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

/**
 * Each game's board designs. A new game adds one entry here (one row on the
 * Boards page, and its own page of designs).
 */
interface BoardChoices {
  game: GameId;
  title: string;
  /** The choices, "auto" (match the theme) first. */
  ids: string[];
  current: (s: Settings) => string;
  pick: (s: Settings, id: string) => Settings;
  /** The design "auto" stands for with this theme. */
  auto: (th: Theme) => string;
  name: (id: string) => string;
  hint: (id: string) => string;
  preview: (id: string, th: Theme) => React.ReactNode;
}
const BOARDS: BoardChoices[] = [
  {
    game: "ludo",
    title: "Ludo board",
    ids: ["auto", ...BOARD_STYLE_IDS],
    current: (s) => s.board,
    pick: (s, id) => ({ ...s, board: id as Settings["board"] }),
    auto: (th) => th.boardStyle,
    name: (id) => BOARD_STYLES[id as keyof typeof BOARD_STYLES]?.name || id,
    hint: (id) => BOARD_STYLES[id as keyof typeof BOARD_STYLES]?.hint || "",
    preview: (id, th) => <BoardPreview style={id as keyof typeof BOARD_STYLES} th={th} />,
  },
  {
    game: "pachisi",
    title: "Pachisi board",
    ids: ["auto", ...PACHISI_STYLE_IDS],
    current: (s) => s.pachisiBoard,
    pick: (s, id) => ({ ...s, pachisiBoard: id as Settings["pachisiBoard"] }),
    auto: (th) => th.pachisiStyle,
    name: (id) => PACHISI_STYLES[id as keyof typeof PACHISI_STYLES]?.name || id,
    hint: (id) => PACHISI_STYLES[id as keyof typeof PACHISI_STYLES]?.hint || "",
    preview: (id, th) => <PachisiBoardPreview style={id as keyof typeof PACHISI_STYLES} className="rounded-lg p-1" />,
  },
  {
    game: "parchis",
    title: "Parchís board",
    ids: ["auto", ...PARCHIS_STYLE_IDS],
    current: (s) => s.parchisBoard,
    pick: (s, id) => ({ ...s, parchisBoard: id as Settings["parchisBoard"] }),
    auto: (th) => th.parchisStyle,
    name: (id) => PARCHIS_STYLES[id as keyof typeof PARCHIS_STYLES]?.name || id,
    hint: (id) => PARCHIS_STYLES[id as keyof typeof PARCHIS_STYLES]?.hint || "",
    preview: (id) => <ParchisBoardPreview style={id as keyof typeof PARCHIS_STYLES} className="rounded-lg p-1" />,
  },
];

type Page = { kind: "main" } | { kind: "you" } | { kind: "theme" } | { kind: "boards" } | { kind: "board"; game: GameId };

/** A group of rows on the main page. */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="px-1 text-xs font-semibold tracking-widest text-muted-foreground uppercase">{title}</h3>
      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-background/50">{children}</div>
    </section>
  );
}

/** One row: a label, what it's set to, and a way in (or a control). */
function Row({ label, value, onClick, children, lead }: { label: string; value?: React.ReactNode; onClick?: () => void; children?: React.ReactNode; lead?: React.ReactNode }) {
  const inner = (
    <>
      {lead}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{label}</span>
        {value && <span className="block truncate text-xs text-muted-foreground">{value}</span>}
      </span>
      {children}
      {onClick && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="settings-row flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left outline-none focus-visible:bg-foreground/10 active:bg-foreground/10">
      {inner}
    </button>
  ) : (
    <div className="flex min-h-14 w-full items-center gap-3 px-3 py-2">{inner}</div>
  );
}

/**
 * A choice card. The tick sits in the corner and is always there (just hidden
 * when not chosen), and labels stay on one line, so choosing something never
 * changes the size of anything.
 */
function Choice({ on, onClick, className, style, children }: { on: boolean; onClick: () => void; className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "hover-lift relative min-w-0 rounded-xl border-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
        on ? "border-primary" : "border-transparent",
        className,
      )}
      style={style}
    >
      {children}
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1.5 right-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow transition-opacity",
          on ? "opacity-100" : "opacity-0",
        )}
      >
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    </button>
  );
}

/** Theme colours as four dots. */
function Swatch({ th }: { th: Theme }) {
  return (
    <span className="flex shrink-0 gap-1">
      {COLORS.map((c) => (
        <span key={c} className="h-3.5 w-3.5 rounded-full ring-1 ring-black/15" style={{ background: th.pieces[c] }} />
      ))}
    </span>
  );
}

/** My picture, name and country, as the other players see them. */
function YouPage() {
  const [profile, saveProfile] = useProfile();
  const game = getController();
  const mine = profile.avatar >= 0 ? profile.avatar : defaultAvatar(game.myId);
  const country = profile.country || detectCountry();
  const [list] = useState(countriesByName);
  // Already waiting at a table: show the others the change (debounced while typing).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changed = (ms = 0) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => game.renameInLobby(), ms);
  };
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="px-1 text-xs font-semibold tracking-widest text-muted-foreground uppercase">Name</span>
        <Input
          maxLength={NICK_MAX}
          placeholder="Your name"
          autoComplete="nickname"
          value={profile.nick}
          onChange={(e) => {
            saveProfile({ nick: e.target.value });
            changed(600);
          }}
        />
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="px-1 text-xs font-semibold tracking-widest text-muted-foreground uppercase">Picture</span>
        <div className="grid grid-cols-6 gap-1.5">
          {Array.from({ length: AVATAR_COUNT }, (_, k) => (
            <button
              key={k}
              type="button"
              aria-pressed={mine === k}
              aria-label={`Picture ${k + 1}`}
              onClick={() => {
                saveProfile({ avatar: k });
                changed();
              }}
              className={cn("aspect-square rounded-full p-0.5 outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring active:scale-95", mine === k ? "bg-primary" : "bg-transparent")}
            >
              <Avatar av={k} className="size-full" />
            </button>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="px-1 text-xs font-semibold tracking-widest text-muted-foreground uppercase">Country</span>
        <span className="flex items-center gap-2.5">
          {country ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={flagUrl(country)} alt="" width={27} height={18} className="h-[18px] w-[27px] shrink-0 rounded-[3px] shadow-[0_0_0_1px_rgba(0,0,0,.25)]" />
          ) : (
            <span className="h-[18px] w-[27px] shrink-0 rounded-[3px] border border-dashed border-foreground/30" />
          )}
          <select
            value={country}
            onChange={(e) => {
              saveProfile({ country: e.target.value });
              changed();
            }}
            className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-secondary px-2 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">No country</option>
            {list.map((c) => (
              <option key={c.cc} value={c.cc}>
                {c.name}
              </option>
            ))}
          </select>
        </span>
      </label>
    </div>
  );
}

function ThemePage() {
  const [settings, save] = useSettings();
  return (
    <div className="grid grid-cols-2 gap-2">
      {THEME_IDS.map((key) => {
        const th = THEMES[key];
        return (
          <Choice
            key={key}
            on={settings.theme === key}
            onClick={() => save({ ...settings, theme: key })}
            className="flex flex-col items-start gap-2 p-2.5 pr-7 text-sm font-bold"
            style={{ background: th.bg, color: `rgb(${th.vars.ink})` }}
          >
            <Swatch th={th} />
            <span className="block w-full truncate">{th.name}</span>
          </Choice>
        );
      })}
    </div>
  );
}

/** One game's board designs, with pictures (drawn only here). */
function BoardPage({ b }: { b: BoardChoices }) {
  const [settings, save] = useSettings();
  const th = themeOf(settings.theme);
  // Draw the pictures a moment after the page opens, so opening it is instant.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-3">
      {b.ids.map((key) => {
        const style = key === "auto" ? b.auto(th) : key;
        return (
          <Choice key={key} on={b.current(settings) === key} onClick={() => save(b.pick(settings, key))} className="flex flex-col items-stretch gap-1.5 bg-secondary p-2">
            <span className="block aspect-square w-full">{ready ? b.preview(style, th) : <span className="block size-full rounded-lg bg-foreground/5" />}</span>
            <span className="truncate text-xs leading-tight font-bold">{key === "auto" ? "Match theme" : b.name(key)}</span>
            <span className="truncate text-[11px] leading-tight text-muted-foreground">{key === "auto" ? b.name(style) : b.hint(key)}</span>
          </Choice>
        );
      })}
    </div>
  );
}

/** What a game's board is set to, in words. */
function boardValue(b: BoardChoices, settings: Settings, th: Theme) {
  const cur = b.current(settings);
  return cur === "auto" ? `Match theme · ${b.name(b.auto(th))}` : b.name(cur);
}

/** Every game's board, one row each (the game being played first); a row opens its designs. */
function BoardsPage({ go }: { go: (p: Page) => void }) {
  const [settings] = useSettings();
  const game = useGame();
  const th = themeOf(settings.theme);
  const playing = game.mode ? game.state.game || "ludo" : null;
  const boards = [...BOARDS].sort((a, b) => (a.game === playing ? -1 : b.game === playing ? 1 : 0));
  return (
    <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-background/50">
      {boards.map((b) => (
        <Row
          key={b.game}
          label={b.title.replace(/ board$/, "")}
          value={boardValue(b, settings, th)}
          onClick={() => go({ kind: "board", game: b.game })}
          lead={
            <span className="size-10 shrink-0 overflow-hidden rounded-lg bg-secondary p-0.5">
              {b.preview(b.current(settings) === "auto" ? b.auto(th) : b.current(settings), th)}
            </span>
          }
        />
      ))}
    </div>
  );
}

function MainPage({ go }: { go: (p: Page) => void }) {
  const [settings, save] = useSettings();
  const [profile] = useProfile();
  const game = useGame();
  const th = themeOf(settings.theme);
  const av = profile.avatar >= 0 ? profile.avatar : defaultAvatar(game.myId);
  const cc = profile.country || detectCountry();
  // In a game, that game's board is named first.
  const playing = game.mode ? game.state.game || "ludo" : null;
  const boards = [...BOARDS].sort((a, b) => (a.game === playing ? -1 : b.game === playing ? 1 : 0));
  return (
    <div className="flex flex-col gap-4">
      <Group title="Profile">
        <Row
          label={profile.nick.trim() || "Your name"}
          value={cc ? countryName(cc) : "Picture, name and country"}
          onClick={() => go({ kind: "you" })}
          lead={
            <span className="size-10 shrink-0">
              <Avatar av={av} className="size-full" />
            </span>
          }
        />
      </Group>
      <Group title="Look">
        <Row label="Theme" value={th.name} onClick={() => go({ kind: "theme" })}>
          <Swatch th={th} />
        </Row>
        <Row
          label="Boards"
          value={boards.map((b) => `${b.title.replace(/ board$/, "")}: ${boardValue(b, settings, th).replace(/^Match theme · /, "")}`).join(" · ")}
          onClick={() => go({ kind: "boards" })}
        />
      </Group>
      <Group title="Play">
        <Row label="Token movement" value={settings.steps ? "Hops square by square" : "Slides straight to the square"}>
          <div className="grid shrink-0 grid-cols-2 gap-0.5 rounded-lg bg-background/70 p-0.5" role="radiogroup" aria-label="Token movement">
            {(
              [
                [true, "Steps"],
                [false, "Glide"],
              ] as const
            ).map(([val, label]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={settings.steps === val}
                onClick={() => save({ ...settings, steps: val })}
                className={cn("h-8 rounded-md px-3 text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring", settings.steps === val ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground")}
              >
                {label}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Game sounds" value={settings.sound.all ? "On" : "Off"}>
          <Switch
            aria-label="Game sounds"
            checked={settings.sound.all}
            onCheckedChange={(v) => {
              save({ ...settings, sound: { ...settings.sound, all: v } });
              if (v) playSound("dice");
            }}
          />
        </Row>
      </Group>
    </div>
  );
}

export function SettingsDialog() {
  const { settingsOpen } = useUi();
  const [page, setPage] = useState<Page>({ kind: "main" });
  // Opening Settings always starts at the main page.
  useEffect(() => {
    if (settingsOpen) setPage({ kind: "main" });
  }, [settingsOpen]);
  const board = page.kind === "board" ? BOARDS.find((b) => b.game === page.game) : undefined;
  const title = page.kind === "you" ? "Profile" : page.kind === "theme" ? "Theme" : page.kind === "boards" ? "Boards" : board ? board.title : "Settings";
  // Back: from a game's designs to the list of boards, otherwise to the main page.
  const back = () => setPage(page.kind === "board" ? { kind: "boards" } : { kind: "main" });
  const scroller = useRef<HTMLDivElement>(null);
  // (In braces: newer browsers return a Promise from scrollTo, and React takes a returned value for a cleanup function.)
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [page]);

  return (
    <Dialog open={settingsOpen} onOpenChange={(o) => uiStore.set({ settingsOpen: o })}>
      <DialogContent className="max-h-[88vh]">
        <div className="flex items-center gap-2 border-b border-border px-3 py-3">
          {page.kind !== "main" ? (
            <Button variant="ghost" size="sm" className="-ml-1 gap-0.5 px-2" onClick={back}>
              <ChevronLeft className="size-4" /> Back
            </Button>
          ) : (
            <span className="w-1" />
          )}
          <DialogTitle className="min-w-0 flex-1 truncate">{title}</DialogTitle>
          <DialogDescription className="sr-only">Profile, theme, boards, token movement and sounds</DialogDescription>
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              Done
            </Button>
          </DialogClose>
        </div>
        <div ref={scroller} className="overflow-y-auto overscroll-contain px-4 py-4">
          {page.kind === "main" && <MainPage go={setPage} />}
          {page.kind === "you" && <YouPage />}
          {page.kind === "theme" && <ThemePage />}
          {page.kind === "boards" && <BoardsPage go={setPage} />}
          {board && <BoardPage b={board} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
