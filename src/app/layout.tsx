import type { Metadata, Viewport } from "next";
import { AppHeader } from "@/components/layout/app-header";
import { Confetti } from "@/components/game/confetti";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { ThemeApplier } from "@/components/providers/theme-applier";
import { themeBootScript } from "@/lib/theme/boot-script";
import { THEMES } from "@/lib/theme/themes";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ludo Table",
  description: "Ludo in the browser: online, with friends, against the computer or pass-and-play. Fair dice, every number equally likely.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0f2a24",
};

const bootThemes = Object.fromEntries(
  Object.entries(THEMES).map(([id, t]) => [id, { vars: t.vars, pip: t.pip, bg: t.bg, scheme: t.scheme, meta: t.meta }]),
);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=IBM+Plex+Mono:wght@500&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: themeBootScript(bootThemes) }} />
      </head>
      <body className="min-h-full antialiased" suppressHydrationWarning>
        <ThemeApplier />
        <div className="mx-auto flex max-w-6xl flex-col gap-3 py-3 lg:gap-5 lg:py-6">
          <AppHeader />
          {children}
        </div>
        <SettingsDialog />
        <Confetti />
      </body>
    </html>
  );
}
