import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  Brain,
  MessageSquare,
  Network,
  Target,
  Settings2,
  Send,
  Plus,
  Minus,
  Trash2,
  Image as ImageIcon,
  X,
  Sparkles,
  CheckCircle2,
  RefreshCw,
  ClipboardPaste,
  Eye,
  EyeOff,
  Square,
  Cpu,
  MoreHorizontal,
  RotateCcw,
  ArrowLeft
} from 'lucide-react'
import { useAiStore } from '../ai/store'
import {
  abortActiveStream,
  autoConnectLocalBrain,
  fetchAvailableModels,
  streamChatCompletion,
  testAiConnection,
  transcribeDiagram
} from '../ai/client'
import { executePhysLabAction, extractThinkTrace, getBrainStageText } from '../ai/bridge'
import { stripIncompleteActionBlocks } from '../ai/contract'
import { runTool } from '../ai/tools'
import { verifyMessage } from '../ai/truthCheck'
import { MarkdownView } from './ai/MarkdownView'
import { MindMapView } from './ai/MindMapView'
import { hidePanel } from '../app/panels'
import { runHistory } from '../app/undoRoute'
import { useApp } from '../app/modes'
import type { Attachment, MindMapNode, PhysLabAction } from '../ai/types'

function formatActionChip(act: PhysLabAction): string {
  if (act.tool === 'geometry_create') {
    const kind = act.args?.kind || 'object'
    const name = act.args?.name || ''
    return `+ ${kind} ${name}`.trim()
  }
  if (act.tool === 'remove') {
    return `− ${act.args?.target || act.args?.name || 'object'}`
  }
  if (act.tool === 'plot' || act.tool === 'graph_plot') {
    return `plot ${act.args?.expression || act.args?.equation || 'f(x)'}`
  }
  if (act.tool === 'graph3d_plot') {
    return `plot 3D ${act.args?.expression || act.args?.equation || 'z(x,y)'}`
  }
  if (act.tool === 'build_experiment') {
    const objs = Array.isArray(act.args?.objects) ? act.args.objects : []
    if (objs.length === 1) return `+ ${objs[0]?.kind || 'object'}`
    if (objs.length > 1) return `+ ${objs.length} objects`
    return `+ experiment`
  }
  if (act.tool === 'sandbox_experiment' || act.tool === 'load_experiment') {
    return `+ ${act.args?.id || act.args?.presetId || act.args?.experimentType || 'experiment'}`
  }
  if (act.tool === 'calc_solve' || act.tool === 'solve') {
    const inp = String(act.args?.input || act.args?.expression || '').trim()
    return `solve ${inp}`.trim()
  }
  if (act.tool === 'set_speed') {
    return `speed ${act.args?.factor}x`
  }
  if (act.tool === 'set_param') {
    return `${act.args?.name || 'param'} = ${act.args?.value ?? ''}`
  }
  return act.tool.replace(/_/g, ' ')
}

type TabId = 'chat' | 'mindmap' | 'goals' | 'settings'

if (typeof window !== 'undefined') {
  ;(window as unknown as { aiStore?: typeof useAiStore }).aiStore = useAiStore
}

export function AiCopilot() {
  const [activeTab, setActiveTab] = useState<TabId>('chat')
  const [inputPrompt, setInputPrompt] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [transcribing, setTranscribing] = useState(false)
  const [transcribedText, setTranscribedText] = useState<string | null>(null)
  const [transcribeError, setTranscribeError] = useState<string | null>(null)
  const [verifyMsg, setVerifyMsg] = useState<{ ok: boolean; message: string } | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [showKeyText, setShowKeyText] = useState(false)
  const [isFetchingModels, setIsFetchingModels] = useState(false)
  const [modelFetchMsg, setModelFetchMsg] = useState<string | null>(null)
  const [isAutoConnecting, setIsAutoConnecting] = useState(false)
  const [autoConnectResult, setAutoConnectResult] = useState<{
    ok: boolean
    message: string
  } | null>(null)

  // Goal keeper form state
  const [newGoalTitle, setNewGoalTitle] = useState('')
  const [newGoalTarget, setNewGoalTarget] = useState(3)
  const [menuOpen, setMenuOpen] = useState(false)

  const menuRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', handleOutsideClick)
    return () => window.removeEventListener('mousedown', handleOutsideClick)
  }, [menuOpen])

  // Store bindings
  const provider = useAiStore((s) => s.provider)
  const geminiApiKey = useAiStore((s) => s.geminiApiKey)
  const geminiModel = useAiStore((s) => s.geminiModel)
  const azureDeployment = useAiStore((s) => s.azureDeployment)
  const localEndpoint = useAiStore((s) => s.localEndpoint)
  const localModel = useAiStore((s) => s.localModel)
  const autoExecuteActions = useAiStore((s) => s.autoExecuteActions)
  const availableGeminiModels = useAiStore((s) => s.availableGeminiModels)

  const [hasMainKey, setHasMainKey] = useState<boolean | null>(null)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.physlab?.ai?.hasKey) {
      window.physlab.ai.hasKey().then(setHasMainKey).catch(() => setHasMainKey(false))
    }
  }, [provider])

  const threads = useAiStore((s) => s.threads)
  const activeThreadId = useAiStore((s) => s.activeThreadId)
  const isStreaming = useAiStore((s) => s.isStreaming)
  const streamError = useAiStore((s) => s.streamError)

  const memories = useAiStore((s) => s.memories)
  const goals = useAiStore((s) => s.goals)
  const activeMindMap = useAiStore((s) => s.activeMindMap)

  const currentThread = threads.find((t) => t.id === activeThreadId) || threads[0]
  const messages = useMemo(() => currentThread?.messages || [], [currentThread?.messages])

  const lastBotMsgRef = useRef<HTMLDivElement | null>(null)

  // Auto-scroll logic: keep the top of the assistant message (and its Final Answer banner) visible
  useEffect(() => {
    if (activeTab === 'chat') {
      if (!isStreaming && lastBotMsgRef.current) {
        lastBotMsgRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }
    }
  }, [messages, isStreaming, activeTab])

  // Handle image upload from file or paste
  const handleAddAttachment = (file: File) => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result)
      const newAtt: Attachment = {
        id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        mimeType: file.type,
        dataUrl,
        name: file.name
      }
      setAttachments((prev) => [...prev, newAtt])
      setTranscribing(true)
      setTranscribeError(null)
      void transcribeDiagram(dataUrl).then((res) => {
        setTranscribing(false)
        if (res.ok && res.text) {
          setTranscribedText(res.text)
        } else if (res.error) {
          setTranscribeError(res.error)
        }
      })
    }
    reader.readAsDataURL(file)
  }

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile()
        if (file) handleAddAttachment(file)
      }
    }
  }, [])

  // Send message
  const handleSend = async (textToSend?: string, attachmentsToSend?: Attachment[]) => {
    const currentAtts = attachmentsToSend !== undefined ? attachmentsToSend : attachments
    const prompt = (textToSend ?? inputPrompt).trim()
    if ((!prompt && currentAtts.length === 0) || isStreaming) return

    // 1. Add user message
    const userMsg = useAiStore.getState().addMessage({
      role: 'user',
      content: prompt,
      attachments: currentAtts
    })

    setInputPrompt('')
    const pendingAtts = currentAtts
    setAttachments([])

    // 2. Add placeholder assistant message
    const botMsg = useAiStore.getState().addMessage({
      role: 'assistant',
      content: 'Thinking…'
    })

    useAiStore.getState().setStreaming(true)

    // 3. Stream response
    await streamChatCompletion(
      currentThread.messages.filter((m) => m.id !== userMsg.id && m.id !== botMsg.id),
      prompt,
      pendingAtts,
      {
        onChunk: (accumulated) => {
          useAiStore.getState().updateMessage(botMsg.id, {
            content: accumulated
          })
        },
        onDone: async ({ content, think, actions, agentTraces, model }) => {
          for (const act of actions) {
            if (!act.result && (act.tool === 'solve' || act.tool === 'calc_solve')) {
              try {
                act.result = await runTool(act.tool, act.args)
              } catch {
                // continue
              }
            }
          }
          const verification = await verifyMessage(content, actions)
          const finalContent = verification.correctedContent ?? content
          useAiStore.getState().updateMessage(botMsg.id, {
            content: finalContent,
            think,
            actions,
            agentTraces,
            verification,
            verified: verification.state === 'verified' && verification.badgeText === 'Checked by PhysLab',
            model
          })
          useAiStore.getState().setStreaming(false)

          // Auto-execute if enabled and engine did not disagree
          const { autoExecuteActions } = useAiStore.getState()
          if (autoExecuteActions && verification.state !== 'disagrees') {
            for (const act of actions) {
              void executePhysLabAction(act).then((updatedAct) => {
                const thread = useAiStore
                  .getState()
                  .threads.find((t) => t.id === useAiStore.getState().activeThreadId)
                const msg = thread?.messages.find((m) => m.id === botMsg.id)
                if (msg && msg.actions) {
                  const updatedActions = msg.actions.map((a) =>
                    a.id === updatedAct.id ? updatedAct : a
                  )
                  useAiStore.getState().updateMessage(botMsg.id, { actions: updatedActions })
                }
              })
            }
          }
        },
        onError: (err) => {
          useAiStore.getState().updateMessage(botMsg.id, {
            content: `⚠️ Error: ${err}`
          })
          useAiStore.getState().setStreaming(false, err)
        }
      }
    )
  }

  const handleSendRef = useRef(handleSend)
  useEffect(() => {
    handleSendRef.current = handleSend
  })

  useEffect(() => {
    if (typeof window !== 'undefined') {
      ;(window as unknown as { sendAiMessage?: (p: string) => Promise<void> }).sendAiMessage = (
        p: string
      ) => handleSendRef.current(p)
    }
  }, [])

  // Quick test prompts
  const runQuickTest = (prompt: string) => {
    setInputPrompt(prompt)
    handleSend(prompt)
  }

  const handleVerify = async () => {
    setIsVerifying(true)
    setVerifyMsg(null)
    const result = await testAiConnection()
    setVerifyMsg(result)
    setIsVerifying(false)
  }

  const handleFetchModels = async () => {
    setIsFetchingModels(true)
    setModelFetchMsg(null)
    const result = await fetchAvailableModels()
    setIsFetchingModels(false)
    if (result.message) {
      setModelFetchMsg(result.message)
    }
  }

  const handleAutoConnectLocal = async () => {
    setIsAutoConnecting(true)
    setAutoConnectResult(null)
    const result = await autoConnectLocalBrain()
    setAutoConnectResult(result)
    setIsAutoConnecting(false)
  }

  const handleAddGoal = () => {
    if (!newGoalTitle.trim()) return
    useAiStore.getState().addGoal({
      title: newGoalTitle.trim(),
      target: Math.max(1, newGoalTarget),
      current: 0
    })
    setNewGoalTitle('')
  }

  return (
    <div className="ai-panel-wrapper font-ui select-none">
      <div className="ai-panel-card text-ink overflow-hidden relative">
        {/* 1. Header (Calm & Minimal: Title, Model, New Chat, "⋯" Menu, Close) */}
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-line/50 bg-surface-1/60 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {activeTab !== 'chat' ? (
              <button
                type="button"
                onClick={() => setActiveTab('chat')}
                className="flex items-center gap-1 text-fine text-ai-accent hover:underline cursor-pointer"
                title="Back to Chat"
              >
                <ArrowLeft size={14} />
                <span>Chat</span>
              </button>
            ) : (
              <>
                <Sparkles size={16} className="text-ai-accent shrink-0" />
                <span className="font-semibold text-small text-ink-strong">AI Tutor</span>
                <span className="text-fine text-ink-faint font-mono truncate max-w-[120px]">
                  {provider === 'azure' ? (azureDeployment || 'gpt-5.4') : provider === 'local' ? localModel : geminiModel}
                </span>
              </>
            )}
            {activeTab !== 'chat' && (
              <span className="font-semibold text-small text-ink-strong capitalize">
                {activeTab === 'mindmap' ? 'Mind Map' : activeTab === 'goals' ? 'Student Goals' : 'Settings'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 relative" ref={menuRef}>
            <button
              type="button"
              title="New Chat"
              onClick={() => {
                useAiStore.getState().createThread()
                setActiveTab('chat')
                setMenuOpen(false)
              }}
              className="p-1.5 rounded-full text-ink-dim hover:text-ink hover:bg-surface-2 cursor-pointer transition-colors"
            >
              <Plus size={15} />
            </button>
            <button
              type="button"
              title="More options"
              onClick={() => setMenuOpen((v) => !v)}
              className={`p-1.5 rounded-full cursor-pointer transition-colors ${
                menuOpen ? 'text-ai-accent bg-surface-2' : 'text-ink-dim hover:text-ink hover:bg-surface-2'
              }`}
            >
              <MoreHorizontal size={15} />
            </button>
            <button
              type="button"
              title="Close AI Tutor"
              onClick={() => hidePanel('ai_copilot')}
              className="p-1.5 rounded-full text-ink-dim hover:text-bad hover:bg-surface-2 cursor-pointer transition-colors"
            >
              <X size={15} />
            </button>

            {/* "⋯" Dropdown Menu */}
            {menuOpen && (
              <div className="absolute right-0 top-8 z-50 min-w-[170px] rounded-xl bg-surface-1 border border-line shadow-lg p-1.5 flex flex-col gap-0.5 text-small">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('chat')
                    setMenuOpen(false)
                  }}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left cursor-pointer transition-colors ${
                    activeTab === 'chat' ? 'bg-surface-2 text-ink-strong font-medium' : 'text-ink-dim hover:text-ink hover:bg-surface-2'
                  }`}
                >
                  <MessageSquare size={14} className="text-ai-accent" />
                  <span>Chat</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('mindmap')
                    setMenuOpen(false)
                  }}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left cursor-pointer transition-colors ${
                    activeTab === 'mindmap' ? 'bg-surface-2 text-ink-strong font-medium' : 'text-ink-dim hover:text-ink hover:bg-surface-2'
                  }`}
                >
                  <Network size={14} />
                  <span>Mind Map</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('goals')
                    setMenuOpen(false)
                  }}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left cursor-pointer transition-colors ${
                    activeTab === 'goals' ? 'bg-surface-2 text-ink-strong font-medium' : 'text-ink-dim hover:text-ink hover:bg-surface-2'
                  }`}
                >
                  <Target size={14} />
                  <span>Goals &amp; Memory</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('settings')
                    setMenuOpen(false)
                  }}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left cursor-pointer transition-colors ${
                    activeTab === 'settings' ? 'bg-surface-2 text-ink-strong font-medium' : 'text-ink-dim hover:text-ink hover:bg-surface-2'
                  }`}
                >
                  <Settings2 size={14} />
                  <span>Settings</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 2. Main Tab Content */}
        <div className="flex-1 overflow-hidden relative">
          {/* TAB 1: CHAT */}
          {activeTab === 'chat' && (
            <div className="flex flex-col h-full">
              {/* Missing Key Notification in Chat */}
              {provider !== 'local' && !geminiApiKey.trim() && hasMainKey === false && (
                <div className="m-3 p-3 rounded-xl border border-line bg-surface-1 flex items-center justify-between gap-3 text-small">
                  <div className="flex items-center gap-2 text-ink-dim">
                    <Sparkles size={16} className="text-ai-accent shrink-0" />
                    <span>Please configure an AI API key in Settings to start chatting.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('settings')}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-ai-accent text-on-accent text-fine font-medium hover:opacity-90 cursor-pointer shrink-0 transition-opacity"
                  >
                    <Settings2 size={13} />
                    <span>Open Settings</span>
                  </button>
                </div>
              )}

              {/* Messages Scroll Area */}
              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3.5 select-text">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center text-ink-dim gap-3 my-auto px-2">
                    <div className="w-11 h-11 rounded-full bg-ai-surface border border-ai-border flex items-center justify-center shadow-sm">
                      <Sparkles size={20} className="text-ai-accent" />
                    </div>
                    <div className="flex flex-col gap-1 max-w-xs">
                      <span className="font-semibold text-lead text-ink-strong">PhysLab AI Tutor</span>
                      <span className="text-small text-ink-faint">
                        Ask anything about physics and maths, or try one of these:
                      </span>
                    </div>

                    {/* Quick-Prompt Chips */}
                    <div className="flex flex-col gap-2 w-full max-w-xs mt-3">
                      {[
                        "Construct Ceva's theorem",
                        "Build an Atwood machine",
                        "Plot y = sin x and find its roots",
                        "Resolve a 50 N force at 30°"
                      ].map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => runQuickTest(prompt)}
                          className="px-3.5 py-2 rounded-xl border border-line bg-surface-1 hover:bg-surface-2 text-ink text-small text-left cursor-pointer transition-all hover:border-ai-border shadow-sm flex items-center justify-between group"
                        >
                          <span className="font-medium text-ink-strong">{prompt}</span>
                          <Sparkles size={12} className="text-ink-faint group-hover:text-ai-accent transition-colors shrink-0 ml-1.5" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                messages.map((m, idx) => {
                  const isLastAssistantMessage = m.role === 'assistant' && idx === messages.length - 1
                  const isCurrentlyStreaming = isStreaming && isLastAssistantMessage

                  return (
                    <div
                      key={m.id}
                      ref={isLastAssistantMessage ? lastBotMsgRef : undefined}
                      className={`ai-message-enter flex flex-col gap-1.5 ${
                        m.role === 'user' ? 'items-end' : 'items-start w-full'
                      }`}
                    >
                      {/* User message attachments */}
                      {m.attachments && m.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-1">
                          {m.attachments.map((att) => (
                            <img
                              key={att.id}
                              src={att.dataUrl}
                              alt="Attachment"
                              className="max-h-28 rounded-xl border border-line object-contain bg-surface-1"
                            />
                          ))}
                        </div>
                      )}

                      {m.role === 'user' ? (
                        <div className="ai-bubble-user p-3 max-w-[85%] text-body select-text">
                          <div className="whitespace-pre-wrap">{m.content}</div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2.5 w-full">
                          <div className="mt-2.5 shrink-0">
                            <div className="ai-avatar-dot" title="PhysLab AI" />
                          </div>
                          <div className="ai-bubble-bot p-3.5 flex-1 min-w-0 select-text flex flex-col gap-2.5">
                            {/* Message Header with Model Tag */}
                            {m.model && !isCurrentlyStreaming && (
                              <div className="flex items-center justify-end pb-1 border-b border-line/40 text-fine">
                                <span className="text-fine text-ink-faint font-mono">{m.model}</span>
                              </div>
                            )}

                            {/* Small tool progress / shimmer during streaming */}
                            {isCurrentlyStreaming && (
                              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-2/60 border border-line/50 text-fine text-ink-dim font-mono mb-1">
                                <Sparkles size={13} className="text-ai-accent ai-thinking-shimmer shrink-0" />
                                <span>
                                  {m.content.startsWith('Running') ||
                                  m.content.startsWith('Solving') ||
                                  m.content.startsWith('Loading') ||
                                  m.content.startsWith('Simulating') ||
                                  m.content.startsWith('Plotting')
                                    ? m.content
                                    : getBrainStageText(m.content, true)}
                                </span>
                              </div>
                            )}

                            {(() => {
                              const streamingTrace = isCurrentlyStreaming
                                ? extractThinkTrace(m.content)
                                : null
                              const isThinking =
                                isCurrentlyStreaming &&
                                (m.content === 'Thinking…' ||
                                  !streamingTrace?.cleanContent ||
                                  (!m.content.includes('</think>') &&
                                    !m.content.includes('[AGENT: HUMAN_TEACHER]') &&
                                    (m.content.includes('<think>') || m.content.includes('[AGENT:'))))

                              if (isThinking) {
                                const rawThink = (streamingTrace?.think || m.content)
                                  .replace(/<\/?think>/gi, '')
                                  .replace(/\[AGENT:\s*[^\]]+\]/gi, '')
                                return (
                                  <div className="text-fine font-mono text-ink-dim px-1 line-clamp-3">
                                    {stripIncompleteActionBlocks(rawThink).trim() ||
                                      'Analyzing problem and executing PhysLab tools…'}
                                  </div>
                                )
                              }

                              const studentPrompt = messages
                                .slice(0, idx)
                                .reverse()
                                .find((prev) => prev.role === 'user')?.content

                              return (
                                <>
                                  <MarkdownView
                                    content={
                                      isCurrentlyStreaming
                                        ? stripIncompleteActionBlocks(
                                            streamingTrace?.cleanContent || m.content
                                          )
                                        : m.content
                                    }
                                    studentPrompt={studentPrompt}
                                    think={m.think ?? streamingTrace?.think}
                                    agentTraces={m.agentTraces ?? streamingTrace?.agentTraces}
                                    actions={m.actions}
                                    verified={m.verified}
                                    verification={m.verification}
                                    onActionExecuted={(updated) => {
                                      useAiStore.getState().updateMessage(m.id, {
                                        actions: m.actions?.map((a) => (a.id === updated.id ? updated : a))
                                      })
                                    }}
                                    onChallengeClick={(prompt) => handleSend(prompt)}
                                  />

                                  {/* Calm "AI did:" line with chips and Undo */}
                                  {m.actions && m.actions.length > 0 && (
                                    <div className="flex items-center flex-wrap gap-1.5 pt-2 mt-1 border-t border-line/40 text-fine text-ink-dim">
                                      <span className="font-medium text-ink-faint">AI did:</span>
                                      {m.actions.map((act) => (
                                        <span
                                          key={act.id}
                                          className="px-2 py-0.5 rounded-full bg-surface-2 border border-line text-ink font-mono text-fine"
                                        >
                                          {formatActionChip(act)}
                                        </span>
                                      ))}
                                      <button
                                        type="button"
                                        onClick={() => runHistory(useApp.getState().mode, { menu: 'undo' })}
                                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-2 hover:bg-surface-3 border border-line text-ink-dim hover:text-ink cursor-pointer transition-colors text-fine ml-auto"
                                        title="Undo this turn's actions"
                                      >
                                        <RotateCcw size={11} />
                                        <span>Undo</span>
                                      </button>
                                    </div>
                                  )}
                                </>
                              )
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
              {streamError && (
                <div className="p-3 rounded-xl bg-surface-1 border border-line flex flex-col gap-2 text-fine">
                  <div className="text-ink-dim">
                    The AI needs the internet. Everything else in PhysLab works offline.
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('settings')}
                      className="px-3 py-1 rounded-full bg-ai-accent text-on-accent text-fine font-medium hover:opacity-90 cursor-pointer transition-opacity"
                    >
                      Set AI key
                    </button>
                    {streamError !== 'The AI needs the internet. Everything else in PhysLab works offline.' && (
                      <span className="text-ink-faint text-fine truncate" title={streamError}>
                        ({streamError})
                      </span>
                    )}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Attachments Preview Row */}
            {attachments.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-1 border-t border-line overflow-x-auto">
                {attachments.map((att) => (
                  <div key={att.id} className="relative group shrink-0">
                    <img
                      src={att.dataUrl}
                      alt="Preview"
                      className="h-14 w-14 object-cover rounded-xl border border-line"
                    />
                    <button
                      type="button"
                      onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                      className="absolute -top-1 -right-1 bg-surface-3 text-ink-dim hover:text-bad rounded-full p-0.5 border border-line cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Vision Transcription Progress */}
            {transcribing && (
              <div className="flex items-center gap-2 p-2.5 mx-2.5 my-1 rounded-xl bg-surface-2 border border-line text-fine text-ink-dim">
                <Sparkles size={14} className="text-ai-accent ai-thinking-shimmer shrink-0" />
                <span>Transcribing problem from diagram photo via Gemini Vision…</span>
              </div>
            )}

            {/* Vision Transcription Error */}
            {transcribeError && (
              <div className="flex items-center justify-between p-2 mx-2.5 my-1 rounded-xl bg-surface-2 border border-bad/30 text-fine text-ink-dim">
                <span>{transcribeError}</span>
                <button
                  type="button"
                  onClick={() => setTranscribeError(null)}
                  className="text-ink-dim hover:text-ink text-fine ml-2 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Editable Confirmation UI for Transcribed Diagram */}
            {transcribedText !== null && (
              <div className="p-3 mx-2.5 my-1.5 rounded-xl border border-line bg-surface-2 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-small text-ink-strong">
                    <Sparkles size={14} className="text-ai-accent" />
                    <span>Photo / Diagram Transcribed</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTranscribedText(null)
                      setAttachments([])
                    }}
                    className="text-fine text-ink-dim hover:text-bad cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
                <p className="text-fine text-ink-dim">
                  I read: {transcribedText.slice(0, 80)}{transcribedText.length > 80 ? '…' : ''}. Confirm to solve:
                </p>
                <textarea
                  value={transcribedText}
                  onChange={(e) => setTranscribedText(e.target.value)}
                  rows={3}
                  className="w-full p-2 rounded-xl bg-surface-0 border border-line text-body text-ink resize-y outline-none focus:border-ai-border font-math"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const text = transcribedText.trim()
                      const currentAtts = [...attachments]
                      setTranscribedText(null)
                      setAttachments([])
                      if (text) {
                        handleSend(text, currentAtts)
                      }
                    }}
                    className="px-3.5 py-1.5 rounded-full bg-ai-accent text-on-accent text-small font-medium hover:opacity-90 cursor-pointer transition-opacity"
                  >
                    Confirm & Solve with PhysLab
                  </button>
                </div>
              </div>
            )}

            {/* Input Bar */}
            <div className="p-3 border-t border-line/50 bg-surface-1/40 flex flex-col gap-1.5">
              <div className="flex items-end gap-2 bg-surface-0 border border-line rounded-2xl p-2 px-3 focus-within:border-ai-border focus-within:ring-1 focus-within:ring-ai-border/40 transition-all">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleAddAttachment(f)
                    e.target.value = ''
                  }}
                />
                <button
                  type="button"
                  title="Upload / Drop diagram photo"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 text-ink-dim hover:text-ink hover:bg-surface-2 rounded-full cursor-pointer transition-colors"
                >
                  <ImageIcon size={16} />
                </button>

                <textarea
                  value={inputPrompt}
                  onChange={(e) => setInputPrompt(e.target.value)}
                  onPaste={handlePaste}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      if (!transcribing) handleSend()
                    }
                  }}
                  rows={1}
                  placeholder="Ask anything or paste diagram photo…"
                  className="flex-1 bg-transparent border-none outline-none resize-none text-body text-ink placeholder:text-ink-faint py-1 max-h-32"
                />

                {isStreaming ? (
                  <button
                    type="button"
                    onClick={abortActiveStream}
                    title="Stop generation"
                    className="p-2 bg-bad text-on-accent rounded-full hover:opacity-90 cursor-pointer transition-opacity"
                  >
                    <Square size={14} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={(!inputPrompt.trim() && attachments.length === 0) || transcribing}
                    onClick={() => handleSend()}
                    className="p-2 bg-ai-accent text-on-accent rounded-full hover:opacity-90 disabled:opacity-40 cursor-pointer transition-opacity shadow-sm"
                  >
                    <Send size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MIND MAP */}
        {activeTab === 'mindmap' && (
          <MindMapView
            data={activeMindMap}
            onNodeClick={(node: MindMapNode) => {
              setActiveTab('chat')
              handleSend(`Explain the concept "${node.label}" in detail and show its key formulas and physical intuition.`)
            }}
          />
        )}

        {/* TAB 3: GOALS & MEMORY */}
        {activeTab === 'goals' && (
          <div className="flex flex-col h-full overflow-y-auto p-3 gap-4">
            {/* Student Goal Keeper */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 font-semibold text-small text-ink-strong">
                <Target size={15} className="text-accent" />
                <span>Student Goal Keeper</span>
              </div>

              {/* Add Custom Goal Input */}
              <div className="flex items-center gap-1.5 p-1.5 rounded border border-line bg-surface-1">
                <input
                  type="text"
                  value={newGoalTitle}
                  onChange={(e) => setNewGoalTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddGoal()
                  }}
                  placeholder="Type a goal (e.g., Master Rotational Dynamics)…"
                  className="flex-1 px-2 py-1 rounded bg-surface-0 border border-line text-small text-ink outline-none"
                />
                <div className="flex items-center gap-1">
                  <span className="text-fine text-ink-dim">Target:</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={newGoalTarget}
                    onChange={(e) => setNewGoalTarget(Math.max(1, Number(e.target.value)))}
                    className="w-12 px-1 py-1 rounded bg-surface-0 border border-line text-small text-ink text-center outline-none"
                  />
                </div>
                <button
                  type="button"
                  disabled={!newGoalTitle.trim()}
                  onClick={handleAddGoal}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-accent text-on-accent text-fine font-medium hover:bg-accent-2 disabled:opacity-40 cursor-pointer"
                >
                  <Plus size={13} />
                  <span>Add Goal</span>
                </button>
              </div>

              {/* Goals list */}
              {goals.length === 0 ? (
                <div className="p-4 rounded border border-line bg-surface-1 text-center text-small text-ink-dim">
                  No active study goals yet — add one above or ask the AI Tutor to create a study plan!
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {goals.map((g) => {
                    const pct = Math.min(100, Math.round((g.current / g.target) * 100))
                    return (
                      <div key={g.id} className="p-2.5 rounded border border-line bg-surface-1 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-small">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              title={g.completed ? 'Mark incomplete' : 'Mark completed'}
                              onClick={() => useAiStore.getState().toggleGoal(g.id)}
                              className="text-ink-dim hover:text-accent cursor-pointer"
                            >
                              <CheckCircle2 size={16} className={g.completed ? 'text-good' : 'text-ink-faint'} />
                            </button>
                            <span className={`font-medium ${g.completed ? 'text-ink-dim line-through' : 'text-ink-strong'}`}>
                              {g.title}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-fine font-mono text-ink-dim mr-1">
                              {g.current}/{g.target} ({pct}%)
                            </span>
                            <button
                              type="button"
                              title="Decrease progress"
                              disabled={g.current <= 0}
                              onClick={() => useAiStore.getState().decrementGoal(g.id, 1)}
                              className="w-5 h-5 flex items-center justify-center rounded bg-surface-2 text-ink-dim hover:text-ink border border-line disabled:opacity-40 cursor-pointer"
                            >
                              <Minus size={11} />
                            </button>
                            <button
                              type="button"
                              title="Increase progress"
                              onClick={() => useAiStore.getState().incrementGoal(g.id, 1)}
                              className="w-5 h-5 flex items-center justify-center rounded bg-surface-2 text-ink-dim hover:text-ink border border-line cursor-pointer"
                            >
                              <Plus size={11} />
                            </button>
                            <button
                              type="button"
                              title="Delete goal"
                              onClick={() => useAiStore.getState().deleteGoal(g.id)}
                              className="p-1 text-ink-faint hover:text-bad cursor-pointer ml-1"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-surface-0 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: g.completed ? 'var(--good)' : 'var(--accent)'
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Mem0 Student Profile */}
            <div className="flex flex-col gap-2 border-t border-line pt-3">
              <div className="flex items-center gap-1.5 font-semibold text-small text-ink-strong">
                <Brain size={15} className="text-accent" />
                <span>Mem0 Cognitive Student Profile</span>
              </div>
              <p className="text-fine text-ink-faint">
                PhysLab-Brain automatically tracks concepts you understand and traps you need reminders on:
              </p>
              {memories.length === 0 ? (
                <div className="p-4 rounded border border-line bg-surface-1 text-center text-small text-ink-dim">
                  No student memories recorded yet — PhysLab-Brain will automatically note concept masteries and traps as you study!
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {memories.map((m) => (
                    <div key={m.id} className="p-2.5 rounded border border-line bg-surface-1 flex flex-col gap-1 text-small">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-ink-strong">{m.topic}</span>
                        <button
                          type="button"
                          onClick={() => useAiStore.getState().deleteMemory(m.id)}
                          className="text-ink-faint hover:text-bad cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      {m.weakness && (
                        <span className="text-fine text-warn">⚠️ Trap: {m.weakness}</span>
                      )}
                      {m.strength && (
                        <span className="text-fine text-good">✓ Strength: {m.strength}</span>
                      )}
                      <span className="text-fine text-ink-dim mt-0.5">{m.note}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: SETTINGS & SESSIONS */}
        {activeTab === 'settings' && (
          <div className="flex flex-col h-full overflow-y-auto p-3 gap-4">
            {/* Provider Switcher */}
            <div className="flex flex-col gap-2">
              <span className="font-semibold text-small text-ink-strong">AI Provider Selection</span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => useAiStore.getState().setProvider('azure')}
                  className={`p-2 rounded border text-left cursor-pointer transition-colors ${
                    provider === 'azure'
                      ? 'border-accent bg-surface-2'
                      : 'border-line bg-surface-1 text-ink-dim'
                  }`}
                >
                  <div className="font-semibold text-small text-ink-strong">Azure OpenAI</div>
                  <div className="text-fine text-ink-faint font-mono">{azureDeployment || 'gpt-5.4'}</div>
                </button>

                <button
                  type="button"
                  onClick={() => useAiStore.getState().setProvider('gemini')}
                  className={`p-2 rounded border text-left cursor-pointer transition-colors ${
                    provider === 'gemini'
                      ? 'border-accent bg-surface-2'
                      : 'border-line bg-surface-1 text-ink-dim'
                  }`}
                >
                  <div className="font-semibold text-small text-ink-strong">Google Gemini</div>
                  <div className="text-fine text-ink-faint">Direct cloud</div>
                </button>

                <button
                  type="button"
                  onClick={() => useAiStore.getState().setProvider('local')}
                  className={`p-2 rounded border text-left cursor-pointer transition-colors ${
                    provider === 'local'
                      ? 'border-accent bg-surface-2'
                      : 'border-line bg-surface-1 text-ink-dim'
                  }`}
                >
                  <div className="font-semibold text-small text-ink-strong">Local GGUF</div>
                  <div className="text-fine text-ink-faint">Ultimatrix</div>
                </button>
              </div>
            </div>

            {/* Azure OpenAI Card */}
            {provider === 'azure' && (
              <div className="flex flex-col gap-2.5 p-3 rounded border border-accent bg-surface-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-small text-ink-strong">
                    <Sparkles size={15} className="text-accent" />
                    <span>Azure OpenAI Service</span>
                  </div>
                  <span className="text-fine text-good bg-surface-0 px-2 py-0.5 rounded-full border border-line">
                    Active Provider
                  </span>
                </div>

                <div className="flex flex-col gap-1 text-small text-ink-dim">
                  <div className="flex items-center justify-between">
                    <span className="text-fine font-medium text-ink-dim">Deployment Model</span>
                    <span className="font-mono text-fine text-ink-strong">{azureDeployment || 'gpt-5.4'}</span>
                  </div>
                  <div className="text-fine text-ink-faint">
                    Credentials configured in environment / credential store.
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-line">
                  <button
                    type="button"
                    onClick={handleVerify}
                    disabled={isVerifying}
                    className="flex items-center gap-1.5 px-3 py-1 rounded bg-surface-2 hover:bg-surface-3 text-ink text-fine font-medium cursor-pointer border border-line transition-colors disabled:opacity-50"
                  >
                    <CheckCircle2 size={13} className="text-good" />
                    <span>{isVerifying ? 'Testing…' : 'Test Azure Connection'}</span>
                  </button>
                  {verifyMsg && (
                    <span
                      className={`text-fine ${verifyMsg.ok ? 'text-good' : 'text-bad'}`}
                    >
                      {verifyMsg.message}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Google Gemini Card */}
            {provider === 'gemini' && (
              <div className="flex flex-col gap-2.5 p-3 rounded border border-accent bg-surface-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-small text-ink-strong">
                    <Sparkles size={15} className="text-accent" />
                    <span>Google Gemini API</span>
                  </div>
                  <span className="text-fine text-good bg-surface-0 px-2 py-0.5 rounded-full border border-line">
                    Active Provider
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <label className="text-fine font-medium text-ink-dim">
                      Google AI Studio API Key
                    </label>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const clip = await navigator.clipboard.readText()
                          if (clip && clip.trim()) {
                            useAiStore.getState().setGeminiApiKey(clip.trim())
                          }
                        } catch {
                          // Ignore clipboard error
                        }
                      }}
                      className="flex items-center gap-1 text-fine text-accent hover:underline cursor-pointer"
                    >
                      <ClipboardPaste size={11} />
                      <span>Paste Key</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 w-full">
                    <input
                      type={showKeyText ? 'text' : 'password'}
                      value={geminiApiKey}
                      onChange={(e) => useAiStore.getState().setGeminiApiKey(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                      placeholder="AIzaSy..."
                      className="flex-1 min-w-0 p-1.5 rounded bg-surface-0 border border-line text-small text-ink outline-none font-mono"
                    />
                    <button
                      type="button"
                      title={showKeyText ? 'Hide API Key' : 'Show API Key'}
                      onClick={() => setShowKeyText((v) => !v)}
                      className="p-1.5 rounded bg-surface-0 border border-line text-ink-dim hover:text-ink cursor-pointer shrink-0"
                    >
                      {showKeyText ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <span className="text-fine text-ink-faint">
                    Saved locally in your browser/app storage.
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <label className="text-fine font-medium text-ink-dim">Gemini Model</label>
                    <button
                      type="button"
                      onClick={handleFetchModels}
                      disabled={isFetchingModels}
                      className="flex items-center gap-1 text-fine text-accent hover:underline cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw size={11} className={isFetchingModels ? 'animate-spin' : ''} />
                      <span>{isFetchingModels ? 'Fetching…' : 'Fetch Models'}</span>
                    </button>
                  </div>
                  <select
                    value={geminiModel}
                    onChange={(e) => useAiStore.getState().setGeminiModel(e.target.value)}
                    className="p-1.5 rounded bg-surface-0 border border-line text-small text-ink outline-none"
                  >
                    {availableGeminiModels.map((m) => (
                      <option key={m} value={m}>
                        {m} {m === 'gemini-3.5-flash-lite' ? '(Recommended)' : ''}
                      </option>
                    ))}
                  </select>
                  {modelFetchMsg && (
                    <span className="text-fine text-good">{modelFetchMsg}</span>
                  )}
                </div>
              </div>
            )}

            {/* Local Brain Card */}
            {provider === 'local' && (
              <div className="flex flex-col gap-2.5 p-3 rounded border border-accent bg-surface-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-small text-ink-strong">
                    <Cpu size={15} className="text-accent" />
                    <span>Plug &amp; Play PhysLab-Brain (Qwen Q4)</span>
                  </div>
                  <span className="text-fine text-good bg-surface-0 px-2 py-0.5 rounded-full border border-line">
                    Local Qwen Q4
                  </span>
                </div>

                <div className="text-fine text-ink-dim">
                  One-click connection to local Qwen 2.5 / PhysLab-Brain runners (llama.cpp, Ollama, LM Studio, or local GPU runner).
                </div>

                <button
                  type="button"
                  disabled={isAutoConnecting}
                  onClick={handleAutoConnectLocal}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded bg-accent text-on-accent text-small font-medium hover:bg-accent-2 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw size={13} className={isAutoConnecting ? 'animate-spin' : ''} />
                  <span>{isAutoConnecting ? 'Probing Local Endpoints…' : 'Auto-Connect Local Brain'}</span>
                </button>

                {autoConnectResult && (
                  <div
                    className={`p-2 rounded text-fine ${
                      autoConnectResult.ok
                        ? 'bg-surface-0 text-good border border-line'
                        : 'bg-surface-0 text-bad border border-line'
                    }`}
                  >
                    {autoConnectResult.message}
                  </div>
                )}

                {/* Expandable Advanced Endpoint Settings */}
                <details className="flex flex-col gap-2 p-2 rounded border border-line bg-surface-0 group mt-1">
                  <summary className="text-fine font-medium text-ink-dim cursor-pointer select-none">
                    Advanced Endpoint Settings
                  </summary>
                  <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-line">
                    <div className="flex flex-col gap-1">
                      <label className="text-fine font-medium text-ink-dim">Base URL</label>
                      <input
                        type="text"
                        value={localEndpoint}
                        onChange={(e) => useAiStore.getState().setLocalEndpoint(e.target.value)}
                        placeholder="http://127.0.0.1:8080/v1"
                        className="p-1.5 rounded bg-surface-1 border border-line text-body text-ink outline-none font-mono"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-fine font-medium text-ink-dim">Model Identifier</label>
                      <input
                        type="text"
                        value={localModel}
                        onChange={(e) => useAiStore.getState().setLocalModel(e.target.value)}
                        className="p-1.5 rounded bg-surface-1 border border-line text-small text-ink outline-none font-mono"
                      />
                    </div>
                  </div>
                </details>
              </div>
            )}

            {/* Auto Execute Toggle */}
            <label className="flex items-center gap-2 text-small text-ink-strong cursor-pointer p-2.5 rounded border border-line bg-surface-1">
              <input
                type="checkbox"
                checked={autoExecuteActions}
                onChange={(e) => useAiStore.getState().setAutoExecute(e.target.checked)}
              />
              <span>Auto-Execute PhysLab Actions (Sandbox / Calculator)</span>
            </label>

            {/* Test Connection Button */}
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                disabled={isVerifying}
                onClick={handleVerify}
                className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded bg-surface-2 border border-line text-small font-medium text-ink hover:bg-surface-3 transition-colors cursor-pointer"
              >
                <RefreshCw size={14} className={isVerifying ? 'animate-spin' : ''} />
                <span>{isVerifying ? 'Verifying…' : 'Verify Connection'}</span>
              </button>

              {verifyMsg && (
                <div
                  className={`p-2 rounded text-fine ${
                    verifyMsg.ok ? 'bg-surface-1 text-good border border-line' : 'bg-surface-1 text-bad border border-line'
                  }`}
                >
                  {verifyMsg.message}
                </div>
              )}
            </div>

            {/* Multi-Session Chat Threads */}
            <div className="flex flex-col gap-2 border-t border-line pt-3">
              <span className="font-semibold text-small text-ink-strong">Chat Sessions</span>
              <div className="flex flex-col gap-1">
                {threads.map((t) => (
                  <div
                    key={t.id}
                    className={`flex items-center justify-between p-2 rounded border cursor-pointer transition-colors ${
                      t.id === activeThreadId
                        ? 'border-accent bg-surface-2 text-ink-strong font-medium'
                        : 'border-line bg-surface-1 text-ink-dim hover:text-ink'
                    }`}
                    onClick={() => {
                      useAiStore.getState().switchThread(t.id)
                      setActiveTab('chat')
                    }}
                  >
                    <span className="text-small truncate max-w-[180px]">{t.title}</span>
                    {threads.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          useAiStore.getState().deleteThread(t.id)
                        }}
                        className="text-ink-faint hover:text-bad p-0.5 cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
