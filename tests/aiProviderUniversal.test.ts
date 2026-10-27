import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock Electron in Node environment
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => 'C:\\temp\\physlab-test-universal')
  },
  ipcMain: {
    handle: vi.fn()
  }
}))

import {
  AI_PROVIDER_PRESETS,
  getProviderPreset,
  callOpenAiCompatible,
  callAzureOpenAi,
  sanitizeError,
  mapUserFacingError,
  getSecretKey,
  hasAiKey,
  readStoredKeys,
  testProviderConnection,
  listProviderModels
} from '../src/main/aiProvider'

describe('Universal AI Provider Engine (phase-10-AIPROV)', () => {
  const originalFetch = global.fetch
  const originalEnv = { ...process.env }

  function setEnvCaseInsensitive(name: string, val?: string) {
    for (const k of Object.keys(process.env)) {
      if (k.toLowerCase() === name.toLowerCase()) delete process.env[k]
    }
    if (val !== undefined) process.env[name] = val
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    setEnvCaseInsensitive('google_ai_studio_noob_api', 'test-gemini-key-999')
    setEnvCaseInsensitive('AZURE_AI_ENDPOINT', 'https://physlab-test.openai.azure.com')
    setEnvCaseInsensitive('AZURE_AI_KEY', 'test-azure-key-888')
    setEnvCaseInsensitive('AZURE_AI_DEPLOYMENT', 'gpt-5.4')
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env = { ...originalEnv }
  })

  // --------------------------------------------------------------------------
  // 1. Presets and Official Documentation URLs
  // --------------------------------------------------------------------------
  it('defines all required provider presets with non-empty official doc URLs', () => {
    expect(AI_PROVIDER_PRESETS.length).toBeGreaterThanOrEqual(14)
    const requiredIds = [
      'gemini',
      'azure',
      'deepseek',
      'openai',
      'openrouter',
      'groq',
      'mistral',
      'together',
      'xai',
      'anthropic',
      'modelark',
      'modelark-coding',
      'ollama',
      'lmstudio',
      'custom'
    ]

    for (const id of requiredIds) {
      const preset = getProviderPreset(id)
      expect(preset, `Preset ${id} must exist`).toBeDefined()
      expect(preset!.docUrl, `Preset ${id} must have an official docUrl`).toMatch(/^https?:\/\//)
      expect(preset!.label).toBeTruthy()
    }
  })

  it('BytePlus ModelArk Coding Plan preset is disabled by default per terms check', () => {
    const codingPreset = getProviderPreset('modelark-coding')
    expect(codingPreset).toBeDefined()
    expect(codingPreset!.enabledByDefault).toBe(false)
    expect(codingPreset!.baseUrl).toBe('https://ark.ap-southeast.bytepluses.com/api/coding/v3')
    expect(codingPreset!.note).toContain('restricted by BytePlus terms')
  })

  // --------------------------------------------------------------------------
  // 2. URL and Headers for Every Preset
  // --------------------------------------------------------------------------
  it('constructs correct endpoints and headers for OpenAI-compatible presets', async () => {
    const testCases: Array<{
      id: string
      expectedUrl: string
      expectedHeaderCheck?: (headers: Record<string, string>) => void
    }> = [
      {
        id: 'deepseek',
        expectedUrl: 'https://api.deepseek.com/v1/chat/completions',
        expectedHeaderCheck: (h) => expect(h.Authorization).toBe('Bearer test-key')
      },
      {
        id: 'openai',
        expectedUrl: 'https://api.openai.com/v1/chat/completions',
        expectedHeaderCheck: (h) => expect(h.Authorization).toBe('Bearer test-key')
      },
      {
        id: 'openrouter',
        expectedUrl: 'https://openrouter.ai/api/v1/chat/completions',
        expectedHeaderCheck: (h) => {
          expect(h.Authorization).toBe('Bearer test-key')
          expect(h['HTTP-Referer']).toBe('https://physlab.app')
          expect(h['X-Title']).toBe('PhysLab')
        }
      },
      {
        id: 'groq',
        expectedUrl: 'https://api.groq.com/openai/v1/chat/completions',
        expectedHeaderCheck: (h) => expect(h.Authorization).toBe('Bearer test-key')
      },
      {
        id: 'mistral',
        expectedUrl: 'https://api.mistral.ai/v1/chat/completions',
        expectedHeaderCheck: (h) => expect(h.Authorization).toBe('Bearer test-key')
      },
      {
        id: 'together',
        expectedUrl: 'https://api.together.xyz/v1/chat/completions',
        expectedHeaderCheck: (h) => expect(h.Authorization).toBe('Bearer test-key')
      },
      {
        id: 'xai',
        expectedUrl: 'https://api.x.ai/v1/chat/completions',
        expectedHeaderCheck: (h) => expect(h.Authorization).toBe('Bearer test-key')
      },
      {
        id: 'modelark',
        expectedUrl: 'https://ark.ap-southeast.bytepluses.com/api/v3/chat/completions',
        expectedHeaderCheck: (h) => expect(h.Authorization).toBe('Bearer test-key')
      },
      {
        id: 'modelark-coding',
        expectedUrl: 'https://ark.ap-southeast.bytepluses.com/api/coding/v3/chat/completions',
        expectedHeaderCheck: (h) => expect(h.Authorization).toBe('Bearer test-key')
      },
      {
        id: 'ollama',
        expectedUrl: 'http://localhost:11434/v1/chat/completions',
        expectedHeaderCheck: (h) => expect(h.Authorization).toBeUndefined() // Key optional on local
      },
      {
        id: 'lmstudio',
        expectedUrl: 'http://localhost:1234/v1/chat/completions',
        expectedHeaderCheck: (h) => expect(h.Authorization).toBeUndefined() // Key optional on local
      }
    ]

    for (const tc of testCases) {
      const preset = getProviderPreset(tc.id)!
      let capturedUrl = ''
      let capturedHeaders: Record<string, string> = {}

      global.fetch = vi.fn().mockImplementation((url, opts) => {
        capturedUrl = String(url)
        capturedHeaders = opts.headers
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              choices: [{ message: { role: 'assistant', content: `Hello from ${tc.id}` } }],
              usage: { prompt_tokens: 5, completion_tokens: 5 }
            })
        })
      })

      const keyToSend = preset.requiresKey ? 'test-key' : ''
      const res = await callOpenAiCompatible(preset, keyToSend, [{ role: 'user', content: 'hi' }])
      expect('message' in res).toBe(true)
      expect(capturedUrl).toBe(tc.expectedUrl)
      if (tc.expectedHeaderCheck) {
        tc.expectedHeaderCheck(capturedHeaders)
      }
    }
  })

  // --------------------------------------------------------------------------
  // 3. Anthropic Messages API Adapter
  // --------------------------------------------------------------------------
  it('handles Anthropic Claude via native Messages API adapter', async () => {
    const preset = getProviderPreset('anthropic')!
    let capturedUrl = ''
    let capturedHeaders: Record<string, string> = {}
    let capturedBody: any = null

    global.fetch = vi.fn().mockImplementation((url, opts) => {
      capturedUrl = String(url)
      capturedHeaders = opts.headers
      capturedBody = JSON.parse(opts.body)
      return Promise.resolve({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            content: [
              { type: 'thinking', thinking: 'Contemplating physics problem...' },
              { type: 'text', text: 'The projectile range is 45 m.' }
            ],
            usage: { input_tokens: 12, output_tokens: 24 }
          })
      })
    })

    const res = await callOpenAiCompatible(
      preset,
      'sk-ant-test-key',
      [
        { role: 'system', content: 'You are PhysLab AI Tutor.' },
        { role: 'user', content: 'Calculate range.' }
      ]
    )

    expect('message' in res).toBe(true)
    if ('message' in res) {
      expect(capturedUrl).toBe('https://api.anthropic.com/v1/messages')
      expect(capturedHeaders['x-api-key']).toBe('sk-ant-test-key')
      expect(capturedHeaders['anthropic-version']).toBe('2023-06-01')
      expect(capturedBody.system).toBe('You are PhysLab AI Tutor.')
      expect(res.message.content).toBe('The projectile range is 45 m.')
      expect(res.message.think).toBe('Contemplating physics problem...')
    }
  })

  // --------------------------------------------------------------------------
  // 4. Azure OpenAI URL Shapes (v1 and Classic)
  // --------------------------------------------------------------------------
  it('calls Azure OpenAI with correct URL shape and headers', async () => {
    let capturedUrl = ''
    let capturedHeaders: Record<string, string> = {}

    global.fetch = vi.fn().mockImplementation((url, opts) => {
      capturedUrl = String(url)
      capturedHeaders = opts.headers
      return Promise.resolve({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { role: 'assistant', content: 'Azure response' } }],
            usage: { prompt_tokens: 10, completion_tokens: 10 }
          })
      })
    })

    const res = await callAzureOpenAi([{ role: 'user', content: 'hello azure' }])
    expect('message' in res).toBe(true)
    if ('message' in res) {
      expect(capturedUrl).toContain('/openai/v1/chat/completions')
      expect(capturedHeaders['api-key']).toBe('test-azure-key-888')
      expect(res.message.content).toBe('Azure response')
      expect(res.model).toBe('gpt-5.4')
    }
  })

  // --------------------------------------------------------------------------
  // 5. Tools Request & Automatic Fallback When Tools Are Rejected (HTTP 400)
  // --------------------------------------------------------------------------
  it('sends tools in OpenAI format and automatically falls back when rejected', async () => {
    const deepseekPreset = getProviderPreset('deepseek')!
    let attemptCount = 0
    let secondAttemptBody: any = null

    global.fetch = vi.fn().mockImplementation((_url, opts) => {
      attemptCount++
      const body = JSON.parse(opts.body)
      if (attemptCount === 1) {
        expect(body.tools).toBeDefined()
        expect(body.tool_choice).toBe('auto')
        // Simulate tool rejection by model/endpoint
        return Promise.resolve({
          ok: false,
          status: 400,
          text: async () =>
            JSON.stringify({
              error: {
                message: "Unrecognized request argument 'tools' / tools are not supported for this model"
              }
            })
        })
      }

      // Second attempt (fallback): verify tools were stripped
      secondAttemptBody = body
      return Promise.resolve({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: '```physlab\nrun_commands\nPoint(1, 2)\n```'
                }
              }
            ]
          })
      })
    })

    const tools = [
      {
        type: 'function',
        function: {
          name: 'solve',
          description: 'Solves an equation',
          parameters: { type: 'object', properties: { expression: { type: 'string' } } }
        }
      }
    ]

    const res = await callOpenAiCompatible(
      deepseekPreset,
      'test-deepseek-key',
      [{ role: 'user', content: 'plot point' }],
      tools
    )

    expect(attemptCount).toBe(2)
    expect(secondAttemptBody.tools).toBeUndefined()
    expect(secondAttemptBody.tool_choice).toBeUndefined()
    expect('message' in res).toBe(true)
    if ('message' in res) {
      expect(res.toolsSupported).toBe(false)
      expect(res.message.content).toContain('```physlab\nrun_commands')
    }
  })

  // --------------------------------------------------------------------------
  // 6. DeepSeek reasoning_content routed to think, never in visible content
  // --------------------------------------------------------------------------
  it('routes DeepSeek reasoning_content to think and keeps it out of visible content', async () => {
    const preset = getProviderPreset('deepseek')!

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'The derivative of sin(x) is cos(x).',
                reasoning_content:
                  'We use the standard calculus definition: d/dx sin(x) = cos(x).'
              }
            }
          ]
        })
    })

    const res = await callOpenAiCompatible(preset, 'test-key', [
      { role: 'user', content: 'differentiate sin(x)' }
    ])

    expect('message' in res).toBe(true)
    if ('message' in res) {
      // Visible content contains only the answer
      expect(res.message.content).toBe('The derivative of sin(x) is cos(x).')
      expect(res.message.content).not.toContain('We use the standard calculus definition')
      // Thinking area contains the reasoning chain
      expect(res.message.think).toBe(
        'We use the standard calculus definition: d/dx sin(x) = cos(x).'
      )
    }
  })

  // --------------------------------------------------------------------------
  // 7. Error Mapping to Plain Words
  // --------------------------------------------------------------------------
  it('maps HTTP errors to plain words ("Wrong key", "Model not found", "No internet")', () => {
    expect(mapUserFacingError(401, 'Invalid API key provided')).toBe('Wrong key')
    expect(mapUserFacingError(403, 'Unauthorized access')).toBe('Wrong key')
    expect(mapUserFacingError(404, 'The model gpt-nonexistent does not exist')).toBe(
      'Model not found'
    )
    expect(mapUserFacingError(429, 'Rate limit exceeded: quota depleted')).toBe(
      'Quota exceeded. Please check your plan or try another provider.'
    )
    expect(mapUserFacingError(0, 'fetch failed with ECONNREFUSED')).toBe('No internet')
    expect(mapUserFacingError(0, 'The operation was aborted / timeout')).toBe(
      'The AI service timed out after 30 seconds.'
    )
  })

  // --------------------------------------------------------------------------
  // 8. Security Check: Secret keys NEVER leak in errors, logs, or renderer outputs
  // --------------------------------------------------------------------------
  it('guarantees secret keys NEVER leak in thrown errors or sanitized output', () => {
    const secretKey = 'CRITICAL_SECRET_KEY_9876543210'
    const errorWithKey = `Request failed: Authorization Bearer ${secretKey} was rejected at https://api.openai.com/v1/chat/completions`

    const sanitized = sanitizeError(errorWithKey, secretKey)
    expect(sanitized).not.toContain(secretKey)
    expect(sanitized).toContain('[REDACTED]')

    const userFacing = mapUserFacingError(401, errorWithKey, secretKey)
    expect(userFacing).not.toContain(secretKey)
  })

  // --------------------------------------------------------------------------
  // 9. Migration: Existing Stored Gemini and Azure Keys
  // --------------------------------------------------------------------------
  it('preserves existing stored Gemini and Azure keys seamlessly', () => {
    const stored = readStoredKeys()
    expect(stored).toBeDefined()
    // Both env and legacy getter access works seamlessly
    expect(hasAiKey('gemini')).toBe(true)
    expect(hasAiKey('azure')).toBe(true)
    expect(getSecretKey('gemini')).toBe('test-gemini-key-999')
    expect(getSecretKey('azure')).toBe('test-azure-key-888')
    expect(getSecretKey('AZURE_AI_DEPLOYMENT')).toBe('gpt-5.4')
  })

  // --------------------------------------------------------------------------
  // 10. Connection Test Diagnostic Output
  // --------------------------------------------------------------------------
  it('testProviderConnection returns execution duration and model reply', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content: 'OK' } }]
        })
    })

    const result = await testProviderConnection('groq', 'gsk_mock_key')
    expect(result.ok).toBe(true)
    expect(result.message).toMatch(/^Works: model llama-3\.3-70b-versatile replied in \d+\.\d+ s/)
  })

  // --------------------------------------------------------------------------
  // 11. Model List Retrieval via IPC
  // --------------------------------------------------------------------------
  it('listProviderModels returns models from remote /models endpoint', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }, { id: 'o3-mini' }]
        })
    })

    const res = await listProviderModels('openai')
    expect(res.ok).toBe(true)
    expect(res.models).toContain('gpt-4o')
    expect(res.models).toContain('gpt-4o-mini')
  })
})
