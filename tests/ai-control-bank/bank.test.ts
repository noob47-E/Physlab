import { describe, it, expect, beforeEach } from 'vitest'
import { BANK_ITEMS } from './items'
import { runBankItem, runAllBankItems } from './runner'
import { scene } from '../../src/renderer/src/core/store'
import { useCalc } from '../../src/renderer/src/calc/calcStore'
import { useSandbox } from '../../src/renderer/src/sim/store'
import { useLab } from '../../src/renderer/src/lab/labStore'

describe('100-Request AI Control Bank (tests/ai-control-bank)', () => {
  beforeEach(() => {
    scene().newScene()
    useCalc.setState({ input: '', mode: 'COMP', history: [] })
    useSandbox.getState().resetRun()
    useLab.setState({ tables: [], currentId: '' })
  })

  it('contains exactly 100 benchmark requests', () => {
    expect(BANK_ITEMS).toHaveLength(100)
  })

  it('contains the specified counts across all categories', () => {
    const geo = BANK_ITEMS.filter((i) => i.category === 'geometry')
    const graph = BANK_ITEMS.filter((i) => i.category === 'graphing')
    const vec = BANK_ITEMS.filter((i) => i.category === 'vectors')
    const sb = BANK_ITEMS.filter((i) => i.category === 'sandbox')
    const lab = BANK_ITEMS.filter((i) => i.category === 'lab')
    const app = BANK_ITEMS.filter((i) => i.category === 'app')
    const tricky = BANK_ITEMS.filter((i) => i.category === 'tricky')

    expect(geo).toHaveLength(25)
    expect(graph).toHaveLength(20)
    expect(vec).toHaveLength(10)
    expect(sb).toHaveLength(25)
    expect(lab).toHaveLength(5)
    expect(app).toHaveLength(5)
    expect(tricky).toHaveLength(10)
  })

  describe('Category 1: Geometry (25 requests)', () => {
    const items = BANK_ITEMS.filter((i) => i.category === 'geometry')
    for (const item of items) {
      it(`[${item.id}] ${item.name}`, async () => {
        const result = await runBankItem(item, { live: false })
        expect(result.passed, result.reason).toBe(true)
        expect(result.falseClaims).toBe(0)
      })
    }
  })

  describe('Category 2: Graphing (20 requests)', () => {
    const items = BANK_ITEMS.filter((i) => i.category === 'graphing')
    for (const item of items) {
      it(`[${item.id}] ${item.name}`, async () => {
        const result = await runBankItem(item, { live: false })
        expect(result.passed, result.reason).toBe(true)
        expect(result.falseClaims).toBe(0)
      })
    }
  })

  describe('Category 3: Vectors (10 requests)', () => {
    const items = BANK_ITEMS.filter((i) => i.category === 'vectors')
    for (const item of items) {
      it(`[${item.id}] ${item.name}`, async () => {
        const result = await runBankItem(item, { live: false })
        expect(result.passed, result.reason).toBe(true)
        expect(result.falseClaims).toBe(0)
      })
    }
  })

  describe('Category 4: Sandbox (25 requests)', () => {
    const items = BANK_ITEMS.filter((i) => i.category === 'sandbox')
    for (const item of items) {
      it(`[${item.id}] ${item.name}`, async () => {
        const result = await runBankItem(item, { live: false })
        expect(result.passed, result.reason).toBe(true)
        expect(result.falseClaims).toBe(0)
      })
    }
  })

  describe('Category 5: Lab Data (5 requests)', () => {
    const items = BANK_ITEMS.filter((i) => i.category === 'lab')
    for (const item of items) {
      it(`[${item.id}] ${item.name}`, async () => {
        const result = await runBankItem(item, { live: false })
        expect(result.passed, result.reason).toBe(true)
        expect(result.falseClaims).toBe(0)
      })
    }
  })

  describe('Category 6: App Level (5 requests)', () => {
    const items = BANK_ITEMS.filter((i) => i.category === 'app')
    for (const item of items) {
      it(`[${item.id}] ${item.name}`, async () => {
        const result = await runBankItem(item, { live: false })
        expect(result.passed, result.reason).toBe(true)
        expect(result.falseClaims).toBe(0)
      })
    }
  })

  describe('Category 7: Multi-step & Tricky (10 requests)', () => {
    const items = BANK_ITEMS.filter((i) => i.category === 'tricky')
    for (const item of items) {
      it(`[${item.id}] ${item.name}`, async () => {
        const result = await runBankItem(item, { live: false })
        expect(result.passed, result.reason).toBe(true)
        expect(result.falseClaims).toBe(0)
      })
    }
  })

  it('runs complete suite and writes report with 100% score and 0 false claims', async () => {
    const report = await runAllBankItems({ silent: true })
    expect(report.totalItems).toBe(100)
    expect(report.passedItems).toBe(100)
    expect(report.scorePct).toBe(100)
    expect(report.falseClaimsCount).toBe(0)
    expect(report.categoryScores.geometry.passed).toBe(25)
    expect(report.categoryScores.graphing.passed).toBe(20)
    expect(report.categoryScores.vectors.passed).toBe(10)
    expect(report.categoryScores.sandbox.passed).toBe(25)
    expect(report.categoryScores.lab.passed).toBe(5)
    expect(report.categoryScores.app.passed).toBe(5)
    expect(report.categoryScores.tricky.passed).toBe(10)
  })
})
