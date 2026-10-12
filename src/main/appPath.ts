// Which file an app:// request means. Kept apart from index.ts, which needs Electron to load, so a test can check it:
// a malformed percent-escape (/%E0%A4%A) used to throw inside the protocol handler instead of answering (P-FIX-APPPROTO).

import { isAbsolute, join, normalize, relative, sep } from 'node:path'

/** The file to serve, or the status to answer with: 400 for a path that cannot be read, 403 for one outside root. */
type AppPath = { file: string } | { status: 400 | 403 }

export function resolveAppPath(root: string, requestUrl: string): AppPath {
  let pathname: string
  try {
    pathname = decodeURIComponent(new URL(requestUrl).pathname)
  } catch {
    return { status: 400 }
  }
  // No file the app serves has a NUL or a colon in its name; a colon is how a drive letter (C:) or a Windows stream
  // would ride in.
  if (pathname.includes('\0') || pathname.includes(':')) return { status: 400 }
  if (pathname === '/' || pathname === '') pathname = '/index.html'
  const file = normalize(join(root, pathname))
  // relative() handles Windows drive-letter case, where startsWith can wrongly refuse every file.
  const rel = relative(root, file)
  if (!rel || rel.startsWith('..') || rel.includes(`..${sep}`) || isAbsolute(rel)) return { status: 403 }
  return { file }
}
