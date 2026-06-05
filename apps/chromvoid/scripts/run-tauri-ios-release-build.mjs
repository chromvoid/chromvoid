#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import {spawn, spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(scriptDir, '..')
const forwardedArgs = process.argv.slice(2)
const licensePublicKeyEnv = 'CHROMVOID_LICENSE_PUBLIC_KEY_ED25519_2026_01'
const licensePublicKeyFiles = [
  path.join(appRoot, 'src-tauri', 'gen', 'apple', '.license-public-key'),
  path.join(appRoot, 'src-tauri', 'gen', 'android', '.license-public-key'),
]
const appleBuildDir = path.join(appRoot, 'src-tauri', 'gen', 'apple', 'build')
const localTauriBinary = path.join(
  appRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tauri.cmd' : 'tauri',
)
const tauriBinary = fs.existsSync(localTauriBinary) ? localTauriBinary : 'tauri'

function fail(message) {
  console.error(`[tauri-ios-release] ${message}`)
  process.exit(1)
}

function decodeBase64OrBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
  return Buffer.from(padded, 'base64')
}

function resolveLicensePublicKey() {
  const envValue = process.env[licensePublicKeyEnv]?.trim()
  const filePath = licensePublicKeyFiles.find((candidate) => fs.existsSync(candidate))
  const fileValue = filePath ? fs.readFileSync(filePath, 'utf8').trim() : ''
  const value = envValue || fileValue
  if (!value) {
    fail(
      `Missing ${licensePublicKeyEnv}. Set it in the environment or write the base64/base64url Ed25519 public key to ${licensePublicKeyFiles[0]}.`,
    )
  }

  const bytes = decodeBase64OrBase64Url(value)
  if (bytes.length !== 32) {
    fail(`${licensePublicKeyEnv} must decode to a 32-byte Ed25519 public key, got ${bytes.length} bytes.`)
  }

  if (!envValue && filePath) {
    console.log(`[tauri-ios-release] Using license public key from ${filePath}`)
  }

  return value
}

function collectIpas(dir) {
  if (!fs.existsSync(dir)) {
    return []
  }

  const entries = fs.readdirSync(dir, {withFileTypes: true})
  const ipas = []
  for (const entry of entries) {
    const filePath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      ipas.push(...collectIpas(filePath))
      continue
    }
    if (entry.isFile() && filePath.endsWith('.ipa')) {
      ipas.push(filePath)
    }
  }
  return ipas
}

function removeStaleIpas() {
  for (const ipa of collectIpas(appleBuildDir)) {
    fs.rmSync(ipa, {force: true})
  }
}

function unzip(ipaPath, args) {
  const result = spawnSync('unzip', args, {
    cwd: appRoot,
    maxBuffer: 256 * 1024 * 1024,
  })
  if (result.status !== 0) {
    const detail = result.stderr?.toString().trim() || result.stdout?.toString().trim() || `unzip failed for ${ipaPath}`
    fail(detail)
  }
  return result.stdout
}

function assertIpaEmbedsLicensePublicKey(ipaPath, licensePublicKey) {
  const entries = unzip(ipaPath, ['-Z1', ipaPath])
    .toString('utf8')
    .split(/\r?\n/)
    .filter((entry) => /^Payload\/[^/]+\.app\/[^/]+$/.test(entry))

  if (entries.length === 0) {
    fail(`No app executable candidate found in ${ipaPath}`)
  }

  const keyBytes = Buffer.from(licensePublicKey)
  for (const entry of entries) {
    const binary = unzip(ipaPath, ['-p', ipaPath, entry])
    if (binary.includes(keyBytes)) {
      return
    }
  }

  fail(`${ipaPath} was built without ${licensePublicKeyEnv}`)
}

function verifyReleaseIpas(licensePublicKey) {
  const ipas = collectIpas(appleBuildDir)
  if (ipas.length === 0) {
    fail(`No release IPA found under ${appleBuildDir}`)
  }

  for (const ipa of ipas) {
    assertIpaEmbedsLicensePublicKey(ipa, licensePublicKey)
  }
  console.log(`[tauri-ios-release] Verified ${ipas.length} release IPA(s) embed ${licensePublicKeyEnv}`)
}

function hasExportMethod(args) {
  return args.some((arg) => arg === '--export-method' || arg.startsWith('--export-method='))
}

const metadataOnly =
  forwardedArgs.includes('-h') ||
  forwardedArgs.includes('--help') ||
  forwardedArgs.includes('-V') ||
  forwardedArgs.includes('--version')
const licensePublicKey = metadataOnly ? null : resolveLicensePublicKey()
const childEnv = licensePublicKey
  ? {
      ...process.env,
      [licensePublicKeyEnv]: licensePublicKey,
    }
  : process.env
const args = [
  'ios',
  'build',
  '--target',
  'aarch64',
  '--features',
  'ios',
  '--ci',
]
if (!hasExportMethod(forwardedArgs)) {
  args.push('--export-method', 'debugging')
}
args.push(...forwardedArgs)

if (!metadataOnly) {
  removeStaleIpas()
}
const child = spawn(tauriBinary, args, {
  cwd: appRoot,
  env: childEnv,
  stdio: 'inherit',
})

child.on('error', (error) => {
  console.error(error.message)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  if (code !== 0) {
    process.exit(code ?? 1)
  }

  if (!metadataOnly) {
    verifyReleaseIpas(licensePublicKey)
  }
  process.exit(0)
})
