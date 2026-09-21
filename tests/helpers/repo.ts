// Paths inside the repository, from wherever vitest was started. A test that read a source file
// through a cwd-relative path passed from the repo root and failed from anywhere else, including
// a worktree opened in an editor whose cwd was the parent folder.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The repository root (the folder holding package.json), whatever the current directory is. */
export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** The renderer's source folder, where nearly every file a test wants to read lives. */
export const RENDERER_SRC = join(REPO_ROOT, 'src', 'renderer', 'src')

/** An absolute path from repo-relative parts: repoPath('src', 'renderer', 'src', 'lang', 'commands.ts'). */
export const repoPath = (...parts: string[]): string => join(REPO_ROOT, ...parts)

/** A source file's text, by its path from the repo root ('src/renderer/src/workers/cas.worker.ts'). */
export const readSource = (relative: string): string => readFileSync(join(REPO_ROOT, ...relative.split('/')), 'utf8')
