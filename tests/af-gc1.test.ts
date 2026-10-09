import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))

import { spaceOf, visibleIn } from '../src/renderer/src/core/visibility'
import { scene } from '../src/renderer/src/core/store'
import { visualizeVector } from '../src/renderer/src/core/visualize'
import type { SceneObject } from '../src/renderer/src/core/types'

describe('GC1 — the Calculator looks at the Graphing drawing', () => {
  beforeEach(() => {
    scene().newScene()
    scene().clearLog()
  })

  it('spaceOf calculator is graphing, and problems stays vectors', () => {
    expect(spaceOf('calculator')).toBe('graphing')
    expect(spaceOf('problems')).toBe('vectors')
  })

  it('with active space set to spaceOf calculator, a vector made by visualizeVector is stored in graphing and visible in both calculator and graphing space', () => {
    scene().setActiveSpace(spaceOf('calculator'))
    const res = (visualizeVector as (comp: unknown) => unknown)([3, 4, 0])
    const vec: SceneObject | undefined =
      res && typeof res === 'object' && 'space' in res
        ? (res as SceneObject)
        : typeof res === 'string' && scene().objects[res]
          ? scene().objects[res]
          : Object.values(scene().objects).find((o) => o.type === 'vector')

    expect(vec).toBeDefined()
    expect(vec!.space).toBe('graphing')
    expect(visibleIn(vec, spaceOf('calculator'))).toBe(true)
    expect(visibleIn(vec, spaceOf('graphing'))).toBe(true)
  })
})
