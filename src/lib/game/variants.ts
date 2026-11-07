/**
 * Every game on the home page. Only `ready` ones can be played; the rest show
 * as "Coming soon". `hint` and `points` explain each one in terms of the Ludo
 * rules players already know.
 */
export interface Variant {
  id: string;
  name: string;
  /** Where and when it's from */
  origin: string;
  hint: string;
  /** Three short "how it plays" lines for the showcase */
  points: string[];
  /** Playable now */
  ready: boolean;
  /** Board drawn on the cards and in the animated preview */
  board: "cross" | "cloth" | "velvet" | "grid5" | "grid7" | "plane";
  /** What players throw */
  thrown: "dice" | "cowries" | "sticks" | "two-dice";
  /** Card colours: background, accent */
  tint: [string, string];
}

export const VARIANTS: Variant[] = [
  {
    id: "ludo",
    name: "Ludo",
    origin: "England, 1896",
    hint: "The one you know: roll a 6 to come out, race four tokens home.",
    points: ["Roll a 6 to bring a token out", "Land on a rival to send them home", "Stars are safe squares"],
    ready: true,
    board: "cross",
    thrown: "dice",
    tint: ["#0f4a35", "#e8b84a"],
  },
  {
    id: "pachisi",
    name: "Pachisi",
    origin: "Mughal India, 16th century",
    hint: "Ludo's royal ancestor, on a cross-shaped board, played by its traditional rules: cowrie shells instead of a dice, castles (✕) that keep you safe.",
    points: [
      "Throw 6 cowries and count the ones mouth-up: none = 25, one = 10",
      "Your first piece comes out with any throw; after that a 6, 10 or 25 brings one out, and you throw again",
      "Down your arm, round the cross, back up to the center by an exact throw",
      "Play solo, or 2 vs 2 with the player opposite",
    ],
    ready: true,
    board: "cloth",
    thrown: "cowries",
    tint: ["#5a1420", "#f0c060"],
  },
  {
    id: "chaupar",
    name: "Chaupar",
    origin: "Royal courts of India",
    hint: "Pachisi's older, more skilful cousin, the game of India's royal courts: three long dice, pieces that join into super-pieces, and no safe squares.",
    points: [
      "Throw three long dice (1, 2, 5, 6) and use each one to move",
      "Pieces start on the board; land on your own to join into a super-piece",
      "No safe squares: capture rivals anywhere round the cross",
      "Home by the exact count. Play solo, or 2 vs 2",
    ],
    ready: true,
    board: "velvet",
    thrown: "sticks",
    tint: ["#3a1d5c", "#e9b65a"],
  },
  {
    id: "chowka-bara",
    name: "Chowka Bara",
    origin: "Karnataka · also Ashta Chamma",
    hint: "A small 5×5 board. Four cowries, and your tokens spiral in to the center.",
    points: ["A small 5×5 board, often drawn on the floor", "Four cowrie shells instead of a dice", "Tokens spiral inwards to the center square"],
    ready: false,
    board: "grid5",
    thrown: "cowries",
    tint: ["#6b3a12", "#f3d08a"],
  },
  {
    id: "challas-aath",
    name: "Challas Aath",
    origin: "Village courtyards of India",
    hint: "A bigger square board, cowrie throws, and the same race to the middle.",
    points: ["A bigger 7×7 square board", "Cowrie throws instead of a dice", "The same race to the middle"],
    ready: false,
    board: "grid7",
    thrown: "cowries",
    tint: ["#7a2e1a", "#f6c77a"],
  },
  {
    id: "parchis",
    name: "Parchís",
    origin: "Spain",
    hint: "Spain's own Ludo, by the traditional rules: one dice, 68 numbered squares, safe squares, barriers, and bonus counts when you capture or reach the meta.",
    points: [
      "A 5 brings a piece out of your house",
      "Capture a rival and count 20; reach your meta and count 10",
      "Two pieces of one color make a barrier nobody can pass",
      "Grey squares are safe; a 6 rolls again (7 with no piece left at home)",
    ],
    ready: true,
    board: "cross",
    thrown: "dice",
    tint: ["#123e6b", "#f2c94c"],
  },
  {
    id: "aeroplane",
    name: "Aeroplane Chess",
    origin: "China",
    hint: "Ludo with planes: land on your colour and jump ahead.",
    points: ["Planes take off with a 6", "Land on your own colour to jump ahead", "Fly across the board on shortcuts"],
    ready: false,
    board: "plane",
    thrown: "dice",
    tint: ["#0e4d6e", "#ffd54f"],
  },
];

export const variantById = (id: string | null | undefined) => VARIANTS.find((v) => v.id === id) || VARIANTS[0];
