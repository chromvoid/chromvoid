import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/e2e/**/*.test.ts'],
    setupFiles: ['tests/e2e/tauri-setup.ts'],
    hookTimeout: 120_000,
    testTimeout: 120_000,
  },
})
