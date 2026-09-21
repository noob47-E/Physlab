// Only the files under tests/ are tests. Without the include the runner walked into node_modules,
// the packaged build and any sibling worktree (../physlab-wt) and found "tests" there too.

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/out/**', '**/dist/**', '../physlab-wt/**']
  }
})
