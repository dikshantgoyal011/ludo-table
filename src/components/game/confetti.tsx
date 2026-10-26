"use client";

import { useEffect, useRef } from "react";
import { getController, useSettings } from "@/hooks/use-game";
import { themeOf } from "@/lib/theme/themes";

/** Full-screen confetti burst, fired by the game when someone wins. */
export function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [settings] = useSettings();
  const themeRef = useRef(settings.theme);
  themeRef.current = settings.theme;

  useEffect(() => {
    return getController().onEvent((e) => {
      if (e.type !== "confetti") return;
      const cv = ref.current;
      if (!cv) return;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = W * dpr;
      cv.height = H * dpr;
      cv.hidden = false;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cols = [...Object.values(themeOf(themeRef.current).pieces), "#ffffff", "#ffd54f"];
      const parts = Array.from({ length: 170 }, (_, k) => {
        const fromLeft = k % 2 === 0;
        return {
          x: fromLeft ? -10 : W + 10,
          y: H * (0.55 + Math.random() * 0.3),
          vx: (fromLeft ? 1 : -1) * (4 + Math.random() * 7),
          vy: -(9 + Math.random() * 8),
          w: 6 + Math.random() * 6,
          h: 8 + Math.random() * 8,
          r: Math.random() * 6,
          vr: (Math.random() - 0.5) * 0.3,
          c: cols[k % cols.length],
        };
      });
      const t0 = performance.now();
      const frame = (now: number) => {
        const t = now - t0;
        ctx.clearRect(0, 0, W, H);
        for (const p of parts) {
          p.vy += 0.28;
          p.vx *= 0.99;
          p.x += p.vx;
          p.y += p.vy;
          p.r += p.vr;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.r);
          ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - 2600) / 900);
          ctx.fillStyle = p.c;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 2);
          ctx.restore();
        }
        if (t < 3500) requestAnimationFrame(frame);
        else {
          ctx.clearRect(0, 0, W, H);
          cv.hidden = true;
        }
      };
      requestAnimationFrame(frame);
    });
  }, []);

  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-50 h-full w-full" aria-hidden="true" hidden />;
}
