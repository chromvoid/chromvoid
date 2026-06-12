#!/usr/bin/env node

import crypto from 'node:crypto'
import {accessSync, constants} from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(appRoot, '..', '..')
const webviewRoot = path.join(repoRoot, 'apps', 'webview')
const distRoot = path.join(webviewRoot, 'dist')
const stampPath = path.join(distRoot, '.chromvoid-build-cache.json')
const argv = new Set(process.argv.slice(2))
const forceBuild = argv.has('--force') || process.env.CHROMVOID_FORCE_WEBVIEW_BUILD === '1'

const inputRoots = [
  path.join(repoRoot, 'package.json'),
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
const bunExecutable = process.platform === 'win32' ? 'bun.exe' : 'bun'

function log(message) {
  console.log(`[webview-build-cache] ${message}`)
}

function isExecutable(filePath) {
  try {
    accessSync(filePath, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function resolveBun() {
  const candidates = [
    process.env.BUN,
    process.env.BUN_INSTALL && path.join(process.env.BUN_INSTALL, 'bin', bunExecutable),
    path.join(os.homedir(), '.bun', 'bin', bunExecutable),
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (isExecutable(candidate)) {
      return candidate
    }
  }

  return bunExecutable
}

function webviewBuildEnv(bun) {
  if (!path.isAbsolute(bun)) {
    return process.env
  }

  return {
    ...process.env,
    PATH: [path.dirname(bun), process.env.PATH].filter(Boolean).join(path.delimiter),
  }
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
    const bun = resolveBun()
    const child = spawn(bun, ['run', 'build'], {
      cwd: webviewRoot,
      env: webviewBuildEnv(bun),
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
