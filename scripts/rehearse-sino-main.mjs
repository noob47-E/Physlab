// Rehearsal driver for Sinovation 2026 Sandbox demo (DEMO-SCRIPT-28OCT.md)
import { app, BrowserWindow } from 'electron'
import { createRequire } from 'node:module'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const SHOTS_DIR = 'C:\\my_projects\\PhysLab-research\\09\\sandbox\\sino-shots'
mkdirSync(SHOTS_DIR, { recursive: true })

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = (o) => process.stdout.write(`REHEARSE ${JSON.stringify(o)}\n`)

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
      await wait(4000)
      out({ step: 'init', msg: 'Window loaded and initialized' })

      const exec = async (code) => {
        try {
          return await wc.executeJavaScript(code)
        } catch (err) {
          out({ step: 'exec_fail', codeSnippet: code.slice(0, 120), error: err.message })
          throw err
        }
      }

      const snap = async (filename) => {
        const img = await wc.capturePage()
        const p = join(SHOTS_DIR, filename)
        writeFileSync(p, img.toPNG())
        return p
      }

      const dismissTour = async () => {
        try {
          await exec(`(() => {
            try {
              localStorage.setItem('physlab.tourSeen', '1');
              localStorage.setItem('physlab.chipHidden', '1');
            } catch {}
            try {
              const btns = Array.from(document.querySelectorAll('button'));
              const skip = btns.find(b => b.textContent?.trim() === 'Skip');
              if (skip) skip.click();
            } catch {}
            return true;
          })()`)
        } catch {}
      }
      await dismissTour()

      // Clear any prior autosave so recovery banner doesn't appear
      await exec(`
        if (window.physlab?.autosaveClear) {
          window.physlab.autosaveClear();
        }
        const discardBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Discard');
        if (discardBtn) discardBtn.click();
        const closeAiBtn = document.querySelector('button[title="Close AI Tutor"]');
        if (closeAiBtn) closeAiBtn.click();
      `)
      const geminiKey = process.env.GEMINI_API_KEY || ''
      if (geminiKey) {
        await exec(`
          if (window.physlab?.ai?.setKey) {
            window.physlab.ai.setKey(${JSON.stringify(geminiKey)}, 'gemini');
          }
        `)
      }

      // Step 1: Switch to Sandbox mode and Light theme
      out({ step: 's1_projectile', msg: 'Setting up Projectile in Light theme' })
      await exec(`
        window.__physlab_debug.enterMode('sandbox');
        window.__physlab_debug.useTheme.getState().set('light');
        window.__physlab_debug.loadExperiment('projectile');
      `)
      await wait(1000)
      // Play until ball lands (takes ~1.43s, so play for 1800ms)
      await exec(`window.__physlab_debug.useScene.getState().setPlaying(true);`)
      await wait(2200)
      await exec(`window.__physlab_debug.useScene.getState().setPlaying(false);`)
      await wait(300)

      const s1Data = await exec(`(() => {
        const time = window.__physlab_debug.useSandbox.getState().engineTime;
        const pBall = window.__physlab_debug.useSandbox.getState().bodies.find(b => b.name === 'P');
        const live = window.__physlab_debug.useSandbox.getState().live;
        const livePos = pBall && live[pBall.id] ? live[pBall.id].position : null;
        return { time, livePos };
      })()`)
      const shot1 = await snap('01-projectile-landing.png')
      results.push({ step: '01-projectile', shot: shot1, data: s1Data })
      out({ step: '01-projectile', ok: true, data: s1Data })

      // Step 2: Step-rate control 600
      out({ step: 's2_step600', msg: 'Running Projectile at 600 steps/s' })
      await exec(`
        window.__physlab_debug.useSandbox.getState().setWorld({ stepRate: 600 });
        window.__physlab_debug.loadExperiment('projectile');
      `)
      await wait(800)
      await exec(`window.__physlab_debug.useScene.getState().setPlaying(true);`)
      await wait(2200)
      await exec(`window.__physlab_debug.useScene.getState().setPlaying(false);`)
      await wait(300)
      const s2Data = await exec(`(() => {
        const pBall = window.__physlab_debug.useSandbox.getState().bodies.find(b => b.name === 'P');
        const live = window.__physlab_debug.useSandbox.getState().live;
        return { livePos: pBall && live[pBall.id] ? live[pBall.id].position : null };
      })()`)
      const shot2 = await snap('02-projectile-600steps.png')
      results.push({ step: '02-projectile-600', shot: shot2, data: s2Data })
      out({ step: '02-projectile-600', ok: true, data: s2Data })

      // Step 3: Step-rate control 60
      out({ step: 's3_step60', msg: 'Running Projectile at 60 steps/s' })
      await exec(`
        window.__physlab_debug.useSandbox.getState().setWorld({ stepRate: 60 });
        window.__physlab_debug.loadExperiment('projectile');
      `)
      await wait(800)
      await exec(`window.__physlab_debug.useScene.getState().setPlaying(true);`)
      await wait(2200)
      await exec(`window.__physlab_debug.useScene.getState().setPlaying(false);`)
      await wait(300)
      const s3Data = await exec(`(() => {
        const pBall = window.__physlab_debug.useSandbox.getState().bodies.find(b => b.name === 'P');
        const live = window.__physlab_debug.useSandbox.getState().live;
        return { livePos: pBall && live[pBall.id] ? live[pBall.id].position : null };
      })()`)
      const shot3 = await snap('03-projectile-60steps.png')
      // Reset rate back to 240
      await exec(`window.__physlab_debug.useSandbox.getState().setWorld({ stepRate: 240 });`)
      results.push({ step: '03-projectile-60', shot: shot3, data: s3Data })
      out({ step: '03-projectile-60', ok: true, data: s3Data })

      // Step 4: Bouncing ball: rewind & replay
      out({ step: 's4_bounce', msg: 'Bouncing ball: run 4s, pause, rewind' })
      await exec(`
        window.__physlab_debug.loadExperiment('bounce');
      `)
      await wait(800)
      await exec(`window.__physlab_debug.useScene.getState().setPlaying(true);`)
      await wait(4200)
      await exec(`window.__physlab_debug.useScene.getState().setPlaying(false);`)
      await wait(300)
      // Rewind tape
      await exec(`
        const tape = window.__physlab_debug.useTape.getState();
        tape.pause();
        tape.scrubTo(tape.tape ? tape.tape.first + 10 : 0);
      `)
      await wait(500)
      const s4Data = await exec(`(() => {
        const t = window.__physlab_debug.useTape.getState();
        return { mode: t.mode, playhead: t.playhead };
      })()`)
      const shot4 = await snap('04-bouncing-ball-rewind.png')
      results.push({ step: '04-bounce-rewind', shot: shot4, data: s4Data })
      out({ step: '04-bounce-rewind', ok: true, data: s4Data })

      // Step 5: Fine replay around first bounce
      out({ step: 's5_fine', msg: 'Fine replay around first bounce' })
      await exec(`
        window.__physlab_debug.useTape.getState().scrubTo(Math.floor(0.78 * 240));
        window.__physlab_debug.useTape.getState().fineReplay();
      `)
      await wait(1500)
      const s5Data = await exec(`(() => {
        const t = window.__physlab_debug.useTape.getState();
        return { mode: t.mode };
      })()`)
      const shot5 = await snap('05-fine-replay-192m.png')
      results.push({ step: '05-fine-replay', shot: shot5, data: s5Data })
      out({ step: '05-fine-replay', ok: true, data: s5Data })

      // Step 6: Branch from here
      out({ step: 's6_branch', msg: 'Branch from here at t=2.0s with e=0.5' })
      await exec(`
        window.__physlab_debug.useTape.getState().backToLive();
      `)
      await wait(400)
      await exec(`
        window.__physlab_debug.useTape.getState().scrubTo(Math.floor(2.0 * 240));
        window.__physlab_debug.useTape.getState().branchHere();
      `)
      await wait(400)
      // Update ball restitution to 0.5
      await exec(`
        const ball = window.__physlab_debug.useSandbox.getState().bodies.find(b => b.name === 'Ball');
        if (ball) window.__physlab_debug.useSandbox.getState().updateBody(ball.id, { restitution: 0.5 });
        window.__physlab_debug.useScene.getState().setPlaying(true);
      `)
      await wait(1800)
      await exec(`window.__physlab_debug.useScene.getState().setPlaying(false);`)
      await wait(300)
      const s6Data = await exec(`(() => {
        const ball = window.__physlab_debug.useSandbox.getState().bodies.find(b => b.name === 'Ball');
        return { restitution: ball ? ball.restitution : null };
      })()`)
      const shot6 = await snap('06-branch-048m.png')
      results.push({ step: '06-branch', shot: shot6, data: s6Data })
      out({ step: '06-branch', ok: true, data: s6Data })

      // Step 7: Spring on ice
      out({ step: 's7_springice', msg: 'Spring on ice simulation' })
      await exec(`
        window.__physlab_debug.loadExperiment('springice');
      `)
      await wait(800)
      await exec(`window.__physlab_debug.useScene.getState().setPlaying(true);`)
      await wait(2600)
      await exec(`window.__physlab_debug.useScene.getState().setPlaying(false);`)
      await wait(300)
      const s7Data = await exec(`(() => {
        const block = window.__physlab_debug.useSandbox.getState().bodies.find(b => b.name === 'M');
        const live = window.__physlab_debug.useSandbox.getState().live;
        return {
          livePos: block && live[block.id] ? live[block.id].position : null,
          time: window.__physlab_debug.useSandbox.getState().engineTime
        };
      })()`)
      const shot7 = await snap('07-spring-on-ice.png')
      results.push({ step: '07-spring-on-ice', shot: shot7, data: s7Data })
      out({ step: '07-spring-on-ice', ok: true, data: s7Data })

      // Step 8: Collision Lab e = 1
      out({ step: 's8_collision_e1', msg: 'Collision Lab 1D with e = 1' })
      await exec(`
        window.__physlab_debug.loadExperiment('lab1d');
      `)
      await wait(800)
      await exec(`window.__physlab_debug.useScene.getState().setPlaying(true);`)
      // Carts collide around t = 0.83s, pause around 1.3s
      await wait(1600)
      await exec(`window.__physlab_debug.useScene.getState().setPlaying(false);`)
      await wait(300)
      const shot8 = await snap('08-collision-e1.png')
      results.push({ step: '08-collision-e1', shot: shot8 })
      out({ step: '08-collision-e1', ok: true })

      // Step 9: Collision Lab e = 0.5
      out({ step: 's9_collision_e05', msg: 'Collision Lab 1D with e = 0.5' })
      await exec(`
        const p = { ...window.__physlab_debug.LAB_DEFAULTS.lab1d, e: 0.5 };
        const sc = window.__physlab_debug.buildScene('lab1d', p);
        window.__physlab_debug.useSandbox.getState().loadBuilt('lab1d', sc, { applyViewHint: false });
        window.__physlab_debug.useScene.getState().setPlaying(true);
      `)
      await wait(1600)
      await exec(`window.__physlab_debug.useScene.getState().setPlaying(false);`)
      await wait(300)
      const shot9 = await snap('09-collision-e05.png')
      results.push({ step: '09-collision-e05', shot: shot9 })
      out({ step: '09-collision-e05', ok: true })

      // Step 10: Collision Lab e = 0
      out({ step: 's10_collision_e0', msg: 'Collision Lab 1D with e = 0' })
      await exec(`
        const p0 = { ...window.__physlab_debug.LAB_DEFAULTS.lab1d, e: 0.0 };
        const sc0 = window.__physlab_debug.buildScene('lab1d', p0);
        window.__physlab_debug.useSandbox.getState().loadBuilt('lab1d', sc0, { applyViewHint: false });
        window.__physlab_debug.useScene.getState().setPlaying(true);
      `)
      await wait(1600)
      await exec(`window.__physlab_debug.useScene.getState().setPlaying(false);`)
      await wait(300)
      const shot10 = await snap('10-collision-e0.png')
      results.push({ step: '10-collision-e0', shot: shot10 })
      out({ step: '10-collision-e0', ok: true })

      // Step 11: Collision Lab 3D View Flip
      out({ step: 's11_3d_toggle', msg: 'Toggling to 3D view in Collision Lab' })
      await exec(`
        window.__physlab_debug.useSandbox.getState().setSideView(false);
      `)
      await wait(800)
      const shot11 = await snap('11-collision-3d.png')
      results.push({ step: '11-collision-3d', shot: shot11 })
      out({ step: '11-collision-3d', ok: true })

      // Step 12: Sliding to a stop (friction)
      out({ step: 's12_friction', msg: 'Sliding to a stop experiment' })
      await exec(`
        window.__physlab_debug.useScene.getState().setViewMode('2d');
        window.__physlab_debug.loadExperiment('friction');
      `)
      await wait(800)
      await exec(`window.__physlab_debug.useScene.getState().setPlaying(true);`)
      await wait(2400)
      await exec(`window.__physlab_debug.useScene.getState().setPlaying(false);`)
      await wait(300)
      const s12Data = await exec(`(() => {
        const crate = window.__physlab_debug.useSandbox.getState().bodies.find(b => b.name === 'Crate');
        const live = window.__physlab_debug.useSandbox.getState().live;
        return {
          livePos: crate && live[crate.id] ? live[crate.id].position : null,
          liveVel: crate && live[crate.id] ? live[crate.id].velocity : null
        };
      })()`)
      const shot12 = await snap('12-sliding-stop.png')
      results.push({ step: '12-sliding-stop', shot: shot12, data: s12Data })
      out({ step: '12-sliding-stop', ok: true, data: s12Data })

      // Step 13: Newton's Cradle & Moonlight Theme
      out({ step: 's13_newton_moonlight', msg: 'Newton cradle in Moonlight theme' })
      await exec(`
        window.__physlab_debug.useTheme.getState().set('moonlight');
        window.__physlab_debug.loadExperiment('labcradle');
      `)
      await wait(800)
      await exec(`window.__physlab_debug.useScene.getState().setPlaying(true);`)
      await wait(2000)
      await exec(`window.__physlab_debug.useScene.getState().setPlaying(false);`)
      await wait(300)
      const shot13 = await snap('13-newtons-cradle-moonlight.png')
      results.push({ step: '13-newton-moonlight', shot: shot13 })
      out({ step: '13-newton-moonlight', ok: true })

      // Step 14: AI Wow Segment (Projectile simulation)
      out({ step: 's14_ai_wow', msg: 'AI Wow Segment: solving projectile and launching simulation' })
      const prep = await exec(`(() => {
        try {
          if (window.__physlab_debug && window.__physlab_debug.showPanel) {
            window.__physlab_debug.showPanel('ai_copilot');
          }
          if (window.__physlab_debug && window.__physlab_debug.useAiStore) {
            window.__physlab_debug.useAiStore.getState().createThread();
          }
          return { ok: true };
        } catch (e) {
          return { ok: false, error: e.message, stack: e.stack };
        }
      })()`)
      out({ step: 's14_prep', prep })
      await wait(1500)
      // Inject AI question into AI input field and trigger Enter
      const aiTriggered = await exec(`(async () => {
        let input = document.querySelector('textarea, input[placeholder*="Ask"]');
        for (let i = 0; i < 20 && !input; i++) {
          await new Promise(r => setTimeout(r, 200));
          input = document.querySelector('textarea, input[placeholder*="Ask"]');
        }
        if (!input) return 'no AI input field found';
        const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set ||
                    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        input.focus();
        set.call(input, "A ball is thrown at 20 m/s at 45°. How far does it go? Show it.");
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        const sendBtn = input.parentElement?.querySelector('button:not([title*="Stop"])');
        if (sendBtn) sendBtn.click();
        return 'submitted';
      })()`)
      out({ step: 's14_ai_submitted', status: aiTriggered })

      // Wait up to 60s for AI reply to finish streaming, verify, and render
      let aiDone = false
      for (let i = 0; i < 60; i++) {
        await wait(1000)
        const check = await exec(`(() => {
          const ai = window.__physlab_debug.useAiStore ? window.__physlab_debug.useAiStore.getState() : null;
          const isStreaming = ai ? ai.isStreaming : false;
          const thread = ai ? ai.threads.find(t => t.id === ai.activeThreadId) : null;
          const lastMsg = thread && thread.messages ? thread.messages[thread.messages.length - 1] : null;
          const hasAssistant = lastMsg && lastMsg.role === 'assistant';
          const has4077 = hasAssistant && String(lastMsg.content).includes('40.77');
          const badgeText = lastMsg && lastMsg.verification ? lastMsg.verification.badgeText : null;
          const pBall = window.__physlab_debug.useSandbox.getState().bodies.find(b => b.name === 'P');
          return { isStreaming, has4077, badgeText, hasPBall: !!pBall, msgLen: thread ? thread.messages.length : 0 };
        })()`)
        if (check && !check.isStreaming && (check.has4077 || check.msgLen > 1)) {
          aiDone = true
          await wait(3000) // let DOM and 3D scene paint completely
          break
        }
      }
      await dismissTour()
      const shot14 = await snap('14-ai-wow-projectile.png')
      results.push({ step: '14-ai-wow', shot: shot14, aiDone })
      out({ step: '14-ai-wow', ok: aiDone })

      out({ step: 'summary', errors, resultsCount: results.length })
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
