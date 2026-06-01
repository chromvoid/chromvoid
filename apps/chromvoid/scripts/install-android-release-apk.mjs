#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(scriptDir, '..')
const defaultAdbTunnelPort = '15037'
const releaseLaunchActivity = 'com.chromvoid.app/.MainActivity'
const forwardedArgs = process.argv.slice(2)
const adbWifiTargetFile = path.join(appRoot, '.android-adb-wifi-target.json')
let launchAfterInstall = false
let useAdbWifi = false
let requestedAdbSerial = ''
let requestedAdbConnect = ''
const apkPath = path.join(
  appRoot,
  'src-tauri',
  'gen',
  'android',
  'app',
  'build',
  'outputs',
  'apk',
  'universal',
  'release',
  'app-universal-release.apk',
)

function isEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase())
}

function readNonNegativeIntegerEnv(env, name, fallback) {
  const raw = env[name]
  if (raw === undefined || raw === '') {
    return fallback
  }

  if (!/^\d+$/.test(raw)) {
    console.error(`${name} must be a non-negative integer, got: ${raw}`)
    process.exit(1)
  }
  return Number.parseInt(raw, 10)
}

function waitForAdbTarget(adbPath, env, timeoutMs) {
  if (timeoutMs === 0) {
    return
  }

  const expectedSerial = env.ADB_SERIAL?.trim()
  const targetLabel = expectedSerial ? `ADB target ${expectedSerial}` : 'an ADB device'
  const waitArgs = expectedSerial ? ['-s', expectedSerial, 'wait-for-device'] : ['wait-for-device']
  console.log(`[android-release-install] waiting up to ${timeoutMs}ms for ${targetLabel} before install`)

  const result = spawnSync(adbPath, waitArgs, {
    env,
    encoding: 'utf8',
    timeout: timeoutMs,
  })
  const output = [result.stdout?.trim(), result.stderr?.trim()].filter(Boolean).join('\n')

  if (result.error) {
    if (result.error.code === 'ETIMEDOUT') {
      console.error(`[android-release-install] ${targetLabel} was not available before install.`)
      if (output) {
        console.error(output)
      }
      process.exit(1)
    }

    const hint =
      adbPath === 'adb'
        ? 'Set ADB, ANDROID_HOME, or ANDROID_SDK_ROOT so the Android SDK platform-tools can be found.'
        : `Failed to run adb at ${adbPath}.`
    console.error(hint)
    console.error(result.error.message)
    process.exit(1)
  }

  if (result.status !== 0) {
    console.error(output || `adb ${waitArgs.join(' ')} failed.`)
    process.exit(result.status ?? 1)
  }
}

function printUsage() {
  console.log(`Usage: node ./scripts/install-android-release-apk.mjs [--launch] [--adb-serial SERIAL] [--adb-connect SERIAL] [--use-wifi]

Options:
  --launch              Launch the release app after install.
  --adb-serial SERIAL   Install to a specific adb target, for example 192.168.1.42:41317.
  --adb-connect SERIAL  Run "adb connect SERIAL" before installing, then use that target.
  --use-wifi            Use CHROMVOID_ADB_WIFI_SERIAL or .android-adb-wifi-target.json.

Environment:
  ADB_SERIAL                    Existing adb target override.
  CHROMVOID_USE_ADB_WIFI=1      Same as --use-wifi.
  CHROMVOID_ADB_WIFI_SERIAL     WiFi adb target used by --use-wifi.
`)
}

function readValueArg(args, index, name) {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    console.error(`Missing value for ${name}`)
    process.exit(1)
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
  if (arg === '--use-wifi') {
    useAdbWifi = true
    continue
  }
  if (arg === '--adb-serial') {
    requestedAdbSerial = readValueArg(forwardedArgs, index, arg)
    index += 1
    continue
  }
  if (arg.startsWith('--adb-serial=')) {
    requestedAdbSerial = arg.slice('--adb-serial='.length)
    continue
  }
  if (arg === '--adb-connect') {
    requestedAdbConnect = readValueArg(forwardedArgs, index, arg)
    index += 1
    continue
  }
  if (arg.startsWith('--adb-connect=')) {
    requestedAdbConnect = arg.slice('--adb-connect='.length)
    continue
  }

  console.error(`Unknown argument: ${arg}`)
  printUsage()
  process.exit(1)
}

function readSavedWifiSerial() {
  if (!fs.existsSync(adbWifiTargetFile)) {
    return ''
  }

  try {
    const saved = JSON.parse(fs.readFileSync(adbWifiTargetFile, 'utf8'))
    return typeof saved.serial === 'string' ? saved.serial.trim() : ''
  } catch (error) {
    console.error(`Failed to read ${adbWifiTargetFile}: ${error.message}`)
    process.exit(1)
  }
}

const childEnv = {...process.env}
const useAdbTunnel = isEnabled(childEnv.CHROMVOID_USE_ADB_TUNNEL)
if (useAdbTunnel) {
  if (!childEnv.ADB_SERVER_SOCKET) {
    const port = childEnv.CHROMVOID_ADB_TUNNEL_PORT || defaultAdbTunnelPort
    childEnv.ADB_SERVER_SOCKET = `tcp:127.0.0.1:${port}`
  }
  console.log(`[android-release-install] remote ADB tunnel mode enabled via ${childEnv.ADB_SERVER_SOCKET}`)
}

if (!fs.existsSync(apkPath)) {
  console.error(`Release APK not found: ${apkPath}`)
  process.exit(1)
}

const adbCandidates = [
  childEnv.ADB,
  childEnv.ANDROID_HOME && path.join(childEnv.ANDROID_HOME, 'platform-tools', 'adb'),
  childEnv.ANDROID_SDK_ROOT && path.join(childEnv.ANDROID_SDK_ROOT, 'platform-tools', 'adb'),
  path.join(os.homedir(), 'Library', 'Android', 'Sdk', 'platform-tools', 'adb'),
  path.join(os.homedir(), 'Library', 'Android', 'sdk', 'platform-tools', 'adb'),
  path.join(os.homedir(), 'Android', 'Sdk', 'platform-tools', 'adb'),
  path.join(os.homedir(), 'Android', 'sdk', 'platform-tools', 'adb'),
].filter(Boolean)

const adbPath = adbCandidates.find((candidate) => {
  try {
    fs.accessSync(candidate, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}) ?? 'adb'

if (requestedAdbSerial) {
  childEnv.ADB_SERIAL = requestedAdbSerial
}

if (requestedAdbConnect) {
  useAdbWifi = true
  childEnv.ADB_SERIAL = requestedAdbConnect
}

if (isEnabled(childEnv.CHROMVOID_USE_ADB_WIFI)) {
  useAdbWifi = true
}

if (useAdbWifi) {
  const wifiSerial =
    childEnv.ADB_SERIAL?.trim()
    || childEnv.CHROMVOID_ADB_WIFI_SERIAL?.trim()
    || childEnv.CHROMVOID_ADB_WIFI_TARGET?.trim()
    || readSavedWifiSerial()

  if (!wifiSerial) {
    console.error(
      `WiFi ADB target is not configured. Run "npm run android:adb-wifi -- connect HOST:PORT" or set CHROMVOID_ADB_WIFI_SERIAL.`,
    )
    process.exit(1)
  }

  const connectResult = spawnSync(adbPath, ['connect', wifiSerial], {
    env: childEnv,
    encoding: 'utf8',
  })
  const connectOutput = [connectResult.stdout?.trim(), connectResult.stderr?.trim()].filter(Boolean).join('\n')
  if (connectResult.error) {
    console.error(`Failed to run adb connect ${wifiSerial}.`)
    console.error(connectResult.error.message)
    process.exit(1)
  }
  if (connectResult.status !== 0 || /\bfailed\b/i.test(connectOutput)) {
    console.error(connectOutput || `adb connect ${wifiSerial} failed.`)
    process.exit(connectResult.status ?? 1)
  }

  if (connectOutput) {
    console.log(`[android-release-install] ${connectOutput}`)
  }
  childEnv.ADB_SERIAL = wifiSerial
}

const adbDeviceWaitMs = readNonNegativeIntegerEnv(childEnv, 'CHROMVOID_ADB_DEVICE_WAIT_MS', useAdbTunnel ? 30_000 : 0)
waitForAdbTarget(adbPath, childEnv, adbDeviceWaitMs)

const args = []
if (childEnv.ADB_SERIAL) {
  args.push('-s', childEnv.ADB_SERIAL)
}
args.push('install', '-r', apkPath)

const result = spawnSync(adbPath, args, {env: childEnv, stdio: 'inherit'})
if (result.error) {
  const hint =
    adbPath === 'adb'
      ? 'Set ADB, ANDROID_HOME, or ANDROID_SDK_ROOT so the Android SDK platform-tools can be found.'
      : `Failed to run adb at ${adbPath}.`
  console.error(hint)
  console.error(result.error.message)
  process.exit(1)
}

const installStatus = result.status ?? 1
if (installStatus !== 0 || !launchAfterInstall) {
  process.exit(installStatus)
}

const launchArgs = []
if (childEnv.ADB_SERIAL) {
  launchArgs.push('-s', childEnv.ADB_SERIAL)
}
launchArgs.push('shell', 'am', 'start', '-n', releaseLaunchActivity)

const launchResult = spawnSync(adbPath, launchArgs, {env: childEnv, stdio: 'inherit'})
if (launchResult.error) {
  console.error(`Installed release APK, but failed to launch ${releaseLaunchActivity}.`)
  console.error(launchResult.error.message)
  process.exit(1)
}

process.exit(launchResult.status ?? 1)
