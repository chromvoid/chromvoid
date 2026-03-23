#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn, spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(scriptDir, '..')
const forwardedArgs = process.argv.slice(2)
const localTauriBinary = path.join(
  appRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tauri.cmd' : 'tauri',
)
const tauriBinary = fs.existsSync(localTauriBinary) ? localTauriBinary : 'tauri'

function log(message) {
  console.log(`[tauri-android-runner] ${message}`)
}

function detectLanHost() {
  const interfaces = os.networkInterfaces()
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue
    for (const entry of entries) {
      if (!entry || entry.internal || entry.family !== 'IPv4') {
        continue
      }
      return entry.address
    }
  }
  return null
}

function resolveAndroidHome() {
  const configured = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
  if (configured && fs.existsSync(configured)) {
    return configured
  }

  const fallback = path.join(os.homedir(), 'Library', 'Android', 'Sdk')
  if (fs.existsSync(fallback)) {
    return fallback
  }

  throw new Error('ANDROID_HOME is not set and Android SDK was not found under ~/Library/Android/Sdk')
}

function adbPath(androidHome) {
  return path.join(androidHome, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
}

function listConnectedDevices(adb, env) {
  const result = spawnSync(adb, ['devices'], {encoding: 'utf8', env})
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || 'adb devices failed')
  }

  return result.stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/))
    .filter((parts) => parts[1] === 'device')
    .map((parts) => parts[0])
}

function reverseDevServer(adb, serial, env) {
  const result = spawnSync(adb, ['-s', serial, 'reverse', 'tcp:4400', 'tcp:4400'], {
    encoding: 'utf8',
    env,
  })
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `adb reverse failed for ${serial}`)
  }
}

function waitForDevice(adb, serial, env) {
  const result = spawnSync(adb, ['-s', serial, 'wait-for-device'], {
    encoding: 'utf8',
    env,
  })
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `adb wait-for-device failed for ${serial}`)
  }
}

function runTauriDev(tauriBinary, tauriArgs, appRoot, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(tauriBinary, tauriArgs, {
      cwd: appRoot,
      env,
      stdio: 'inherit',
    })

    child.on('error', reject)
    child.on('exit', (code, signal) => {
      resolve({code, signal})
    })
  })
}

const androidHome = resolveAndroidHome()
const childEnv = {
  ...process.env,
  ANDROID_HOME: androidHome,
  ANDROID_SDK_ROOT: androidHome,
  TAURI_DEV_HOST: process.env.TAURI_DEV_HOST || '0.0.0.0',
}

const adb = adbPath(androidHome)
if (!fs.existsSync(adb)) {
  throw new Error(`adb not found at ${adb}`)
}

const devices = listConnectedDevices(adb, childEnv)
if (devices.length === 0) {
  log('no connected Android devices detected; continuing without adb reverse')
} else {
  for (const serial of devices) {
    log(`adb reverse tcp:4400 tcp:4400 for ${serial}`)
    reverseDevServer(adb, serial, childEnv)
  }
}

const hasExplicitHostArg =
  forwardedArgs.includes('--host')
  || forwardedArgs.some((arg) => arg.startsWith('--host='))
  || forwardedArgs.includes('--force-ip-prompt')
const lanHost = process.env.TAURI_ANDROID_DEV_HOST || detectLanHost()
const tauriArgs = ['android', 'dev', '--config', 'src-tauri/tauri.dev.conf.json']

if (!hasExplicitHostArg && lanHost) {
  log(`using --host ${lanHost}`)
  tauriArgs.push('--host', lanHost)
}

tauriArgs.push(...forwardedArgs)
const maxAttempts = 2
let lastExitCode = 1

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  const {code, signal} = await runTauriDev(tauriBinary, tauriArgs, appRoot, childEnv)

  if (signal) {
    process.kill(process.pid, signal)
    break
  }

  lastExitCode = code ?? 1
  if (lastExitCode === 0) {
    process.exit(0)
  }

  if (attempt === maxAttempts || devices.length === 0) {
    break
  }

  log(`tauri android dev exited with code ${lastExitCode}; waiting for device and retrying once`)
  for (const serial of devices) {
    log(`adb wait-for-device for ${serial}`)
    waitForDevice(adb, serial, childEnv)
    log(`adb reverse tcp:4400 tcp:4400 for ${serial}`)
    reverseDevServer(adb, serial, childEnv)
  }
}

process.exit(lastExitCode)
