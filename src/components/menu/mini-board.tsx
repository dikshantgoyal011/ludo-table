import type { Variant } from "@/lib/game/variants";

const COLS = ["#c8262b", "#16894a", "#e9a912", "#1f5fcc"];

/** Small drawing of a game's board, for game cards and chips. */
export function MiniBoard({ kind, accent }: { kind: Variant["board"]; accent: string }) {
  if (kind === "cross")
    return (
      <svg viewBox="0 0 30 30" className="h-full w-full" aria-hidden="true">
        <path d="M11 1h8v10h10v8H19v10h-8V19H1v-8h10z" fill="#f8f0da" stroke={accent} strokeWidth="1.2" strokeLinejoin="round" />
        <rect x="13.5" y="2.5" width="3" height="8" fill={COLS[1]} />
        <rect x="19.5" y="13.5" width="8" height="3" fill={COLS[2]} />
        <rect x="13.5" y="19.5" width="3" height="8" fill={COLS[3]} />
        <rect x="2.5" y="13.5" width="8" height="3" fill={COLS[0]} />
        <circle cx="15" cy="15" r="3" fill={accent} />
      </svg>
    );
  if (kind === "cloth")
    return (
      <svg viewBox="0 0 30 30" className="h-full w-full" aria-hidden="true">
        <path d="M11 1h8v10h10v8H19v10h-8V19H1v-8h10z" fill="#8e1b2b" stroke={accent} strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M13.7 1v10M16.3 1v10M13.7 19v10M16.3 19v10M1 13.7h10M1 16.3h10M19 13.7h10M19 16.3h10" stroke={accent} strokeWidth=".6" opacity=".8" />
        <path d="M14 4l2 2m0-2l-2 2M14 24l2 2m0-2l-2 2M4 14l2 2m0-2l-2 2M24 14l2 2m0-2l-2 2" stroke="#fff3d0" strokeWidth=".7" />
        <rect x="11" y="11" width="8" height="8" fill={accent} opacity=".9" />
      </svg>
    );
  if (kind === "plane")
    return (
      <svg viewBox="0 0 30 30" className="h-full w-full" aria-hidden="true">
        <rect x="1" y="1" width="28" height="28" rx="5" fill="#f8f0da" stroke={accent} strokeWidth="1.2" />
        {[0, 1, 2, 3].map((k) => (
          <path key={k} d="M15 15 L15 3 A12 12 0 0 1 27 15 Z" fill={COLS[k]} opacity=".9" transform={`rotate(${k * 90} 15 15)`} />
        ))}
        <path d="M15 8l1.6 5 5 1v1.6l-5-.6-.4 4 1.8 1.4V22L15 21l-3 1v-1.6l1.8-1.4-.4-4-5 .6V14l5-1z" fill="#fff" stroke="#333" strokeWidth=".5" />
      </svg>
    );
  const n = kind === "grid5" ? 5 : 7;
  const s = 28 / n;
  const mid = Math.floor(n / 2);
  const marks = [
    [mid, mid],
    [0, mid],
    [mid, 0],
    [n - 1, mid],
    [mid, n - 1],
  ];
  return (
    <svg viewBox="0 0 30 30" className="h-full w-full" aria-hidden="true">
      <rect x="1" y="1" width="28" height="28" rx="2" fill="#f3e2bc" stroke={accent} strokeWidth="1.2" />
      {Array.from({ length: n - 1 }, (_, i) => (
        <path key={i} d={`M${1 + s * (i + 1)} 1V29M1 ${1 + s * (i + 1)}H29`} stroke="#8a5a2a" strokeWidth=".5" />
      ))}
      {marks.map(([r, c], k) => (
        <path
          key={k}
          d={`M${1 + c * s + s * 0.2} ${1 + r * s + s * 0.2}l${s * 0.6} ${s * 0.6}m0 ${-s * 0.6}l${-s * 0.6} ${s * 0.6}`}
          stroke={k === 0 ? accent : COLS[k - 1]}
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
