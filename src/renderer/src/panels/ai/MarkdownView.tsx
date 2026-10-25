import { memo, useState } from 'react'
import katex from 'katex'
import {
  AlertTriangle,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Play,
  Sparkles
} from 'lucide-react'
import type { PhysLabAction, SpecialAgent } from '../../ai/types'
import { executePhysLabAction } from '../../ai/bridge'

interface MarkdownViewProps {
  content: string
  think?: string
  agentTraces?: { agent: SpecialAgent; summary: string }[]
  actions?: PhysLabAction[]
  verified?: boolean
  onActionExecuted?: (action: PhysLabAction) => void
  onChallengeClick?: (prompt: string) => void
}

const AGENT_LABELS: Record<SpecialAgent, { label: string; token: string }> = {
  OCR_VISION: { label: 'OCR & Vision', token: 'text-accent' },
  PLANNER_MINDMAP: { label: 'Planner & Mind Map', token: 'text-ink-strong' },
  MATH_AUDITOR: { label: 'Math Auditor (3-Way)', token: 'text-good' },
  PHYSICS_SANDBOX: { label: 'Physics Sandbox Audit', token: 'text-warn' },
  HUMAN_TEACHER: { label: 'Human Teacher Soul', token: 'text-accent-2' }
}

/**
 * Extracts the contents of \boxed{...} from LaTeX strings.
 */
function extractBoxed(text: string): string | null {
  const marker = '\\boxed{'
  const idx = text.indexOf(marker)
  if (idx === -1) return null
  let depth = 0
  const start = idx + marker.length
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      if (depth === 0) {
        return text.slice(start, i).trim()
      }
      depth--
    }
  }
  return null
}

/**
 * Generates follow-up challenge chips based on actions or problem context.
 */
function getChallengeChips(actions?: PhysLabAction[], content?: string): string[] {
  const chips: string[] = []
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
    chips.push('What if x = 0?')
    chips.push("What if we find second derivative f''(x)?")
    return chips
  }

  const lower = (content || '').toLowerCase()
  if (lower.includes('incline') || lower.includes('friction') || lower.includes('slope')) {
    chips.push('What if incline = 35°?')
    chips.push('What if mass = 5 kg?')
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
 * Splits content into an intuition hook and a detailed step-by-step derivation.
 */
function splitIntuitionAndDerivation(text: string): {
  intuition: string
  derivation: string
  hasIntuition: boolean
  hasDerivation: boolean
} {
  const intuitionRegex = /###\s*(?:💡\s*)?Intuition(?:\s*Hook)?/i
  const match = text.search(intuitionRegex)

  if (match !== -1) {
    const afterIntuition = text.slice(match)
    const derivationRegex = /\n###\s*(?:📐\s*)?(?:Step|Derivation|Solution|Analysis|Proof|Auditor)/i
    const devMatch = afterIntuition.search(derivationRegex)

    if (devMatch !== -1) {
      const intuitionPart = afterIntuition.slice(0, devMatch).trim()
      const derivationPart = afterIntuition.slice(devMatch).trim()
      return {
        intuition: intuitionPart,
        derivation: derivationPart,
        hasIntuition: true,
        hasDerivation: true
      }
    }
  }

  const paragraphs = text.split(/\n\s*\n/)
  if (paragraphs.length >= 3 && text.includes('\\boxed{')) {
    const intuitionPart = paragraphs[0].trim()
    const derivationPart = paragraphs.slice(1).join('\n\n').trim()
    return {
      intuition: intuitionPart,
      derivation: derivationPart,
      hasIntuition: true,
      hasDerivation: true
    }
  }

  return {
    intuition: text,
    derivation: '',
    hasIntuition: false,
    hasDerivation: false
  }
}

export const MarkdownView = memo(function MarkdownView({
  content,
  think,
  agentTraces,
  actions,
  verified,
  onActionExecuted,
  onChallengeClick
}: MarkdownViewProps) {
  const [showThink, setShowThink] = useState(false)
  const [showDerivation, setShowDerivation] = useState(false)
  const [executingMap, setExecutingMap] = useState<Record<string, boolean>>({})

  const handleRunAction = async (action: PhysLabAction) => {
    setExecutingMap((prev) => ({ ...prev, [action.id]: true }))
    try {
      const updated = await executePhysLabAction(action)
      onActionExecuted?.(updated)
    } finally {
      setExecutingMap((prev) => ({ ...prev, [action.id]: false }))
    }
  }

  const boxedAnswer = extractBoxed(content)
  const isAnyActionUnverified = actions?.some((a) => a.verified === false)
  const isAnyActionVerified = actions?.some((a) => a.verified === true)
  const isUnverified = verified === false || isAnyActionUnverified
  const isVerified = !isUnverified && (verified === true || isAnyActionVerified)

  const { intuition, derivation, hasDerivation } = splitIntuitionAndDerivation(content)
  const challengeChips = getChallengeChips(actions, content)

  return (
    <div className="flex flex-col gap-2.5 text-body text-ink leading-relaxed">
      {/* 1. Answer-First Banner (Prominent Final Answer Box) */}
      {boxedAnswer && (
        <div className="rounded-lg border border-line bg-surface-2 p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="font-semibold text-small text-ink-strong flex items-center gap-1.5">
              <Sparkles size={14} className="text-accent" />
              <span>Final Answer</span>
            </span>

            {isVerified ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-1 text-fine font-semibold text-good border border-line">
                <CheckCircle2 size={12} />
                <span>CAS & Physics Verified</span>
              </span>
            ) : isUnverified ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-1 text-fine font-semibold text-warn border border-line">
                <AlertTriangle size={12} />
                <span>⚠️ Unverified Step — Check with Calculator/CAS</span>
              </span>
            ) : null}
          </div>

          <div className="text-center py-1 overflow-x-auto">
            <DisplayMath tex={`\\boxed{${boxedAnswer}}`} />
          </div>
        </div>
      )}

      {/* 2. Collapsible Ultimatrix Agent Trace */}
      {think && (
        <div className="rounded border border-line bg-surface-1 overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-2.5 py-1.5 text-fine font-medium text-ink-dim hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer"
            onClick={() => setShowThink(!showThink)}
          >
            <div className="flex items-center gap-1.5">
              <Brain size={14} className="text-accent" />
              <span>🧠 Ultimatrix Agent Trace</span>
              {agentTraces && agentTraces.length > 0 && (
                <div className="flex items-center gap-1 ml-1">
                  {agentTraces.map((trace) => (
                    <span
                      key={trace.agent}
                      className={`px-1.5 py-0.2 rounded bg-surface-2 text-fine ${
                        AGENT_LABELS[trace.agent]?.token || 'text-ink-dim'
                      }`}
                    >
                      {AGENT_LABELS[trace.agent]?.label.split(' ')[0]}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {showThink ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>

          {showThink && (
            <div className="p-2.5 border-t border-line bg-surface-0 flex flex-col gap-2 text-fine font-mono text-ink-dim whitespace-pre-wrap">
              {agentTraces && agentTraces.length > 0 ? (
                agentTraces.map((trace) => (
                  <div
                    key={trace.agent}
                    className="flex flex-col gap-0.5 border-b border-line pb-1.5 last:border-none"
                  >
                    <span
                      className={`font-semibold ${
                        AGENT_LABELS[trace.agent]?.token || 'text-ink'
                      }`}
                    >
                      [{AGENT_LABELS[trace.agent]?.label || trace.agent}]
                    </span>
                    <span className="text-ink-faint">{trace.summary}</span>
                  </div>
                ))
              ) : (
                <div>{think}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 3. Intuition Hook & Progressive Disclosure Content */}
      <div className="markdown-prose flex flex-col gap-2">
        {hasDerivation ? (
          <>
            {renderMarkdownWithMath(intuition)}

            {/* Collapsible Step-by-Step Derivation */}
            <div className="rounded border border-line bg-surface-1 overflow-hidden mt-1">
              <button
                type="button"
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-fine font-medium text-ink-dim hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer"
                onClick={() => setShowDerivation(!showDerivation)}
              >
                <span className="flex items-center gap-1.5 text-accent font-semibold">
                  <span>📐 {showDerivation ? 'Hide' : 'Show'} Step-by-Step Derivation</span>
                </span>
                {showDerivation ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>

              {showDerivation && (
                <div className="p-3 border-t border-line bg-surface-0 flex flex-col gap-2">
                  {renderMarkdownWithMath(derivation)}
                </div>
              )}
            </div>
          </>
        ) : (
          renderMarkdownWithMath(content)
        )}
      </div>

      {/* 4. Interactive PhysLab Action Cards */}
      {actions && actions.length > 0 && (
        <div className="flex flex-col gap-2 mt-1">
          {actions.map((act) => {
            const isExecuting = Boolean(executingMap[act.id])
            const isSuccess = act.status === 'success'
            const isActionVerified = act.verified

            return (
              <div
                key={act.id}
                className="rounded border border-line bg-surface-1 p-2.5 flex flex-col gap-2 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-medium text-small text-ink-strong">
                    <Sparkles size={14} className="text-accent" />
                    <span>
                      {act.tool === 'calc_solve' && 'PhysLab Calculator & 3-Way Truth Check'}
                      {act.tool === 'sandbox_experiment' && '3D Physics Sandbox Experiment'}
                      {act.tool === 'mindmap_build' && 'Obsidian Concept Mind Map'}
                      {act.tool === 'goal_update' && 'Student Goal Keeper Update'}
                      {(act.tool === 'graph_plot' || act.tool === 'graph3d_plot') &&
                        'Mathematical Graph Plot'}
                    </span>
                  </div>

                  {isActionVerified && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-2 text-fine font-semibold text-good border border-line">
                      <CheckCircle2 size={12} />
                      3-Way Verified
                    </span>
                  )}
                </div>

                {/* Arguments Preview */}
                <div className="text-fine font-mono text-ink-dim bg-surface-0 p-1.5 rounded border border-line overflow-x-auto">
                  {act.tool === 'calc_solve' && <div>Input: {String(act.args.input || '')}</div>}
                  {act.tool === 'sandbox_experiment' && (
                    <div>
                      Setup: {String(act.args.title || 'Incline Experiment')} (
                      {String(act.args.angleDeg ?? '')}°, {String(act.args.massKg ?? '')} kg, μ_s=
                      {String(act.args.muStatic ?? '')})
                    </div>
                  )}
                  {act.tool === 'mindmap_build' && (
                    <div>
                      Building Concept Graph (
                      {Array.isArray(act.args.nodes) ? act.args.nodes.length : 0} nodes)
                    </div>
                  )}
                  {act.tool === 'goal_update' && (
                    <div>
                      Goal: {String(act.args.goalId || '')} (+{String(act.args.increment ?? 1)})
                    </div>
                  )}
                  {(act.tool === 'graph_plot' || act.tool === 'graph3d_plot') && (
                    <div>Plot: {String(act.args.equation || '')}</div>
                  )}
                </div>

                {/* Run / Status Button */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-fine text-ink-faint">
                    {act.result && typeof act.result === 'object' && 'message' in act.result
                      ? String(act.result.message)
                      : isSuccess
                        ? 'Action completed'
                        : 'Ready to run in PhysLab'}
                  </span>

                  <button
                    type="button"
                    disabled={isExecuting}
                    onClick={() => handleRunAction(act)}
                    className="flex items-center gap-1.5 px-3 py-1 rounded bg-accent text-fine font-medium text-on-accent hover:bg-accent-2 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isExecuting ? (
                      <span>Running…</span>
                    ) : isSuccess ? (
                      <>
                        <Check size={13} />
                        <span>Run Again</span>
                      </>
                    ) : (
                      <>
                        <Play size={13} />
                        <span>Run in PhysLab</span>
                      </>
                    )}
                  </button>
                </div>
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

  const lines = text.split('\n')
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
  const parts = text.split(/(\$[^$]+\$)/g)

  return parts.map((part, idx) => {
    if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
      const tex = part.slice(1, -1)
      try {
        const html = katex.renderToString(tex, {
          displayMode: false,
          throwOnError: false,
          output: 'html'
        })
        return (
          <span
            key={idx}
            className="inline-block mx-0.5"
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
  let html = ''
  let error = false
  try {
    html = katex.renderToString(tex, {
      displayMode: true,
      throwOnError: false,
      output: 'html'
    })
  } catch {
    error = true
  }

  if (error) {
    return <div className="font-mono text-fine text-warn my-2">{tex}</div>
  }

  return (
    <div
      className="my-2 p-2 rounded bg-surface-1 overflow-x-auto text-center"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
