#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(scriptDir, '..')
const forwardedArgs = process.argv.slice(2)
const licensePublicKeyEnv = 'CHROMVOID_LICENSE_PUBLIC_KEY_ED25519_2026_01'
const licensePublicKeyFiles = [
  path.join(appRoot, 'src-tauri', 'gen', 'apple', '.license-public-key'),
  path.join(appRoot, 'src-tauri', 'gen', 'android', '.license-public-key'),
]
const localTauriBinary = path.join(
  appRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tauri.cmd' : 'tauri',
)
const tauriBinary = fs.existsSync(localTauriBinary) ? localTauriBinary : 'tauri'

function hasExplicitBundleArgs(args) {
  return args.some(
    (arg) =>
      arg === '--bundles' ||
      arg === '-b' ||
      arg.startsWith('--bundles=') ||
      arg.startsWith('-b=') ||
      arg === '--no-bundle',
  )
}

function defaultBundleArgs() {
  if (hasExplicitBundleArgs(forwardedArgs)) {
    return []
  }

  switch (process.platform) {
    case 'darwin':
      return ['--bundles', 'app']
    case 'linux':
      return ['--bundles', 'appimage']
    case 'win32':
      return ['--bundles', 'nsis']
    default:
      return []
  }
}

function resolveLicensePublicKeyEnv() {
  if (process.env[licensePublicKeyEnv]?.trim()) {
    return process.env
  }

  const filePath = licensePublicKeyFiles.find((candidate) => fs.existsSync(candidate))
  if (!filePath) {
    return process.env
  }

  const value = fs.readFileSync(filePath, 'utf8').trim()
  if (!value) {
    return process.env
  }

  console.log(`[tauri-build-runner] using license public key from ${filePath}`)
  return {
    ...process.env,
    [licensePublicKeyEnv]: value,
  }
}

const tauriArgs = ['build', ...defaultBundleArgs(), ...forwardedArgs]
const child = spawn(tauriBinary, tauriArgs, {
  cwd: appRoot,
  env: resolveLicensePublicKeyEnv(),
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
