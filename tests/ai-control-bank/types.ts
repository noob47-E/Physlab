import type { useScene } from '../../src/renderer/src/core/store'
import type { useSandbox } from '../../src/renderer/src/sim/store'
import type { useLab } from '../../src/renderer/src/lab/labStore'
import type { useCalc } from '../../src/renderer/src/calc/calcStore'
import type { useApp, ModeId } from '../../src/renderer/src/app/modes'

export type BankCategory =
  | 'geometry'
  | 'graphing'
  | 'vectors'
  | 'sandbox'
  | 'lab'
  | 'app'
  | 'tricky'

export interface BankCheckState {
  scene: ReturnType<typeof useScene.getState>
  sandbox: ReturnType<typeof useSandbox.getState>
  lab: ReturnType<typeof useLab.getState>
  calc: ReturnType<typeof useCalc.getState>
  app: ReturnType<typeof useApp.getState>
  reply?: string
  toolResults?: any[]
  refused?: boolean
  clarified?: boolean
  falseClaimsCount?: number
}

export type CheckResult = boolean | { pass: boolean; reason?: string }

export interface BankCommand {
  type: 'command' | 'tool' | 'clarify' | 'refuse'
  command?: string
  tool?: string
  args?: Record<string, any>
  note?: string
}

export interface BankItem {
  id: string
  name: string
  mode: ModeId | 'app' | 'tricky'
  category: BankCategory
  prompt: string
  setup?: () => Promise<void> | void
  mockCommands: BankCommand[]
  check: (state: BankCheckState) => Promise<CheckResult> | CheckResult
  isTrickyOrImpossible?: boolean
  expectedRefusalOrClarify?: boolean
}

export interface BankItemResult {
  id: string
  name: string
  category: BankCategory
  mode: string
  passed: boolean
  reason?: string
  falseClaims: number
  cost: number
  durationMs: number
}

export interface BankSummaryReport {
  timestamp: string
  mode: 'mock' | 'live'
  totalItems: number
  passedItems: number
  scorePct: number
  falseClaimsCount: number
  estimatedCost: number
  categoryScores: Record<
    BankCategory,
    { passed: number; total: number; scorePct: number }
  >
  results: BankItemResult[]
}
