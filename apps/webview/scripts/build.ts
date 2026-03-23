import type {BunPlugin} from 'bun'
import {cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const workspaceRoot = join(__dirname, '../../..')
const srcDir = join(projectRoot, 'src')
const distDir = join(projectRoot, 'dist')

const isDev = process.argv.includes('--dev')
const isWatch = process.argv.includes('--watch')
const isMinify = !isDev && !isWatch

// Clean dist directory
if (existsSync(distDir)) {
  rmSync(distDir, {recursive: true})
}
mkdirSync(distDir, {recursive: true})

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

// Build the main JS bundle
async function buildJS() {
  const entrypoint = join(srcDir, 'index.ts')

  const result = await Bun.build({
    entrypoints: [entrypoint],
    outdir: distDir,
    target: 'browser',
    // Control package.json `exports` conditions (Lit has `browser.development`).
    // - production build: avoid dev-mode bundles/warnings
    // - dev/watch: keep dev variants for better debugging
    conditions: isMinify ? ['browser', 'production'] : ['browser', 'development'],
    minify: isMinify,
    naming: 'index.js',
    splitting: false,
    plugins: [jsExtensionResolver],
    define: {
      'window.env': isDev ? '"dev"' : '"prod"',
      'window.__PM_LOG__': isDev ? 'true' : 'false',
    },
  })

  if (!result.success) {
    console.error('Build failed:')
    for (const log of result.logs) {
      console.error(log)
    }
    process.exit(1)
  }

  console.log('✓ Built index.js')
}

async function buildCSS() {
  const proc = Bun.spawn(['node', join(projectRoot, 'scripts/build-css.mjs')], {
    cwd: projectRoot,
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    console.error('CSS build failed with exit code:', exitCode)
    process.exit(1)
  }
  console.log('✓ Built assets/styles.css')
}

// Process HTML file
function processHTML() {
  const htmlPath = join(srcDir, 'index.html')
  let html = readFileSync(htmlPath, 'utf-8')

  // Replace .ts reference with .js
  html = html.replace('src="./index.ts"', 'src="./index.js"')

  // Use bundled CSS asset in production output
  html = html.replace('href="./styles/styles.css"', 'href="./assets/styles.css"')

  // Remove type="module" if not needed, or keep it
  // For bun bundled output, we keep it as single file

  writeFileSync(join(distDir, 'index.html'), html)
  console.log('✓ Processed index.html')
}

// Copy static assets
function copyAssets() {
  // Copy assets directory
  const assetsDir = join(srcDir, 'assets')
  if (existsSync(assetsDir)) {
    cpSync(assetsDir, join(distDir, 'assets'), {recursive: true})
    console.log('✓ Copied assets/')
  }

  // Copy service worker
  const swSrc = join(srcDir, 'sw.js')
  if (existsSync(swSrc)) {
    cpSync(swSrc, join(distDir, 'sw.js'))
    console.log('✓ Copied sw.js')
  }
}

function assertNoRemoteStatic() {
  const htmlPath = join(distDir, 'index.html')
  const cssPath = join(distDir, 'assets', 'styles.css')

  const html = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf-8') : ''
  const css = existsSync(cssPath) ? readFileSync(cssPath, 'utf-8') : ''

  const offenders: string[] = []

  // Only block remote URLs that would cause automatic fetching of static resources.
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
    console.error('Offline static build check failed:')
    for (const o of offenders) console.error('-', o)
    process.exit(1)
  }
}

async function build() {
  console.log(isDev ? '🔧 Development build...' : '📦 Production build...')

  await buildJS()
  await buildCSS()
  processHTML()
  copyAssets()
  assertNoRemoteStatic()

  console.log('\n✅ Build complete!')
}

async function watch() {
  console.log('👀 Watching for changes...')

  // Initial build
  await build()

  // Watch for changes using Bun.spawn with chokidar alternative
  // For simplicity, we'll use a polling approach
  const {watch} = await import('node:fs')

  watch(srcDir, {recursive: true}, async (eventType, filename) => {
    if (filename && !filename.includes('node_modules')) {
      console.log(`\n📝 ${filename} changed, rebuilding...`)
      try {
        await build()
      } catch (e) {
        console.error('Build error:', e)
      }
    }
  })
}

if (isWatch) {
  watch()
} else {
  build()
}
