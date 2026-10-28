import { create } from 'zustand'
import type {
  ChatMessage,
  ChatThread,
  MindMapData,
  ProviderType,
  StudentMemory,
  StudyGoal
} from './types'

const STORE_KEY = 'physlab.ai.v5'
const GEMINI_KEY_STORAGE = 'physlab.ai.gemini_key'

function cleanPersistedText(text: string): string {
  if (!text) return ''
  return text
    .replace(/^#{1,4}\s*(?:💡\s*)?Intuition\s*Hook[^\n]*\n?/gim, '')
    .replace(/^\*\*💡?\s*Intuition\s*Hook[^*]*\*\*\s*:?\s*/gim, '')
    .trim()
}

function loadPersistedState(): {
  threads: ChatThread[]
  activeThreadId: string
  memories: StudentMemory[]
  goals: StudyGoal[]
  provider: ProviderType
  mainProvider: string
  fallbackProvider: string | null
  providerModels: Record<string, string>
  providerBaseUrls: Record<string, string>
  availableProviderModels: Record<string, string[]>
  geminiModel: string
  azureDeployment: string
  localEndpoint: string
  localModel: string
  thinking: 'fast' | 'balanced' | 'deep'
  autoExecuteActions: boolean
  availableGeminiModels: string[]
  availableLocalModels: string[]
} {
  try {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('physlab.ai.v3')
        localStorage.removeItem('physlab.ai.v4')
      } catch {
        // ignore
      }
      const raw = localStorage.getItem(STORE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        let geminiModel = parsed.geminiModel || 'gemini-3.5-flash-lite'
        if (geminiModel === 'gemini-3.8-flash') {
          geminiModel = 'gemini-3.5-flash-lite'
        }
        const savedGeminiModels: string[] = Array.isArray(parsed.availableGeminiModels)
          ? parsed.availableGeminiModels.filter((m: string) => m !== 'gemini-3.8-flash')
          : []
        const sanitizedThreads = (parsed.threads || []).map((t: ChatThread) => ({
          ...t,
          messages: (t.messages || []).map((m: ChatMessage) => ({
            ...m,
            content: cleanPersistedText(m.content)
          }))
        }))
        const provider = parsed.provider || (parsed.mainProvider || 'gemini')
        return {
          threads: sanitizedThreads,
          activeThreadId: parsed.activeThreadId || '',
          memories: parsed.memories || [],
          goals: parsed.goals || [],
          provider,
          mainProvider: parsed.mainProvider || provider,
          fallbackProvider: parsed.fallbackProvider || null,
          providerModels: parsed.providerModels || {},
          providerBaseUrls: parsed.providerBaseUrls || {},
          availableProviderModels: parsed.availableProviderModels || {},
          geminiModel,
          azureDeployment: parsed.azureDeployment || 'gpt-5.4',
          localEndpoint: parsed.localEndpoint || 'http://127.0.0.1:8080/v1',
          localModel: parsed.localModel || 'PhysLab-Brain-Ultimatrix',
          thinking: parsed.thinking || 'fast',
          autoExecuteActions:
            typeof parsed.autoExecuteActions === 'boolean' ? parsed.autoExecuteActions : true,
          availableGeminiModels: savedGeminiModels.length > 0 ? savedGeminiModels : [
            'gemini-3.5-flash-lite',
            'gemini-3.5-flash',
            'gemini-2.5-flash',
            'gemini-2.0-flash',
            'gemini-1.5-flash',
            'gemini-1.5-pro'
          ],
          availableLocalModels: parsed.availableLocalModels || ['PhysLab-Brain-Ultimatrix']
        }
      }
    }
  } catch {
    // Ignore error
  }

  const initialThreadId = `thread_${Date.now()}`
  return {
    threads: [
      {
        id: initialThreadId,
        title: 'New Session',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: []
      }
    ],
    activeThreadId: initialThreadId,
    memories: [],
    goals: [],
    provider: 'gemini',
    mainProvider: 'gemini',
    fallbackProvider: null,
    providerModels: {},
    providerBaseUrls: {},
    availableProviderModels: {},
    geminiModel: 'gemini-3.5-flash-lite',
    azureDeployment: 'gpt-5.4',
    localEndpoint: 'http://127.0.0.1:8080/v1',
    localModel: 'PhysLab-Brain-Ultimatrix',
    thinking: 'fast',
    autoExecuteActions: true,
    availableGeminiModels: [
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-1.5-pro'
    ],
    availableLocalModels: ['PhysLab-Brain-Ultimatrix']
  }
}

export interface PresetSummary {
  id: string
  label: string
  kind: 'openai-compatible' | 'azure' | 'anthropic'
  baseUrl: string
  model: string
  suggestedModels: string[]
  docUrl: string
  supportsTools: boolean
  enabledByDefault: boolean
  requiresKey: boolean
  hasKey: boolean
  note?: string
}

interface AiStoreState {
  provider: ProviderType
  mainProvider: string
  fallbackProvider: string | null
  providerModels: Record<string, string>
  providerBaseUrls: Record<string, string>
  availableProviderModels: Record<string, string[]>
  presets: PresetSummary[]

  geminiApiKey: string
  geminiModel: string
  azureDeployment: string
  localEndpoint: string
  localModel: string
  thinking: 'fast' | 'balanced' | 'deep'
  autoExecuteActions: boolean
  availableGeminiModels: string[]
  availableLocalModels: string[]

  threads: ChatThread[]
  activeThreadId: string
  isStreaming: boolean
  streamError: string | null

  memories: StudentMemory[]
  goals: StudyGoal[]
  activeMindMap: MindMapData | null

  setProvider: (p: ProviderType) => void
  setMainProvider: (p: string) => void
  setFallbackProvider: (p: string | null) => void
  setProviderModel: (p: string, m: string) => void
  setProviderBaseUrl: (p: string, url: string) => void
  setAvailableProviderModels: (p: string, models: string[]) => void
  setPresets: (presets: PresetSummary[]) => void
  refreshConfig: () => Promise<void>

  setGeminiApiKey: (k: string) => void
  setGeminiModel: (m: string) => void
  setAzureDeployment: (d: string) => void
  setLocalEndpoint: (e: string) => void
  setLocalModel: (m: string) => void
  setAutoExecute: (b: boolean) => void
  setThinking: (thinking: 'fast' | 'balanced' | 'deep') => void
  setAvailableGeminiModels: (models: string[]) => void
  setAvailableLocalModels: (models: string[]) => void

  createThread: () => string
  switchThread: (id: string) => void
  renameThread: (id: string, title: string) => void
  deleteThread: (id: string) => void

  addMessage: (msg: Omit<ChatMessage, 'id' | 'createdAt'>) => ChatMessage
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void
  setStreaming: (isStreaming: boolean, error?: string | null) => void

  addMemory: (mem: Omit<StudentMemory, 'id' | 'updatedAt'>) => void
  deleteMemory: (id: string) => void

  addGoal: (goal: Omit<StudyGoal, 'id' | 'completed'>) => void
  incrementGoal: (id: string, inc?: number, note?: string) => void
  decrementGoal: (id: string, dec?: number) => void
  toggleGoal: (id: string) => void
  deleteGoal: (id: string) => void

  setMindMap: (map: MindMapData) => void
}

const initial = loadPersistedState()
const initialGeminiKey =
  typeof localStorage !== 'undefined' ? localStorage.getItem(GEMINI_KEY_STORAGE) || '' : ''

export const useAiStore = create<AiStoreState>((set, get) => ({
  provider: initial.provider,
  mainProvider: initial.mainProvider,
  fallbackProvider: initial.fallbackProvider,
  providerModels: initial.providerModels,
  providerBaseUrls: initial.providerBaseUrls,
  availableProviderModels: initial.availableProviderModels,
  presets: [],

  geminiApiKey: initialGeminiKey,
  geminiModel: initial.geminiModel,
  azureDeployment: initial.azureDeployment || 'gpt-5.4',
  localEndpoint: initial.localEndpoint,
  localModel: initial.localModel,
  thinking: initial.thinking || 'fast',
  autoExecuteActions: initial.autoExecuteActions,
  availableGeminiModels: initial.availableGeminiModels,
  availableLocalModels: initial.availableLocalModels,

  threads: initial.threads,
  activeThreadId: initial.activeThreadId,
  isStreaming: false,
  streamError: null,

  memories: initial.memories,
  goals: initial.goals,
  activeMindMap: null,

  setProvider: (provider) => {
    set({ provider, mainProvider: provider })
    if (typeof window !== 'undefined' && window.physlab?.ai?.setActiveProviders) {
      void window.physlab.ai.setActiveProviders(provider, get().fallbackProvider || undefined)
    }
  },
  setMainProvider: (mainProvider) => {
    set({ mainProvider, provider: mainProvider })
    if (typeof window !== 'undefined' && window.physlab?.ai?.setActiveProviders) {
      void window.physlab.ai.setActiveProviders(mainProvider, get().fallbackProvider || undefined)
    }
  },
  setFallbackProvider: (fallbackProvider) => {
    set({ fallbackProvider })
    if (typeof window !== 'undefined' && window.physlab?.ai?.setActiveProviders) {
      void window.physlab.ai.setActiveProviders(get().mainProvider, fallbackProvider || undefined)
    }
  },
  setProviderModel: (p, model) => {
    set((s) => ({
      providerModels: { ...s.providerModels, [p]: model },
      ...(p === 'gemini' ? { geminiModel: model } : {}),
      ...(p === 'azure' ? { azureDeployment: model } : {}),
      ...(p === 'local' || p === 'ollama' || p === 'lmstudio' ? { localModel: model } : {})
    }))
    if (typeof window !== 'undefined' && window.physlab?.ai?.setProviderConfig) {
      void window.physlab.ai.setProviderConfig(p, { model })
    }
  },
  setProviderBaseUrl: (p, baseUrl) => {
    set((s) => ({
      providerBaseUrls: { ...s.providerBaseUrls, [p]: baseUrl },
      ...(p === 'local' || p === 'ollama' || p === 'lmstudio' ? { localEndpoint: baseUrl } : {})
    }))
    if (typeof window !== 'undefined' && window.physlab?.ai?.setProviderConfig) {
      void window.physlab.ai.setProviderConfig(p, { baseUrl })
    }
  },
  setAvailableProviderModels: (p, models) =>
    set((s) => ({
      availableProviderModels: { ...s.availableProviderModels, [p]: models }
    })),
  setPresets: (presets) => set({ presets }),
  refreshConfig: async () => {
    if (typeof window !== 'undefined' && window.physlab?.ai?.getConfig) {
      try {
        const cfg = await window.physlab.ai.getConfig()
        if (cfg) {
          set((s) => {
            const nextMain = cfg.mainProvider || (cfg.hasAzure ? 'azure' : s.mainProvider)
            return {
              presets: (cfg.presets as PresetSummary[]) || s.presets,
              mainProvider: nextMain,
              provider: nextMain,
              fallbackProvider: cfg.fallbackProvider ?? s.fallbackProvider,
              azureDeployment: cfg.azureDeployment || s.azureDeployment,
              thinking: cfg.thinking || s.thinking
            }
          })
        }
      } catch {
        // ignore
      }
    }
  },
  setGeminiApiKey: (geminiApiKey) => {
    try {
      if (typeof window !== 'undefined' && window.physlab?.ai?.setKey) {
        void window.physlab.ai.setKey(geminiApiKey)
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(GEMINI_KEY_STORAGE)
      }
    } catch {
      // Ignore
    }
    set({ geminiApiKey })
  },
  setGeminiModel: (geminiModel) => set({ geminiModel }),
  setAzureDeployment: (azureDeployment) => set({ azureDeployment }),
  setLocalEndpoint: (localEndpoint) => set({ localEndpoint }),
  setLocalModel: (localModel) => set({ localModel }),
  setAutoExecute: (autoExecuteActions) => set({ autoExecuteActions }),
  setThinking: (thinking) => {
    set({ thinking })
    if (typeof window !== 'undefined' && window.physlab?.ai?.setThinking) {
      void window.physlab.ai.setThinking(thinking)
    }
  },
  setAvailableGeminiModels: (availableGeminiModels) => set({ availableGeminiModels }),
  setAvailableLocalModels: (availableLocalModels) => set({ availableLocalModels }),

  createThread: () => {
    const newId = `thread_${Date.now()}`
    const newThread: ChatThread = {
      id: newId,
      title: 'New Session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: []
    }
    set((s) => ({
      threads: [newThread, ...s.threads],
      activeThreadId: newId,
      streamError: null
    }))
    return newId
  },

  switchThread: (id) => set({ activeThreadId: id, streamError: null }),

  renameThread: (id, title) =>
    set((s) => ({
      threads: s.threads.map((t) => (t.id === id ? { ...t, title, updatedAt: Date.now() } : t))
    })),

  deleteThread: (id) =>
    set((s) => {
      const remaining = s.threads.filter((t) => t.id !== id)
      if (remaining.length > 0) {
        const nextActive = s.activeThreadId === id ? remaining[0].id : s.activeThreadId
        return {
          threads: remaining,
          activeThreadId: nextActive
        }
      }
      const fallbackId = `thread_${Date.now()}`
      return {
        threads: [
          {
            id: fallbackId,
            title: 'New Session',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: []
          }
        ],
        activeThreadId: fallbackId
      }
    }),

  addMessage: (msg) => {
    const fullMsg: ChatMessage = {
      ...msg,
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now()
    }

    set((s) => {
      const activeId = s.activeThreadId
      const updatedThreads = s.threads.map((t) => {
        if (t.id === activeId) {
          let title = t.title
          if (t.messages.length === 0 && msg.role === 'user') {
            title = msg.content.slice(0, 32).trim() || 'Physics Question'
          }
          return {
            ...t,
            title,
            updatedAt: Date.now(),
            messages: [...t.messages, fullMsg]
          }
        }
        return t
      })
      return { threads: updatedThreads }
    })

    return fullMsg
  },

  updateMessage: (id, patch) =>
    set((s) => ({
      threads: s.threads.map((t) => {
        if (t.id === s.activeThreadId) {
          return {
            ...t,
            updatedAt: Date.now(),
            messages: t.messages.map((m) => (m.id === id ? { ...m, ...patch } : m))
          }
        }
        return t
      })
    })),

  setStreaming: (isStreaming, streamError = null) => set({ isStreaming, streamError }),

  addMemory: (mem) =>
    set((s) => ({
      memories: [
        {
          ...mem,
          id: `mem_${Date.now()}`,
          updatedAt: Date.now()
        },
        ...s.memories
      ]
    })),

  deleteMemory: (id) =>
    set((s) => ({
      memories: s.memories.filter((m) => m.id !== id)
    })),

  addGoal: (goal) =>
    set((s) => ({
      goals: [
        ...s.goals,
        {
          ...goal,
          id: `goal_${Date.now()}`,
          completed: goal.current >= goal.target
        }
      ]
    })),

  incrementGoal: (id, inc = 1, note) =>
    set((s) => ({
      goals: s.goals.map((g) => {
        if (g.id === id || g.title.toLowerCase() === id.toLowerCase()) {
          const nextVal = g.current + inc
          return {
            ...g,
            current: nextVal,
            completed: nextVal >= g.target
          }
        }
        return g
      }),
      memories: note
        ? [
            {
              id: `mem_goal_${Date.now()}`,
              topic: id,
              note,
              updatedAt: Date.now()
            },
            ...s.memories
          ]
        : s.memories
    })),

  decrementGoal: (id, dec = 1) =>
    set((s) => ({
      goals: s.goals.map((g) => {
        if (g.id === id || g.title.toLowerCase() === id.toLowerCase()) {
          const nextVal = Math.max(0, g.current - dec)
          return {
            ...g,
            current: nextVal,
            completed: nextVal >= g.target
          }
        }
        return g
      })
    })),

  toggleGoal: (id) =>
    set((s) => ({
      goals: s.goals.map((g) => {
        if (g.id === id || g.title.toLowerCase() === id.toLowerCase()) {
          const nextCompleted = !g.completed
          return {
            ...g,
            completed: nextCompleted,
            current: nextCompleted
              ? Math.max(g.current, g.target)
              : Math.min(g.current, g.target - 1)
          }
        }
        return g
      })
    })),

  deleteGoal: (id) =>
    set((s) => ({
      goals: s.goals.filter((g) => g.id !== id)
    })),

  setMindMap: (activeMindMap) => set({ activeMindMap })
}))

let persistTimer: ReturnType<typeof setTimeout> | null = null

function cleanThreadsForPersistence(threads: ChatThread[]): ChatThread[] {
  return threads.slice(0, 30).map((t) => ({
    ...t,
    messages: t.messages.map((m) => ({
      ...m,
      attachments: m.attachments?.map((att) => ({
        ...att,
        dataUrl: att.dataUrl.length > 2048 ? '' : att.dataUrl
      }))
    }))
  }))
}

// Auto-persist state changes debounced by 250ms
useAiStore.subscribe((s) => {
  if (typeof localStorage === 'undefined') return
  if (persistTimer) clearTimeout(persistTimer)

  persistTimer = setTimeout(() => {
    try {
      const toSave = {
        threads: cleanThreadsForPersistence(s.threads),
        activeThreadId: s.activeThreadId,
        memories: s.memories,
        goals: s.goals,
        provider: s.provider,
        mainProvider: s.mainProvider,
        fallbackProvider: s.fallbackProvider,
        providerModels: s.providerModels,
        providerBaseUrls: s.providerBaseUrls,
        availableProviderModels: s.availableProviderModels,
        geminiModel: s.geminiModel,
        azureDeployment: s.azureDeployment,
        localEndpoint: s.localEndpoint,
        localModel: s.localModel,
        autoExecuteActions: s.autoExecuteActions,
        availableGeminiModels: s.availableGeminiModels,
        availableLocalModels: s.availableLocalModels
      }
      localStorage.setItem(STORE_KEY, JSON.stringify(toSave))
    } catch {
      // Ignore quota errors
    }
  }, 250)
})

// Query config from main process to initialize presets and active provider
if (typeof window !== 'undefined' && window.physlab?.ai?.getConfig) {
  void useAiStore.getState().refreshConfig()
}
