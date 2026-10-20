// Part M: the determinant and the inverse of a typed matrix, worked step by step in the Calculator.
//
// The "=" card keeps its answer (mathjs), and the working under it comes from math/pure/matrix.ts. A working is only ever shown
// checked: its determinant is confirmed by row reduction with exact fractions, and its inverse by multiplying it back into the
// matrix. These tests go through runLatex and evaluateInput, the two doors the Calculator uses, and check the working's numbers
// against mathjs on a sweep of matrices, not only on the hand-worked examples.

import { beforeEach, describe, expect, it } from 'vitest'
import katex from 'katex'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WorkingView } from '../src/renderer/src/panels/WorkingView'
import { math } from '../src/renderer/src/math/expr'
import { keypadToMath } from '../src/renderer/src/calc/engine'
import { latexToMath } from '../src/renderer/src/math/latexToMath'
import { usePure } from '../src/renderer/src/math/pure/store'
import type { Working } from '../src/renderer/src/math/pure/work'
import { isMatrixLine, matrixWorkingFor } from '../src/renderer/src/math/pure/matrix'
import { evaluateInput } from '../src/renderer/src/calc/evaluateInput'
import { reconcile, wantsWorking } from '../src/renderer/src/calc/working'
import { resetGlobals } from './helpers/globals'

const CALC = { vars: {}, ans: 0, angle: 'deg' as const }

beforeEach(() => {
  resetGlobals()
  usePure.setState({ working: null, input: '', inputLatex: '', history: [] })
})

/** A matrix as the keypad writes it: \begin{pmatrix} with & between cells and \\ between rows. */
const pm = (rows: string[][]): string => `\\begin{pmatrix}${rows.map((r) => r.join('&')).join('\\\\')}\\end{pmatrix}`

/** The number or matrix a LaTeX answer stands for, read the way the Calculator reads a typed answer (a mathjs matrix as rows). */
const valueOf = (tex: string): unknown => {
  const v = math.evaluate(keypadToMath(latexToMath(tex))) as unknown
  return typeof (v as { toArray?: unknown })?.toArray === 'function' ? (v as { toArray(): unknown }).toArray() : v
}

/** Every LaTeX string a working shows must draw: an unbalanced brace is otherwise red on the screen. */
const drawsInKaTeX = (tex: string): void => {
  expect(() => katex.renderToString(tex, { displayMode: true, throwOnError: true, strict: 'ignore' }), tex).not.toThrow()
}

function workingOf(latex: string) {
  usePure.getState().runLatex(latex, 'auto', { quiet: true })
  return usePure.getState().working
}

describe('the determinant of a typed matrix', () => {
  it('2 × 2: det [[1,2],[3,4]] is -2, worked by the diagonal products', () => {
    const w = workingOf(`\\operatorname{det}${pm([['1', '2'], ['3', '4']])}`)
    expect(w?.error).toBeUndefined()
    expect(w?.title).toBe('Determinant')
    expect(w?.checked).toBe('ok')
    expect(w?.answers).toEqual([{ label: 'det =', tex: '-2' }])
    expect(w?.moves.map((m) => m.tex)).toEqual(['1 \\times 4 = 4', '2 \\times 3 = 6', '4 - 6 = -2'])
    w?.moves.forEach((m) => drawsInKaTeX(m.tex ?? ''))
  })

  it('the card still reads -2, and the working agrees with it', () => {
    const card = evaluateInput('COMP', `\\operatorname{det}${pm([['1', '2'], ['3', '4']])}`, CALC)
    expect(card?.value).toBe(-2)
    const w = workingOf(`\\operatorname{det}${pm([['1', '2'], ['3', '4']])}`)
    const r = reconcile(card!, w)
    expect(r.verdict).toBe('agree')
    expect(r.result.main).toBe(card?.main)
  })

  it('3 × 3 by expansion along the top row, with each minor shown', () => {
    // Worked by hand: 2 × (3·1 − 2·1) − 0 × (1·1 − 2·1) + 1 × (1·1 − 3·1) = 2 − 0 − 2 = 0. The matrix is singular, so the
    // determinant is 0 (not −1 as a first guess has it); mathjs agrees.
    const w = workingOf(`\\operatorname{det}${pm([['2', '0', '1'], ['1', '3', '2'], ['1', '1', '1']])}`)
    expect(w?.checked).toBe('ok')
    expect(w?.answers).toEqual([{ label: 'det =', tex: '0' }])
    // One minor per top-row number, each shown as a grid with its own value.
    const minors = w?.moves.filter((m) => (m.tex ?? '').includes('\\begin{vmatrix}')) ?? []
    expect(minors).toHaveLength(3)
    const card = evaluateInput('COMP', `\\operatorname{det}${pm([['2', '0', '1'], ['1', '3', '2'], ['1', '1', '1']])}`, CALC)
    expect(card?.value).toBe(0)
    expect(reconcile(card!, w).verdict).toBe('agree')
  })

  it('3 × 3: det [[1,2,3],[0,1,4],[5,6,0]] is 1', () => {
    const w = workingOf(`\\operatorname{det}${pm([['1', '2', '3'], ['0', '1', '4'], ['5', '6', '0']])}`)
    expect(w?.checked).toBe('ok')
    expect(w?.answers).toEqual([{ label: 'det =', tex: '1' }])
  })

  it('fractions stay exact: det [[1/2,1],[3,4]] is -1, not a decimal', () => {
    const w = workingOf(`\\operatorname{det}${pm([['\\frac{1}{2}', '1'], ['3', '4']])}`)
    expect(w?.checked).toBe('ok')
    expect(w?.answers).toEqual([{ label: 'det =', tex: '-1' }])
    expect(w?.moves[0].tex).toBe('\\frac{1}{2} \\times 4 = 2')
  })

  it('a bracket matrix (bmatrix) is read like a pmatrix: det is -2 again', () => {
    const latex = `\\operatorname{det}\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}`
    expect(workingOf(latex)?.answers).toEqual([{ label: 'det =', tex: '-2' }])
    expect(evaluateInput('COMP', latex, CALC)?.value).toBe(-2)
  })

  it('the determinant bars |…| (a vmatrix) are the same determinant: |1 2; 3 4| is -2 with its working', () => {
    // latexToMath reads a vmatrix as det(...), so the bars reach the same working as \det does.
    const latex = `\\begin{vmatrix}1&2\\\\3&4\\end{vmatrix}`
    const w = workingOf(latex)
    expect(w?.title).toBe('Determinant')
    expect(w?.checked).toBe('ok')
    expect(w?.answers).toEqual([{ label: 'det =', tex: '-2' }])
    expect(evaluateInput('COMP', latex, CALC)?.value).toBe(-2)
  })

  it('a decimal is read as it was written: det [[0.5,1],[3,4]] is -1', () => {
    const w = workingOf(`\\operatorname{det}${pm([['0.5', '1'], ['3', '4']])}`)
    expect(w?.answers).toEqual([{ label: 'det =', tex: '-1' }])
  })

  it('the text forms work too: det([[1,2],[3,4]]) and \\det with the matrix straight after it', () => {
    expect(workingOf('det([[1,2],[3,4]])')?.answers).toEqual([{ label: 'det =', tex: '-2' }])
    // \det followed by the matrix used to be read as det() with the matrix outside it, and the Calculator refused.
    expect(workingOf(`\\det${pm([['1', '2'], ['3', '4']])}`)?.answers).toEqual([{ label: 'det =', tex: '-2' }])
    expect(evaluateInput('COMP', `\\det${pm([['1', '2'], ['3', '4']])}`, CALC)?.value).toBe(-2)
  })

  it('a line that is not a matrix determinant is left alone', () => {
    expect(matrixWorkingFor('det(x)')).toBeNull()
    expect(matrixWorkingFor('det([[1,2],[3,4]]) + 1')).toBeNull()
    expect(matrixWorkingFor('det([[x,1],[2,3]])')).toBeNull()
    // Bigger than 3 × 3 is not worked here: the answer stays as the other engines give it.
    expect(matrixWorkingFor('det([[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]])')).toBeNull()
  })

  it('a matrix straight after a function name is its argument: the sine of a matrix is refused in words', () => {
    // latexToMath reads a matrix after any function name as its argument, as it does after \det. The sine of a matrix is still
    // refused, now with a sentence about the function, and no determinant or inverse working comes from that line.
    const latex = `\\sin${pm([['1', '2'], ['3', '4']])}`
    expect(evaluateInput('COMP', latex, CALC)?.error?.sentence).toBe('That function takes a number, not a matrix.')
    expect(matrixWorkingFor(latexToMath(latex))).toBeNull()
  })

  it('a number typed with more than 15 digits gets no working, even when mathjs rounds it to a short double', () => {
    // mathjs keeps 99999999999999999999 as the double 1e20, whose text is 1 and zeros, so a check on that text sees a short
    // number and passes it. The digit guard reads what was typed, so these lines are refused and no working is shown.
    expect(matrixWorkingFor('det([[99999999999999999999,1],[1,1]])')).toBeNull()
    expect(matrixWorkingFor('det([[10000000000000001,0],[0,1]])')).toBeNull()
    expect(matrixWorkingFor('det([[0.1000000000000000055,0],[0,1]])')).toBeNull()
    expect(matrixWorkingFor('inv([[10000000000000001,0],[0,1]])')).toBeNull()
    expect(isMatrixLine('det([[99999999999999999999,1],[1,1]])')).toBe(false)
  })

  it('the same refusal through the Calculator: no checked working shows the rounded number', () => {
    // The refusal is an error working that echoes the line; what must not happen is a checked answer or a number to show.
    const w = workingOf(`\\operatorname{det}${pm([['99999999999999999999', '1'], ['1', '1']])}`)
    expect(w?.checked).not.toBe('ok')
    expect(w?.answers ?? []).toEqual([])
  })

  it('a 15-digit number is still worked exactly: det [[123456789012345,1],[1,1]] is 123456789012344', () => {
    const w = workingOf(`\\operatorname{det}${pm([['123456789012345', '1'], ['1', '1']])}`)
    expect(w?.checked).toBe('ok')
    expect(w?.answers).toEqual([{ label: 'det =', tex: '123456789012344' }])
  })

  it('a singular decimal matrix: det is 0, and the card shows that 0 rather than mathjs round-off', () => {
    const latex = `\\operatorname{det}${pm([['0.1', '0.2', '0.3'], ['0.4', '0.5', '0.6'], ['0.7', '0.8', '0.9']])}`
    const card = evaluateInput('COMP', latex, CALC)
    // mathjs's float determinant of this matrix is round-off, not 0: that is what the card would otherwise keep.
    expect(card?.value).not.toBe(0)
    const w = workingOf(latex)
    expect(w?.checked).toBe('ok')
    expect(w?.answers).toEqual([{ label: 'det =', tex: '0' }])
    const r = reconcile(card!, w)
    expect(r.verdict).toBe('agree')
    expect(r.result.main).toBe('0')
  })
})

describe('the inverse of a typed matrix', () => {
  it('2 × 2: inv [[1,2],[3,4]] is [[-2,1],[3/2,-1/2]], by swapping and dividing by the determinant', () => {
    const w = workingOf(`\\operatorname{inv}${pm([['1', '2'], ['3', '4']])}`)
    expect(w?.error).toBeUndefined()
    expect(w?.title).toBe('Inverse')
    expect(w?.checked).toBe('ok')
    expect(w?.answers).toHaveLength(1)
    expect(valueOf(w!.answers[0].tex)).toEqual([
      [-2, 1],
      [1.5, -0.5]
    ])
    expect(w?.moves.some((m) => (m.tex ?? '').includes('\\operatorname{adj}A'))).toBe(true)
    expect(w?.check).toMatch(/identity matrix/)
    w?.moves.forEach((m) => drawsInKaTeX(m.tex ?? ''))
    drawsInKaTeX(w!.answers[0].tex)
  })

  it('3 × 3: inv [[1,2,3],[0,1,4],[5,6,0]] is [[-24,18,5],[20,-15,-4],[-5,4,1]], by the cofactors and the adjugate', () => {
    const w = workingOf(`\\operatorname{inv}${pm([['1', '2', '3'], ['0', '1', '4'], ['5', '6', '0']])}`)
    expect(w?.checked).toBe('ok')
    expect(valueOf(w!.answers[0].tex)).toEqual([
      [-24, 18, 5],
      [20, -15, -4],
      [-5, 4, 1]
    ])
    expect(w?.moves.some((m) => (m.tex ?? '').includes('\\operatorname{adj}A'))).toBe(true)
    w?.moves.forEach((m) => drawsInKaTeX(m.tex ?? ''))
  })

  it('the x⁻¹ key on a matrix gives the same inverse, and the card keeps its own value', () => {
    const latex = `${pm([['1', '2'], ['3', '4']])}^{-1}`
    const w = workingOf(latex)
    expect(w?.title).toBe('Inverse')
    expect(valueOf(w!.answers[0].tex)).toEqual([
      [-2, 1],
      [1.5, -0.5]
    ])
    expect(wantsWorking(latexToMath(latex))).toBe(true)
    const card = evaluateInput('COMP', latex, CALC)
    expect((card?.value as { toArray(): number[][] }).toArray()).toEqual([
      [-2, 1],
      [1.5, -0.5]
    ])
    expect(reconcile(card!, w).result.main).toBe(card?.main)
  })

  it('singular: inv [[1,2],[2,4]] says there is no inverse, and the card keeps its own sentence', () => {
    const latex = `\\operatorname{inv}${pm([['1', '2'], ['2', '4']])}`
    const card = evaluateInput('COMP', latex, CALC)
    expect(card?.error).toBeDefined()
    const w = workingOf(latex)
    expect(w?.checked).toBe('ok')
    expect(w?.answers).toEqual([])
    expect(w?.check).toMatch(/No inverse \(singular\): the determinant is 0/)
    expect(w?.moves.at(-1)?.tex).toBe('\\det A = 0')
    // The working is shown; the card stays the sentence the other engine gave, so no answer is replaced.
    expect(reconcile(card!, w).result).toBe(card)
  })

  it('singular 3 × 3: inv [[1,2,3],[4,5,6],[7,8,9]] says there is no inverse, and the card does not keep mathjs’s garbage numbers', () => {
    // mathjs does not throw for this matrix: its float inverse is a grid of numbers near 10^15, which the card showed as the answer.
    const latex = `\\operatorname{inv}${pm([['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']])}`
    const card = evaluateInput('COMP', latex, CALC)
    expect(card?.error).toBeUndefined()
    const w = workingOf(latex)
    expect(w?.checked).toBe('ok')
    expect(w?.answers).toEqual([])
    const r = reconcile(card!, w)
    expect(r.verdict).toBe('differ')
    expect(r.result.main).toBe('This matrix has no inverse: its determinant is 0.')
    expect(r.result.unconfirmed).toBe(true)
    expect(r.line).toMatch(/PHYSLAB_CHECK calc-disagree/)
  })

  it('singular matrices of decimals and fractions also say there is no inverse, and the card agrees', () => {
    const singular = [
      [
        ['0.1', '0.2', '0.3'],
        ['0.4', '0.5', '0.6'],
        ['0.7', '0.8', '0.9']
      ],
      [
        ['\\frac{1}{3}', '\\frac{2}{3}', '1'],
        ['\\frac{2}{3}', '1', '\\frac{4}{3}'],
        ['1', '\\frac{5}{3}', '\\frac{7}{3}']
      ]
    ]
    for (const rows of singular) {
      const latex = `\\operatorname{inv}${pm(rows)}`
      const w = workingOf(latex)
      expect(w?.checked, latex).toBe('ok')
      expect(w?.answers, latex).toEqual([])
      const card = evaluateInput('COMP', latex, CALC)
      const r = reconcile(card!, w)
      // Either the card is the refusal the other engine gave, or it is the working's sentence: never a numeric inverse.
      expect(r.result.main === 'This matrix has no inverse: its determinant is 0.' || !!r.result.error, latex).toBe(true)
      expect(r.verdict, latex).not.toBe('agree')
    }
  })

  it('a card inverse that the working does not match is flagged as differing, not left unchecked', () => {
    const latex = `\\operatorname{inv}${pm([['1', '2'], ['3', '4']])}`
    const card = evaluateInput('COMP', latex, CALC)
    expect(reconcile(card!, workingOf(latex)).verdict).toBe('agree')
    // A working whose inverse is not the card's (the identity here) must not pass as checked.
    const wrong: Working = {
      title: 'Inverse',
      input: '',
      moves: [],
      answers: [{ label: 'inverse =', tex: pm([['1', '0'], ['0', '1']]) }],
      checked: 'ok'
    }
    const r = reconcile(card!, wrong)
    expect(r.verdict).toBe('differ')
    expect(r.result.unconfirmed).toBe(true)
    // The real working agrees with the card for the other shapes too: a fraction matrix, and a 3 × 3.
    for (const rows of [
      [
        ['\\frac{1}{2}', '1'],
        ['3', '4']
      ],
      [
        ['1', '2', '3'],
        ['0', '1', '4'],
        ['5', '6', '0']
      ]
    ]) {
      const same = `\\operatorname{inv}${pm(rows)}`
      expect(reconcile(evaluateInput('COMP', same, CALC)!, workingOf(same)).verdict, same).toBe('agree')
    }
  })

  it('an inverse of a fraction matrix stays exact: inv [[1/2,1],[3,4]] is [[-4,1],[3,-1/2]]', () => {
    const w = workingOf(`\\operatorname{inv}${pm([['\\frac{1}{2}', '1'], ['3', '4']])}`)
    expect(w?.checked).toBe('ok')
    expect(valueOf(w!.answers[0].tex)).toEqual([
      [-4, 1],
      [3, -0.5]
    ])
    // The entries stay fractions on the page: −½ is written as a fraction, not 0.5.
    expect(w?.answers[0].tex).toContain('-\\frac{1}{2}')
  })
})

describe('what the working is asked and what it is shown with', () => {
  it('a determinant or inverse of a typed matrix always gets a working', () => {
    expect(wantsWorking(latexToMath(`\\operatorname{det}${pm([['1', '2'], ['3', '4']])}`))).toBe(true)
    expect(wantsWorking('([[1, 2], [3, 4]])^(-1)')).toBe(true)
    expect(isMatrixLine('det(([[1, 2], [3, 4]]))')).toBe(true)
    expect(isMatrixLine('det(x)')).toBe(false)
  })

  it('the working is never left unchecked for a 2 × 2 or 3 × 3 matrix of rational numbers', () => {
    // A sweep: every matrix below gives a working, checked, whose numbers match mathjs. Singular ones say so.
    // A fixed 32-bit generator (exact integer multiply), so the same matrices come up on every run.
    let seed = 20260101
    const next = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 4294967296
    }
    const ENTRIES: { tex: string; value: number }[] = [
      { tex: '-3', value: -3 },
      { tex: '-2', value: -2 },
      { tex: '-1', value: -1 },
      { tex: '0', value: 0 },
      { tex: '1', value: 1 },
      { tex: '2', value: 2 },
      { tex: '3', value: 3 },
      { tex: '\\frac{1}{2}', value: 0.5 },
      { tex: '-\\frac{1}{3}', value: -1 / 3 },
      { tex: '\\frac{3}{4}', value: 0.75 },
      { tex: '0.5', value: 0.5 }
    ]
    const pick = (): { tex: string; value: number } => ENTRIES[Math.floor(next() * ENTRIES.length)]
    let singular = 0
    for (let k = 0; k < 48; k++) {
      const n = k % 2 === 0 ? 2 : 3
      const cells = Array.from({ length: n }, () => Array.from({ length: n }, pick))
      // Every fourth matrix gets a repeated row, so it is singular whatever the random numbers were: the sweep must meet
      // matrices with no inverse as well as the others.
      if (k % 4 === 3) cells[n - 1] = cells[0].slice()
      const rows = cells.map((r) => r.map((c) => c.tex))
      const numbers = cells.map((r) => r.map((c) => c.value))
      const exactDet = math.det(numbers) as number
      const scale = Math.max(1, ...numbers.flat().map(Math.abs))

      const d = workingOf(`\\operatorname{det}${pm(rows)}`)
      expect(d?.checked, `det ${rows.join(' / ')}`).toBe('ok')
      expect(Math.abs((valueOf(d!.answers[0].tex) as number) - exactDet), `det ${rows.join(' / ')}`).toBeLessThan(1e-9 * scale ** n)
      d?.moves.forEach((m) => drawsInKaTeX(m.tex ?? ''))

      const card = evaluateInput('COMP', `\\operatorname{det}${pm(rows)}`, CALC)
      expect(card && !card.error, `card ${rows.join(' / ')}`).toBe(true)
      expect(reconcile(card!, d).verdict, `reconcile ${rows.join(' / ')}`).not.toBe('differ')

      const inv = workingOf(`\\operatorname{inv}${pm(rows)}`)
      expect(inv, `inv ${rows.join(' / ')}`).not.toBeNull()
      if (Math.abs(exactDet) < 1e-12) {
        singular++
        expect(inv?.checked, `inv ${rows.join(' / ')}`).toBe('ok')
        expect(inv?.answers).toEqual([])
        expect(inv?.check).toMatch(/no inverse/i)
      } else {
        expect(inv?.checked, `inv ${rows.join(' / ')}`).toBe('ok')
        const expected = math.inv(numbers) as number[][]
        const got = valueOf(inv!.answers[0].tex) as number[][]
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            expect(Math.abs(got[i][j] - expected[i][j]), `inv ${rows.join(' / ')}`).toBeLessThan(1e-9 * Math.max(1, Math.abs(expected[i][j])))
          }
        }
        drawsInKaTeX(inv!.answers[0].tex)
        inv?.moves.forEach((m) => drawsInKaTeX(m.tex ?? ''))
      }
    }
    // The sweep is only a real test if it meets singular matrices as well as invertible ones.
    expect(singular).toBeGreaterThan(5)
    // Every move of every working is rendered through KaTeX, which is most of the time: the explicit budget keeps a busy PC from failing it.
  }, 30000)
})

describe('what the student sees for a matrix with no inverse', () => {
  it('the working draws its conclusion where the answer goes, so the word "singular" reaches the screen', () => {
    const latex = `\\operatorname{inv}${pm([['1', '2'], ['2', '4']])}`
    const w = workingOf(latex)
    const html = renderToStaticMarkup(
      createElement(WorkingView, {
        doc: w!,
        pref: 'all',
        invited: () => false,
        settled: () => {},
        onPref: () => {},
        onOffer: () => {},
        onTry: () => {}
      })
    )
    expect(html).toContain('This matrix has no inverse: its determinant is 0.')
  })
})
