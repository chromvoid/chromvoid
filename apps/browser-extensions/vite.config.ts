import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {defineConfig} from 'vite'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url))
const srcRoot = join(projectRoot, 'src')

export const extensionEntries = [
  {
    entry: join(srcRoot, 'service-worker.ts'),
    fileName: 'service-worker.js',
    globalName: 'ChromVoidServiceWorker',
  },
  {
    entry: join(srcRoot, 'injectable.ts'),
    fileName: 'injectable.js',
    globalName: 'ChromVoidInjectable',
  },
  {
    entry: join(srcRoot, 'popup/index.ts'),
    fileName: 'popup.js',
    globalName: 'ChromVoidPopup',
  },
] as const

export function createExtensionBuildConfig(
  entry: (typeof extensionEntries)[number],
  options: {watch: boolean},
) {
  return defineConfig({
    appType: 'custom',
    publicDir: false,
    build: {
      emptyOutDir: false,
      lib: {
        entry: entry.entry,
        fileName: () => entry.fileName,
        formats: ['iife'],
        name: entry.globalName,
      },
      minify: options.watch ? false : 'esbuild',
      outDir: join(projectRoot, 'dist'),
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
      sourcemap: options.watch,
      watch: options.watch ? {} : null,
    },
    resolve: {
      alias: [
        {find: /^root\/(.+)$/, replacement: join(srcRoot, '$1')},
        {find: /^@chromvoid\/scheme$/, replacement: join(workspaceRoot, 'packages/scheme/src/index.ts')},
        {find: /^@chromvoid\/scheme\/(.+)$/, replacement: join(workspaceRoot, 'packages/scheme/src/$1')},
        {find: /^@project\/i18n$/, replacement: join(workspaceRoot, 'packages/i18n/src/index.ts')},
        {find: /^@project\/i18n\/(.+)$/, replacement: join(workspaceRoot, 'packages/i18n/src/$1')},
        {find: /^@project\/passmanager$/, replacement: join(workspaceRoot, 'packages/passmanager/src/index.ts')},
        {
          find: /^@project\/passmanager\/(.+)$/,
          replacement: join(workspaceRoot, 'packages/passmanager/src/$1.ts'),
        },
        {find: /^@chromvoid\/uikit$/, replacement: join(workspaceRoot, 'packages/uikit/src/index.ts')},
        {find: /^@chromvoid\/headless-ui$/, replacement: join(workspaceRoot, 'packages/headless-ui/src/index.ts')},
        {
          find: /^@chromvoid\/headless-ui\/(.+)$/,
          replacement: join(workspaceRoot, 'packages/headless-ui/src/$1/index.ts'),
        },
        {
          find: /^@chromvoid\/uikit\/reatom-lit$/,
          replacement: join(workspaceRoot, 'packages/uikit/src/reatom-lit/index.ts'),
        },
        {find: /^@chromvoid\/uikit\/html$/, replacement: join(workspaceRoot, 'packages/uikit/src/reatom-lit/html.ts')},
        {
          find: /^@chromvoid\/uikit\/components\/(.+)$/,
          replacement: join(workspaceRoot, 'packages/uikit/src/components/$1.ts'),
        },
      ],
      conditions: ['development', 'browser', 'module'],
      dedupe: ['lit', '@reatom/core'],
    },
  })
}

export default defineConfig(() => createExtensionBuildConfig(extensionEntries[0], {watch: false}))
