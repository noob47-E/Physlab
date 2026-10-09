import { beforeEach, describe, expect, it } from 'vitest'
import { runCommand } from '../src/renderer/src/lang/commands'
import { resetGlobals } from './helpers/globals'
import { scene } from '../src/renderer/src/core/store'

beforeEach(resetGlobals)

describe('F4: typing "sin at 30"', () => {
  it('throws "The size before ∠ must be a number..." rather than "does not exist yet"', async () => {
    await runCommand('sin at 30')
    const lastLog = scene().log.at(-1)
    expect(lastLog?.kind).toBe('error')
    expect(lastLog?.text).toBe('The size before ∠ must be a number, like 10∠30° or 10 N at 30°.')
  })

  it('only there: a function name typed as a value still "does not exist yet", and makes nothing (checker review)', async () => {
    for (const line of ['a = gamma', 'E = gamma * m', 'W = 5 * distance', 'sum']) {
      scene().newScene()
      scene().clearLog()
      await runCommand(line)
      expect(scene().log.at(-1)?.text, line).toMatch(/does not exist yet/)
      expect(Object.keys(scene().objects), line).toEqual([])
    }
  })
})
