#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(scriptDir, '..')
const targetFile = path.join(appRoot, '.android-adb-wifi-target.json')

function printUsage() {
  console.log(`Usage:
  node ./scripts/android-adb-wifi-target.mjs pair HOST:PAIR_PORT PAIR_CODE [HOST:ADB_PORT]
  node ./scripts/android-adb-wifi-target.mjs connect HOST:ADB_PORT
  node ./scripts/android-adb-wifi-target.mjs status
  node ./scripts/android-adb-wifi-target.mjs clear

Examples:
  npm run android:adb-wifi -- pair 192.168.1.42:37123 123456 192.168.1.42:41317
  npm run android:adb-wifi -- connect 192.168.1.42:41317
  npm run android:deploy:release:apk:wifi
`)
}

function fail(message) {
  console.error(`[android-adb-wifi] ${message}`)
  process.exit(1)
}

function resolveAdb() {
  const candidates = [
    process.env.ADB,
    process.env.ANDROID_HOME && path.join(process.env.ANDROID_HOME, 'platform-tools', 'adb'),
    process.env.ANDROID_SDK_ROOT && path.join(process.env.ANDROID_SDK_ROOT, 'platform-tools', 'adb'),
    path.join(os.homedir(), 'Library', 'Android', 'Sdk', 'platform-tools', 'adb'),
    path.join(os.homedir(), 'Library', 'Android', 'sdk', 'platform-tools', 'adb'),
    path.join(os.homedir(), 'Android', 'Sdk', 'platform-tools', 'adb'),
    path.join(os.homedir(), 'Android', 'sdk', 'platform-tools', 'adb'),
  ].filter(Boolean)

  return candidates.find((candidate) => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK)
      return true
    } catch {
      return false
    }
  }) ?? 'adb'
}

function runAdb(adb, args, options = {}) {
  const result = spawnSync(adb, args, {
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
  })
  const output = [result.stdout?.trim(), result.stderr?.trim()].filter(Boolean).join('\n')
  if (result.error) {
    fail(result.error.message)
  }
  if (result.status !== 0 || (options.failOnText && options.failOnText.test(output))) {
    fail(output || `adb ${args.join(' ')} failed`)
  }
  return output
}

function saveTarget(serial) {
  fs.writeFileSync(
    targetFile,
    `${JSON.stringify({serial, updatedAt: new Date().toISOString()}, null, 2)}\n`,
    {mode: 0o600},
  )
  console.log(`[android-adb-wifi] saved target ${serial}`)
}

function readTarget() {
  if (!fs.existsSync(targetFile)) {
    return ''
  }

  const saved = JSON.parse(fs.readFileSync(targetFile, 'utf8'))
  return typeof saved.serial === 'string' ? saved.serial.trim() : ''
}

function requireHostPort(value, label) {
  if (!/^[^:\s]+:\d+$/.test(value || '')) {
    fail(`${label} must look like HOST:PORT`)
  }
  return value
}

const [command, first, second, third] = process.argv.slice(2)
if (!command || command === '--help' || command === '-h') {
  printUsage()
  process.exit(command ? 0 : 1)
}

const adb = resolveAdb()

switch (command) {
  case 'pair': {
    const pairTarget = requireHostPort(first, 'Pair target')
    const pairCode = second?.trim()
    if (!pairCode) {
      fail('Pair code is required')
    }

    const pairOutput = runAdb(adb, ['pair', pairTarget, pairCode], {
      failOnText: /\bfailed\b/i,
    })
    if (pairOutput) {
      console.log(pairOutput)
    }

    if (third) {
      const serial = requireHostPort(third, 'Connect target')
      const connectOutput = runAdb(adb, ['connect', serial], {
        failOnText: /\bfailed\b/i,
      })
      if (connectOutput) {
        console.log(connectOutput)
      }
      saveTarget(serial)
    }
    break
  }

  case 'connect': {
    const serial = requireHostPort(first, 'Connect target')
    const output = runAdb(adb, ['connect', serial], {
      failOnText: /\bfailed\b/i,
    })
    if (output) {
      console.log(output)
    }
    saveTarget(serial)
    break
  }

  case 'status': {
    const serial = readTarget()
    console.log(`[android-adb-wifi] saved target: ${serial || 'none'}`)
    runAdb(adb, ['devices', '-l'], {stdio: 'inherit'})
    break
  }

  case 'clear':
    fs.rmSync(targetFile, {force: true})
    console.log('[android-adb-wifi] cleared saved target')
    break

  default:
    fail(`Unknown command: ${command}`)
}
