import { Fragment, memo, useMemo, useState } from 'react'
import katex from 'katex'
import {
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Undo2
} from 'lucide-react'
import type { MessageVerification, PhysLabAction, SpecialAgent } from '../../ai/types'
import { extractThinkTrace } from '../../ai/bridge'
import { extractLastBoxed, repairControlCharLatex, stripIncompleteActionBlocks } from '../../ai/contract'
import { scene } from '../../core/store'
import { useSandbox } from '../../sim/store'
import { useLab } from '../../lab/labStore'

interface MarkdownViewProps {
  content: string
  studentPrompt?: string
  think?: string
  agentTraces?: { agent: SpecialAgent; summary: string }[]
  actions?: PhysLabAction[]
  verified?: boolean
  verification?: MessageVerification
  onActionExecuted?: (action: PhysLabAction) => void
  onChallengeClick?: (prompt: string) => void
}

export function getToolShortResult(tool: string, args: Record<string, any> = {}, result?: any): string {
  if (tool === 'build_experiment') {
    const objs = Array.isArray(args.objects) ? args.objects : []
    if (objs.length === 1) {
      const obj = objs[0]
      const kind = obj?.kind || 'object'
      const pos = obj?.y !== undefined ? ` at ${obj.y} m` : ''
      return `Built ${kind}${pos}`
    }
    if (objs.length > 1) {
      return `Built ${objs.length} objects`
    }
    return 'Built experiment'
  }
  if (tool === 'play') {
    const s = args.seconds !== undefined ? `${args.seconds} s` : ''
    return s ? `Ran ${s}` : 'Ran simulation'
  }
  if (tool === 'graph_readings') {
    const yName = args.y || 'v'
    const xName = args.x || 't'
    if (result?.slope !== undefined) {
      return `Graph ${yName}–${xName}, slope ${Number(result.slope).toFixed(2)}`
    }
    return `Graph ${yName}–${xName}`
  }
  if (tool === 'solve' || tool === 'calc_solve') {
    const ans = result?.answer ?? result?.boxedAnswer ?? ''
    return ans ? `Solved: ${ans}` : `Solved ${args.expression || args.input || ''}`.trim()
  }
  if (tool === 'plot' || tool === 'graph_plot' || tool === 'graph3d_plot') {
    const expr = args.expression || args.equation || ''
    return expr ? `Plotted ${expr}` : 'Plotted curve'
  }
  if (tool === 'load_experiment' || tool === 'sandbox_experiment') {
    return `Loaded ${args.id || args.presetId || args.experimentType || 'experiment'}`
  }
  if (tool === 'set_param') {
    return args.name ? `Set ${args.name}: ${args.value}` : 'Set parameter'
  }
  if (tool === 'set_speed') {
    return args.factor !== undefined ? `Speed: ${args.factor}x` : 'Set speed'
  }
  if (tool === 'get_readings') {
    const rowsCount = result?.rows?.length
    return rowsCount !== undefined ? `Recorded ${rowsCount} samples` : 'Recorded readings'
  }
  if (tool === 'export_readings') {
    return `Exported ${args.format || 'csv'}`
  }
  if (tool === 'quiz_challenge') {
    return String(args.question || 'Concept challenge')
  }
  if (tool === 'app_guide') {
    return `Guide: ${args.mode || 'features'}`
  }
  if (result && typeof result === 'object' && 'message' in result) {
    return String(result.message)
  }
  return 'Done'
}

export interface AiDidChip {
  id: string
  label: string
  kind: 'add' | 'remove' | 'cmd'
}

export function extractAiDidChips(actions?: PhysLabAction[]): AiDidChip[] {
  if (!actions || !actions.length) return []
  const chips: AiDidChip[] = []

  for (const act of actions) {
    if (act.tool === 'run_commands') {
      const res = act.result as Record<string, any> | undefined
      if (res) {
        if (Array.isArray(res.created)) {
          for (const id of res.created) {
            let name = id
            let type = 'object'
            try {
              const s = scene().objects[id]
              const b = useSandbox.getState().bodies.find((x) => x.id === id)
              if (s) {
                name = s.name
                type = s.type
              } else if (b) {
                name = b.name
                type = b.shape
              }
            } catch {}
            chips.push({ id: `c_${id}`, label: `+ ${type} ${name}`, kind: 'add' })
          }
        }
        if (Array.isArray(res.removed)) {
          for (const id of res.removed) {
            chips.push({ id: `r_${id}`, label: `− ${id}`, kind: 'remove' })
          }
        }
        if ((!res.created || res.created.length === 0) && (!res.removed || res.removed.length === 0)) {
          const cmds = Array.isArray(act.args?.commands) ? act.args.commands : []
          for (let i = 0; i < cmds.length; i++) {
            const cmd = String(cmds[i]).trim()
            if (cmd) {
              chips.push({ id: `${act.id}_cmd_${i}`, label: cmd, kind: 'cmd' })
            }
          }
        }
      }
    } else if (act.tool === 'plot' || act.tool === 'graph_plot' || act.tool === 'graph3d_plot') {
      const expr = act.args?.expression || act.args?.equation || ''
      chips.push({ id: act.id, label: expr ? `plot ${expr}` : 'plot', kind: 'cmd' })
    } else if (act.tool === 'solve' || act.tool === 'calc_solve') {
      const expr = act.args?.expression || act.args?.input || ''
      chips.push({ id: act.id, label: expr ? `solve ${expr}` : 'solve', kind: 'cmd' })
    } else if (act.tool === 'load_experiment') {
      chips.push({ id: act.id, label: `load ${act.args?.id || 'experiment'}`, kind: 'cmd' })
    } else if (act.tool === 'build_experiment') {
      chips.push({ id: act.id, label: 'build experiment', kind: 'cmd' })
    }
  }

  return chips
}

/**
 * Generates follow-up challenge chips based on actions or problem context.
 */
function getChallengeChips(actions?: PhysLabAction[], content?: string): string[] {
  const chips: string[] = []

  const g3dAction = actions?.find((a) => a.tool === 'graph3d_plot')
  if (g3dAction) {
    chips.push('Plot 3D Saddle Surface z = x^2 - y^2')
    chips.push('Show 3D DNA Double Helix')
    return chips
  }

  const sbAction = actions?.find((a) => a.tool === 'sandbox_experiment')
  if (sbAction) {
    const curAngle = Number(sbAction.args.angleDeg ?? sbAction.args.angle ?? 25)
    const nextAngle = curAngle === 35 ? 45 : 35
    chips.push(`What if incline = ${nextAngle}°?`)
    chips.push('What if surface is frictionless (μ = 0)?')
    return chips
  }

  const calcAction = actions?.find((a) => a.tool === 'calc_solve')
  if (calcAction) {
    const input = String(calcAction.args.input || '').toLowerCase()
    const op = String(calcAction.args.op || '')
    const hasVariableX = /\bx\b/.test(input)
    const isPureNumber = !/[a-zA-Z]/.test(input)

    if (isPureNumber) {
      return []
    }

    if (op === 'solve' || input.includes('=')) {
      const rawInput = String(calcAction.args.input || '')
      const lhs = rawInput.split('=')[0].trim()
      chips.push(`Plot y = ${lhs || rawInput}`)
      return chips
    }

    if (input.includes('sqrt') || input.includes('^(1/2)')) {
      chips.push('What if x = 4?')
      chips.push('What are the domain restrictions?')
      return chips
    }

    if (hasVariableX && op !== 'simplify' && op !== 'solve') {
      chips.push('What if x = 0?')
      chips.push("What if we find second derivative f''(x)?")
      return chips
    }

    if (hasVariableX) {
      chips.push('What if x = 0?')
      return chips
    }

    return chips
  }

  const lower = (content || '').toLowerCase()
  if (
    lower.includes('graph3d') ||
    lower.includes('surface') ||
    lower.includes('ripple') ||
    lower.includes('saddle')
  ) {
    chips.push('Plot 3D Saddle Surface z = x^2 - y^2')
    chips.push('Show 3D DNA Double Helix')
    return chips
  }

  if (lower.includes('incline') || lower.includes('friction') || lower.includes('slope')) {
    chips.push('What if incline = 35°?')
    chips.push('What if mass = 5 kg?')
    return chips
  }
  if (lower.includes('sqrt')) {
    chips.push('What if x = 4?')
    chips.push('What are the domain restrictions?')
    return chips
  }
  if (
    lower.includes('factor') ||
    lower.includes('derivative') ||
    lower.includes('integral') ||
    lower.includes('solve')
  ) {
    chips.push('What if x = -2?')
    chips.push('What if we check extraneous roots?')
    return chips
  }

  return chips
}

/**
 * Extracts all known numbers from the student's prompt and tool results.
 */
export function extractKnownNumbers(
  studentPrompt?: string,
  actions?: PhysLabAction[]
): Set<string> {
  const set = new Set<string>()

  const addFromText = (text: string) => {
    if (!text) return
    const matches = text.match(/[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g)
    if (matches) {
      for (const m of matches) {
        set.add(m)
        if (m.startsWith('-') || m.startsWith('+')) {
          set.add(m.slice(1))
        }
        const n = parseFloat(m)
        if (Number.isFinite(n)) {
          set.add(String(n))
          if (Number.isInteger(n)) {
            set.add(String(Math.trunc(n)))
          }
        }
      }
    }
  }

  if (studentPrompt) {
    addFromText(studentPrompt)
  }

  if (actions && Array.isArray(actions)) {
    for (const act of actions) {
      if (act.args) {
        addFromText(JSON.stringify(act.args))
      }
      if (act.result) {
        addFromText(JSON.stringify(act.result))
      }
    }
  }

  return set
}

/**
 * Checks whether a line represents an AI answer or result line.
 */
export function isKnownNumber(matchStr: string, knownNumbers: Set<string>): boolean {
  const absStr = matchStr.startsWith('-') || matchStr.startsWith('+') ? matchStr.slice(1) : matchStr
  if (knownNumbers.has(matchStr) || knownNumbers.has(absStr)) return true
  const n = parseFloat(matchStr)
  if (Number.isFinite(n)) {
    const s = String(n)
    if (knownNumbers.has(s)) return true
    if (Number.isInteger(n) && knownNumbers.has(String(Math.trunc(n)))) return true
  }
  return false
}

/**
 * Checks whether a line represents an AI answer or result line.
 */
export function isAnswerOrResultLine(line: string): boolean {
  if (!line) return false
  if (line.includes('\\boxed{')) return true
  const clean = line.replace(/[*_#>`~]/g, '').trim()

  if (
    /^(?:(?:final\s+)?answer|result|conclusion|solution)\s*[:=]/i.test(clean) ||
    /^(?:therefore|thus|hence|so)\b/i.test(clean) ||
    /^(?:the\s+(?:final\s+)?answer\s+is|the\s+result\s+is)\b/i.test(clean) ||
    /^[a-zA-Z_](?:_[a-zA-Z0-9]+)?\s*=\s*[-+]?\d+/i.test(clean)
  ) {
    return true
  }
  return false
}

/**
 * Checks whether a number is a step indicator, list index, or formula exponent/structural number.
 */
export function isStepOrStructuralNumber(
  line: string,
  startIdx: number,
  matchStr: string
): boolean {
  const prefix = line.slice(0, startIdx)
  const suffix = line.slice(startIdx + matchStr.length)

  // Step 1, Part 2, Question 3, Case 1, Rule 4, Eq. 1, Item 1, etc.
  if (/(?:step|part|question|stage|case|no\.?|rule|eq(?:uation)?\.?|item|option|fig(?:ure)?\.?)\s*$/i.test(prefix)) {
    return true
  }

  // Numbered list item: e.g. "1. " or "1) " at the start of a line
  if (/^\s*(?:[*#>-]*\s*)?$/i.test(prefix) && /^[.)]\s+/.test(suffix)) {
    return true
  }

  // Parenthesized index: e.g. "(1)"
  if (/\(\s*$/.test(prefix) && /^\s*\)/.test(suffix)) {
    return true
  }

  // Subscript: e.g. "x_1", "v_0", "v_{0}"
  if (/_[a-zA-Z]*$/.test(prefix) || /_\{[a-zA-Z]*$/.test(prefix)) {
    return true
  }

  // Exponent: e.g. "^2" or "^{2}"
  if (/\^\s*\{?$/.test(prefix)) {
    return true
  }

  // Radical nth-root: e.g. \sqrt[3]{...}
  if (/\\sqrt\[\s*$/.test(prefix) && /^\s*\]/.test(suffix)) {
    return true
  }

  return false
}

export const MarkdownView = memo(function MarkdownView({
  content,
  studentPrompt,
  actions,
  verified: _verified,
  verification,
  onChallengeClick
}: MarkdownViewProps) {
  // Extract inline think trace if not already parsed
  const fixedContent = repairControlCharLatex(content)
  const { cleanContent } = extractThinkTrace(fixedContent)

  const cleanProse = stripIncompleteActionBlocks(cleanContent)
  const boxedAnswer = extractLastBoxed(fixedContent)

  // Known numbers from student prompt and engine tool results
  const knownNumbers = useMemo(() => {
    return extractKnownNumbers(studentPrompt, actions)
  }, [studentPrompt, actions])

  // Verification state logic: strictly ONE badge per answer
  const verState = verification?.state
  const isDisagreed = verState === 'disagrees'
  const isVerified = verification?.badgeText === 'Checked by PhysLab'

  const isBoxedInvented = useMemo(() => {
    if (!boxedAnswer || isVerified) return false
    const numRegex = /[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g
    let m: RegExpExecArray | null
    while ((m = numRegex.exec(boxedAnswer)) !== null) {
      const matchStr = m[0]
      const matchIdx = m.index
      const isKnown = isKnownNumber(matchStr, knownNumbers)
      const isStructural = isStepOrStructuralNumber(boxedAnswer, matchIdx, matchStr)
      if (!isKnown && !isStructural) {
        return true
      }
    }
    return false
  }, [boxedAnswer, isVerified, knownNumbers])

  const [undone, setUndone] = useState(false)
  const aiDidChips = useMemo(() => extractAiDidChips(actions), [actions])

  const handleUndo = () => {
    try {
      scene().undo()
    } catch {}
    try {
      useSandbox.getState().undo()
    } catch {}
    try {
      useLab.getState().undo()
    } catch {}
    setUndone(true)
  }

  const challengeChips = getChallengeChips(actions, cleanProse)

  return (
    <div className="flex flex-col gap-2.5 text-body text-ink leading-relaxed">
      {/* 1. Answer-First Banner (Prominent Final Answer Box with Rule 3 Guarantee) */}
      {boxedAnswer && (
        <div
          className={`rounded-lg border p-3 flex flex-col gap-2 ${
            isDisagreed
              ? 'border-bad/40 bg-surface-2'
              : 'border-line bg-surface-2'
          }`}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span
              className={`font-semibold text-small flex items-center gap-1.5 ${
                isDisagreed ? 'text-bad' : 'text-ink-strong'
              }`}
            >
              {isDisagreed ? (
                <AlertTriangle size={14} className="text-bad" />
              ) : (
                <Sparkles size={14} className="text-accent" />
              )}
              <span>{isDisagreed ? 'PhysLab Verified Answer' : 'Final Answer'}</span>
            </span>

            {/* Strict rule: Exactly ONE badge per answer */}
            {isVerified ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-1 text-fine font-semibold text-good border border-line">
                <CheckCircle2 size={12} />
                <span>Checked by PhysLab</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-1 text-fine font-medium text-ink-dim border border-line">
                <span>Not checked</span>
              </span>
            )}
          </div>

          {/* If engine disagrees: prominently show verified engine answer above model's claimed answer */}
          {isDisagreed && verification?.engineAnswerLatex && (
            <div className="text-center py-1 overflow-x-auto">
              <DisplayMath tex={`\\boxed{${verification.engineAnswerLatex}}`} />
            </div>
          )}

          {/* Model Answer (or single verified answer if not disagreed) */}
          {!isDisagreed ? (
            <div className="text-center py-1 overflow-x-auto">
              <DisplayMath tex={`\\boxed{${boxedAnswer}}`} isInvented={isBoxedInvented} />
            </div>
          ) : (
            <div className="border-t border-line pt-1.5 flex items-center justify-between text-fine text-ink-dim">
              <span>Model Claimed:</span>
              <span className="line-through font-mono">
                {verification?.modelAnswerLatex || boxedAnswer}
              </span>
            </div>
          )}

          {isDisagreed && verification?.notes && (
            <div className="text-fine font-mono text-bad bg-surface-1 p-1.5 rounded border border-line">
              {verification.notes}
            </div>
          )}
        </div>
      )}

      {/* 2. Step-by-Step Mathematical Solution Directly Visible */}
      <div className="markdown-prose flex flex-col gap-2" dir="auto">
        {renderMarkdownWithMath(cleanProse, knownNumbers)}
      </div>

      {/* 4. Calm "AI did:" line with small rounded chips and one Undo button */}
      {aiDidChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-1.5 border-t border-line/40 text-fine">
          <span className="text-ink-faint font-medium select-none">AI did:</span>
          {aiDidChips.map((chip) => (
            <span
              key={chip.id}
              className={`px-2 py-0.5 rounded-full border text-fine font-mono select-none ${
                undone
                  ? 'bg-surface-1 border-line/40 text-ink-faint line-through'
                  : 'bg-surface-2 border-line text-ink-dim'
              }`}
            >
              {chip.label}
            </span>
          ))}
          <button
            type="button"
            disabled={undone}
            onClick={handleUndo}
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-fine transition-colors cursor-pointer ${
              undone
                ? 'bg-surface-1 border-line/40 text-ink-faint cursor-not-allowed'
                : 'bg-surface-2 hover:bg-surface-3 border-line text-ink hover:text-accent'
            }`}
            title={undone ? 'Undone' : 'Undo this AI turn'}
          >
            <Undo2 size={11} className={undone ? 'text-ink-faint' : 'text-accent'} />
            <span>{undone ? 'Undone' : 'Undo'}</span>
          </button>
        </div>
      )}

      {/* 5. What-If Interactive Challenge Chips */}
      {challengeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-fine font-medium text-ink-dim flex items-center gap-1 mr-1">
            <Sparkles size={12} className="text-accent" />
            <span>What If?</span>
          </span>
          {challengeChips.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => onChallengeClick?.(chip)}
              className="px-2.5 py-1 rounded-full bg-surface-2 hover:bg-surface-3 border border-line text-fine text-ink hover:text-accent transition-colors cursor-pointer"
            >
              {chip}
            </button>
          ))}
        </div>
      )}
    </div>
  )
})

/**
 * Parses markdown blocks and formats KaTeX math expressions safely.
 */
export function renderMarkdownWithMath(text: string, knownNumbers?: Set<string>): React.ReactNode[] {
  if (!text) return []

  const cleanText = text
    .replace(/^#{1,4}\s*(?:💡\s*)?Intuition\s*Hook[^\n]*\n?/gim, '')
    .replace(/^\*\*💡?\s*Intuition\s*Hook[^*]*\*\*\s*:?\s*/gim, '')

  const lines = cleanText.split('\n')
  const nodes: React.ReactNode[] = []
  let buffer: string[] = []
  let inDisplayMath = false
  let mathBuffer = ''

  const flushBuffer = () => {
    if (buffer.length > 0) {
      const paragraphLines = [...buffer]
      buffer = []
      const nonEmpty = paragraphLines.filter((l) => l.trim().length > 0)
      if (nonEmpty.length > 0) {
        nodes.push(
          <div key={`p_${nodes.length}`} className="my-1" dir="auto">
            {paragraphLines.map((pLine, lIdx) => {
              const isAns = isAnswerOrResultLine(pLine)
              return (
                <Fragment key={`pl_${lIdx}`}>
                  {lIdx > 0 && <br />}
                  {renderInlineMath(pLine, isAns, knownNumbers)}
                </Fragment>
              )
            })}
          </div>
        )
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (
      /^#{1,4}\s*(?:💡\s*)?Intuition\s*Hook/i.test(line.trim()) ||
      /^\*\*💡?\s*Intuition\s*Hook/i.test(line.trim())
    ) {
      continue
    }

    if (line.trim() === '') {
      flushBuffer()
      continue
    }

    if (line.trim().startsWith('$$') && line.trim().endsWith('$$') && line.trim().length > 4) {
      flushBuffer()
      const formula = line.trim().slice(2, -2)
      let isInv = false
      if (knownNumbers && isAnswerOrResultLine(formula)) {
        const numRegex = /[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g
        let m: RegExpExecArray | null
        while ((m = numRegex.exec(formula)) !== null) {
          const matchStr = m[0]
          const matchIdx = m.index
          if (!isKnownNumber(matchStr, knownNumbers) && !isStepOrStructuralNumber(formula, matchIdx, matchStr)) {
            isInv = true
            break
          }
        }
      }
      nodes.push(<DisplayMath key={`math_${nodes.length}`} tex={formula} isInvented={isInv} />)
      continue
    }

    if (line.trim().startsWith('$$')) {
      if (inDisplayMath) {
        let isInv = false
        if (knownNumbers && isAnswerOrResultLine(mathBuffer)) {
          const numRegex = /[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g
          let m: RegExpExecArray | null
          while ((m = numRegex.exec(mathBuffer)) !== null) {
            const matchStr = m[0]
            const matchIdx = m.index
            if (!isKnownNumber(matchStr, knownNumbers) && !isStepOrStructuralNumber(mathBuffer, matchIdx, matchStr)) {
              isInv = true
              break
            }
          }
        }
        nodes.push(<DisplayMath key={`math_${nodes.length}`} tex={mathBuffer} isInvented={isInv} />)
        mathBuffer = ''
        inDisplayMath = false
      } else {
        flushBuffer()
        inDisplayMath = true
        mathBuffer = line.replace('$$', '')
      }
      continue
    }

    if (inDisplayMath) {
      mathBuffer += `\n${line}`
      continue
    }

    if (line.startsWith('### ')) {
      flushBuffer()
      const isAns = isAnswerOrResultLine(line.slice(4))
      nodes.push(
        <h3
          key={`h3_${nodes.length}`}
          className="font-semibold text-lead text-ink-strong mt-2 mb-1"
          dir="auto"
        >
          {renderInlineMath(line.slice(4), isAns, knownNumbers)}
        </h3>
      )
      continue
    }
    if (line.startsWith('## ')) {
      flushBuffer()
      const isAns = isAnswerOrResultLine(line.slice(3))
      nodes.push(
        <h2
          key={`h2_${nodes.length}`}
          className="font-semibold text-title text-ink-strong mt-3 mb-1"
          dir="auto"
        >
          {renderInlineMath(line.slice(3), isAns, knownNumbers)}
        </h2>
      )
      continue
    }

    if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
      flushBuffer()
      const isAns = isAnswerOrResultLine(line.trim().slice(2))
      nodes.push(
        <div key={`li_${nodes.length}`} className="flex items-start gap-2 ml-2 my-0.5" dir="auto">
          <span className="text-accent leading-none mt-1.5">•</span>
          <div className="flex-1" dir="auto">{renderInlineMath(line.trim().slice(2), isAns, knownNumbers)}</div>
        </div>
      )
      continue
    }

    buffer.push(line)
  }

  flushBuffer()
  return nodes
}

/**
 * Highlights invented numbers in prose on answer/result lines.
 */
function renderProseWithInventedGuard(
  text: string,
  keyPrefix: string,
  isAnswerLine?: boolean,
  knownNumbers?: Set<string>
): React.ReactNode {
  if (!isAnswerLine || !knownNumbers) {
    return text
  }

  const numRegex = /[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g
  const result: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = numRegex.exec(text)) !== null) {
    const matchStr = match[0]
    const matchIdx = match.index
    if (matchIdx > lastIndex) {
      result.push(text.slice(lastIndex, matchIdx))
    }

    const isKnown = isKnownNumber(matchStr, knownNumbers)
    const isStructural = isStepOrStructuralNumber(text, matchIdx, matchStr)

    if (!isKnown && !isStructural) {
      result.push(
        <span
          key={`${keyPrefix}_inv_${matchIdx}`}
          className="text-ink-faint inline-flex items-center gap-1 font-mono"
          title="not checked"
        >
          <span className="opacity-70">{matchStr}</span>
          <span className="text-fine text-ink-dim px-1 rounded bg-surface-2 border border-line font-sans font-normal">
            not checked
          </span>
        </span>
      )
    } else {
      result.push(matchStr)
    }

    lastIndex = matchIdx + matchStr.length
  }

  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex))
  }

  return result.length > 0 ? result : text
}

/**
 * Safely renders inline KaTeX math ($...$) and bold/code formatting.
 */
function renderInlineMath(
  text: string,
  isAnswerLine?: boolean,
  knownNumbers?: Set<string>
): React.ReactNode {
  // Pre-sanitize unescaped control chars and strip stray '$' characters surrounding \boxed formulas
  const preCleaned = repairControlCharLatex(text)
    .replace(/\$\s*(\\boxed\{[^}]+\})\s*\$/g, '$1')

  const parts = preCleaned.split(
    /(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$|\\boxed\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})/g
  )

  return parts.map((part, idx) => {
    if (!part) return null

    const isDelimitedMath =
      (part.startsWith('$$') && part.endsWith('$$') && part.length >= 4) ||
      (part.startsWith('$') && part.endsWith('$') && part.length >= 2)
    const isDirectBoxed = part.startsWith('\\boxed{')

    if (isDelimitedMath || isDirectBoxed) {
      const tex = repairControlCharLatex(part.replace(/^\$+|\$+$/g, '').trim())

      let hasInvented = false
      if (isAnswerLine && knownNumbers) {
        const numRegex = /[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g
        let m: RegExpExecArray | null
        while ((m = numRegex.exec(tex)) !== null) {
          const matchStr = m[0]
          const matchIdx = m.index
          const isKnown = isKnownNumber(matchStr, knownNumbers)
          const isStructural = isStepOrStructuralNumber(tex, matchIdx, matchStr)
          if (!isKnown && !isStructural) {
            hasInvented = true
            break
          }
        }
      }

      try {
        const html = katex.renderToString(tex, {
          displayMode: false,
          throwOnError: false,
          output: 'html'
        })
        const node = (
          <span
            key={idx}
            dir="ltr"
            className="inline-block mx-0.5 align-middle"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )
        if (hasInvented) {
          return (
            <span
              key={idx}
              className="text-ink-faint opacity-70 inline-flex items-center gap-1 font-mono"
              title="not checked"
            >
              {node}
              <span className="text-fine text-ink-dim px-1 rounded bg-surface-2 border border-line font-sans font-normal">
                not checked
              </span>
            </span>
          )
        }
        return node
      } catch {
        return (
          <code key={idx} className="font-mono text-fine text-code">
            {part}
          </code>
        )
      }
    }

    if (part.includes('**')) {
      const boldParts = part.split(/\*\*([^*]+)\*\*/g)
      return boldParts.map((bp, bidx) =>
        bidx % 2 === 1 ? (
          <strong key={`${idx}_${bidx}`} className="font-semibold text-ink-strong">
            {renderProseWithInventedGuard(bp, `${idx}_${bidx}`, isAnswerLine, knownNumbers)}
          </strong>
        ) : (
          renderProseWithInventedGuard(bp, `${idx}_${bidx}`, isAnswerLine, knownNumbers)
        )
      )
    }

    return renderProseWithInventedGuard(part, `${idx}`, isAnswerLine, knownNumbers)
  })
}

function DisplayMath({ tex, isInvented }: { tex: string; isInvented?: boolean }) {
  const cleanTex = repairControlCharLatex(tex)
  const isLong = cleanTex.length > 28
  let html = ''
  let error = false
  try {
    html = katex.renderToString(cleanTex, {
      displayMode: true,
      throwOnError: false,
      output: 'html'
    })
  } catch {
    error = true
  }

  if (error) {
    return <div className="font-mono text-fine text-warn my-2">{cleanTex}</div>
  }

  const content = (
    <div
      dir="ltr"
      className={`my-1.5 p-2 rounded bg-surface-1 overflow-x-hidden text-center ${
        isLong ? 'text-fine' : 'text-small'
      }`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )

  if (isInvented) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="opacity-70 text-ink-faint w-full">{content}</div>
        <span className="text-fine text-ink-dim px-1.5 py-0.5 rounded bg-surface-2 border border-line">
          not checked
        </span>
      </div>
    )
  }

  return content
}
