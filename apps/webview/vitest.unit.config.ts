import {createRequire} from 'module'
import {resolve} from 'path'
import {defineConfig} from 'vitest/config'

const require = createRequire(import.meta.url)
const reatomCoreEntry = require.resolve('@reatom/core')

export default defineConfig({
  root: '.',
  resolve: {
    alias: [
      {find: /^root\/(.+)$/, replacement: resolve(__dirname, 'src/$1')},
      {find: /^@project\/i18n$/, replacement: resolve(__dirname, '../../packages/i18n/src/index.ts')},
      {find: /^@project\/passmanager$/, replacement: resolve(__dirname, '../../packages/passmanager/src/index.ts')},
      {find: /^@project\/passmanager\/core$/, replacement: resolve(__dirname, '../../packages/passmanager/src/core.ts')},
      {find: /^@project\/passmanager\/types$/, replacement: resolve(__dirname, '../../packages/passmanager/src/types.ts')},
      {
        find: /^@project\/passmanager\/consts$/,
        replacement: resolve(__dirname, '../../packages/passmanager/src/consts.ts'),
      },
      {
        find: /^@project\/passmanager\/ports$/,
        replacement: resolve(__dirname, '../../packages/passmanager/src/ports/index.ts'),
      },
      {
        find: /^@project\/passmanager\/i18n$/,
        replacement: resolve(__dirname, '../../packages/passmanager/src/i18n/index.ts'),
      },
      {
        find: /^@project\/passmanager\/i18n\/format$/,
        replacement: resolve(__dirname, '../../packages/passmanager/src/i18n/format.ts'),
      },
      {
        find: /^@project\/passmanager\/password-utils$/,
        replacement: resolve(__dirname, '../../packages/passmanager/src/password-utils.ts'),
      },
      {
        find: /^@project\/passmanager\/security-audit$/,
        replacement: resolve(__dirname, '../../packages/passmanager/src/security-audit.ts'),
      },
      {find: /^@project\/passmanager\/urls$/, replacement: resolve(__dirname, '../../packages/passmanager/src/urls.ts')},
      {
        find: /^@project\/passmanager\/theme$/,
        replacement: resolve(__dirname, '../../packages/passmanager/src/service/theme.ts'),
      },
      {
        find: /^@project\/passmanager\/timer$/,
        replacement: resolve(__dirname, '../../packages/passmanager/src/timer.ts'),
      },
      {
        find: /^@project\/passmanager\/select$/,
        replacement: resolve(__dirname, '../../packages/passmanager/src/service/select.ts'),
      },
      {
        find: /^@project\/passmanager\/sorting$/,
        replacement: resolve(__dirname, '../../packages/passmanager/src/service/sorting.ts'),
      },
      {
        find: /^@project\/passmanager\/sort-storage$/,
        replacement: resolve(__dirname, '../../packages/passmanager/src/service/sort-storage.ts'),
      },
      {
        find: /^@project\/passmanager\/flags$/,
        replacement: resolve(__dirname, '../../packages/passmanager/src/service/flags.ts'),
      },
      {
        find: /^@project\/passmanager\/notify$/,
        replacement: resolve(__dirname, '../../packages/passmanager/src/service/notify.ts'),
      },
      {find: /^@chromvoid\/scheme$/, replacement: resolve(__dirname, '../../packages/scheme/src/index.ts')},
      {find: /^@chromvoid\/scheme\/(.+)$/, replacement: resolve(__dirname, '../../packages/scheme/src/$1')},
      {find: /^@chromvoid\/uikit$/, replacement: resolve(__dirname, '../../packages/uikit/src/index.ts')},
      {find: /^@chromvoid\/uikit\/(.+)$/, replacement: resolve(__dirname, '../../packages/uikit/src/$1')},
      {find: /^@reatom\/core$/, replacement: reatomCoreEntry},
      // Mock Tauri dependencies not available in the unit environment (jsdom)
      {
        find: /^@tauri-apps\/plugin-dialog$/,
        replacement: resolve(__dirname, 'tests/unit/__mocks__/tauri-plugin-dialog.ts'),
      },
      {
        find: /^@tauri-apps\/api\/core$/,
        replacement: resolve(__dirname, 'tests/unit/__mocks__/tauri-api-core.ts'),
      },
    ],
    conditions: ['development', 'browser', 'module'],
    dedupe: ['@reatom/core'],
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    globals: true,
    setupFiles: ['tests/unit/setup.ts'],
    environment: 'jsdom',
    server: {
      deps: {
        inline: [/@reatom\/.*/],
      },
    },
    coverage: {
      enabled: false,
    },
    // Temporary bypass of @vitest/browser and vitest/node issue in current version
    browser: {enabled: false},
    hookTimeout: 30000,
    testTimeout: 30000,
  },
})
