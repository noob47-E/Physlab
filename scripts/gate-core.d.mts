// Type declarations for gate-core.mjs (kept as plain JS since it is a dev-only Node script, not
// renderer code). Co-located so TypeScript resolves it for every importer without a tsconfig
// change — see AGENTS.md "how to check your work": tests must typecheck clean like everything
// else.

export declare const LEVEL_ORDER: readonly string[]
export declare const LEVEL_ALIASES: Readonly<Record<string, string>>

export declare function resolveLevel(input?: string | null): string | null

export interface StepDef {
  id: string
  level: string
  label: string
  area: string
  kind?: 'pending'
  note?: string
}

export declare const STEP_DEFS: readonly StepDef[]

export declare function stepsForLevel(level: string): StepDef[]

export type StepStatus = 'pass' | 'fail' | 'pending' | 'flaky'

export interface StepResult {
  id: string
  label: string
  status: StepStatus
  durationMs?: number
  summary?: string
  detail?: string
  /** Set on a `flaky` step: the known flaky files that failed under load and passed alone. */
  flakyFiles?: readonly string[]
}

export interface GateSummary {
  ok: boolean
  counts: { pass: number; fail: number; pending: number; flaky: number }
}

export declare const KNOWN_FLAKY_FILES: readonly string[]

export declare function parseFailingFiles(output: string | null | undefined): string[]

export declare function flakyRetryFiles(
  failingFiles: readonly string[] | null | undefined,
  known?: readonly string[]
): string[] | null

export declare function hasUnhandledErrors(output: string | null | undefined): boolean

export declare function flakyRetryPlan(
  output: string | null | undefined,
  known?: readonly string[]
): string[] | null

// summarize only ever reads `.status`, so it accepts anything shaped that way — a full
// StepResult, or (as tests/gate.test.ts does) a minimal fixture.
export declare function summarize(results: readonly Pick<StepResult, 'status'>[]): GateSummary

export interface ReportInput {
  level: string
  branch: string
  head: string
  generatedAt: string
  results: readonly StepResult[]
}

export interface ReportJson {
  version: number
  generatedAt: string
  branch: string
  head: string
  level: string
  ok: boolean
  counts: GateSummary['counts']
  steps: readonly StepResult[]
}

export interface ReportOutput {
  text: string
  json: ReportJson
}

export declare function formatReport(input: ReportInput): ReportOutput

export declare function isSkippableCommitMessage(message: string): boolean

export declare function hookLevel(branch: string | null | undefined): 'quick' | 'thorough'

export declare function hookEnv(
  env: Record<string, string | undefined> | undefined
): Record<string, string | undefined>

export declare function stripAnsi(text: string | null | undefined): string

export interface VitestSummary {
  failed: number
  passed: number
  expectedFail: number
  skipped: number
  todo: number
  total: number
}

export declare function parseVitestSummary(output: string | null | undefined): VitestSummary | null

export declare function formatTestsSummary(parsed: VitestSummary | null, ok: boolean): string

export declare function shouldSkipGate(env: Record<string, string | undefined> | undefined): boolean
