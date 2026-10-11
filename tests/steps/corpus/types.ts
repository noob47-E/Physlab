/**
 * Shared types, the seeded PRNG and the id hash for the step-by-step known-answer corpora.
 * Every item is a pure function of its id: the id is hashed (FNV-1a, 32 bit) to a mulberry32 seed.
 */

export type Family = 'linear' | 'quadratic' | 'derivative';

type Level = 'O/IGCSE' | 'FSc/A level' | 'first-year university';

export interface CorpusItem {
  id: string;
  family: Family;
  stratum: string;
  question: string;
  answer: string;
  intermediates: Record<string, string>;
  rulesExpected: string[];
  level: Level;
  /** Derivative items only: the conditions under which the derivative is defined. */
  domain?: string;
  /** Derivative items only: the five points at which the item is checked. */
  samplePoints?: number[];
}

/** FNV-1a, 32 bit: a stable hash of an id string. */
function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * mulberry32, a small seeded generator published by Tommy Ettinger (https://github.com/bryc/code, jshash/PRNGs.md).
 * This is a fresh implementation of the published algorithm, not copied code.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Random {
  private readonly next01: () => number;
  constructor(seed: number) {
    this.next01 = mulberry32(seed);
  }
  /** Integer in [min, max], both included. */
  int(min: number, max: number): number {
    return Math.floor(this.next01() * (max - min + 1)) + min;
  }
  pick<T>(values: readonly T[]): T {
    return values[this.int(0, values.length - 1)];
  }
  chance(p: number): boolean {
    return this.next01() < p;
  }
}

/** The generator for one item: seeded from the item's id alone. */
export function randomFor(id: string): Random {
  return new Random(fnv1a32(id));
}

/** Whitespace, multiplication signs and case removed: the text form used for de-duplication. */
export function normaliseText(text: string): string {
  return text.replace(/\s+/g, '').replace(/\*/g, '').toLowerCase();
}
