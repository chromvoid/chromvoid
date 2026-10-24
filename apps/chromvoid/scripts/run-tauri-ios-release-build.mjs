#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import {spawn, spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {loadWalletEnvFromRoot} from './wallet-env.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(appRoot, '..', '..')
loadWalletEnvFromRoot(repoRoot)
const forwardedArgs = process.argv.slice(2)
const appleBuildDir = path.join(appRoot, 'src-tauri', 'gen', 'apple', 'build')
const appStoreArchive = path.join(appleBuildDir, 'chromvoid_iOS.xcarchive')
const appStoreArchiveInfo = path.join(appStoreArchive, 'Info.plist')
const appStoreArchiveApp = path.join(
  appStoreArchive,
  'Products',
  'Applications',
  'ChromVoid.app',
)
const appStoreExportDir = path.join(appleBuildDir, 'app-store-connect')
const appStoreExportOptions = path.join(appRoot, 'src-tauri', 'gen', 'apple', 'AppStoreExportOptions.plist')
const appStoreSigningTargets = [
  {
    bundle: path.join(
      appStoreArchiveApp,
      'PlugIns',
      'ChromVoidCredentialProvider.appex',
    ),
    entitlements: path.join(
      appRoot,
      'src-tauri',
      'gen',
      'apple',
      'chromvoid_CredentialProviderExtension',
      'chromvoid_CredentialProviderExtension.entitlements',
    ),
  },
  {
    bundle: path.join(appStoreArchiveApp, 'PlugIns', 'ChromVoidShareExtension.appex'),
    entitlements: path.join(
      appRoot,
      'src-tauri',
      'gen',
      'apple',
      'chromvoid_ShareExtension',
      'chromvoid_ShareExtension.entitlements',
    ),
  },
  {
    bundle: appStoreArchiveApp,
    entitlements: path.join(
      appRoot,
      'src-tauri',
      'gen',
      'apple',
      'chromvoid_iOS',
      'chromvoid_iOS.entitlements',
    ),
  },
]
const generatedBuildFiles = [
  path.join(appRoot, 'src-tauri', 'gen', 'schemas', 'acl-manifests.json'),
  path.join(appRoot, 'src-tauri', 'gen', 'apple', 'chromvoid.xcodeproj', 'project.pbxproj'),
  path.join(appRoot, 'src-tauri', 'gen', 'apple', 'chromvoid_iOS', 'Info.plist'),
  path.join(appRoot, 'src-tauri', 'gen', 'apple', 'chromvoid_CredentialProviderExtension', 'Info.plist'),
  path.join(
    appRoot,
    'src-tauri',
    'gen',
    'apple',
    'chromvoid_CredentialProviderExtension',
    'Info-macOS.plist',
  ),
  path.join(appRoot, 'src-tauri', 'gen', 'apple', 'chromvoid_ShareExtension', 'Info.plist'),
  path.join(appRoot, 'src-tauri', 'gen', 'apple', 'chromvoid_macos', 'Info.plist'),
]
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

function verifyReleaseIpas() {
  const ipas = collectIpas(appleBuildDir)
  if (ipas.length === 0) {
    fail(`No release IPA found under ${appleBuildDir}`)
  }
  console.log(`[tauri-ios-release] Found ${ipas.length} release IPA(s)`)
}

function hasExportMethod(args) {
  return args.some((arg) => arg === '--export-method' || arg.startsWith('--export-method='))
}

function extractBuildNumber(args) {
  const inlineValue = args.find((arg) => arg.startsWith('--build-number='))?.slice('--build-number='.length)
  const optionIndex = args.indexOf('--build-number')
  const value = inlineValue ?? (optionIndex === -1 ? null : args[optionIndex + 1])

  if (value !== null && !/^[1-9]\d*$/.test(value)) {
    fail(`--build-number must be a positive integer, got ${JSON.stringify(value)}.`)
  }
  return value
}

function withoutBuildNumber(args) {
  const result = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg.startsWith('--build-number=')) {
      continue
    }
    if (arg === '--build-number') {
      index += 1
      continue
    }
    result.push(arg)
  }
  return result
}

function requestsAppStoreConnectExport(args) {
  const inlineMethod = args
    .find((arg) => arg.startsWith('--export-method='))
    ?.slice('--export-method='.length)
  if (inlineMethod) {
    return inlineMethod === 'app-store-connect'
  }

  const methodIndex = args.indexOf('--export-method')
  return methodIndex !== -1 && args[methodIndex + 1] === 'app-store-connect'
}

function readAppStoreTeamId() {
  const result = spawnSync(
    'plutil',
    ['-extract', 'teamID', 'raw', '-o', '-', appStoreExportOptions],
    {encoding: 'utf8'},
  )
  if (result.status !== 0 || !result.stdout.trim()) {
    fail(`Failed to read teamID from ${appStoreExportOptions}`)
  }
  return result.stdout.trim()
}

function findAppleDistributionIdentity() {
  const teamId = readAppStoreTeamId()
  const result = spawnSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    fail('Failed to list code-signing identities from the login keychain')
  }

  const identities = result.stdout
    .split(/\r?\n/)
    .filter((line) => line.includes('Apple Distribution:') && line.includes(`(${teamId})`))
    .map((line) => line.match(/\b[0-9A-F]{40}\b/)?.[0])
    .filter(Boolean)
  if (identities.length !== 1) {
    fail(`Expected one Apple Distribution identity for team ${teamId}, found ${identities.length}`)
  }
  return identities[0]
}

function resignAppStoreArchive() {
  const identity = findAppleDistributionIdentity()
  console.log('[tauri-ios-release] Re-signing App Store archive with production entitlements')

  for (const target of appStoreSigningTargets) {
    if (!fs.existsSync(target.bundle) || !fs.existsSync(target.entitlements)) {
      fail(`Missing App Store signing input: ${target.bundle} or ${target.entitlements}`)
    }
    const result = spawnSync(
      'codesign',
      [
        '--force',
        '--sign',
        identity,
        '--entitlements',
        target.entitlements,
        '--generate-entitlement-der',
        '--timestamp=none',
        target.bundle,
      ],
      {cwd: appRoot, env: process.env, stdio: 'inherit'},
    )
    if (result.status !== 0) {
      fail(`Failed to sign ${target.bundle}`)
    }
  }
}

function exportFreshAppStoreArchive(buildStartedAt) {
  if (!fs.existsSync(appStoreArchiveInfo) || !fs.existsSync(appStoreExportOptions)) {
    return false
  }
  if (fs.statSync(appStoreArchiveInfo).mtimeMs < buildStartedAt) {
    return false
  }

  resignAppStoreArchive()
  console.log('[tauri-ios-release] Exporting with manual App Store provisioning profiles')
  const result = spawnSync(
    'xcodebuild',
    [
      '-exportArchive',
      '-archivePath',
      appStoreArchive,
      '-exportPath',
      appStoreExportDir,
      '-exportOptionsPlist',
      appStoreExportOptions,
    ],
    {cwd: appRoot, env: process.env, stdio: 'inherit'},
  )
  return result.status === 0
}

const metadataOnly =
  forwardedArgs.includes('-h') ||
  forwardedArgs.includes('--help') ||
  forwardedArgs.includes('-V') ||
  forwardedArgs.includes('--version')
const generatedBuildFileContents = metadataOnly
  ? new Map()
  : new Map(generatedBuildFiles.map((filePath) => [filePath, fs.readFileSync(filePath)]))
let generatedBuildFilesRestored = false

function restoreGeneratedBuildFiles() {
  if (generatedBuildFilesRestored) {
    return
  }
  for (const [filePath, contents] of generatedBuildFileContents) {
    fs.writeFileSync(filePath, contents)
  }
  generatedBuildFilesRestored = true
}

const buildNumber = metadataOnly ? null : extractBuildNumber(forwardedArgs)
const tauriForwardedArgs = withoutBuildNumber(forwardedArgs)

const args = ['ios', 'build', '--target', 'aarch64', '--features', 'ios', '--ci']
if (!hasExportMethod(forwardedArgs)) {
  args.push('--export-method', 'debugging')
}
if (buildNumber !== null) {
  args.push('--config', JSON.stringify({bundle: {iOS: {bundleVersion: buildNumber}}}))
}
args.push(...tauriForwardedArgs)

if (!metadataOnly) {
  removeStaleIpas()
}
const buildStartedAt = Date.now()
const child = spawn(tauriBinary, args, {
  cwd: appRoot,
  env: process.env,
  stdio: 'inherit',
})

child.on('error', (error) => {
  restoreGeneratedBuildFiles()
  console.error(error.message)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  restoreGeneratedBuildFiles()
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  if (
    !metadataOnly &&
    requestsAppStoreConnectExport(forwardedArgs) &&
    fs.existsSync(appStoreArchiveInfo) &&
    fs.statSync(appStoreArchiveInfo).mtimeMs >= buildStartedAt
  ) {
    if (exportFreshAppStoreArchive(buildStartedAt)) {
      verifyReleaseIpas()
      process.exit(0)
    }
    process.exit(code || 1)
  }

  if (code !== 0) {
    process.exit(code ?? 1)
  }

  if (!metadataOnly) {
    verifyReleaseIpas()
  }
  process.exit(0)
})
