"use client";

// Settings and How to play load when they're first opened, not with every page:
// they're a good share of the app's code, and a slow phone had to load and set
// all of it up before the page answered a single tap. Once the page is idle they
// load quietly in the background, so opening them is still instant.
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useUi } from "@/lib/ui-store";

const loadSettings = () => import("@/components/settings/settings-dialog");
const loadTutorial = () => import("@/components/tutorial/tutorial");
const SettingsDialog = dynamic(() => loadSettings().then((m) => m.SettingsDialog), { ssr: false });
const TutorialDialog = dynamic(() => loadTutorial().then((m) => m.TutorialDialog), { ssr: false });

export function LazyDialogs() {
  const ui = useUi();
  const [settings, setSettings] = useState(false);
  const [tutorial, setTutorial] = useState(false);
  useEffect(() => {
    if (ui.settingsOpen) setSettings(true);
  }, [ui.settingsOpen]);
  useEffect(() => {
    if (ui.tutorial) setTutorial(true);
  }, [ui.tutorial]);
  // Fetch them well after the page has settled, so they never compete with a page the
  // player asked for. On a slow or data-saving connection: only when opened.
  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (conn?.saveData || /(^|-)2g|3g/.test(conn?.effectiveType || "")) return;
    const idle = (cb: () => void) => (typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(cb, { timeout: 8000 }) : window.setTimeout(cb, 2000));
    const t = window.setTimeout(() => idle(() => void Promise.all([loadSettings(), loadTutorial()]).catch(() => {})), 10000);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <>
      {settings && <SettingsDialog />}
      {tutorial && <TutorialDialog />}
    </>
  );
}
