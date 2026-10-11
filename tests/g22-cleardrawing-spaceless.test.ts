// T7 proof for audit bug 22 [C7]: "clearDrawing silently deletes global variables
// (core/store.ts:674-681)".
//
// Verdict REAL. `visibleIn` (core/visibility.ts:42) shows an object with no space in EVERY drawing,
// because that is what an object made where no drawing is active gets (the Sandbox and the GPU Lab
// have no space of their own). `clearDrawing` removes `visibleOrder(order, objects, activeSpace)`,
// so those spaceless objects are in the list and go with the drawing. Measured: a spaceless number
// added beside a 'shapes' point is gone after Clear drawing.
import { beforeEach, describe, expect, it } from 'vitest'
import { useScene } from '../src/renderer/src/core/store'

const s = () => useScene.getState()
const base = (id: string, name: string) => ({ id, name, visible: true, locked: false, color: '#000', showLabel: true })
/** A variable defined where no drawing was active: no `space`, so it shows everywhere. */
const global = { ...base('nG', 'g'), type: 'number', expr: '9.81' }
/** A point of the Geometry drawing itself. */
const point = { ...base('pA', 'A'), type: 'point', def: { kind: 'free', p: [1, 1, 0] }, space: 'shapes' }

beforeEach(() => s().newScene())

describe('G22: Clear drawing takes a spaceless global variable with it', () => {
  it('the variable survives Clear drawing in another drawing', () => {
    s().addObjects([global as never, point as never])
    s().setActiveSpace('shapes')
    s().clearDrawing()
    expect(s().objects['nG']).toBeTruthy()
  })

  it('the drawing itself is still cleared', () => {
    s().addObjects([global as never, point as never])
    s().setActiveSpace('shapes')
    s().clearDrawing()
    expect(s().objects['pA']).toBeUndefined()
  })

  it('with no drawing active nothing is cleared (the guard that already exists)', () => {
    s().addObjects([global as never])
    s().setActiveSpace(null)
    s().clearDrawing()
    expect(s().objects['nG']).toBeTruthy()
  })
})
