// Automation runner for Sinovation AI Live Checks (Azure OpenAI)
import { app } from 'electron'
import { createRequire } from 'node:module'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const SHOTS_DIR = 'C:\\my_projects\\PhysLab-research\\09\\sandbox\\sino-shots'
const ARTIFACT_DIR = 'C:\\Users\\noob47\\.gemini\\antigravity\\brain\\793ee1dc-cce4-410e-8aba-a850194579e4\\azure-shots'
mkdirSync(SHOTS_DIR, { recursive: true })
mkdirSync(ARTIFACT_DIR, { recursive: true })

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = (o) => process.stdout.write(`AZURE_CHECK ${JSON.stringify(o)}\n`)

const results = []

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
      out({ step: 'init', msg: 'Window loaded for Azure checks' })

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
        try {
          writeFileSync(join(ARTIFACT_DIR, filename), png)
        } catch {}
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

      const waitForReply = async (timeoutSec = 60) => {
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
            await wait(2000)
            return res
          }
        }
        throw new Error('AI response timed out')
      }

      // Pre-flight check: Verify Azure is configured and test connection
      const activeProvider = await exec(`window.__physlab_debug.useAiStore.getState().provider`)
      out({ step: 'provider_check', activeProvider })

      // ==========================================
      // SECTION 1: Ceva's Theorem (3 runs)
      // ==========================================
      for (let run = 1; run <= 3; run++) {
        out({ step: `ceva_run_${run}`, msg: `Starting Ceva's theorem run ${run}` })
        await exec(`
          window.__physlab_debug.enterMode('shapes');
          window.__physlab_debug.useScene.getState().newScene();
          window.__physlab_debug.useTheme.getState().set('light');
          window.__physlab_debug.useAiStore.getState().createThread();
        `)
        await wait(1000)

        await sendPrompt("Construct Ceva's theorem on triangle A(0,4), B(-3,-2), C(3,-2) with cevians meeting at P and measure the ratio")
        const reply1 = await waitForReply(60)
        await wait(2000)
        const shot1 = await snap(`ceva-run-${run}.png`)
        const objs1 = await exec(`Object.values(window.__physlab_debug.useScene.getState().objects).map(o => o.name)`)
        out({
          step: `ceva_run_${run}_result`,
          model: reply1.model,
          badge: reply1.verification?.badgeText,
          objs: objs1,
          shot: shot1,
          contentPreview: String(reply1.content).slice(0, 250)
        })

        // Follow up: "move D"
        await sendPrompt("move D")
        const reply2 = await waitForReply(60)
        await wait(2000)
        const shot2 = await snap(`ceva-moveD-${run}.png`)
        out({
          step: `ceva_moveD_${run}_result`,
          model: reply2.model,
          shot: shot2,
          contentPreview: String(reply2.content).slice(0, 250)
        })
      }

      // ==========================================
      // SECTION 2: Part E Live Checks (3 runs each)
      // ==========================================
      // 2A. Remove the circle (3 runs)
      for (let run = 1; run <= 3; run++) {
        out({ step: `remove_circle_run_${run}` })
        await exec(`(async () => {
          window.__physlab_debug.enterMode('shapes');
          window.__physlab_debug.useScene.getState().newScene();
          window.__physlab_debug.useAiStore.getState().createThread();
          await window.__physlab_debug.runCommand('c = circle((0,0), 2)');
        })()`)
        await wait(1000)
        const beforeCircle = await exec(`Object.values(window.__physlab_debug.useScene.getState().objects).map(o => o.name)`)
        out({ step: `remove_circle_${run}_before`, beforeCircle })

        await sendPrompt("remove the circle")
        const rep = await waitForReply(60)
        await wait(1500)
        const afterCircle = await exec(`Object.values(window.__physlab_debug.useScene.getState().objects).map(o => o.name)`)
        const shot = await snap(`remove-circle-${run}.png`)
        out({
          step: `remove_circle_${run}_result`,
          afterCircle,
          removed: !afterCircle.includes('c'),
          shot,
          model: rep.model
        })
      }

      // 2B. Clear the graph (3 runs)
      for (let run = 1; run <= 3; run++) {
        out({ step: `clear_graph_run_${run}` })
        await exec(`(async () => {
          window.__physlab_debug.enterMode('graphing');
          window.__physlab_debug.useScene.getState().newScene();
          window.__physlab_debug.useAiStore.getState().createThread();
          await window.__physlab_debug.runCommand('plot(x^2)');
        })()`)
        await wait(1000)
        const beforeGraph = await exec(`Object.values(window.__physlab_debug.useScene.getState().objects).map(o => o.name)`)
        out({ step: `clear_graph_${run}_before`, beforeGraph })

        await sendPrompt("clear the graph")
        const rep = await waitForReply(60)
        await wait(1500)
        const afterGraph = await exec(`Object.values(window.__physlab_debug.useScene.getState().objects).map(o => o.name)`)
        const shot = await snap(`clear-graph-${run}.png`)
        out({
          step: `clear_graph_${run}_result`,
          afterGraph,
          cleared: afterGraph.length === 0,
          shot,
          model: rep.model
        })
      }

      // 2C. Plot y = sin x then remove it (3 runs)
      for (let run = 1; run <= 3; run++) {
        out({ step: `plot_sin_remove_run_${run}` })
        await exec(`
          window.__physlab_debug.enterMode('graphing');
          window.__physlab_debug.useScene.getState().newScene();
          window.__physlab_debug.useAiStore.getState().createThread();
        `)
        await wait(1000)

        await sendPrompt("plot y = sin x then remove it")
        const rep = await waitForReply(60)
        await wait(1500)
        const afterSin = await exec(`Object.values(window.__physlab_debug.useScene.getState().objects).map(o => o.name)`)
        const shot = await snap(`plot-sin-remove-${run}.png`)
        out({
          step: `plot_sin_remove_${run}_result`,
          afterSin,
          shot,
          model: rep.model,
          contentPreview: String(rep.content).slice(0, 250)
        })
      }

      // ==========================================
      // SECTION 3: Projectile on Azure (5 runs)
      // ==========================================
      for (let run = 1; run <= 5; run++) {
        out({ step: `projectile_run_${run}`, msg: `Starting Projectile run ${run}/5` })
        await exec(`
          window.__physlab_debug.enterMode('sandbox');
          window.__physlab_debug.useTheme.getState().set('light');
          window.__physlab_debug.useScene.getState().newScene();
          window.__physlab_debug.loadExperiment('cradle');
          window.__physlab_debug.useAiStore.getState().createThread();
        `)
        await wait(1500)

        // Check cradle is active before prompt
        const cradleBefore = await exec(`window.__physlab_debug.useSandbox.getState().bodies.length`)
        out({ step: `projectile_${run}_cradle_count`, cradleBefore })

        await sendPrompt("A ball is thrown at 20 m/s at 45°. How far does it go? Show it.")
        const rep = await waitForReply(60)

        // Play until ball lands (3.5s)
        await exec(`window.__physlab_debug.useScene.getState().setPlaying(true);`)
        await wait(3600)
        await exec(`window.__physlab_debug.useScene.getState().setPlaying(false);`)
        await wait(600)

        const pData = await exec(`(() => {
          const time = window.__physlab_debug.useSandbox.getState().engineTime;
          const pBall = window.__physlab_debug.useSandbox.getState().bodies.find(b => b.name === 'P');
          const live = window.__physlab_debug.useSandbox.getState().live;
          const livePos = pBall && live[pBall.id] ? live[pBall.id].position : null;
          const cradleBodies = window.__physlab_debug.useSandbox.getState().bodies.filter(b => b.name && b.name.includes('bob'));
          return {
            time,
            livePos,
            hasPBall: !!pBall,
            cradleBodiesRemaining: cradleBodies.length
          };
        })()`)

        const shot = await snap(`projectile-run-${run}.png`)
        out({
          step: `projectile_run_${run}_result`,
          has4077: String(rep.content).includes('40.77'),
          badge: rep.verification?.badgeText,
          model: rep.model,
          pData,
          shot
        })
      }

      out({ step: 'all_checks_complete', ok: true })
    } catch (err) {
      out({ step: 'fatal', error: String(err && err.stack ? err.stack : err) })
    } finally {
      win.destroy()
      app.exit(0)
    }
  })
})

// Load main process
createRequire(import.meta.url)('../out/main/index.js')
