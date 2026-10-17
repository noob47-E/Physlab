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
import { keypadToMath, evaluateBaseN, evaluateComp } from '../src/renderer/src/calc/engine'
import { constantScope } from '../src/renderer/src/calc/constants'
import { math } from '../src/renderer/src/math/expr'
import { LISTED_MODES, MODE_HINTS, MODE_LABELS } from '../src/renderer/src/calc/calcStore'

beforeEach(resetGlobals)

/**
 * A template with its boxes filled: the selection (#0, or #@ where an empty selection must leave
 * no box behind) as the letter x and each box to fill (#?) as 2. A letter, not a digit, for the
 * selection, because a template that makes a new name out of it — x with a subscript became x1, a
 * name the engine has no value for — passed with a digit (4 with a subscript read as 42) and failed
 * on the first student. Not 1 for the box: log base 1 of anything is 0/0, and that breaks a key
 * that is otherwise fine.
 */
const filled = (tex: string): string => tex.replace(/#[0@]/g, 'x').replace(/#\?/g, '2')

/** A key that is not an expression on its own — an operator, a bracket, a degree sign — in a line that is. */
function inContext(k: KeyDef): string {
  const tex = filled(k.tex!)
  if (['times', 'div', 'plus', 'minus', 'comma'].includes(k.id)) return k.id === 'comma' ? `\\operatorname{nCr}\\left(4${tex}2\\right)` : `6${tex}3`
  if (k.id === 'open' || k.id === 'close') return '(3)'
  if (k.id === 'dot') return '1.5'
  if (k.id === 'degree') return `\\sin\\left(30${k.tex!.replace(/#[0@]/, '')}\\right)`
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
        const v = math.evaluate(keypadToMath(src), { ...constantScope(), ...ctx.vars, i: math.complex(0, 1), Ans: ctx.ans })
        expect(isFiniteValue(v), `${k.id}: ${src}`).toBe(true)
        if (k.texDeg) {
          const d = math.evaluate(keypadToMath(latexToMath(filled(k.texDeg))), { ...constantScope(), ...ctx.vars, i: math.complex(0, 1), Ans: ctx.ans })
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
      math.complex(math.evaluate(keypadToMath(latexToMath(tex.replace(/#[0@]/, r).replace('#?', th))), { ...constantScope(), i: math.complex(0, 1) }) as never) as unknown as { re: number; im: number }
    const deg = at(polar.texDeg!, '2', '90')
    expect(deg.re).toBeCloseTo(0, 9)
    expect(deg.im).toBeCloseTo(2, 9)
    const rad = at(polar.tex!, '2', '\\frac{\\pi}{2}')
    expect(rad.re).toBeCloseTo(0, 9)
    expect(rad.im).toBeCloseTo(2, 9)
    expect(polar.hint).toMatch(/angle unit/)
  })

  it('marks the ×10ˣ key as standard form: its own mark, never the × key’s plain \\times', () => {
    // The key wrote \times10^{…} — exactly what the × key and then 10^ write — so the converter could not
    // tell the number 2×10³ from a product, and 1 ÷ 2 ×10ˣ 3 read as (1 ÷ 2) × 10³ = 500, not 0.0005.
    // \mathord{\times} is the mark: MathLive keeps it as inserted (typing, moving, deleting and setValue
    // were tried in the browser) and draws a tight ×10, and latexToMath reads it with its 10^power as one number.
    const e10 = keys.find((k) => k.id === 'e10')!
    expect(e10.tex).toContain('\\mathord{\\times}10^{#?}')
    expect(e10.tex!.replace('\\mathord{\\times}', '')).not.toContain('\\times')
    expect(keys.find((k) => k.id === 'times')!.tex).toBe('\\times')
    // #@ is the selection and nothing else: #0 puts an empty box in front of the key when nothing is
    // selected, the first digit typed lands in that box, and 1 ÷ 2 ×10ˣ 3 became 1 ÷ 23 ×10^▢ (browser, MathLive 0.110).
    expect(e10.tex).toMatch(/^#@/)
    expect(e10.tex).not.toContain('#0')
    // Pressed after 1 ÷ 2 with a 3 in its box, it is the number 2×10³ on the line.
    expect(latexToMath(`1\\div2${e10.tex!.replace('#@', '').replace('#?', '3')}`)).toBe('1/2e3')
    expect(e10.hint).toMatch(/Standard form/)
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

describe('H11 — a key pressed after what the student typed leaves no empty box before it', () => {
  // MathLive fills #0 with a box when nothing is selected and puts the caret in it: n! after a 5 made 5▢!, and the
  // next digit went into the box. The same for %, ° and r∠θ. #@ is the selection and nothing more — the ×10ˣ key
  // already says so (browser check on MathLive 0.110) — and wraps a selection exactly as #0 does.
  const POSTFIX = ['fact', 'percent', 'degree', 'polar']
  const key = (id: string): KeyDef => allKeys().find((k) => k.id === id)!
  /** What MathLive inserts with nothing selected: the template with its #@ taken out. */
  const bare = (tex: string): string => tex.replace('#@', '')

  it('starts the n!, %, ° and r∠θ templates, both polar ones, with #@ and never #0', () => {
    for (const id of POSTFIX) {
      const k = key(id)
      expect(k.tex, id).toMatch(/^#@/)
      expect(k.tex, id).not.toContain('#0')
      if (k.texDeg) {
        expect(k.texDeg, `${id} in degrees`).toMatch(/^#@/)
        expect(k.texDeg, `${id} in degrees`).not.toContain('#0')
      }
    }
    expect(key('polar').texDeg).toBeDefined()
  })

  it('leaves no box but the ones the student is meant to fill: none for n!, % and °, one (the angle) for r∠θ', () => {
    const boxes = (tex: string): number => (bare(tex).match(/#[0@?]/g) ?? []).length
    for (const id of ['fact', 'percent', 'degree']) expect(boxes(key(id).tex!), id).toBe(0)
    expect(boxes(key('polar').tex!), 'polar').toBe(1)
    expect(boxes(key('polar').texDeg!), 'polar in degrees').toBe(1)
  })

  it('adds only its own mark after a number already typed: 5 then n! is 5!, 50 then % is 0.5, 30 then ° is a sine of 0.5', () => {
    const after = (typed: string, id: string): string => typed + bare(key(id).tex!)
    expect(latexToMath(after('5', 'fact'))).toBe('5!')
    expect(Number(evaluateComp(latexToMath(after('5', 'fact')), ctx).value)).toBe(120)
    expect(Number(evaluateComp(latexToMath(after('50', 'percent')), ctx).value)).toBe(0.5)
    expect(Number(evaluateComp(latexToMath(`\\sin\\left(${after('30', 'degree')}\\right)`), { ...ctx, angle: 'rad' }).value)).toBeCloseTo(0.5, 12)
  })

  it('still wraps a selection: with 5 selected n! makes 5!, % makes 5%, ° makes 5°, and r∠θ makes 2 × e to the iθ', () => {
    const wrap = (id: string, selected: string): string => key(id).tex!.replace('#@', selected)
    expect(latexToMath(wrap('fact', '5'))).toBe('5!')
    expect(latexToMath(wrap('percent', '5'))).toBe('5%')
    expect(latexToMath(wrap('degree', '5'))).toBe('5°')
    const polar = math.complex(math.evaluate(keypadToMath(latexToMath(wrap('polar', '2').replace('#?', '\\frac{\\pi}{2}'))), { ...constantScope(), i: math.complex(0, 1) }) as never) as unknown as { re: number; im: number }
    expect(polar.re).toBeCloseTo(0, 9)
    expect(polar.im).toBeCloseTo(2, 9)
  })

  it('still reads a percent after a power: .5 ×10ˣ 2, out of the exponent, then % is 50 %, which is 0.5', () => {
    // The % key adds only itself after the power, as it does after any number (the percent rule that reads the
    // whole e-number is pinned below). With the caret still inside the exponent the key writes its % there, as it
    // always has and with or without a leading box: that is 10^(2%), not a percent of the number.
    const e10 = key('e10')
    const line = `.5${bare(e10.tex!).replace('#?', '2')}${bare(key('percent').tex!)}`
    expect(latexToMath(line)).toBe('.5e2%')
    expect(Number(evaluateComp(latexToMath(line), ctx).value)).toBeCloseTo(0.5, 12)
  })
})

describe('the engine’s input step: a literal × multiplies, and ᴇ is part of its number', () => {
  // The matrix box, the spreadsheet cells and the with-values boxes hand their text straight to the engine's
  // input step (calc/engine.ts), so a literal × reaches it. It used to turn every "×10" into "*10^", with or
  // without a ^ after it.
  const run = (s: string): unknown => math.evaluate(keypadToMath(s), { ...constantScope(), x: 2, x2: 5, Ans: 5, 'α2': 5 })
  const near = (got: unknown, want: number): void => {
    expect(typeof got, String(got)).toBe('number')
    expect((got as number) / want).toBeCloseTo(1, 12)
  }

  it('reads × as a multiplication, always: 2×100, 3×10+1, 2×10', () => {
    expect(run('2×100')).toBe(200)
    expect(run('3×10+1')).toBe(31)
    expect(run('2×10')).toBe(20)
    // Left to right, and a printed 1.6×10^-19 still reads back as the number it prints.
    expect(run('1÷2×10^3')).toBe(500)
    near(run('1.6×10^-19'), 1.6e-19)
    near(run('6.02×10^23×2'), 1.204e24)
    expect(run('3×10^2')).toBe(300)
  })

  it('joins ᴇ to the number in front of it, so 1 ÷ 2ᴇ3 is 1 ÷ 2000', () => {
    near(run('1÷2ᴇ3'), 0.0005)
    near(run('1.6ᴇ−19'), 1.6e-19)
    near(run('1.6ᴇ-19'), 1.6e-19)
    expect(run('2ᴇ3')).toBe(2000)
    expect(run('3ᴇ8')).toBe(3e8)
    expect(run('2ᴇ+3')).toBe(2000)
    near(run('6.02ᴇ23×2'), 1.204e24)
    near(run('6÷2ᴇ−2'), 300)
    near(run('.5ᴇ2'), 50)
    // A percent takes the whole e-number: 3ᴇ2% is 300% = 3 ("3e" and 2% was "there is no function called e").
    near(run('3ᴇ2%'), 3)
    expect(run('50%')).toBe(0.5)
  })

  it('a percent takes the whole number in front of it: a leading dot, a trailing dot, an e-power', () => {
    // The percent rule wanted a digit first and digits after a dot, so ".5e2%" lost its dot to "5e2" (".(5e2/100)"
    // is no line) and "2.e3%" lost all but its 3 ("2.e(3/100)": "no function called e"). It now takes the same
    // number the ᴇ rule does: .5e2 % = 50 % = 0.5, 2.e3 % = 2000 % = 20.
    near(run('.5ᴇ2%'), 0.5)
    near(run('2.ᴇ3%'), 20)
    near(run('.5e2%'), 0.5)
    near(run('2.e3%'), 20)
    near(run('1.6e-2%'), 1.6e-4)
    // ".5%" was refused the same way before the ×10ˣ key existed; 2.% is 0.02 on the same rule.
    near(run('.5%'), 0.005)
    near(run('2.%'), 0.02)
    // Guards: whole numbers and decimals are as they were, and the percent binds to its own number (6 ÷ 0.02).
    near(run('12.5%'), 0.125)
    near(run('6÷2%'), 300)
    near(run('6÷2.e1%'), 30)
    expect(run('50%')).toBe(0.5)
  })

  it('a number that begins in the middle of another number is no percent of anything', () => {
    // 1.2.5% was rewritten to "1.(2.5/100)", which mathjs reads as 1. × 0.025 and answers 0.025: a number nobody
    // typed. A digit or a dot right before a candidate makes it the tail of something longer, so it is left alone
    // and the line is refused. What the student meets is the refusal: since P-NUM, preprocess (which
    // keypadToMath ends with) turns every postfix % into a division itself, so the text in between is
    // no longer this step's alone to pin.
    expect(keypadToMath('1.2.5%')).not.toBe('1.(2.5/100)')
    expect(() => run('1.2.5%')).toThrow()
    expect(() => run('1..5%')).toThrow()
  })

  it('scales anything that is not a number by ten to the power instead: a bracket, a letter, Ans', () => {
    expect(run('(1+2)ᴇ3')).toBe(3000)
    expect(run('xᴇ3')).toBe(2000)
    expect(run('Ansᴇ3')).toBe(5000)
    // A name keeps its digits, Greek letters too: α2ᴇ3 is α2 × 10³, not α next to the literal 2e3. x2ᴇ3 is the
    // name x2 (5 here) times 10³, never the literal "x2e3".
    expect(run('α2ᴇ3')).toBe(5000)
    expect(run('x2ᴇ3')).toBe(5000)
    expect(keypadToMath('x2ᴇ3')).not.toContain('x2e3')
    // A power that is no whole number is not a literal either.
    near(run('2ᴇ0.5'), 2 * 10 ** 0.5)
  })
})

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : name.endsWith('.ts') || name.endsWith('.tsx') ? [p] : []
  })

describe('nothing that looks like a handheld calculator survives', () => {
  // A word a student reads on screen. The engine's own throw messages are not on screen: the
  // Maths screen turns every one into a sentence (calc/errors.ts, tests/maths.test.ts), and
  // tests/calc.test.ts pins them, so a `throw new Error('…')` and the pattern that recognises
  // it are stripped before the scan.
  // The last two are the search palette's old rows, "Calculator CMPLX" and "Calculator BASE-N".
  const BANNED = [/\bSHIFT\b/, /\bALPHA\b/, /\bSTO\b/, /\bRCL\b/, /S⇔D/, /Ran#/, /Math ERROR/, /Syntax ERROR/, /Math▲/, /Calculator (COMP|CMPLX|BASE-N)/, /Calculator \$\{/]
  const onScreen = (src: string): string =>
    src
      .replace(/throw new Error\((['"`])[^)]*\1\)/g, '')
      .replace(/\/[^\n/]+\/[a-z]*\.test\(/g, '')
      // Comments explain why the old names went; they are not on screen either.
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')

  it('shows none of the old legends in the panels, the calculator code or the search palette', () => {
    const hits: string[] = []
    for (const p of [...files(join(ROOT, 'panels')), ...files(join(ROOT, 'calc')), join(ROOT, 'app', 'SearchPalette.tsx')]) {
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
    // Ctrl+K offered "Calculator CMPLX" from the raw ids after every label on the screen had
    // gone through MODE_LABELS.
  })

  it('offers one Ctrl+K row per calculator mode the Calculator offers, titled with its label and hinted with its line', async () => {
    const { buildItems } = await import('../src/renderer/src/app/SearchPalette')
    const rows = buildItems().filter((r) => r.group === 'Calculator')
    // The modes the screen has put away (Complex is Numbers' now; Matrices, Vectors, Statistics, Table, Sheet, Units and Measure are being
    // redesigned) are not offered by search either: the rows follow the one list the chips and the More menu read.
    const modes = [...LISTED_MODES] as Array<keyof typeof MODE_LABELS>
    expect(rows.length).toBe(modes.length)
    for (const cm of modes) {
      const row = rows.find((r) => r.title === `Calculator: ${MODE_LABELS[cm]}`)
      expect(row, cm).toBeDefined()
      expect(row?.hint, cm).toBe(MODE_HINTS[cm])
    }
  }, 30000)

  it('lets a key’s relatives hang below the last row without being clipped', () => {
    // A group with overflow-y: auto clips the relatives row of its last keys (polar → x, y;
    // random → random 0–1) and grows a scrollbar instead; only the Constants group is tall
    // enough to need one.
    const css = readFileSource('styles.css')
    expect(css).toMatch(/\.keypad-body > \.keys-constants \{\s*overflow-y: auto;\s*\}/)
    const others = css.slice(css.indexOf('.keypad-body > .keys:not(.keys-numbers) {'), css.indexOf('.keypad-body > .keys-constants')).replace(/\/\*[\s\S]*?\*\//g, '')
    expect(others).not.toMatch(/overflow/)
    const functions = KEY_GROUPS.find((g) => g.id === 'functions')!
    expect(functions.keys.slice(-functions.cols).some((k) => k.more)).toBe(true)
    expect(KEY_GROUPS.find((g) => g.id === 'constants')!.keys.some((k) => k.more)).toBe(false)
  })

  it('keeps the keypad from ever taking the focus, and MathLive’s own keyboard off', () => {
    const maths = readFileSource('panels/Maths.tsx')
    const keypad = maths.slice(maths.indexOf('const KeypadPopover'), maths.indexOf('function Answer(')) + readFileSource('ui/Keypad.tsx')
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
