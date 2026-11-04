// The results table: everyone at the table in order. With partners (Pachisi)
// each row is a side, its colours together.
import type { GameController } from "@/lib/game/controller";
import { COLORS, NAMES } from "@/lib/game/constants";
import { rulesFor, teamOf } from "@/lib/game/rules";
import type { Color } from "@/lib/game/types";

export interface Standing {
  colors: Color[];
  /** 0 = 1st; null while still playing. */
  place: number | null;
  name: string;
  note: string;
  you: boolean;
}

export function standings(game: GameController, final: boolean): Standing[] {
  const s = game.state;
  const progress = (cs: Color[]) => cs.reduce((a, c) => a + rulesFor(s).progress(s, c), 0);
  const seatedColors = COLORS.filter((c) => s.seats[c]);
  const nameOf = (cs: Color[]) => [...new Set(cs.map((c) => s.seats[c]?.nick || NAMES[c]))].join(" & ");
  const outNote = (cs: Color[]) => (cs.every((c) => s.seats[c]?.out) ? (cs.some((c) => s.seats[c]?.left) ? "Left" : "Out") : "");
  if (s.teams) {
    const sides = s.teams.map((t) => t.filter((c) => s.seats[c])).filter((t) => t.length);
    // The side that finished comes first (its colours lead the winners list), the rest by how far they got.
    const won = s.phase === "done" && s.winners[0] ? teamOf(s, s.winners[0]) : null;
    sides.sort((a, b) => (won && a.includes(won[0]) ? -1 : won && b.includes(won[0]) ? 1 : progress(b) - progress(a)));
    return sides.map((cs, k) => ({
      colors: cs,
      place: s.phase === "done" ? k : null,
      name: nameOf(cs),
      note: outNote(cs) || (s.phase !== "done" ? `${cs.filter((c) => s.winners.includes(c)).length}/${cs.length} home` : ""),
      you: cs.some((c) => game.isYou(c)),
    }));
  }
  const rest = seatedColors.filter((c) => !s.winners.includes(c)).sort((a, b) => progress([b]) - progress([a]));
  return [
    ...s.winners.map((c, k) => ({ colors: [c], place: k, name: nameOf([c]), note: "", you: game.isYou(c) })),
    ...rest.map((c) => ({ colors: [c], place: null, name: nameOf([c]), note: outNote([c]) || (final ? "" : "Still playing"), you: game.isYou(c) })),
  ];
}
