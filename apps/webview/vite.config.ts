import {existsSync} from 'node:fs'
import {copyFile, cp, mkdir, readFile, writeFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import type {IncomingMessage, ServerResponse} from 'node:http'

import {defineConfig, searchForWorkspaceRoot, type Plugin} from 'vite'

import {
  buildPersistedPassmanagerStateFromCatalog,
  deletePersistedState,
  readPersistedPassmanagerState,
  readPersistedState,
  readPersistedStateText,
  writePersistedStateText,
} from './scripts/mock-state'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = __dirname
const workspaceRoot = join(projectRoot, '../..')
const srcDir = join(projectRoot, 'src')
const distDir = join(projectRoot, 'dist')
const distAssetsDir = join(distDir, 'assets')
const stateDir = join(projectRoot, '.mock-data')
const stateFile = join(stateDir, 'state.json')
const passmanagerStateFile = join(stateDir, 'passmanager-state.json')
const sourceHtmlPath = join(srcDir, 'index.html')
const distHtmlPath = join(distDir, 'index.html')
const sourceAssetsDir = join(srcDir, 'assets')
const sourceVendoredFontsCss = join(srcDir, 'styles', 'base', 'fonts.vendored.css')
const distVendoredFontsCss = join(distAssetsDir, 'fonts.vendored.css')
const isE2E = process.env.DASHBOARD_E2E === '1'
type MockTransportLogEntry = {
  channel: 'catalog' | 'passmanager'
  command: string
  data: Record<string, unknown>
  result: unknown
  at: number
}
const mockTransportLog: MockTransportLogEntry[] = []

const devHtmlCsp =
  "default-src 'none'; base-uri 'self'; object-src 'none'; form-action 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: asset: http://asset.localhost; media-src 'self' blob: asset: chromvoid-media: http://asset.localhost; font-src 'self' data:; connect-src 'self' data: ipc: http://ipc.localhost http://chromvoid.local ws://localhost:4400 ws://127.0.0.1:4400; worker-src 'self' blob:;"
const prodHtmlCsp =
  "default-src 'none'; base-uri 'self'; object-src 'none'; form-action 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: asset: http://asset.localhost; media-src 'self' blob: asset: chromvoid-media: http://asset.localhost; font-src 'self' data:; connect-src 'self' data: ipc: http://ipc.localhost http://chromvoid.local; worker-src 'self' blob:;"

function sendText(
  res: ServerResponse,
  statusCode: number,
  body: string,
  contentType: string,
): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', contentType)
  res.setHeader('Cache-Control', 'no-cache')
  res.end(body)
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function renderBuildHtml(html: string): string {
  return html
    .replace(devHtmlCsp, prodHtmlCsp)
    .replace('href="./styles/styles.css"', 'href="./assets/styles.css"')
    .replace('src="./index.ts"', 'src="./index.js"')
}

async function assertNoRemoteStatic(): Promise<void> {
  const html = existsSync(distHtmlPath) ? await readFile(distHtmlPath, 'utf8') : ''
  const cssPath = join(distAssetsDir, 'styles.css')
  const css = existsSync(cssPath) ? await readFile(cssPath, 'utf8') : ''

  const offenders: string[] = []
  const htmlRemoteResourceRe = /<(?:link|script|img|source)\b[^>]*(?:href|src|srcset)\s*=\s*["'](?:https?:)?\/\//gi
  if (htmlRemoteResourceRe.test(html)) {
    offenders.push('dist/index.html contains remote static resource URL')
  }

  const cssRemoteUrlRe = /url\(\s*["']?(?:https?:)?\/\//gi
  const cssRemoteImportRe = /@import\s+url\(\s*["']?(?:https?:)?\/\//gi
  if (cssRemoteUrlRe.test(css) || cssRemoteImportRe.test(css)) {
    offenders.push('dist/assets/styles.css contains remote url()/@import')
  }

  if (offenders.length > 0) {
    throw new Error(`Offline static build check failed:\n- ${offenders.join('\n- ')}`)
  }
}

function webviewDevContractPlugin(): Plugin {
  return {
    name: 'webview-dev-contract',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) {
          next()
          return
        }

        const url = new URL(req.url, 'http://localhost')

        if (
          url.pathname !== '/api/mock-state' &&
          url.pathname !== '/api/mock-passmanager-state' &&
          url.pathname !== '/api/mock-transport-log' &&
          url.pathname !== '/assets/fonts.vendored.css'
        ) {
          next()
          return
        }

        void (async () => {
          if (url.pathname === '/assets/fonts.vendored.css') {
            if (!existsSync(sourceVendoredFontsCss)) {
              sendText(res, 404, 'Not found', 'text/plain; charset=utf-8')
              return
            }

            sendText(res, 200, await readFile(sourceVendoredFontsCss, 'utf8'), 'text/css; charset=utf-8')
            return
          }

          if (url.pathname === '/api/mock-passmanager-state') {
            if (req.method === 'GET') {
              const persisted = await readPersistedPassmanagerState(passmanagerStateFile)
              if (persisted) {
                sendText(res, 200, JSON.stringify(persisted), 'application/json; charset=utf-8')
                return
              }

              // Temporary server-side migration helper from legacy catalog-backed mock state.
              const legacy = await readPersistedState(stateFile)
              if (!legacy) {
                sendText(res, 404, 'Not found', 'text/plain; charset=utf-8')
                return
              }

              sendText(
                res,
                200,
                JSON.stringify(buildPersistedPassmanagerStateFromCatalog(legacy)),
                'application/json; charset=utf-8',
              )
              return
            }

            if (req.method === 'POST') {
              await writePersistedStateText(stateDir, passmanagerStateFile, await readRequestBody(req))
              sendText(res, 200, 'OK', 'text/plain; charset=utf-8')
              return
            }

            if (req.method === 'DELETE') {
              await deletePersistedState(passmanagerStateFile)
              sendText(res, 200, 'OK', 'text/plain; charset=utf-8')
              return
            }

            sendText(res, 405, 'Method Not Allowed', 'text/plain; charset=utf-8')
            return
          }

          if (url.pathname === '/api/mock-transport-log') {
            if (req.method === 'GET') {
              sendText(res, 200, JSON.stringify({calls: mockTransportLog}), 'application/json; charset=utf-8')
              return
            }

            if (req.method === 'POST') {
              const raw = await readRequestBody(req)
              const parsed = JSON.parse(raw) as Partial<MockTransportLogEntry>
              if (
                !parsed ||
                typeof parsed !== 'object' ||
                (parsed.channel !== 'catalog' && parsed.channel !== 'passmanager') ||
                typeof parsed.command !== 'string' ||
                !parsed.data ||
                typeof parsed.data !== 'object'
              ) {
                sendText(res, 400, 'Bad Request', 'text/plain; charset=utf-8')
                return
              }

              mockTransportLog.push({
                channel: parsed.channel,
                command: parsed.command,
                data: parsed.data as Record<string, unknown>,
                result: parsed.result,
                at: typeof parsed.at === 'number' ? parsed.at : Date.now(),
              })
              sendText(res, 200, 'OK', 'text/plain; charset=utf-8')
              return
            }

            if (req.method === 'DELETE') {
              mockTransportLog.length = 0
              sendText(res, 200, 'OK', 'text/plain; charset=utf-8')
              return
            }

            sendText(res, 405, 'Method Not Allowed', 'text/plain; charset=utf-8')
            return
          }

          if (req.method === 'GET') {

            const persistedStateText = await readPersistedStateText(stateFile)
            if (!persistedStateText) {
              sendText(res, 404, 'Not found', 'text/plain; charset=utf-8')
              return
            }

            sendText(res, 200, persistedStateText, 'application/json; charset=utf-8')
            return
          }

          if (req.method === 'POST') {
            await writePersistedStateText(stateDir, stateFile, await readRequestBody(req))
            sendText(res, 200, 'OK', 'text/plain; charset=utf-8')
            return
          }

          if (req.method === 'DELETE') {
            await deletePersistedState(stateFile)
            sendText(res, 200, 'OK', 'text/plain; charset=utf-8')
            return
          }

          sendText(res, 405, 'Method Not Allowed', 'text/plain; charset=utf-8')
        })().catch((error: unknown) => {
          next(error instanceof Error ? error : new Error(String(error)))
        })
      })
    },
  }
}

function webviewBuildContractPlugin(): Plugin {
  return {
    name: 'webview-build-contract',
    apply: 'build',
    async closeBundle() {
      await mkdir(distAssetsDir, {recursive: true})

      if (existsSync(sourceAssetsDir)) {
        await cp(sourceAssetsDir, distAssetsDir, {recursive: true, force: true})
      }

      if (existsSync(sourceVendoredFontsCss)) {
        await copyFile(sourceVendoredFontsCss, distVendoredFontsCss)
      }

      const sourceHtml = await readFile(sourceHtmlPath, 'utf8')
      await writeFile(distHtmlPath, renderBuildHtml(sourceHtml))
      await assertNoRemoteStatic()
    },
  }
}

function getManualChunk(id: string): string | undefined {
  const normalized = id.split('\\').join('/')

  if (normalized.includes('@tauri-apps/')) {
    return 'vendor-tauri'
  }

  if (
    normalized.includes('dompurify/') ||
    normalized.includes('entities/') ||
    normalized.includes('linkify-it/') ||
    normalized.includes('markdown-it/') ||
    normalized.includes('mdurl/') ||
    normalized.includes('uc.micro/')
  ) {
    return 'vendor-markdown'
  }

  if (normalized.includes('@reatom/core')) {
    return 'vendor-reatom'
  }

  if (
    normalized.includes('/node_modules/lit') ||
    normalized.includes('/node_modules/@lit/') ||
    normalized.includes('/node_modules/lit-html/')
  ) {
    return 'vendor-lit'
  }

  if (normalized.includes('/packages/uikit/src/')) {
    return 'uikit'
  }

  if (normalized.includes('/packages/ui/src/')) {
    return 'shared-ui'
  }

  if (normalized.includes('/apps/webview/src/core/transport/mock/')) {
    return 'mock-transport'
  }

  if (normalized.includes('/apps/webview/src/core/state/passmanager/')) {
    return 'passmanager-core'
  }

  if (normalized.includes('/packages/passmanager/src/service/')) {
    return 'passmanager-services'
  }

  if (
    normalized.includes('/apps/webview/src/features/passmanager/password-manager.model.ts') ||
    normalized.includes('/apps/webview/src/features/passmanager/models/')
  ) {
    return 'passmanager-models'
  }

  if (normalized.includes('/apps/webview/src/features/media/components/file-loader.ts')) {
    return 'media-file-loader'
  }

  if (
    normalized.includes('/apps/webview/src/features/file-manager/models/markdown-preview.model.ts') ||
    normalized.includes('/apps/webview/src/features/file-manager/services/markdown-') ||
    normalized.includes('/node_modules/prettier/') ||
    normalized.includes('/apps/webview/src/features/file-manager/services/text-file-io.ts')
  ) {
    return 'markdown-model'
  }

  if (
    normalized.includes('/apps/webview/src/features/file-manager/file-manager.model.ts') ||
    normalized.includes('/apps/webview/src/features/file-manager/upload-flow.model.ts') ||
    normalized.includes('/apps/webview/src/features/file-manager/download-flow.model.ts') ||
    normalized.includes('/apps/webview/src/features/file-manager/services/command-bar-commands.ts')
  ) {
    return 'file-manager-models'
  }

  return undefined
}

export default defineConfig(({command}) => {
  const isDev = command === 'serve'

  return {
    appType: 'spa',
    base: './',
    publicDir: false,
    root: srcDir,
    css: {
      transformer: 'lightningcss',
    },
    define: {
      'window.env': JSON.stringify(isDev ? 'dev' : 'prod'),
      'window.__PM_LOG__': isDev ? 'true' : 'false',
    },
    plugins: [webviewDevContractPlugin(), webviewBuildContractPlugin()],
    resolve: {
      alias: [
        {find: /^root\/(.+)$/, replacement: join(srcDir, '$1')},
        {find: /^@project\/i18n$/, replacement: join(workspaceRoot, 'packages/i18n/src/index.ts')},
        {find: /^@project\/i18n\/(.+)$/, replacement: join(workspaceRoot, 'packages/i18n/src/$1')},
        {find: /^@project\/passmanager$/, replacement: join(workspaceRoot, 'packages/passmanager/src/index.ts')},
        {find: /^@project\/passmanager\/core$/, replacement: join(workspaceRoot, 'packages/passmanager/src/core.ts')},
        {find: /^@project\/passmanager\/types$/, replacement: join(workspaceRoot, 'packages/passmanager/src/types.ts')},
        {find: /^@project\/passmanager\/consts$/, replacement: join(workspaceRoot, 'packages/passmanager/src/consts.ts')},
        {
          find: /^@project\/passmanager\/ports$/,
          replacement: join(workspaceRoot, 'packages/passmanager/src/ports/index.ts'),
        },
        {
          find: /^@project\/passmanager\/i18n$/,
          replacement: join(workspaceRoot, 'packages/passmanager/src/i18n/index.ts'),
        },
        {
          find: /^@project\/passmanager\/i18n\/format$/,
          replacement: join(workspaceRoot, 'packages/passmanager/src/i18n/format.ts'),
        },
        {
          find: /^@project\/passmanager\/password-utils$/,
          replacement: join(workspaceRoot, 'packages/passmanager/src/password-utils.ts'),
        },
        {
          find: /^@project\/passmanager\/security-audit$/,
          replacement: join(workspaceRoot, 'packages/passmanager/src/security-audit.ts'),
        },
        {find: /^@project\/passmanager\/urls$/, replacement: join(workspaceRoot, 'packages/passmanager/src/urls.ts')},
        {
          find: /^@project\/passmanager\/theme$/,
          replacement: join(workspaceRoot, 'packages/passmanager/src/service/theme.ts'),
        },
        {
          find: /^@project\/passmanager\/timer$/,
          replacement: join(workspaceRoot, 'packages/passmanager/src/timer.ts'),
        },
        {
          find: /^@project\/passmanager\/select$/,
          replacement: join(workspaceRoot, 'packages/passmanager/src/service/select.ts'),
        },
        {
          find: /^@project\/passmanager\/sorting$/,
          replacement: join(workspaceRoot, 'packages/passmanager/src/service/sorting.ts'),
        },
        {
          find: /^@project\/passmanager\/sort-storage$/,
          replacement: join(workspaceRoot, 'packages/passmanager/src/services/sort-storage.ts'),
        },
        {
          find: /^@project\/passmanager\/flags$/,
          replacement: join(workspaceRoot, 'packages/passmanager/src/service/flags.ts'),
        },
        {
          find: /^@project\/passmanager\/notify$/,
          replacement: join(workspaceRoot, 'packages/passmanager/src/service/notify.ts'),
        },
        {find: /^@chromvoid\/scheme$/, replacement: join(workspaceRoot, 'packages/scheme/src/index.ts')},
        {find: /^@chromvoid\/scheme\/(.+)$/, replacement: join(workspaceRoot, 'packages/scheme/src/$1')},
        {find: /^@chromvoid\/uikit$/, replacement: join(workspaceRoot, 'packages/uikit/src/index.ts')},
        {find: /^@chromvoid\/uikit\/(.+)$/, replacement: join(workspaceRoot, 'packages/uikit/src/$1')},
        {find: /^@chromvoid\/ui$/, replacement: join(workspaceRoot, 'packages/ui/src/index.ts')},
        {find: /^@chromvoid\/ui\/(.+)$/, replacement: join(workspaceRoot, 'packages/ui/src/$1')},
      ],
      conditions: ['browser', 'production'],
      dedupe: ['@reatom/core'],
    },
    server: {
      fs: {
        allow: [searchForWorkspaceRoot(projectRoot)],
      },
      host: process.env.TAURI_DEV_HOST ?? '0.0.0.0',
      hmr: {
        overlay: !isE2E,
      },
      port: 4400,
      strictPort: true,
    },
    build: {
      copyPublicDir: false,
      cssCodeSplit: false,
      cssMinify: 'lightningcss',
      emptyOutDir: true,
      modulePreload: false,
      outDir: '../dist',
      target: 'es2022',
      rollupOptions: {
        output: {
          assetFileNames: (assetInfo) => {
            const name = assetInfo.names?.[0] ?? assetInfo.name ?? ''
            if (name.endsWith('.css')) {
              return 'assets/styles.css'
            }
            return 'assets/[name]-[hash][extname]'
          },
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'index.js',
          manualChunks: getManualChunk,
        },
      },
    },
  }
})
