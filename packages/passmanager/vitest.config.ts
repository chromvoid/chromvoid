import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vitest/config'

const require = createRequire(import.meta.url)
const reatomCorePath = require.resolve('@reatom/core')
const projectI18nPath = fileURLToPath(new URL('../i18n/src/index.ts', import.meta.url))
const projectUtilsPath = fileURLToPath(new URL('../utils/src/index.ts', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@project/i18n': projectI18nPath,
      '@project/utils': projectUtilsPath,
      '@reatom/core': reatomCorePath,
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    server: {
      deps: {
        inline: [/@reatom\//],
      },
    },
  },
})
