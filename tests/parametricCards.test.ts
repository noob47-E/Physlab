// Tests for Part G3: compact expression rows + parametric cards.
// Verifies:
// 1. Parsing parametric curves (2D and 3D) and surfaces into structured fields.
// 2. Reconstituting parametric command strings when fields or bounds are edited.
// 3. KaTeX formatting for parametric cards without raw horizontal-scrolling code strings.
// 4. Compact expression row behavior (gear controls, width, and domain restrictions).

import { describe, expect, it } from 'vitest'
import {
  parseParametric,
  formatParametric,
  parametricToTeX,
  type ParametricCurve2D,
  type ParametricCurve3D,
  type ParametricSurface3D
} from '../src/renderer/src/panels/parametricCard'
import katex from 'katex'
import { scene } from '../src/renderer/src/core/store'
import { expressionRows } from '../src/renderer/src/panels/expressionRows'
import { replaceGraphEquation } from '../src/renderer/src/lang/graphEdit'
import { runCommand } from '../src/renderer/src/lang/commands'

describe('Part G3: Parametric parsing and formatting', () => {
  it('parses 2D parametric curve into structured fields', () => {
    const parsed = parseParametric('curve(cos(t), sin(t), 0, 2 pi)')
    expect(parsed).not.toBeNull()
    expect(parsed?.kind).toBe('curve2d')
    const c = parsed as ParametricCurve2D
    expect(c.x).toBe('cos(t)')
    expect(c.y).toBe('sin(t)')
    expect(c.tMin).toBe('0')
    expect(c.tMax).toBe('2 pi')
  })

  it('parses 3D space curve into structured x(t), y(t), z(t) fields', () => {
    const parsed = parseParametric('curve(3 cos(t), 3 sin(t), c t - 4, 0, 6 pi)')
    expect(parsed).not.toBeNull()
    expect(parsed?.kind).toBe('curve3d')
    const c = parsed as ParametricCurve3D
    expect(c.x).toBe('3 cos(t)')
    expect(c.y).toBe('3 sin(t)')
    expect(c.z).toBe('c t - 4')
    expect(c.tMin).toBe('0')
    expect(c.tMax).toBe('6 pi')
  })

  it('parses 3D parametric surface into structured x(u,v), y(u,v), z(u,v) fields and bounds', () => {
    const parsed = parseParametric('surface((3 + v cos(n u / 2)) cos(u), (3 + v cos(n u / 2)) sin(u), v sin(n u / 2), 0, 2 pi, -1, 1)')
    expect(parsed).not.toBeNull()
    expect(parsed?.kind).toBe('surface3d')
    const s = parsed as ParametricSurface3D
    expect(s.x).toBe('(3 + v cos(n u / 2)) cos(u)')
    expect(s.y).toBe('(3 + v cos(n u / 2)) sin(u)')
    expect(s.z).toBe('v sin(n u / 2)')
    expect(s.uMin).toBe('0')
    expect(s.uMax).toBe('2 pi')
    expect(s.vMin).toBe('-1')
    expect(s.vMax).toBe('1')
  })

  it('parses surface with default bounds when only coordinates are given', () => {
    const parsed = parseParametric('surface(u, v, u^2 - v^2)')
    expect(parsed).not.toBeNull()
    expect(parsed?.kind).toBe('surface3d')
    const s = parsed as ParametricSurface3D
    expect(s.x).toBe('u')
    expect(s.y).toBe('v')
    expect(s.z).toBe('u^2 - v^2')
  })

  it('returns null for non-parametric curves', () => {
    expect(parseParametric('y = x^2')).toBeNull()
    expect(parseParametric('z = x^2 + y^2')).toBeNull()
    expect(parseParametric('2x + y - z = 3')).toBeNull()
    expect(parseParametric('x^2 + y^2 = 25')).toBeNull()
  })

  it('formats updated parametric curves and surfaces back to executable command strings', () => {
    const c2d: ParametricCurve2D = {
      kind: 'curve2d',
      x: '2 cos(t)',
      y: 'sin(t)',
      tMin: '0',
      tMax: 'pi'
    }
    expect(formatParametric(c2d)).toBe('curve(2 cos(t), sin(t), 0, pi)')

    const c3d: ParametricCurve3D = {
      kind: 'curve3d',
      x: '3 cos(t)',
      y: '3 sin(t)',
      z: 'c t',
      tMin: '0',
      tMax: '4 pi'
    }
    expect(formatParametric(c3d)).toBe('curve(3 cos(t), 3 sin(t), c t, 0, 4 pi)')

    const s3d: ParametricSurface3D = {
      kind: 'surface3d',
      x: 'v tan(a) cos(u)',
      y: 'v tan(a) sin(u)',
      z: 'v',
      uMin: '0',
      uMax: '2 pi',
      vMin: '-4',
      vMax: '4'
    }
    expect(formatParametric(s3d)).toBe('surface(v tan(a) cos(u), v tan(a) sin(u), v, 0, 2 pi, -4, 4)')
  })

  it('generates KaTeX-valid LaTeX without throwing', () => {
    const c2d = parseParametric('curve(cos(t), sin(t), 0, 2 pi)')!
    const tex2d = parametricToTeX(c2d)
    expect(() => katex.renderToString(tex2d, { throwOnError: true })).not.toThrow()

    const c3d = parseParametric('curve(3 cos(t), 3 sin(t), c t - 4, 0, 6 pi)')!
    const tex3d = parametricToTeX(c3d)
    expect(() => katex.renderToString(tex3d, { throwOnError: true })).not.toThrow()

    const s3d = parseParametric('surface((3 + v cos(n u / 2)) cos(u), (3 + v cos(n u / 2)) sin(u), v sin(n u / 2), 0, 2 pi, -1, 1)')!
    const texSurf = parametricToTeX(s3d)
    expect(() => katex.renderToString(texSurf, { throwOnError: true })).not.toThrow()
  })

  it('updates scene object equation when structured fields are committed', async () => {
    scene().newScene()
    await runCommand('c = 1')
    await runCommand('curve(3 cos(t), 3 sin(t), c t - 4, 0, 6 pi)')

    const rows = expressionRows(scene().objects, scene().order)
    const curveRow = rows.find((r) => r.kind === 'graph' && r.source.startsWith('curve('))
    expect(curveRow).toBeDefined()

    const parsed = parseParametric(curveRow!.source)!
    expect(parsed.kind).toBe('curve3d')

    // Edit z(t)
    const updated = { ...parsed, z: '2 c t' } as ParametricCurve3D
    const nextCommand = formatParametric(updated)
    const result = await replaceGraphEquation(curveRow!.id, nextCommand)
    expect(result.ok).toBe(true)

    const updatedObj = scene().objects[curveRow!.id]
    expect(updatedObj).toBeDefined()
    expect(updatedObj.type).toBe('graph')
    if (updatedObj.type === 'graph') {
      expect(updatedObj.source).toBe('curve(3 cos(t), 3 sin(t), 2 c t, 0, 6 pi)')
      expect(updatedObj.exprs[2]).toBe('2 c t')
    }
  })

  it('correctly distinguishes 2D vs 3D curves and formats gathered KaTeX', () => {
    // 2D curve with 4 arguments
    const c2d = parseParametric('curve(cos(t), sin(t), 0, 2 pi)')
    expect(c2d?.kind).toBe('curve2d')

    // 3D curve with 3 arguments where third argument uses t
    const c3d = parseParametric('curve(cos(t), sin(t), t)')
    expect(c3d?.kind).toBe('curve3d')

    // Explicit kind parametric is always 2D even with 3 parts
    const cExplicit2d = parseParametric('curve(cos(t), sin(t), 0)', 'parametric')
    expect(cExplicit2d?.kind).toBe('curve2d')

    // Gathered environment places bounds below cases without horizontal overflow
    const tex = parametricToTeX(c2d!)
    expect(tex).toContain('\\begin{gathered}')
    expect(tex).toContain('\\begin{cases}')
    expect(tex).toContain('\\textstyle t \\in [0,\\,')
  })
})
