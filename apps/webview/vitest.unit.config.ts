import {resolve} from 'path'
import {defineConfig} from 'vitest/config'

export default defineConfig({
  root: '.',
  resolve: {
    alias: {
      root: resolve(__dirname, 'src'),
      '@chromvoid/scheme': resolve(__dirname, '../../packages/scheme/src/index.ts'),
      '@chromvoid/scheme/*': resolve(__dirname, '../../packages/scheme/src/*'),
      '@chromvoid/password-import': resolve(__dirname, '../../packages/password-import/src/index.ts'),
      '@chromvoid/password-import/*': resolve(__dirname, '../../packages/password-import/src/*'),
      // Явная корректировка проблемного ESM-импорта каталога в @statx/core
      '@statx/core/build/helpers': resolve(
        __dirname,
        '../../node_modules/@statx/core/build/helpers/index.js',
      ),
      '@statx/core/build/nodes': resolve(__dirname, '../../node_modules/@statx/core/build/nodes/index.js'),
      // Перенаправляем импорт @statx/core на исходники, чтобы избежать directory import
      '@statx/core': resolve(__dirname, '../../node_modules/@statx/core/src/index.ts'),
      // Мок Tauri-зависимостей, недоступных в unit-среде (jsdom)
      '@tauri-apps/plugin-dialog': resolve(__dirname, 'tests/unit/__mocks__/tauri-plugin-dialog.ts'),
      '@tauri-apps/api/core': resolve(__dirname, 'tests/unit/__mocks__/tauri-api-core.ts'),
    },
    conditions: ['development', 'browser', 'module'],
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    globals: true,
    setupFiles: ['tests/unit/setup.ts'],
    environment: 'jsdom',
    server: {
      deps: {
        // Принудительно инлайнить @statx/* модули, чтобы корректно разрешались вложенные импорты
        inline: [/@statx\/.*/],
      },
    },
    coverage: {
      enabled: false,
    },
    // Временный обход проблемы с @vitest/browser и vitest/node в текущей версии
    browser: {enabled: false},
    hookTimeout: 30000,
    testTimeout: 30000,
  },
})
