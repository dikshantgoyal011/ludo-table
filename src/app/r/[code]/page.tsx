import { Suspense } from "react";
import { RoomScreen } from "@/components/game/room-screen";

/** A private friends room. Invite links point here. */
export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <div className="app-scroll">
      <Suspense>
        <RoomScreen code={code} />
      </Suspense>
    </div>
  );
}
