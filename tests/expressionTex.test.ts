import { describe, expect, it } from 'vitest'
import { graphLineToTeX } from '../src/renderer/src/panels/expressionTex'

const tex = (s: string) => {
  const r = graphLineToTeX(s)
  if (!r.ok) throw new Error(`no tex for ${s}`)
  return r.tex
}

describe('graphLineToTeX', () => {
  it('stacks a fraction', () => {
    expect(tex('y = x^2 + 1/2')).toMatch(/y\s*=.*\\frac\{1\}\{2\}/)
  })
  it('draws a square root', () => expect(tex('y = sqrt(x+1)')).toContain('\\sqrt{'))
  it('reads sin 2x', () => expect(tex('y = sin 2x')).toMatch(/\\sin/))
  it('keeps a plane equation', () => {
    const t = tex('2x + y - z = 3')
    expect(t).toContain('=')
    expect(t).toContain('3')
  })
  it('reads z = x^2 - y^2', () => expect(tex('z = x^2 - y^2')).toBe('z = {x}^{2}-{y}^{2}'))
  it('reads a parametric curve line', () => {
    const r = graphLineToTeX('curve(cos(t), sin(t), t/5, 0, 4 pi)')
    expect(r.ok).toBe(true)
  })
  it('reads a slider line', () => expect(tex('a = 2')).toBe('a = 2'))
  it('reads an inequality', () => expect(tex('y <= x')).toContain('\\le'))
  it('gives no tex for a line that does not parse, and never throws', () => {
    expect(graphLineToTeX('y = (x +')).toEqual({ ok: false })
    expect(graphLineToTeX('')).toEqual({ ok: false })
  })
})

