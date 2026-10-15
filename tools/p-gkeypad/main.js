/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS Electron capture script */
// GKEYPAD pictures: Graphing keypad, typeset lines, 3-D z = x^2 - y^2, Calculator unchanged. 1366x768, Light + Moonlight.
const fs = require('fs'), os = require('os'), path = require('path')
const { app, BrowserWindow } = require('electron')
const url = process.argv[2] || 'http://[::1]:5492/'
const outDir = process.argv[3] || 'C:/my_projects/PhysLab-research/09/sandbox/reviews/GKEYPAD/pictures'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'gkp-')))
app.commandLine.appendSwitch('enable-unsafe-webgpu')
app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true })
  const win = new BrowserWindow({ width: 1366, height: 768, show: true, useContentSize: true, webPreferences: { backgroundThrottling: false } })
  const js = (c) => win.webContents.executeJavaScript(c, true)
  const log = []
  const note = (s) => { console.log(s); log.push(s) }
  const save = async (n) => { await sleep(600); fs.writeFileSync(path.join(outDir, n), (await win.webContents.capturePage()).toPNG()); note('saved ' + n) }
  const click = (label) => js(`(() => { const w = ${JSON.stringify(label)}.toLowerCase(); const all = [...document.querySelectorAll('button,[role=button]')];
    const b = all.find(b => (b.innerText||'').trim().toLowerCase() === w) || all.find(b => (b.getAttribute('aria-label')||'').toLowerCase() === w) || all.find(b => (b.innerText||'').toLowerCase().includes(w));
    if (!b) return 'NOT FOUND: ' + w; b.click(); return 'ok' })()`).then((r) => { if (r !== 'ok') note(r) })
  // keypad keys carry their hint as the title
  const key = (title) => js(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.title === ${JSON.stringify(title)}); if (!b) return 'NOT FOUND key: ${title}'; b.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true})); b.click(); return 'ok' })()`).then(async (r) => { if (r !== 'ok') note(r); await sleep(120) })
  const keys = async (...t) => { for (const x of t) await key(x) }
  try {
    await win.loadURL(url)
    for (let i = 0; i < 90; i++) { if (await js(`!!document.body && document.body.innerText.includes('Calculator')`).catch(() => false)) break; await sleep(1000) }
    await sleep(2000); await click('Skip')
    for (const theme of ['moonlight', 'light']) {
      await js(`import('/src/app/theme.ts').then((m) => m.useTheme.getState().set('${theme}'))`)
      await click('Calculator'); await sleep(1500)
      await save(theme + '-calculator.png')
      await click('Graphing'); await sleep(2500)
      await js(`import('/src/core/store.ts').then((m) => m.useScene.getState().setViewMode('2d'))`); await sleep(800)
      const on = await js(`document.querySelector('[aria-label="Keypad"]')?.getAttribute('aria-pressed')`)
      if (on !== 'true') await click('Keypad')
      await sleep(500)
      await js(`document.getElementById('expressions-new')?.focus()`)
      await keys('The variable y', 'Equals', 'The variable x', 'A power', 'Two', 'Move the caret right', 'Add', 'One', 'Divide', 'Two')
      await save(theme + '-graph-typing.png')
      await keys('Finish this line and start a new one')
      await keys('The variable y', 'Equals', 'Sine', 'The variable x', 'Move the caret right', 'Finish this line and start a new one')
      await keys('The variable y', 'Equals', 'Two', 'The variable x', 'Finish this line and start a new one')
      await save(theme + '-graph-three-lines.png')
      await js(`import('/src/core/store.ts').then((m) => m.useScene.getState().setViewMode('3d'))`); await sleep(2500)
      await js(`document.getElementById('expressions-new')?.focus()`)
      await keys('The variable z (3-D graphs)', 'Equals', 'The variable x', 'A power', 'Two', 'Move the caret right', 'Subtract', 'The variable y', 'A power', 'Two', 'Move the caret right', 'Finish this line and start a new one')
      await sleep(2500)
      await save(theme + '-graph-3d.png')
      note(theme + ' errors: ' + await js(`(document.body.innerText.match(/hit a problem/g) || []).length`))
    }
  } catch (e) { note('ERROR ' + (e && e.stack ? e.stack : e)) }
  fs.writeFileSync(path.join(outDir, 'capture-log.txt'), log.join('\n'))
  app.quit()
})
