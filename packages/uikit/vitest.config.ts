import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vitest/config'

const headlessIndex = fileURLToPath(new URL('../headless/src/index.ts', import.meta.url))
const headlessRoot = fileURLToPath(new URL('../headless/src/', import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@chromvoid/headless-ui',
        replacement: headlessIndex,
      },
      {
        find: /^@chromvoid\/headless-ui\/(.*)$/,
        replacement: `${headlessRoot}$1`,
      },
    ],
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
