import { describe, it, expect } from 'vitest';
import { TRAINING, GATING } from './data';
import { SetBuild, STRATA, SET_SIZE } from './build';
import { canonicalRoot, checkDerivative, checkItem, checkLinear, checkQuadratic } from './check';
import { dedupeKey } from './keys';
import { parsePoly, parseRoot, radicandsIn } from './parse';
import { isSquarefreeAboveOne, polyAt, cxIsZero, polyEq, ratToDecimal, ratFromDecimal, rat, ratToString, ZERO } from './exact';
import { normaliseText, CorpusItem, Family } from './types';

const FAMILIES: Family[] = ['linear', 'quadratic', 'derivative'];

/** The checks read every item with 40-digit arithmetic, so the derivative checks take minutes on a full set. */
const SLOW = 900_000;

function allItems(set: SetBuild): CorpusItem[] {
  return FAMILIES.flatMap((f) => set.families[f].items);
}

function problemsIn(items: CorpusItem[]): string[] {
  return items.flatMap((item) => checkItem(item).map((p) => `${item.id} [${item.stratum}] ${item.question} => ${item.answer}: ${p}`));
}

describe('every item is re-checked independently', () => {
  for (const family of FAMILIES) {
    it(`TRAINING ${family}: no item fails its checker`, () => {
      expect(problemsIn(TRAINING.families[family].items)).toEqual([]);
    }, SLOW);
    it(`GATING ${family}: no item fails its checker`, () => {
      expect(problemsIn(GATING.families[family].items)).toEqual([]);
    }, SLOW);
  }
});

describe('sizes, strata and quotas', () => {
  for (const [name, set] of [
    ['TRAINING', TRAINING],
    ['GATING', GATING],
  ] as const) {
    it(`${name}: each family has the set size after de-duplication, and at least 1000 or 300`, () => {
      for (const family of FAMILIES) {
        const n = set.families[family].items.length;
        expect(n).toBe(SET_SIZE[name === 'TRAINING' ? 'train' : 'gate']);
      }
      expect(SET_SIZE.train).toBeGreaterThanOrEqual(1000);
      expect(SET_SIZE.gate).toBeGreaterThanOrEqual(300);
    });
    it(`${name}: every stratum is present, and its count equals its quota`, () => {
      for (const family of FAMILIES) {
        const build = set.families[family];
        for (const stratum of STRATA[family]) {
          const counted = build.items.filter((i) => i.stratum === stratum).length;
          expect(build.strata[stratum].quota, `${family}/${stratum}`).toBe(counted);
          expect(counted, `${family}/${stratum}`).toBeGreaterThan(0);
        }
        const labels = new Set(STRATA[family]);
        expect(build.items.every((i) => labels.has(i.stratum))).toBe(true);
      }
    });
    it(`${name}: every item carries its family's rules and an id from its own set`, () => {
      for (const item of allItems(set)) {
        expect(item.id.startsWith(`${name === 'TRAINING' ? 'train' : 'gate'}|`)).toBe(true);
        expect(item.rulesExpected.length).toBeGreaterThan(0);
      }
    });
  }
});

describe('de-duplication', () => {
  it('no two items of TRAINING share a key, and none repeat a normalised question', () => {
    const items = allItems(TRAINING);
    expect(new Set(items.map(dedupeKey)).size).toBe(items.length);
    expect(new Set(items.map((i) => normaliseText(i.question))).size).toBe(items.length);
  }, SLOW);
  it('no two items of GATING share a key, and none repeat a normalised question', () => {
    const items = allItems(GATING);
    expect(new Set(items.map(dedupeKey)).size).toBe(items.length);
    expect(new Set(items.map((i) => normaliseText(i.question))).size).toBe(items.length);
  }, SLOW);
  it('GATING is disjoint from TRAINING: no shared key and no shared normalised question', () => {
    const trainKeys = new Set(allItems(TRAINING).map(dedupeKey));
    const trainTexts = new Set(allItems(TRAINING).map((i) => normaliseText(i.question)));
    const shared = allItems(GATING).filter((i) => trainKeys.has(dedupeKey(i)) || trainTexts.has(normaliseText(i.question)));
    expect(shared.map((i) => i.id)).toEqual([]);
  }, SLOW);
});

describe('planted errors are caught', () => {
  it('a linear answer that is not the root is reported', () => {
    const item = TRAINING.families.linear.items.find((i) => i.stratum === 'integer/easy');
    if (!item) throw new Error('no integer/easy item in TRAINING');
    const planted: CorpusItem = { ...item, answer: 'x = 1000', intermediates: { ...item.intermediates, divided: 'x = 1000' } };
    expect(checkLinear(planted).some((p) => p.includes('is not the root'))).toBe(true);
  });

  it('a surd with an unsimplified radical is reported', () => {
    const item = TRAINING.families.quadratic.items.find((i) => i.stratum === 'surd/easy' && i.answer.includes('sqrt('));
    if (!item) throw new Error('no surd item in TRAINING');
    const planted: CorpusItem = { ...item, answer: item.answer.replace(/sqrt\((\d+)\)/g, (_m, n: string) => `sqrt(${Number(n) * 4})`) };
    expect(checkQuadratic(planted).some((p) => p.includes('is not simplified'))).toBe(true);
  });

  it('a quadratic whose roots are not the roots of its question is reported', () => {
    const item = TRAINING.families.quadratic.items.find((i) => i.stratum === 'rational/medium');
    if (!item) throw new Error('no rational/medium item in TRAINING');
    const planted: CorpusItem = { ...item, intermediates: { ...item.intermediates, factorised: '(x - 1)(x - 2)' } };
    expect(checkQuadratic(planted).some((p) => p.includes('factorised form does not expand'))).toBe(true);
  });

  it('a factorisation whose factor is not in lowest terms is reported', () => {
    // 2x² - 6x + 4 = 2(x - 1)(x - 2); (2x - 2)(x - 2) expands to the same quadratic but is not the canonical form.
    const planted: CorpusItem = {
      id: 'planted|quadratic',
      family: 'quadratic',
      stratum: 'rational/easy',
      question: '2x^2 - 6x + 4 = 0',
      answer: 'x = 1 or x = 2',
      intermediates: { discriminant: '4', 'completed-square': '2(x - 3/2)^2 - 1/2', factorised: '(2x - 2)(x - 2)' },
      rulesExpected: ['formula', 'complete-square', 'factorise'],
      level: 'O/IGCSE',
    };
    expect(checkQuadratic(planted).some((p) => p.includes('not in lowest terms'))).toBe(true);
    const canonical: CorpusItem = { ...planted, intermediates: { ...planted.intermediates, factorised: '2(x - 1)(x - 2)' } };
    expect(checkQuadratic(canonical)).toEqual([]);
  });

  it('a complex pair listed minus-first is reported', () => {
    const item = TRAINING.families.quadratic.items.find((i) => i.stratum === 'complex/easy' && i.answer.includes(' or x = '));
    if (!item) throw new Error('no complex/easy pair in TRAINING');
    const [first, second] = item.answer.slice(4).split(' or x = ');
    const planted: CorpusItem = { ...item, answer: `x = ${second} or x = ${first}` };
    expect(checkQuadratic(planted).some((p) => p.includes('answer must read'))).toBe(true);
  });

  it('a derivative that drops the chain factor is reported', () => {
    const item = TRAINING.families.derivative.items.find((i) => i.stratum === 'chain' && i.intermediates.outer !== undefined);
    if (!item) throw new Error('no chain item in TRAINING');
    const planted: CorpusItem = { ...item, answer: item.intermediates.dinner };
    expect(checkDerivative(planted).length).toBeGreaterThan(0);
  }, SLOW);
});

describe('the exact reader and helpers', () => {
  it('reads the completed square and the factor forms exactly', () => {
    expect(polyEq(parsePoly('2(x - 3/2)^2 + 1/2'), [rat(5n), rat(-6n), rat(2n)])).toBe(true);
    expect(polyEq(parsePoly('-(x + 2)(3x + 1)'), [rat(-2n), rat(-7n), rat(-3n)])).toBe(true);
  });

  it('a root that does not parse throws, and a root with an unknown name throws', () => {
    expect(() => parseRoot('(3 + sqrt(5)')).toThrow();
    expect(() => parseRoot('(3 + root(5))/2')).toThrow();
  });

  it('a golden surd root satisfies x² - 3x - 1 exactly and reads back in its one canonical form', () => {
    const z = parseRoot('(3 + sqrt(5))/2');
    const p = parsePoly('x^2 - 3x + 1');
    expect(cxIsZero(polyAt(p, z))).toBe(true);
    expect(canonicalRoot(z)).toBe('(3 + sqrt(5))/2');
    expect(canonicalRoot(parseRoot('(9 + 2*sqrt(5))/2'))).toBe('(9 + 2*sqrt(5))/2');
    expect(canonicalRoot(parseRoot('(9 + 2*sqrt(5))/2'))).not.toBe(canonicalRoot(parseRoot('(9 - 2*sqrt(5))/2')));
  });

  it('radicands: 12 is not squarefree, 6 is, and 1 is never a simplified radical', () => {
    expect(isSquarefreeAboveOne(12n)).toBe(false);
    expect(isSquarefreeAboveOne(6n)).toBe(true);
    expect(isSquarefreeAboveOne(1n)).toBe(false);
    expect(radicandsIn('(3 + sqrt(12))/2')).toEqual([12n]);
  });

  it('decimals are exact: 3/8 reads as 0.375 and 0.25 as 1/4', () => {
    expect(ratToDecimal(rat(3n, 8n))).toBe('0.375');
    expect(ratToDecimal(rat(1n, 3n))).toBeNull();
    expect(ratToString(ratFromDecimal('0.25'))).toBe('1/4');
    expect(polyEq(parsePoly('0'), [])).toBe(true);
    expect(polyEq([ZERO], [])).toBe(true);
  });
});
