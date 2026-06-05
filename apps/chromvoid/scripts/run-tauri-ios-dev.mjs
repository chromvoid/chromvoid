#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn, spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(scriptDir, '..')
const rawForwardedArgs = process.argv.slice(2)
const forwardedArgs = []
const devConfigArgs = ['--config', 'src-tauri/tauri.dev.conf.json']
let usePhysicalDeviceDefault = false
let requestedPhysicalDeviceRef = process.env.IOS_DEVICE?.trim() ?? ''

for (let index = 0; index < rawForwardedArgs.length; index += 1) {
  const arg = rawForwardedArgs[index]
  if (arg === '--physical-device') {
    usePhysicalDeviceDefault = true
    const nextArg = rawForwardedArgs[index + 1]
    if (nextArg && !nextArg.startsWith('-')) {
      requestedPhysicalDeviceRef = nextArg
      index += 1
    }
    continue
  }
  if (arg.startsWith('--physical-device=')) {
    usePhysicalDeviceDefault = true
    requestedPhysicalDeviceRef = arg.slice('--physical-device='.length)
    continue
  }
  forwardedArgs.push(arg)
}

let tauriArgs = ['ios', 'dev', ...devConfigArgs, ...forwardedArgs]
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
const cargoLockFile = path.join(appRoot, 'src-tauri', 'Cargo.lock')
const cargoRegistrySrcDir = path.join(os.homedir(), '.cargo', 'registry', 'src')

function log(message) {
  console.log(`[tauri-ios-runner] ${message}`)
}

function fail(message) {
  console.error(`[tauri-ios-runner] ${message}`)
  process.exit(1)
}

function readLockedTauriVersion() {
  if (!fs.existsSync(cargoLockFile)) {
    return null
  }

  const lockFile = fs.readFileSync(cargoLockFile, 'utf8')
  const match = lockFile.match(/\[\[package\]\]\s+name = "tauri"\s+version = "([^"]+)"/m)
  return match?.[1] ?? null
}

function findTauriIosApiPackagePath() {
  const tauriVersion = readLockedTauriVersion()
  if (!tauriVersion || !fs.existsSync(cargoRegistrySrcDir)) {
    return null
  }

  const registryEntries = fs.readdirSync(cargoRegistrySrcDir, {withFileTypes: true})
  for (const entry of registryEntries) {
    if (!entry.isDirectory()) {
      continue
    }

    const packagePath = path.join(
      cargoRegistrySrcDir,
      entry.name,
      `tauri-${tauriVersion}`,
      'mobile',
      'ios-api',
    )
    if (fs.existsSync(path.join(packagePath, 'Package.swift'))) {
      return packagePath
    }
  }

  return null
}

function isSwiftRsResolutionFailure(output) {
  return (
    output.includes('https://github.com/Brendonovich/swift-rs') &&
    (output.includes('Could not resolve host: github.com') ||
      output.includes('Failed to clone repository https://github.com/Brendonovich/swift-rs'))
  )
}

function warmSwiftRsCache() {
  const packagePath = findTauriIosApiPackagePath()
  if (!packagePath) {
    log('skipping SwiftPM cache warmup: failed to locate tauri iOS API package')
    return false
  }

  log('warming SwiftPM cache for tauri iOS dependencies')
  const result = spawnSync(
    'swift',
    ['package', 'show-dependencies', '--package-path', packagePath, '--format', 'json'],
    {encoding: 'utf8'},
  )

  if (result.status !== 0) {
    const stderr = result.stderr?.trim()
    if (stderr) {
      console.error(`[tauri-ios-runner] swift package warmup failed:\n${stderr}`)
    }
    return false
  }

  return true
}

function listAppleDevelopmentTeams() {
  const result = spawnSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    return []
  }

  const matches = Array.from(result.stdout.matchAll(/Apple Development:[^(]+\(([A-Z0-9]{10})\)/g))
  return [...new Set(matches.map((match) => match[1]))]
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
      if (!teamID) {
        return null
      }

      return {
        teamID,
        teamName: block.match(/teamName = "([^"]+)";/)?.[1] ?? null,
        isFreeProvisioningTeam: block.match(/isFreeProvisioningTeam = ([01]);/)?.[1] === '1',
      }
    })
    .filter(Boolean)

  const seen = new Set()
  return teams.filter((team) => {
    if (seen.has(team.teamID)) {
      return false
    }
    seen.add(team.teamID)
    return true
  })
}

function resolveAppleDevelopmentTeam({requireTeam}) {
  const xcodeTeams = listXcodeProvisioningTeams()
  const explicitTeam = process.env.APPLE_DEVELOPMENT_TEAM?.trim()
  if (explicitTeam) {
    log(`using APPLE_DEVELOPMENT_TEAM=${explicitTeam}`)
    const matchingTeam = xcodeTeams.find((team) => team.teamID === explicitTeam)
    return {
      teamID: explicitTeam,
      teamName: matchingTeam?.teamName ?? null,
      isFreeProvisioningTeam: matchingTeam?.isFreeProvisioningTeam ?? false,
      source: 'env',
    }
  }

  if (xcodeTeams.length === 1) {
    const [team] = xcodeTeams
    const suffix = team.teamName ? ` (${team.teamName})` : ''
    log(`using Xcode provisioning team ${team.teamID}${suffix}`)
    return {...team, source: 'xcode'}
  }

  const certificateTeams = listAppleDevelopmentTeams()
  const matchingXcodeTeams = xcodeTeams.filter((team) => certificateTeams.includes(team.teamID))
  if (matchingXcodeTeams.length === 1) {
    const [team] = matchingXcodeTeams
    const suffix = team.teamName ? ` (${team.teamName})` : ''
    log(`using Xcode provisioning team ${team.teamID}${suffix}`)
    return {...team, source: 'xcode'}
  }

  if (xcodeTeams.length > 1 && requireTeam) {
    console.error(
      `[tauri-ios-runner] multiple Xcode provisioning teams detected (${xcodeTeams.map((team) => team.teamID).join(', ')}); set APPLE_DEVELOPMENT_TEAM explicitly`,
    )
    process.exit(1)
  }

  if (xcodeTeams.length === 0 && requireTeam) {
    console.error(
      '[tauri-ios-runner] no Xcode provisioning team detected; add your Apple ID in Xcode -> Settings -> Accounts or set APPLE_DEVELOPMENT_TEAM explicitly',
    )
    process.exit(1)
  }

  if (certificateTeams.length === 1) {
    log(`using detected Apple development certificate team ${certificateTeams[0]}`)
    return {
      teamID: certificateTeams[0],
      teamName: null,
      isFreeProvisioningTeam: false,
      source: 'certificate',
    }
  }

  return null
}

function injectDevelopmentTeam(projectFile, team) {
  return projectFile.replace(/buildSettings = \{[\s\S]*?\n\t\t\t\};/g, (block) => {
    const isIosAppBlock = /PRODUCT_BUNDLE_IDENTIFIER = "?com\.chromvoid\.app(?:\.dev)?"?;/.test(block)
    const isIosExtensionBlock =
      /PRODUCT_BUNDLE_IDENTIFIER = "?com\.chromvoid\.app(?:\.dev)?\.credential-provider"?;/.test(block) ||
      /PRODUCT_BUNDLE_IDENTIFIER = "?com\.chromvoid\.app(?:\.dev)?\.share-extension"?;/.test(block)
    const isIosSdkBlock =
      block.includes('SDKROOT = iphoneos;') || block.includes('SDKROOT = iphonesimulator;')

    if ((!isIosAppBlock && !isIosExtensionBlock) || !isIosSdkBlock) {
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

function applyIosDevBundleSettings(projectFile) {
  return projectFile.replace(/buildSettings = \{[\s\S]*?\n\t\t\t\};/g, (block) => {
    const isIosAppBlock = /PRODUCT_BUNDLE_IDENTIFIER = "?com\.chromvoid\.app(?:\.dev)?"?;/.test(block)
    const isIosSdkBlock =
      block.includes('SDKROOT = iphoneos;') || block.includes('SDKROOT = iphonesimulator;')

    if (!isIosAppBlock || !isIosSdkBlock) {
      return block
    }

    return block
      .replace(
        /PRODUCT_BUNDLE_IDENTIFIER = "?com\.chromvoid\.app(?:\.dev)?"?;/g,
        'PRODUCT_BUNDLE_IDENTIFIER = com.chromvoid.app.dev;',
      )
      .replace(/PRODUCT_NAME = "?ChromVoid(?: Dev)?"?;/g, 'PRODUCT_NAME = "ChromVoid Dev";')
  })
}

function applyIosReleaseBundleSettings(projectFile) {
  return projectFile.replace(/buildSettings = \{[\s\S]*?\n\t\t\t\};/g, (block) => {
    const isIosAppBlock = /PRODUCT_BUNDLE_IDENTIFIER = "?com\.chromvoid\.app(?:\.dev)?"?;/.test(block)
    const isIosSdkBlock =
      block.includes('SDKROOT = iphoneos;') || block.includes('SDKROOT = iphonesimulator;')

    if (!isIosAppBlock || !isIosSdkBlock) {
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

function stripCredentialProviderForFreeTeam(projectFile) {
  return projectFile
    .replace(/\n\t\t\t\t552D41F70370C5C9BCF89B10 \/\* Embed Foundation Extensions \*\/,/g, '')
    .replace(/\n\t\t\t\t43EF4DE18F6A48A061E6F8E0 \/\* PBXTargetDependency \*\/,/g, '')
}

function overrideIosAppEntitlements(projectFile, entitlementsPath) {
  const escapedPath = entitlementsPath.replace(/\\/g, '\\\\')
  return projectFile.replace(
    /CODE_SIGN_ENTITLEMENTS = chromvoid_iOS\/chromvoid_iOS\.entitlements;/g,
    `CODE_SIGN_ENTITLEMENTS = ${escapedPath};`,
  )
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

function prepareTemporarySigning(teamInfo, {useLightweightDeviceSigning}) {
  if (!fs.existsSync(xcodeProjectFile)) {
    return () => {}
  }

  const edits = []

  const rawProject = fs.readFileSync(xcodeProjectFile, 'utf8')
  const originalProject = applyIosReleaseBundleSettings(rawProject)
  let patchedProject = applyIosDevBundleSettings(originalProject)
  if (teamInfo?.teamID) {
    patchedProject = injectDevelopmentTeam(patchedProject, teamInfo.teamID)
  }
  if (useLightweightDeviceSigning) {
    const tempEntitlementsPath = path.join(os.tmpdir(), `chromvoid-ios-free-team-${process.pid}.entitlements`)
    fs.writeFileSync(tempEntitlementsPath, emptyEntitlementsPlist())
    edits.push({
      path: tempEntitlementsPath,
      original: null,
      patched: emptyEntitlementsPlist(),
      cleanup: () => fs.rmSync(tempEntitlementsPath, {force: true}),
    })
    patchedProject = stripCredentialProviderForFreeTeam(patchedProject)
    patchedProject = overrideIosAppEntitlements(patchedProject, tempEntitlementsPath)
  }
  if (patchedProject !== originalProject) {
    edits.push({path: xcodeProjectFile, original: originalProject, patched: patchedProject})
  }

  if (edits.length === 0) {
    return () => {}
  }

  for (const edit of edits) {
    fs.writeFileSync(edit.path, edit.patched)
  }

  log('temporarily set iOS dev bundle identifier to com.chromvoid.app.dev')
  if (teamInfo?.teamID) {
    log(`temporarily injected DEVELOPMENT_TEAM=${teamInfo.teamID} into Xcode project`)
  }
  if (useLightweightDeviceSigning) {
    log(`using lightweight device signing for free Xcode team ${teamInfo.teamID}`)
  }

  let restored = false
  return () => {
    if (restored) {
      return
    }
    restored = true
    for (const edit of edits) {
      if (typeof edit.cleanup === 'function') {
        edit.cleanup()
        continue
      }
      if (!fs.existsSync(edit.path)) {
        continue
      }
      fs.writeFileSync(edit.path, edit.original)
    }
    log('restored Xcode project signing settings')
  }
}

function runDeviceCtl(args) {
  const jsonPath = path.join(
    os.tmpdir(),
    `chromvoid-devicectl-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  )
  const result = spawnSync('xcrun', ['devicectl', ...args, '-j', jsonPath], {encoding: 'utf8'})
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
      name: device?.deviceProperties?.name ?? device?.hardwareProperties?.marketingName ?? 'iPhone',
      udid: device?.hardwareProperties?.udid ?? device?.identifier,
    }))
    .filter((device) => Boolean(device.udid))
}

function findRequestedPhysicalDevice(args, devices) {
  const targets = args.filter((arg) => !arg.startsWith('-'))
  if (targets.length === 0) {
    return null
  }

  return (
    devices.find((device) => targets.includes(device.udid)) ??
    devices.find((device) => targets.includes(device.name)) ??
    null
  )
}

function resolveDefaultPhysicalDevice(devices, requestedRef) {
  if (requestedRef) {
    const requestedDevice =
      devices.find((device) => device.udid === requestedRef) ??
      devices.find((device) => device.name === requestedRef)
    if (requestedDevice) {
      return requestedDevice
    }

    const labels = devices.map((device) => `${device.name} (${device.udid})`).join(', ')
    fail(`requested iOS device was not found: ${requestedRef}. Available paired devices: ${labels || 'none'}`)
  }

  if (devices.length === 1) {
    return devices[0]
  }

  if (devices.length > 1) {
    const labels = devices.map((device) => `${device.name} (${device.udid})`).join(', ')
    fail(
      `multiple paired physical iOS devices found: ${labels}. Set IOS_DEVICE or pass --physical-device <device>.`,
    )
  }

  fail(
    'no paired physical iOS device found. Connect and trust an iPhone, or pass a simulator/device to npm run ios.',
  )
}

function listAvailableIOSSimulators() {
  const result = spawnSync('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], {
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    return []
  }

  const json = JSON.parse(result.stdout)
  return Object.entries(json.devices ?? {})
    .filter(([runtime]) => runtime.includes('.iOS-'))
    .flatMap(([, devices]) => devices ?? [])
    .filter((device) => device?.isAvailable && typeof device?.name === 'string')
}

function resolveDefaultIosTarget() {
  const simulators = listAvailableIOSSimulators()
  if (simulators.length === 0) {
    return null
  }

  const preferredNames = ['iPhone 17', 'iPhone 16', 'iPhone 16e']
  for (const name of preferredNames) {
    const simulator = simulators.find((device) => device.name === name)
    if (simulator) {
      return simulator.name
    }
  }

  const bootedIPhone = simulators.find(
    (device) => device.state === 'Booted' && device.name.startsWith('iPhone'),
  )
  if (bootedIPhone) {
    return bootedIPhone.name
  }

  const anyIPhone = simulators.find((device) => device.name.startsWith('iPhone'))
  return anyIPhone?.name ?? simulators[0].name ?? null
}

function getLockState(deviceRef) {
  const {result, json} = runDeviceCtl(['device', 'info', 'lockState', '--device', deviceRef])
  if (result.status !== 0) {
    return null
  }
  const state = json?.result
  if (!state || typeof state.passcodeRequired !== 'boolean') {
    return null
  }
  return {locked: state.passcodeRequired}
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitUntilUnlocked(deviceRef, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = getLockState(deviceRef)
    if (!state) {
      return false
    }
    if (!state.locked) {
      return true
    }
    log(`device ${deviceRef} is locked; unlock it to continue`)
    await sleep(3_000)
  }
  return false
}

function isLockedLaunchError(output) {
  return (
    output.includes('BSErrorCodeDescription = Locked') ||
    output.includes('device was not, or could not be, unlocked') ||
    output.includes('FBSOpenApplicationErrorDomain error 7')
  )
}

function hasActionableBuildFailure(output) {
  return (
    output.includes('failed to run iOS app: failed to build with xcodebuild') ||
    output.includes('No Account for Team "') ||
    output.includes('Unable to log in with account') ||
    output.includes('No profiles for ') ||
    output.includes('Signing for "') ||
    output.includes('does not have a program membership that is eligible for this feature')
  )
}

function summarizeBuildFailure(output, team) {
  const lines = []
  const noAccountMatch = output.match(/No Account for Team "([A-Z0-9]+)"/)
  if (noAccountMatch) {
    lines.push(
      `Xcode has no active account for team ${noAccountMatch[1]}. Open Xcode -> Settings -> Accounts, sign in, and rerun.`,
    )
  }

  const loginMatch = output.match(/Unable to log in with account '([^']+)'/)
  if (loginMatch) {
    lines.push(
      `Xcode could not authenticate Apple ID ${loginMatch[1]}. Re-authenticate that account in Xcode -> Settings -> Accounts, then rerun.`,
    )
  }

  const profileMatch = output.match(/No profiles for '([^']+)' were found/)
  if (profileMatch) {
    lines.push(
      `No iOS development provisioning profile exists for bundle ID ${profileMatch[1]}. Let automatic signing create one or use a team-owned bundle ID.`,
    )
  }

  const signingMatch = output.match(/Signing for "([^"]+)" requires a development team/)
  if (signingMatch) {
    lines.push(
      `Target ${signingMatch[1]} still has no DEVELOPMENT_TEAM. Set APPLE_DEVELOPMENT_TEAM or regenerate the Xcode project.`,
    )
  }

  if (output.includes('does not have a program membership that is eligible for this feature')) {
    lines.push(
      'The selected Apple team is not eligible for one of the requested iOS capabilities. On a Personal Team, credential-provider and app-group features must be stripped from the device dev build.',
    )
  }

  if (
    lines.length > 0 &&
    team &&
    !lines.some((line) => line.includes(team)) &&
    output.includes('No profiles for ')
  ) {
    lines.push(`Current signing team: ${team}.`)
  }

  return lines
}

function extractDeviceRefFromOutput(output) {
  const matches = Array.from(output.matchAll(/--device["\s,]+["']?([0-9A-Fa-f-]{10,})["']?/g))
  if (matches.length === 0) {
    return null
  }
  return matches[matches.length - 1][1]
}

function runTauri(appleDevelopmentTeam) {
  return new Promise((resolve) => {
    let output = ''
    let settled = false
    let exitCode = 1
    let exitSignal = null
    const child = spawn(tauriBinary, tauriArgs, {
      cwd: appRoot,
      env: appleDevelopmentTeam?.teamID
        ? {...process.env, APPLE_DEVELOPMENT_TEAM: appleDevelopmentTeam.teamID}
        : process.env,
      stdio: ['inherit', 'pipe', 'pipe'],
    })
    const forwardSignal = (signal) => {
      exitSignal = signal
      if (!child.killed) {
        child.kill(signal)
      }
    }
    process.once('SIGINT', forwardSignal)
    process.once('SIGTERM', forwardSignal)

    const appendOutput = (chunk) => {
      output += chunk
      if (output.length > 400_000) {
        output = output.slice(-400_000)
      }
    }

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString()
      appendOutput(text)
      process.stdout.write(text)
    })

    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString()
      appendOutput(text)
      process.stderr.write(text)
    })

    child.on('error', (error) => {
      if (settled) {
        return
      }
      settled = true
      console.error(`[tauri-ios-runner] failed to spawn tauri: ${error.message}`)
      resolve({code: 1, signal: null, output: `${output}\n${error.message}`})
    })

    child.on('exit', (code, signal) => {
      exitCode = code ?? 1
      exitSignal = signal ?? null
    })

    child.on('close', () => {
      process.removeListener('SIGINT', forwardSignal)
      process.removeListener('SIGTERM', forwardSignal)
      if (settled) {
        return
      }
      settled = true
      resolve({code: exitCode, signal: exitSignal, output})
    })
  })
}

async function main() {
  const wantsHelp = process.argv.includes('-h') || process.argv.includes('--help')
  const preflightDevices = wantsHelp ? [] : listPhysicalIOSDevices()
  let requestedPhysicalDevice = wantsHelp
    ? null
    : findRequestedPhysicalDevice(forwardedArgs, preflightDevices)
  if (!wantsHelp && usePhysicalDeviceDefault) {
    const positionalArgs = forwardedArgs.filter((arg) => !arg.startsWith('-'))
    if (!requestedPhysicalDevice && positionalArgs.length === 0) {
      requestedPhysicalDevice = resolveDefaultPhysicalDevice(preflightDevices, requestedPhysicalDeviceRef)
      tauriArgs = ['ios', 'dev', ...devConfigArgs, requestedPhysicalDevice.name, ...forwardedArgs]
    }
    if (requestedPhysicalDevice) {
      log(`using physical iOS device ${requestedPhysicalDevice.name} (${requestedPhysicalDevice.udid})`)
    }
  }
  const requireSigningTeam = !wantsHelp && requestedPhysicalDevice !== null
  if (
    !wantsHelp &&
    !usePhysicalDeviceDefault &&
    forwardedArgs.filter((arg) => !arg.startsWith('-')).length === 0
  ) {
    const defaultTarget = resolveDefaultIosTarget()
    if (defaultTarget) {
      tauriArgs = ['ios', 'dev', ...devConfigArgs, defaultTarget, ...forwardedArgs]
      log(`using default iOS simulator target ${defaultTarget}`)
    }
  }
  const appleDevelopmentTeam = requireSigningTeam ? resolveAppleDevelopmentTeam({requireTeam: true}) : null
  const useLightweightDeviceSigning =
    requireSigningTeam && appleDevelopmentTeam?.isFreeProvisioningTeam === true
  const restoreSigning = prepareTemporarySigning(appleDevelopmentTeam, {
    useLightweightDeviceSigning,
  })
  const restoreOnExit = () => restoreSigning()
  process.once('exit', restoreOnExit)
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.once(signal, restoreOnExit)
  }
  let exitCode = 1
  let exitSignal = null
  let lastOutput = ''

  try {
    if (requestedPhysicalDevice) {
      const lockState = getLockState(requestedPhysicalDevice.udid)
      if (lockState?.locked) {
        log(`device ${requestedPhysicalDevice.name} is locked before launch; waiting for unlock`)
        const unlocked = await waitUntilUnlocked(requestedPhysicalDevice.udid)
        if (!unlocked) {
          console.error(
            `[tauri-ios-runner] failed to confirm unlock for device ${requestedPhysicalDevice.udid}`,
          )
          return {exitCode, exitSignal, output: lastOutput, appleDevelopmentTeam}
        }
      }
    }

    let runResult = await runTauri(appleDevelopmentTeam)
    lastOutput = runResult.output

    if (runResult.code !== 0 && isSwiftRsResolutionFailure(runResult.output) && warmSwiftRsCache()) {
      log('swift-rs cache warmed; retrying tauri iOS build once')
      runResult = await runTauri(appleDevelopmentTeam)
      lastOutput = runResult.output
    }

    if (runResult.signal) {
      if (hasActionableBuildFailure(runResult.output)) {
        exitCode = runResult.code ?? 1
      } else {
        exitSignal = runResult.signal
      }
      return {exitCode, exitSignal, output: lastOutput, appleDevelopmentTeam}
    }
    if (runResult.code === 0) {
      exitCode = 0
      return {exitCode, exitSignal, output: lastOutput, appleDevelopmentTeam}
    }

    if (!isLockedLaunchError(runResult.output)) {
      exitCode = runResult.code ?? 1
      return {exitCode, exitSignal, output: lastOutput, appleDevelopmentTeam}
    }

    const retryDeviceRef =
      extractDeviceRefFromOutput(runResult.output) ?? requestedPhysicalDevice?.udid ?? null

    if (!retryDeviceRef) {
      console.error('[tauri-ios-runner] launch failed because the device is locked; unlock and rerun')
      exitCode = runResult.code ?? 1
      return {exitCode, exitSignal, output: lastOutput, appleDevelopmentTeam}
    }

    log(`launch failed because device ${retryDeviceRef} is locked; waiting and retrying once`)
    const unlocked = await waitUntilUnlocked(retryDeviceRef)
    if (!unlocked) {
      console.error(`[tauri-ios-runner] failed to confirm unlock for device ${retryDeviceRef}`)
      exitCode = runResult.code ?? 1
      return {exitCode, exitSignal, output: lastOutput, appleDevelopmentTeam}
    }

    const retryRun = await runTauri(appleDevelopmentTeam)
    lastOutput = retryRun.output
    if (retryRun.signal) {
      if (hasActionableBuildFailure(retryRun.output)) {
        exitCode = retryRun.code ?? 1
      } else {
        exitSignal = retryRun.signal
      }
      return {exitCode, exitSignal, output: lastOutput, appleDevelopmentTeam}
    }
    exitCode = retryRun.code ?? 1
    return {exitCode, exitSignal, output: lastOutput, appleDevelopmentTeam}
  } finally {
    process.removeListener('exit', restoreOnExit)
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
      process.removeListener(signal, restoreOnExit)
    }
    restoreSigning()
  }
}

const {exitCode, exitSignal, output = '', appleDevelopmentTeam = null} = await main()
const failureSummary = summarizeBuildFailure(output, appleDevelopmentTeam?.teamID ?? null)
if (failureSummary.length > 0) {
  console.error('[tauri-ios-runner] iOS device build failed:')
  for (const line of failureSummary) {
    console.error(`[tauri-ios-runner] ${line}`)
  }
}

if (exitSignal) {
  process.kill(process.pid, exitSignal)
}

process.exit(exitCode)
