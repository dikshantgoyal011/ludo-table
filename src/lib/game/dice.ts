// Fair dice: browser cryptographic randomness, bytes 252-255 discarded so
// each face 1-6 has exactly the same chance. No weighting, no memory.
export function rollDie(): number {
  const b = new Uint8Array(1);
  do {
    crypto.getRandomValues(b);
  } while (b[0] >= 252);
  return (b[0] % 6) + 1;
}
