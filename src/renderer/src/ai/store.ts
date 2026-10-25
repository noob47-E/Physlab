import { create } from 'zustand'
import type {
  ChatMessage,
  ChatThread,
  MindMapData,
  ProviderType,
  StudentMemory,
  StudyGoal
} from './types'

const STORE_KEY = 'physlab.ai.v3'
const GEMINI_KEY_STORAGE = 'physlab.ai.gemini_key'

function loadPersistedState(): {
  threads: ChatThread[]
  activeThreadId: string
  memories: StudentMemory[]
  goals: StudyGoal[]
  provider: ProviderType
  geminiModel: string
  localEndpoint: string
  localModel: string
  autoExecuteActions: boolean
  availableGeminiModels: string[]
  availableLocalModels: string[]
} {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        const geminiModel =
          parsed.geminiModel && parsed.geminiModel !== 'gemini-2.5-flash'
            ? parsed.geminiModel
            : 'gemini-3.8-flash'
        return {
          threads: parsed.threads || [],
          activeThreadId: parsed.activeThreadId || '',
          memories: parsed.memories || [],
          goals: parsed.goals || [],
          provider: parsed.provider || 'gemini',
          geminiModel,
          localEndpoint: parsed.localEndpoint || 'http://127.0.0.1:8080/v1',
          localModel: parsed.localModel || 'PhysLab-Brain-Ultimatrix',
          autoExecuteActions: Boolean(parsed.autoExecuteActions),
          availableGeminiModels: parsed.availableGeminiModels || [
            'gemini-3.8-flash',
            'gemini-2.5-flash',
            'gemini-2.0-flash',
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
    geminiModel: 'gemini-3.8-flash',
    localEndpoint: 'http://127.0.0.1:8080/v1',
    localModel: 'PhysLab-Brain-Ultimatrix',
    autoExecuteActions: false,
    availableGeminiModels: [
      'gemini-3.8-flash',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-pro'
    ],
    availableLocalModels: ['PhysLab-Brain-Ultimatrix']
  }
}

interface AiStoreState {
  provider: ProviderType
  geminiApiKey: string
  geminiModel: string
  localEndpoint: string
  localModel: string
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
  setGeminiApiKey: (k: string) => void
  setGeminiModel: (m: string) => void
  setLocalEndpoint: (e: string) => void
  setLocalModel: (m: string) => void
  setAutoExecute: (b: boolean) => void
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
const initialGeminiKey = typeof localStorage !== 'undefined' ? localStorage.getItem(GEMINI_KEY_STORAGE) || '' : ''

export const useAiStore = create<AiStoreState>((set) => ({
  provider: initial.provider,
  geminiApiKey: initialGeminiKey,
  geminiModel: initial.geminiModel,
  localEndpoint: initial.localEndpoint,
  localModel: initial.localModel,
  autoExecuteActions: initial.autoExecuteActions,
  availableGeminiModels: initial.availableGeminiModels,
  availableLocalModels: initial.availableLocalModels,

  threads: initial.threads,
  activeThreadId: initial.activeThreadId || initial.threads[0]?.id || '',
  isStreaming: false,
  streamError: null,

  memories: initial.memories,
  goals: initial.goals,
  activeMindMap: null,

  setProvider: (provider) => set({ provider }),
  setGeminiApiKey: (key) => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(GEMINI_KEY_STORAGE, key)
      }
    } catch {
      // Ignore error
    }
    set({ geminiApiKey: key })
  },
  setGeminiModel: (geminiModel) => set({ geminiModel }),
  setLocalEndpoint: (localEndpoint) => set({ localEndpoint }),
  setLocalModel: (localModel) => set({ localModel }),
  setAutoExecute: (autoExecuteActions) => set({ autoExecuteActions }),
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
      const nextActive = remaining[0]?.id || ''
      return {
        threads: remaining.length > 0 ? remaining : [
          {
            id: `thread_${Date.now()}`,
            title: 'New Session',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: []
          }
        ],
        activeThreadId: nextActive || (remaining[0]?.id ?? '')
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
          // If first user message, rename thread intelligently
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

  incrementGoal: (idOrTitle, inc = 1, note = '') =>
    set((s) => {
      const norm = idOrTitle.trim().toLowerCase()
      const exists = s.goals.some((g) => g.id === idOrTitle || g.title.trim().toLowerCase() === norm)
      if (!exists) {
        return {
          goals: [
            ...s.goals,
            {
              id: `goal_${Date.now()}`,
              title: note || idOrTitle.replace(/_/g, ' '),
              target: 3,
              current: Math.max(1, inc),
              completed: inc >= 3
            }
          ]
        }
      }
      return {
        goals: s.goals.map((g) => {
          if (g.id === idOrTitle || g.title.trim().toLowerCase() === norm) {
            const next = g.current + inc
            return {
              ...g,
              current: next,
              completed: next >= g.target
            }
          }
          return g
        })
      }
    }),

  decrementGoal: (id, dec = 1) =>
    set((s) => ({
      goals: s.goals.map((g) => {
        if (g.id === id) {
          const next = Math.max(0, g.current - dec)
          return {
            ...g,
            current: next,
            completed: next >= g.target
          }
        }
        return g
      })
    })),

  toggleGoal: (id) =>
    set((s) => ({
      goals: s.goals.map((g) => {
        if (g.id === id) {
          const nextCompleted = !g.completed
          return {
            ...g,
            completed: nextCompleted,
            current: nextCompleted ? Math.max(g.current, g.target) : Math.min(g.current, g.target - 1)
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

// Auto-persist state changes
useAiStore.subscribe((s) => {
  try {
    if (typeof localStorage !== 'undefined') {
      const toSave = {
        threads: s.threads.slice(0, 30),
        activeThreadId: s.activeThreadId,
        memories: s.memories,
        goals: s.goals,
        provider: s.provider,
        geminiModel: s.geminiModel,
        localEndpoint: s.localEndpoint,
        localModel: s.localModel,
        autoExecuteActions: s.autoExecuteActions,
        availableGeminiModels: s.availableGeminiModels,
        availableLocalModels: s.availableLocalModels
      }
      localStorage.setItem(STORE_KEY, JSON.stringify(toSave))
    }
  } catch {
    // Ignore error
  }
})
