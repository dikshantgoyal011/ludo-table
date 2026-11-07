// Chaupar: the three long dice (pasa). Each is a four-sided stick marked 1, 2,
// 5 and 6, 1 opposite 6 and 2 opposite 5 (a variation: 1, 3, 4 and 6, 3
// opposite 4). A throw is sent as one number: 100 x the first dice + 10 x the
// second + the third (1, 2 and 6: 126).
import type { ChauparVariations } from "./variations";

export const FACES_25 = [1, 2, 5, 6];
export const FACES_34 = [1, 3, 4, 6];
export const facesOf = (v: ChauparVariations) => (v.threeFour ? FACES_34 : FACES_25);

/** The faces in order round the stick's long axis: 1, 2, 6, 5 (each opposite face two quarter turns away). */
export const ringOf = (faces: number[]) => [faces[0], faces[1], faces[3], faces[2]];

/** The three dice of a throw. */
export const throwOf = (v: number): number[] => [Math.floor(v / 100) % 10, Math.floor(v / 10) % 10, v % 10];
export const throwValue = (d: number[]) => d[0] * 100 + d[1] * 10 + d[2];

/** A throw someone could really have made with these dice. */
export const validThrow = (v: number, faces: number[]) => Number.isInteger(v) && v >= 111 && v <= 666 && throwOf(v).every((d) => faces.includes(d));

/** Throw the three dice (fair: each face as likely as the others). */
export const throwDice = (faces: number[]) => throwValue([0, 0, 0].map(() => faces[Math.floor(Math.random() * faces.length)]));

/** "1, 2 and 6". */
export const sayThrow = (d: number[]) => `${d.slice(0, -1).join(", ")} and ${d[d.length - 1]}`;
