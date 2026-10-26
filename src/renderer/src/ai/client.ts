import { buildSystemPrompt } from './systemPrompt'
import { extractActions, extractThinkTrace, buildAppContext, preComputeEngineTurn } from './bridge'
import { repairControlCharLatex } from './contract'
import { useAiStore } from './store'
import type { Attachment, ChatMessage } from './types'
import { TOOLS, runTool } from './tools'

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

export interface StreamCallbacks {
  onChunk: (accumulated: string) => void
  onDone: (finalMsg: {
    content: string
    think?: string
    actions: ReturnType<typeof extractActions>['actions']
    agentTraces: ReturnType<typeof extractThinkTrace>['agentTraces']
    checked?: boolean
    model?: string
  }) => void
  onError: (err: string) => void
}

/**
 * Transcribes a diagram photo or problem image into text and LaTeX using Gemini Vision.
 */
export async function transcribeDiagram(
  dataUrl: string
): Promise<{ ok: boolean; text?: string; error?: string }> {
  if (typeof window !== 'undefined' && (window as any).physlab?.ai?.transcribe) {
    return await (window as any).physlab.ai.transcribe(dataUrl)
  }

  if (typeof window !== 'undefined' && (window as any).physlab?.ai?.chat) {
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
    const res = await (window as any).physlab.ai.chat(messages)
    if (res.ok && res.message?.content) {
      return { ok: true, text: String(res.message.content).trim() }
    }
    return { ok: false, error: res.error || 'Failed to transcribe diagram.' }
  }

  return { ok: false, error: 'PhysLab AI service unavailable.' }
}

/**
 * Tests connection to the selected provider.
 */
export async function testAiConnection(): Promise<{ ok: boolean; message: string }> {
  if (typeof window !== 'undefined' && window.physlab?.ai) {
    const has = await window.physlab.ai.hasKey()
    if (!has) {
      return {
        ok: false,
        message: 'The AI needs an API key. You can set it in Settings.'
      }
    }
    const res = await window.physlab.ai.chat([
      { role: 'user', content: 'Respond with exactly: OK' }
    ])
    if (res.ok) {
      return { ok: true, message: `Connected to PhysLab AI (${res.model ?? 'ready'})!` }
    }
    return { ok: false, message: res.error ?? 'The AI needs the internet. Everything else in PhysLab works offline.' }
  }

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
        if (res.status === 404 && cleanModel !== 'gemini-3.5-flash-lite') {
          useAiStore.getState().setGeminiModel('gemini-3.5-flash-lite')
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
        models: ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
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
          models: ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
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
        if (a === 'gemini-3.5-flash-lite') return -1
        if (b === 'gemini-3.5-flash-lite') return 1
        return b.localeCompare(a)
      })

      const finalModels =
        generateModels.length > 0
          ? generateModels
          : ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro']

      useAiStore.getState().setAvailableGeminiModels(finalModels)
      return {
        ok: true,
        models: finalModels,
        message: `Fetched ${finalModels.length} models from Google AI Studio.`
      }
    } catch (err) {
      return {
        ok: false,
        models: ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
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

  // If running in Desktop app and no endpoint is currently listening, attempt auto-starting local model
  if (typeof window !== 'undefined' && window.physlab?.aiListModels && window.physlab?.aiStartServer) {
    try {
      const models = await window.physlab.aiListModels()
      if (models.length > 0) {
        const targetModel =
          models.find((m) => /qwen/i.test(m.filename)) ||
          models.find((m) => /physlab/i.test(m.filename)) ||
          models[0]

        const startRes = await window.physlab.aiStartServer(targetModel.fullPath, 8080)
        if (startRes.success) {
          await new Promise((r) => setTimeout(r, 1200))
          useAiStore.getState().setLocalEndpoint('http://127.0.0.1:8080/v1')
          useAiStore.getState().setLocalModel(targetModel.filename)
          useAiStore.getState().setAvailableLocalModels(models.map((m) => m.filename))

          return {
            ok: true,
            endpoint: 'http://127.0.0.1:8080/v1',
            model: targetModel.filename,
            message: `Launched & connected to local model ${targetModel.filename} (port 8080).`
          }
        }
      }
    } catch {
      // Continue to error message
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

export const MAX_TOOL_ROUNDS = 4

/**
 * Estimates number of questions in a prompt using numbering, conjunctions, semicolons, and question marks.
 */
export function countQuestionsInPrompt(prompt: string): number {
  if (!prompt || typeof prompt !== 'string') return 1
  const segments = prompt
    .split(/\b(?:and|also)\b|[;\n\?]|\b\d+[\.\)]\s+/i)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2)
  return Math.max(1, segments.length)
}

/**
 * Calculates dynamic tool round ceiling: 4 + 2 * (number of questions), hard ceiling 12.
 */
export function computeMaxToolRounds(prompt: string): number {
  const qCount = countQuestionsInPrompt(prompt)
  return Math.min(12, Math.max(4, 4 + 2 * qCount))
}

export interface ChatMessageLike {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
    [key: string]: unknown
  }>
  tool_call_id?: string
  [key: string]: unknown
}

export type ChatBridgeFn = (payload: {
  messages: ChatMessageLike[]
  tools?: typeof TOOLS
}) => Promise<{
  ok: boolean
  message?: ChatMessageLike
  model?: string
  error?: string
}>

export async function runToolLoop(
  initialMessages: ChatMessageLike[],
  chatFn: ChatBridgeFn,
  options: {
    maxRounds?: number
    onProgress?: (caption: string) => void
    onDone?: (result: {
      content: string
      actions: any[]
      checked?: boolean
      model?: string
      roundCount: number
    }) => void
    onError?: (error: string) => void
  } = {}
): Promise<{
  content: string
  actions: any[]
  checked?: boolean
  model?: string
  roundCount: number
}> {
  const maxRounds = options.maxRounds ?? MAX_TOOL_ROUNDS
  const messages = [...initialMessages]
  let roundCount = 0
  let finalModel: string | undefined
  let lastChecked: boolean | undefined
  let finalContent = ''
  const executedActions: any[] = []

  while (roundCount < maxRounds) {
    roundCount++
    const res = await chatFn({ messages, tools: TOOLS })
    if (!res.ok || !res.message) {
      const err = res.error ?? 'The AI needs the internet. Everything else in PhysLab works offline.'
      if (executedActions.length > 0) {
        // Quota: when every Gemini model is out, finish with the questions already answered and say which ones are left.
        const summary = executedActions
          .map((a, i) => `${i + 1}. ${a.tool}: ${a.result?.answer ? String(a.result.answer) : (a.result?.ok ? 'Done' : 'Failed')}`)
          .join('\n')
        const quotaNotice = `\n\n> Note: Model quota reached (${err}). Completed ${executedActions.length} question(s) before quota ended.`
        finalContent = (finalContent ? `${finalContent}\n\n` : `${summary}\n`) + quotaNotice
        break
      }
      options.onError?.(err)
      return { content: err, actions: executedActions, roundCount }
    }

    finalModel = res.model ?? finalModel
    const assistantMsg = res.message

    // CRITICAL: Push assistant message back EXACTLY as received, preserving Gemini 3 thought signatures & extra fields
    messages.push(assistantMsg)

    if (assistantMsg.content) {
      finalContent = assistantMsg.content
    }

    const toolCalls = assistantMsg.tool_calls
    if (!toolCalls || !Array.isArray(toolCalls) || toolCalls.length === 0) {
      // Done - model produced conversational response without further tool requests
      break
    }

    // Run tool calls ONE AFTER ANOTHER, sequentially (never in parallel)
    for (const call of toolCalls) {
      const name = call.function.name
      let args: Record<string, any> = {}
      try {
        args = typeof call.function.arguments === 'string' ? JSON.parse(call.function.arguments || '{}') : (call.function.arguments ?? {})
      } catch {
        args = {}
      }

      // Progress reporting
      let caption = `Running ${name}…`
      if (name === 'solve') {
        caption = `Solving ${args.expression ?? ''}…`
      } else if (name === 'load_experiment') {
        caption = `Loading ${args.id ?? 'experiment'}…`
      } else if (name === 'play') {
        caption = `Simulating ${args.seconds ? `${args.seconds}s` : 'physics'}…`
      } else if (name === 'plot') {
        caption = `Plotting ${args.equation ?? ''}…`
      }
      options.onProgress?.(caption)

      const result = await runTool(name, args, (cap) => options.onProgress?.(cap))
      if (result.checked !== undefined) {
        lastChecked = Boolean(result.checked)
      }

      executedActions.push({
        id: call.id,
        tool: name,
        args,
        status: result.ok ? 'success' : 'failed',
        result
      })

      // Send tool result back with matching tool_call_id
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result)
      })
    }
  }

  const resultPayload = {
    content: finalContent,
    actions: executedActions,
    checked: lastChecked,
    model: finalModel,
    roundCount
  }
  options.onDone?.(resultPayload)
  return resultPayload
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
  const preComputed = preComputeEngineTurn(newPrompt)
  const systemPrompt = `${buildSystemPrompt(memories, goals)}\n\n${buildAppContext()}${
    preComputed.injectedEnginePrompt ? `\n\n${preComputed.injectedEnginePrompt}` : ''
  }`

  abortActiveStream()
  const controller = new AbortController()
  activeAbortController = controller
  const signal = controller.signal

  // Primary: Call the main-process IPC provider with 4-round tool loop
  if (provider !== 'local' && typeof window !== 'undefined' && window.physlab?.ai?.chat) {
    const hasKey = await window.physlab.ai.hasKey()
    if (!hasKey) {
      callbacks.onError('The AI needs an API key. You can set it in Settings.')
      return
    }

    const messages: ChatMessageLike[] = [{ role: 'system', content: systemPrompt }]
    for (const msg of history) {
      if (msg.role === 'system') continue
      messages.push({ role: msg.role, content: msg.content })
    }
    if (attachments && attachments.length > 0) {
      const parts: Array<Record<string, unknown>> = [
        { type: 'text', text: newPrompt || 'Solve the physics problem shown in this diagram step by step.' }
      ]
      for (const att of attachments) {
        parts.push({
          type: 'image_url',
          image_url: { url: att.dataUrl }
        })
      }
      messages.push({ role: 'user', content: parts as any })
    } else {
      messages.push({ role: 'user', content: newPrompt })
    }

    callbacks.onChunk('Thinking…')

    const dynamicMaxRounds = computeMaxToolRounds(newPrompt)
    const loopResult = await runToolLoop(
      messages,
      async (payload) => {
        if (typeof window !== 'undefined' && window.physlab?.ai?.chat) {
          return await window.physlab.ai.chat(payload.messages, payload.tools)
        }
        return { ok: false, error: 'PhysLab AI bridge unavailable' }
      },
      {
        maxRounds: dynamicMaxRounds,
        onProgress: (caption) => {
          callbacks.onChunk(caption)
        },
        onError: (err) => {
          callbacks.onError(err)
        }
      }
    )

    if (loopResult.content) {
      const { cleanContent: textWithoutActions, actions: parsedActions } = extractActions(loopResult.content)
      const actions = parsedActions.length > 0 ? parsedActions : (loopResult.actions.length > 0 ? loopResult.actions : preComputed.actions)
      const { cleanContent: finalContent, think, agentTraces } = extractThinkTrace(textWithoutActions)

      callbacks.onDone({
        content: repairControlCharLatex(finalContent || loopResult.content),
        think,
        actions,
        agentTraces,
        checked: loopResult.checked,
        model: loopResult.model
      })
    } else if (loopResult.actions.length > 0) {
      callbacks.onDone({
        content: `Completed actions in PhysLab.`,
        actions: loopResult.actions,
        agentTraces: [],
        checked: loopResult.checked,
        model: loopResult.model
      })
    }
    return
  }

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

      if (!res.ok && res.status === 404 && currentModel !== 'gemini-3.5-flash-lite') {
        currentModel = 'gemini-3.5-flash-lite'
        useAiStore.getState().setGeminiModel('gemini-3.5-flash-lite')
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
              callbacks.onChunk(repairControlCharLatex(accumulated))
            }
          } catch {
            // Partial JSON chunk
          }
        }
      }

      const { cleanContent: textWithoutActions, actions: parsedActions } = extractActions(accumulated)
      const actions = parsedActions.length > 0 ? parsedActions : preComputed.actions
      const { cleanContent: finalContent, think, agentTraces } = extractThinkTrace(textWithoutActions)

      callbacks.onDone({
        content: repairControlCharLatex(finalContent),
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
              callbacks.onChunk(repairControlCharLatex(accumulated))
            }
          } catch {
            // Partial chunk
          }
        }
      }

      const { cleanContent: textWithoutActions, actions: parsedActions } = extractActions(accumulated)
      const actions = parsedActions.length > 0 ? parsedActions : preComputed.actions
      const { cleanContent: finalContent, think, agentTraces } = extractThinkTrace(textWithoutActions)

      callbacks.onDone({
        content: repairControlCharLatex(finalContent),
        think,
        actions,
        agentTraces
      })
    }
  } catch (err) {
    if (signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
      const { cleanContent: textWithoutActions, actions: parsedActions } = extractActions(accumulated)
      const actions = parsedActions.length > 0 ? parsedActions : preComputed.actions
      const { cleanContent: finalContent, think, agentTraces } = extractThinkTrace(textWithoutActions)
      callbacks.onDone({
        content: repairControlCharLatex(finalContent),
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
