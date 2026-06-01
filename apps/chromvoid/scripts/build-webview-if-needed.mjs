#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(appRoot, '..', '..')
const webviewRoot = path.join(repoRoot, 'apps', 'webview')
const distRoot = path.join(webviewRoot, 'dist')
const stampPath = path.join(distRoot, '.chromvoid-build-cache.json')
const forceBuild = process.env.CHROMVOID_FORCE_WEBVIEW_BUILD === '1'

const inputRoots = [
  path.join(repoRoot, 'package.json'),
  path.join(repoRoot, 'package-lock.json'),
  path.join(repoRoot, 'bun.lock'),
  path.join(repoRoot, 'bun.lockb'),
  path.join(webviewRoot, 'index.html'),
  path.join(webviewRoot, 'package.json'),
  path.join(webviewRoot, 'tsconfig.json'),
  path.join(webviewRoot, 'vite.config.ts'),
  path.join(webviewRoot, 'scripts'),
  path.join(webviewRoot, 'src'),
  path.join(repoRoot, 'packages'),
]

const ignoredDirectoryNames = new Set([
  '.git',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
])

function log(message) {
  console.log(`[webview-build-cache] ${message}`)
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function collectFiles(root) {
  let stat
  try {
    stat = await fs.stat(root)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return []
    }
    throw error
  }

  if (stat.isFile()) {
    return [root]
  }
  if (!stat.isDirectory()) {
    return []
  }

  const entries = await fs.readdir(root, {withFileTypes: true})
  const files = []
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectoryNames.has(entry.name)) {
      continue
    }
    const child = path.join(root, entry.name)
    files.push(...await collectFiles(child))
  }
  return files
}

async function calculateDigest() {
  const hash = crypto.createHash('sha256')
  const files = (await Promise.all(inputRoots.map(collectFiles)))
    .flat()
    .sort()

  for (const file of files) {
    const relative = path.relative(repoRoot, file)
    const content = await fs.readFile(file)
    hash.update(relative)
    hash.update('\0')
    hash.update(content)
    hash.update('\0')
  }

  return hash.digest('hex')
}

async function readStamp() {
  try {
    return JSON.parse(await fs.readFile(stampPath, 'utf8'))
  } catch {
    return null
  }
}

function runWebviewBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'build'], {
      cwd: webviewRoot,
      env: process.env,
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal)
        return
      }
      resolve(code ?? 1)
    })
  })
}

const digest = await calculateDigest()
const stamp = await readStamp()
const distIndexPath = path.join(distRoot, 'index.html')

if (!forceBuild && stamp?.digest === digest && await pathExists(distIndexPath)) {
  log('webview dist is up to date')
  process.exit(0)
}

if (forceBuild) {
  log('forced rebuild requested')
} else {
  log('webview inputs changed; rebuilding dist')
}

const buildExitCode = await runWebviewBuild()
if (buildExitCode !== 0) {
  process.exit(buildExitCode)
}

await fs.mkdir(distRoot, {recursive: true})
await fs.writeFile(
  stampPath,
  `${JSON.stringify({digest, generatedAt: new Date().toISOString()}, null, 2)}\n`,
)
