import { app, ipcMain } from 'electron'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'

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

interface KeyFile {
  geminiKey?: string
  azureKey?: string
  azureEndpoint?: string
  azureDeployment?: string
}

function getKeyFilePath(): string {
  return join(app.getPath('userData'), 'ai-key.json')
}

function readStoredKeys(): KeyFile {
  try {
    const p = getKeyFilePath()
    if (existsSync(p)) {
      return JSON.parse(readFileSync(p, 'utf8')) as KeyFile
    }
  } catch {
    // ignore
  }
  return {}
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
  if (hit && process.env[hit]) return process.env[hit]
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

export function getSecretKey(name: string): string {
  const stored = readStoredKeys()
  const lower = name.toLowerCase()
  if (lower.includes('gemini') || lower.includes('google')) {
    if (stored.geminiKey) return stored.geminiKey
    const envKey = userEnv('google_ai_studio_noob_api') || userEnv('GEMINI_API_KEY')
    if (envKey) return envKey
  }
  if (lower.includes('azure') && lower.includes('key')) {
    if (stored.azureKey) return stored.azureKey
    return userEnv('AZURE_AI_KEY')
  }
  if (lower.includes('endpoint')) {
    if (stored.azureEndpoint) return stored.azureEndpoint
    return userEnv('AZURE_AI_ENDPOINT')
  }
  if (lower.includes('deployment')) {
    if (stored.azureDeployment) return stored.azureDeployment
    return userEnv('AZURE_AI_DEPLOYMENT') || 'gpt-5.4'
  }
  return userEnv(name)
}

export function hasAiKey(provider?: string): boolean {
  if (provider === 'azure') {
    return !!(getSecretKey('AZURE_AI_ENDPOINT') && getSecretKey('AZURE_AI_KEY'))
  }
  const hasGemini = !!getSecretKey('google_ai_studio_noob_api')
  const hasAzure = !!(getSecretKey('AZURE_AI_ENDPOINT') && getSecretKey('AZURE_AI_KEY'))
  return hasGemini || hasAzure
}

export function setAiKey(key: string, provider = 'gemini'): boolean {
  const stored = readStoredKeys()
  if (provider === 'azure') {
    stored.azureKey = key.trim()
  } else {
    stored.geminiKey = key.trim()
  }
  writeStoredKeys(stored)
  return true
}

function sanitizeError(err: unknown, keyToRedact?: string): string {
  let msg = err instanceof Error ? err.message : String(err)
  const keysToFilter = new Set<string>()
  if (keyToRedact && keyToRedact.length > 4) keysToFilter.add(keyToRedact)
  const gKey = getSecretKey('google_ai_studio_noob_api')
  if (gKey && gKey.length > 4) keysToFilter.add(gKey)
  const aKey = getSecretKey('AZURE_AI_KEY')
  if (aKey && aKey.length > 4) keysToFilter.add(aKey)

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

function logUsage(provider: string, model: string, usage: { prompt_tokens?: number; completion_tokens?: number } | undefined): void {
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
        // One retry on 5xx
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
): Promise<{ message: any; model: string } | { error: string }> {
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

  const payloadV1: Record<string, unknown> = {
    model: deployment,
    messages,
    max_completion_tokens: 1500
  }
  const payloadClassic: Record<string, unknown> = {
    messages,
    max_completion_tokens: 1500
  }
  if (tools && Array.isArray(tools) && tools.length > 0) {
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

      if (res.ok && res.json?.choices?.[0]?.message) {
        logUsage('azure', deployment, res.json.usage)
        return { message: res.json.choices[0].message, model: deployment }
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

export async function handleAiChat(
  messages: unknown[],
  tools?: unknown[]
): Promise<{ message?: any; model?: string; error?: string }> {
  // 1. Try Gemini
  const geminiRes = await callGeminiOpenAi(messages, tools)
  if ('message' in geminiRes) {
    return geminiRes
  }

  // 2. If Gemini failed due to quota/missing key, try Azure
  if (geminiRes.tryNextProvider) {
    const azureRes = await callAzureOpenAi(messages, tools)
    if ('message' in azureRes) {
      return azureRes
    }
    // Return calm error from Azure (or Gemini if Azure has no key)
    return { error: azureRes.error }
  }

  return { error: geminiRes.error }
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
  ipcMain.handle('ai:chat', async (_e, messages: unknown[], tools?: unknown[]) => {
    return handleAiChat(messages, tools)
  })

  ipcMain.handle('ai:transcribe', async (_e, dataUrl: string) => {
    return transcribeImage(dataUrl)
  })

  ipcMain.handle('ai:hasKey', async (_e, provider?: string) => {
    return hasAiKey(provider)
  })

  ipcMain.handle('ai:setKey', async (_e, key: string, provider?: string) => {
    return setAiKey(key, provider)
  })
}
