import { app, ipcMain } from 'electron'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  AI_PROVIDER_PRESETS,
  getProviderPreset,
  type ProviderKind,
  type AiProviderPreset
} from '../renderer/src/ai/presets'

export {
  AI_PROVIDER_PRESETS,
  getProviderPreset,
  type ProviderKind,
  type AiProviderPreset
}

const GEMINI_OPENAI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'

const GEMINI_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-flash-lite-latest',
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite'
]

export interface StoredProviderConfig {
  baseUrl?: string
  model?: string
  apiVersion?: string
  customHeaders?: Record<string, string>
}

export interface KeyFile {
  geminiKey?: string
  azureKey?: string
  azureEndpoint?: string
  azureDeployment?: string
  keys?: Record<string, string>
  configs?: Record<string, StoredProviderConfig>
  mainProvider?: string
  fallbackProvider?: string
}

function getKeyFilePath(): string {
  return join(app.getPath('userData'), 'ai-key.json')
}

export function readStoredKeys(): KeyFile {
  try {
    const p = getKeyFilePath()
    if (existsSync(p)) {
      const parsed = JSON.parse(readFileSync(p, 'utf8')) as KeyFile
      if (!parsed.keys) parsed.keys = {}
      if (!parsed.configs) parsed.configs = {}

      // Backward compatibility migration:
      if (parsed.geminiKey && !parsed.keys.gemini) {
        parsed.keys.gemini = parsed.geminiKey
      }
      if (parsed.azureKey && !parsed.keys.azure) {
        parsed.keys.azure = parsed.azureKey
      }
      if (parsed.azureEndpoint && !parsed.configs.azure) {
        parsed.configs.azure = {
          baseUrl: parsed.azureEndpoint,
          model: parsed.azureDeployment || 'gpt-5.4'
        }
      }
      return parsed
    }
  } catch {
    // ignore
  }
  return { keys: {}, configs: {} }
}

function writeStoredKeys(data: KeyFile): void {
  try {
    const p = getKeyFilePath()
    writeFileSync(p, JSON.stringify(data, null, 2), 'utf8')
  } catch {
    // ignore
  }
}

export function userEnv(name: string): string {
  const hit = Object.keys(process.env).find((k) => k.toLowerCase() === name.toLowerCase())
  if (hit) return process.env[hit] ?? ''
  if (process.platform === 'win32') {
    try {
      const out = execFileSync('reg', ['query', 'HKCU\\Environment', '/v', name], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      })
      const m = out.match(new RegExp(name + '\\s+REG_(?:EXPAND_)?SZ\\s+(.*)', 'i'))
      return m ? m[1].trim() : ''
    } catch {
      return ''
    }
  }
  return ''
}

export function getSecretKey(nameOrProvider: string): string {
  const stored = readStoredKeys()
  const lower = nameOrProvider.toLowerCase()

  // 1. Direct match in universal key store
  if (stored.keys && stored.keys[nameOrProvider]) {
    return stored.keys[nameOrProvider]
  }

  // 2. Gemini fallback & env check
  if (lower === 'gemini' || lower.includes('google')) {
    if (stored.keys?.gemini) return stored.keys.gemini
    if (stored.geminiKey) return stored.geminiKey
    const envKey = userEnv('google_ai_studio_noob_api') || userEnv('GEMINI_API_KEY')
    if (envKey) return envKey
  }

  // 3. Azure fallback & env check
  if (lower === 'azure') {
    if (stored.keys?.azure) return stored.keys.azure
    if (stored.azureKey) return stored.azureKey
    return userEnv('AZURE_AI_KEY')
  }
  if (lower.includes('azure') && lower.includes('key')) {
    if (stored.keys?.azure) return stored.keys.azure
    if (stored.azureKey) return stored.azureKey
    return userEnv('AZURE_AI_KEY')
  }
  if (lower.includes('endpoint')) {
    if (stored.configs?.azure?.baseUrl) return stored.configs.azure.baseUrl
    if (stored.azureEndpoint) return stored.azureEndpoint
    return userEnv('AZURE_AI_ENDPOINT')
  }
  if (lower.includes('deployment')) {
    if (stored.configs?.azure?.model) return stored.configs.azure.model
    if (stored.azureDeployment) return stored.azureDeployment
    return userEnv('AZURE_AI_DEPLOYMENT') || 'gpt-5.4'
  }

  // 4. Standard environment variable lookups for known providers
  const envMap: Record<string, string> = {
    openai: 'OPENAI_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    groq: 'GROQ_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    together: 'TOGETHER_API_KEY',
    xai: 'XAI_API_KEY',
    modelark: 'MODELARK_API_KEY',
    'modelark-coding': 'MODELARK_CODING_API_KEY'
  }
  if (envMap[lower]) {
    const envVal = userEnv(envMap[lower])
    if (envVal) return envVal
  }

  return userEnv(nameOrProvider)
}

export function hasAiKey(provider?: string): boolean {
  if (!provider) {
    const hasGemini = !!getSecretKey('google_ai_studio_noob_api')
    const hasAzure = !!(getSecretKey('AZURE_AI_ENDPOINT') && getSecretKey('AZURE_AI_KEY'))
    if (hasGemini || hasAzure) return true
    const stored = readStoredKeys()
    if (stored.keys) {
      for (const k of Object.values(stored.keys)) {
        if (k && k.trim().length > 0) return true
      }
    }
    return false
  }

  const preset = getProviderPreset(provider)
  if (preset && !preset.requiresKey) {
    return true // Local providers don't require keys
  }

  if (provider === 'azure') {
    return !!(getSecretKey('AZURE_AI_ENDPOINT') && getSecretKey('AZURE_AI_KEY'))
  }

  const key = getSecretKey(provider)
  return !!(key && key.trim().length > 0)
}

export function setAiKey(key: string, provider = 'gemini'): boolean {
  const stored = readStoredKeys()
  if (!stored.keys) stored.keys = {}
  stored.keys[provider] = key.trim()

  // Maintain backward compatibility for legacy callers
  if (provider === 'azure') {
    stored.azureKey = key.trim()
  } else if (provider === 'gemini') {
    stored.geminiKey = key.trim()
  }

  writeStoredKeys(stored)
  return true
}

export function removeAiKey(provider: string): boolean {
  const stored = readStoredKeys()
  if (stored.keys) {
    delete stored.keys[provider]
  }
  if (provider === 'gemini') {
    delete stored.geminiKey
  } else if (provider === 'azure') {
    delete stored.azureKey
  }
  writeStoredKeys(stored)
  return true
}

export function setProviderConfig(provider: string, config: StoredProviderConfig): boolean {
  const stored = readStoredKeys()
  if (!stored.configs) stored.configs = {}
  stored.configs[provider] = {
    ...stored.configs[provider],
    ...config
  }
  if (provider === 'azure') {
    if (config.baseUrl) stored.azureEndpoint = config.baseUrl
    if (config.model) stored.azureDeployment = config.model
  }
  writeStoredKeys(stored)
  return true
}

export function setActiveProviders(main: string, fallback?: string): boolean {
  const stored = readStoredKeys()
  stored.mainProvider = main
  stored.fallbackProvider = fallback || undefined
  writeStoredKeys(stored)
  return true
}

export function getResolvedProviderConfig(id: string): {
  id: string
  label: string
  kind: ProviderKind
  baseUrl: string
  model: string
  apiVersion?: string
  extraHeaders?: Record<string, string>
  supportsTools: boolean
  requiresKey: boolean
} {
  const preset = getProviderPreset(id)
  const stored = readStoredKeys()
  const custom = stored.configs?.[id]

  if (id === 'azure') {
    const endpoint = custom?.baseUrl || getSecretKey('AZURE_AI_ENDPOINT') || ''
    const deployment = custom?.model || getSecretKey('AZURE_AI_DEPLOYMENT') || 'gpt-5.4'
    return {
      id: 'azure',
      label: preset?.label || 'Azure OpenAI',
      kind: 'azure',
      baseUrl: endpoint,
      model: deployment,
      apiVersion: custom?.apiVersion || preset?.apiVersion || '2025-04-01-preview',
      supportsTools: true,
      requiresKey: true
    }
  }

  if (preset) {
    return {
      id: preset.id,
      label: preset.label,
      kind: preset.kind,
      baseUrl: custom?.baseUrl || preset.baseUrl,
      model: custom?.model || preset.model,
      apiVersion: custom?.apiVersion || preset.apiVersion,
      extraHeaders: { ...preset.extraHeaders, ...custom?.customHeaders },
      supportsTools: preset.supportsTools,
      requiresKey: preset.requiresKey
    }
  }

  // Custom fallback
  return {
    id: id || 'custom',
    label: 'Custom Provider',
    kind: 'openai-compatible',
    baseUrl: custom?.baseUrl || '',
    model: custom?.model || '',
    supportsTools: true,
    requiresKey: false
  }
}

export function sanitizeError(err: unknown, keyToRedact?: string): string {
  let msg = err instanceof Error ? err.message : String(err)
  const keysToFilter = new Set<string>()
  if (keyToRedact && keyToRedact.length > 4) keysToFilter.add(keyToRedact)

  const stored = readStoredKeys()
  if (stored.geminiKey && stored.geminiKey.length > 4) keysToFilter.add(stored.geminiKey)
  if (stored.azureKey && stored.azureKey.length > 4) keysToFilter.add(stored.azureKey)
  if (stored.keys) {
    for (const k of Object.values(stored.keys)) {
      if (k && k.length > 4) keysToFilter.add(k)
    }
  }

  const envNames = [
    'google_ai_studio_noob_api',
    'GEMINI_API_KEY',
    'AZURE_AI_KEY',
    'OPENAI_API_KEY',
    'DEEPSEEK_API_KEY',
    'ANTHROPIC_API_KEY',
    'GROQ_API_KEY',
    'OPENROUTER_API_KEY',
    'MISTRAL_API_KEY',
    'TOGETHER_API_KEY',
    'XAI_API_KEY',
    'MODELARK_API_KEY',
    'MODELARK_CODING_API_KEY'
  ]
  for (const name of envNames) {
    const val = userEnv(name)
    if (val && val.length > 4) keysToFilter.add(val)
  }

  for (const k of keysToFilter) {
    msg = msg.replaceAll(k, '[REDACTED]')
  }

  if (/fetch failed|ECONNREFUSED|ENOTFOUND|network/i.test(msg)) {
    return 'The AI needs the internet. Everything else in PhysLab works offline.'
  }
  if (/timeout|abort/i.test(msg)) {
    return 'The AI service timed out after 30 seconds.'
  }
  return msg
}

export function mapUserFacingError(status: number, errText: string, key?: string): string {
  const sanitized = sanitizeError(errText, key)
  if (
    status === 401 ||
    status === 403 ||
    /unauthorized|invalid.?api.?key|authentication|wrong.?key/i.test(sanitized)
  ) {
    return 'Wrong key'
  }
  if (
    status === 404 ||
    /model_not_found|does not exist|not found|deployment/i.test(sanitized)
  ) {
    return 'Model not found'
  }
  if (
    status === 429 ||
    /quota|rate.?limit|resource_exhausted/i.test(sanitized)
  ) {
    return 'Quota exceeded. Please check your plan or try another provider.'
  }
  if (/The AI needs the internet/i.test(sanitized) || /fetch failed|ECONNREFUSED|ENOTFOUND/i.test(sanitized)) {
    return 'No internet'
  }
  if (/timeout|abort/i.test(sanitized)) {
    return 'The AI service timed out after 30 seconds.'
  }
  return sanitized
}

function logUsage(
  provider: string,
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number } | undefined
): void {
  try {
    const file = join(app.getPath('userData'), 'ai-usage.jsonl')
    const entry = {
      time: new Date().toISOString(),
      provider,
      model,
      prompt_tokens: usage?.prompt_tokens ?? 0,
      completion_tokens: usage?.completion_tokens ?? 0
    }
    appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8')
  } catch {
    // ignore
  }
}

async function postWithTimeout(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs = 30000
): Promise<{ status: number; ok: boolean; json: any; text: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    })
    const text = await res.text()
    let json: any = null
    try {
      json = JSON.parse(text)
    } catch {
      // not JSON
    }
    return { status: res.status, ok: res.ok, json, text }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Universal OpenAI-compatible API invocation with automatic tool fallback,
 * reasoning_content routing to thinking, and Azure / Anthropic adapters.
 */
export async function callOpenAiCompatible(
  record: {
    id: string
    kind: ProviderKind
    baseUrl: string
    model: string
    apiVersion?: string
    extraHeaders?: Record<string, string>
    supportsTools?: boolean
  },
  key: string,
  messages: unknown[],
  tools?: unknown[]
): Promise<{
  message: any
  model: string
  toolsSupported?: boolean
} | {
  error: string
  status?: number
  tryNextProvider?: boolean
}> {
  // --- Case 1: Anthropic native Messages API ---
  if (record.kind === 'anthropic') {
    return callAnthropicNative(record, key, messages, tools)
  }

  // --- Case 2: Azure OpenAI ---
  if (record.kind === 'azure') {
    return callAzureOpenAi(messages, tools)
  }

  // --- Case 3: Generic OpenAI-compatible endpoint ---
  const baseUrl = record.baseUrl.replace(/\/+$/, '')
  const endpointUrl = baseUrl.endsWith('/chat/completions')
    ? baseUrl
    : `${baseUrl}/chat/completions`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(record.extraHeaders || {})
  }
  if (key && key.trim().length > 0) {
    headers.Authorization = `Bearer ${key.trim()}`
  }

  const hasTools = Boolean(
    tools && Array.isArray(tools) && tools.length > 0 && record.supportsTools !== false
  )

  const payload: Record<string, unknown> = {
    model: record.model,
    messages,
    max_tokens: 1500
  }
  if (hasTools) {
    payload.tools = tools
    payload.tool_choice = 'auto'
  }

  try {
    let res = await postWithTimeout(endpointUrl, headers, payload, 30000)
    if (!res.ok && res.status >= 500 && res.status < 600) {
      res = await postWithTimeout(endpointUrl, headers, payload, 30000)
    }

    // Check if tools were rejected (HTTP 400 with unsupported tools / function error)
    if (!res.ok && res.status === 400 && hasTools) {
      const errText = res.json?.error?.message ?? res.text
      const isToolError = /tool|function|tool_choice|unrecognized|unsupported/i.test(errText)
      if (isToolError) {
        // Fall back automatically: retry without tools
        const payloadNoTools = { ...payload }
        delete payloadNoTools.tools
        delete payloadNoTools.tool_choice

        const fallbackRes = await postWithTimeout(endpointUrl, headers, payloadNoTools, 30000)
        if (fallbackRes.ok && fallbackRes.json?.choices?.[0]?.message) {
          const msg = fallbackRes.json.choices[0].message
          // Thinking models: route reasoning_content / reasoning to think
          if (msg.reasoning_content && !msg.think) {
            msg.think = msg.reasoning_content
          } else if (msg.reasoning && !msg.think) {
            msg.think = msg.reasoning
          }
          logUsage(record.id, record.model, fallbackRes.json.usage)
          return { message: msg, model: record.model, toolsSupported: false }
        }
      }
    }

    if (res.ok && res.json?.choices?.[0]?.message) {
      const msg = res.json.choices[0].message
      // Thinking models: DeepSeek reasoning_content routes to collapsed thinking area, never into visible content
      if (msg.reasoning_content && !msg.think) {
        msg.think = msg.reasoning_content
      } else if (msg.reasoning && !msg.think) {
        msg.think = msg.reasoning
      }
      logUsage(record.id, record.model, res.json.usage)
      return { message: msg, model: record.model, toolsSupported: hasTools }
    }

    const errText = res.json?.error?.message ?? res.text
    const isQuotaOrGone =
      res.status === 429 ||
      res.status === 503 ||
      res.status === 404 ||
      /quota|limit: 0|RESOURCE_EXHAUSTED|no longer available/i.test(errText)

    if (res.status === 401 || res.status === 403) {
      return { error: 'Wrong key', status: res.status }
    }
    if (res.status === 404) {
      return { error: 'Model not found', status: 404 }
    }
    if (isQuotaOrGone) {
      return {
        error: `${record.id} quota exhausted or unavailable.`,
        status: res.status,
        tryNextProvider: true
      }
    }

    return { error: sanitizeError(errText, key), status: res.status }
  } catch (err) {
    return { error: sanitizeError(err, key), tryNextProvider: true }
  }
}

/**
 * Anthropic Messages API Adapter
 */
async function callAnthropicNative(
  record: {
    id: string
    baseUrl: string
    model: string
    apiVersion?: string
    extraHeaders?: Record<string, string>
    supportsTools?: boolean
  },
  key: string,
  messages: unknown[],
  tools?: unknown[]
): Promise<{
  message: any
  model: string
  toolsSupported?: boolean
} | {
  error: string
  status?: number
  tryNextProvider?: boolean
}> {
  if (!key) {
    return { error: 'Wrong key', status: 401 }
  }

  const baseUrl = record.baseUrl.replace(/\/+$/, '')
  const endpointUrl = baseUrl.endsWith('/messages') ? baseUrl : `${baseUrl}/messages`

  const headers: Record<string, string> = {
    'x-api-key': key.trim(),
    'anthropic-version': record.apiVersion || '2023-06-01',
    'content-type': 'application/json',
    ...(record.extraHeaders || {})
  }

  // Extract system prompt and user/assistant messages
  let systemPrompt: string | undefined
  const anthropicMessages: Array<{ role: 'user' | 'assistant'; content: any }> = []

  if (Array.isArray(messages)) {
    for (const m of messages as any[]) {
      if (m.role === 'system') {
        systemPrompt = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      } else if (m.role === 'tool') {
        anthropicMessages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: m.tool_call_id,
              content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
            }
          ]
        })
      } else if (m.role === 'assistant' && m.tool_calls && Array.isArray(m.tool_calls)) {
        const blocks: any[] = []
        if (m.content) {
          blocks.push({ type: 'text', text: m.content })
        }
        for (const call of m.tool_calls) {
          let input = {}
          try {
            input =
              typeof call.function?.arguments === 'string'
                ? JSON.parse(call.function.arguments)
                : call.function?.arguments || {}
          } catch {
            input = {}
          }
          blocks.push({
            type: 'tool_use',
            id: call.id,
            name: call.function?.name,
            input
          })
        }
        anthropicMessages.push({ role: 'assistant', content: blocks })
      } else if (m.role === 'user' || m.role === 'assistant') {
        anthropicMessages.push({ role: m.role, content: m.content })
      }
    }
  }

  // Convert tools
  const hasTools = Boolean(
    tools && Array.isArray(tools) && tools.length > 0 && record.supportsTools !== false
  )
  const anthropicTools: any[] = []
  if (hasTools && Array.isArray(tools)) {
    for (const t of tools as any[]) {
      if (t.type === 'function' && t.function) {
        anthropicTools.push({
          name: t.function.name,
          description: t.function.description || '',
          input_schema: t.function.parameters || { type: 'object', properties: {} }
        })
      }
    }
  }

  const payload: Record<string, unknown> = {
    model: record.model,
    messages: anthropicMessages,
    max_tokens: 1500
  }
  if (systemPrompt) payload.system = systemPrompt
  if (anthropicTools.length > 0) payload.tools = anthropicTools

  try {
    let res = await postWithTimeout(endpointUrl, headers, payload, 30000)
    if (!res.ok && res.status >= 500 && res.status < 600) {
      res = await postWithTimeout(endpointUrl, headers, payload, 30000)
    }

    // Tools rejection fallback
    if (!res.ok && res.status === 400 && anthropicTools.length > 0) {
      const errText = res.json?.error?.message ?? res.text
      if (/tool/i.test(errText)) {
        const payloadNoTools = { ...payload }
        delete payloadNoTools.tools
        const fallbackRes = await postWithTimeout(endpointUrl, headers, payloadNoTools, 30000)
        if (fallbackRes.ok && fallbackRes.json?.content) {
          return parseAnthropicResponse(fallbackRes.json, record.model, false)
        }
      }
    }

    if (res.ok && res.json?.content) {
      return parseAnthropicResponse(res.json, record.model, anthropicTools.length > 0)
    }

    const errText = res.json?.error?.message ?? res.text
    if (res.status === 401 || res.status === 403) {
      return { error: 'Wrong key', status: res.status }
    }
    if (res.status === 404) {
      return { error: 'Model not found', status: 404 }
    }
    if (res.status === 429) {
      return { error: 'Anthropic quota exhausted.', status: 429, tryNextProvider: true }
    }
    return { error: sanitizeError(errText, key), status: res.status }
  } catch (err) {
    return { error: sanitizeError(err, key), tryNextProvider: true }
  }
}

function parseAnthropicResponse(
  json: any,
  model: string,
  toolsSupported: boolean
): { message: any; model: string; toolsSupported: boolean } {
  const contentBlocks = Array.isArray(json.content) ? json.content : []
  let text = ''
  let think = ''
  const toolCalls: any[] = []

  for (const block of contentBlocks) {
    if (block.type === 'text') {
      text += (text ? '\n' : '') + block.text
    } else if (block.type === 'thinking') {
      think += (think ? '\n' : '') + (block.thinking || '')
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input || {})
        }
      })
    }
  }

  const message: Record<string, unknown> = {
    role: 'assistant',
    content: text
  }
  if (think) message.think = think
  if (toolCalls.length > 0) message.tool_calls = toolCalls

  return { message, model, toolsSupported }
}

export async function callGeminiOpenAi(
  messages: unknown[],
  tools?: unknown[]
): Promise<{ message: any; model: string } | { error: string; tryNextProvider?: boolean }> {
  const key = getSecretKey('google_ai_studio_noob_api')
  if (!key) {
    return { error: 'Gemini API key is not configured.', tryNextProvider: true }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json'
  }

  for (let i = 0; i < GEMINI_MODELS.length; i++) {
    const model = GEMINI_MODELS[i]
    const payload: Record<string, unknown> = {
      model,
      messages,
      max_tokens: 1500
    }
    if (tools && Array.isArray(tools) && tools.length > 0) {
      payload.tools = tools
      payload.tool_choice = 'auto'
    }

    try {
      let res = await postWithTimeout(GEMINI_OPENAI_URL, headers, payload, 30000)
      if (!res.ok && res.status >= 500 && res.status < 600) {
        res = await postWithTimeout(GEMINI_OPENAI_URL, headers, payload, 30000)
      }

      if (res.ok && res.json?.choices?.[0]?.message) {
        logUsage('gemini', model, res.json.usage)
        return { message: res.json.choices[0].message, model }
      }

      const errText = res.json?.error?.message ?? res.text
      const isQuotaOrGone =
        res.status === 429 ||
        res.status === 503 ||
        res.status === 404 ||
        /quota|limit: 0|RESOURCE_EXHAUSTED|no longer available/i.test(errText)

      if (isQuotaOrGone && i < GEMINI_MODELS.length - 1) {
        continue
      }

      if (isQuotaOrGone) {
        return { error: 'Gemini quota exhausted.', tryNextProvider: true }
      }

      if (res.status === 401 || res.status === 403) {
        return { error: 'The Gemini API key is invalid or unauthorized.' }
      }

      return { error: sanitizeError(errText, key) }
    } catch (err) {
      if (i < GEMINI_MODELS.length - 1) {
        continue
      }
      return { error: sanitizeError(err, key), tryNextProvider: true }
    }
  }

  return { error: 'All Gemini models were exhausted.', tryNextProvider: true }
}

export async function callAzureOpenAi(
  messages: unknown[],
  tools?: unknown[]
): Promise<{ message: any; model: string; toolsSupported?: boolean } | { error: string }> {
  const endpoint = getSecretKey('AZURE_AI_ENDPOINT')
  const key = getSecretKey('AZURE_AI_KEY')
  const deployment = getSecretKey('AZURE_AI_DEPLOYMENT') || 'gpt-5.4'

  if (!endpoint || !key) {
    return { error: 'No AI service configured. Please configure your key in Settings.' }
  }

  const origin = new URL(endpoint).origin
  const headers: Record<string, string> = {
    'api-key': key,
    'Content-Type': 'application/json'
  }

  const hasTools = Boolean(tools && Array.isArray(tools) && tools.length > 0)

  const payloadV1: Record<string, unknown> = {
    model: deployment,
    messages,
    max_completion_tokens: 1500
  }
  const payloadClassic: Record<string, unknown> = {
    messages,
    max_completion_tokens: 1500
  }
  if (hasTools) {
    payloadV1.tools = tools
    payloadV1.tool_choice = 'auto'
    payloadClassic.tools = tools
    payloadClassic.tool_choice = 'auto'
  }

  const tries = [
    { url: `${origin}/openai/v1/chat/completions`, body: payloadV1 },
    {
      url: `${origin}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=2025-04-01-preview`,
      body: payloadClassic
    }
  ]

  let lastError = 'Azure request failed.'
  for (const t of tries) {
    try {
      let res = await postWithTimeout(t.url, headers, t.body, 30000)
      if (!res.ok && res.status >= 500 && res.status < 600) {
        res = await postWithTimeout(t.url, headers, t.body, 30000)
      }

      // If tools rejected with 400 on Azure, retry without tools
      if (!res.ok && res.status === 400 && hasTools) {
        const noToolsBody = { ...t.body } as any
        delete noToolsBody.tools
        delete noToolsBody.tool_choice
        const retryRes = await postWithTimeout(t.url, headers, noToolsBody, 30000)
        if (retryRes.ok && retryRes.json?.choices?.[0]?.message) {
          logUsage('azure', deployment, retryRes.json.usage)
          return { message: retryRes.json.choices[0].message, model: deployment, toolsSupported: false }
        }
      }

      if (res.ok && res.json?.choices?.[0]?.message) {
        logUsage('azure', deployment, res.json.usage)
        return { message: res.json.choices[0].message, model: deployment, toolsSupported: hasTools }
      }

      const errMsg = res.json?.error?.message ?? res.text.slice(0, 300)
      lastError = sanitizeError(errMsg, key)
      if (res.status === 401 || res.status === 403) {
        return { error: 'Azure authorization failed. Please check your key.' }
      }
      if (res.status === 429) {
        return { error: 'Azure quota exceeded. Please try again later.' }
      }
    } catch (err) {
      lastError = sanitizeError(err, key)
    }
  }

  return { error: lastError }
}

export async function callProvider(
  providerId: string,
  messages: unknown[],
  tools?: unknown[]
): Promise<{ message?: any; model?: string; error?: string; tryNextProvider?: boolean }> {
  if (providerId === 'gemini') {
    return callGeminiOpenAi(messages, tools)
  }
  if (providerId === 'azure') {
    return callAzureOpenAi(messages, tools)
  }

  const config = getResolvedProviderConfig(providerId)
  const key = getSecretKey(providerId)

  if (config.requiresKey && (!key || key.trim().length === 0)) {
    return { error: `API key for ${config.label} is not configured.`, tryNextProvider: true }
  }

  return callOpenAiCompatible(config, key, messages, tools)
}

/**
 * Dispatches chat completion to the main configured provider, falling back to the
 * fallback provider if the main provider fails or runs out of quota.
 */
export async function handleAiChat(
  messages: unknown[],
  tools?: unknown[]
): Promise<{ message?: any; model?: string; error?: string }> {
  const stored = readStoredKeys()
  const hasAzure = hasAiKey('azure')
  const hasGemini = !!getSecretKey('google_ai_studio_noob_api')

  // Determine main and fallback providers:
  let mainProvider = stored.mainProvider
  let fallbackProvider = stored.fallbackProvider

  if (!mainProvider) {
    mainProvider = hasAzure ? 'azure' : 'gemini'
  }
  if (!fallbackProvider && mainProvider === 'azure' && hasGemini) {
    fallbackProvider = 'gemini'
  }

  // 1. Try main provider
  const mainRes = await callProvider(mainProvider, messages, tools)
  if ('message' in mainRes && mainRes.message) {
    return mainRes
  }

  // 2. Fallback provider if main failed or ran out of quota
  if (fallbackProvider && fallbackProvider !== mainProvider && hasAiKey(fallbackProvider)) {
    const fallbackRes = await callProvider(fallbackProvider, messages, tools)
    if ('message' in fallbackRes && fallbackRes.message) {
      return fallbackRes
    }
    // Return the fallback error or main error
    return { error: fallbackRes.error || mainRes.error }
  }

  return { error: mainRes.error }
}

export async function testProviderConnection(
  providerId: string,
  keyOverride?: string
): Promise<{ ok: boolean; message?: string; error?: string }> {
  const startTime = Date.now()
  const config = getResolvedProviderConfig(providerId)
  const key = keyOverride !== undefined ? keyOverride : getSecretKey(providerId)

  if (config.requiresKey && (!key || key.trim().length === 0)) {
    return { ok: false, error: 'Wrong key' }
  }

  const pingMessages = [{ role: 'user', content: 'Respond with exactly: OK' }]

  let res: any
  if (providerId === 'gemini') {
    res = await callGeminiOpenAi(pingMessages)
  } else if (providerId === 'azure') {
    res = await callAzureOpenAi(pingMessages)
  } else {
    res = await callOpenAiCompatible(config, key, pingMessages)
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  if ('message' in res && res.message) {
    const model = res.model || config.model || 'model'
    const toolNotice =
      res.toolsSupported === false
        ? " (This model can't use tools, so PhysLab will use text actions)"
        : ''
    return {
      ok: true,
      message: `Works: model ${model} replied in ${elapsed} s${toolNotice}`
    }
  }

  const rawErr = res.error || 'Connection failed'
  const plainWordsError = mapUserFacingError(res.status || 0, rawErr, key)
  return { ok: false, error: plainWordsError }
}

export async function listProviderModels(
  providerId: string
): Promise<{ ok: boolean; models: string[]; error?: string }> {
  const config = getResolvedProviderConfig(providerId)
  const key = getSecretKey(providerId)

  if (providerId === 'gemini') {
    return {
      ok: true,
      models: [...GEMINI_MODELS]
    }
  }

  if (config.kind === 'azure') {
    return {
      ok: true,
      models: [config.model || 'gpt-5.4', 'gpt-4o', 'gpt-4o-mini']
    }
  }

  const baseUrl = config.baseUrl.replace(/\/+$/, '')
  if (!baseUrl) {
    return {
      ok: true,
      models: config.model ? [config.model] : []
    }
  }

  try {
    const headers: Record<string, string> = {
      ...(config.extraHeaders || {})
    }
    if (key && key.trim().length > 0) {
      if (config.kind === 'anthropic') {
        headers['x-api-key'] = key.trim()
        headers['anthropic-version'] = config.apiVersion || '2023-06-01'
      } else {
        headers.Authorization = `Bearer ${key.trim()}`
      }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(`${baseUrl}/models`, {
      headers,
      signal: controller.signal
    }).catch(() => null)
    clearTimeout(timer)

    if (res && res.ok) {
      const data = await res.json().catch(() => ({}))
      const rawList: Array<{ id?: string; name?: string }> =
        data.data || data.models || []
      const modelNames = rawList
        .map((m) => m.id || m.name || '')
        .filter(Boolean)

      if (modelNames.length > 0) {
        return { ok: true, models: modelNames }
      }
    }
  } catch {
    // fallback to preset suggested models
  }

  const preset = getProviderPreset(providerId)
  if (preset && preset.suggestedModels.length > 0) {
    return { ok: true, models: preset.suggestedModels }
  }

  return {
    ok: true,
    models: config.model ? [config.model] : []
  }
}

export async function transcribeImage(
  dataUrl: string
): Promise<{ text?: string; error?: string }> {
  const prompt =
    'Transcribe the physics/math problem, question, numbers, and diagrams shown in this image clearly into text and LaTeX formulas. Output ONLY the transcribed problem statement without preamble or solving it.'
  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: dataUrl } }
      ]
    }
  ]
  const res = await handleAiChat(messages)
  if (res.message?.content) {
    return { text: String(res.message.content).trim() }
  }
  return { error: res.error || 'Failed to transcribe image.' }
}

export function registerAiProviderIpc(): void {
  ipcMain.handle(
    'ai:chat',
    async (_e, messages: unknown[], tools?: unknown[]) => {
      return handleAiChat(messages, tools)
    }
  )

  ipcMain.handle('ai:transcribe', async (_e, dataUrl: string) => {
    return transcribeImage(dataUrl)
  })

  ipcMain.handle('ai:hasKey', async (_e, provider?: string) => {
    return hasAiKey(provider)
  })

  ipcMain.handle('ai:getConfig', async () => {
    const stored = readStoredKeys()
    const hasAzure = hasAiKey('azure')
    const hasGemini = !!getSecretKey('google_ai_studio_noob_api')
    const azureDeployment =
      stored.configs?.azure?.model || getSecretKey('AZURE_AI_DEPLOYMENT') || 'gpt-5.4'

    let mainProvider = stored.mainProvider
    if (!mainProvider) {
      mainProvider = hasAzure ? 'azure' : 'gemini'
    }
    const fallbackProvider = stored.fallbackProvider || (mainProvider === 'azure' && hasGemini ? 'gemini' : undefined)

    // Preset summaries with NO secret keys exposed:
    const presets = AI_PROVIDER_PRESETS.map((p) => {
      const cfg = stored.configs?.[p.id]
      return {
        id: p.id,
        label: p.label,
        kind: p.kind,
        baseUrl: cfg?.baseUrl || p.baseUrl,
        model: cfg?.model || p.model,
        suggestedModels: p.suggestedModels,
        docUrl: p.docUrl,
        supportsTools: p.supportsTools,
        enabledByDefault: p.enabledByDefault,
        requiresKey: p.requiresKey,
        hasKey: hasAiKey(p.id),
        note: p.note
      }
    })

    return {
      hasAzure,
      hasGemini,
      defaultProvider: hasAzure ? 'azure' : 'gemini',
      azureDeployment,
      mainProvider,
      fallbackProvider,
      presets,
      configs: stored.configs || {}
    }
  })

  ipcMain.handle('ai:setKey', async (_e, keyOrProvider: string, maybeKey?: string) => {
    if (maybeKey !== undefined) {
      return setAiKey(maybeKey, keyOrProvider)
    }
    return setAiKey(keyOrProvider, 'gemini')
  })

  ipcMain.handle('ai:removeKey', async (_e, provider: string) => {
    return removeAiKey(provider)
  })

  ipcMain.handle('ai:setProviderConfig', async (_e, provider: string, config: StoredProviderConfig) => {
    return setProviderConfig(provider, config)
  })

  ipcMain.handle('ai:setActiveProviders', async (_e, main: string, fallback?: string) => {
    return setActiveProviders(main, fallback)
  })

  ipcMain.handle('ai:testConnection', async (_e, provider?: string) => {
    const targetProvider = provider || readStoredKeys().mainProvider || (hasAiKey('azure') ? 'azure' : 'gemini')
    return testProviderConnection(targetProvider)
  })

  ipcMain.handle('ai:listRemoteModels', async (_e, provider?: string) => {
    const targetProvider = provider || readStoredKeys().mainProvider || 'gemini'
    return listProviderModels(targetProvider)
  })
}
