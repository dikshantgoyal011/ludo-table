import type { Metadata, Viewport } from "next";
import { Baloo_2, IBM_Plex_Mono, Rozha_One } from "next/font/google";
import { AppHeader } from "@/components/layout/app-header";
import { Confetti } from "@/components/game/confetti";
import { LazyDialogs } from "@/components/layout/lazy-dialogs";
import { ThemeApplier } from "@/components/providers/theme-applier";
import { themeBootScript } from "@/lib/theme/boot-script";
import { brandVars, THEMES } from "@/lib/theme/themes";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ludo Darbar · Every Ludo ever played",
  description: "Every Ludo ever played. Ludo, Pachisi, Parchís and Chaupar online, with friends, against the computer or pass-and-play, with Chowka Bara and more on the way.",
  applicationName: "Ludo Darbar",
  appleWebApp: { capable: true, title: "Ludo Darbar", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#3c0814",
};

// Fonts are downloaded at build time and served with the app. Loading them from
// Google at runtime blocked the whole page whenever that request was slow.
const baloo = Baloo_2({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-baloo", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: "500", variable: "--font-plex-mono", display: "swap" });
const rozha = Rozha_One({ subsets: ["latin"], weight: "400", variable: "--font-rozha", display: "swap" });

const bootThemes =Object.fromEntries(
  Object.entries(THEMES).map(([id, t]) => [id, { vars: t.vars, brand: brandVars(t.brand), pip: t.pip, bg: t.bg, scheme: t.scheme, meta: t.meta }]),
);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${baloo.variable} ${plexMono.variable} ${rozha.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript(bootThemes) }} />
      </head>
      <body className="min-h-full antialiased" suppressHydrationWarning>
        <ThemeApplier />
        <div className="page-shell">
          <div className="app-frame mx-auto flex w-full max-w-6xl flex-col gap-3 pt-3 lg:gap-4 lg:pt-4">
            <AppHeader />
            <main className="app-main">{children}</main>
          </div>
        </div>
        <LazyDialogs />
        <Confetti />
      </body>
    </html>
  );
}
