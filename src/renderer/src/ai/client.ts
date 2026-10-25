import { buildSystemPrompt } from './systemPrompt'
import { extractActions, extractThinkTrace } from './bridge'
import { useAiStore } from './store'
import type { Attachment, ChatMessage } from './types'

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
      return { ok: false, message: 'Google Gemini API Key is missing. Please paste your key in Settings.' }
    }
    try {
      const cleanModel = geminiModel.replace(/^models\//, '')
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${geminiApiKey}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Respond with exactly: OK' }] }]
        })
      })
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        return { ok: false, message: errJson.error?.message || `HTTP ${res.status}: ${res.statusText}` }
      }
      // Auto fetch model list on successful connection
      void fetchAvailableModels()
      return { ok: true, message: `Successfully connected to Google Gemini (${cleanModel})!` }
    } catch (err) {
      return { ok: false, message: `Connection error: ${err instanceof Error ? err.message : String(err)}` }
    }
  } else {
    try {
      const cleanEndpoint = localEndpoint.replace(/\/+$/, '')
      const res = await fetch(`${cleanEndpoint}/models`).catch(() => null)
      if (res && res.ok) {
        void fetchAvailableModels()
        return { ok: true, message: `Local endpoint active at ${cleanEndpoint} (Found models).` }
      }
      // Fallback check completions
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
      return { ok: false, message: `Failed to reach local endpoint: ${err instanceof Error ? err.message : String(err)}` }
    }
  }
}

/**
 * Fetches available models from Google AI Studio or local endpoint.
 */
export async function fetchAvailableModels(): Promise<{ ok: boolean; models: string[]; message?: string }> {
  const { provider, geminiApiKey, localEndpoint } = useAiStore.getState()

  if (provider === 'gemini') {
    if (!geminiApiKey) {
      return {
        ok: false,
        models: ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'],
        message: 'Google Gemini API key is missing.'
      }
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiApiKey}`
      const res = await fetch(url)
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        return {
          ok: false,
          models: ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'],
          message: errJson.error?.message || `HTTP ${res.status}: ${res.statusText}`
        }
      }

      const data = await res.json()
      const rawModels: Array<{ name: string; supportedGenerationMethods?: string[] }> = data.models || []
      const generateModels = rawModels
        .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
        .map((m) => m.name.replace(/^models\//, ''))
        .filter((name) => !name.includes('embedding') && !name.includes('aqa') && !name.includes('imagen'))

      generateModels.sort((a, b) => {
        if (a === 'gemini-3.8-flash') return -1
        if (b === 'gemini-3.8-flash') return 1
        return b.localeCompare(a)
      })

      const finalModels = generateModels.length > 0
        ? generateModels
        : ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro']

      useAiStore.getState().setAvailableGeminiModels(finalModels)
      return { ok: true, models: finalModels, message: `Fetched ${finalModels.length} models from Google AI Studio.` }
    } catch (err) {
      return {
        ok: false,
        models: ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'],
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
      const rawList = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : []
      const modelIds: string[] = rawList.map((m: { id?: string; name?: string }) => m.id || m.name || '').filter(Boolean)

      const finalModels = modelIds.length > 0 ? modelIds : ['PhysLab-Brain-Ultimatrix']
      useAiStore.getState().setAvailableLocalModels(finalModels)
      return { ok: true, models: finalModels, message: `Fetched ${finalModels.length} local models.` }
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
 * Sends a chat message with full history and multimodal image attachments.
 */
export async function streamChatCompletion(
  history: ChatMessage[],
  newPrompt: string,
  attachments: Attachment[] = [],
  callbacks: StreamCallbacks
): Promise<void> {
  const store = useAiStore.getState()
  const { provider, geminiApiKey, geminiModel, localEndpoint, localModel, memories, goals } = store
  const systemPrompt = buildSystemPrompt(memories, goals)

  let accumulated = ''

  if (provider === 'gemini') {
    if (!geminiApiKey) {
      callbacks.onError('Gemini API key is missing. Please add your key in Settings.')
      return
    }

    try {
      const cleanModel = geminiModel.replace(/^models\//, '')
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:streamGenerateContent?alt=sse&key=${geminiApiKey}`

      // Build Gemini contents
      const contents: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> = []

      // History messages
      for (const msg of history) {
        if (msg.role === 'system') continue
        const role = msg.role === 'assistant' ? 'model' : 'user'
        const parts: Array<Record<string, unknown>> = []

        if (msg.attachments && msg.attachments.length > 0) {
          for (const att of msg.attachments) {
            const base64 = att.dataUrl.includes('base64,') ? att.dataUrl.split('base64,')[1] : att.dataUrl
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
        const base64 = att.dataUrl.includes('base64,') ? att.dataUrl.split('base64,')[1] : att.dataUrl
        currentParts.push({
          inlineData: {
            mimeType: att.mimeType,
            data: base64
          }
        })
      }
      currentParts.push({ text: newPrompt })
      contents.push({ role: 'user', parts: currentParts })

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 4096
          }
        })
      })

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
            const textChunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text
            if (textChunk) {
              accumulated += textChunk
              callbacks.onChunk(accumulated)
            }
          } catch {
            // Partial JSON chunk
          }
        }
      }

      // Finish parsing
      const { cleanContent, think, agentTraces } = extractThinkTrace(accumulated)
      const { cleanContent: finalContent, actions } = extractActions(cleanContent)

      callbacks.onDone({
        content: finalContent,
        think,
        actions,
        agentTraces
      })
    } catch (err) {
      callbacks.onError(`Stream error: ${err instanceof Error ? err.message : String(err)}`)
    }
  } else {
    // Local OpenAI-compatible endpoint
    try {
      const cleanEndpoint = localEndpoint.replace(/\/+$/, '')
      const url = `${cleanEndpoint}/chat/completions`

      const messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }> = [
        { role: 'system', content: systemPrompt }
      ]

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
          stream: true,
          temperature: 0.3
        })
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        callbacks.onError(errJson.error?.message || `HTTP ${res.status}: ${res.statusText}`)
        return
      }

      const reader = res.body?.getReader()
      if (!reader) {
        callbacks.onError('Local response stream not readable.')
        return
      }

      const decoder = new TextDecoder('utf-8')
      let buffer = ''
      let reasoningAccum = ''
      let contentAccum = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const dataContent = trimmed.slice(5).trim()
          if (dataContent === '[DONE]') break

          try {
            const parsed = JSON.parse(dataContent)
            const delta = parsed.choices?.[0]?.delta
            const reasoningChunk = delta?.reasoning_content
            const textChunk = delta?.content
            if (reasoningChunk) {
              reasoningAccum += reasoningChunk
            }
            if (textChunk) {
              contentAccum += textChunk
            }
            if (reasoningChunk || textChunk) {
              accumulated = reasoningAccum
                ? `<think>${reasoningAccum}</think>\n${contentAccum}`
                : contentAccum
              callbacks.onChunk(accumulated)
            }
          } catch {
            // Partial JSON chunk
          }
        }
      }

      const { cleanContent, think, agentTraces } = extractThinkTrace(accumulated)
      const { cleanContent: finalContent, actions } = extractActions(cleanContent)

      callbacks.onDone({
        content: finalContent,
        think,
        actions,
        agentTraces
      })
    } catch (err) {
      callbacks.onError(`Local stream error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
