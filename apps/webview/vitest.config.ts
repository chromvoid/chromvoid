import {defineConfig} from 'vitest/config'

const enableE2E = process.env['DASHBOARD_E2E'] === '1'

export default defineConfig({
  test: {
    include: enableE2E ? ['tests/e2e/**/*.test.ts'] : [],
    environment: 'node',
    globals: true,
    setupFiles: ['tests/e2e/setup.ts'],
    hookTimeout: 60000,
    testTimeout: 60000,
  },
})
