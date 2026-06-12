import {spawn} from 'node:child_process'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const webviewRoot = join(__dirname, '..')
const chunkWarning = 'Some chunks are larger than 500 kB after minification'

function fail(message) {
  console.error(`[build:check-warnings] ${message}`)
  process.exit(1)
}

const outDir = await mkdtemp(join(tmpdir(), 'chromvoid-webview-build-'))

let stdout = ''
let stderr = ''
let settled = false

const child = spawn('bun', ['run', 'build', '--', '--outDir', outDir], {
  cwd: webviewRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
})

child.stdout.on('data', (chunk) => {
  const text = chunk.toString()
  stdout += text
  process.stdout.write(text)
})

child.stderr.on('data', (chunk) => {
  const text = chunk.toString()
  stderr += text
  process.stderr.write(text)
})

async function finish(code, error) {
  if (settled) return
  settled = true

  await rm(outDir, {recursive: true, force: true})

  if (error) {
    fail(`failed to run WebView build: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (code !== 0) {
    process.exit(code ?? 1)
  }

  const output = `${stdout}\n${stderr}`
  if (output.includes(chunkWarning)) {
    fail(chunkWarning)
  }

  console.log('[build:check-warnings] OK')
}

child.on('error', (error) => {
  void finish(1, error)
})

child.on('close', (code) => {
  void finish(code)
})
