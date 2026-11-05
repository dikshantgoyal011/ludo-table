"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { RoomScreen } from "@/components/game/room-screen";

/**
 * A friends room opened from inside the app (/room?c=code). The same room as the
 * invite link /r/code, but this page is built ahead of time, so opening it is
 * instant: /r/code is made by the server on each visit, which could leave
 * "Create a room" waiting a few seconds with nothing to show for it.
 */
function Room() {
  const code = useSearchParams().get("c") || "";
  return <RoomScreen code={code} />;
}

export default function RoomPage() {
  return (
    <div className="app-scroll">
      <Suspense>
        <Room />
      </Suspense>
    </div>
  );
}
