#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(scriptDir, '..')
const forwardedArgs = process.argv.slice(2)
const defaultIpaPath = path.join(appRoot, 'src-tauri', 'gen', 'apple', 'build', 'arm64', 'ChromVoid.ipa')
const tauriConfigPath = path.join(appRoot, 'src-tauri', 'tauri.conf.json')
let launchAfterInstall = false
let requestedDevice = ''
let ipaPath = defaultIpaPath

function fail(message) {
  console.error(`[ios-release-install] ${message}`)
  process.exit(1)
}

function printUsage() {
  console.log(`Usage: node ./scripts/install-ios-release-ipa.mjs [--launch] [--device DEVICE] [--ipa PATH]

Options:
  --launch         Launch the release app after install.
  --device DEVICE  Install to a specific iOS device by UDID, serial number, or name.
  --ipa PATH       Install a specific IPA. Defaults to ${defaultIpaPath}.

Environment:
  IOS_DEVICE       Same as --device.
`)
}

function readValueArg(args, index, name) {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    fail(`Missing value for ${name}`)
  }
  return value
}

for (let index = 0; index < forwardedArgs.length; index += 1) {
  const arg = forwardedArgs[index]
  if (arg === '--help' || arg === '-h') {
    printUsage()
    process.exit(0)
  }
  if (arg === '--launch') {
    launchAfterInstall = true
    continue
  }
  if (arg === '--device') {
    requestedDevice = readValueArg(forwardedArgs, index, arg)
    index += 1
    continue
  }
  if (arg.startsWith('--device=')) {
    requestedDevice = arg.slice('--device='.length)
    continue
  }
  if (arg === '--ipa') {
    ipaPath = path.resolve(appRoot, readValueArg(forwardedArgs, index, arg))
    index += 1
    continue
  }
  if (arg.startsWith('--ipa=')) {
    ipaPath = path.resolve(appRoot, arg.slice('--ipa='.length))
    continue
  }

  fail(`Unknown argument: ${arg}`)
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

function resolveDevice() {
  const explicitDevice = requestedDevice || process.env.IOS_DEVICE?.trim()
  if (explicitDevice) {
    return explicitDevice
  }

  const devices = listPhysicalIOSDevices()
  if (devices.length === 1) {
    const [device] = devices
    console.log(`[ios-release-install] using iOS device ${device.name} (${device.udid})`)
    return device.udid
  }
  if (devices.length > 1) {
    const labels = devices.map((device) => `${device.name} (${device.udid})`).join(', ')
    fail(`Multiple paired physical iOS devices found: ${labels}. Set IOS_DEVICE or pass --device.`)
  }

  fail('No paired physical iOS device found. Connect and trust an iPhone, or pass --device.')
}

function resolveBundleIdentifier() {
  try {
    const config = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf8'))
    return config.identifier || 'com.chromvoid.app'
  } catch {
    return 'com.chromvoid.app'
  }
}

function extractAppBundle(sourceIpaPath) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromvoid-ios-release-'))
  const result = spawnSync('unzip', ['-q', sourceIpaPath, '-d', tempDir], {stdio: 'inherit'})
  if (result.error) {
    fs.rmSync(tempDir, {recursive: true, force: true})
    fail(result.error.message)
  }
  if (result.status !== 0) {
    fs.rmSync(tempDir, {recursive: true, force: true})
    process.exit(result.status ?? 1)
  }

  const payloadDir = path.join(tempDir, 'Payload')
  const appName = fs
    .readdirSync(payloadDir, {withFileTypes: true})
    .find((entry) => entry.isDirectory() && entry.name.endsWith('.app'))?.name
  if (!appName) {
    fs.rmSync(tempDir, {recursive: true, force: true})
    fail(`No Payload/*.app bundle found in ${sourceIpaPath}`)
  }

  return {
    appPath: path.join(payloadDir, appName),
    cleanup: () => fs.rmSync(tempDir, {recursive: true, force: true}),
  }
}

if (!fs.existsSync(ipaPath)) {
  fail(`Release IPA not found: ${ipaPath}`)
}

const device = resolveDevice()
const bundleIdentifier = resolveBundleIdentifier()
const {appPath, cleanup} = extractAppBundle(ipaPath)

try {
  const installResult = spawnSync(
    'xcrun',
    ['devicectl', 'device', 'install', 'app', '--device', device, appPath],
    {stdio: 'inherit'},
  )
  if (installResult.error) {
    fail(installResult.error.message)
  }

  const installStatus = installResult.status ?? 1
  if (installStatus !== 0 || !launchAfterInstall) {
    process.exit(installStatus)
  }

  const launchResult = spawnSync(
    'xcrun',
    ['devicectl', 'device', 'process', 'launch', '--terminate-existing', '--device', device, bundleIdentifier],
    {stdio: 'inherit'},
  )
  if (launchResult.error) {
    fail(`Installed release IPA, but failed to launch ${bundleIdentifier}: ${launchResult.error.message}`)
  }

  process.exit(launchResult.status ?? 1)
} finally {
  cleanup()
}
