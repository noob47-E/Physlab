// Only the files under tests/ are tests. Without the include the runner walked into node_modules,
// the packaged build (out/, dist/) and any sibling worktree and found "tests" there too; the
// include alone is what keeps them out, and the default exclude list is kept so vitest's own
// exclusions (.git, config files) still apply.

import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: [...configDefaults.exclude]
  }
})
