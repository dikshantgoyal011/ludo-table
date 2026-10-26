import { notFound } from "next/navigation";
import { SetupScreen } from "@/components/menu/setup-screen";
import { isMode, MODE_ORDER } from "@/lib/game/constants";

export function generateStaticParams() {
  return MODE_ORDER.map((mode) => ({ mode }));
}

export default async function SetupPage({ params }: { params: Promise<{ mode: string }> }) {
  const { mode } = await params;
  if (!isMode(mode)) notFound();
  return <SetupScreen mode={mode} />;
}
