import { memo } from "react";
import { cn } from "@/lib/utils";

// Player pictures: simple illustrated faces, picked in Settings (a photo can come later).

interface Look {
  bg: string;
  skin: string;
  hair: string;
  shirt: string;
  style: "short" | "long" | "bun" | "curly" | "spiky" | "cap";
}

const LOOKS: Look[] = [
  { bg: "#ffb703", skin: "#c68642", hair: "#1b1b1b", shirt: "#3a86ff", style: "short" },
  { bg: "#8ecae6", skin: "#e0ac69", hair: "#3b1f0e", shirt: "#e63946", style: "long" },
  { bg: "#90be6d", skin: "#8d5524", hair: "#111111", shirt: "#f9844a", style: "curly" },
  { bg: "#f4a3c0", skin: "#f1c27d", hair: "#5a3214", shirt: "#4361ee", style: "bun" },
  { bg: "#bdb2ff", skin: "#ffdbac", hair: "#a0522d", shirt: "#2a9d8f", style: "spiky" },
  { bg: "#ffd166", skin: "#a0673f", hair: "#1b1b1b", shirt: "#7b2cbf", style: "cap" },
  { bg: "#a0c4ff", skin: "#c68642", hair: "#2b2b2b", shirt: "#ef476f", style: "long" },
  { bg: "#f6bd60", skin: "#e0ac69", hair: "#1b1b1b", shirt: "#118ab2", style: "spiky" },
  { bg: "#cdb4db", skin: "#8d5524", hair: "#2d1b10", shirt: "#ffb703", style: "bun" },
  { bg: "#95d5b2", skin: "#f1c27d", hair: "#c58c3a", shirt: "#d62828", style: "short" },
  { bg: "#ffafcc", skin: "#a0673f", hair: "#111111", shirt: "#06d6a0", style: "curly" },
  { bg: "#9bf6ff", skin: "#ffdbac", hair: "#3b1f0e", shirt: "#ff7b00", style: "cap" },
];

// (one look per number up to AVATAR_COUNT in lib/avatars.ts)

function Hair({ l }: { l: Look }) {
  switch (l.style) {
    case "long":
      return <path d="M12 16 Q14 7 20 8 Q27 8 28 16 Q24 12 20 12 Q15 12 12 16Z" fill={l.hair} />;
    case "bun":
      return (
        <>
          <circle cx={20} cy={6.5} r={3.6} fill={l.hair} />
          <path d="M12 15.5 Q13 8 20 8 Q27 8 28 15.5 Q25 11.5 20 11.5 Q15 11.5 12 15.5Z" fill={l.hair} />
        </>
      );
    case "curly":
      return (
        <g fill={l.hair}>
          {[13, 16.5, 20, 23.5, 27].map((x, k) => (
            <circle key={x} cx={x} cy={k % 2 ? 9.5 : 11} r={3.4} />
          ))}
        </g>
      );
    case "spiky":
      return <path d="M11.5 15 L13 9 L15.5 11 L17 6.5 L19.5 10 L21.5 6 L23.5 10 L26 7 L27 11 L28.5 15 Q25 11.5 20 11.5 Q15 11.5 11.5 15Z" fill={l.hair} />;
    case "cap":
      return (
        <>
          <path d="M11.5 14 Q12 7 20 7 Q28 7 28.5 14Z" fill={l.shirt} />
          <path d="M26 13.6 Q32 13.6 32.5 15 L26 15Z" fill={l.shirt} />
        </>
      );
    default:
      return <path d="M12 15 Q13 7.5 20 7.5 Q27 7.5 28 15 Q26 11.5 20 11.5 Q14 11.5 12 15Z" fill={l.hair} />;
  }
}

/** A player's picture; `av` = "bot" for computer players. */
export const Avatar = memo(function Avatar({ av, size, className, ring }: { av: number | "bot"; size?: number; className?: string; ring?: string }) {
  const style = { boxShadow: ring ? `0 0 0 2px ${ring}` : undefined };
  const cls = cn("shrink-0 rounded-full", className);
  if (av === "bot")
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" className={cls} style={style} aria-hidden="true">
        <rect width={40} height={40} fill="#5b6b8c" />
        <line x1={20} y1={6} x2={20} y2={10} stroke="#d9e2f2" strokeWidth={1.6} />
        <circle cx={20} cy={5.5} r={1.8} fill="#ffd166" />
        <rect x={10} y={10} width={20} height={16} rx={5} fill="#d9e2f2" />
        <rect x={13} y={14} width={14} height={7} rx={3.5} fill="#2b3550" />
        <circle cx={17} cy={17.5} r={1.6} fill="#5ee6ff" />
        <circle cx={23} cy={17.5} r={1.6} fill="#5ee6ff" />
        <path d="M7 40 Q7 29 20 29 Q33 29 33 40Z" fill="#d9e2f2" />
      </svg>
    );
  const l = LOOKS[((av % LOOKS.length) + LOOKS.length) % LOOKS.length];
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={cls} style={style} aria-hidden="true">
      <rect width={40} height={40} fill={l.bg} />
      {l.style === "long" && <path d="M9 22 Q9 6 20 6 Q31 6 31 22 L31 30 L9 30Z" fill={l.hair} />}
      <path d="M6 40 Q6 29 20 29 Q34 29 34 40Z" fill={l.shirt} />
      <rect x={16.5} y={23} width={7} height={7} rx={2} fill={l.skin} />
      <circle cx={20} cy={17} r={8} fill={l.skin} />
      <Hair l={l} />
      <circle cx={17} cy={17.5} r={1} fill="#1b1b1b" />
      <circle cx={23} cy={17.5} r={1} fill="#1b1b1b" />
      <path d="M17.5 21 Q20 23 22.5 21" stroke="#1b1b1b" strokeWidth={1} fill="none" strokeLinecap="round" />
    </svg>
  );
});
