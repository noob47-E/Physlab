import { buildSystemPrompt } from './systemPrompt'
import { extractActions, extractThinkTrace } from './bridge'
import { useAiStore } from './store'
import type { Attachment, ChatMessage } from './types'

let activeAbortController: AbortController | null = null

/**
 * Aborts any currently active streaming chat completion.
 */
export function abortActiveStream(): void {
  if (activeAbortController) {
    activeAbortController.abort()
    activeAbortController = null
  }
}

interface StreamCallbacks {
  onChunk: (accumulated: string) => void
  onDone: (finalMsg: {
    content: string
    think?: string
    actions: ReturnType<typeof extractActions>['actions']
    agentTraces: ReturnType<typeof extractThinkTrace>['agentTraces']
  }) => void
  onError: (err: string) => void
}

/**
 * Tests connection to the selected provider.
 */
export async function testAiConnection(): Promise<{ ok: boolean; message: string }> {
  const { provider, geminiApiKey, geminiModel, localEndpoint, localModel } = useAiStore.getState()

  if (provider === 'gemini') {
    if (!geminiApiKey) {
      return {
        ok: false,
        message: 'Google Gemini API Key is missing. Please paste your key in Settings.'
      }
    }
    try {
      const cleanModel = geminiModel.replace(/^models\//, '')
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': geminiApiKey
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Respond with exactly: OK' }] }]
        })
      })
      if (!res.ok) {
        if (res.status === 404 && cleanModel !== 'gemini-2.5-flash') {
          useAiStore.getState().setGeminiModel('gemini-2.5-flash')
          return testAiConnection()
        }
        const errJson = await res.json().catch(() => ({}))
        return {
          ok: false,
          message: errJson.error?.message || `HTTP ${res.status}: ${res.statusText}`
        }
      }
      void fetchAvailableModels()
      return { ok: true, message: `Successfully connected to Google Gemini (${cleanModel})!` }
    } catch (err) {
      return {
        ok: false,
        message: `Connection error: ${err instanceof Error ? err.message : String(err)}`
      }
    }
  } else {
    try {
      const cleanEndpoint = localEndpoint.replace(/\/+$/, '')
      const res = await fetch(`${cleanEndpoint}/models`).catch(() => null)
      if (res && res.ok) {
        void fetchAvailableModels()
        return { ok: true, message: `Local endpoint active at ${cleanEndpoint} (Found models).` }
      }
      const compRes = await fetch(`${cleanEndpoint}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: localModel,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 5
        })
      })
      if (compRes.ok) {
        void fetchAvailableModels()
        return { ok: true, message: `Local Ultimatrix endpoint verified at ${cleanEndpoint}.` }
      }
      return { ok: false, message: `Local endpoint returned status ${compRes.status}.` }
    } catch (err) {
      return {
        ok: false,
        message: `Failed to reach local endpoint: ${err instanceof Error ? err.message : String(err)}`
      }
    }
  }
}

/**
 * Fetches available models from Google AI Studio or local endpoint.
 */
export async function fetchAvailableModels(): Promise<{
  ok: boolean
  models: string[]
  message?: string
}> {
  const { provider, geminiApiKey, localEndpoint } = useAiStore.getState()

  if (provider === 'gemini') {
    if (!geminiApiKey) {
      return {
        ok: false,
        models: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
        message: 'Google Gemini API key is missing.'
      }
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models`
      const res = await fetch(url, {
        headers: {
          'x-goog-api-key': geminiApiKey
        }
      })
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        return {
          ok: false,
          models: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
          message: errJson.error?.message || `HTTP ${res.status}: ${res.statusText}`
        }
      }

      const data = await res.json()
      const rawModels: Array<{ name: string; supportedGenerationMethods?: string[] }> =
        data.models || []
      const generateModels = rawModels
        .filter(
          (m) =>
            !m.supportedGenerationMethods ||
            m.supportedGenerationMethods.includes('generateContent')
        )
        .map((m) => m.name.replace(/^models\//, ''))
        .filter(
          (name) =>
            !name.includes('embedding') && !name.includes('aqa') && !name.includes('imagen')
        )

      generateModels.sort((a, b) => {
        if (a === 'gemini-2.5-flash') return -1
        if (b === 'gemini-2.5-flash') return 1
        return b.localeCompare(a)
      })

      const finalModels =
        generateModels.length > 0
          ? generateModels
          : ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro']

      useAiStore.getState().setAvailableGeminiModels(finalModels)
      return {
        ok: true,
        models: finalModels,
        message: `Fetched ${finalModels.length} models from Google AI Studio.`
      }
    } catch (err) {
      return {
        ok: false,
        models: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
        message: err instanceof Error ? err.message : String(err)
      }
    }
  } else {
    try {
      const cleanEndpoint = localEndpoint.replace(/\/+$/, '')
      const res = await fetch(`${cleanEndpoint}/models`)
      if (!res.ok) {
        return {
          ok: false,
          models: ['PhysLab-Brain-Ultimatrix'],
          message: `Local endpoint returned status ${res.status}`
        }
      }
      const data = await res.json()
      const rawModels: Array<{ id: string }> = data.data || data.models || []
      const finalModels = rawModels.map((m) => m.id).filter(Boolean)
      const list = finalModels.length > 0 ? finalModels : ['PhysLab-Brain-Ultimatrix']
      useAiStore.getState().setAvailableLocalModels(list)
      return {
        ok: true,
        models: list,
        message: `Found ${list.length} models on local endpoint.`
      }
    } catch (err) {
      return {
        ok: false,
        models: ['PhysLab-Brain-Ultimatrix'],
        message: err instanceof Error ? err.message : String(err)
      }
    }
  }
}

/**
 * Automatically probes common local endpoints in order and connects to the active local model (e.g. Qwen / PhysLab-Brain).
 */
export async function autoConnectLocalBrain(): Promise<{
  ok: boolean
  endpoint: string
  model: string
  message: string
}> {
  const { localEndpoint } = useAiStore.getState()
  const candidateEndpoints = [
    localEndpoint,
    'http://127.0.0.1:8080/v1',
    'http://127.0.0.1:11434/v1',
    'http://127.0.0.1:1234/v1'
  ].filter(Boolean)

  const uniqueEndpoints = Array.from(
    new Set(candidateEndpoints.map((ep) => ep.replace(/\/+$/, '')))
  )

  for (const ep of uniqueEndpoints) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 2500)
      const res = await fetch(`${ep}/models`, { signal: controller.signal }).catch(() => null)
      clearTimeout(timeoutId)

      if (res && res.ok) {
        const data = await res.json().catch(() => ({}))
        const rawModels: Array<{ id?: string; name?: string }> = data.data || data.models || []
        const modelNames = rawModels.map((m) => m.id || m.name || '').filter(Boolean)

        // Select Qwen or PhysLab-Brain, or first available
        const preferredModel =
          modelNames.find((m) => /qwen/i.test(m)) ||
          modelNames.find((m) => /physlab/i.test(m)) ||
          modelNames[0] ||
          'PhysLab-Brain-Ultimatrix'

        const available = modelNames.length > 0 ? modelNames : [preferredModel]

        useAiStore.getState().setLocalEndpoint(ep)
        useAiStore.getState().setLocalModel(preferredModel)
        useAiStore.getState().setAvailableLocalModels(available)

        return {
          ok: true,
          endpoint: ep,
          model: preferredModel,
          message: `Connected to Local Brain at ${ep} (${preferredModel}).`
        }
      }
    } catch {
      // Continue probing next endpoint
    }
  }

  return {
    ok: false,
    endpoint: '',
    model: '',
    message:
      'Could not connect to any local endpoint. Please ensure your local model server (port 8080, 11434, or 1234) is running.'
  }
}

/**
 * Streams chat completion from Gemini or local OpenAI-compatible endpoint.
 */
export async function streamChatCompletion(
  history: ChatMessage[],
  newPrompt: string,
  attachments: Attachment[],
  callbacks: StreamCallbacks
): Promise<void> {
  const { provider, geminiApiKey, geminiModel, localEndpoint, localModel, memories, goals } =
    useAiStore.getState()
  const systemPrompt = buildSystemPrompt(memories, goals)

  abortActiveStream()
  const controller = new AbortController()
  activeAbortController = controller
  const signal = controller.signal

  let accumulated = ''

  try {
    if (provider === 'gemini') {
      if (!geminiApiKey) {
        callbacks.onError(
          'Gemini API key is not configured. Please paste your key in AI Tutor Settings.'
        )
        return
      }

      let currentModel = geminiModel.replace(/^models\//, '')
      let url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:streamGenerateContent?alt=sse`

      const contents: Array<{
        role: 'user' | 'model'
        parts: Array<Record<string, unknown>>
      }> = []

      // History
      for (const msg of history) {
        if (msg.role === 'system') continue
        const role = msg.role === 'assistant' ? 'model' : 'user'
        const parts: Array<Record<string, unknown>> = []

        if (msg.attachments && msg.attachments.length > 0) {
          for (const att of msg.attachments) {
            const base64 = att.dataUrl.includes('base64,')
              ? att.dataUrl.split('base64,')[1]
              : att.dataUrl
            parts.push({
              inlineData: {
                mimeType: att.mimeType,
                data: base64
              }
            })
          }
        }

        parts.push({ text: msg.content })
        contents.push({ role, parts })
      }

      // Latest message parts
      const currentParts: Array<Record<string, unknown>> = []
      for (const att of attachments) {
        const base64 = att.dataUrl.includes('base64,')
          ? att.dataUrl.split('base64,')[1]
          : att.dataUrl
        currentParts.push({
          inlineData: {
            mimeType: att.mimeType,
            data: base64
          }
        })
      }
      currentParts.push({ text: newPrompt })
      contents.push({ role: 'user', parts: currentParts })

      let res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': geminiApiKey
        },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 4096
          }
        }),
        signal
      })

      if (!res.ok && res.status === 404 && currentModel !== 'gemini-2.5-flash') {
        currentModel = 'gemini-2.5-flash'
        useAiStore.getState().setGeminiModel('gemini-2.5-flash')
        url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:streamGenerateContent?alt=sse`
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': geminiApiKey
          },
          body: JSON.stringify({
            contents,
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 4096
            }
          }),
          signal
        })
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        const errMsg = errJson.error?.message || `HTTP ${res.status}: ${res.statusText}`
        callbacks.onError(errMsg)
        return
      }

      const reader = res.body?.getReader()
      if (!reader) {
        callbacks.onError('Response stream body not available.')
        return
      }

      const decoder = new TextDecoder('utf-8')
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const jsonStr = trimmed.slice(5).trim()
          if (!jsonStr) continue

          try {
            const parsed = JSON.parse(jsonStr)
            const parts = parsed.candidates?.[0]?.content?.parts
            const textChunk = Array.isArray(parts)
              ? parts.map((p: { text?: string }) => p.text || '').join('')
              : ''
            if (textChunk) {
              accumulated += textChunk
              callbacks.onChunk(accumulated)
            }
          } catch {
            // Partial JSON chunk
          }
        }
      }

      const { cleanContent: textWithoutActions, actions } = extractActions(accumulated)
      const { cleanContent: finalContent, think, agentTraces } = extractThinkTrace(textWithoutActions)

      callbacks.onDone({
        content: finalContent,
        think,
        actions,
        agentTraces
      })
    } else {
      // Local OpenAI-compatible endpoint
      const cleanEndpoint = localEndpoint.replace(/\/+$/, '')
      const url = `${cleanEndpoint}/chat/completions`

      const messages: Array<{
        role: string
        content: string | Array<Record<string, unknown>>
      }> = [{ role: 'system', content: systemPrompt }]

      for (const msg of history) {
        if (msg.role === 'system') continue
        messages.push({ role: msg.role, content: msg.content })
      }

      if (attachments.length > 0) {
        const contentParts: Array<Record<string, unknown>> = [{ type: 'text', text: newPrompt }]
        for (const att of attachments) {
          contentParts.push({
            type: 'image_url',
            image_url: { url: att.dataUrl }
          })
        }
        messages.push({ role: 'user', content: contentParts })
      } else {
        messages.push({ role: 'user', content: newPrompt })
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: localModel,
          messages,
          temperature: 0.3,
          max_tokens: 4096,
          stream: true
        }),
        signal
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        const errMsg = errJson.error?.message || `HTTP ${res.status}: ${res.statusText}`
        callbacks.onError(errMsg)
        return
      }

      const reader = res.body?.getReader()
      if (!reader) {
        callbacks.onError('Local response stream body not available.')
        return
      }

      const decoder = new TextDecoder('utf-8')
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const jsonStr = trimmed.slice(5).trim()
          if (!jsonStr || jsonStr === '[DONE]') continue

          try {
            const parsed = JSON.parse(jsonStr)
            const textChunk =
              parsed.choices?.[0]?.delta?.content ||
              parsed.choices?.[0]?.delta?.reasoning_content ||
              ''
            if (textChunk) {
              accumulated += textChunk
              callbacks.onChunk(accumulated)
            }
          } catch {
            // Partial chunk
          }
        }
      }

      const { cleanContent: textWithoutActions, actions } = extractActions(accumulated)
      const { cleanContent: finalContent, think, agentTraces } = extractThinkTrace(textWithoutActions)

      callbacks.onDone({
        content: finalContent,
        think,
        actions,
        agentTraces
      })
    }
  } catch (err) {
    if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
      const { cleanContent: textWithoutActions, actions } = extractActions(accumulated)
      const { cleanContent: finalContent, think, agentTraces } = extractThinkTrace(textWithoutActions)
      callbacks.onDone({
        content: finalContent,
        think,
        actions,
        agentTraces
      })
      return
    }
    callbacks.onError(`Stream error: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    if (activeAbortController?.signal === signal) {
      activeAbortController = null
    }
  }
}
