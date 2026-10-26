import { memo, useState } from 'react'
import katex from 'katex'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Compass,
  HelpCircle,
  Sparkles,
  X
} from 'lucide-react'
import type { MessageVerification, PhysLabAction, SpecialAgent } from '../../ai/types'
import { extractThinkTrace } from '../../ai/bridge'
import { extractLastBoxed, repairControlCharLatex, stripIncompleteActionBlocks } from '../../ai/contract'
import { enterMode } from '../../app/layout'

interface MarkdownViewProps {
  content: string
  think?: string
  agentTraces?: { agent: SpecialAgent; summary: string }[]
  actions?: PhysLabAction[]
  verified?: boolean
  verification?: MessageVerification
  onActionExecuted?: (action: PhysLabAction) => void
  onChallengeClick?: (prompt: string) => void
}

function getToolShortResult(tool: string, args: Record<string, any> = {}, result?: any): string {
  if (tool === 'build_experiment') {
    const objs = Array.isArray(args.objects) ? args.objects : []
    const count = objs.length || 1
    const y = objs[0]?.y ?? 5
    return `Built ${count} ball${count > 1 ? 's' : ''} at ${y} m`
  }
  if (tool === 'play') {
    const s = args.seconds ?? 2
    return `Ran ${s} s`
  }
  if (tool === 'graph_readings') {
    const slope = result?.slope !== undefined ? Number(result.slope).toFixed(2) : '-9.81'
    return `Graph v–t, slope ${slope}`
  }
  if (tool === 'solve' || tool === 'calc_solve') {
    const ans = result?.answer ?? result?.boxedAnswer ?? ''
    return ans ? `Solved: ${ans}` : `Solved ${args.expression || args.input || ''}`
  }
  if (tool === 'plot' || tool === 'graph_plot' || tool === 'graph3d_plot') {
    return `Plotted ${args.expression || args.equation || ''}`
  }
  if (tool === 'load_experiment' || tool === 'sandbox_experiment') {
    return `Loaded ${args.id || args.presetId || args.experimentType || 'experiment'}`
  }
  if (tool === 'set_param') {
    return `Set ${args.name}: ${args.value}`
  }
  if (tool === 'set_speed') {
    return `Speed: ${args.factor}x`
  }
  if (tool === 'get_readings') {
    const rowsCount = result?.rows?.length ?? 0
    return `Recorded ${rowsCount} samples`
  }
  if (tool === 'export_readings') {
    return `Exported ${args.format || 'csv'}`
  }
  if (result && typeof result === 'object' && 'message' in result) {
    return String(result.message)
  }
  return 'Done'
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

export const MarkdownView = memo(function MarkdownView({
  content,
  actions,
  verified,
  verification,
  onChallengeClick
}: MarkdownViewProps) {
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({})

  // Extract inline think trace if not already parsed
  const fixedContent = repairControlCharLatex(content)
  const { cleanContent } = extractThinkTrace(fixedContent)

  const cleanProse = stripIncompleteActionBlocks(cleanContent)
  const boxedAnswer = extractLastBoxed(fixedContent)

  // Verification state logic: strictly ONE badge per answer
  const verState = verification?.state
  const isDisagreed = verState === 'disagrees'
  const isVerified = verification?.badgeText === 'Checked by PhysLab' || (verState === 'verified' && verified === true)

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
              <DisplayMath tex={`\\boxed{${boxedAnswer}}`} />
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
      <div className="markdown-prose flex flex-col gap-2">
        {renderMarkdownWithMath(cleanProse)}
      </div>

      {/* 4. Interactive PhysLab Action Cards */}
      {actions && actions.length > 0 && (
        <div className="flex flex-col gap-2 mt-1">
          {actions.map((act) => {
            const isSuccess = act.status === 'success'

            // Custom Card for Quiz Challenge
            if (act.tool === 'quiz_challenge') {
              const question = String(act.args.question || 'Quick Concept Check')
              const choices = Array.isArray(act.args.choices)
                ? (act.args.choices as string[])
                : []
              const ansIdx = Number(act.args.answerIndex ?? 0)
              const selectedIdx = quizAnswers[act.id]
              const explanation = String(act.args.explanation || '')

              return (
                <div
                  key={act.id}
                  className="rounded border border-line bg-surface-1 p-3 flex flex-col gap-2.5"
                >
                  <div className="flex items-center gap-1.5 font-medium text-small text-ink-strong">
                    <HelpCircle size={15} className="text-accent" />
                    <span>Concept Challenge</span>
                  </div>
                  <div className="text-body font-medium text-ink">{question}</div>
                  <div className="flex flex-col gap-1.5">
                    {choices.map((choice, cIdx) => {
                      const isSelected = selectedIdx === cIdx
                      const isAnswer = ansIdx === cIdx
                      const showResult = selectedIdx !== undefined

                      let btnStyle = 'bg-surface-0 border-line hover:bg-surface-2 text-ink'
                      if (showResult) {
                        if (isAnswer) {
                          btnStyle = 'bg-surface-2 border-line text-good font-semibold'
                        } else if (isSelected) {
                          btnStyle = 'bg-surface-2 border-line text-bad'
                        }
                      }

                      return (
                        <button
                          key={cIdx}
                          type="button"
                          onClick={() =>
                            setQuizAnswers((prev) => ({ ...prev, [act.id]: cIdx }))
                          }
                          className={`text-left px-3 py-1.5 rounded border text-fine transition-colors cursor-pointer flex items-center justify-between ${btnStyle}`}
                        >
                          <span>{choice}</span>
                          {showResult && isAnswer && <Check size={14} className="text-good" />}
                          {showResult && isSelected && !isAnswer && (
                            <X size={14} className="text-bad" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                  {selectedIdx !== undefined && explanation && (
                    <div className="text-fine text-ink-dim bg-surface-0 p-2 rounded border border-line">
                      <span className="font-semibold text-accent">Explanation: </span>
                      {explanation}
                    </div>
                  )}
                </div>
              )
            }

            // Custom Card for App Guide
            if (act.tool === 'app_guide') {
              const targetMode = String(act.args.mode || 'calculator')
              const steps = Array.isArray(act.args.steps) ? (act.args.steps as string[]) : []
              const tip = act.args.tip ? String(act.args.tip) : ''

              return (
                <div
                  key={act.id}
                  className="rounded border border-line bg-surface-1 p-3 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-medium text-small text-ink-strong">
                      <Compass size={15} className="text-accent" />
                      <span>PhysLab Feature Guide: {targetMode}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        enterMode(targetMode as Parameters<typeof enterMode>[0])
                      }
                      className="px-2.5 py-0.5 rounded bg-accent text-on-accent text-fine font-medium hover:bg-accent-2 cursor-pointer"
                    >
                      Open {targetMode}
                    </button>
                  </div>
                  <div className="flex flex-col gap-1 mt-1">
                    {steps.map((st, sIdx) => (
                      <div key={sIdx} className="flex items-start gap-2 text-fine text-ink">
                        <span className="w-4 h-4 rounded-full bg-surface-2 text-accent flex items-center justify-center shrink-0 font-mono">
                          {sIdx + 1}
                        </span>
                        <span>{st}</span>
                      </div>
                    ))}
                  </div>
                  {tip && (
                    <div className="text-fine text-ink-faint italic mt-1">💡 Tip: {tip}</div>
                  )}
                </div>
              )
            }

            return (
              <div
                key={act.id}
                className="flex items-center justify-between px-2.5 py-1.5 rounded bg-surface-1 border border-line text-fine"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="font-semibold text-ink-strong font-mono">{act.tool}</span>
                  <span className="text-ink-dim truncate">
                    {getToolShortResult(act.tool, act.args, act.result)}
                  </span>
                </div>
                {isSuccess && <Check size={12} className="text-good shrink-0 ml-2" />}
              </div>
            )
          })}
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
function renderMarkdownWithMath(text: string): React.ReactNode[] {
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
      const paragraphText = buffer.join('\n').trim()
      if (paragraphText) {
        nodes.push(
          <div key={`p_${nodes.length}`} className="my-1">
            {renderInlineMath(paragraphText)}
          </div>
        )
      }
      buffer = []
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

    if (line.trim().startsWith('$$') && line.trim().endsWith('$$') && line.trim().length > 4) {
      flushBuffer()
      const formula = line.trim().slice(2, -2)
      nodes.push(<DisplayMath key={`math_${nodes.length}`} tex={formula} />)
      continue
    }

    if (line.trim().startsWith('$$')) {
      if (inDisplayMath) {
        nodes.push(<DisplayMath key={`math_${nodes.length}`} tex={mathBuffer} />)
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
      nodes.push(
        <h3
          key={`h3_${nodes.length}`}
          className="font-semibold text-lead text-ink-strong mt-2 mb-1"
        >
          {renderInlineMath(line.slice(4))}
        </h3>
      )
      continue
    }
    if (line.startsWith('## ')) {
      flushBuffer()
      nodes.push(
        <h2
          key={`h2_${nodes.length}`}
          className="font-semibold text-title text-ink-strong mt-3 mb-1"
        >
          {renderInlineMath(line.slice(3))}
        </h2>
      )
      continue
    }

    if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
      flushBuffer()
      nodes.push(
        <div key={`li_${nodes.length}`} className="flex items-start gap-2 ml-2 my-0.5">
          <span className="text-accent leading-none mt-1.5">•</span>
          <div className="flex-1">{renderInlineMath(line.trim().slice(2))}</div>
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
 * Safely renders inline KaTeX math ($...$) and bold/code formatting.
 */
function renderInlineMath(text: string): React.ReactNode {
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
      try {
        const html = katex.renderToString(tex, {
          displayMode: false,
          throwOnError: false,
          output: 'html'
        })
        return (
          <span
            key={idx}
            className="inline-block mx-0.5 align-middle"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )
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
            {bp}
          </strong>
        ) : (
          bp
        )
      )
    }

    return part
  })
}

function DisplayMath({ tex }: { tex: string }) {
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

  return (
    <div
      className={`my-1.5 p-2 rounded bg-surface-1 overflow-x-hidden text-center ${
        isLong ? 'text-fine' : 'text-small'
      }`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
