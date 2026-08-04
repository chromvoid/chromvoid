#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn, spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {loadWalletEnvFromRoot} from './wallet-env.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(appRoot, '..', '..')
loadWalletEnvFromRoot(repoRoot)
const forwardedArgs = process.argv.slice(2)
const licensePublicKeyEnv = 'CHROMVOID_LICENSE_PUBLIC_KEY_ED25519_2026_01'
const licensePublicKeyFiles = [
  path.join(appRoot, 'src-tauri', 'gen', 'apple', '.license-public-key'),
  path.join(appRoot, 'src-tauri', 'gen', 'android', '.license-public-key'),
]
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
const cargoLockFile = path.join(appRoot, 'src-tauri', 'Cargo.lock')
const vendoredPluginsDir = path.join(appRoot, 'src-tauri', 'vendor')
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
    const detail =
      result.stderr?.toString().trim() || result.stdout?.toString().trim() || `unzip failed for ${ipaPath}`
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

function readLockedTauriVersion() {
  const lockFile = fs.readFileSync(cargoLockFile, 'utf8')
  const match = lockFile.match(/\[\[package\]\]\s+name = "tauri"\s+version = "([^"]+)"/m)
  if (!match) {
    fail(`Failed to read the locked Tauri version from ${cargoLockFile}`)
  }
  return match[1]
}

function findLockedTauriIosApiPath() {
  const tauriVersion = readLockedTauriVersion()
  const cargoHome = process.env.CARGO_HOME
    ? path.resolve(process.env.CARGO_HOME)
    : path.join(os.homedir(), '.cargo')
  const registrySourcesDir = path.join(cargoHome, 'registry', 'src')
  if (!fs.existsSync(registrySourcesDir)) {
    return null
  }

  for (const registryDir of fs.readdirSync(registrySourcesDir, {withFileTypes: true})) {
    if (!registryDir.isDirectory()) {
      continue
    }
    const packagePath = path.join(
      registrySourcesDir,
      registryDir.name,
      `tauri-${tauriVersion}`,
      'mobile',
      'ios-api',
    )
    if (fs.existsSync(path.join(packagePath, 'Package.resolved'))) {
      return packagePath
    }
  }

  return null
}

function snapshotVendoredIosBuildState() {
  if (!fs.existsSync(vendoredPluginsDir)) {
    return []
  }

  const states = []
  for (const plugin of fs.readdirSync(vendoredPluginsDir, {withFileTypes: true})) {
    if (!plugin.isDirectory() || !plugin.name.startsWith('tauri-plugin-')) {
      continue
    }

    const pluginDir = path.join(vendoredPluginsDir, plugin.name)
    const iosDir = path.join(pluginDir, 'ios')
    const packageFile = path.join(iosDir, 'Package.swift')
    if (
      !fs.existsSync(packageFile) ||
      !fs.readFileSync(packageFile, 'utf8').includes('../.tauri/tauri-api')
    ) {
      continue
    }

    const resolvedFile = path.join(iosDir, 'Package.resolved')
    const tauriDir = path.join(pluginDir, '.tauri')
    states.push({
      resolvedFile,
      resolvedContents: fs.existsSync(resolvedFile) ? fs.readFileSync(resolvedFile) : null,
      tauriDir,
      tauriDirExisted: fs.existsSync(tauriDir),
    })
  }
  return states
}

function prepareVendoredIosPackageResolutions(states) {
  const tauriIosApiPath = findLockedTauriIosApiPath()
  if (!tauriIosApiPath) {
    fail(
      'Locked Tauri iOS API package is missing from the Cargo registry cache. Run cargo fetch before the release build.',
    )
  }

  const resolvedContents = fs.readFileSync(path.join(tauriIosApiPath, 'Package.resolved'))
  for (const state of states) {
    fs.writeFileSync(state.resolvedFile, resolvedContents)
  }
  console.log(
    `[tauri-ios-release] Prepared SwiftPM resolution for ${states.length} vendored iOS plugin package(s)`,
  )
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
      {cwd: appRoot, env: childEnv, stdio: 'inherit'},
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
    {cwd: appRoot, env: childEnv, stdio: 'inherit'},
  )
  return result.status === 0
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
const generatedBuildFileContents = metadataOnly
  ? new Map()
  : new Map(generatedBuildFiles.map((filePath) => [filePath, fs.readFileSync(filePath)]))
const vendoredIosBuildState = metadataOnly ? [] : snapshotVendoredIosBuildState()
let generatedBuildFilesRestored = false

function restoreGeneratedBuildFiles() {
  if (generatedBuildFilesRestored) {
    return
  }
  for (const [filePath, contents] of generatedBuildFileContents) {
    fs.writeFileSync(filePath, contents)
  }
  for (const state of vendoredIosBuildState) {
    if (state.resolvedContents === null) {
      fs.rmSync(state.resolvedFile, {force: true})
    } else {
      fs.writeFileSync(state.resolvedFile, state.resolvedContents)
    }
    if (!state.tauriDirExisted) {
      fs.rmSync(state.tauriDir, {force: true, recursive: true})
    }
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
  prepareVendoredIosPackageResolutions(vendoredIosBuildState)
  removeStaleIpas()
}
const buildStartedAt = Date.now()
const child = spawn(tauriBinary, args, {
  cwd: appRoot,
  env: childEnv,
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
      verifyReleaseIpas(licensePublicKey)
      process.exit(0)
    }
    process.exit(code || 1)
  }

  if (code !== 0) {
    process.exit(code ?? 1)
  }

  if (!metadataOnly) {
    verifyReleaseIpas(licensePublicKey)
  }
  process.exit(0)
})
