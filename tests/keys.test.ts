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
import { KEY_GROUPS, allKeys, groupsForMode, type KeyDef, type KeyGroup } from '../src/renderer/src/calc/keys'
import { latexToMath } from '../src/renderer/src/math/latexToMath'
import { casioToMath, evaluateBaseN, evaluateComp } from '../src/renderer/src/calc/engine'
import { constantScope } from '../src/renderer/src/calc/constants'
import { math } from '../src/renderer/src/math/expr'
import { MODE_LABELS } from '../src/renderer/src/calc/calcStore'

beforeEach(resetGlobals)

/**
 * A template with its boxes filled: the selection (#0) as the letter x and each box to fill
 * (#?) as 2. A letter, not a digit, for the selection, because a template that makes a new
 * name out of it — x with a subscript became x1, a name the engine has no value for — passed
 * with a digit (4 with a subscript read as 42) and failed on the first student. Not 1 for the
 * box: log base 1 of anything is 0/0, and that breaks a key that is otherwise fine.
 */
const filled = (tex: string): string => tex.replace(/#0/g, 'x').replace(/#\?/g, '2')

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
        if (k.texDeg) {
          const d = math.evaluate(casioToMath(latexToMath(filled(k.texDeg))), { ...constantScope(), ...ctx.vars, i: math.complex(0, 1), Ans: ctx.ans })
          expect(isFiniteValue(d), `${k.id} in degrees: ${k.texDeg}`).toBe(true)
        }
        continue
      }
      expect(k.texDeg, `${k.id}: only the complex polar key has a degrees form`).toBeUndefined()
      const out = evaluateComp(src, ctx)
      if (k.id === 'inf') {
        expect(out.value).toBe(Infinity)
        continue
      }
      expect(isFiniteValue(out.value), `${k.id}: ${src} → ${String(out.value)}`).toBe(true)
    }
    // Two the student is likely to meet first, by value.
    expect(Number(evaluateComp(latexToMath(inContext(keys.find((k) => k.id === 'degree')!)), { ...ctx, angle: 'rad' }).value)).toBeCloseTo(0.5)
    expect(Number(evaluateComp(latexToMath(keys.find((k) => k.id === 'ncr')!.tex!.replace('#0', '4').replace('#?', '2')), ctx).value)).toBe(6)
  })

  it('writes the polar form in the angle unit shown beside the field', () => {
    // e^{iθ} is radians whatever the switch says, so the degrees form turns θ into radians on
    // the way in: 2∠90° is 2i, and the same key in radians gave −0.9 + 1.8i while the extras
    // line under it reported the angle in degrees.
    const polar = keys.find((k) => k.id === 'polar')!
    const at = (tex: string, r: string, th: string): { re: number; im: number } =>
      math.complex(math.evaluate(casioToMath(latexToMath(tex.replace('#0', r).replace('#?', th))), { ...constantScope(), i: math.complex(0, 1) }) as never) as unknown as { re: number; im: number }
    const deg = at(polar.texDeg!, '2', '90')
    expect(deg.re).toBeCloseTo(0, 9)
    expect(deg.im).toBeCloseTo(2, 9)
    const rad = at(polar.tex!, '2', '\\frac{\\pi}{2}')
    expect(rad.re).toBeCloseTo(0, 9)
    expect(rad.im).toBeCloseTo(2, 9)
    expect(polar.hint).toMatch(/angle unit/)
  })

  it('gives the Bases field text its own engine reads', () => {
    const bases = KEY_GROUPS.find((g) => g.id === 'bases')!
    for (const k of bases.keys) {
      const text = k.tex!.endsWith('(') ? `${k.tex}1)` : /^[A-F]$/.test(k.tex!) ? k.tex! : `1${k.tex}1`
      expect(Number.isFinite(evaluateBaseN(text, 16)), `${k.id}: ${text}`).toBe(true)
    }
  })

  it('walks the boxes of ∫, Σ and Π top to bottom, and says so', () => {
    // MathLive visits the boxes in its own order — the top limit, the bottom limit, then the
    // expression — and the ▶ key follows it. The old hop into the bottom limit first sent ▶
    // from there into the expression, then the top limit, then back into the bottom one: ∫ 0 ▶
    // 1 ▶ x ▶ ▶ 5 typed \int_{05}^{x}1\,dx. So no key jumps after inserting, and every hint
    // tells the student the order the boxes come in.
    for (const id of ['integral', 'sum', 'prod']) {
      const k = keys.find((x) => x.id === id)!
      expect(k.tex, id).toMatch(/^\\(int|sum)|^\\prod/)
      expect(k.hint, id).toMatch(/top (limit|number), ▶ for the bottom one, ▶ for the expression/)
    }
    expect(readFileSource('panels/Maths.tsx')).not.toMatch(/moveToNextPlaceholder/)
  })

  it('offers no key that makes a name the engine cannot use', () => {
    // A subscript key made x₁, which the converter reads as x1: a name with no value, and the
    // Variables drawer offers only A–F, M, x and y. Every template is filled with x above, so
    // a template that turns the selection into a new name fails that test; this pins the shape.
    for (const k of keys) if (k.tex) expect(k.tex, k.id).not.toMatch(/#0_\{/)
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
    expect(latexToMath(filled(functions.keys.find((x) => x.id === 'sin')!.more![0].tex!))).toBe('asin(x)')
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

  it('labels the polar keys in words, not with the handheld’s Pol and Rec', () => {
    for (const k of allKeys()) expect(k.label, k.id).not.toMatch(/^(Pol|Rec)$/)
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
