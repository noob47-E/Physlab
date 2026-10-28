// Runner for Ceva's Theorem Live Checks (5 runs on Azure OpenAI)
import { app } from 'electron'
import { createRequire } from 'node:module'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const SHOTS_DIR = 'C:\\my_projects\\PhysLab-research\\09\\sandbox\\screenshots\\ceva'
mkdirSync(SHOTS_DIR, { recursive: true })

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = (o) => process.stdout.write(`CEVA_CHECK ${JSON.stringify(o)}\n`)

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
      out({ step: 'init', msg: 'Window loaded for Ceva 5-run checks' })

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

      const activeProvider = await exec(`window.__physlab_debug.useAiStore.getState().provider`)
      out({ step: 'provider_check', activeProvider })

      for (let run = 1; run <= 5; run++) {
        out({ step: `ceva_run_${run}_start`, msg: `Starting Ceva's theorem run ${run}/5` })
        await exec(`
          window.__physlab_debug.enterMode('shapes');
          window.__physlab_debug.useScene.getState().newScene();
          window.__physlab_debug.useTheme.getState().set('light');
          window.__physlab_debug.useAiStore.getState().createThread();
        `)
        await wait(1500)

        await sendPrompt("Construct Ceva's theorem on triangle A(0,4), B(-3,-2), C(3,-2) with cevians meeting at P and measure the ratio")
        const reply = await waitForReply(75)
        await wait(2500)

        const shotPath = await snap(`ceva-live-${run}.png`)
        const objs = await exec(`Object.values(window.__physlab_debug.useScene.getState().objects).map(o => o.name || o.kind)`)
        const modeState = await exec(`(() => {
          const mode = window.__physlab_debug.useScene ? 'ok' : 'unknown';
          return { mode };
        })()`)

        out({
          step: `ceva_run_${run}_complete`,
          run,
          model: reply.model,
          badge: reply.verification?.badgeText,
          objs,
          shotPath,
          hasRatioProduct: reply.content && (reply.content.includes('1.000') || reply.content.includes('1.00') || reply.content.includes('= 1')),
          contentSnippet: String(reply.content).slice(0, 300)
        })
      }

      out({ step: 'all_ceva_runs_done', ok: true })
    } catch (err) {
      out({ step: 'fatal', error: String(err && err.stack ? err.stack : err) })
    } finally {
      win.destroy()
      app.exit(0)
    }
  })
})

createRequire(import.meta.url)('../out/main/index.js')
