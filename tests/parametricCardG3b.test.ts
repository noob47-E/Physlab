// Tests for Part G3b:
// 1. Parametric card shows formula only once: typeset KaTeX when viewing, edit boxes only while editing.
// 2. Title is concise ('2D Curve', '3D Curve', '3D Surface') and does not cut to 'Curve in...' (shrink-0, whitespace-nowrap).
// 3. Edit toggle: clicking the formula or 'edit' button enters edit mode; 'Done' button or leaving exits edit mode.

import { beforeEach, describe, expect, it } from 'vitest'
import { readSource } from './helpers/repo'
import { scene } from '../src/renderer/src/core/store'
import { runCommand } from '../src/renderer/src/lang/commands'
import { expressionRows, EXPRESSION_WORDS } from '../src/renderer/src/panels/expressionRows'
import { parseParametric, formatParametric } from '../src/renderer/src/panels/parametricCard'
import { resetGlobals } from './helpers/globals'

beforeEach(() => {
  resetGlobals()
  scene().newScene()
  scene().clearLog()
  scene().setActiveSpace('graphing')
})

describe('Part G3b: Parametric card title stability', () => {
  it('defines concise, clear titles that never wrap or truncate to Curve in...', () => {
    expect(EXPRESSION_WORDS.curve2d).toBe('2D Curve')
    expect(EXPRESSION_WORDS.curve3d).toBe('3D Curve')
    expect(EXPRESSION_WORDS.surface3d).toBe('3D Surface')

    const src = readSource('src/renderer/src/panels/Expressions.tsx')
    // Title span must be non-shrinking and whitespace-nowrap so narrow sidebars never cut it to 'Curve in...'
    expect(src).toMatch(/<span[^>]*font-semibold[^>]*shrink-0[^>]*whitespace-nowrap[^>]*>\{title\}<\/span>/)
  })
})

describe('Part G3b: Parametric card view vs edit mode', () => {
  it('manages editing state in ParametricRowView', () => {
    const src = readSource('src/renderer/src/panels/Expressions.tsx')
    // ParametricRowView must declare an editing state
    expect(src).toMatch(/function ParametricRowView[\s\S]*?const \[editing,\s*setEditing\]\s*=\s*useState\(false\)/)
  })

  it('shows edit boxes only while editing, and shows KaTeX button when viewing', () => {
    const src = readSource('src/renderer/src/panels/Expressions.tsx')
    // When not editing, formula is shown inside a clickable button that triggers setEditing(true)
    expect(src).toMatch(/onClick=\{[^}]*setEditing\(true\)[^}]*\}[\s\S]*?<Tex tex=\{tex\}/)

    // The structured input fields must only render when editing is true
    expect(src).toMatch(/editing\s*\?[\s\S]*?fields\.kind === 'curve2d'[\s\S]*?:/)
  })

  it('provides an edit / Done button toggle in the row header', () => {
    const src = readSource('src/renderer/src/panels/Expressions.tsx')
    // In edit mode there is a Done button to exit editing
    expect(src).toMatch(/setEditing\(false\)[\s\S]*?>\s*Done\s*<\/button>/)
  })

  it('parametric scene curves parse and format reliably through store', async () => {
    await runCommand('c = 1')
    await runCommand('curve(3 cos(t), 3 sin(t), c t - 4, 0, 6 pi)')
    const rows = expressionRows(scene().objects, scene().order)
    const curveRow = rows.find((r) => r.kind === 'graph' && r.source.startsWith('curve('))
    expect(curveRow).toBeDefined()

    const parsed = parseParametric(curveRow!.source)
    expect(parsed).not.toBeNull()
    expect(parsed?.kind).toBe('curve3d')
    if (parsed?.kind === 'curve3d') {
      expect(parsed.x).toBe('3 cos(t)')
      expect(parsed.y).toBe('3 sin(t)')
      expect(parsed.z).toBe('c t - 4')
      expect(formatParametric(parsed)).toBe(curveRow!.source)
    }
  })

  it('keeps raw editor open when raw command commit fails so student can correct it', () => {
    const src = readSource('src/renderer/src/panels/Expressions.tsx')
    // commitRaw must return Promise<boolean>
    expect(src).toMatch(/const commitRaw = async \(cmd: string\): Promise<boolean> =>/)
    // onCommit checks if commitRaw was successful before closing editor
    expect(src).toMatch(/const ok = await commitRaw\(v\)\s*if \(ok\) setEditing\(false\)/)
  })

  it('does not close editing on blur when switching between raw and fields', () => {
    const src = readSource('src/renderer/src/panels/Expressions.tsx')
    // Raw mode TextField must not have onLeave={() => setEditing(false)} which collapses card when clicking 'fields'
    expect(src).not.toMatch(/TextField[^>]*mono[^>]*autoFocus[^>]*value=\{rawText\}[^>]*onLeave=\{\(\)\s*=>\s*setEditing\(false\)\}/)
  })
})
