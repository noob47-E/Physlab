// P-VEC polish: the Vector Calculator panel's numbers, fields and answers (V2, V6, V7, H6, H7, H8,
// H9), each reproduced by the part head at 1600×900, Dark, 1 □ = 1 cm, 2 d.p.
//
// The causes, found in the code:
// V2  panels/VectorCalc.tsx:277 lays the size ∠ angle row out as grid-cols-[1fr_auto_1fr_auto]; a
//     bare 1fr track's minimum is auto, which is the min-content width of the maths field in it
//     (the <math-field> is the grid item itself, width 100%, styles.css:991), so a long number widens
//     the column and runs past the panel. The k and q rows (:404, grid-cols-[1fr_auto_1fr]) and the
//     expression box (:419, a flex-1 div without min-w-0) do the same. Nothing compares a card's
//     size with what the graph can show: the 2D camera stops at 0.05 px a grid square
//     (render/CameraRig.tsx:280) and render/viewState.ts already knows the drawing's width in pixels
//     (useView.widthPx), yet the part head's 8.89×10¹⁹ cm arrow was drawn as nothing with no word why.
// V6  The card line (VectorCalc.tsx:301–304) writes the vector through KaTeX (texIJK: 8.89×10¹⁸)
//     beside "|A| = 8.89×10^18", plain text through formatMeasure. setEntry fills the size ∠ angle
//     boxes with fieldNumber (panels/vectorCalcStore.ts:585, toPrecision(12)): 4i + 4j becomes
//     "5.65685424949", and a drag rewrites a polar card the same way (planSync, :643).
// H7  The card line's θ is heading(v) (math/vec.ts:43, atan2(0, 0) = 0), so the zero vector reads
//     θ = 0° while solveMagnitudeDirection says its direction is undefined (math/vectorSolver.ts:260).
// H8  fieldNumber and ijkLatex (vectorCalcStore.ts:52, 585) write String(Number(x.toPrecision(12))):
//     "1e+21" and "1e+21\hat{i}" in a maths field. The value survives (latexToMath passes "1e+21"
//     through and mathjs reads it as the number 10²¹, not 1·e + 21), but the field shows programming
//     notation. ijkLatex also drops any component under 10⁻¹² (":52 Math.abs(c) < 1e-12 ? ''"), so
//     a 1.6×10⁻¹⁹ card switched to "typed" is written "0" and its vector is lost.
// H6  exprSolution (VectorCalc.tsx:71–95) hands a number result straight to texMeasure (:80–83):
//     1/0 answers "∞" and 0/0 "undefined"; only the vector branch (:86) refuses a division by zero.
// H9  run (VectorCalc.tsx:161–182) closes k and q into the recipe when the button is pressed (:170–174),
//     the store only follows cards (useVC.subscribe, vectorCalcStore.ts:803–808, runs the sync on a
//     cards change only) and keepAnswerTrue compares card values alone (:1219–1220), so a retyped k
//     or q never reaches the answer.
// V7  app/TopBar.tsx:310 labels the arrow notation "A" + U+20D7 (combining right arrow above), which
//     Segoe UI has no glyph for: the button shows "A□".
// H11 cardValueNow (vectorCalcStore.ts:489–501) takes whatever evaluateVectorLine (:432–437) gives,
//     and mathjs adds a bare number to every component: "8i + 2", typed on the way to "8i + 2j", reads
//     10i + 2j + 2k, "2 + 3i" reads 5i + 2j + 2k and "A − 1" 2i + 3j − k, so the arrow and any answer
//     jump to 3D. explainVectorError already has the sentence for it (:421–422).
// H12 same() (:608) and near() (:950) call two numbers equal within 1e-9 × max(1, |x|), an absolute
//     10⁻⁹ for anything small: 1.6×10⁻¹⁹ î and 3.2×10⁻¹⁹ î are "the same", so planSync leaves the
//     arrow where it was and keepAnswerTrue (:1248) never works the answer out again.
// H13 The card line writes the vector with texIJK and its size with formatMeasure, and both drop
//     anything under 10⁻¹² as drag noise (math/format.ts:280, :164): a typed 1.6×10⁻¹⁹ î reads
//     \vec{0}, with |A| = 0 beside it.
//
// The decisions (the part head's), as the contracts tested here — each is a new export of
// panels/vectorCalcStore.ts, undefined until the fixer adds it, so the tests that call it fail with
// "is not a function" (or, for the constant, "expected 0.05 to be undefined"):
// - MIN_ZOOM_2D: the 2D camera's zoom floor, px per grid square; CameraRig.tsx's minZoom is this
//   constant or the same number (a source check keeps them equal).
// - tooBigToDraw(length, settings, viewportPx = useView.getState().widthPx): null when an arrow of
//   that many grid squares fits across the drawing at the zoom floor (length ≤ viewportPx /
//   MIN_ZOOM_2D), else "Too big to draw at this scale — the graph shows vectors up to <that limit
//   through formatMeasure as a length, in the student's unit>".
// - cardLineTex(name, v, sizeKind, settings): the whole card line as one TeX string, which the panel
//   renders with <Tex>. The vector through texIJK, its size through texMeasure(len, sizeKind), and
//   θ through texMeasure(heading, 'direction') for a vector in the plane; none for one out of it;
//   "no direction" for the zero vector.
// - The size ∠ angle boxes are filled at the student's precision ("5.66", "45" at 2 d.p.), with no
//   e-notation, and the card remembers the exact vector with the texts it wrote: while both texts are
//   unchanged the card's value is that vector, so neither the card nor its arrow moves.
// - exprSolution(expr, cards, settings): moved from the panel into the store, unchanged in shape.
// - runOperation(opId): the panel's run, in the store; returns the error sentence or null. The answer
//   it makes follows k and q as it follows its cards.
// - H11: a bare number added to or taken from a vector is refused with explainVectorError's sentence
//   for it ("…like adding 3 to a vector…"), and the card waits as a half-typed one does: its arrow
//   keeps its last value and its answer is stale as 'unreadable' until the line is finished.
// - H12: the comparisons scale with the vectors themselves, so a 10⁻¹⁹ vector is followed like any
//   other, while a drag's float noise (2.875000000000001 for 2.875) is still no change.
// - H13: cardLineTex writes a tiny nonzero vector and its size in scientific form (texSci), never 0,
//   and noise beside a real size stays hidden (5∠90° holds 3.06×10⁻¹⁶ in x and is written 5ĵ).

import katex from 'katex'
import { beforeEach, describe, expect, it } from 'vitest'
import { useScene } from '../src/renderer/src/core/store'
import type { Computed, SceneSettings, VectorObj } from '../src/renderer/src/core/types'
import { toV3 } from '../src/renderer/src/math/expr'
import { formatMeasure, setNotation, superscriptPowers, texIJK, texMeasure, texSci } from '../src/renderer/src/math/format'
import { fromPolar, heading, len, toRad, type V3 } from '../src/renderer/src/math/vec'
import * as VS from '../src/renderer/src/math/vectorSolver'
import { measureText } from '../src/renderer/src/render/Labels'
import { useView } from '../src/renderer/src/render/viewState'
import {
  MIN_ZOOM_2D,
  PlainError,
  cardLineTex,
  cardValues,
  drawAnswer,
  evalNumber,
  evaluateVectorLine,
  explainVectorError,
  exprSolution,
  ijkLatex,
  removeCard,
  runOperation,
  setEntry,
  solveOperation,
  staleSentence,
  startCardSync,
  tooBigToDraw,
  useVC,
  type Card
} from '../src/renderer/src/panels/vectorCalcStore'
import { resetGlobals } from './helpers/globals'
import { readSource } from './helpers/repo'

const card = (id: number, name: string, extra: Partial<Card> = {}): Card => ({ id, name, entry: 'comp', latex: '', mag: '1', angle: '0', sceneId: '', ...extra })

const scene = () => useScene.getState()
const vectors = () => Object.values(scene().objects).filter((o): o is VectorObj => o.type === 'vector')
const compOf = (id: string) => {
  const c = scene().ev.values.get(id)
  return c?.type === 'vector' ? c.comp : undefined
}
const cardOf = (name: string) => useVC.getState().cards.find((c) => c.name === name)!
const arrowOf = (name: string) => cardOf(name).sceneId
/** A card's value as the panel and the operations read it: one pass over every card. */
const valueOf = (name: string) => {
  const cards = useVC.getState().cards
  return cardValues(cards, scene().ev)[cards.findIndex((c) => c.name === name)]
}
/** A card's field changed, as the panel's updateCard does it: one new cards array. */
const edit = (name: string, patch: Partial<Card>) => useVC.setState({ cards: useVC.getState().cards.map((c) => (c.name === name ? { ...c, ...patch } : c)) })
/** An arrow dragged on the graph to new components (the Move tool writes the free vector's def). */
const drag = (id: string, comp: V3) =>
  scene().updateObject(id, (d) => {
    if (d.type === 'vector') d.def = { kind: 'free', tail: [0, 0, 0], comp }
  })
const result = () => useVC.getState().result!
const answer = (label: string) => result().sol.answers.find((a) => a.label === label)?.tex
/**
 * An operation on the first card, pressed as the panel's run makes its answer today: the card's value
 * and a recipe naming the card it read. (H9 moves run into the store as runOperation; the H11–H13
 * tests are not about k, so they do not wait for it.)
 */
const pressFirst = (opId: 'mag' | 'scale', label: string, k = 0) => {
  const st = useVC.getState()
  const first = st.cards[0]
  const v = cardValues(st.cards, scene().ev)[0]
  if (typeof v === 'string') throw new Error(`Card ${first.name} cannot be read: ${v}`)
  const solve = (named: VS.NamedVec[], now: SceneSettings) => solveOperation(opId, named, now, k)
  useVC.setState({ result: { sol: solve([{ name: first.name, v }], scene().settings)!, label, from: { cards: [{ id: first.id, name: first.name }], solve } } })
}

/** Equal to `tol` in every component (absolute: these vectors are a few units long). */
const expectNear = (got: V3 | string | undefined, want: readonly number[], what: string, tol = 1e-12) => {
  expect(Array.isArray(got), `${what}: ${String(got)}`).toBe(true)
  const g = got as V3
  expect(
    g.every((x, i) => Math.abs(x - want[i]) <= tol),
    `${what}: ${JSON.stringify(g)} is not ${JSON.stringify(want)} to ${tol}`
  ).toBe(true)
}
/** Equal to a part in 10¹² of the vector's own size, for a vector of 10²¹ or 10⁻¹⁹. */
const expectSameSize = (got: V3 | string | undefined, want: readonly number[], what: string) => {
  expect(Array.isArray(got), `${what}: ${String(got)}`).toBe(true)
  const g = got as V3
  const size = Math.hypot(...want)
  expect(
    g.every((x, i) => Math.abs(x - want[i]) <= 1e-12 * size),
    `${what}: ${JSON.stringify(g)} is not ${JSON.stringify(want)}`
  ).toBe(true)
}

/** A number in programming notation: 1e+21, 1.6e-19, 2E5. */
const E_FORM = /\d\s*e\s*[+-]?\s*\d/i

/** The size the part head typed, 8888888888888888888, as the double a field reads it to (8.89×10¹⁸). */
const NINETEEN_EIGHTS = Number('8888888888888888888')

/** The TeX through the real KaTeX, refusing anything it cannot parse; the text a student sees. */
const render = (tex: string): string =>
  katex
    .renderToString(tex, { throwOnError: true, strict: 'ignore', output: 'html' })
    .replace(/<[^>]*>/g, '')

const VC_SRC = 'src/renderer/src/panels/VectorCalc.tsx'
/** The source from one marker up to the next, the first one included; '' when either is gone. */
const between = (src: string, from: string, to: string): string => {
  const a = src.indexOf(from)
  const b = a < 0 ? -1 : src.indexOf(to, a + from.length)
  return b < 0 ? '' : src.slice(a, b)
}
/** The tracks of the first grid-cols-[…] template in a piece of JSX. */
const tracksIn = (jsx: string): string[] => (/grid-cols-\[([^\]]+)\]/.exec(jsx)?.[1] ?? '').split('_')
/** A track whose item may be narrower than its content. A bare 1fr is minmax(auto, 1fr): its floor is the content. */
const letsShrink = (track: string | undefined): boolean => !!track && /^minmax\(0(px)?,/.test(track)
/** Every maths field in this JSX carries min-w-0 itself, which takes away its content floor in a 1fr track too. */
const fieldsShrink = (jsx: string): boolean => {
  const fields = jsx.match(/<MathInput\b[\s\S]*?\/>/g) ?? []
  return fields.length > 0 && fields.every((f) => /className="[^"]*\bmin-w-0\b/.test(f))
}

/**
 * The places in the panel where a maths field cannot be narrower than what is typed in it, one line
 * each; none when every field can shrink (V2). A grid item's automatic minimum is its content's width
 * in a bare 1fr track; a minmax(0, 1fr) track, or min-w-0 on the field, takes that floor away. A flex
 * item has the same floor, so the expression field's flex item needs min-w-0.
 */
function fieldsThatCannotShrink(src: string): string[] {
  const out: string[] = []
  // The two maths fields sit in the first and third tracks of the size ∠ angle row.
  const polar = between(src, "card.entry === 'polar' && (", "card.entry === 'scene' && (")
  const p = tracksIn(polar)
  if (!polar) out.push('the size ∠ angle row was not found')
  else if (!((letsShrink(p[0]) && letsShrink(p[2])) || fieldsShrink(polar))) out.push(`size ∠ angle row: grid-cols-[${p.join('_')}]`)
  // The k or q field is the third track of its row, after its button and "k =".
  const kq = between(src, 'op.field ? (', ') : (')
  const t = tracksIn(kq)
  if (!kq) out.push('the k and q rows were not found')
  else if (!(letsShrink(t[2]) || fieldsShrink(kq))) out.push(`k and q rows: grid-cols-[${t.join('_')}]`)
  // The expression field's flex item, the one that grows: the field itself when it carries flex-1,
  // else the div around it.
  const tag = /<MathInput ref=\{exprRef\}[\s\S]*?\/>/.exec(src)?.[0]
  const own = /className="([^"]*)"/.exec(tag ?? '')?.[1] ?? ''
  const wrap = /<div className="([^"]*)">\s*<MathInput ref=\{exprRef\}/.exec(src)?.[1]
  const item = /\b(flex-1|grow)\b/.test(own) ? own : wrap
  if (!tag) out.push('the expression field was not found')
  else if (item === undefined || !/\bmin-w-0\b/.test(item)) out.push(`expression box: className="${item ?? ''}"`)
  return out
}

/**
 * What is wrong with Settings ▸ Vector notation's arrow option, one line each; none when it is right
 * (V7): no combining mark from U+20D0–U+20FF anywhere in the options (Segoe UI has no glyph for them,
 * so 'A⃗' showed "A□"), and the arrow drawn over the A as an SVG in currentColor — inline, or by a
 * small component of TopBar.tsx — since a .seg button is 24 px high with its overflow hidden.
 */
function notationArrowProblems(src: string): string[] {
  const start = src.indexOf('Vector notation')
  const setter = start < 0 ? -1 : src.indexOf('vectorNotation: ', start)
  const end = setter < 0 ? -1 : src.indexOf('))}', setter)
  if (end < 0) return ['the Vector notation options were not found']
  // To the end of the options' map: their labels and the buttons that show them.
  const block = src.slice(start, end + 3)
  const out: string[] = []
  const marks = [...block].filter((ch) => ch.codePointAt(0)! >= 0x20d0 && ch.codePointAt(0)! <= 0x20ff)
  if (marks.length) out.push(`combining marks: ${marks.map((ch) => `U+${ch.codePointAt(0)!.toString(16).toUpperCase()}`).join(', ')}`)
  const svgOf = (text: string) => /<svg\b[\s\S]*?<\/svg>/.exec(text)?.[0]
  let svg = svgOf(block)
  for (const name of (block.match(/<[A-Z]\w*/g) ?? []).map((t) => t.slice(1))) {
    if (svg || name === 'Heading') continue
    const body = new RegExp(`(?:function ${name}\\b|const ${name}\\s*=)[\\s\\S]*?<\\/svg>`).exec(src)?.[0]
    if (body) svg = svgOf(body)
  }
  if (!svg) out.push('no SVG arrow over the A')
  else {
    if (!/currentColor/.test(svg)) out.push('the SVG arrow is not drawn in currentColor')
    if (!/<(path|line|polyline|polygon)\b/.test(svg)) out.push('the SVG draws no line')
  }
  if (!/A/.test(between(block, "'arrow'", "'bold'"))) out.push('the arrow option shows no A')
  return out
}

const reset = () => {
  resetGlobals()
  useVC.setState({ cards: [], result: null, highlight: 0, style: null, k: '2', q: '1.6\\times10^{-19}' })
  scene().newScene()
  // 1 □ = 1 cm at two decimal places, in degrees: the part head's settings.
  scene().setSettings({ decimals: 2, precisionMode: 'dp', angleUnit: 'deg', unit: 'cm', unitPerSquare: 1 })
  startCardSync()
}
beforeEach(reset)

describe('V2 — a field never pushes the panel wider, and a size too big to draw says so', () => {
  it('tooBigToDraw: a size the zoom floor cannot fit across the drawing is a sentence with the limit in the student’s unit (V2)', () => {
    const s = scene().settings
    // 1200 px at 0.05 px a square: 24000 squares, 24000 cm at 1 □ = 1 cm.
    const limit = 1200 / MIN_ZOOM_2D
    expect(tooBigToDraw(5, s, 1200)).toBeNull()
    // Either side of the limit, not on it: where exactly a double lands is no part of the contract.
    expect(tooBigToDraw(limit * 0.999, s, 1200)).toBeNull()
    // The 19 eights the part head typed: 8.89×10¹⁸ squares.
    const said = tooBigToDraw(NINETEEN_EIGHTS, s, 1200)
    expect(said).toMatch(/^Too big to draw at this scale/)
    expect(said).toContain(formatMeasure(limit, 'length', s))
    expect(said).not.toMatch(E_FORM)
    expect(tooBigToDraw(limit * 1.001, s, 1200)).toMatch(/^Too big to draw at this scale/)
    // The limit is a length on the graph: at 1 □ = 2 cm the same squares are twice as many cm.
    const s2 = { ...s, unitPerSquare: 2 }
    expect(tooBigToDraw(limit * 1.001, s2, 1200)).toContain(formatMeasure(limit, 'length', s2))
  })

  it('tooBigToDraw reads the drawing’s width from render/viewState.ts when none is given (V2)', () => {
    const s = scene().settings
    const was = useView.getState().widthPx
    try {
      useView.setState({ widthPx: 1000 })
      expect(tooBigToDraw(19000, s)).toBeNull()
      expect(tooBigToDraw(21000, s)).toContain(formatMeasure(1000 / MIN_ZOOM_2D, 'length', s))
      useView.setState({ widthPx: 2000 })
      expect(tooBigToDraw(21000, s)).toBeNull()
    } finally {
      useView.setState({ widthPx: was })
    }
  })

  it('tooBigToDraw writes a limit of 10¹⁰ or more with a raised power, never a caret (V2, V6)', () => {
    // 1 □ = 1 000 000 cm over 1200 px: the limit is 24 000 squares, 2.4×10¹⁰ cm, which formatMeasure
    // writes "2.4×10^10 cm" so shownValue can read it back; a sentence on the screen is not read back.
    const s = { ...scene().settings, unitPerSquare: 1e6 }
    const limit = 1200 / MIN_ZOOM_2D
    expect(formatMeasure(limit, 'length', s), 'the formatter still writes the caret').toContain('^')
    const said = tooBigToDraw(1e6, s, 1200)!
    expect(said).toMatch(/^Too big to draw at this scale/)
    expect(said).not.toContain('^')
    expect(said).toContain('×\u00a010¹⁰')
    expect(said).toContain(superscriptPowers(formatMeasure(limit, 'length', s)))
    expect(said).not.toMatch(E_FORM)
    // Under 10⁹ nothing changes: the limit is a plain number there.
    expect(tooBigToDraw(1e6, { ...s, unitPerSquare: 1 }, 1200)).toContain(`${formatMeasure(limit, 'length', { ...s, unitPerSquare: 1 })}.`)
  })

  it('the floor tooBigToDraw assumes is the 2D camera’s own minZoom, and the panel shows the sentence (V2)', () => {
    const rig = readSource('src/renderer/src/render/CameraRig.tsx')
    const floor = /minZoom=\{([^}]+)\}/.exec(rig)?.[1].trim()
    expect(floor, 'CameraRig.tsx minZoom').toBeDefined()
    // The camera names the constant, or the two numbers agree.
    if (/^[A-Za-z_]\w*$/.test(floor!)) expect(floor).toBe('MIN_ZOOM_2D')
    else expect(Number(floor)).toBe(MIN_ZOOM_2D)
    expect(readSource(VC_SRC)).toMatch(/tooBigToDraw\(/)
  })

  it('the size ∠ angle row, the k and q rows and the expression box let their fields shrink (V2)', () => {
    // A 19-digit size widened its column past the panel's edge at 120 % text.
    expect(fieldsThatCannotShrink(readSource(VC_SRC))).toEqual([])
  })
})

describe('V6 — one number form: the card line in KaTeX, and boxes at the student’s precision that keep the exact vector', () => {
  it('cardLineTex writes the whole card line for KaTeX: a 19-digit size is 8.89×10¹⁸ throughout, never "×10^18" (V6)', () => {
    const s = scene().settings
    const big: V3 = [NINETEEN_EIGHTS, 0, 0]
    const tex = cardLineTex('A', big, 'number', s)
    const seen = render(tex)
    expect(tex).toContain(texIJK(big, s))
    // Once in the vector, once as its size.
    const size = texMeasure(len(big), 'number', s)
    expect(tex.split(size).length - 1, tex).toBeGreaterThanOrEqual(2)
    // No plain-text number form: ×10^18 or a bare ^18 would raise only its first digit, and one in
    // \text{} is shown with its caret. (KaTeX draws the hat of î as a ^ after the i, so only a caret
    // after a 10 counts.)
    expect(tex).not.toMatch(/×\s*10\^|\^-?\d{2,}|\^-/)
    expect(seen).not.toMatch(/10\^/)
    expect(tex).not.toMatch(E_FORM)
  })

  it('cardLineTex: a graph card’s size has the drawing’s unit and a vector in the plane its angle; one out of the plane has none (V6)', () => {
    const s = scene().settings
    const line = cardLineTex('B', [3, 4, 0], 'length', s)
    render(line)
    expect(line).toContain(texIJK([3, 4, 0], s))
    expect(line).toContain(texMeasure(5, 'length', s))
    expect(line).toContain(texMeasure(heading([3, 4, 0]), 'direction', s))
    const out = cardLineTex('C', [1, 2, 3], 'number', s)
    render(out)
    expect(out).not.toMatch(/\\theta|θ/)
  })

  it('the panel draws each card line from cardLineTex, with no plain-text size or angle beside it (V6)', () => {
    const src = readSource(VC_SRC)
    expect(src).toMatch(/<Tex tex=\{cardLineTex\(/)
    expect(src).not.toMatch(/formatMeasure\(len\(|formatMeasure\(heading\(/)
  })

  it('4i + 4j switched to size ∠ angle reads 5.66 ∠ 45 at 2 d.p. and stays exactly (4, 4) until a box is edited (V6)', () => {
    useVC.setState({ cards: [card(1101, 'A', { latex: '4\\hat{i}+4\\hat{j}' })] })
    const a = arrowOf('A')
    setEntry(1101, 'polar')
    expect([cardOf('A').mag, cardOf('A').angle]).toEqual(['5.66', '45'])
    expectNear(valueOf('A'), [4, 4, 0], 'the card')
    expectNear(compOf(a), [4, 4, 0], 'its arrow')
    // An edited box is what the student typed: 6 ∠ 45°.
    edit('A', { mag: '6' })
    const six = fromPolar(6, toRad(45))
    expectNear(valueOf('A'), six, 'the card after the size is typed')
    expectNear(compOf(a), six, 'its arrow after the size is typed')
  })

  it('a size ∠ angle card rewritten by a drag reads 5 ∠ 53.13 and holds the arrow exactly where it was dropped (V6)', () => {
    useVC.setState({ cards: [card(1102, 'A', { entry: 'polar', mag: '5', angle: '0' })] })
    const a = arrowOf('A')
    drag(a, [3, 4, 0])
    expect([cardOf('A').mag, cardOf('A').angle]).toEqual(['5', '53.13'])
    expectNear(valueOf('A'), [3, 4, 0], 'the card')
    // Read back from "53.13" the arrow would be pulled 10⁻⁵ off the point it was dropped on.
    expectNear(compOf(a), [3, 4, 0], 'its arrow')
    edit('A', { angle: '90' })
    expectNear(valueOf('A'), [0, 5, 0], 'the card after the angle is typed')
    expectNear(compOf(a), [0, 5, 0], 'its arrow after the angle is typed')
  })
})

describe('H7 — the zero vector has no direction on its card', () => {
  it('cardLineTex gives the zero vector no angle but "no direction", as the solver calls it undefined (H7)', () => {
    const s = scene().settings
    const tex = cardLineTex('A', [0, 0, 0], 'number', s)
    render(tex)
    expect(tex).toMatch(/no direction/)
    expect(tex).not.toMatch(/(\\theta|θ)\s*=\s*-?\d/)
    // What the card must agree with.
    expect(VS.solveMagnitudeDirection({ name: 'A', v: [0, 0, 0] }, s).answers.find((x) => x.label === 'θ')?.tex).toBe('\\text{undefined}')
  })
})

describe('H8 — no e-notation in a maths field', () => {
  it('a 10²¹ vector switched to size ∠ angle and back keeps its value, and neither box is written as 1e+21 (H8)', () => {
    useVC.setState({ cards: [card(1201, 'A', { latex: '10^{21}\\hat{i}' })] })
    expectSameSize(valueOf('A'), [1e21, 0, 0], 'typed')
    setEntry(1201, 'polar')
    const p = cardOf('A')
    expect(p.mag).not.toMatch(E_FORM)
    // The size box alone reads back as the size: it is what remains once the angle is retyped.
    expect(Math.abs(evalNumber(p.mag) / 1e21 - 1), p.mag).toBeLessThan(1e-12)
    expectSameSize(valueOf('A'), [1e21, 0, 0], 'size ∠ angle')
    setEntry(1201, 'comp')
    const c = cardOf('A')
    expect(c.latex).not.toMatch(E_FORM)
    // The typed box alone reads back as the vector.
    expectSameSize(cardValues([card(1202, 'X', { latex: c.latex })], scene().ev)[0], [1e21, 0, 0], `"${c.latex}" read on its own`)
    expectSameSize(valueOf('A'), [1e21, 0, 0], 'typed again')
  })

  it('a 1.6×10⁻¹⁹ vector switched to size ∠ angle and back keeps its value: the typed box was written "0" (H8, found while checking)', () => {
    useVC.setState({ cards: [card(1203, 'A', { latex: '1.6\\times10^{-19}\\hat{i}' })] })
    const tiny = valueOf('A') as V3
    expectSameSize(tiny, [1.6e-19, 0, 0], 'typed')
    setEntry(1203, 'polar')
    expect(cardOf('A').mag).not.toMatch(E_FORM)
    setEntry(1203, 'comp')
    const c = cardOf('A')
    // ijkLatex drops a component under 10⁻¹² as drag noise; this one was typed.
    expect(c.latex).not.toBe('0')
    expect(c.latex).not.toMatch(E_FORM)
    expectSameSize(cardValues([card(1204, 'X', { latex: c.latex })], scene().ev)[0], tiny, `"${c.latex}" read on its own`)
    expectSameSize(valueOf('A'), tiny, 'typed again')
  })
})

describe('H6 — the expression box refuses a division by zero', () => {
  it('exprSolution refuses 1/0 and 0/0 with a sentence instead of answering ∞ or "undefined" (H6)', () => {
    const s = scene().settings
    for (const expr of ['1/0', '\\frac{1}{0}', '0/0', '\\frac{0}{0}']) {
      let thrown: unknown = null
      try {
        exprSolution(expr, [], s)
      } catch (e) {
        thrown = e
      }
      expect(thrown, `${expr}: ${String(thrown)}`).toBeInstanceOf(PlainError)
      expect(explainVectorError(thrown), expr).toMatch(/divided by zero/)
    }
    // A number and a vector are worked out as before.
    expect(exprSolution('2+3', [], s).sol.answers).toEqual([{ label: 'value', tex: '5' }])
    const sum = exprSolution('\\vec{A}+\\vec{B}', [{ name: 'A', v: [3, 4, 0] }, { name: 'B', v: [0, 5, 0] }], s)
    expect(sum.used).toEqual(['A', 'B'])
    expect(sum.sol.answers[0]).toEqual({ label: 'R', tex: texIJK([3, 9, 0], s) })
  })

  it('the panel works its expression out with the store’s exprSolution (H6)', () => {
    const src = readSource(VC_SRC)
    expect(src).not.toMatch(/function exprSolution\(/)
    expect(src).toMatch(/exprSolution\(/)
  })
})

describe('H9 — Scalar × and Magnetic force follow a retyped k or q', () => {
  it('Scalar × follows k with no new press, its picture too, and a blank k marks it stale (H9)', () => {
    useVC.setState({ cards: [card(1301, 'A', { latex: '3\\hat{i}+4\\hat{j}' })], k: '2' })
    const s = scene().settings
    const A = [{ name: 'A', v: [3, 4, 0] as V3 }]
    expect(runOperation('scale')).toBeNull()
    expect(result().label).toBe('Scalar ×')
    expect(answer('R')).toBe('6\\hat{i} + 8\\hat{j}')
    drawAnswer(result().sol, null)
    const R = () => vectors().find((o) => o.name === 'R')
    expectNear(compOf(R()!.id), [6, 8, 0], 'R on the graph')
    // k retyped: the answer and its picture follow, as they follow a retyped card.
    useVC.setState({ k: '3' })
    expect(result().sol.answers).toEqual(solveOperation('scale', A, s, 3)!.answers)
    expect(result().sol.title).toBe('R = 3A')
    expect(result().stale).toBeFalsy()
    expectNear(compOf(R()!.id), [9, 12, 0], 'R on the graph after k = 3')
    // A retyped card is worked out with the k the box holds now, not the k pressed with.
    edit('A', { latex: '\\hat{i}' })
    expect(result().sol.answers).toEqual(solveOperation('scale', [{ name: 'A', v: [1, 0, 0] }], s, 3)!.answers)
    // k blank: there is no answer to give.
    useVC.setState({ k: '' })
    expect(result().stale).toBe(true)
    useVC.setState({ k: '-1' })
    expect(result().stale).toBe(false)
    expect(result().sol.answers).toEqual(solveOperation('scale', [{ name: 'A', v: [1, 0, 0] }], s, -1)!.answers)
  })

  it('Magnetic force follows q with no new press, and a blank q marks it stale (H9)', () => {
    useVC.setState({ cards: [card(1311, 'v', { latex: '\\hat{i}' }), card(1312, 'B', { latex: '\\hat{j}' })], q: '1.6\\times10^{-19}' })
    const s = scene().settings
    const vB = [
      { name: 'v', v: [1, 0, 0] as V3 },
      { name: 'B', v: [0, 1, 0] as V3 }
    ]
    expect(runOperation('lorentz')).toBeNull()
    expect(result().label).toBe('Magnetic force')
    expect(answer('|F|')).toBe('1.6\\times 10^{-19}\\,\\text{N}')
    useVC.setState({ q: '3.2\\times10^{-19}' })
    expect(answer('|F|')).toBe('3.2\\times 10^{-19}\\,\\text{N}')
    expect(result().sol.answers).toEqual(solveOperation('lorentz', vB, s, 0, evalNumber('3.2\\times10^{-19}'))!.answers)
    expect(result().stale).toBeFalsy()
    useVC.setState({ q: '' })
    expect(result().stale).toBe(true)
  })

  it('runOperation answers with the panel’s own sentence when it cannot work, and leaves the answer card alone (H9)', () => {
    useVC.setState({ cards: [card(1321, 'A', { latex: '3\\hat{i}+4\\hat{j}' })] })
    expect(runOperation('cross')).toBe('Cross needs 2 vectors. Add another card.')
    useVC.setState({ k: '' })
    expect(runOperation('scale')).toBe('This box is empty. Type a number in it, like 5.')
    expect(useVC.getState().result).toBeNull()
    // The panel's buttons go through it.
    expect(readSource(VC_SRC)).toMatch(/runOperation\(/)
  })
})

describe('V7 — the arrow notation button draws its arrow', () => {
  it('Settings ▸ Vector notation has no combining mark Segoe UI lacks (U+20D0–U+20FF), and the arrow option is an SVG arrow in currentColor (V7)', () => {
    expect(notationArrowProblems(readSource('src/renderer/src/app/TopBar.tsx'))).toEqual([])
  })
})

describe('H11 — a vector and a bare number are not added', () => {
  /** The store's own sentence for it, as explainVectorError words mathjs's refusal of a number added to a vector elsewhere. */
  const MIXED = explainVectorError(new Error('Unexpected type of argument in function add'))

  it('"8i + 2" on the way to "8i + 2j" is refused in a sentence: the card waits, and its arrow and its answer stay as they were (H11)', () => {
    expect(MIXED).toMatch(/adding 3 to a vector/)
    useVC.setState({ cards: [card(1701, 'A', { latex: '8\\hat{i}' })] })
    const a = arrowOf('A')
    pressFirst('mag', 'Size & angle')
    edit('A', { latex: '8\\hat{i}+2' })
    // mathjs added the 2 to every component: 10i + 2j + 2k, drawn and answered in 3D.
    expect(valueOf('A')).toBe(MIXED)
    expectNear(compOf(a), [8, 0, 0], 'its arrow')
    expect(result().stale).toBe(true)
    expect(result().staleWhy).toBe('unreadable')
    expect(result().sol.answers.map((x) => x.label)).toEqual(['|A|', 'θ'])
    edit('A', { latex: '2+3\\hat{i}' })
    expect(valueOf('A')).toBe(MIXED)
    expectNear(compOf(a), [8, 0, 0], 'its arrow')
    // Finished, the line is read, drawn and worked out again.
    edit('A', { latex: '8\\hat{i}+2\\hat{j}' })
    expectNear(valueOf('A'), [8, 2, 0], 'the card')
    expectNear(compOf(a), [8, 2, 0], 'its arrow')
    expect(result().stale).toBe(false)
    expect(result().sol.answers).toEqual(solveOperation('mag', [{ name: 'A', v: [8, 2, 0] }], scene().settings)!.answers)
  })

  it('"A − 1" and "1 + A" under a card A are refused the same way, while 2A, A − i, A/2 and |A| i are still read (H11)', () => {
    const A = card(1711, 'A', { latex: '3\\hat{i}+4\\hat{j}' })
    const B = (latex: string) => cardValues([A, card(1712, 'B', { latex })], scene().ev)[1]
    expectNear(B('2A'), [6, 8, 0], '2A')
    expectNear(B('A-\\hat{i}'), [2, 4, 0], 'A − i')
    expectNear(B('\\frac{A}{2}'), [1.5, 2, 0], 'A/2')
    expectNear(B('|A|\\hat{i}'), [5, 0, 0], '|A| i')
    expect(B('A-1')).toBe(MIXED)
    expect(B('1+A')).toBe(MIXED)
  })
})

describe('H12 — a tiny vector is followed like any other', () => {
  it('a card retyped from 1.6×10⁻¹⁹ î to 3.2×10⁻¹⁹ î moves its arrow and its answers are worked out again, while a drag’s float noise is still no change (H12)', () => {
    // The noise first, which holds today and must go on holding: a typed card whose arrow is dropped
    // at 2.875000000000001 is not rewritten…
    useVC.setState({ cards: [card(1801, 'N', { latex: '2.875\\hat{i}+1.275\\hat{j}' })] })
    const n = arrowOf('N')
    const cards = useVC.getState().cards
    drag(n, [2.875000000000001, 1.275, 0])
    expect(useVC.getState().cards, 'the typed card is rewritten').toBe(cards)
    // …and a graph card reading that arrow keeps the answer worked out from it.
    setEntry(1801, 'scene')
    drag(n, [2.875, 1.275, 0])
    pressFirst('mag', 'Size & angle')
    const sol = result().sol
    drag(n, [2.875000000000001, 1.275, 0])
    expect(result().sol, 'the answer is worked out again').toBe(sol)

    reset()
    const small = evalNumber('1.6\\times10^{-19}')
    const big = evalNumber('3.2\\times10^{-19}')
    useVC.setState({ cards: [card(1802, 'A', { latex: '1.6\\times10^{-19}\\hat{i}' })] })
    const a = arrowOf('A')
    expectSameSize(compOf(a), [small, 0, 0], 'its arrow')
    pressFirst('mag', 'Size & angle')
    edit('A', { latex: '3.2\\times10^{-19}\\hat{i}' })
    expectSameSize(valueOf('A'), [big, 0, 0], 'the card')
    // Within 10⁻⁹ of the old one, so "the same": the arrow stayed at 1.6×10⁻¹⁹.
    expectSameSize(compOf(a), [big, 0, 0], 'its arrow')
    expectSameSize(result().sol.visual!.vectors[0].v, [big, 0, 0], 'the vector Size & angle was worked out from')
    // Scalar × writes its answer in scientific form, so the student sees it follow.
    pressFirst('scale', 'Scalar ×', 2)
    edit('A', { latex: '6.4\\times10^{-19}\\hat{i}' })
    expect(result().sol.answers).toEqual(solveOperation('scale', [{ name: 'A', v: [evalNumber('6.4\\times10^{-19}'), 0, 0] }], scene().settings, 2)!.answers)
  })
})

describe('H13 — a tiny vector’s card line is in scientific form', () => {
  it('cardLineTex writes 1.6×10⁻¹⁹ î and its size in scientific form, never \\vec{0} or |A| = 0, and still hides float noise beside a real size (H13)', () => {
    const s = scene().settings
    const tiny: V3 = [evalNumber('1.6\\times10^{-19}'), 0, 0]
    const line = cardLineTex('A', tiny, 'number', s)
    render(line)
    expect(line).not.toMatch(/\\vec\{0\}/)
    // Once in the vector, once as its size.
    expect(line.split('10^{-19}').length - 1, line).toBeGreaterThanOrEqual(2)
    expect(line).toContain(texSci(len(tiny), s))
    const slant: V3 = [1.6e-19, 1.2e-19, 0]
    const tilted = cardLineTex('B', slant, 'number', s)
    render(tilted)
    expect(tilted).toContain(texSci(len(slant), s))
    expect(tilted).toContain(texMeasure(heading(slant), 'direction', s))
    expect(tilted, 'nothing in it reads as 0').not.toMatch(/=\s*0(?![.\d])/)
    // 5∠90° holds 3.06×10⁻¹⁶ in x, which is noise beside its 5: still written 5ĵ.
    const up = cardLineTex('C', fromPolar(5, toRad(90)), 'number', s)
    render(up)
    expect(up).toContain(texIJK([0, 5, 0], s))
    expect(up).not.toMatch(/10\^\{-1\d\}/)
  })
})

// ---------------------------------------------------------------------------
// The rest of the round: H15, the panel's width at the minimum window (V2), and what the store's new
// contracts do beyond the tests above.
// ---------------------------------------------------------------------------

describe('H15 — a scientific size before ∠ is read like the plain number', () => {
  // Found by the store's own reader, not the two-box one: "1×10⁻⁵ ∠ 45°" typed in the one box was
  // refused ("Write a size and an angle as 10∠30°…") while 0.00001 ∠ 45° was read. math/expr.ts
  // preprocess rewrites size ∠ angle before it reads 1×10^(-5) as a number, and its size must be one
  // plain number; the two-box card reads its size through evalNumber and always could.
  const typed = (latex: string) => cardValues([card(2001, 'A', { latex })], scene().ev)[0]

  it('1×10⁻⁵ ∠ 45° typed in the one box reads as 0.00001 ∠ 45°, and so do 10⁻⁵ ∠ 45° and 2.5×10³ ∠ 30° (H15)', () => {
    const want = fromPolar(1e-5, toRad(45))
    expectSameSize(typed('0.00001\\angle45^{\\circ}'), want, '0.00001 ∠ 45° (read before)')
    for (const latex of ['1\\times10^{-5}\\angle45^{\\circ}', '1\\times 10^{-5}\\,\\angle\\,45^\\circ', '1\\times10^{-5}\\angle 45', '10^{-5}\\angle45^{\\circ}']) {
      expectSameSize(typed(latex), want, latex)
    }
    expectSameSize(typed('2.5\\times10^{3}\\angle30^{\\circ}'), fromPolar(2500, toRad(30)), '2.5×10³ ∠ 30°')
    expectSameSize(typed('1.6\\times10^{-19}\\angle45^{\\circ}'), fromPolar(1.6e-19, toRad(45)), '1.6×10⁻¹⁹ ∠ 45°')
    // The two boxes read the same size, and the expression box reads the line as the cards do.
    expectSameSize(cardValues([card(2002, 'B', { entry: 'polar', mag: '1\\times10^{-5}', angle: '45' })], scene().ev)[0], want, 'two boxes')
    expectSameSize(toV3(evaluateVectorLine('1\\times10^{-5}\\angle45^{\\circ}', {}).out), want, 'the expression box')
  })

  it('a plain size ∠ angle and a power of ten that is no size are read as before (H15)', () => {
    expectSameSize(typed('10\\angle30^{\\circ}'), fromPolar(10, toRad(30)), '10 ∠ 30°')
    expectSameSize(typed('2\\times10^{3}\\hat{i}+5\\hat{j}'), [2000, 5, 0], '2×10³ î + 5 ĵ')
    expectSameSize(typed('10^{2}\\hat{i}'), [100, 0, 0], '10² î')
  })
})

describe('V2 (rest) — the operation buttons and the entry switch fit the panel at the minimum window', () => {
  /**
   * What would still widen the panel at the 960 px minimum window and 120 % text, one line each. The
   * three-column operations grid (Tailwind's grid-cols-3, minmax(0, 1fr) tracks of 69 px there) held
   * a "Components" button 78 px wide, because a grid item is never narrower than its content unless
   * told so and .btn does not wrap; once it could shrink the word, which cannot wrap, still stuck out
   * of the button (seen in the browser at a 240 px panel). So the buttons shrink and wrap a two-word
   * label, and the grid has as many columns as keep every label whole: two at the minimum width. The
   * typed / size ∠ angle / graph switch scrolled inside itself (overflow-x-auto) and hid "graph".
   */
  function widthProblems(src: string): string[] {
    const out: string[] = []
    const btn = /const opButton = [\s\S]*?<button\b[^>]*?className="([^"]*)"/.exec(src)?.[1]
    if (btn === undefined) out.push('the operation button was not found')
    else {
      if (!/\bmin-w-0\b/.test(btn)) out.push(`operation button cannot shrink to its track (no min-w-0): ${btn}`)
      if (!/\bwhitespace-normal\b/.test(btn)) out.push(`operation button cannot wrap its label (.btn is nowrap, no whitespace-normal): ${btn}`)
      if (!/\bmin-h-\[44px\]/.test(btn)) out.push(`operation button lost its 44 px target: ${btn}`)
    }
    // Both grids that hold the buttons are laid out by OP_GRID, whose columns are as many as keep a
    // label whole — never a fixed three — and none narrower than "Components" (68 px of word, 12 px
    // of button padding and border: 6.2 rem at the 13 px root); a field row spans every column.
    const tracks = /const OP_GRID = '([^']*)'/.exec(src)?.[1]
    const min = /grid-cols-\[repeat\(auto-(?:fit|fill),minmax\((\d+(?:\.\d+)?)rem,1fr\)\)\]/.exec(tracks ?? '')?.[1]
    if (tracks === undefined) out.push('OP_GRID was not found')
    else if (min === undefined) out.push(`the operation grid has a fixed number of columns: ${tracks}`)
    else if (Number(min) < 6.2) out.push(`an operation column is narrower than "Components": ${min} rem`)
    if (!/<div className=\{`[^`]*\$\{OP_GRID\}`\}>\{COMMON_OPS\.map\(opButton\)\}<\/div>/.test(src)) out.push('the common operations are not laid out by OP_GRID')
    if (!/<div className=\{OP_GRID\}>\s*\{MORE_OPS\.map\(/.test(src)) out.push('the More operations are not laid out by OP_GRID')
    if (/\bcol-span-\d+\b/.test(between(src, 'op.field ? (', ') : ('))) out.push('the k and q rows span a fixed number of columns')
    const seg = /<div className="(seg[^"]*)">\s*\{\(\s*\[\s*\['comp'/.exec(src)?.[1]
    if (seg === undefined) out.push('the typed / size ∠ angle / graph switch was not found')
    else {
      if (!/\bflex-wrap\b/.test(seg)) out.push(`the entry switch cannot wrap: ${seg}`)
      if (/\boverflow-x-(auto|scroll)\b/.test(seg)) out.push(`the entry switch scrolls inside itself: ${seg}`)
    }
    return out
  }

  it('an operation button shrinks to its track and wraps its label, and the entry switch wraps instead of scrolling (V2)', () => {
    expect(widthProblems(readSource(VC_SRC))).toEqual([])
  })

  it('the check itself sees each fault it names, on the panel as it was (V2)', () => {
    const before = readSource(VC_SRC)
      .replace(' min-w-0 flex-col items-start gap-0 whitespace-normal px-1.5', ' flex-col items-start gap-0 px-1.5')
      .replace('grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))]', 'grid-cols-3')
      .replace('className="seg min-w-0 shrink flex-wrap"', 'className="seg min-w-0 shrink overflow-x-auto"')
    const found = widthProblems(before)
    expect(found.map((x) => x.split(':')[0].replace(/ \(.*/, ''))).toEqual([
      'operation button cannot shrink to its track',
      'operation button cannot wrap its label',
      'the operation grid has a fixed number of columns',
      'the entry switch cannot wrap',
      'the entry switch scrolls inside itself'
    ])
    // Columns narrower than the word are caught too.
    expect(widthProblems(readSource(VC_SRC).replace('minmax(6.5rem,1fr)', 'minmax(4rem,1fr)')).map((x) => x.split(':')[0])).toEqual(['an operation column is narrower than "Components"'])
  })
})

describe('V6 (more) — boxes at the student’s precision never lose what the card holds', () => {
  it('a size retyped on a card filled from 3i + 4j keeps the direction it had, to the last digit, not the 53.13° the box shows (V6)', () => {
    useVC.setState({ cards: [card(2101, 'A', { latex: '3\\hat{i}+4\\hat{j}' })] })
    setEntry(2101, 'polar')
    expect([cardOf('A').mag, cardOf('A').angle]).toEqual(['5', '53.13'])
    // The size alone is edited: the angle box is as it was written, so it is still the vector's own angle.
    edit('A', { mag: '0.8' })
    expectNear(valueOf('A'), [0.48, 0.64, 0], 'the card', 1e-12)
    // The angle alone is edited: the size is the vector's own 5.
    edit('A', { mag: '5', angle: '0' })
    expectNear(valueOf('A'), [5, 0, 0], 'size 5 ∠ 0°')
    // Both written again as they were: the vector itself.
    edit('A', { mag: '5', angle: '53.13' })
    expectNear(valueOf('A'), [3, 4, 0], 'both boxes as written')
  })

  it('a size or angle that rounds to 0 at the student’s precision is written in scientific form, not as 0 (V6, H8)', () => {
    useVC.setState({ cards: [card(2102, 'A', { latex: '0.004\\hat{i}' })] })
    setEntry(2102, 'polar')
    const { mag } = cardOf('A')
    expect(mag).not.toBe('0')
    expect(Math.abs(evalNumber(mag) / 0.004 - 1), mag).toBeLessThan(1e-12)
    expect(mag).not.toMatch(E_FORM)
  })

  it('a vector out of the plane keeps its z while neither box is edited: size ∠ angle cannot say it, the card still holds it (V6)', () => {
    useVC.setState({ cards: [card(2103, 'A', { latex: '\\hat{i}+2\\hat{j}+2\\hat{k}' })] })
    setEntry(2103, 'polar')
    expectNear(valueOf('A'), [1, 2, 2], 'the card')
    expectNear(compOf(arrowOf('A')), [1, 2, 2], 'its arrow')
    // A box edited (the size was written 3): size ∠ angle is in the plane.
    edit('A', { mag: '4' })
    expect((valueOf('A') as V3)[2]).toBe(0)
  })

  it('the typed box keeps a component only when it is not noise beside its vector, so 1.6×10⁻¹⁹ î is kept and 5∠90°’s x is not (H8)', () => {
    // A vector a card holds is not a drag's: only a component under 10⁻¹² of its own size is noise.
    expect(ijkLatex([1.6e-19, 0, 0], true)).toBe('1.6\\times 10^{-19}\\hat{i}')
    expect(ijkLatex([1e21, 6.1e4, 0], true)).toBe('1\\times 10^{21}\\hat{i}')
    expect(ijkLatex(fromPolar(5, toRad(90)), true)).toBe('5\\hat{j}')
    expect(ijkLatex([1e-7, -2e-7, 0], true)).toBe('1\\times 10^{-7}\\hat{i}-2\\times 10^{-7}\\hat{j}')
    // One read off the drawing can carry a drag's 10⁻¹⁶ at any size: under 10⁻¹² of a unit is none.
    expect(ijkLatex([1e-13, 0, 0])).toBe('0')
    expect(ijkLatex([1e21, 6.1e4, 0])).toBe('1\\times 10^{21}\\hat{i}')
    for (const v of [[1e21, 0, 0], [-1.6e-19, 2e-19, 0], [1e-7, 0, 3e22]] as V3[]) expect(ijkLatex(v, true), JSON.stringify(v)).not.toMatch(E_FORM)
  })
})

describe('H9 / H11 (more) — what the answer card says, and the expression box', () => {
  it('a blank k box says which box cannot be read, not that a vector cannot (H9)', () => {
    useVC.setState({ cards: [card(2201, 'A', { latex: '3\\hat{i}+4\\hat{j}' })], k: '2' })
    expect(runOperation('scale')).toBeNull()
    useVC.setState({ k: '' })
    expect(result().staleWhy).toBe('unreadable')
    expect(result().staleBox).toBe('k')
    expect(staleSentence(result())).toBe('The k box cannot be read now. Once it can, this answer is worked out again.')
    // A vector that cannot be read is still said to be a vector, and the box that can be read is not blamed.
    useVC.setState({ k: '2' })
    expect(result().stale).toBe(false)
    expect(result().staleBox).toBeUndefined()
    edit('A', { latex: '3\\hat{i}+' })
    expect(result().staleBox).toBeUndefined()
    expect(staleSentence(result())).toMatch(/^A vector this was worked out from cannot be read now/)
  })

  it('an operation that reaches a card that cannot be read says which card and why, and leaves the answer alone (H9)', () => {
    useVC.setState({ cards: [card(2211, 'A', { latex: '' })] })
    expect(runOperation('mag')).toBe('Card A cannot be read: nothing typed yet')
    expect(runOperation('sum')).toBe('Card A cannot be read: nothing typed yet')
    useVC.setState({ cards: [] })
    expect(runOperation('sum')).toBe('Add a vector first.')
    expect(useVC.getState().result).toBeNull()
  })

  it('the expression box refuses a number added to a vector, as a card does (H11)', () => {
    const s = scene().settings
    const A = [{ name: 'A', v: [3, 4, 0] as V3 }]
    for (const expr of ['\\vec{A}+1', '2-\\vec{A}', '\\hat{i}+2']) {
      let thrown: unknown = null
      try {
        exprSolution(expr, A, s)
      } catch (e) {
        thrown = e
      }
      expect(thrown, expr).toBeInstanceOf(PlainError)
      expect(explainVectorError(thrown), expr).toMatch(/adding 3 to a vector/)
    }
    // A number beside a number, and a vector scaled or shifted by a vector, work as before.
    expect(exprSolution('|\\vec{A}|+1', A, s).sol.answers).toEqual([{ label: 'value', tex: '6' }])
    expect(exprSolution('2\\vec{A}-\\hat{i}', A, s).sol.answers[0]).toEqual({ label: 'R', tex: texIJK([5, 8, 0], s) })
  })

  it('the store’s exprSolution names every card its line uses off the parse tree, 2B included, and lays the vectors out for the picture (R1, H6)', () => {
    // A word-boundary search found no B in "A+2B" (2B is one word to it), nor A in "2A+B".
    const s = scene().settings
    const AB = [
      { name: 'A', v: [3, 4, 0] as V3 },
      { name: 'B', v: [0, 5, 0] as V3 }
    ]
    expect(exprSolution('\\vec{A}+2\\vec{B}', AB, s).used).toEqual(['A', 'B'])
    expect(exprSolution('2\\vec{A}+\\vec{B}', AB, s).used).toEqual(['A', 'B'])
    expect(exprSolution('2\\vec{B}', AB, s).used).toEqual(['B'])
    // A card that cannot be read is no value, and is named so in the sentence.
    let thrown: unknown = null
    try {
      exprSolution('\\vec{A}+\\vec{B}', [AB[0], { name: 'B', v: 'nothing typed yet' }], s)
    } catch (e) {
      thrown = e
    }
    expect(explainVectorError(thrown)).toMatch(/Card B cannot be read yet/)
    const r = exprSolution('\\vec{A}+2\\vec{B}', AB, s).sol.visual!
    expect(r.vectors.map((x) => [x.name, x.role])).toEqual([['A', 'input'], ['B', 'input'], ['R', 'result']])
  })
})

describe('H17 — a typed line that cancels reads 0 again, and a tiny vector the student typed is kept', () => {
  // H13 let a tiny nonzero vector keep its scientific form, and so a sum that cancels to float noise
  // (5∠30° + 5∠210° leaves 8.9×10⁻¹⁶) read as one. Noise is judged against the scale the line works at
  // (the solver's isNoise reads a product against |A||B|): a sum by its larger term, a product by its
  // factors multiplied, sin and cos by 1; the angle of 5∠30° and the exponent of 10^{-19} never count.
  const zero = (what: string, v: V3 | string | undefined) => expectNear(v, [0, 0, 0], what, 0)
  const typed = (latex: string) => {
    // A new drawing each time: the arrow of the card before keeps the name A.
    reset()
    useVC.setState({ cards: [card(2401, 'A', { latex })] })
    return { v: valueOf('A'), arrow: compOf(arrowOf('A')) }
  }
  const lineOf = (v: V3 | string | undefined) => cardLineTex('A', v as V3, 'number', scene().settings)

  it('5∠30° + 5∠210° is exactly the zero vector: the card, its arrow and its card line agree (H17)', () => {
    const { v, arrow } = typed('5\\angle30^{\\circ}+5\\angle210^{\\circ}')
    zero('the card', v)
    zero('its arrow', arrow)
    const line = lineOf(v)
    expect(line).toContain('\\vec{0}')
    expect(line).toContain('no direction')
    expect(line).not.toMatch(/10\^\{-/)
    zero('10∠60° + 10∠240°', typed('10\\angle60^{\\circ}+10\\angle240^{\\circ}').v)
  })

  it('A + B of two cards that cancel, 3i + 4j − 3i − 4j, and B − A for equal cards are the zero vector (H17)', () => {
    useVC.setState({
      cards: [
        card(2411, 'A', { latex: '5\\angle30^{\\circ}' }),
        card(2412, 'B', { latex: '5\\angle210^{\\circ}' }),
        card(2413, 'C', { latex: '\\vec{A}+\\vec{B}' }),
        card(2414, 'D', { entry: 'polar', mag: '5', angle: '30' }),
        card(2415, 'E', { latex: '\\vec{D}-\\vec{A}' })
      ]
    })
    zero('A + B', valueOf('C'))
    zero('D − A', valueOf('E'))
    zero('its arrow', compOf(arrowOf('C')))
    expect(lineOf(valueOf('C'))).toContain('\\vec{0}')
    const exact = typed('3\\hat{i}+4\\hat{j}-3\\hat{i}-4\\hat{j}')
    zero('3i + 4j − 3i − 4j', exact.v)
    expect(lineOf(exact.v)).toContain('\\vec{0}')
  })

  it('a tiny vector the student typed keeps its size: 1.6×10⁻¹⁹ î, 10⁻¹⁹ î, 1.6×10⁻¹⁹ ∠ 45°, and a card built from one (H17)', () => {
    expectSameSize(typed('1.6\\times10^{-19}\\hat{i}').v, [1.6e-19, 0, 0], '1.6×10⁻¹⁹ î')
    expect(lineOf(valueOf('A'))).toContain('10^{-19}')
    expectSameSize(typed('10^{-19}\\hat{i}').v, [1e-19, 0, 0], '10⁻¹⁹ î')
    expectSameSize(typed('1.6\\times10^{-19}\\angle45^{\\circ}').v, fromPolar(1.6e-19, toRad(45)), '1.6×10⁻¹⁹ ∠ 45°')
    reset()
    useVC.setState({ cards: [card(2421, 'A', { latex: '1.6\\times10^{-19}\\hat{i}' }), card(2422, 'B', { latex: '2\\vec{A}+\\vec{A}' })] })
    expectSameSize(valueOf('B'), [4.8e-19, 0, 0], '3A of a tiny card')
  })

  it('the expression box: A·B of two tiny cards, and a lone 1.6×10⁻¹⁹, are written in scientific form; noise beside a real scale is 0 (H17)', () => {
    const s = scene().settings
    const value = (expr: string, cards: { name: string; v: V3 }[] = []) => exprSolution(expr, cards, s).sol.answers
    const tiny = [
      { name: 'A', v: [4e-10, 0, 0] as V3 },
      { name: 'B', v: [4e-10, 0, 0] as V3 }
    ]
    expect(value('\\vec{A}\\cdot\\vec{B}', tiny)).toEqual([{ label: 'value', tex: '1.6\\times 10^{-19}' }])
    expect(value('1.6\\times10^{-19}')).toEqual([{ label: 'value', tex: '1.6\\times 10^{-19}' }])
    // Noise beside what the line works with is nothing: 5∠90° · 5∠0° (1.5×10⁻¹⁵ beside 25), 0.1 + 0.2 − 0.3,
    // sin 180° and √2² − 2 were all written 0, and must not become 5.55×10⁻¹⁷ now that a tiny number is written.
    const perpendicular = [
      { name: 'A', v: fromPolar(5, toRad(90)) },
      { name: 'B', v: [5, 0, 0] as V3 }
    ]
    expect(value('\\vec{A}\\cdot\\vec{B}', perpendicular)).toEqual([{ label: 'value', tex: '0' }])
    expect(value('0.1+0.2-0.3')).toEqual([{ label: 'value', tex: '0' }])
    expect(value('\\sin\\left(180^{\\circ}\\right)')).toEqual([{ label: 'value', tex: '0' }])
    expect(value('\\sqrt{2}^{2}-2')).toEqual([{ label: 'value', tex: '0' }])
    // A sum that cancels is the zero vector in the answer, as on the card.
    const cancelling = [
      { name: 'A', v: fromPolar(5, toRad(30)) },
      { name: 'B', v: fromPolar(5, toRad(210)) }
    ]
    expect(value('\\vec{A}+\\vec{B}', cancelling)[0]).toEqual({ label: 'R', tex: '\\vec{0}' })
    expect(value('5\\angle30^{\\circ}+5\\angle210^{\\circ}')[0]).toEqual({ label: 'R', tex: '\\vec{0}' })
    // A tiny vector the line really gives is written as itself.
    expect(value('2\\vec{A}', [{ name: 'A', v: [1.6e-19, 0, 0] as V3 }])[0]).toEqual({ label: 'R', tex: '3.2\\times 10^{-19}\\hat{i}' })
  })
})

// ---------------------------------------------------------------------------
// G4 (an independent checker's round). G4a: the store followed a retyped k or q only for the answer
// shown (useVC.subscribe reads result.from.scalar), and followPicture worked an older picture out again
// only when one of its card arrows had changed, so k = 4 left R = 6î on the graph until the next edit of
// a card made it jump to 20î. G4b: the panel read useView.getState().widthPx while rendering and never
// subscribed to it, so the limit in "Too big to draw…" was the width of the last render, not the window's.
// G4c: KaTeX may break a line after a top-level ×, which wrote "8.18 ×" and "10¹⁹ ĵ" on two lines.
// ---------------------------------------------------------------------------

describe('G4 — an older picture follows k and q, the size limit follows a resize, numbers are kept whole', () => {
  it('Scalar × drawn, then Add all pressed: the older picture follows a retyped k at once, with no undo step, and waits while k cannot be read (G4a)', () => {
    useVC.setState({ cards: [card(2501, 'A', { latex: '3\\hat{i}' })], k: '2' })
    expect(runOperation('scale')).toBeNull()
    drawAnswer(result().sol, null)
    const R = () => vectors().find((o) => o.name === 'R')!
    expectNear(compOf(R().id), [6, 0, 0], 'R after Draw on graph')
    // Add all is the answer shown now; the Scalar × picture stays on the graph as an older one.
    expect(runOperation('sum')).toBeNull()
    expect(result().label).toBe('Add all')
    const steps = scene().past.length
    useVC.setState({ k: '4' })
    expectNear(compOf(R().id), [12, 0, 0], 'R after k = 4')
    expect(scene().past.length, 'laid out again in place, as a retyped card lays it out').toBe(steps)
    expect(result().label, 'the answer shown is still Add all').toBe('Add all')
    // A card retyped is worked out with the k the box holds now.
    edit('A', { latex: '5\\hat{i}' })
    expectNear(compOf(R().id), [20, 0, 0], 'R after A = 5i')
    // A k that cannot be read leaves the picture as it is; one that reads again lays it out again.
    useVC.setState({ k: '' })
    expectNear(compOf(R().id), [20, 0, 0], 'R while k is blank')
    useVC.setState({ k: '3' })
    expectNear(compOf(R().id), [15, 0, 0], 'R after k = 3')
  })

  it('Magnetic force drawn, then Add all pressed: the older picture follows a retyped q (G4a)', () => {
    useVC.setState({ cards: [card(2511, 'v', { latex: '\\hat{i}' }), card(2512, 'B', { latex: '\\hat{j}' })], q: '2' })
    expect(runOperation('lorentz')).toBeNull()
    drawAnswer(result().sol, null)
    const F = () => vectors().find((o) => o.name === 'F')!
    expectNear(compOf(F().id), [0, 0, 2], 'F after Draw on graph')
    expect(runOperation('sum')).toBeNull()
    expect(result().label).toBe('Add all')
    useVC.setState({ q: '3' })
    expectNear(compOf(F().id), [0, 0, 3], 'F after q = 3')
    useVC.setState({ q: '' })
    expectNear(compOf(F().id), [0, 0, 3], 'F while q is blank')
    // k is not this picture's box: retyping it leaves F alone.
    useVC.setState({ q: '3', k: '9' })
    expectNear(compOf(F().id), [0, 0, 3], 'F after k = 9')
  })

  it('the panel reads the drawing’s width through a subscription and hands it to tooBigToDraw, so the limit follows a resize (G4b)', () => {
    const src = readSource(VC_SRC)
    // `const widthPx = useView((s) => s.widthPx)`: a hook, so the panel renders again when the width changes.
    const sub = /const\s+(\w+)\s*=\s*useView\(\s*\(\s*(\w+)\s*\)\s*=>\s*\2\.widthPx\s*\)/.exec(src)
    expect(sub, 'a useView((s) => s.widthPx) subscription in the panel').not.toBeNull()
    const calls = src.match(/tooBigToDraw\([^\n]*\)/g) ?? []
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) expect(call, 'tooBigToDraw is given the subscribed width').toMatch(new RegExp(`,\\s*${sub![1]}\\s*\\)`))
  })

  it('tooBigToDraw follows the width it is given, and so does the number in its sentence (G4b)', () => {
    const s = scene().settings
    // 25 000 squares: more than a 1000 or 1200 px drawing holds (20 000, 24 000), fewer than a 1600 px one (32 000).
    const said = (px: number) => tooBigToDraw(25000, s, px)
    expect(said(1000)).toContain(formatMeasure(1000 / MIN_ZOOM_2D, 'length', s))
    expect(said(1200)).toContain(formatMeasure(1200 / MIN_ZOOM_2D, 'length', s))
    expect(said(1200)).not.toBe(said(1000))
    expect(said(1600)).toBeNull()
    // The store's own width is only the default: a width that is given wins.
    const was = useView.getState().widthPx
    try {
      useView.setState({ widthPx: 5000 })
      expect(said(1000)).toContain(formatMeasure(1000 / MIN_ZOOM_2D, 'length', s))
    } finally {
      useView.setState({ widthPx: was })
    }
  })

  /** The TeX with every brace group taken out, contents and nested groups with it: what KaTeX sees at the top level. */
  const outsideBraces = (tex: string): string => {
    let depth = 0
    let out = ''
    for (const ch of tex) {
      if (ch === '{') depth++
      else if (ch === '}') depth--
      else if (depth === 0) out += ch
    }
    return out
  }
  /** The contents of the top-level brace groups. */
  const braceGroups = (tex: string): string[] => {
    const out: string[] = []
    let depth = 0
    let start = 0
    for (let i = 0; i < tex.length; i++) {
      if (tex[i] === '{') {
        if (depth++ === 0) start = i + 1
      } else if (tex[i] === '}' && --depth === 0) out.push(tex.slice(start, i))
    }
    return out
  }
  /** The pieces KaTeX may put on separate lines (its top-level chunks, each ending after an operator), as text. */
  const breakableChunks = (tex: string): string[] =>
    katex
      .renderToString(tex, { throwOnError: true, strict: 'ignore', output: 'html' })
      .split(/<span class="(?:katex-)?base">/)
      .slice(1)
      .map((chunk) => chunk.replace(/<[^>]*>/g, ''))

  it('a card line never breaks inside a number: each ×10ⁿ is in a brace group with its mantissa and unit vector, and KaTeX offers no break after a × (G4c)', () => {
    const s = scene().settings
    const v = fromPolar(8.89e19, toRad(67))
    const line = cardLineTex('A', v, 'number', s)
    // The two components and the size, each whole: "8.18×10¹⁹ ĵ" never "8.18 ×" and "10¹⁹ ĵ".
    const numbers = braceGroups(line).filter((g) => g.includes('\\times'))
    expect(numbers.length, line).toBe(3)
    for (const g of numbers) expect(g, line).toMatch(/^-?\d+(?:\.\d+)?\\times 10\^\{-?\d+\}/)
    expect(numbers.filter((g) => /\\hat\{[ijk]\}$/.test(g)).length, `each component keeps its unit vector: ${line}`).toBe(2)
    expect(outsideBraces(line), 'no × left where KaTeX may break after it').not.toContain('\\times')
    // The grouping only: the line reads as it did, and KaTeX still takes it.
    const plain = `\\vec{A} = ${texIJK(v, s)}\\quad |A| = ${texMeasure(len(v), 'number', s)}\\quad \\theta = ${texMeasure(heading(v), 'direction', s)}`
    expect(render(line)).toBe(render(plain))
    // Breaks between the terms stay allowed, and the unbraced line does break after a ×: the premise of the check.
    const chunks = breakableChunks(line)
    expect(chunks.length, 'the line may still break between terms').toBeGreaterThan(1)
    expect(chunks.filter((c) => c.endsWith('×')), `a break after a × in ${chunks.join(' | ')}`).toEqual([])
    expect(breakableChunks(plain).some((c) => c.endsWith('×')), 'KaTeX breaks the unbraced line after a ×').toBe(true)
  })

  it('the same for a negative first term, a graph card’s unit, a vector out of the plane and a tiny vector written (…) × 10ⁿ (G4c)', () => {
    const s = scene().settings
    const cases: [V3, 'number' | 'length'][] = [
      [[-3e19, 4e19, 0], 'length'],
      [[3e19, 4e19, 5e19], 'number'],
      [[1.6e-19, 1.2e-19, 0], 'number'],
      [[-1.6e-19, 0, 0], 'number']
    ]
    // Every way Settings ▸ Vector notation writes the components.
    try {
      for (const components of ['ijk', 'pair', 'column', 'polar'] as const) {
        setNotation({ components })
        for (const [v, kind] of cases) {
          const line = cardLineTex('B', v, kind, s)
          const what = `${components}: ${line}`
          render(line)
          expect(line, `a number is written in scientific form here: ${what}`).toContain('\\times 10^{')
          expect(outsideBraces(line), what).not.toContain('\\times')
          expect(breakableChunks(line).filter((c) => c.endsWith('×')), what).toEqual([])
        }
      }
    } finally {
      setNotation({ components: 'ijk' })
    }
  })

  it('Scalar × drawn, then Add all pressed: an older picture waits while a card is half typed, even as k is retyped, and follows once the card reads (G4a, found in review)', () => {
    useVC.setState({ cards: [card(2521, 'A', { latex: '3\\hat{i}' })], k: '2' })
    expect(runOperation('scale')).toBeNull()
    drawAnswer(result().sol, null)
    const R = () => vectors().find((o) => o.name === 'R')
    expectNear(compOf(R()!.id), [6, 0, 0], 'R after Draw on graph')
    expect(runOperation('sum')).toBeNull()
    expect(result().label, 'Add all is the answer shown now; the picture is an older one').toBe('Add all')
    // "3i+" on the way to "3i+1j": the card cannot be read, its arrow keeps its last value, and the
    // shown answer's picture would wait. An older picture waits the same way, and k retyped meanwhile
    // did take it off the graph for good: nothing drew it again when the card was finished.
    edit('A', { latex: '3\\hat{i}+' })
    expect(typeof valueOf('A'), 'the premise: the card cannot be read for now').toBe('string')
    useVC.setState({ k: '4' })
    expect(R(), 'the older picture is still on the graph').toBeDefined()
    expectNear(compOf(R()!.id), [6, 0, 0], 'R waits while the card is half typed')
    // Finished, it follows the card and the k the box holds now.
    edit('A', { latex: '5\\hat{i}' })
    expectNear(compOf(R()!.id), [20, 0, 0], 'R after the card reads 5i, k = 4')
    // The card finished as it was, with only k retyped in between: the picture follows k alone.
    edit('A', { latex: '5\\hat{i}+' })
    useVC.setState({ k: '3' })
    expectNear(compOf(R()!.id), [20, 0, 0], 'R waits again')
    edit('A', { latex: '5\\hat{i}' })
    expectNear(compOf(R()!.id), [15, 0, 0], 'R after the card reads 5i again, k = 3')
    // A card that is gone, not half typed, still takes an older picture off: nothing but an undo brings it back.
    removeCard(cardOf('A').id)
    expect(R(), 'a removed card takes the older picture off').toBeUndefined()
  })
})

// V6 (P-VEC, plain text): "8.89×10^19 cm ∠ 67°" was what the drawing's label chips and the vector's
// component and drag labels showed for a 19-digit vector — fmt writes a power of ten with a caret so
// shownValue and sciExponent can read it back, and a caret is programming syntax, which no screen of
// PhysLab shows. The labels are rewritten through superscriptPowers once, as the last step; LaTeX
// (the card line, the working) is typeset with a real exponent and never goes through it.
describe('V6 (plain text) — the drawing’s labels write a power of ten raised, never with a caret', () => {
  const BIG = 8.89e19
  const planarBig = fromPolar(BIG, toRad(67))
  const arrow = (): VectorObj => {
    useVC.setState({ cards: [card(2601, 'A', { latex: '3\\hat{i}' })] })
    return scene().objects[arrowOf('A')] as VectorObj
  }

  it('measureText of a vector 8.89×10¹⁹ cm long at 67° is 8.89\u00a0×\u00a010¹⁹ cm ∠ 67°, compact and with its components', () => {
    const o = arrow()
    const c: Computed = { type: 'vector', tail: [0, 0, 0], comp: planarBig }
    expect(measureText(o, c, scene().settings, false)).toBe('8.89\u00a0×\u00a010¹⁹ cm ∠ 67°')
    expect(measureText(o, c, scene().settings, true)).toBe('8.89\u00a0×\u00a010¹⁹ cm ∠ 67°  (3.47\u00a0×\u00a010¹⁹, 8.18\u00a0×\u00a010¹⁹)')
    // A small one (fmt writes anything under 10⁻¹² as 0, so 10⁻⁷ is the smallest a chip can show). Each
    // component loses its unit before its power is raised: "1.6\u00a0×\u00a010⁻⁷", never a "10⁻⁷" cut off as a unit.
    const small: Computed = { type: 'vector', tail: [0, 0, 0], comp: [1.6e-7, 0, 0] }
    expect(measureText(o, small, scene().settings, true)).toBe('1.6\u00a0×\u00a010⁻⁷ cm ∠ 0°  (1.6\u00a0×\u00a010⁻⁷, 0)')
  })

  // F2: fmtPrecise writes anything under 10⁻¹² as 0 (a drag's noise), so a card typed as 1.6×10⁻¹⁹ ∠ 30° drew the
  // chip "A 0 cm ∠ 30°" while its card line said 1.6\u00a0×\u00a010⁻¹⁹. A vector whose whole size is under the floor is written
  // in scientific form, in the same unit as before; a component under 10⁻¹² of its size is noise beside it, as in the card line.
  it('a vector under 10⁻¹² is written in scientific form on its chip, in its own unit, never as 0 (F2)', () => {
    const o = arrow()
    const s = scene().settings
    const tiny = (comp: V3): Computed => ({ type: 'vector', tail: [0, 0, 0], comp })
    const at30 = tiny(fromPolar(1.6e-19, toRad(30)))
    expect(measureText(o, at30, s, false)).toBe('1.6\u00a0×\u00a010⁻¹⁹ cm ∠ 30°')
    expect(measureText(o, at30, s, true)).toBe('1.6\u00a0×\u00a010⁻¹⁹ cm ∠ 30°  (1.39\u00a0×\u00a010⁻¹⁹, 8\u00a0×\u00a010⁻²⁰)')
    expect(measureText(o, at30, s, true)).not.toMatch(/ 0 |\^/)
    // 3.06×10⁻¹⁶ of 5 is noise beside it, and 6×10⁻³⁶ of 1.6×10⁻¹⁹ is too: the component is 0, not written out.
    expect(measureText(o, tiny(fromPolar(1.6e-19, toRad(90))), s, true)).toBe('1.6\u00a0×\u00a010⁻¹⁹ cm ∠ 90°  (0, 1.6\u00a0×\u00a010⁻¹⁹)')
    // One out of the plane keeps its z (the plane test is relative to its own size, as the card line's is) and has no angle.
    expect(measureText(o, tiny([0, 0, 1.6e-19]), s, false)).toBe('1.6\u00a0×\u00a010⁻¹⁹ cm')
    expect(measureText(o, tiny([0, 0, 1.6e-19]), s, true)).toBe('1.6\u00a0×\u00a010⁻¹⁹ cm  (0, 0, 1.6\u00a0×\u00a010⁻¹⁹)')
    // The unit is the one vectorAmount gives: the drawing's, scaled by the grid, or a question's own, as it is.
    expect(measureText(o, at30, { ...s, unitPerSquare: 2 }, false)).toBe('3.2\u00a0×\u00a010⁻¹⁹ cm ∠ 30°')
    expect(measureText({ ...o, unit: 'N' }, at30, { ...s, unitPerSquare: 2 }, true)).toBe('1.6\u00a0×\u00a010⁻¹⁹ N ∠ 30°  (1.39\u00a0×\u00a010⁻¹⁹, 8\u00a0×\u00a010⁻²⁰)')
    // The floor is on the number the student sees: 10⁻³ squares at 10⁻¹⁰ cm a square is 10⁻¹³ cm.
    expect(measureText(o, tiny([1e-3, 0, 0]), { ...s, unitPerSquare: 1e-10 }, false)).toBe('1\u00a0×\u00a010⁻¹³ cm ∠ 0°')
    // Nothing else changes: an ordinary vector, the zero vector, and one with only noise in a component.
    expect(measureText(o, tiny([3, 4, 0]), s, false)).toBe('5 cm ∠ 53.13°')
    expect(measureText(o, tiny([3, 4, 0]), s, true)).toBe('5 cm ∠ 53.13°  (3, 4)')
    expect(measureText(o, tiny(fromPolar(5, toRad(90))), s, true)).toBe('5 cm ∠ 90°  (0, 5)')
  })

  // H7 on the chip: heading(0) = atan2(0, 0) = 0, so the zero vector's chip read "0 cm ∠ 0°" while its card line
  // said "no direction". The chip says it in the card line's words, compact and full; a vector with a direction keeps its ∠.
  it('a zero vector’s chip shows no direction, in the card line’s words; every other vector keeps its ∠ (H7)', () => {
    const o = arrow()
    const s = scene().settings
    const vec = (comp: V3): Computed => ({ type: 'vector', tail: [0, 0, 0], comp })
    const zero = vec([0, 0, 0])
    expect(measureText(o, zero, s, false)).toBe('0 cm, no direction')
    expect(measureText(o, zero, s, true)).toBe('0 cm, no direction  (0, 0)')
    // A negative zero (a drag back onto the tail) is the zero vector too.
    expect(measureText(o, vec([-0, 0, -0]), s, true)).toBe('0 cm, no direction  (0, 0)')
    // The words are the card line's own, and a question's force arrow of zero says them in its own unit.
    expect(cardLineTex('A', [0, 0, 0], 'number', s)).toContain('no direction')
    expect(measureText({ ...o, unit: 'N' }, zero, s, false)).toBe('0 N, no direction')
    // A vector with a direction keeps its ∠: ordinary, one under the noise floor, and one out of the plane (no ∠, as before).
    expect(measureText(o, vec([3, 4, 0]), s, false)).toBe('5 cm ∠ 53.13°')
    expect(measureText(o, vec([1.6e-19, 0, 0]), s, false)).toBe('1.6\u00a0×\u00a010⁻¹⁹ cm ∠ 0°')
    expect(measureText(o, vec([0, 0, 2]), s, false)).toBe('2 cm')
  })

  it('every other measurement the chips show is raised the same way, and a plain number is as it was', () => {
    const o = arrow()
    const s = scene().settings
    const line = (d: V3) => ({ kind: 'segment' as const, p: [0, 0, 0] as V3, d })
    const cases: [Computed, boolean, string][] = [
      [{ type: 'segment', line: line([BIG, 0, 0]) }, false, '8.89\u00a0×\u00a010¹⁹ cm'],
      [{ type: 'number', value: BIG }, false, '8.89\u00a0×\u00a010¹⁹'],
      [{ type: 'circle', circle: { c: [0, 0, 0], r: BIG } }, false, 'r = 8.89\u00a0×\u00a010¹⁹ cm'],
      [{ type: 'point', p: [BIG, 2, 0] }, true, '(8.89\u00a0×\u00a010¹⁹, 2)'],
      [{ type: 'segment', line: line([3, 4, 0]) }, false, '5 cm'],
      [{ type: 'point', p: [3, 4, 0] }, true, '(3, 4)']
    ]
    for (const [c, full, want] of cases) {
      const text = measureText(o, c, s, full)
      expect(text, c.type).toBe(want)
      expect(text, `${c.type} has no caret`).not.toContain('^')
    }
  })

  it('the vector’s drag and component labels pass through superscriptPowers before they are placed (VectorView)', () => {
    const src = readSource('src/renderer/src/render/ObjectViews.tsx')
    // The VectorView's labels: the drag change and the two components. The "θ" beside the arc has no number.
    const block = between(src, 'The name/size/angle chip comes from the label layer', 'pool.end()')
    const placed = block.match(/pool\.place\([^\n]*\)/g) ?? []
    expect(placed.length, 'the drag label, the x and y component labels and θ').toBe(4)
    for (const call of placed.filter((c) => !c.includes('`θ`'))) expect(call, 'a label with a number in it').toMatch(/^pool\.place\(superscriptPowers\(/)
    expect(src, 'imported from math/format').toMatch(/import \{[^}]*\bsuperscriptPowers\b[^}]*\} from '..\/math\/format'/)
  })
})
