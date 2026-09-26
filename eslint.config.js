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
  }
)
