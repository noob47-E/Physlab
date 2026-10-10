// The browser build's one way to send a file out and one way to take a file in. The desktop app
// uses its own bridge dialogs instead, so these run only in a browser. Nothing here reads `window`
// or `document` until a function is called, so the module can be imported in a node test.

/**
 * Starts a download of `href` under the name `name`. A link must be in the page to be clicked in
 * every browser, so it is added, clicked and taken out again straight away.
 */
export function downloadUrl(href: string, name: string): void {
  const a = document.createElement('a')
  a.href = href
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** Saves a blob as a file under `name`. */
export function saveBlob(blob: Blob, name: string): void {
  const href = URL.createObjectURL(blob)
  downloadUrl(href, name)
  // Let the browser start the download before revoking the object URL: Safari can cancel the
  // download when the URL is revoked in the same tick.
  setTimeout(() => URL.revokeObjectURL(href), 0)
}

/**
 * Asks for one file of the given `accept` types and resolves it, or null when the student cancels
 * or the picker brings no file. A fresh input each time, so the same file can be picked again.
 */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => {
      const file = input.files?.[0]
      resolve(file ?? null)
    }
    // A cancelled picker fires no change in every browser; `cancel` is the one that says so.
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}
