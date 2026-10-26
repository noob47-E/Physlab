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
  Folder,
  FolderOpen,
  Play
} from 'lucide-react'
import { useAiStore } from '../ai/store'
import {
  abortActiveStream,
  autoConnectLocalBrain,
  fetchAvailableModels,
  streamChatCompletion,
  testAiConnection
} from '../ai/client'
import { executePhysLabAction, extractThinkTrace, getBrainStageText } from '../ai/bridge'
import { stripIncompleteActionBlocks } from '../ai/contract'
import { verifyMessage } from '../ai/truthCheck'
import { MarkdownView } from './ai/MarkdownView'
import { MindMapView } from './ai/MindMapView'
import { hidePanel } from '../app/panels'
import type { Attachment, MindMapNode } from '../ai/types'

type TabId = 'chat' | 'mindmap' | 'goals' | 'settings'

if (typeof window !== 'undefined') {
  ;(window as unknown as { aiStore?: typeof useAiStore }).aiStore = useAiStore
}

export function AiCopilot() {
  const [activeTab, setActiveTab] = useState<TabId>('chat')
  const [inputPrompt, setInputPrompt] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
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

  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Store bindings
  const provider = useAiStore((s) => s.provider)
  const geminiApiKey = useAiStore((s) => s.geminiApiKey)
  const geminiModel = useAiStore((s) => s.geminiModel)
  const localEndpoint = useAiStore((s) => s.localEndpoint)
  const localModel = useAiStore((s) => s.localModel)
  const autoExecuteActions = useAiStore((s) => s.autoExecuteActions)
  const availableGeminiModels = useAiStore((s) => s.availableGeminiModels)

  const threads = useAiStore((s) => s.threads)
  const activeThreadId = useAiStore((s) => s.activeThreadId)
  const isStreaming = useAiStore((s) => s.isStreaming)
  const streamError = useAiStore((s) => s.streamError)

  const memories = useAiStore((s) => s.memories)
  const goals = useAiStore((s) => s.goals)
  const activeMindMap = useAiStore((s) => s.activeMindMap)

  const currentThread = threads.find((t) => t.id === activeThreadId) || threads[0]
  const messages = useMemo(() => currentThread?.messages || [], [currentThread?.messages])

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
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
  const handleSend = async (textToSend?: string) => {
    const prompt = (textToSend ?? inputPrompt).trim()
    if ((!prompt && attachments.length === 0) || isStreaming) return

    // 1. Add user message
    const userMsg = useAiStore.getState().addMessage({
      role: 'user',
      content: prompt,
      attachments
    })

    setInputPrompt('')
    const pendingAtts = attachments
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
        onDone: async ({ content, think, actions, agentTraces }) => {
          const verification = await verifyMessage(content, actions)
          useAiStore.getState().updateMessage(botMsg.id, {
            content,
            think,
            actions,
            agentTraces,
            verification,
            verified: verification.state === 'verified'
          })
          useAiStore.getState().setStreaming(false)

          // Auto-execute if enabled and engine did not disagree
          const { autoExecuteActions } = useAiStore.getState()
          if (autoExecuteActions && verification.state !== 'disagrees') {
            for (const act of actions) {
              void executePhysLabAction(act)
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

  // Built-in Local Engine State & Handlers
  const [localModels, setLocalModels] = useState<
    Array<{ filename: string; fullPath: string; sizeFormatted: string }>
  >([])
  const [selectedModelPath, setSelectedModelPath] = useState<string>('')
  const [modelsDir, setModelsDir] = useState<string>('')
  const [isServerRunning, setIsServerRunning] = useState(false)
  const [isStartingServer, setIsStartingServer] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const refreshLocalModels = useCallback(
    async (dir?: string) => {
      if (!window.physlab?.aiListModels) return
      try {
        const status = await window.physlab.aiGetStatus()
        const targetDir = dir || modelsDir || status.defaultDir
        setModelsDir(targetDir)
        setIsServerRunning(status.running)
        if (status.modelPath) setSelectedModelPath(status.modelPath)

        const models = await window.physlab.aiListModels(targetDir)
        setLocalModels(models)
        if (models.length > 0 && !selectedModelPath) {
          setSelectedModelPath(models[0].fullPath)
        }
      } catch {
        // ignore in non-electron environment
      }
    },
    [modelsDir, selectedModelPath]
  )

  useEffect(() => {
    let active = true
    if (provider === 'local' && window.physlab?.aiGetStatus) {
      window.physlab.aiGetStatus().then((status) => {
        if (!active) return
        const targetDir = modelsDir || status.defaultDir
        setModelsDir(targetDir)
        setIsServerRunning(status.running)
        if (status.modelPath) setSelectedModelPath(status.modelPath)
        window.physlab?.aiListModels?.(targetDir).then((models) => {
          if (!active) return
          setLocalModels(models)
          if (models.length > 0 && !selectedModelPath) {
            setSelectedModelPath(models[0].fullPath)
          }
        })
      })
    }
    return () => {
      active = false
    }
  }, [provider, modelsDir, selectedModelPath])

  const handleStartLocalAi = async () => {
    if (!selectedModelPath || !window.physlab?.aiStartServer) return
    setIsStartingServer(true)
    setServerError(null)
    try {
      const res = await window.physlab.aiStartServer(selectedModelPath, 8080)
      if (res.success) {
        setIsServerRunning(true)
        useAiStore.getState().setLocalEndpoint(`http://127.0.0.1:${res.port}/v1`)
        const fname = selectedModelPath.split(/[\\/]/).pop() || 'local-gguf'
        useAiStore.getState().setLocalModel(fname)
        setVerifyMsg({ ok: true, message: `GPU Engine started with ${fname} on port ${res.port}` })
      } else {
        setServerError(res.error || 'Failed to start local AI engine')
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsStartingServer(false)
    }
  }

  const handleStopLocalAi = async () => {
    if (!window.physlab?.aiStopServer) return
    await window.physlab.aiStopServer()
    setIsServerRunning(false)
    setVerifyMsg(null)
  }

  const handleOpenFolder = async () => {
    if (window.physlab?.aiOpenFolder) {
      await window.physlab.aiOpenFolder(modelsDir)
    }
  }

  const handleSelectFolder = async () => {
    if (window.physlab?.aiSelectFolder) {
      const picked = await window.physlab.aiSelectFolder()
      if (picked) {
        setModelsDir(picked)
        await refreshLocalModels(picked)
      }
    }
  }

  return (
    <div className="flex flex-col h-full bg-surface-0 text-ink select-none overflow-hidden font-ui">
      {/* 1. Header & Navigation Tabs (Minimal & Calm) */}
      <div className="flex flex-col border-b border-line bg-surface-1">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <Brain size={18} className="text-accent" />
            <span className="font-semibold text-small text-ink-strong">AI Tutor</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              title="New Chat"
              onClick={() => {
                useAiStore.getState().createThread()
                setActiveTab('chat')
              }}
              className="p-1 rounded text-ink-dim hover:text-ink hover:bg-surface-2 cursor-pointer transition-colors"
            >
              <Plus size={16} />
            </button>
            <button
              type="button"
              title="Settings"
              onClick={() => setActiveTab(activeTab === 'settings' ? 'chat' : 'settings')}
              className={`p-1 rounded cursor-pointer transition-colors ${
                activeTab === 'settings'
                  ? 'text-accent bg-surface-2'
                  : 'text-ink-dim hover:text-ink hover:bg-surface-2'
              }`}
            >
              <Settings2 size={16} />
            </button>
            <button
              type="button"
              title="Close AI Tutor"
              onClick={() => hidePanel('ai_copilot')}
              className="p-1 rounded text-ink-dim hover:text-bad hover:bg-surface-2 cursor-pointer transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 4 Clean Tabs */}
        <div className="flex items-center px-2 gap-1 border-t border-line text-fine">
          <TabButton
            active={activeTab === 'chat'}
            icon={<MessageSquare size={13} />}
            label="Chat"
            onClick={() => setActiveTab('chat')}
          />
          <TabButton
            active={activeTab === 'mindmap'}
            icon={<Network size={13} />}
            label="Mind Map"
            onClick={() => setActiveTab('mindmap')}
          />
          <TabButton
            active={activeTab === 'goals'}
            icon={<Target size={13} />}
            label="Goals"
            onClick={() => setActiveTab('goals')}
          />
          <TabButton
            active={activeTab === 'settings'}
            icon={<Settings2 size={13} />}
            label="Settings"
            onClick={() => setActiveTab('settings')}
          />
        </div>
      </div>

      {/* 2. Main Tab Content */}
      <div className="flex-1 overflow-hidden relative">
        {/* TAB 1: CHAT */}
        {activeTab === 'chat' && (
          <div className="flex flex-col h-full">
            {/* Missing Key Notification in Chat */}
            {provider === 'gemini' && !geminiApiKey.trim() && (
              <div className="m-3 p-3 rounded-lg border border-line bg-surface-1 flex items-center justify-between gap-3 text-small">
                <div className="flex items-center gap-2 text-ink-dim">
                  <Sparkles size={16} className="text-accent shrink-0" />
                  <span>Please paste your Google Gemini API key to start chatting.</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('settings')}
                  className="flex items-center gap-1.5 px-3 py-1 rounded bg-accent text-on-accent text-fine font-medium hover:bg-accent-2 cursor-pointer shrink-0"
                >
                  <Settings2 size={13} />
                  <span>Open Settings</span>
                </button>
              </div>
            )}

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 select-text">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center text-ink-dim gap-3 my-auto">
                  <div className="w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center">
                    <Sparkles size={20} className="text-accent" />
                  </div>
                  <div className="flex flex-col gap-1 max-w-xs">
                    <span className="font-semibold text-body text-ink">PhysLab-Brain Ultimatrix</span>
                    <span className="text-small text-ink-faint">
                      Ask physics or math questions, drop photos of diagrams, or run an Ultimatrix test:
                    </span>
                  </div>

                  {/* Quick-Prompt Chips */}
                  <div className="flex flex-col gap-1.5 w-full max-w-xs mt-2">
                    <QuickChip
                      title="Test Quotient Cancellation Derivative"
                      subtitle="Tests hidden (sqrt(x)-b) factor cancellation & 3-way check"
                      onClick={() =>
                        runQuickTest(
                          'Differentiate f(x) = (sqrt(x+a)*(x^(3/2) - b^3))/(sqrt(x) - b). Factor and cancel all hidden algebraic terms first!'
                        )
                      }
                    />
                    <QuickChip
                      title="Test 28° Incline Static Friction Trap"
                      subtitle="Checks static threshold mu_s=0.6 vs kinetic sliding in 3D Sandbox"
                      onClick={() =>
                        runQuickTest(
                          'A 2 kg crate rests on a 28° incline with static friction mu_s = 0.6 and kinetic friction mu_k = 0.4. Does it slide? Check the static friction threshold, derive acceleration, and build the 3D sandbox experiment!'
                        )
                      }
                    />
                    <QuickChip
                      title="Build Calculus & Mechanics Mind Map"
                      subtitle="Generates Obsidian concept graph connecting rules & traps"
                      onClick={() =>
                        runQuickTest(
                          'Build an interactive Obsidian-style concept mind map connecting Incline Mechanics, Static Friction Trap, Kinetic Sliding, and Quotient Rule Cancellations.'
                        )
                      }
                    />
                    <QuickChip
                      title="Plot 3D Ripple Surface"
                      subtitle="3D Graphing mode: radial waves & ripple surface"
                      onClick={() =>
                        runQuickTest(
                          'Plot a beautiful 3D ripple surface z = sin(sqrt(x^2 + y^2)) in 3D Graphing mode and explain how radial waves work.'
                        )
                      }
                    />
                  </div>
                </div>
              ) : (
                messages.map((m, idx) => {
                  const isLastAssistantMessage = m.role === 'assistant' && idx === messages.length - 1
                  const isCurrentlyStreaming = isStreaming && isLastAssistantMessage

                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col gap-1 ${
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
                              className="max-h-28 rounded border border-line object-contain bg-surface-1"
                            />
                          ))}
                        </div>
                      )}

                      <div
                        className={`max-w-[95%] rounded-lg p-2.5 ${
                          m.role === 'user'
                            ? 'bg-accent text-on-accent text-body'
                            : 'bg-surface-1 border border-line text-ink w-full'
                        }`}
                      >
                        {m.role === 'user' ? (
                          <div className="whitespace-pre-wrap">{m.content}</div>
                        ) : (
                          <>
                            {/* Live Brain Stage Indicator during streaming */}
                            {isCurrentlyStreaming && (
                              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-surface-2 border border-line text-fine text-accent font-medium mb-2">
                                <Sparkles size={13} className="text-accent animate-pulse shrink-0" />
                                <span>{getBrainStageText(m.content, true)}</span>
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
                                      'Analyzing problem and coordinating special agents…'}
                                  </div>
                                )
                              }

                              return (
                                <MarkdownView
                                  content={
                                    isCurrentlyStreaming
                                      ? stripIncompleteActionBlocks(
                                          streamingTrace?.cleanContent || m.content
                                        )
                                      : m.content
                                  }
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
                              )
                            })()}
                          </>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
              {streamError && (
                <div className="p-2 rounded bg-surface-1 border border-line text-bad text-fine">
                  {streamError}
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
                      className="h-14 w-14 object-cover rounded border border-line"
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

            {/* Input Bar */}
            <div className="p-2.5 border-t border-line bg-surface-1 flex flex-col gap-1.5">
              <div className="flex items-end gap-1.5 bg-surface-0 border border-line rounded-md p-1.5 focus-within:border-line-2">
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
                  className="p-1.5 text-ink-dim hover:text-ink hover:bg-surface-2 rounded cursor-pointer transition-colors"
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
                      handleSend()
                    }
                  }}
                  rows={2}
                  placeholder="Ask a question or paste a diagram photo (Ctrl+V)…"
                  className="flex-1 bg-transparent border-none outline-none resize-none text-body text-ink placeholder:text-ink-faint px-1"
                />

                {isStreaming ? (
                  <button
                    type="button"
                    onClick={abortActiveStream}
                    title="Stop generation"
                    className="p-1.5 bg-bad text-on-accent rounded hover:opacity-90 cursor-pointer transition-opacity"
                  >
                    <Square size={15} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!inputPrompt.trim() && attachments.length === 0}
                    onClick={() => handleSend()}
                    className="p-1.5 bg-accent text-on-accent rounded hover:bg-accent-2 disabled:opacity-40 cursor-pointer transition-colors"
                  >
                    <Send size={15} />
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
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => useAiStore.getState().setProvider('gemini')}
                  className={`p-2 rounded border text-left cursor-pointer transition-colors ${
                    provider === 'gemini'
                      ? 'border-accent bg-surface-2'
                      : 'border-line bg-surface-1 text-ink-dim'
                  }`}
                >
                  <div className="font-semibold text-small text-ink-strong">Google Gemini API</div>
                  <div className="text-fine text-ink-faint">Direct cloud testing (Vision + Flash)</div>
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
                  <div className="font-semibold text-small text-ink-strong">Local GGUF / Ollama</div>
                  <div className="text-fine text-ink-faint">Custom Ultimatrix fine-tune</div>
                </button>
              </div>
            </div>

            {/* Google Gemini Card */}
            <div className={`flex flex-col gap-2.5 p-3 rounded border transition-colors ${
              provider === 'gemini' ? 'border-accent bg-surface-1' : 'border-line bg-surface-1'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-small text-ink-strong">
                  <Sparkles size={15} className="text-accent" />
                  <span>Google Gemini API</span>
                </div>
                {provider === 'gemini' ? (
                  <span className="text-fine text-good bg-surface-0 px-2 py-0.5 rounded-full border border-line">
                    Active Provider
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => useAiStore.getState().setProvider('gemini')}
                    className="text-fine text-accent hover:underline cursor-pointer"
                  >
                    Set Active
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-fine font-medium text-ink-dim">Google AI Studio API Key</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type={showKeyText ? 'text' : 'password'}
                    value={geminiApiKey}
                    onChange={(e) => useAiStore.getState().setGeminiApiKey(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    placeholder="AIzaSy..."
                    className="flex-1 p-1.5 rounded bg-surface-0 border border-line text-body text-ink outline-none focus:border-line-2 font-mono"
                  />
                  <button
                    type="button"
                    title="Show / Hide API Key"
                    onClick={() => setShowKeyText((v) => !v)}
                    className="p-1.5 rounded bg-surface-0 border border-line text-ink-dim hover:text-ink cursor-pointer"
                  >
                    {showKeyText ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button
                    type="button"
                    title="Paste API Key from Clipboard"
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
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-accent text-on-accent text-fine font-medium hover:bg-accent-2 cursor-pointer"
                  >
                    <ClipboardPaste size={13} />
                    <span>Paste</span>
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
                      {m} {m === 'gemini-2.5-flash' ? '(Recommended)' : ''}
                    </option>
                  ))}
                </select>
                {modelFetchMsg && (
                  <span className="text-fine text-good">{modelFetchMsg}</span>
                )}
              </div>
            </div>

            {/* Local Brain Card */}
            <div className="flex flex-col gap-3">
                {/* Plug & Play PhysLab-Brain (Qwen Q4) Card */}
                <div className="flex flex-col gap-2.5 p-3 rounded border border-line bg-surface-1">
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

                {/* Built-in GPU Runner Section */}
                <div className="flex flex-col gap-2.5 p-3 rounded border border-line bg-surface-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-semibold text-small text-ink-strong">
                      <Cpu size={15} className="text-accent" />
                      <span>Built-in GPU Model Runner</span>
                    </div>
                    {isServerRunning ? (
                      <span className="flex items-center gap-1 text-fine font-medium text-good bg-surface-0 px-2 py-0.5 rounded-full border border-line">
                        <span className="w-1.5 h-1.5 rounded-full bg-good animate-pulse" />
                        RTX 3060 Active
                      </span>
                    ) : (
                      <span className="text-fine text-ink-faint">Engine Stopped</span>
                    )}
                  </div>

                  {/* Folder Selector */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <label className="text-fine font-medium text-ink-dim">Specific Models Folder</label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleOpenFolder}
                          className="flex items-center gap-1 text-fine text-accent hover:underline cursor-pointer"
                          title="Open folder in File Explorer"
                        >
                          <FolderOpen size={12} />
                          <span>Open Folder</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleSelectFolder}
                          className="flex items-center gap-1 text-fine text-ink-dim hover:text-ink cursor-pointer"
                          title="Change models folder"
                        >
                          <Folder size={12} />
                          <span>Change</span>
                        </button>
                      </div>
                    </div>
                    <div className="px-2 py-1.5 rounded bg-surface-0 border border-line text-fine font-mono text-ink-dim truncate select-all">
                      {modelsDir || 'C:\\Users\\noob47\\PhysLab\\models'}
                    </div>
                  </div>

                  {/* Models List / Picker */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <label className="text-fine font-medium text-ink-dim">Detected .gguf Model</label>
                      <button
                        type="button"
                        onClick={() => refreshLocalModels(modelsDir)}
                        className="flex items-center gap-1 text-fine text-accent hover:underline cursor-pointer"
                        title="Rescan folder for .gguf files"
                      >
                        <RefreshCw size={11} />
                        <span>Rescan</span>
                      </button>
                    </div>

                    {localModels.length > 0 ? (
                      <select
                        value={selectedModelPath}
                        onChange={(e) => setSelectedModelPath(e.target.value)}
                        disabled={isServerRunning}
                        className="p-1.5 rounded bg-surface-0 border border-line text-small text-ink outline-none disabled:opacity-60 font-mono"
                      >
                        {localModels.map((m) => (
                          <option key={m.fullPath} value={m.fullPath}>
                            {m.filename} ({m.sizeFormatted})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="p-3 rounded border border-line bg-surface-0 text-center text-fine text-ink-faint">
                        No .gguf models found in this folder.
                        <br />
                        Click <strong>Open Folder</strong> and place your <code>.gguf</code> model into it.
                      </div>
                    )}
                  </div>

                  {/* Server Error Notice */}
                  {serverError && (
                    <div className="p-2 rounded bg-surface-0 border border-line text-bad text-fine">
                      {serverError}
                    </div>
                  )}

                  {/* One-Click Engine Start / Stop */}
                  <div className="flex items-center gap-2 pt-1">
                    {isServerRunning ? (
                      <>
                        <button
                          type="button"
                          onClick={handleStopLocalAi}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded bg-surface-2 text-ink hover:bg-surface-3 border border-line text-small font-medium cursor-pointer transition-colors"
                        >
                          <Square size={13} fill="currentColor" />
                          <span>Stop AI Engine</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab('chat')}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded bg-accent text-on-accent text-small font-medium hover:bg-accent-2 cursor-pointer transition-colors"
                        >
                          <MessageSquare size={14} />
                          <span>Chat Now</span>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={localModels.length === 0 || isStartingServer}
                        onClick={handleStartLocalAi}
                        className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded bg-accent text-on-accent text-small font-medium hover:bg-accent-2 disabled:opacity-50 cursor-pointer transition-colors"
                      >
                        {isStartingServer ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            <span>Starting RTX 3060 Engine…</span>
                          </>
                        ) : (
                          <>
                            <Play size={14} fill="currentColor" />
                            <span>Start Local AI (RTX 3060)</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>

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
  )
}

function TabButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 py-1 px-2 border-b-2 font-medium cursor-pointer transition-colors ${
        active
          ? 'border-accent text-accent'
          : 'border-transparent text-ink-dim hover:text-ink'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function QuickChip({
  title,
  subtitle,
  onClick
}: {
  title: string
  subtitle: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="p-2 rounded border border-line bg-surface-1 hover:bg-surface-2 text-left cursor-pointer transition-colors flex flex-col gap-0.5"
    >
      <span className="font-medium text-small text-ink-strong">{title}</span>
      <span className="text-fine text-ink-faint">{subtitle}</span>
    </button>
  )
}
