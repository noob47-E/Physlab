export type ProviderKind = 'openai-compatible' | 'azure' | 'anthropic'

export interface AiProviderPreset {
  id: string
  label: string
  kind: ProviderKind
  baseUrl: string
  model: string
  suggestedModels: string[]
  docUrl: string
  apiVersion?: string
  extraHeaders?: Record<string, string>
  supportsTools: boolean
  enabledByDefault: boolean
  requiresKey: boolean
  note?: string
}

/**
 * Built-in AI Provider Presets.
 * Official doc URLs are documented beside each preset.
 */
export const AI_PROVIDER_PRESETS: readonly AiProviderPreset[] = [
  {
    // Google Gemini (OpenAI-compatible endpoint)
    // Official doc: https://ai.google.dev/gemini-api/docs/openai
    id: 'gemini',
    label: 'Google Gemini',
    kind: 'openai-compatible',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
    suggestedModels: [
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.5-pro',
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash'
    ],
    docUrl: 'https://ai.google.dev/gemini-api/docs/openai',
    supportsTools: true,
    enabledByDefault: true,
    requiresKey: true,
    note: 'Fast Google Gemini models via official OpenAI-compatible endpoint'
  },
  {
    // Azure OpenAI
    // Official doc: https://learn.microsoft.com/en-us/azure/ai-services/openai/reference
    id: 'azure',
    label: 'Azure OpenAI',
    kind: 'azure',
    baseUrl: '', // Configured per Azure endpoint/deployment
    model: 'gpt-5.4',
    suggestedModels: ['gpt-5.4', 'gpt-4o', 'gpt-4o-mini'],
    docUrl: 'https://learn.microsoft.com/en-us/azure/ai-services/openai/reference',
    apiVersion: '2025-04-01-preview',
    supportsTools: true,
    enabledByDefault: true,
    requiresKey: true,
    note: 'Enterprise Azure OpenAI deployments'
  },
  {
    // DeepSeek
    // Official doc: https://api-docs.deepseek.com
    id: 'deepseek',
    label: 'DeepSeek',
    kind: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    suggestedModels: ['deepseek-chat', 'deepseek-reasoner'],
    docUrl: 'https://api-docs.deepseek.com',
    supportsTools: true, // deepseek-chat supports tools natively; deepseek-reasoner falls back to text actions
    enabledByDefault: true,
    requiresKey: true,
    note: 'DeepSeek chat and reasoning models (reasoning_content routed to thinking)'
  },
  {
    // OpenAI
    // Official doc: https://platform.openai.com/docs/api-reference/chat/create
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    suggestedModels: ['gpt-4o', 'gpt-4o-mini', 'o3-mini', 'gpt-4.5-preview'],
    docUrl: 'https://platform.openai.com/docs/api-reference/chat/create',
    supportsTools: true,
    enabledByDefault: true,
    requiresKey: true,
    note: 'Direct OpenAI chat completions'
  },
  {
    // OpenRouter
    // Official doc: https://openrouter.ai/docs/quickstart
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'deepseek/deepseek-chat',
    suggestedModels: [
      'deepseek/deepseek-chat',
      'anthropic/claude-3.5-sonnet',
      'google/gemini-2.5-flash',
      'openai/gpt-4o'
    ],
    docUrl: 'https://openrouter.ai/docs/quickstart',
    extraHeaders: {
      'HTTP-Referer': 'https://physlab.app',
      'X-Title': 'PhysLab'
    },
    supportsTools: true,
    enabledByDefault: true,
    requiresKey: true,
    note: 'Unified router access to hundreds of open and proprietary models'
  },
  {
    // Groq
    // Official doc: https://console.groq.com/docs/openai
    id: 'groq',
    label: 'Groq',
    kind: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    suggestedModels: [
      'llama-3.3-70b-versatile',
      'deepseek-r1-distill-llama-70b',
      'llama-3.1-8b-instant'
    ],
    docUrl: 'https://console.groq.com/docs/openai',
    supportsTools: true,
    enabledByDefault: true,
    requiresKey: true,
    note: 'Ultra-low latency LPU inference'
  },
  {
    // Mistral AI
    // Official doc: https://docs.mistral.ai/api/
    id: 'mistral',
    label: 'Mistral AI',
    kind: 'openai-compatible',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-large-latest',
    suggestedModels: [
      'mistral-large-latest',
      'mistral-small-latest',
      'codestral-latest'
    ],
    docUrl: 'https://docs.mistral.ai/api/',
    supportsTools: true,
    enabledByDefault: true,
    requiresKey: true,
    note: 'Mistral frontier models'
  },
  {
    // Together AI
    // Official doc: https://docs.together.ai/docs/openai-api
    id: 'together',
    label: 'Together AI',
    kind: 'openai-compatible',
    baseUrl: 'https://api.together.xyz/v1',
    model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    suggestedModels: [
      'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      'deepseek-ai/DeepSeek-V3',
      'deepseek-ai/DeepSeek-R1'
    ],
    docUrl: 'https://docs.together.ai/docs/openai-api',
    supportsTools: true,
    enabledByDefault: true,
    requiresKey: true,
    note: 'High-throughput cloud GPU inference for open-source weights'
  },
  {
    // xAI (Grok)
    // Official doc: https://docs.x.ai/docs/overview
    id: 'xai',
    label: 'xAI (Grok)',
    kind: 'openai-compatible',
    baseUrl: 'https://api.x.ai/v1',
    model: 'grok-2',
    suggestedModels: ['grok-2', 'grok-2-mini', 'grok-beta'],
    docUrl: 'https://docs.x.ai/docs/overview',
    supportsTools: true,
    enabledByDefault: true,
    requiresKey: true,
    note: 'xAI Grok models via OpenAI-compatible endpoint'
  },
  {
    // Anthropic (Claude Messages API adapter)
    // Official doc: https://docs.anthropic.com/en/api/getting-started
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-3-7-sonnet-20250219',
    suggestedModels: [
      'claude-3-7-sonnet-20250219',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022'
    ],
    docUrl: 'https://docs.anthropic.com/en/api/getting-started',
    apiVersion: '2023-06-01',
    supportsTools: true,
    enabledByDefault: true,
    requiresKey: true,
    note: 'Anthropic Claude models via Messages API adapter'
  },
  {
    // BytePlus ModelArk (General Inference)
    // Official doc: https://www.byteplus.com/en/docs/modelark
    id: 'modelark',
    label: 'BytePlus ModelArk',
    kind: 'openai-compatible',
    baseUrl: 'https://ark.ap-southeast.bytepluses.com/api/v3',
    model: 'deepseek-v3',
    suggestedModels: ['deepseek-v3', 'deepseek-r1'],
    docUrl: 'https://www.byteplus.com/en/docs/modelark',
    supportsTools: true,
    enabledByDefault: true,
    requiresKey: true,
    note: 'BytePlus ModelArk standard endpoint for general inference'
  },
  {
    // BytePlus ModelArk Coding Plan (Restricted by BytePlus terms to developer tools; disabled by default)
    // Official doc: https://www.byteplus.com/en/docs/modelark
    id: 'modelark-coding',
    label: 'BytePlus ModelArk (Coding Plan)',
    kind: 'openai-compatible',
    baseUrl: 'https://ark.ap-southeast.bytepluses.com/api/coding/v3',
    model: 'ark-code-latest',
    suggestedModels: ['ark-code-latest', 'deepseek-v4-pro', 'deepseek-v4-flash'],
    docUrl: 'https://www.byteplus.com/en/docs/modelark',
    supportsTools: true,
    enabledByDefault: false,
    requiresKey: true,
    note: 'Coding Plan is restricted by BytePlus terms to developer/coding tools only; off by default in PhysLab'
  },
  {
    // Ollama (Local)
    // Official doc: https://github.com/ollama/ollama/blob/main/docs/openai.md
    id: 'ollama',
    label: 'Ollama (Local)',
    kind: 'openai-compatible',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.2',
    suggestedModels: ['llama3.2', 'qwen2.5', 'deepseek-r1'],
    docUrl: 'https://github.com/ollama/ollama/blob/main/docs/openai.md',
    supportsTools: true,
    enabledByDefault: true,
    requiresKey: false,
    note: 'Local Ollama instance on localhost:11434 (no key required)'
  },
  {
    // LM Studio (Local)
    // Official doc: https://lmstudio.ai/docs/api
    id: 'lmstudio',
    label: 'LM Studio (Local)',
    kind: 'openai-compatible',
    baseUrl: 'http://localhost:1234/v1',
    model: 'local-model',
    suggestedModels: ['local-model'],
    docUrl: 'https://lmstudio.ai/docs/api',
    supportsTools: true,
    enabledByDefault: true,
    requiresKey: false,
    note: 'Local LM Studio instance on localhost:1234 (no key required)'
  },
  {
    // Custom OpenAI-Compatible
    // Official doc: https://platform.openai.com/docs/api-reference
    id: 'custom',
    label: 'Custom OpenAI-Compatible',
    kind: 'openai-compatible',
    baseUrl: '',
    model: '',
    suggestedModels: [],
    docUrl: 'https://platform.openai.com/docs/api-reference',
    supportsTools: true,
    enabledByDefault: true,
    requiresKey: false,
    note: 'Any OpenAI-compatible server endpoint'
  }
]

export function getProviderPreset(id: string): AiProviderPreset | undefined {
  return AI_PROVIDER_PRESETS.find((p) => p.id === id)
}
