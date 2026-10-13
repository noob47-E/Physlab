// SB8: SandboxView's drawing is split into one file per job under render/sandbox/, each reading the one readout (I-6).
// A move: nothing a student sees changes. These read the sources as text (as tests/sandboxShell.test.ts does).

import { describe, expect, it } from 'vitest'
import { readSource } from './helpers/repo'

const VIEWS = ['Stage', 'Bodies', 'Links', 'Trails', 'Arrows', 'Labels', 'JoinPreview']
const view = readSource('src/renderer/src/render/SandboxView.tsx')

describe('SandboxView mounts one sub-view per job', () => {
  it.each(VIEWS)('mounts <%s', (name) => {
    expect(view).toMatch(new RegExp(`<${name}[\\s/>]`))
    expect(view).toMatch(new RegExp(`from '\\./sandbox/${name}'`))
  })
  it('keeps grab-and-throw, the engine, the frame loop, applyTransforms and the PHYSLAB_CHECK lines', () => {
    expect(view).toMatch(/function useGrabAndThrow\(/)
    expect(view).toMatch(/SimWorld\.create\(/)
    expect(view).toMatch(/function applyTransforms\(/)
    expect(view).toMatch(/PHYSLAB_CHECK sandbox/)
    // The world steps first: SB3's priority.
    expect(view).toMatch(/\}, -1\)/)
  })
  it('puts the live world in the readout when the engine is ready', () => {
    expect(view).toMatch(/readoutRef\.current = /)
  })
  it('draws nothing itself any more', () => {
    for (const gone of ['function FloorGrid', 'function Traces', 'function VelocityArrows', 'function PushArrows', 'function LinkLines', 'function JoinPreview', 'meshPhongMaterial', 'pool.place(']) expect(view, gone).not.toContain(gone)
  })
})

describe.each(VIEWS)('render/sandbox/%s.tsx', (name) => {
  const src = readSource(`src/renderer/src/render/sandbox/${name}.tsx`)
  it('is exported there', () => {
    expect(src).toMatch(new RegExp(`export function ${name}\\(`))
  })
  it('never imports SimWorld: the engine stays in SandboxView', () => {
    expect(src).not.toMatch(/\bSimWorld\b/)
    expect(src).not.toMatch(/sim\/world'/)
  })
})

describe('the sub-views that read the run read readoutRef', () => {
  it.each(['Links', 'Trails', 'Arrows', 'Labels', 'JoinPreview'])('%s', (name) => {
    const src = readSource(`src/renderer/src/render/sandbox/${name}.tsx`)
    expect(src).toMatch(/import \{[^}]*\breadoutRef\b[^}]*\} from '\.\/readout'/)
    expect(src).toMatch(/readoutRef\.current/)
  })
})

describe('readout.ts is exactly I-6', () => {
  const src = readSource('src/renderer/src/render/sandbox/readout.ts')
  it('exports SimReadout and readoutRef, and nothing else', () => {
    expect(src.match(/^export /gm)?.length).toBe(2)
    expect(src).toMatch(/export interface SimReadout \{/)
    expect(src).toMatch(/export const readoutRef: \{ current: SimReadout \| null \} = \{ current: null \}/)
  })
  it('has the six members', () => {
    for (const m of [/readonly time: number/, /readonly bodyOrder: BodyId\[\]/, /readonly transforms: Float32Array/, /state\(id: BodyId\): BodyState \| null/, /drawn\(id: BodyId\): BodyState \| null/, /linkPath\(link: Link\): V3\[\]/]) expect(src).toMatch(m)
  })
})
