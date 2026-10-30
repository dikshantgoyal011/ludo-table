/**
 * Every game on the home page. Only `ready` ones can be played; the rest show
 * as "Coming soon". `hint` explains each one in terms of the Ludo rules
 * players already know.
 */
export interface Variant {
  id: string;
  name: string;
  /** Where and when it's from */
  origin: string;
  hint: string;
  /** Route for playable games */
  href?: string;
  /** Mini board drawn on the card */
  board: "cross" | "grid5" | "grid7" | "plane";
  /** Card colours: background, accent */
  tint: [string, string];
}

export const VARIANTS: Variant[] = [
  {
    id: "ludo",
    name: "Ludo",
    origin: "England, 1896",
    hint: "The one you know: roll a 6 to come out, race four tokens home.",
    href: "/ludo",
    board: "cross",
    tint: ["#0f4a35", "#e8b84a"],
  },
  {
    id: "pachisi",
    name: "Pachisi",
    origin: "Mughal India, 16th century",
    hint: "Ludo's royal ancestor. Cowrie shells instead of a dice, on a cross-shaped cloth.",
    board: "cross",
    tint: ["#5a1420", "#f0c060"],
  },
  {
    id: "chaupar",
    name: "Chaupar",
    origin: "Royal courts of India",
    hint: "Same cross board as Pachisi, thrown with long four-sided stick dice.",
    board: "cross",
    tint: ["#3a1d5c", "#e9b65a"],
  },
  {
    id: "chowka-bara",
    name: "Chowka Bara",
    origin: "Karnataka · also Ashta Chamma",
    hint: "A small 5×5 board. Four cowries, and your tokens spiral in to the centre.",
    board: "grid5",
    tint: ["#6b3a12", "#f3d08a"],
  },
  {
    id: "challas-aath",
    name: "Challas Aath",
    origin: "Village courtyards of India",
    hint: "A bigger square board, cowrie throws, and the same race to the middle.",
    board: "grid7",
    tint: ["#7a2e1a", "#f6c77a"],
  },
  {
    id: "parchis",
    name: "Parchís",
    origin: "Spain",
    hint: "Ludo with two dice, and bonus moves when you cut or reach home.",
    board: "cross",
    tint: ["#123e6b", "#f2c94c"],
  },
  {
    id: "aeroplane",
    name: "Aeroplane Chess",
    origin: "China",
    hint: "Ludo with planes: land on your colour and jump ahead.",
    board: "plane",
    tint: ["#0e4d6e", "#ffd54f"],
  },
];
