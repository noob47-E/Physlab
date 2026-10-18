// G4: 3-D presets ask before mixing with student lines, and hover readout cleanup.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { runCommand } from '../src/renderer/src/lang/commands'
import { scene } from '../src/renderer/src/core/store'
import type { GraphObj } from '../src/renderer/src/core/types'
import { TILES_3D } from '../src/renderer/src/math/graph3dTiles'
import { hasStudentLines, playTile, studentGraphingObjects } from '../src/renderer/src/panels/tiles3d'
import { resetGlobals } from './helpers/globals'
import { RENDERER_SRC } from './helpers/repo'

beforeEach(() => {
  resetGlobals()
  scene().newScene()
  scene().clearLog()
  scene().setActiveSpace('graphing')
})

const graphingGraphs = (): GraphObj[] =>
  Object.values(scene().objects).filter((o): o is GraphObj => o.type === 'graph' && (!o.space || o.space === 'graphing'))

describe('G4: 3-D preset tiles ask before mixing with student lines', () => {
  it('detects when the student has lines on the drawing', async () => {
    expect(hasStudentLines()).toBe(false)
    expect(studentGraphingObjects()).toHaveLength(0)

    // User types a 3D plane
    await runCommand('2x + y - z = 3')
    expect(hasStudentLines()).toBe(true)
    expect(studentGraphingObjects()).toHaveLength(1)
  })

  it('recognises that objects created by a preset tile are not student lines', async () => {
    const saddle = TILES_3D.find((t) => t.id === 'saddle-surface')!
    await playTile(saddle)

    // Only the saddle surface and its slider are present
    expect(hasStudentLines()).toBe(false)
    expect(studentGraphingObjects()).toHaveLength(0)

    // Now student adds an equation
    await runCommand('z = 2')
    expect(hasStudentLines()).toBe(true)
    const student = studentGraphingObjects()
    expect(student).toHaveLength(1)
    expect(scene().objects[student[0]]?.type).toBe('graph')
  })

  it('cleanDrawing: false adds the preset beside student lines', async () => {
    await runCommand('2x + y - z = 3')
    const userLineId = studentGraphingObjects()[0]
    expect(userLineId).toBeDefined()

    const saddle = TILES_3D.find((t) => t.id === 'saddle-surface')!
    await playTile(saddle, { cleanDrawing: false })

    // User line must still be in the scene
    expect(scene().objects[userLineId]).toBeDefined()
    // Saddle must also be in the scene
    expect(graphingGraphs().some((g) => g.kind === 'surface')).toBe(true)
  })

  it('cleanDrawing: true removes student lines with full undo support', async () => {
    await runCommand('2x + y - z = 3')
    const userLineId = studentGraphingObjects()[0]
    expect(userLineId).toBeDefined()

    const saddle = TILES_3D.find((t) => t.id === 'saddle-surface')!
    await playTile(saddle, { cleanDrawing: true })

    // User line should be gone
    expect(scene().objects[userLineId]).toBeUndefined()
    // Preset should be present
    expect(graphingGraphs().some((g) => g.kind === 'surface')).toBe(true)

    // Undoing must restore the student line
    // Undo the tile additions until reaching the clean snapshot
    while (scene().past.length > 0) {
      scene().undo()
      if (scene().objects[userLineId]) break
    }
    expect(scene().objects[userLineId]).toBeDefined()
  })

  it('switching between presets without student lines does not count as student lines', async () => {
    const saddle = TILES_3D.find((t) => t.id === 'saddle-surface')!
    const helix = TILES_3D.find((t) => t.id === '3d-helix-spring')!

    await playTile(saddle)
    expect(hasStudentLines()).toBe(false)

    await playTile(helix)
    expect(hasStudentLines()).toBe(false)
    expect(graphingGraphs().map((g) => g.kind)).toEqual(['curve3d'])
  })

  it('TryOne3D panel defines the confirmation prompt with exact required options', () => {
    const src = readFileSync(join(RENDERER_SRC, 'panels/TryOne3D.tsx'), 'utf8')
    expect(src).toContain('hasStudentLines')
    expect(src).toContain('Mix with your lines?')
    expect(src).toContain('Add beside your lines')
    expect(src).toContain('Start a clean drawing')
    expect(src).toContain('Cancel')
  })
})

describe('G4: 3-D hover coordinate pill cleanup', () => {
  it('useHoverReadout clears on pointer leave, camera move, window blur, and space change', () => {
    const src = readFileSync(join(RENDERER_SRC, 'render/Graph3DViews.tsx'), 'utf8')

    // Must invalidate on pointer out so demand-driven frame clears
    expect(src).toMatch(/onPointerOut:\s*\(\)\s*=>\s*\{[\s\S]*?at\.current = null[\s\S]*?invalidate\(\)/)

    // Must track camera movement in useFrame and reset at.current
    expect(src).toContain('camera.position.distanceToSquared')
    expect(src).toContain('camera.quaternion')

    // Must listen for window pointerleave / blur / cancel
    expect(src).toContain('pointerleave')
    expect(src).toContain('blur')

    // Must clear immediately on activeSpace or viewMode change
    expect(src).toContain('activeSpace')
    expect(src).toContain('viewMode')

    // Must dispose pool on unmount
    expect(src).toMatch(/return\s*\(\)\s*=>\s*\{[\s\S]*?pool\.dispose\(\)/)
  })
})
