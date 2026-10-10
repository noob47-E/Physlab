// The runtime smoke test's Electron entry (CLEANUP-PLAN.md CW14): run by scripts/smoke.mjs after a
// build, never by hand. It loads the app's own built main process, so the window, its preload and
// its handlers are the real ones; hides that window; opens every ready mode by clicking its tab
// (or its row under More modes) as a student would; does one thing in each; and prints one JSON
// line per mode with the console errors and crashes seen. The app's user data goes to the empty
// folder smoke.mjs made for this run (and removes after), so a student's saved work, layout and
// settings are never read or changed.

import { app } from 'electron'
import { createRequire } from 'node:module'

const userData = process.env.PHYSLAB_SMOKE_USERDATA
if (!userData) {
  process.stdout.write('SMOKE {"step":"driver","errors":["run through scripts/smoke.mjs, which makes the user-data folder"]}\n')
  process.exit(1)
}
app.setPath('userData', userData)

/**
 * Every ready mode by its tab label, and one thing a student does there first. A mode the bar
 * shows that is not listed here fails the run, so a new mode cannot be skipped without a word.
 */
const MODES = [
  { label: 'Calculator', action: { math: '2+3', expect: '5' } },
  { label: 'Vectors', action: { bar: 'A = <3, 4>' } },
  { label: 'Geometry', action: { bar: 'Triangle((0,0), (4,0), (0,3))' } },
  { label: 'Graphing', action: { bar: 'y = x^2 - 4' } },
  { label: 'Sandbox', action: { click: 'button[title^="Play / pause"]' } },
  // A hidden window shows only that the GPU Lab opens and starts without an error; nothing on screen is checked.
  { label: 'GPU Lab', action: null },
  { label: 'Lab Data', action: { click: 'button[title="Start another table"]' } },
  { label: 'Problem Sets', action: { click: '[data-tour="start-practice"]:not([disabled])' } }
]

const out = (o) => process.stdout.write(`SMOKE ${JSON.stringify(o)}\n`)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
process.on('uncaughtException', (err) => out({ step: 'main process', errors: [`uncaught: ${err && err.message}`] }))
process.on('unhandledRejection', (err) => out({ step: 'main process', errors: [`unhandled rejection: ${err && err.message}`] }))

// The bar keeps a hidden copy of every tab to measure them (aria-hidden): only the drawn ones count.
const SHOWN = `const shown = (sel) => [...document.querySelectorAll(sel)].filter((b) => !b.closest('[aria-hidden="true"]'))`

/** Runs in the page: every mode the bar offers, as tabs and as More modes rows (not the coming-soon ones). */
const offeredModes = `(async () => {
  ${SHOWN}
  const tabs = shown('button.mode-tab').map((b) => b.textContent.trim())
  const more = shown('button').find((b) => b.textContent.trim().startsWith('More modes'))
  let rows = []
  if (more) {
    more.click()
    await new Promise((r) => setTimeout(r, 300))
    rows = shown('[role=menuitem], .menu-item, button').filter((b) => b.closest('[role=menu], .menu-pop')).filter((b) => !b.disabled && !/coming soon/i.test(b.textContent)).map((b) => b.textContent.trim())
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  }
  return { tabs, rows }
})()`

/** Runs in the page: opens a mode by its label, through More modes when it has no tab. */
const openMode = (label) => `(async () => {
  ${SHOWN}
  let tab = shown('button.mode-tab').find((b) => b.textContent.trim() === ${JSON.stringify(label)})
  if (!tab) {
    const more = shown('button').find((b) => b.textContent.trim().startsWith('More modes'))
    if (!more) return 'no tab and no More modes button'
    more.click()
    await new Promise((r) => setTimeout(r, 300))
    tab = shown('button, [role=menuitem]').find((b) => b.textContent.trim().startsWith(${JSON.stringify(label)}))
  }
  if (!tab) return 'no tab or menu row'
  tab.click()
  return 'opened'
})()`

/** Runs in the page: one action, and what came of it. */
const act = (action) => `(async () => {
  const a = ${JSON.stringify(action)}
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  if (a.bar) {
    const bar = document.querySelector('input.cmd-input')
    if (!bar) return 'no command bar'
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    bar.focus()
    set.call(bar, a.bar)
    bar.dispatchEvent(new Event('input', { bubbles: true }))
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await sleep(500)
    // The bar empties itself once it has run a line.
    return bar.value === '' ? 'ran the line' : 'the line was not taken'
  }
  if (a.math) {
    const mf = document.querySelector('math-field')
    if (!mf) return 'no maths field'
    const before = document.body.innerText.split('\\n').filter((l) => l.trim() === a.expect).length
    mf.focus()
    mf.value = a.math
    mf.dispatchEvent(new Event('input', { bubbles: true }))
    mf.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await sleep(1000)
    const after = document.body.innerText.split('\\n').filter((l) => l.trim() === a.expect).length
    return after > before ? 'worked it out' : 'no answer line'
  }
  const b = document.querySelector(a.click)
  if (!b) return 'nothing at ' + a.click
  b.click()
  return 'clicked'
})()`

app.on('browser-window-created', (_e, win) => {
  win.hide()
  win.on('show', () => win.hide())
  const wc = win.webContents
  wc.setBackgroundThrottling(false)
  const errors = []
  wc.on('console-message', (details) => {
    if (details.level === 'error' || details.level === 3) errors.push(String(details.message).slice(0, 300))
  })
  wc.on('render-process-gone', (_ev, info) => errors.push(`renderer gone: ${info.reason}`))
  wc.on('preload-error', (_ev, _path, err) => errors.push(`preload error: ${err.message}`))
  wc.once('did-finish-load', async () => {
    try {
      await wait(4000)
      // smoke.mjs --self-test: one error on purpose, to prove a run with an error fails.
      if (process.env.PHYSLAB_SMOKE_SELF_TEST) await wc.executeJavaScript(`console.error('smoke self-test: an error on purpose')`)
      await wait(200)
      out({ step: 'start', offered: await wc.executeJavaScript(offeredModes), errors: errors.splice(0) })
      for (const m of MODES) {
        const opened = await wc.executeJavaScript(openMode(m.label))
        await wait(2500)
        // The tab the bar marks as open: the proof the mode really opened.
        const active = await wc.executeJavaScript(`document.querySelector('button.mode-tab[aria-current=page]')?.textContent.trim() ?? null`)
        const acted = m.action ? await wc.executeJavaScript(act(m.action)) : 'none'
        await wait(2000)
        out({ mode: m.label, opened, active, acted, errors: errors.splice(0) })
      }
      // Anything logged while the last mode settled.
      await wait(1000)
      out({ step: 'end', errors: errors.splice(0) })
    } catch (err) {
      out({ step: 'driver', errors: [String(err && err.message)] })
    }
    // Leave without the unsaved-work question: the run made changes on purpose. smoke.mjs removes the folder.
    win.destroy()
    app.exit(0)
  })
})

// The app's own main process (CommonJS), started once the hooks above are in place.
createRequire(import.meta.url)('../out/main/index.js')
