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
  board: "cross" | "cloth" | "grid5" | "grid7" | "plane";
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
    hint: "Ludo's royal ancestor. Cowrie shells instead of a dice, on a cross-shaped cloth.",
    points: ["Cowrie shells instead of a dice: count the ones landing mouth-up", "A cross-shaped cloth board", "Castle squares keep you safe"],
    ready: false,
    board: "cloth",
    thrown: "cowries",
    tint: ["#5a1420", "#f0c060"],
  },
  {
    id: "chaupar",
    name: "Chaupar",
    origin: "Royal courts of India",
    hint: "Same cross board as Pachisi, thrown with long four-sided stick dice.",
    points: ["The same cross-shaped board as Pachisi", "Long four-sided stick dice instead of cowries", "A favourite of India's royal courts"],
    ready: false,
    board: "cloth",
    thrown: "sticks",
    tint: ["#3a1d5c", "#e9b65a"],
  },
  {
    id: "chowka-bara",
    name: "Chowka Bara",
    origin: "Karnataka · also Ashta Chamma",
    hint: "A small 5×5 board. Four cowries, and your tokens spiral in to the centre.",
    points: ["A small 5×5 board, often drawn on the floor", "Four cowrie shells instead of a dice", "Tokens spiral inwards to the centre square"],
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
    hint: "Ludo with two dice, and bonus moves when you cut or reach home.",
    points: ["Two dice instead of one", "Bonus moves for a cut and for reaching home", "Two tokens on a square block the way"],
    ready: false,
    board: "cross",
    thrown: "two-dice",
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
