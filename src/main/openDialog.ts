// What the Open dialog shows. Kept apart from index.ts, which needs Electron to load, so a test
// can check the choice: the dialog used to be fixed to .phys, and a teacher opening a question
// file in the desktop app could not see a single .pqjson or .exam.

export interface OpenFilter {
  name: string
  extensions: string[]
}

export const PROJECT_FILTERS: OpenFilter[] = [{ name: 'PhysLab project', extensions: ['phys'] }]
const PROJECT_TITLE = 'Open PhysLab project'

const isFilter = (f: unknown): f is OpenFilter =>
  typeof f === 'object' &&
  f !== null &&
  typeof (f as OpenFilter).name === 'string' &&
  Array.isArray((f as OpenFilter).extensions) &&
  (f as OpenFilter).extensions.length > 0 &&
  (f as OpenFilter).extensions.every((e) => typeof e === 'string' && /^[A-Za-z0-9]+$/.test(e))

/**
 * The title and filters for one Open dialog. Nothing given (Open project) keeps the .phys
 * dialog exactly as it was; anything the renderer sends that is not a list of plain extensions
 * falls back to it too, rather than opening a dialog that filters on nonsense.
 */
export function openDialogOptions(filters?: unknown, title?: unknown): { title: string; filters: OpenFilter[] } {
  if (!Array.isArray(filters) || filters.length === 0 || !filters.every(isFilter)) return { title: PROJECT_TITLE, filters: PROJECT_FILTERS }
  return {
    title: typeof title === 'string' && title.trim() !== '' ? title : 'Open a file',
    filters: filters.map((f) => ({ name: f.name, extensions: [...f.extensions] }))
  }
}
