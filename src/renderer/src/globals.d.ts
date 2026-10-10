/** The version from package.json, put here by the build (see electron.vite.config.ts). */
declare const __APP_VERSION__: string

interface Window {
  /**
   * The preload bridge (window.physlab), absent in the browser build: read it with `?.` and fall
   * back to the browser path. Declared here once, so each file reads it without its own cast.
   */
  physlab?: import('../../preload/index').PhysLabBridge
}
