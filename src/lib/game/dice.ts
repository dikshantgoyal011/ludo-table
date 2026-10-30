// Dice rolls from the browser's cryptographic randomness.
//
// rollDie(): a fair dice; bytes 252-255 are discarded so each face 1-6 has
// exactly the same chance.
// rollDie(odds): each face k+1 comes up with chance odds[k] (see luck.ts for
// how the odds are chosen). Still random every time, just not always 1 in 6.
export function rollDie(odds?: readonly number[]): number {
  if (!odds) {
    const b = new Uint8Array(1);
    do {
      crypto.getRandomValues(b);
    } while (b[0] >= 252);
    return (b[0] % 6) + 1;
  }
  const u = new Uint32Array(1);
  crypto.getRandomValues(u);
  let r = u[0] / 2 ** 32; // [0, 1)
  for (let k = 0; k < 5; k++) {
    r -= odds[k];
    if (r < 0) return k + 1;
  }
  return 6;
}
