/**
 * Builds one corpus set. Each stratum is given a quota (the set size split evenly, the remainder going to the first
 * strata). Attempts within a stratum are numbered from zero and each attempt has its own id, so the set is a pure
 * function of the set name. An attempt is discarded (and counted, by reason) if it cannot be built, or if its
 * de-duplication key has already been used in this set or in an earlier set.
 */

import { CorpusItem, Family } from './types';
import { LINEAR_STRATA, generateLinear } from './linear';
import { QUADRATIC_STRATA, generateQuadratic } from './quadratic';
import { DERIVATIVE_STRATA, DerivativeStratum, generateDerivative } from './derivative';
import { dedupeKey } from './keys';

type SetName = 'train' | 'gate';

export const SET_SIZE: Record<SetName, number> = { train: 1000, gate: 300 };

export const STRATA: Record<Family, string[]> = {
  linear: LINEAR_STRATA,
  quadratic: QUADRATIC_STRATA,
  derivative: DERIVATIVE_STRATA,
};

interface StratumBuild {
  quota: number;
  attempts: number;
  /** Discards by reason. */
  discards: Record<string, number>;
}

interface FamilyBuild {
  items: CorpusItem[];
  strata: Record<string, StratumBuild>;
}

export interface SetBuild {
  name: SetName;
  families: Record<Family, FamilyBuild>;
}

/** Splits a total across strata: each gets floor(total / n), and the first (total mod n) get one more. */
function quotas(strata: string[], total: number): Record<string, number> {
  const base = Math.floor(total / strata.length);
  const extra = total % strata.length;
  const out: Record<string, number> = {};
  strata.forEach((s, k) => {
    out[s] = base + (k < extra ? 1 : 0);
  });
  return out;
}

type Outcome = { ok: true; item: CorpusItem } | { ok: false; reason: string };

function generate(family: Family, id: string, stratum: string): Outcome {
  if (family === 'linear') return generateLinear(id, stratum);
  if (family === 'quadratic') return generateQuadratic(id, stratum);
  return generateDerivative(id, stratum as DerivativeStratum);
}

function buildFamily(name: SetName, family: Family, used: Set<string>): FamilyBuild {
  const strata = STRATA[family];
  const quota = quotas(strata, SET_SIZE[name]);
  const items: CorpusItem[] = [];
  const report: Record<string, StratumBuild> = {};
  for (const stratum of strata) {
    const need = quota[stratum];
    const build: StratumBuild = { quota: need, attempts: 0, discards: {} };
    let accepted = 0;
    const cap = 400 * need + 4000;
    while (accepted < need) {
      if (build.attempts >= cap) throw new Error(`cannot fill ${name}/${family}/${stratum} after ${cap} attempts`);
      const id = `${name}|${family}|${stratum}|${build.attempts}`;
      build.attempts++;
      const outcome = generate(family, id, stratum);
      if (!outcome.ok) {
        build.discards[outcome.reason] = (build.discards[outcome.reason] ?? 0) + 1;
        continue;
      }
      const key = dedupeKey(outcome.item);
      if (used.has(key)) {
        build.discards.duplicate = (build.discards.duplicate ?? 0) + 1;
        continue;
      }
      used.add(key);
      items.push(outcome.item);
      accepted++;
    }
    report[stratum] = build;
  }
  return { items, strata: report };
}

/**
 * Builds a set that is disjoint from every key in `earlier`. The returned `used` set holds `earlier` plus the keys
 * of this set, so the next set can be built against it.
 */
export function buildSet(name: SetName, earlier: Set<string>): { set: SetBuild; used: Set<string> } {
  const used = new Set<string>(earlier);
  const families = {
    linear: buildFamily(name, 'linear', used),
    quadratic: buildFamily(name, 'quadratic', used),
    derivative: buildFamily(name, 'derivative', used),
  };
  return { set: { name, families }, used };
}
