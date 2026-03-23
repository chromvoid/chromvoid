#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(scriptDir, '..')
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

if (!fs.existsSync(apkPath)) {
  console.error(`Release APK not found: ${apkPath}`)
  process.exit(1)
}

const adbCandidates = [
  process.env.ADB,
  process.env.ANDROID_HOME && path.join(process.env.ANDROID_HOME, 'platform-tools', 'adb'),
  process.env.ANDROID_SDK_ROOT && path.join(process.env.ANDROID_SDK_ROOT, 'platform-tools', 'adb'),
  path.join(os.homedir(), 'Library', 'Android', 'sdk', 'platform-tools', 'adb'),
].filter(Boolean)

const adbPath = adbCandidates.find((candidate) => {
  try {
    fs.accessSync(candidate, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}) ?? 'adb'

const args = []
if (process.env.ADB_SERIAL) {
  args.push('-s', process.env.ADB_SERIAL)
}
args.push('install', '-r', apkPath)

const result = spawnSync(adbPath, args, {stdio: 'inherit'})
if (result.error) {
  const hint =
    adbPath === 'adb'
      ? 'Set ADB, ANDROID_HOME, or ANDROID_SDK_ROOT so the Android SDK platform-tools can be found.'
      : `Failed to run adb at ${adbPath}.`
  console.error(hint)
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)
