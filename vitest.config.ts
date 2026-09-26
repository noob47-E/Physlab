// Only the files under tests/ are tests. Without the include the runner walked into node_modules,
// the packaged build (out/, dist/) and any sibling worktree (../physlab-wt) and found "tests"
// there too. The include, anchored at tests/, is the whole guard: none of those places can match
// it, so they need no exclude entry, and vitest's own default exclusions still apply.

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts']
  }
})
