// Chaupar: the two long dice (pasa). Each is a four-sided stick marked 1, 3, 4
// and 6, 1 opposite 6 and 3 opposite 4. A throw is sent as one number: 10 x the
// first dice + the second (3 and 6: 36).

export const FACES = [1, 3, 4, 6];

/** The faces in order round the stick's long axis: 1, 3, 6, 4 (each opposite face two quarter turns away). */
export const ringOf = (faces: number[]) => [faces[0], faces[1], faces[3], faces[2]];

/** The two dice of a throw. */
export const throwOf = (v: number): number[] => [Math.floor(v / 10) % 10, v % 10];
export const throwValue = (d: number[]) => d[0] * 10 + d[1];
/** Both dice the same (1-1, 3-3, 4-4 or 6-6). */
export const isDoublet = (d: number[]) => d.length === 2 && d[0] === d[1];

/** A throw someone could really have made with these dice. */
export const validThrow = (v: number) => Number.isInteger(v) && v >= 11 && v <= 66 && throwOf(v).every((d) => FACES.includes(d));

/** Throw the two dice (fair: each face as likely as the others). */
export const throwDice = () => throwValue([0, 0].map(() => FACES[Math.floor(Math.random() * FACES.length)]));

/** "3 and 6". */
export const sayThrow = (d: number[]) => `${d.slice(0, -1).join(", ")} and ${d[d.length - 1]}`;
