/**
 * Deterministic pseudo-random utilities for reproducible model training
 * (feature selection, bootstrap sampling, train/test split).
 *
 * mulberry32 — small, fast, 32-bit seeded PRNG. Same seed ⇒ same sequence,
 * which is what model/dataset versioning relies on.
 */

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [0, maxExclusive). */
export function rngInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive);
}

export function shuffle<T>(arr: T[], rng: Rng): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rngInt(rng, i + 1);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** Random index into [0, n). */
export function sampleIndex(rng: Rng, n: number): number {
  return rngInt(rng, n);
}