// The popup keypad's keys: every template the calculator can read, every key with a hint, and
// nothing left over from the handheld the panel used to imitate.
//
// A key is data (calc/keys.ts) and the field is MathLive, so the join to check is the LaTeX a
// key inserts → latexToMath → the engine. A key that inserts something unreadable would only be
// found by a student pressing it.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { RENDERER_SRC as ROOT } from './helpers/repo'
import { resetGlobals } from './helpers/globals'
import { KEY_GROUPS, LOWER_FIRST, allKeys, groupsForMode, type KeyDef, type KeyGroup } from '../src/renderer/src/calc/keys'
import { latexToMath } from '../src/renderer/src/math/latexToMath'
import { casioToMath, evaluateBaseN, evaluateComp } from '../src/renderer/src/calc/engine'
import { constantScope } from '../src/renderer/src/calc/constants'
import { math } from '../src/renderer/src/math/expr'
import { MODE_LABELS } from '../src/renderer/src/calc/calcStore'

beforeEach(resetGlobals)

/**
 * A template with its boxes filled: the selection (#0) as 4 and each box to fill (#?) as 2.
 * Not 1 and 1: log base 1 of 1 is 0/0, and those two are the only values that break a key
 * that is otherwise fine.
 */
const filled = (tex: string): string => tex.replace(/#0/g, '4').replace(/#\?/g, '2')

/** A key that is not an expression on its own — an operator, a bracket, a degree sign — in a line that is. */
function inContext(k: KeyDef): string {
  const tex = filled(k.tex!)
  if (['times', 'div', 'plus', 'minus', 'comma'].includes(k.id)) return k.id === 'comma' ? `\\operatorname{nCr}\\left(4${tex}2\\right)` : `6${tex}3`
  if (k.id === 'open' || k.id === 'close') return '(3)'
  if (k.id === 'dot') return '1.5'
  if (k.id === 'degree') return `\\sin\\left(30${k.tex!.replace('#0', '')}\\right)`
  return tex
}

const ctx = { vars: { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, M: 7, x: 2, y: 3 }, ans: 5, angle: 'deg' as const }

const groupOf = (k: KeyDef): KeyGroup => KEY_GROUPS.find((g) => g.keys.some((top) => top === k || top.more?.includes(k)))!

const isFiniteValue = (v: unknown): boolean => {
  if (typeof v === 'number') return Number.isFinite(v)
  if (math.isComplex(v)) {
    const c = v as { re: number; im: number }
    return Number.isFinite(c.re) && Number.isFinite(c.im)
  }
  if (math.isMatrix(v)) return (v as { toArray: () => unknown[] }).toArray().flat(2).every((x) => typeof x === 'number' && Number.isFinite(x))
  return false
}

describe('every key the keypad offers', () => {
  const keys = allKeys()

  it('is a real list', () => {
    expect(keys.length).toBeGreaterThan(60)
    expect(KEY_GROUPS.map((g) => g.id)).toEqual(['numbers', 'functions', 'calculus', 'constants', 'templates', 'complex', 'bases'])
  })

  it('has a plain-words hint, a label and a unique id', () => {
    const ids = new Set<string>()
    for (const k of keys) {
      expect(k.hint, k.id).toMatch(/\S/)
      expect(k.hint, k.id).not.toMatch(/\\|\{|\}|#/)
      expect(k.label, k.id).toMatch(/\S/)
      expect(ids.has(k.id), `duplicate id ${k.id}`).toBe(false)
      ids.add(k.id)
      expect(Boolean(k.tex) !== Boolean(k.act), `${k.id} must insert or act, not both or neither`).toBe(true)
    }
  })

  it('inserts LaTeX the converter reads and the engine evaluates', () => {
    for (const k of keys) {
      if (!k.tex) continue
      const group = groupOf(k)
      if (group.id === 'bases') continue // plain text for the Bases field, checked below
      const src = latexToMath(inContext(k))
      expect(src, `${k.id}: ${k.tex}`).toMatch(/\S/)
      if (group.id === 'complex' || k.id === 'i') {
        const v = math.evaluate(casioToMath(src), { ...constantScope(), ...ctx.vars, i: math.complex(0, 1), Ans: ctx.ans })
        expect(isFiniteValue(v), `${k.id}: ${src}`).toBe(true)
        continue
      }
      const out = evaluateComp(src, ctx)
      if (k.id === 'inf') {
        expect(out.value).toBe(Infinity)
        continue
      }
      expect(isFiniteValue(out.value), `${k.id}: ${src} → ${String(out.value)}`).toBe(true)
    }
    // Two the student is likely to meet first, by value.
    expect(Number(evaluateComp(latexToMath(inContext(keys.find((k) => k.id === 'degree')!)), { ...ctx, angle: 'rad' }).value)).toBeCloseTo(0.5)
    expect(Number(evaluateComp(latexToMath(filled(keys.find((k) => k.id === 'ncr')!.tex!)), ctx).value)).toBe(6)
  })

  it('gives the Bases field text its own engine reads', () => {
    const bases = KEY_GROUPS.find((g) => g.id === 'bases')!
    for (const k of bases.keys) {
      const text = k.tex!.endsWith('(') ? `${k.tex}1)` : /^[A-F]$/.test(k.tex!) ? k.tex! : `1${k.tex}1`
      expect(Number.isFinite(evaluateBaseN(text, 16)), `${k.id}: ${text}`).toBe(true)
    }
  })

  it('knows which templates fill their lower limit first', () => {
    expect(LOWER_FIRST.test('\\int_{#?}^{#?}#0\\,dx')).toBe(true)
    expect(LOWER_FIRST.test('\\sum_{x=#?}^{#?}#0')).toBe(true)
    expect(LOWER_FIRST.test('\\frac{#0}{#?}')).toBe(false)
  })

  it('shows the digits in every mode, and the complex and bases groups only in theirs', () => {
    for (const mode of ['COMP', 'CMPLX', 'BASE-N'] as const) {
      const ids = groupsForMode(mode).map((g) => g.id)
      expect(ids[0], mode).toBe('numbers')
      expect(ids.includes('complex'), mode).toBe(mode === 'CMPLX')
      expect(ids.includes('bases'), mode).toBe(mode === 'BASE-N')
      expect(ids.includes('calculus'), mode).toBe(mode === 'COMP')
    }
    // The = key is a real key in every mode; the cursor keys have nothing to move in a plain input.
    const numbers = KEY_GROUPS[0].keys
    expect(numbers.find((k) => k.id === 'eq')?.modes).toBeUndefined()
    expect(numbers.find((k) => k.id === 'left')?.modes).not.toContain('BASE-N')
  })

  it('keeps the inverse and hyperbolic functions behind the trig keys, not behind a SHIFT', () => {
    const functions = KEY_GROUPS.find((g) => g.id === 'functions')!
    for (const name of ['sin', 'cos', 'tan']) {
      const k = functions.keys.find((x) => x.id === name)!
      expect(k.more?.map((m) => m.id)).toEqual([`a${name}`, `${name}h`])
    }
    expect(latexToMath(filled(functions.keys.find((x) => x.id === 'sin')!.more![0].tex!))).toBe('asin(4)')
  })
})

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : name.endsWith('.ts') || name.endsWith('.tsx') ? [p] : []
  })

describe('nothing that looks like the fx-991EX survives', () => {
  // A word a student reads on screen. The engine's own throw messages are not on screen: the
  // Maths screen turns every one into a sentence (calc/errors.ts, tests/maths.test.ts), and
  // tests/calc.test.ts pins them, so a `throw new Error('…')` and the pattern that recognises
  // it are stripped before the scan.
  const BANNED = [/\bSHIFT\b/, /\bALPHA\b/, /\bSTO\b/, /\bRCL\b/, /S⇔D/, /Ran#/, /Math ERROR/, /Syntax ERROR/, /Math▲/]
  const onScreen = (src: string): string =>
    src
      .replace(/throw new Error\((['"`])[^)]*\1\)/g, '')
      .replace(/\/[^\n/]+\/[a-z]*\.test\(/g, '')
      // Comments explain why the old names went; they are not on screen either.
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')

  it('shows none of the old legends in the panels or the calculator code', () => {
    const hits: string[] = []
    for (const p of [...files(join(ROOT, 'panels')), ...files(join(ROOT, 'calc'))]) {
      const rel = relative(ROOT, p).split(sep).join('/')
      const src = onScreen(readFileSync(p, 'utf8'))
      for (const re of BANNED) if (re.test(src)) hits.push(`${rel}: ${re.source}`)
      // The mode ids ('COMP', 'CMPLX', 'BASE-N') are internal and stay — stored history names
      // them — but they must never be the text of a tag, a label or a hint.
      for (const m of src.matchAll(/(>[^<{]*<)|(label: *'[^']*')|(hint: *'[^']*')/g)) {
        if (/\b(COMP|CMPLX|BASE-N)\b/.test(m[0])) hits.push(`${rel}: ${m[0]}`)
      }
    }
    expect(hits).toEqual([])
  })

  it('names the modes in words', () => {
    for (const [id, label] of Object.entries(MODE_LABELS)) {
      expect(label, id).toMatch(/^[A-Z][a-z]+$/)
    }
    expect(MODE_LABELS.CMPLX).toBe('Complex')
    expect(MODE_LABELS['BASE-N']).toBe('Bases')
  })

  it('keeps the keypad from ever taking the focus, and MathLive’s own keyboard off', () => {
    const maths = readFileSource('panels/Maths.tsx')
    const keypad = maths.slice(maths.indexOf('const KeypadPopover'), maths.indexOf('function Answer('))
    // Every button in the popover, and the popover itself, cancels mousedown, so the field keeps
    // the caret and physical typing carries on while the keypad is open.
    const buttons = keypad.match(/<button(?:=>|[^>])*>/g) ?? []
    expect(buttons.length).toBeGreaterThan(3)
    for (const b of buttons) expect(b, b.slice(0, 80)).toMatch(/onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/)
    expect(keypad).toMatch(/className="keypad-pop"[^>]*onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/)
    const input = readFileSource('ui/MathInput.tsx')
    expect(input).toContain("mf.mathVirtualKeyboardPolicy = 'manual'")
    expect(readFileSource('styles.css')).toMatch(/::part\(virtual-keyboard-toggle\)[\s\S]{0,80}display: none/)
  })
})

function readFileSource(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8')
}
