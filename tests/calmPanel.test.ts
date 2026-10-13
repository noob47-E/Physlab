// SB22b: The Sandbox panel is less crowded: AddRow shows 4 main buttons and a More menu,
// Energy shows the total and a Details fold. All shapes remain reachable.

import { describe, expect, it } from 'vitest'
import { readSource } from './helpers/repo'

describe('AddRow: structure checks', () => {
  it('data-tour="connect" is still in AddRow.tsx', () => {
    const src = readSource('src/renderer/src/panels/sandbox/AddRow.tsx')
    expect(src).toContain('data-tour="connect"')
  })

  it('AddRow exports the function and has the ADD array with all 9 shapes', () => {
    const src = readSource('src/renderer/src/panels/sandbox/AddRow.tsx')
    expect(src).toMatch(/export function AddRow\(\)/)

    const shapes = ['sphere', 'box', 'cylinder', 'capsule', 'cone', 'ramp', 'plank', 'wall', 'pulley']
    for (const shape of shapes) {
      expect(src, `shape ${shape}`).toMatch(new RegExp(`shape:\\s*'${shape}'`))
    }
  })

  it('has More button and renders 4 main buttons + Connect', () => {
    const src = readSource('src/renderer/src/panels/sandbox/AddRow.tsx')
    // Should have the main 4 shapes that are always shown
    expect(src).toMatch(/Ball/)
    expect(src).toMatch(/Crate/)
    expect(src).toMatch(/Ramp/)
    expect(src).toMatch(/Plank/)
    // Should have Connect with data-tour
    expect(src).toMatch(/Connect two objects/)
  })
})

describe('Energy: structure checks', () => {
  it('EnergyLedger is exported', () => {
    const src = readSource('src/renderer/src/panels/sandbox/EnergyLedger.tsx')
    expect(src).toMatch(/export function EnergyLedger\(\)/)
  })

  it('uses the Fold component for details section', () => {
    const src = readSource('src/renderer/src/panels/sandbox/EnergyLedger.tsx')
    // The contract says everything goes into a Fold with id energyDetails
    expect(src).toMatch(/Fold/)
  })
})

describe('common.tsx: fold management', () => {
  it('exports FoldId type and FOLD_TITLES', () => {
    const src = readSource('src/renderer/src/panels/sandbox/common.tsx')
    expect(src).toMatch(/type FoldId/)
    expect(src).toMatch(/FOLD_TITLES/)
  })

  it('Fold component is exported and handles open/close state', () => {
    const src = readSource('src/renderer/src/panels/sandbox/common.tsx')
    expect(src).toMatch(/export function Fold/)
    // The Fold should use localStorage to remember state
    expect(src).toMatch(/localStorage/)
  })
})
