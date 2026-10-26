"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useGame, useSettings } from "@/hooks/use-game";
import { COLORS, QUICK_CHAT } from "@/lib/game/constants";
import { themeOf } from "@/lib/theme/themes";
import { cn } from "@/lib/utils";

/** Table chat for online and friends games. */
export function ChatDialog() {
  const game = useGame();
  const [settings] = useSettings();
  const th = themeOf(settings.theme);
  const [text, setText] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  const s = game.state;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [game.chat.length, game.chatOpen]);

  const send = (t: string) => {
    game.sendChat(t);
  };

  return (
    <Dialog open={game.chatOpen} onOpenChange={(o) => (o ? game.openChat() : game.closeChat())}>
      <DialogContent className="max-h-[80vh]">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <DialogTitle>Table chat</DialogTitle>
          <DialogDescription className="sr-only">Messages between the players at this table</DialogDescription>
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              Close
            </Button>
          </DialogClose>
        </div>
        <ul ref={listRef} className="flex min-h-[180px] flex-1 flex-col gap-2 overflow-y-auto px-4 py-3" aria-live="polite">
          {!game.chat.length && <li className="my-auto text-center text-sm text-muted-foreground">No messages yet. Say hi!</li>}
          {game.chat.map((m) => {
            const me = m.id === game.myId;
            const slot = COLORS.find((c) => s.seats[c]?.id === m.id);
            const p = s.players.find((x) => x.id === m.id);
            return (
              <li key={m.mid} className={cn("flex max-w-[85%] flex-col gap-0.5", me ? "items-end self-end" : "items-start self-start")}>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ background: slot ? th.pieces[game.displayColor(slot)] : "rgb(var(--c-muted))" }} />
                  <span>{me ? "You" : p?.nick || m.nick}</span>
                </div>
                <div className={cn("rounded-2xl px-3 py-2 text-sm break-words", me ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground")}>
                  {m.text}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex gap-2 overflow-x-auto px-3 pb-2">
          {QUICK_CHAT.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => send(q)}
              className="shrink-0 rounded-full border border-border bg-secondary px-3 py-1 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
            >
              {q}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2 border-t border-border p-3"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
            setText("");
          }}
        >
          <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder="Type a message" aria-label="Message" autoFocus />
          <Button type="submit" className="h-10 px-4">
            Send
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
