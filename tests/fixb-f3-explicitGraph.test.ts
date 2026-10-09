import { beforeEach, describe, expect, it } from 'vitest'
import { replaceGraphEquation } from '../src/renderer/src/lang/graphEdit'
import { runCommand } from '../src/renderer/src/lang/commands'
import { resetGlobals } from './helpers/globals'
import { scene } from '../src/renderer/src/core/store'

beforeEach(resetGlobals)

describe('F3: editing an explicit graph with an expression', () => {
  it('appends "y = " if the text has no equal sign', async () => {
    // create a graph
    await runCommand('y = x^2')
    const id = scene().order[0]
    expect(scene().objects[id].type).toBe('graph')
    
    // edit it with an expression
    const res = await replaceGraphEquation(id, 'x^2 + 1')
    expect(res.ok).toBe(true)
    
    // verify the graph updated its formula
    const obj = scene().objects[id]
    expect(obj.type).toBe('graph')
    if (obj.type === 'graph') {
      expect(obj.exprs[0]).toBe('x^2 + 1')
    }
  })

  it('a line with its own relation sign keeps its meaning (no "y = " in front)', async () => {
    await runCommand('y = x^2')
    const id = scene().order[0]
    const res = await replaceGraphEquation(id, 'y < x')
    expect(res.ok).toBe(true)
    const obj = scene().objects[id]
    expect(obj.type === 'graph' ? obj.source : '').toBe('y < x')
  })
})
