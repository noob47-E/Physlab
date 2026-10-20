// Simultaneous equations typed the way a textbook writes them: y = 2x + 1, x + y = 7.
//
// The Calculator's Auto job has to send a comma-separated pair of equations to the system solver
// whichever side the letters are on. Before this, the step engine refused a pair with a letter alone
// on the left ("y = 2x + 1") and the single-equation solver then answered with "An equation has one
// equals sign, and I found more than one." A pair written with the letters on one side already worked.

import { beforeEach, describe, expect, it } from 'vitest'
import { usePure } from '../src/renderer/src/math/pure/store'
import { suggestJob } from '../src/renderer/src/math/pure/run'
import type { Working } from '../src/renderer/src/math/pure/work'
import { expandTerms, readSystem } from '../src/renderer/src/math/steps/check-adapter'
import { resetGlobals } from './helpers/globals'

beforeEach(() => {
  resetGlobals()
  usePure.setState({ working: null, input: '', inputLatex: '', history: [] })
})

/** A value written as \frac{a}{b}, whichever way the card spells a fraction: 8/3, \frac{8}{3} or \dfrac{8}{3}. */
function asFrac(tex: string): string {
  const plain = /^(-?)(\d+)\/(\d+)$/.exec(tex)
  return plain ? `${plain[1]}\\frac{${plain[2]}}{${plain[3]}}` : tex.replace(/\\dfrac/g, '\\frac')
}

/** The value the answer card shows for one letter. */
function valueOf(w: Working | null, letter: string): string | undefined {
  const hit = w?.answers.find((a) => a.label.replace(/[\s=]/g, '') === letter)
  return hit ? asFrac(hit.tex) : undefined
}

const TEXTBOOK_SYSTEMS: Array<{ text: string; x: string; y: string }> = [
  { text: 'y=2x+1, x+y=7', x: '2', y: '5' },
  { text: 'y=x+2, y=3x-4', x: '3', y: '5' },
  { text: 'x=2y, x+y=9', x: '6', y: '3' },
  { text: '2x=y+1, x+y=7', x: '\\frac{8}{3}', y: '\\frac{13}{3}' }
]

describe('simultaneous equations with a letter alone on the left', () => {
  it('sends a comma-separated pair to the system job', () => {
    expect(suggestJob('y=2x+1, x+y=7')).toBe('solve')
    expect(suggestJob('y=x+2, y=3x-4')).toBe('solve')
    expect(suggestJob('x=2y, x+y=9')).toBe('solve')
    expect(suggestJob('2x=y+1, x+y=7')).toBe('solve')
  })

  for (const c of TEXTBOOK_SYSTEMS) {
    it(`solves ${c.text} with working and the right answers`, () => {
      usePure.getState().runLatex(c.text, 'auto', { quiet: true })
      const w = usePure.getState().working
      expect(w?.checked).toBe('ok')
      expect(w?.error).toBeUndefined()
      expect(valueOf(w, 'x')).toBe(c.x)
      expect(valueOf(w, 'y')).toBe(c.y)
    })
  }
})

describe('a letter alone on the left is solved by substitution', () => {
  it('uses substitution, the only method that takes that form', () => {
    usePure.getState().runLatex('y=2x+1, x+y=7', 'auto', { quiet: true })
    const w = usePure.getState().working
    expect(w?.method).toBe('Solve by substitution')
  })

  it('ends with no common solution for parallel lines, and the working checks', () => {
    usePure.getState().runLatex('y=2x+1, y=2x+3', 'auto', { quiet: true })
    const w = usePure.getState().working
    expect(w?.checked).toBe('ok')
    expect(w?.answers[0]?.tex).toContain('no common solution')
  })

  it('ends with infinitely many solutions for one line written twice, and the working checks', () => {
    usePure.getState().runLatex('y=2x+1, 2y=4x+2', 'auto', { quiet: true })
    const w = usePure.getState().working
    expect(w?.checked).toBe('ok')
    expect(w?.answers[0]?.tex).toContain('every pair of values')
  })
})

describe('simultaneous equations that already worked still work', () => {
  it('solves y-2x=1, x+y=7', () => {
    usePure.getState().runLatex('y-2x=1, x+y=7', 'auto', { quiet: true })
    const w = usePure.getState().working
    expect(w?.checked).toBe('ok')
    expect(valueOf(w, 'x')).toBe('2')
    expect(valueOf(w, 'y')).toBe('5')
  })
})

describe('a single line is not a system', () => {
  it('does not send y=2x+1 to the system job', () => {
    // One equation goes to the single-equation job, never to the system job.
    expect(suggestJob('y=2x+1')).toBe('solve')
    usePure.getState().runLatex('y=2x+1', 'auto', { quiet: true })
    const w = usePure.getState().working
    // One line has no second equation to pair with, so it can never come back as a solved system.
    expect(w?.checked).not.toBe('ok')
    expect(valueOf(w, 'x')).toBeUndefined()
    expect(valueOf(w, 'y')).toBeUndefined()
  })
})

describe('a malformed number is never read as a product of two numbers', () => {
  // "0.5.5" is not a number. It used to be read as 0.5 times .5, so a system with it came back as a checked working
  // with a wrong answer. A malformed number now means no working at all: the older path answers, or nothing does.
  const MALFORMED = ['x=0.5.5, y=x', 'x=1.2.3, y=x', 'x=1..5, y=x', 'x=0.5.5, x+y=2', 'x=1.5.5.5, y=x', 'x=2.5^2.5, y=x']
  for (const text of MALFORMED) {
    it(`shows no checked working for ${text}`, () => {
      usePure.getState().runLatex(text, 'auto', { quiet: true })
      const w = usePure.getState().working
      expect(w?.checked).not.toBe('ok')
      expect(w?.answers ?? []).toEqual([])
    })
  }

  it('reads no linear form from a number with two decimal points', () => {
    expect(expandTerms('0.5.5')).toBeNull()
    expect(expandTerms('1.2.3 + x')).toBeNull()
    expect(expandTerms('2 .5')).toBeNull()
    expect(expandTerms('2^2.5')).toBeNull()
    expect(expandTerms('1/2.5.5')).toBeNull()
    expect(readSystem('x=0.5.5, y=x')).toBeNull()
    expect(readSystem('x=2 .5, y=x')).toBeNull()
  })

  it('still reads ordinary decimals in a system', () => {
    expect(readSystem('x=0.5, y=x')).not.toBeNull()
    expect(readSystem('x=.5, y=x')).not.toBeNull()
    // A product written with its operator is still a product: the operator, not a second point, says so.
    expect(expandTerms('0.5*.5')).not.toBeNull()
    expect(expandTerms('2(.5)')).not.toBeNull()
  })
})

describe('a cancelled non-Latin letter is not dropped from a system', () => {
  // A Greek letter that cancels out of every equation is still a letter the text names, so it is an unknown the
  // answer must cover. The Latin version was always declined; the Greek one used to be solved with alpha left out.
  const ALPHA = 'α'
  const BETA = 'β'

  // Substitution and elimination both take these; the cancelled alpha must make the reader refuse, so no working shows.
  const CANCELLED = ['\\alpha-\\alpha+y=3, 2y=\\beta', 'y=3+\\alpha-\\alpha, 2y=\\beta', '\\alpha-\\alpha+y=3, y+\\beta=5']
  for (const text of CANCELLED) {
    it(`shows no checked working for ${text}`, () => {
      usePure.getState().runLatex(text, 'auto', { quiet: true })
      const w = usePure.getState().working
      expect(w?.checked).not.toBe('ok')
      expect(w?.answers ?? []).toEqual([])
    })
  }

  it('reads no system with a cancelled Greek letter', () => {
    expect(readSystem(`${ALPHA}-${ALPHA}+y=3, 2y=${BETA}`)).toBeNull()
    expect(readSystem(`y=3+${ALPHA}-${ALPHA}, 2y=${BETA}`)).toBeNull()
  })

  it('still solves a Greek-named system whose letters all stay in', () => {
    usePure.getState().runLatex('\\alpha-\\beta=1, \\alpha+\\beta=5', 'auto', { quiet: true })
    const w = usePure.getState().working
    expect(w?.checked).toBe('ok')
    expect(valueOf(w, ALPHA)).toBe('3')
    expect(valueOf(w, BETA)).toBe('2')
  })

  it('still declines the Latin version', () => {
    expect(readSystem('a-a+y=3, 2y=b')).toBeNull()
  })
})
