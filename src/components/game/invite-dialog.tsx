"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Link2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useGame } from "@/hooks/use-game";

/** Invite friends to a friends room: copy the code, copy the link, or share it. */
export function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const game = useGame();
  const [copied, setCopied] = useState<"" | "code" | "link">("");
  const [canShare, setCanShare] = useState(false);
  const code = game.room || "";
  const link = game.inviteLink();

  useEffect(() => setCanShare(typeof navigator !== "undefined" && !!navigator.share), []);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(""), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async (what: "code" | "link") => {
    const text = what === "code" ? code : link;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      game.setBanner(what === "code" ? `Room code: ${code}` : `Send this link to your friends: ${link}`);
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: "Ludo Darbar", text: `Join my Ludo room ${code}`, url: link });
    } catch {
      /* closed without sharing */
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent variant="center" className="items-center gap-3 p-6 text-center">
        <DialogTitle className="text-2xl leading-tight font-extrabold">Invite friends</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          Friends can open the link, or type the code in <b>Play with friends → Join</b>.
        </DialogDescription>

        <div className="flex w-full flex-col items-center gap-1 rounded-xl bg-background/60 px-4 py-3">
          <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Room code</span>
          <span className="font-mono text-3xl font-bold tracking-[0.2em] select-all">{code}</span>
        </div>

        <div className="flex w-full flex-col gap-2">
          <Button size="lg" onClick={() => void copy("code")}>
            {copied === "code" ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied === "code" ? "Code copied" : "Copy code"}
          </Button>
          <Button size="lg" variant="outline" onClick={() => void copy("link")}>
            {copied === "link" ? <Check className="size-4" /> : <Link2 className="size-4" />}
            {copied === "link" ? "Link copied" : "Copy invite link"}
          </Button>
          {canShare && (
            <Button size="lg" variant="outline" onClick={() => void share()}>
              <Share2 className="size-4" /> Share…
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
