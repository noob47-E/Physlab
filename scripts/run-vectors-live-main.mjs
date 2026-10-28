// Runner for Vector Live Checks (4 prompts on Azure OpenAI)
import { app } from 'electron'
import { createRequire } from 'node:module'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const SHOTS_DIR = 'C:\\my_projects\\PhysLab-research\\09\\sandbox\\screenshots\\vectors'
mkdirSync(SHOTS_DIR, { recursive: true })

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = (o) => process.stdout.write(`VECTOR_CHECK ${JSON.stringify(o)}\n`)

const prompts = [
  { id: 'vector-1', text: 'draw the vector from A(0,0) to B(3,4)' },
  { id: 'vector-2', text: 'draw v = 3i + 4j' },
  { id: 'vector-3', text: 'resolve 10 N at 30°' },
  { id: 'vector-4', text: 'add u = 2i + j and v = i + 3j' }
]

app.on('browser-window-created', (_e, win) => {
  const wc = win.webContents
  wc.setBackgroundThrottling(false)

  const errors = []
  wc.on('console-message', (details) => {
    if (details.level === 'error' || details.level === 3) {
      errors.push(String(details.message).slice(0, 300))
    }
  })

  wc.once('did-finish-load', async () => {
    try {
      await wait(3000)
      out({ step: 'init', msg: 'Window loaded for Vector checks' })

      const exec = async (code) => {
        try {
          return await wc.executeJavaScript(code)
        } catch (err) {
          out({ step: 'exec_fail', codeSnippet: String(code).slice(0, 120), error: err.message })
          throw err
        }
      }

      // Dismiss tour / welcome card
      await exec(`
        try {
          localStorage.setItem('physlab.tourSeen', '1');
        } catch {}
        const btns = Array.from(document.querySelectorAll('button'));
        const skip = btns.find(b => b.textContent?.trim() === 'Skip');
        if (skip) skip.click();
      `)
      await wait(1000)

      const snap = async (filename) => {
        const img = await wc.capturePage()
        const png = img.toPNG()
        const p1 = join(SHOTS_DIR, filename)
        writeFileSync(p1, png)
        return p1
      }

      const sendPrompt = async (promptText) => {
        await exec(`window.__physlab_debug.showPanel('ai_copilot')`)
        await wait(1500)
        await exec(`(async () => {
          let input = document.querySelector('textarea, input[placeholder*="Ask"]');
          for (let i = 0; i < 20 && !input; i++) {
            await new Promise(r => setTimeout(r, 200));
            input = document.querySelector('textarea, input[placeholder*="Ask"]');
          }
          if (!input) throw new Error('AI input not found');
          const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set ||
                      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          input.focus();
          set.call(input, ${JSON.stringify(promptText)});
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        })()`)
      }

      const waitForReply = async (timeoutSec = 75) => {
        for (let i = 0; i < timeoutSec; i++) {
          await wait(1000)
          const res = await exec(`(() => {
            const ai = window.__physlab_debug.useAiStore ? window.__physlab_debug.useAiStore.getState() : null;
            if (!ai) return { done: false, error: 'no ai store' };
            const isStreaming = ai.isStreaming;
            const thread = ai.threads.find(t => t.id === ai.activeThreadId);
            const lastMsg = thread && thread.messages ? thread.messages[thread.messages.length - 1] : null;
            const hasAssistant = lastMsg && lastMsg.role === 'assistant';
            const streamErr = ai.streamError;
            if (!isStreaming && (hasAssistant || streamErr)) {
              return {
                done: true,
                content: hasAssistant ? lastMsg.content : null,
                model: hasAssistant ? lastMsg.model : null,
                verification: hasAssistant ? lastMsg.verification : null,
                streamErr
              };
            }
            return { done: false };
          })()`)
          if (res.done) {
            await wait(2500)
            return res
          }
        }
        throw new Error('AI response timed out')
      }

      for (let i = 0; i < prompts.length; i++) {
        const item = prompts[i]
        out({ step: `vector_check_${i + 1}_start`, item })
        await exec(`
          window.__physlab_debug.enterMode('vectors');
          window.__physlab_debug.useScene.getState().newScene();
          window.__physlab_debug.useTheme.getState().set('light');
          window.__physlab_debug.useAiStore.getState().createThread();
        `)
        await wait(1500)

        await sendPrompt(item.text)
        const reply = await waitForReply(75)
        await wait(2500)

        const shotPath = await snap(`${item.id}.png`)
        const objs = await exec(`Object.values(window.__physlab_debug.useScene.getState().objects).map(o => ({ id: o.id, name: o.name, type: o.type, space: o.space }))`)

        out({
          step: `vector_check_${i + 1}_complete`,
          item,
          model: reply.model,
          badge: reply.verification?.badgeText,
          objs,
          shotPath,
          contentSnippet: String(reply.content).slice(0, 250)
        })
      }

      out({ step: 'all_vector_checks_done', ok: true })
    } catch (err) {
      out({ step: 'fatal', error: String(err && err.stack ? err.stack : err) })
    } finally {
      win.destroy()
      app.exit(0)
    }
  })
})

createRequire(import.meta.url)('../out/main/index.js')
