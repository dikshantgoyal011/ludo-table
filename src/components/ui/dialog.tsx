"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { cn } from "@/lib/utils";

/** Dialogs that are open right now; the page behind stays still while any is. */
let openDialogs = 0;

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const { open } = props;
  // Radix's own scroll lock doesn't hold everywhere (scrolling past the end
  // of a list inside the dialog went on to scroll the page), so lock the page itself.
  React.useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    if (openDialogs++ === 0) {
      root.style.overflow = "hidden";
      root.style.overscrollBehavior = "none";
    }
    return () => {
      if (--openDialogs === 0) {
        root.style.overflow = "";
        root.style.overscrollBehavior = "";
      }
    };
  }, [open]);
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn("text-lg font-bold", className)} {...props} />;
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description data-slot="dialog-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

const DialogClose = DialogPrimitive.Close;

/**
 * variant "sheet": slides up from the bottom on phones, centred on bigger screens.
 * variant "center": always centred.
 */
function DialogContent({
  className,
  children,
  variant = "sheet",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { variant?: "sheet" | "center" }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-slot="dialog-overlay"
        className={cn(
          "fixed inset-0 z-40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          variant === "center" ? "bg-black/60" : "bg-black/50",
        )}
      />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed z-40 flex w-full flex-col overscroll-contain border border-border bg-card text-card-foreground shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          variant === "sheet"
            ? "inset-x-0 bottom-0 mx-auto max-w-md rounded-t-2xl pb-[env(safe-area-inset-bottom)] data-[state=open]:slide-in-from-bottom-8 sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:zoom-in-95"
            : "left-1/2 top-1/2 max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl sm:max-w-sm data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose };
