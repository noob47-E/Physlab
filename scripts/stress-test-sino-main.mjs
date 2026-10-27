// Nervous Presenter Stress Test for Sinovation 2026
import { app } from 'electron'
import { createRequire } from 'node:module'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = (o) => process.stdout.write(`STRESS ${JSON.stringify(o)}\n`)

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
      out({ step: 'init', msg: 'Stress test started' })

      const exec = (code) => wc.executeJavaScript(code)

      // Test 1: Rapid Play / Pause clicking (20 rapid toggles)
      out({ step: 'rapid_play_pause', msg: 'Rapidly clicking Play/Pause 20 times' })
      for (let i = 0; i < 20; i++) {
        await exec(`window.__physlab_debug.useScene.getState().setPlaying(!window.__physlab_debug.useScene.getState().playing)`)
        await wait(50)
      }
      await wait(500)
      out({ step: 'rapid_play_pause', ok: true })

      // Test 2: Rapid Mode Switching while simulation runs
      out({ step: 'rapid_mode_switching', msg: 'Rapid mode switching while simulation plays' })
      await exec(`
        window.__physlab_debug.enterMode('sandbox');
        window.__physlab_debug.loadExperiment('projectile');
        window.__physlab_debug.useScene.getState().setPlaying(true);
      `)
      const modes = ['vectors', 'graphing', 'calculator', 'sandbox', 'problem_sets', 'sandbox']
      for (const m of modes) {
        await exec(`window.__physlab_debug.enterMode('${m}')`)
        await wait(150)
      }
      await wait(500)
      out({ step: 'rapid_mode_switching', ok: true })

      // Test 3: Rapid Window Resizing
      out({ step: 'rapid_window_resize', msg: 'Rapidly resizing window' })
      const sizes = [
        [1280, 720],
        [800, 600],
        [1920, 1080],
        [1024, 768],
        [1440, 900]
      ]
      for (const [w, h] of sizes) {
        win.setSize(w, h)
        await wait(100)
      }
      await wait(500)
      out({ step: 'rapid_window_resize', ok: true })

      // Test 4: Rapid Reset and Play
      out({ step: 'rapid_reset_play', msg: 'Rapidly triggering Reset and Play' })
      for (let i = 0; i < 10; i++) {
        await exec(`
          window.__physlab_debug.useSandbox.getState().resetRun();
          window.__physlab_debug.useScene.getState().setPlaying(true);
        `)
        await wait(60)
        await exec(`window.__physlab_debug.useScene.getState().setPlaying(false);`)
        await wait(40)
      }
      await wait(500)
      out({ step: 'rapid_reset_play', ok: true })

      // Test 5: Rapid Theme Cycling
      out({ step: 'rapid_theme_cycling', msg: 'Rapidly switching themes' })
      const themes = ['light', 'moonlight', 'dark', 'moongold', 'light']
      for (const th of themes) {
        await exec(`window.__physlab_debug.useTheme.getState().set('${th}')`)
        await wait(100)
      }
      await wait(500)
      out({ step: 'rapid_theme_cycling', ok: true })

      // Test 6: Aggressive tape scrubbing while running
      out({ step: 'tape_scrub_stress', msg: 'Aggressive tape scrubbing' })
      await exec(`
        window.__physlab_debug.loadExperiment('bounce');
        window.__physlab_debug.useScene.getState().setPlaying(true);
      `)
      await wait(2000)
      for (let i = 0; i < 15; i++) {
        const step = Math.floor(Math.random() * 400)
        await exec(`window.__physlab_debug.useTape.getState().scrubTo(${step})`)
        await wait(50)
      }
      await exec(`window.__physlab_debug.useTape.getState().backToLive()`)
      await wait(500)
      out({ step: 'tape_scrub_stress', ok: true })

      // Test 7: Verify app is still responsive and healthy
      const healthy = await exec(`(() => {
        const time = window.__physlab_debug.useSandbox.getState().engineTime;
        const bodies = window.__physlab_debug.useSandbox.getState().bodies.length;
        return { healthy: true, time, bodies };
      })()`)
      out({ step: 'health_check', healthy, errorsCount: errors.length, errors })
    } catch (err) {
      out({ step: 'stress_fatal', error: String(err && err.stack ? err.stack : err) })
    } finally {
      win.destroy()
      app.exit(0)
    }
  })
})

// Load main process
createRequire(import.meta.url)('../out/main/index.js')
