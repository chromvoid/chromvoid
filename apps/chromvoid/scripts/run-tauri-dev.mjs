#!/usr/bin/env node

import path from 'node:path'
import {spawn, spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {resolveLicensePublicKeyEnv} from './license-public-key-env.mjs'
import {resolveDevSigningEnvironment} from './macos-signing.mjs'
import {loadWalletEnvFromRoot} from './wallet-env.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(appRoot, '..', '..')
loadWalletEnvFromRoot(repoRoot)

let childEnv = resolveLicensePublicKeyEnv({
  appRoot,
  env: process.env,
  onFileResolved: (filePath) => {
    console.log(`[tauri-dev-runner] using license public key from ${filePath}`)
  },
})

if (process.platform === 'darwin') {
  const identityResult = spawnSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
    encoding: 'utf8',
  })
  if (identityResult.error) throw identityResult.error
  const linkerPath = path.join(appRoot, 'scripts', 'codesign-linker.sh')
  try {
    childEnv = resolveDevSigningEnvironment({
      platform: process.platform,
      env: childEnv,
      identityOutput: `${identityResult.stdout ?? ''}\n${identityResult.stderr ?? ''}`,
      linkerPath,
    })
  } catch (error) {
    console.error(`[tauri-dev-runner] ${error.message}`)
    process.exit(1)
  }
}

const tauriArgs = ['dev', '--config', 'src-tauri/tauri.dev.conf.json', '--no-watch', '--port', '4410']
const child = spawn('tauri', tauriArgs, {
  cwd: appRoot,
  env: childEnv,
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
