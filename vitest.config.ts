import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Packages resolve one another through their `exports` field, i.e. through
    // `dist/`. `pnpm test` therefore runs `tsc -b` first. That is deliberate:
    // the tests exercise the *published* surface of each bounded context,
    // not its internals.
    environment: 'node',
  },
})
