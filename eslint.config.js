// ESLint flat config. `npm run lint` must report 0 errors. The warnings below are the rules that
// would demand a mass rewrite for no behaviour gain; each says why it is only a warning. House
// style: a suppression in the code carries its reason after `--`, so the next reader knows what
// was weighed, and a suppression whose rule no longer fires is itself an error (see below).
//
// typescript-eslint parses through the JavaScript compiler API, which the native TypeScript 7
// package no longer ships, so `typescript` in package.json stays on the 6.x line.

import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

// Any reach for the method, not only a call: x.toFixed(2), x?.toFixed(2), x['toFixed'](2),
// Number.prototype.toFixed.call(x), x.toFixed.bind(x).
const WRITER_MESSAGE = 'A number for the screen goes through math/format.ts (fmt, fmtLabel, formatQuantity), not toFixed/toPrecision/toExponential.'
const FENCE_TO_FIXED = [
  { selector: 'MemberExpression[computed=false][property.name=/^(toFixed|toPrecision|toExponential)$/]', message: WRITER_MESSAGE },
  { selector: 'MemberExpression[computed=true][property.value=/^(toFixed|toPrecision|toExponential)$/]', message: WRITER_MESSAGE }
]
// 1e-12 however it is spelt: 1e-12, 1E-12, 1.0e-12, 1e-012, 0.000000000001 (a minus is a separate token).
const FENCE_NOISE = {
  selector: 'Literal[raw=/^(1(\\.0*)?e-0*12|0\\.0{11}1)$/i]',
  message: 'Rounding noise is judged by math/noise.ts (isNoise, sameNumber), relative to the inputs, not by a fixed 1e-12.'
}

/**
 * The files that may still call toFixed/toPrecision ('toFixed'), use a 1e-12 ('noise') or both.
 * The final list is the first group; the interim list shrinks file by file as each clean-up part
 * moves its numbers (all gone by the end of CW9). Never add an interim file.
 */
export const FENCE_ALLOWED = [
  // Final: the number writer itself, and the noise rule's own constants.
  { files: ['src/renderer/src/math/format.ts', 'src/renderer/src/math/noise.ts'], allow: 'both' },
  // Interim (2026-10-09: 29 files; 2026-10-10: 20, after CW3 and CW3b; 2026-10-11: 15, after CW9-N3). Only hand-picked 1e-12 floors
  // are left here, moved to math/noise.ts by CW9: every toFixed/toPrecision outside the writer is
  // gone or marked. A line that stays is marked in place (eslint-disable-next-line … -- why) and is
  // part of the final list; so is a line parked for the owner, whose reason names its item.
  { files: ['src/renderer/src/calc/roots.ts'], allow: 'noise' }, // 1 × 1e-12 — CW9
  { files: ['src/renderer/src/core/evaluate.ts'], allow: 'noise' }, // 2 × 1e-12 — CW9
  { files: ['src/renderer/src/lab/fit.ts'], allow: 'noise' }, // 1 × 1e-12 — CW9
  { files: ['src/renderer/src/math/geometry.ts'], allow: 'noise' }, // 6 × 1e-12 — CW9
  { files: ['src/renderer/src/math/graphs.ts'], allow: 'noise' }, // 3 × 1e-12 — CW9
  { files: ['src/renderer/src/math/lego.ts'], allow: 'noise' }, // 1 × 1e-12 — CW9
  { files: ['src/renderer/src/math/shapes.ts'], allow: 'noise' }, // 5 × 1e-12 — CW9
  { files: ['src/renderer/src/questions/legoPart.ts'], allow: 'noise' }, // 2 × 1e-12 — CW9
]

export default tseslint.config(
  {
    // Build output, dependencies and the vendored Pyodide/Jolt bundles are not ours to lint.
    ignores: ['out/', 'dist/', 'node_modules/', 'src/renderer/public/']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node }
    },
    linterOptions: {
      // A disable comment for a rule that no longer fires is a stale claim; it must go.
      reportUnusedDisableDirectives: 'error'
    },
    rules: {
      // A leading underscore is the house way of saying "this binding is intentionally unused"
      // (callback signatures, destructuring the rest away).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
      ]
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,
      // The rules below come from the React Compiler, which PhysLab does not use. They flag
      // patterns that are fine without it — three.js objects built in a useMemo and mutated in an
      // effect, a prop copied into state, Date.now() for a timer's start — and making them errors
      // would mean rewriting working render code for no change in behaviour. Kept as warnings so
      // new code can still see them.
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/error-boundaries': 'warn',
      // Fires on a useMemo whose result is mutated afterwards — the velocity arrows' scratch
      // slots, filled in every frame. Without the compiler there is no memoisation to lose.
      'react-hooks/preserve-manual-memoization': 'warn'
    }
  },
  {
    // The clean-up's fences (CLEANUP-PLAN.md CW1). Numbers reach a screen through one writer,
    // math/format.ts, and rounding noise is judged by one rule, math/noise.ts: a new toFixed or
    // toPrecision elsewhere, or a hand-picked 1e-12, is an error. FENCE_ALLOWED below lists the
    // files that may still have them, each with its reason.
    files: ['src/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', ...FENCE_TO_FIXED, FENCE_NOISE] }
  },
  ...FENCE_ALLOWED.map(({ files, allow }) => ({
    files,
    rules: { 'no-restricted-syntax': allow === 'both' ? 'off' : ['error', ...(allow === 'toFixed' ? [FENCE_NOISE] : FENCE_TO_FIXED)] }
  }))
)
