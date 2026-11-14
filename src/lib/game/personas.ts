// Online: when nobody turns up to play, the table is filled with players the
// host's device plays for. Each one is someone: a name, a country, a picture,
// a way of playing (which pieces they go for, how much they risk) and a pace,
// and now and then a word in the chat. They join, think and play like people.
import { AVATAR_COUNT } from "../avatars";
import type { Player } from "./types";

/**
 * How a player weighs their moves. Every game's chooseMove (rules) scores the
 * moves it can make; a style scales each part of that score. The computer
 * players (vs computer) play without a style.
 */
export interface Style {
  /** Getting ahead (how far a move takes a piece). */
  advance: number;
  /** Capturing a rival. */
  capture: number;
  /** Bringing a new piece out. */
  enter: number;
  /** Getting pieces home, and into the home stretch. */
  home: number;
  /** Safe squares (and barriers, pairs). */
  safe: number;
  /** Fear of being captured: avoiding squares a rival can reach, getting out of them. */
  risk: number;
  /** Above 0: keeps moving the piece that's furthest on; below 0: brings the ones behind up. */
  lead: number;
  /** How much a move is a matter of feel (the computer: 1). Higher: less often the best move. */
  noise: number;
}

/** The computer players (vs computer): every part of a move's score as the game weighs it. */
export const PLAIN: Style = { advance: 1, capture: 1, enter: 1, home: 1, safe: 1, risk: 1, lead: 0, noise: 1 };

/**
 * A persona's pace, in ms: a pause before rolling, and before picking a piece (more with more to choose from).
 * Quick, like someone keen to play: nobody at the table waits on them. Only now and then a longer pause.
 */
interface Tempo {
  roll: [number, number];
  pick: [number, number];
  /** Extra per further piece that could move. */
  perChoice: number;
  /** Now and then a much longer pause (distracted, thinking it over). */
  slow: number;
}

interface Kind {
  style: Style;
  tempo: Tempo;
}

/** The ways the players play. */
export const KINDS = {
  // Goes after every piece in reach, doesn't mind leaving its own open.
  hunter: {
    style: { advance: 1, capture: 1.9, enter: 1, home: 0.85, safe: 0.5, risk: 0.35, lead: 0.15, noise: 7 },
    tempo: { roll: [300, 700], pick: [350, 800], perChoice: 60, slow: 0.03 },
  },
  // Safe squares first, never leaves a piece where it can be hit if it can help it.
  careful: {
    style: { advance: 0.9, capture: 0.9, enter: 0.85, home: 1.3, safe: 2.2, risk: 2.2, lead: 0, noise: 5 },
    tempo: { roll: [450, 1000], pick: [550, 1200], perChoice: 110, slow: 0.04 },
  },
  // Runs one piece all the way home before bothering with the rest.
  racer: {
    style: { advance: 1.8, capture: 1, enter: 0.55, home: 1.5, safe: 0.8, risk: 0.7, lead: 1.2, noise: 7 },
    tempo: { roll: [250, 600], pick: [300, 700], perChoice: 50, slow: 0.02 },
  },
  // Gets every piece out and moves them up together.
  builder: {
    style: { advance: 0.9, capture: 1.1, enter: 1.7, home: 1, safe: 1.3, risk: 1.2, lead: -0.9, noise: 6 },
    tempo: { roll: [350, 850], pick: [450, 1000], perChoice: 90, slow: 0.03 },
  },
  // Plays for fun, mostly by feel.
  casual: {
    style: { advance: 1, capture: 1.2, enter: 1, home: 1, safe: 0.8, risk: 0.6, lead: 0.3, noise: 22 },
    tempo: { roll: [300, 1100], pick: [400, 1200], perChoice: 80, slow: 0.05 },
  },
} satisfies Record<string, Kind>;
export type KindId = keyof typeof KINDS;
const KIND_IDS = Object.keys(KINDS) as KindId[];
export const isKind = (v: unknown): v is KindId => typeof v === "string" && v in KINDS;

export const styleOf = (k: KindId): Style => KINDS[k].style;

const between = ([a, b]: [number, number]) => a + Math.random() * (b - a);
/** How long a persona of kind k waits before rolling, or (choices > 1) before moving. */
export function thinkTime(k: KindId, choices = 0) {
  const t: Tempo = KINDS[k].tempo;
  let ms = choices > 0 ? between(t.pick) + t.perChoice * Math.max(0, choices - 1) : between(t.roll);
  if (Math.random() < t.slow) ms += 1500 + Math.random() * 2500;
  return Math.round(ms);
}

// Names as people really pick them: first names from each country, written
// the ways people write them in games. (Ordinary given names only.)
const NAMES: Record<string, string[]> = {
  IN: ["Rohit", "Aman", "Priya", "Neha", "Karan", "Sneha", "Vikas", "Anjali", "Rahul", "Pooja", "Aditya", "Sakshi", "Nikhil", "Ritika", "Varun", "Tanvi", "Kunal", "Isha", "Manish", "Divya", "Harsh", "Simran", "Yash", "Megha", "Ankit", "Kavya", "Sahil", "Riya", "Deepak", "Nisha"],
  PK: ["Hamza", "Ayesha", "Usman", "Sana", "Bilal", "Hira", "Faizan", "Zara", "Saad", "Mahnoor", "Danish", "Iqra", "Waqas", "Areeba"],
  BD: ["Rafi", "Nusrat", "Tanvir", "Sadia", "Arif", "Mim", "Shuvo", "Tania", "Rakib", "Jannat", "Sabbir", "Lamia"],
  NP: ["Sujan", "Anisha", "Bikash", "Sabina", "Prakash", "Rojina", "Suman", "Asmita"],
  LK: ["Kasun", "Nimali", "Dilshan", "Sachini", "Tharindu", "Hasini"],
  AE: ["Omar", "Layla", "Khalid", "Noura", "Faisal", "Mariam", "Rashid", "Hessa"],
  SA: ["Fahad", "Reem", "Sultan", "Lama", "Nasser", "Dana"],
  EG: ["Youssef", "Nour", "Karim", "Salma", "Ahmed", "Hana"],
  ID: ["Budi", "Putri", "Rizky", "Dewi", "Agus", "Sari", "Dimas", "Ayu"],
  MY: ["Aiman", "Nurul", "Hafiz", "Aina", "WeiJie", "MeiLing", "Irfan", "Syafiqah"],
  PH: ["Paolo", "Bea", "Mark", "Kim", "Joshua", "Andrea", "Carlo", "Jasmine"],
  NG: ["Chinedu", "Amaka", "Tunde", "Ngozi", "Emeka", "Funmi", "Segun", "Chioma"],
  KE: ["Brian", "Wanjiru", "Kevin", "Achieng", "Otieno", "Njeri"],
  GB: ["Jack", "Sophie", "Harry", "Chloe", "Oliver", "Ellie", "Callum", "Megan"],
  US: ["Tyler", "Madison", "Jake", "Ashley", "Ryan", "Kayla", "Dylan", "Brooke"],
  CA: ["Liam", "Emma", "Noah", "Ava", "Ethan", "Chloe"],
  AU: ["Lachlan", "Isla", "Cooper", "Matilda", "Mitch", "Zoe"],
  BR: ["Lucas", "Gabriela", "Mateus", "Larissa", "Rafael", "Bianca", "Thiago", "Camila"],
  TR: ["Emre", "Elif", "Burak", "Zeynep", "Mert", "Ece"],
  ES: ["Pablo", "Lucía", "Javier", "Marta", "Álvaro", "Carmen", "Sergio", "Paula"],
  MX: ["Diego", "Valeria", "Luis", "Fernanda", "Jorge", "Ximena"],
};
// Where online players come from (by weight): many from South Asia, the rest from all over.
const FROM: [string, number][] = [
  ["IN", 30], ["PK", 8], ["BD", 7], ["NP", 3], ["LK", 2], ["AE", 3], ["SA", 2], ["EG", 2], ["ID", 4], ["MY", 3], ["PH", 4],
  ["NG", 4], ["KE", 2], ["GB", 4], ["US", 5], ["CA", 2], ["AU", 2], ["BR", 4], ["TR", 2], ["ES", 3], ["MX", 2],
];

/** Where players come from, for the search screen's radar. */
export const PLACES = FROM.map(([cc]) => cc);

const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
function weighted(list: [string, number][]) {
  let r = Math.random() * list.reduce((a, [, w]) => a + w, 0);
  for (const [v, w] of list) if ((r -= w) < 0) return v;
  return list[0][0];
}
/** A name as typed into a game: "Rohit", "rohit_27", "Rohit.K", "Priya2001"... */
function nameFrom(first: string) {
  const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
  const n = Math.floor(Math.random() * 99) + 1;
  const year = 1988 + Math.floor(Math.random() * 20);
  const ways = [
    () => first,
    () => first,
    () => `${first} ${letter}`,
    () => `${first.toLowerCase()}_${n}`,
    () => `${first}${n}`,
    () => `${first}.${letter.toLowerCase()}`,
    () => `${first.toLowerCase()}${year}`,
    () => `its_${first.toLowerCase()}`,
    () => `${first}_${letter}`,
  ];
  return pick(ways)();
}

/** A new player id, made the way a phone makes its own. */
const newId = () => "c" + Math.random().toString(36).slice(2, 10).padEnd(8, "0");

/** A player at an online table who is played by the host's device. */
export interface Persona extends Player {
  ai: KindId;
}

/**
 * Someone to sit at the table: a name nobody there has, often from where the
 * player is (online games mostly pair people from nearby), with a picture of their own.
 */
export function newPersona(taken: Player[], nearCc?: string): Persona {
  const nicks = new Set(taken.map((p) => p.nick.toLowerCase()));
  const ccs = taken.map((p) => p.cc);
  for (let k = 0; ; k++) {
    // (Not everyone from one country: a second persona from the same place is less likely.)
    let cc = nearCc && NAMES[nearCc] && Math.random() < 0.4 ? nearCc : weighted(FROM);
    if (ccs.includes(cc) && Math.random() < 0.6) cc = weighted(FROM);
    const nick = nameFrom(pick(NAMES[cc]));
    if (nicks.has(nick.toLowerCase()) && k < 20) continue;
    const used = new Set(taken.map((p) => p.av));
    const free = Array.from({ length: AVATAR_COUNT }, (_, i) => i).filter((i) => !used.has(i));
    return { id: newId(), nick, cc, av: pick(free.length ? free : [0]), ai: pick(KIND_IDS) };
  }
}

// What they say, now and then. Each persona writes in their own way (some never do).
const SAY = {
  hello: ["hi", "hii", "hello", "👋 Hi!", "Good luck!", "gl", "hey all", "gl hf"],
  capture: ["sorry 😅", "hehe", "😂", "oops", "got you", "😎"],
  captured: ["noo", "😩", "why me", "not again", "revenge time 😤", "ugh"],
  home: ["yess", "one home ✌️", "💪"],
  missed: ["sorry, was away", "oops 😅", "sry", "had a call, sorry"],
  win: ["gg", "Good game!", "gg wp", "ggs"],
  lose: ["gg", "Good game!", "well played", "gg wp"],
} as const;
export type SayWhen = keyof typeof SAY;

/** How chatty each persona is (0: never writes), from their id so it stays the same all game. */
export function chattiness(id: string) {
  let h = 7;
  for (let k = 0; k < id.length; k++) h = (h * 33 + id.charCodeAt(k)) % 1000;
  return h < 300 ? 0 : (h % 100) / 100;
}

/** Something to say about `when`, or null to say nothing this time. */
export function chatLine(id: string, when: SayWhen): string | null {
  const odds = { hello: 0.6, capture: 0.35, captured: 0.4, home: 0.15, missed: 0.5, win: 0.85, lose: 0.7 }[when];
  if (Math.random() > chattiness(id) * odds) return null;
  return pick(SAY[when]);
}
