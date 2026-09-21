// The sentences the console shows when a project file cannot be opened or saved. Pure, so the
// wording can be tested without a window: app/files.ts reads `window` as it loads.

/** The last part of a path, whichever slash the platform used. */
const fileName = (path: string): string => path.split(/[\\/]/).pop() || path

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/**
 * Electron wraps anything the main process throws as "Error invoking remote method 'file:save':
 * Error: <message>". The student should read the message alone.
 */
export const plainBridgeError = (e: unknown): string => messageOf(e).replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, '')

/** "Could not open notes.phys: This file cannot be read: …" — the file's name, then the reason. */
export const openFailureText = (path: string, e: unknown): string => `Could not open ${fileName(path)}: ${plainBridgeError(e)}`

/**
 * A failed save used to be silent: the promise rejected, nothing was logged, and the title kept
 * its unsaved mark while the student believed Ctrl+S had worked.
 */
export const saveFailureText = (e: unknown): string => `Could not save: ${plainBridgeError(e)} Your work is still here — try Save As to another folder.`
