import {readFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(packageRoot, '..', '..')

const guardedFiles = [
  'apps/webview/src/app/bootstrap/mobile-lifecycle.ts',
  'apps/webview/src/features/passmanager/password-manager.model.ts',
  'apps/webview/src/features/passmanager/components/extended-registration.ts',
]

const srcImportRe = /from ['"]@chromvoid\/password-import\/src\//u
const rootImportRe = /from ['"]@chromvoid\/password-import['"]/u
const offenders = []
const rawSrcOffenders = []

for (const relativePath of guardedFiles) {
  const fullPath = path.join(repoRoot, relativePath)
  const source = await readFile(fullPath, 'utf8')
  if (srcImportRe.test(source) || rootImportRe.test(source)) {
    offenders.push(relativePath)
  }
}

const rgResult = spawnSync(
  'rg',
  [
    '-l',
    String.raw`from ['"][^'"]*password-import/src/`,
    repoRoot,
    '--glob',
    '!**/dist/**',
    '--glob',
    '!**/node_modules/**',
    '--glob',
    '!**/.git/**',
  ],
  {encoding: 'utf8'},
)

if (rgResult.status === 0) {
  for (const line of rgResult.stdout.split('\n')) {
    const fullPath = line.trim()
    if (!fullPath) continue
    const relativePath = path.relative(repoRoot, fullPath)
    if (relativePath === 'packages/password-import/scripts/check-import-contract.mjs') continue
    rawSrcOffenders.push(relativePath)
  }
} else if (rgResult.status !== 1) {
  throw new Error(rgResult.stderr || rgResult.stdout || 'rg failed in check-import-contract')
}

if (offenders.length > 0 || rawSrcOffenders.length > 0) {
  console.error('[guardrail] hot-path files must use password-import subpaths:')
  for (const offender of offenders) {
    console.error(` - ${offender}`)
  }
  if (rawSrcOffenders.length > 0) {
    console.error('[guardrail] raw password-import src imports are forbidden:')
    for (const offender of rawSrcOffenders) {
      console.error(` - ${offender}`)
    }
  }
  process.exit(1)
}

console.log('[guardrail] import contract passed')
