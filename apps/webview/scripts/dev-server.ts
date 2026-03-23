import type {BunPlugin} from 'bun'
import {existsSync, mkdirSync, watch, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const workspaceRoot = join(__dirname, '../../..')
const srcDir = join(projectRoot, 'src')

const PORT = 4400
const HOST = process.env.TAURI_DEV_HOST || '0.0.0.0'


// Kill existing process on port
async function killProcessOnPort(port: number): Promise<void> {
  try {
    const proc = Bun.spawn(['lsof', '-ti', `:${port}`], {stdout: 'pipe', stderr: 'pipe'})
    const output = await new Response(proc.stdout).text()
    const pids = output.trim().split('\n').filter(Boolean)

    for (const pid of pids) {
      console.log(`🔪 Killing process ${pid} on port ${port}`)
      Bun.spawn(['kill', '-9', pid])
    }

    if (pids.length > 0) {
      await Bun.sleep(100)
    }
  } catch {
    // No process on port, continue
  }
}

await killProcessOnPort(PORT)

// Helper function to resolve with .js extension
async function resolveWithJsExt(path: string, importer?: string): Promise<string | undefined> {
  const pathWithExt = path + '.js'
  try {
    return await Bun.resolve(pathWithExt, workspaceRoot)
  } catch {
    if (importer) {
      try {
        return await Bun.resolve(pathWithExt, dirname(importer))
      } catch {
        return undefined
      }
    }
    return undefined
  }
}

// Plugin to resolve imports that need .js extension
const jsExtensionResolver: BunPlugin = {
  name: 'js-extension-resolver',
  setup(build) {
    // Shoelace components and chunks
    const shoelacePattern = /^@shoelace-style\/shoelace\/dist\/(components|chunks)\/[^.]+$/
    build.onResolve({filter: shoelacePattern}, async (args) => {
      const resolved = await resolveWithJsExt(args.path, args.importer)
      return resolved ? {path: resolved} : undefined
    })

    // Lit directives (lit/directives/*)
    const litDirectivesPattern = /^lit\/directives\/[^.]+$/
    build.onResolve({filter: litDirectivesPattern}, async (args) => {
      const resolved = await resolveWithJsExt(args.path, args.importer)
      return resolved ? {path: resolved} : undefined
    })

    // Lit decorators
    const litDecoratorsPattern = /^lit\/decorators$/
    build.onResolve({filter: litDecoratorsPattern}, async (args) => {
      const resolved = await resolveWithJsExt(args.path, args.importer)
      return resolved ? {path: resolved} : undefined
    })
  },
}

// In-memory bundle cache
let bundleCache: string | null = null
let bundleBuildPromise: Promise<string> | null = null

async function buildBundle(): Promise<string> {
  const entrypoint = join(srcDir, 'index.ts')

  const result = await Bun.build({
    entrypoints: [entrypoint],
    target: 'browser',
    // Prefer production variants for packages with `exports.browser.development`
    // to keep the dev console signal clean (Lit warnings are extremely noisy).
    conditions: ['browser', 'production'],
    minify: false,
    splitting: false,
    plugins: [jsExtensionResolver],
    define: {
      'window.env': '"dev"',
      'window.__PM_LOG__': 'true',
    },
  })

  if (!result.success) {
    const errors = result.logs.map((log) => log.message).join('\n')
    throw new Error(`Build failed:\n${errors}`)
  }

  const output = result.outputs[0]
  if (!output) {
    throw new Error('No output from build')
  }

  return await output.text()
}

async function getBundle(): Promise<string> {
  if (bundleCache) {
    return bundleCache
  }

  if (bundleBuildPromise) {
    return bundleBuildPromise
  }

  bundleBuildPromise = buildBundle()
  try {
    bundleCache = await bundleBuildPromise
    return bundleCache
  } finally {
    bundleBuildPromise = null
  }
}

function invalidateCache() {
  bundleCache = null
  console.log('📦 Cache invalidated, will rebuild on next request')
}

// Watch for file changes
watch(srcDir, {recursive: true}, (eventType, filename) => {
  if (filename && !filename.includes('node_modules')) {
    console.log(`📝 ${filename} changed`)
    invalidateCache()
  }
})

// Also watch workspace packages
const packagesDir = join(workspaceRoot, 'packages')
if (existsSync(packagesDir)) {
  watch(packagesDir, {recursive: true}, (eventType, filename) => {
    if (filename && filename.endsWith('.ts') && !filename.includes('node_modules')) {
      console.log(`📝 packages/${filename} changed`)
      invalidateCache()
    }
  })
}

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    let pathname = url.pathname

    // Default to index.html
    if (pathname === '/') {
      pathname = '/index.html'
    }

    // Mock transport persistence API
    if (pathname === '/api/mock-state') {
      const stateDir = join(projectRoot, '.mock-data')
      const stateFile = join(stateDir, 'state.json')

      if (req.method === 'GET') {
        const file = Bun.file(stateFile)
        if (await file.exists()) {
          return new Response(file, {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache',
            },
          })
        }
        return new Response(null, {status: 404})
      }

      if (req.method === 'POST') {
        if (!existsSync(stateDir)) {
          mkdirSync(stateDir, {recursive: true})
        }
        const body = await req.text()
        writeFileSync(stateFile, body)
        return new Response('OK', {status: 200})
      }

      if (req.method === 'DELETE') {
        if (existsSync(stateFile)) {
          const {unlinkSync} = await import('node:fs')
          unlinkSync(stateFile)
        }
        return new Response('OK', {status: 200})
      }
    }

    // Serve bundled JS
    if (pathname === '/index.js') {
      try {
        const bundle = await getBundle()
        return new Response(bundle, {
          headers: {
            'Content-Type': 'application/javascript',
            'Cache-Control': 'no-cache',
          },
        })
      } catch (e) {
        console.error('Build error:', e)
        return new Response(`console.error(${JSON.stringify(String(e))})`, {
          headers: {'Content-Type': 'application/javascript'},
          status: 500,
        })
      }
    }

    // Serve index.html with .ts -> .js replacement
    if (pathname === '/index.html') {
      const htmlPath = join(srcDir, 'index.html')
      let html = await Bun.file(htmlPath).text()
      html = html.replace('src="./index.ts"', 'src="./index.js"')
      return new Response(html, {
        headers: {
          'Content-Type': 'text/html',
          'Cache-Control': 'no-cache',
        },
      })
    }

    // Serve TypeScript files as compiled JavaScript (for workers)
    if (pathname.endsWith('.ts')) {
      const tsPath = join(srcDir, pathname)
      const tsFile = Bun.file(tsPath)
      if (await tsFile.exists()) {
        try {
          const result = await Bun.build({
            entrypoints: [tsPath],
            target: 'browser',
            conditions: ['browser', 'production'],
            minify: false,
            splitting: false,
            plugins: [jsExtensionResolver],
          })

          if (!result.success) {
            const errors = result.logs.map((log) => log.message).join('\n')
            console.error('Worker build error:', errors)
            return new Response(`console.error(${JSON.stringify(errors)})`, {
              headers: {'Content-Type': 'application/javascript'},
              status: 500,
            })
          }

          const output = result.outputs[0]
          if (output) {
            return new Response(await output.text(), {
              headers: {
                'Content-Type': 'application/javascript',
                'Cache-Control': 'no-cache',
              },
            })
          }
        } catch (e) {
          console.error('Worker compile error:', e)
          return new Response(`console.error(${JSON.stringify(String(e))})`, {
            headers: {'Content-Type': 'application/javascript'},
            status: 500,
          })
        }
      }
    }

    // Serve static files from src
    const filePath = join(srcDir, pathname)
    const file = Bun.file(filePath)

    if (await file.exists()) {
      return new Response(file)
    }

    // Serve static files from workspace packages (icons, assets)
    const packagesFile = Bun.file(join(packagesDir, pathname.replace(/^\/packages\//, '')))
    if (await packagesFile.exists()) {
      return new Response(packagesFile)
    }

    // 404
    return new Response('Not found', {status: 404})
  },
})

const displayHost = HOST === '0.0.0.0' ? 'localhost' : HOST
console.log(`🚀 Dev server running at http://${displayHost}:${PORT}`)
if (HOST === '0.0.0.0') {
  console.log(`📱 LAN URL: http://<your-mac-ip>:${PORT}`)
}
console.log('👀 Watching for changes...')
