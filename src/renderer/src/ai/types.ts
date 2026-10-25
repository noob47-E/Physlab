import type { PhysicsValidationResult } from './truthCheck'

export type ProviderType = 'gemini' | 'local'

export interface Attachment {
  id: string
  mimeType: string
  dataUrl: string // base64
  name?: string
}

export type SpecialAgent =
  | 'OCR_VISION'
  | 'PLANNER_MINDMAP'
  | 'MATH_AUDITOR'
  | 'PHYSICS_SANDBOX'
  | 'HUMAN_TEACHER'

export type PhysLabTool =
  | 'calc_solve'
  | 'sandbox_experiment'
  | 'graph3d_plot'
  | 'graph_plot'
  | 'mindmap_build'
  | 'goal_update'
  | 'quiz_challenge'
  | 'app_guide'
  | 'run_commands'

export interface PhysLabAction {
  id: string
  tool: PhysLabTool
  args: Record<string, unknown>
  executed?: boolean
  status?: 'pending' | 'success' | 'failed'
  result?: unknown
  verified?: boolean
  verificationDetails?: {
    domainCheck: boolean
    factorCheck: boolean
    numericCheck: boolean
    notes?: string
    physicsValidation?: PhysicsValidationResult
  }
}

export type VerificationState = 'verified' | 'disagrees' | 'unverified'

export interface MessageVerification {
  state: VerificationState
  badgeText: string
  engineAnswerLatex?: string
  engineAnswerText?: string
  modelAnswerLatex?: string
  notes: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  think?: string
  agentTraces?: {
    agent: SpecialAgent
    summary: string
  }[]
  attachments?: Attachment[]
  actions?: PhysLabAction[]
  verified?: boolean
  verification?: MessageVerification
  createdAt: number
}

export interface ChatThread {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
}

export interface StudentMemory {
  id: string
  topic: string
  weakness?: string
  strength?: string
  note: string
  updatedAt: number
}

export interface StudyGoal {
  id: string
  title: string
  target: number
  current: number
  completed: boolean
}

export interface MindMapNode {
  id: string
  label: string
  category: 'physics' | 'math' | 'concept' | 'trap'
  summary?: string
  formula?: string
  x?: number
  y?: number
}

export interface MindMapEdge {
  source: string
  target: string
  label?: string
}

export interface MindMapData {
  nodes: MindMapNode[]
  edges: MindMapEdge[]
}
