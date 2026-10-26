import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => 'C:\\temp\\physlab-test')
  },
  ipcMain: {
    handle: vi.fn()
  }
}))

import { handleAiChat } from '../src/main/aiProvider'

describe('AI Provider in main process', () => {
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
    setEnvCaseInsensitive('google_ai_studio_noob_api', 'test-gemini-secret-key-12345')
    setEnvCaseInsensitive('AZURE_AI_ENDPOINT', 'https://test-azure-resource.openai.azure.com')
    setEnvCaseInsensitive('AZURE_AI_KEY', 'test-azure-secret-key-67890')
    setEnvCaseInsensitive('AZURE_AI_DEPLOYMENT', 'gpt-5.4')
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env = { ...originalEnv }
  })

  it('handles a chat completion and returns assistant message with model', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'I will solve this.',
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'solve', arguments: '{"expression":"x^2-5x+6=0"}' }
                  }
                ]
              }
            }
          ],
          usage: { prompt_tokens: 15, completion_tokens: 25 }
        })
    })

    const result = await handleAiChat([{ role: 'user', content: 'solve x^2-5x+6=0' }])
    expect('message' in result).toBe(true)
    if ('message' in result) {
      expect(result.message.content).toBe('I will solve this.')
      expect(result.message.tool_calls).toHaveLength(1)
      expect(result.message.tool_calls[0].function.name).toBe('solve')
      expect(result.model).toBe('gemini-3.8-flash')
    }
  })

  it('falls through the Gemini model chain on 429 quota exhaustion', async () => {
    let callCount = 0
    global.fetch = vi.fn().mockImplementation((_url, opts) => {
      callCount++
      const body = JSON.parse((opts as any).body)
      if (body.model === 'gemini-3.8-flash') {
        return Promise.resolve({
          ok: false,
          status: 429,
          text: async () => JSON.stringify({ error: { message: 'Resource exhausted (quota)' } })
        })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { role: 'assistant', content: 'From fallback model' } }],
            usage: { prompt_tokens: 10, completion_tokens: 10 }
          })
      })
    })

    const result = await handleAiChat([{ role: 'user', content: 'test' }])
    expect('message' in result).toBe(true)
    if ('message' in result) {
      expect(result.message.content).toBe('From fallback model')
      expect(result.model).toBe('gemini-flash-latest')
    }
    expect(callCount).toBe(2)
  })

  it('falls through to Azure OpenAI when all Gemini models are exhausted', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('googleapis.com')) {
        return Promise.resolve({
          ok: false,
          status: 429,
          text: async () => JSON.stringify({ error: { message: 'Quota exceeded' } })
        })
      }
      if (url.includes('azure.com')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              choices: [{ message: { role: 'assistant', content: 'Hello from Azure OpenAI' } }],
              usage: { prompt_tokens: 20, completion_tokens: 15 }
            })
        })
      }
      return Promise.reject(new Error('Unknown URL'))
    })

    const result = await handleAiChat([{ role: 'user', content: 'test' }])
    expect('message' in result).toBe(true)
    if ('message' in result) {
      expect(result.message.content).toBe('Hello from Azure OpenAI')
      expect(result.model).toBe('gpt-5.4')
    }
  })

  it('handles timeout and returns a calm error sentence', async () => {
    global.fetch = vi.fn().mockImplementation(() => {
      const err = new Error('The operation was aborted due to timeout')
      err.name = 'AbortError'
      return Promise.reject(err)
    })

    // Remove azure so it fails on gemini directly without fallback loop
    setEnvCaseInsensitive('AZURE_AI_KEY', undefined)
    const result = await handleAiChat([{ role: 'user', content: 'test' }])
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('timed out')
    }
  })

  it('never leaks secret keys in error messages', async () => {
    const secretKey = 'MY_SUPER_SECRET_KEY_NEVER_SHOW'
    setEnvCaseInsensitive('google_ai_studio_noob_api', secretKey)
    setEnvCaseInsensitive('AZURE_AI_KEY', undefined)

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => `Error occurred with key ${secretKey} at server`
    })

    const result = await handleAiChat([{ role: 'user', content: 'test' }])
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).not.toContain(secretKey)
      expect(result.error).toContain('[REDACTED]')
    }
  })
})
