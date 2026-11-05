import { Suspense } from "react";
import { notFound } from "next/navigation";
import { SetupScreen, SetupSkeleton } from "@/components/menu/setup-screen";
import { isMode, MODE_ORDER } from "@/lib/game/constants";

export function generateStaticParams() {
  return MODE_ORDER.map((mode) => ({ mode }));
}

export default async function SetupPage({ params }: { params: Promise<{ mode: string }> }) {
  const { mode } = await params;
  if (!isMode(mode)) notFound();
  // (The screen reads ?game= from the address: on a fresh load it's drawn once that's known.)
  return (
    <Suspense fallback={<SetupSkeleton />}>
      <SetupScreen mode={mode} />
    </Suspense>
  );
}
