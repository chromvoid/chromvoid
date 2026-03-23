import type {BunPlugin} from 'bun'
import {existsSync, rmSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const workspaceRoot = join(__dirname, '../../..')
const distDir = join(projectRoot, 'dist')

// Clean dist directory
if (existsSync(distDir)) {
  rmSync(distDir, {recursive: true})
}

const isWatch = process.argv.includes('--watch')
const isMinify = !isWatch

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

const entrypoints = [
  {entry: join(projectRoot, 'src/service-worker.ts'), name: 'service-worker'},
  {entry: join(projectRoot, 'src/injectable.ts'), name: 'injectable'},
  {entry: join(projectRoot, 'src/popup/index.ts'), name: 'popup'},
]

async function build() {
  for (const {entry, name} of entrypoints) {
    const result = await Bun.build({
      entrypoints: [entry],
      outdir: distDir,
      target: 'browser',
      minify: isMinify,
      naming: `${name}.js`,
      splitting: false,
      plugins: [jsExtensionResolver],
    })

    if (!result.success) {
      console.error(`Build failed for ${name}:`)
      for (const log of result.logs) {
        console.error(log)
      }
      process.exit(1)
    }

    console.log(`✓ Built ${name}.js`)
  }

  console.log('\n✅ Build complete!')
}

build()
