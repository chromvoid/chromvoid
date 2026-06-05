#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
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
const xcodeProjectFile = path.join(
  appRoot,
  'src-tauri',
  'gen',
  'apple',
  'chromvoid.xcodeproj',
  'project.pbxproj',
)
const xcodeWorkspace = path.join(
  appRoot,
  'src-tauri',
  'gen',
  'apple',
  'chromvoid.xcodeproj',
  'project.xcworkspace',
)
const iosBundleIds = [
  'com.chromvoid.app',
  'com.chromvoid.app.dev',
  '"com.chromvoid.app.credential-provider"',
  '"com.chromvoid.app.share-extension"',
]

function log(message) {
  console.log(`[tauri-ios-build-runner] ${message}`)
}

function fail(message) {
  console.error(`[tauri-ios-build-runner] ${message}`)
  process.exit(1)
}

function listAppleDevelopmentTeams() {
  const result = spawnSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    return []
  }

  const matches = Array.from(
    result.stdout.matchAll(/Apple Development:[^(]+\(([A-Z0-9]{10})\)/g),
  )
  return [...new Set(matches.map((match) => match[1]))]
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
    log(`using license public key from ${filePath}`)
  }

  return value
}

function listXcodeProvisioningTeams() {
  const result = spawnSync('defaults', ['read', 'com.apple.dt.Xcode', 'IDEProvisioningTeamByIdentifier'], {
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    return []
  }

  const blocks = Array.from(result.stdout.matchAll(/\{[\s\S]*?teamID = [A-Z0-9]+;[\s\S]*?\}/g))
  const teams = blocks
    .map((match) => {
      const block = match[0]
      const teamID = block.match(/teamID = ([A-Z0-9]+);/)?.[1]
      if (!teamID) return null
      return {
        teamID,
        isFreeProvisioningTeam: block.match(/isFreeProvisioningTeam = ([01]);/)?.[1] === '1',
      }
    })
    .filter(Boolean)

  const seen = new Set()
  return teams.filter((team) => {
    if (seen.has(team.teamID)) return false
    seen.add(team.teamID)
    return true
  })
}

function resolveAppleDevelopmentTeam() {
  const explicitTeam = process.env.APPLE_DEVELOPMENT_TEAM?.trim()
  if (explicitTeam) {
    log(`using APPLE_DEVELOPMENT_TEAM=${explicitTeam}`)
    const matchingXcodeTeam = listXcodeProvisioningTeams().find((team) => team.teamID === explicitTeam)
    return {
      teamID: explicitTeam,
      isFreeProvisioningTeam: matchingXcodeTeam?.isFreeProvisioningTeam ?? false,
    }
  }

  const xcodeTeams = listXcodeProvisioningTeams()
  if (xcodeTeams.length === 1) {
    log(`using Xcode provisioning team ${xcodeTeams[0].teamID}`)
    return xcodeTeams[0]
  }

  if (xcodeTeams.length > 1) {
    fail(
      `multiple Xcode provisioning teams detected (${xcodeTeams.map((team) => team.teamID).join(', ')}); set APPLE_DEVELOPMENT_TEAM explicitly`,
    )
  }

  const certificateTeams = listAppleDevelopmentTeams()
  if (certificateTeams.length === 1) {
    log(`using detected Apple development certificate team ${certificateTeams[0]}`)
    return {
      teamID: certificateTeams[0],
      isFreeProvisioningTeam: false,
    }
  }

  if (certificateTeams.length > 1) {
    fail(
      `multiple Apple development teams detected (${certificateTeams.join(', ')}); set APPLE_DEVELOPMENT_TEAM explicitly`,
    )
  }

  fail('no Apple development certificate detected; add your Apple ID in Xcode or set APPLE_DEVELOPMENT_TEAM')
}

function injectDevelopmentTeam(projectFile, team) {
  return projectFile.replace(/buildSettings = \{[\s\S]*?\n\t\t\t\};/g, (block) => {
    const isIosSdk = block.includes('SDKROOT = iphoneos;')
    const isIosTarget = iosBundleIds.some((bundleId) =>
      block.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${bundleId};`),
    )

    if (!isIosSdk || !isIosTarget) {
      return block
    }

    if (block.includes('DEVELOPMENT_TEAM = ')) {
      return block.replace(/DEVELOPMENT_TEAM = "?[A-Z0-9]+"?;/g, `DEVELOPMENT_TEAM = ${team};`)
    }

    return block.replace(
      /(\n\s*PRODUCT_BUNDLE_IDENTIFIER = [^;]+;)/,
      `$1\n\t\t\t\tDEVELOPMENT_TEAM = ${team};`,
    )
  })
}

function applyIosReleaseBundleSettings(projectFile) {
  return projectFile.replace(/buildSettings = \{[\s\S]*?\n\t\t\t\};/g, (block) => {
    const isIosAppBlock = /PRODUCT_BUNDLE_IDENTIFIER = "?com\.chromvoid\.app(?:\.dev)?"?;/.test(
      block,
    )
    const isIosSdk = block.includes('SDKROOT = iphoneos;')

    if (!isIosAppBlock || !isIosSdk) {
      return block
    }

    return block
      .replace(
        /PRODUCT_BUNDLE_IDENTIFIER = "?com\.chromvoid\.app(?:\.dev)?"?;/g,
        'PRODUCT_BUNDLE_IDENTIFIER = com.chromvoid.app;',
      )
      .replace(/PRODUCT_NAME = "?ChromVoid(?: Dev)?"?;/g, 'PRODUCT_NAME = ChromVoid;')
  })
}

function forceIosSupportedPlatform(projectFile) {
  return projectFile.replace(/buildSettings = \{[\s\S]*?\n\t\t\t\};/g, (block) => {
    const isIosSdk = block.includes('SDKROOT = iphoneos;')
    const isIosTarget = iosBundleIds.some((bundleId) =>
      block.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${bundleId};`),
    )

    if (!isIosSdk || !isIosTarget) {
      return block
    }

    if (block.includes('SUPPORTED_PLATFORMS = ')) {
      block = block.replace(/SUPPORTED_PLATFORMS = [^;]+;/g, 'SUPPORTED_PLATFORMS = iphoneos;')
    } else {
      block = block.replace(/(\n\s*SDKROOT = iphoneos;)/, '$1\n\t\t\t\tSUPPORTED_PLATFORMS = iphoneos;')
    }

    for (const setting of [
      'SUPPORTS_MACCATALYST',
      'SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD',
      'SUPPORTS_XR_DESIGNED_FOR_IPHONE_IPAD',
    ]) {
      const settingPattern = new RegExp(`${setting} = [^;]+;`, 'g')
      if (block.includes(`${setting} = `)) {
        block = block.replace(settingPattern, `${setting} = NO;`)
      } else {
        block = block.replace(/(\n\s*SUPPORTED_PLATFORMS = iphoneos;)/, `$1\n\t\t\t\t${setting} = NO;`)
      }
    }

    return block
  })
}

function stripCredentialProviderExtension(projectFile) {
  return projectFile
    .replace(
      /\n\t\t\t\t5C477407423C16C42035EAB7 \/\* ChromVoidCredentialProvider\.appex in Embed Foundation Extensions \*\/,/g,
      '',
    )
    .replace(/\n\t\t\t\t43EF4DE18F6A48A061E6F8E0 \/\* PBXTargetDependency \*\/,/g, '')
}

function stripShareExtension(projectFile) {
  return projectFile
    .replace(
      /\n\t\t\t\t90F8C8FDC0D3583162C4E4B1 \/\* ChromVoidShareExtension\.appex in Embed Foundation Extensions \*\/,/g,
      '',
    )
    .replace(/\n\t\t\t\t26CAD578600D45DAA0661168 \/\* PBXTargetDependency \*\/,/g, '')
}

function overrideIosAppEntitlements(projectFile, entitlementsPath) {
  const escapedPath = entitlementsPath.replace(/\\/g, '\\\\')
  return projectFile.replace(
    /CODE_SIGN_ENTITLEMENTS = chromvoid_iOS\/chromvoid_iOS\.entitlements;/g,
    `CODE_SIGN_ENTITLEMENTS = ${escapedPath};`,
  )
}

function quoteShellValue(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function injectRustBuildScriptEnv(projectFile, env) {
  const marker = 'npm run -- tauri ios xcode-script'
  const envExports = [
    `export APPLE_DEVELOPMENT_TEAM=${quoteShellValue(env.APPLE_DEVELOPMENT_TEAM)}`,
    `export ${licensePublicKeyEnv}=${quoteShellValue(env[licensePublicKeyEnv])}`,
  ].join('\\n')
  const existingExportPatterns = [
    'export APPLE_DEVELOPMENT_TEAM=[^\\\\]*(?:\\\\n)',
    `export ${escapeRegExp(licensePublicKeyEnv)}=[^\\\\]*(?:\\\\n)`,
  ]
  const existingEnvExports = new RegExp(
    `(?:${existingExportPatterns.join('|')})+(?=${escapeRegExp(marker)})`,
    'g',
  )

  return projectFile
    .replace(existingEnvExports, '')
    .replace(marker, `${envExports}\\n${marker}`)
}

function emptyEntitlementsPlist() {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict/>',
    '</plist>',
    '',
  ].join('\n')
}

function hasForwardedCliFlag(flag) {
  const delimiterIndex = forwardedArgs.indexOf('--')
  const cliArgs = delimiterIndex === -1 ? forwardedArgs : forwardedArgs.slice(0, delimiterIndex)
  return cliArgs.includes(flag)
}

function runDeviceCtl(args) {
  const jsonPath = path.join(
    os.tmpdir(),
    `chromvoid-devicectl-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  )
  const result = spawnSync('xcrun', ['devicectl', ...args, '--json-output', jsonPath], {
    encoding: 'utf8',
  })
  let json = null
  if (fs.existsSync(jsonPath)) {
    try {
      json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
    } catch {}
    fs.rmSync(jsonPath, {force: true})
  }
  return {result, json}
}

function listPhysicalIOSDevices() {
  const {result, json} = runDeviceCtl(['list', 'devices'])
  if (result.status !== 0) {
    return []
  }
  const devices = json?.result?.devices ?? []
  return devices
    .filter(
      (device) =>
        device?.hardwareProperties?.platform === 'iOS' &&
        device?.hardwareProperties?.reality === 'physical' &&
        device?.connectionProperties?.pairingState === 'paired',
    )
    .map((device) => ({
      name:
        device?.deviceProperties?.name ?? device?.hardwareProperties?.marketingName ?? 'iPhone',
      udid: device?.hardwareProperties?.udid ?? device?.identifier,
    }))
    .filter((device) => Boolean(device.udid))
}

function resolvePhysicalDeviceForSigning() {
  const explicitDevice = process.env.IOS_DEVICE?.trim()
  const devices = listPhysicalIOSDevices()

  if (explicitDevice) {
    const device = devices.find(
      (candidate) => candidate.udid === explicitDevice || candidate.name === explicitDevice,
    )
    return device ?? {name: explicitDevice, udid: explicitDevice}
  }

  if (devices.length === 1) {
    return devices[0]
  }

  if (devices.length > 1) {
    log(
      `skipping iOS device provisioning registration because multiple physical devices are connected (${devices.map((device) => `${device.name} ${device.udid}`).join(', ')}); set IOS_DEVICE`,
    )
  }

  return null
}

function provisioningProfileIncludesDevice(device, teamID) {
  const profilesDir = path.join(
    os.homedir(),
    'Library',
    'Developer',
    'Xcode',
    'UserData',
    'Provisioning Profiles',
  )
  if (!fs.existsSync(profilesDir)) {
    return false
  }

  const appIdentifier = `${teamID}.com.chromvoid.app`
  const profiles = fs
    .readdirSync(profilesDir, {withFileTypes: true})
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mobileprovision'))
    .map((entry) => path.join(profilesDir, entry.name))

  return profiles.some((profile) => {
    const result = spawnSync('security', ['cms', '-D', '-i', profile], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    })
    if (result.status !== 0) {
      return false
    }
    return result.stdout.includes(device.udid) && result.stdout.includes(appIdentifier)
  })
}

function registerPhysicalDeviceForSigning(env) {
  if (process.env.CHROMVOID_IOS_SKIP_DEVICE_REGISTRATION === '1') {
    return
  }

  const device = resolvePhysicalDeviceForSigning()
  if (!device) {
    log('skipping iOS device provisioning registration: no paired physical iOS device found')
    return
  }

  if (provisioningProfileIncludesDevice(device, env.APPLE_DEVELOPMENT_TEAM)) {
    log(`iOS provisioning profile already includes ${device.name} (${device.udid})`)
    return
  }

  log(`registering iOS provisioning for ${device.name} (${device.udid})`)
  const result = spawnSync(
    'xcodebuild',
    [
      '-allowProvisioningUpdates',
      '-allowProvisioningDeviceRegistration',
      '-workspace',
      xcodeWorkspace,
      '-scheme',
      'chromvoid_iOS',
      '-sdk',
      'iphoneos',
      '-configuration',
      'release',
      '-destination',
      `id=${device.udid}`,
      'build',
    ],
    {
      cwd: appRoot,
      env,
      stdio: 'inherit',
    },
  )

  if (result.signal) {
    process.kill(process.pid, result.signal)
    return
  }
  if ((result.status ?? 1) !== 0) {
    if (provisioningProfileIncludesDevice(device, env.APPLE_DEVELOPMENT_TEAM)) {
      log(
        `iOS provisioning profile now includes ${device.name} (${device.udid}); continuing after xcodebuild registration phase`,
      )
      return
    }
    fail(`failed to register iOS provisioning for ${device.name} (${device.udid})`)
  }
}

function runTauriIosBuild(env) {
  const tauriArgs = ['ios', 'build']
  if (!hasForwardedCliFlag('--ci')) {
    tauriArgs.push('--ci')
  }
  tauriArgs.push(...forwardedArgs)

  const result = spawnSync(tauriBinary, tauriArgs, {
    cwd: appRoot,
    env,
    stdio: 'inherit',
  })

  if (result.signal) {
    process.kill(process.pid, result.signal)
    return 1
  }

  return result.status ?? 1
}

if (!fs.existsSync(xcodeProjectFile)) {
  fail(`missing Xcode project file: ${path.relative(appRoot, xcodeProjectFile)}`)
}

const team = resolveAppleDevelopmentTeam()
const licensePublicKey = resolveLicensePublicKey()
const childEnv = {
  ...process.env,
  APPLE_DEVELOPMENT_TEAM: team.teamID,
  [licensePublicKeyEnv]: licensePublicKey,
}
const rawProject = fs.readFileSync(xcodeProjectFile, 'utf8')
const originalProject = applyIosReleaseBundleSettings(rawProject)
let patchedProject = originalProject
patchedProject = injectDevelopmentTeam(patchedProject, team.teamID)
patchedProject = forceIosSupportedPlatform(patchedProject)
patchedProject = injectRustBuildScriptEnv(patchedProject, childEnv)
const disableCredentialProvider =
  process.env.CHROMVOID_IOS_DISABLE_CREDENTIAL_PROVIDER === '1' || team.isFreeProvisioningTeam
const disableShareExtension =
  process.env.CHROMVOID_IOS_DISABLE_SHARE_EXTENSION === '1' || team.isFreeProvisioningTeam
const useLightweightEntitlements =
  process.env.CHROMVOID_IOS_LIGHTWEIGHT_ENTITLEMENTS === '1' || team.isFreeProvisioningTeam
const tempEntitlementsPath = path.join(
  os.tmpdir(),
  `chromvoid-ios-build-${process.pid}.entitlements`,
)

if (disableCredentialProvider) {
  patchedProject = stripCredentialProviderExtension(patchedProject)
}
if (disableShareExtension) {
  patchedProject = stripShareExtension(patchedProject)
}
if (useLightweightEntitlements) {
  patchedProject = overrideIosAppEntitlements(patchedProject, tempEntitlementsPath)
}

let exitCode = 1
try {
  if (useLightweightEntitlements) {
    fs.writeFileSync(tempEntitlementsPath, emptyEntitlementsPlist())
  }
  fs.writeFileSync(xcodeProjectFile, patchedProject)
  log(`temporarily injected DEVELOPMENT_TEAM=${team.teamID} into Xcode project`)
  if (disableCredentialProvider) {
    log('temporarily disabled CredentialProviderExtension for this iOS build')
  }
  if (disableShareExtension) {
    log('temporarily disabled ShareExtension for this iOS build')
  }
  if (useLightweightEntitlements) {
    log('temporarily replaced iOS app entitlements for this iOS build')
  }
  registerPhysicalDeviceForSigning(childEnv)
  exitCode = runTauriIosBuild(childEnv)
} finally {
  fs.writeFileSync(xcodeProjectFile, originalProject)
  fs.rmSync(tempEntitlementsPath, {force: true})
  log('restored Xcode project signing settings')
}

process.exit(exitCode)
