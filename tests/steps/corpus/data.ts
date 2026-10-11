/**
 * The two corpus sets, built once when this module is imported: TRAINING (1000 items per family) and GATING
 * (300 per family, disjoint from TRAINING). See build.ts for how a set is filled and docs/knowledge/steps-corpus.md
 * for the strata and the counts.
 */

import { buildSet, SetBuild } from './build';

const training = buildSet('train', new Set<string>());
const gating = buildSet('gate', training.used);

export const TRAINING: SetBuild = training.set;
export const GATING: SetBuild = gating.set;
