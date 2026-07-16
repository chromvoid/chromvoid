#!/usr/bin/env node

import path from 'node:path'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {resolveLicensePublicKeyEnv} from './license-public-key-env.mjs'
import {loadWalletEnvFromRoot} from './wallet-env.mjs'

const argv = new Set(process.argv.slice(2))
const signedMode = argv.has('--signed')

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(appRoot, '..', '..')
loadWalletEnvFromRoot(repoRoot)

const childEnv = resolveLicensePublicKeyEnv({
  appRoot,
  env: process.env,
  onFileResolved: (filePath) => {
    console.log(`[tauri-dev-runner] using license public key from ${filePath}`)
  },
})

if (signedMode && !childEnv.CARGO_TARGET_AARCH64_APPLE_DARWIN_LINKER) {
  const linkerPath = path.join(appRoot, 'scripts', 'codesign-linker.sh')
  childEnv.CARGO_TARGET_AARCH64_APPLE_DARWIN_LINKER = linkerPath
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
