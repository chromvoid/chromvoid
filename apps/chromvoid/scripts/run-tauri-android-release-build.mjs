#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn, spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(scriptDir, '..')
const forwardedArgs = process.argv.slice(2)
const licensePublicKeyEnv = 'CHROMVOID_LICENSE_PUBLIC_KEY_ED25519_2026_01'
const licensePublicKeyFile = path.join(appRoot, 'src-tauri', 'gen', 'android', '.license-public-key')
const localTauriBinary = path.join(
  appRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tauri.cmd' : 'tauri',
)
const tauriBinary = fs.existsSync(localTauriBinary) ? localTauriBinary : 'tauri'

function fail(message) {
  console.error(`[tauri-android-release] ${message}`)
  process.exit(1)
}

function resolveAndroidHome() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(os.homedir(), 'Library', 'Android', 'Sdk'),
    path.join(os.homedir(), 'Library', 'Android', 'sdk'),
    path.join(os.homedir(), 'Android', 'Sdk'),
    path.join(os.homedir(), 'Android', 'sdk'),
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error('ANDROID_HOME is not set and Android SDK was not found under ~/Library/Android/Sdk or ~/Android/Sdk')
}

function resolveGradleJavaHome() {
  const candidates = [
    process.env.JAVA_HOME,
    '/usr/lib/jvm/java-17-openjdk-amd64',
    '/usr/lib/jvm/java-21-openjdk-amd64',
    '/opt/homebrew/opt/openjdk@17',
    '/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home',
    '/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home',
  ].filter(Boolean)

  for (const candidate of candidates) {
    const java = path.join(candidate, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
    if (fs.existsSync(java)) {
      return candidate
    }
  }

  return null
}

function resolveRustBinDir() {
  const cargoBin = path.join(os.homedir(), '.cargo', 'bin')
  const cargo = path.join(cargoBin, process.platform === 'win32' ? 'cargo.exe' : 'cargo')
  return fs.existsSync(cargo) ? cargoBin : null
}

function resolveNdkHome(androidHome) {
  const configured = process.env.NDK_HOME || process.env.ANDROID_NDK_HOME || process.env.ANDROID_NDK_ROOT
  if (configured && fs.existsSync(configured)) {
    return configured
  }

  const ndkRoot = path.join(androidHome, 'ndk')
  const candidates = fs
    .readdirSync(ndkRoot, {withFileTypes: true})
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(ndkRoot, entry.name))
    .sort()
    .reverse()
  const ndkHome = candidates[0]
  if (ndkHome) {
    return ndkHome
  }

  throw new Error(`Android NDK not found under ${ndkRoot}`)
}

function decodeBase64OrBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
  return Buffer.from(padded, 'base64')
}

function resolveLicensePublicKey() {
  const envValue = process.env[licensePublicKeyEnv]?.trim()
  const fileValue = fs.existsSync(licensePublicKeyFile) ? fs.readFileSync(licensePublicKeyFile, 'utf8').trim() : ''
  const value = envValue || fileValue
  if (!value) {
    fail(
      `Missing ${licensePublicKeyEnv}. Run npm run preflight:android:release or write the base64/base64url Ed25519 public key to ${licensePublicKeyFile}.`,
    )
  }

  const bytes = decodeBase64OrBase64Url(value)
  if (bytes.length !== 32) {
    fail(`${licensePublicKeyEnv} must decode to a 32-byte Ed25519 public key, got ${bytes.length} bytes.`)
  }

  if (!envValue && fileValue) {
    console.log(`[tauri-android-release] Using license public key from ${licensePublicKeyFile}`)
  }

  return value
}

function collectReleaseApks(dir) {
  if (!fs.existsSync(dir)) {
    return []
  }

  const entries = fs.readdirSync(dir, {withFileTypes: true})
  const apks = []
  for (const entry of entries) {
    const filePath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      apks.push(...collectReleaseApks(filePath))
      continue
    }
    if (entry.isFile() && filePath.endsWith('.apk') && filePath.includes(`${path.sep}release${path.sep}`)) {
      apks.push(filePath)
    }
  }
  return apks
}

function unzip(apkPath, args) {
  const result = spawnSync('unzip', args, {
    cwd: appRoot,
    maxBuffer: 128 * 1024 * 1024,
  })
  if (result.status !== 0) {
    const detail = result.stderr?.toString().trim() || result.stdout?.toString().trim() || `unzip failed for ${apkPath}`
    fail(detail)
  }
  return result.stdout
}

function assertApkEmbedsLicensePublicKey(apkPath, licensePublicKey) {
  const entries = unzip(apkPath, ['-Z1', apkPath])
    .toString('utf8')
    .split(/\r?\n/)
    .filter((entry) => entry.endsWith('libchromvoid_lib.so'))

  if (entries.length === 0) {
    fail(`No libchromvoid_lib.so found in ${apkPath}`)
  }

  const keyBytes = Buffer.from(licensePublicKey)
  for (const entry of entries) {
    const libBytes = unzip(apkPath, ['-p', apkPath, entry])
    if (!libBytes.includes(keyBytes)) {
      fail(`${apkPath} contains ${entry} built without ${licensePublicKeyEnv}`)
    }
  }
}

function verifyReleaseApks(licensePublicKey) {
  const outputsDir = path.join(appRoot, 'src-tauri', 'gen', 'android', 'app', 'build', 'outputs', 'apk')
  const apks = collectReleaseApks(outputsDir)
  if (apks.length === 0) {
    fail(`No release APK found under ${outputsDir}`)
  }

  for (const apk of apks) {
    assertApkEmbedsLicensePublicKey(apk, licensePublicKey)
  }
  console.log(`[tauri-android-release] Verified ${apks.length} release APK(s) embed ${licensePublicKeyEnv}`)
}

function removeStaleReleaseApks() {
  const outputsDir = path.join(appRoot, 'src-tauri', 'gen', 'android', 'app', 'build', 'outputs', 'apk')
  for (const apk of collectReleaseApks(outputsDir)) {
    fs.rmSync(apk, {force: true})
  }
}

function executableName(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name
}

function ndkHostTag() {
  switch (process.platform) {
    case 'darwin':
      return 'darwin-x86_64'
    case 'linux':
      return 'linux-x86_64'
    case 'win32':
      return 'windows-x86_64'
    default:
      throw new Error(`Unsupported Android NDK host OS: ${process.platform}`)
  }
}

function androidToolchainEnv(ndkHome) {
  const toolchainBin = path.join(ndkHome, 'toolchains', 'llvm', 'prebuilt', ndkHostTag(), 'bin')
  const linker = path.join(toolchainBin, executableName('aarch64-linux-android28-clang'))
  const ar = path.join(toolchainBin, executableName('llvm-ar'))
  if (!fs.existsSync(linker)) {
    throw new Error(`Android linker not found at ${linker}`)
  }
  if (!fs.existsSync(ar)) {
    throw new Error(`Android llvm-ar not found at ${ar}`)
  }

  return {
    CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER: linker,
    CARGO_TARGET_AARCH64_LINUX_ANDROID_AR: ar,
    CC_aarch64_linux_android: linker,
    AR_aarch64_linux_android: ar,
  }
}

const androidHome = resolveAndroidHome()
const ndkHome = resolveNdkHome(androidHome)
const licensePublicKey = resolveLicensePublicKey()
const javaHome = resolveGradleJavaHome()
const rustBin = resolveRustBinDir()
const childEnv = {
  ...process.env,
  ANDROID_HOME: androidHome,
  ANDROID_SDK_ROOT: androidHome,
  NDK_HOME: ndkHome,
  RUSTFLAGS:
    process.env.RUSTFLAGS || '-Clink-arg=-landroid -Clink-arg=-llog -Clink-arg=-lOpenSLES',
  ORG_GRADLE_PROJECT_abiList: process.env.ORG_GRADLE_PROJECT_abiList || 'arm64-v8a',
  ORG_GRADLE_PROJECT_archList: process.env.ORG_GRADLE_PROJECT_archList || 'arm64',
  ORG_GRADLE_PROJECT_targetList: process.env.ORG_GRADLE_PROJECT_targetList || 'aarch64',
  ORG_GRADLE_PROJECT_chromvoidSkipFreshTauriPrebuild: 'true',
  [licensePublicKeyEnv]: licensePublicKey,
  ...androidToolchainEnv(ndkHome),
}
if (javaHome) {
  childEnv.JAVA_HOME = javaHome
  console.log(`[tauri-android-release] using Gradle JAVA_HOME: ${javaHome}`)
}
if (rustBin) {
  console.log(`[tauri-android-release] using Rust toolchain bin: ${rustBin}`)
}
childEnv.PATH = [
  javaHome && path.join(javaHome, 'bin'),
  rustBin,
  childEnv.PATH,
].filter(Boolean).join(path.delimiter)

const args = [
  'android',
  'build',
  '--apk',
  '--target',
  'aarch64',
  '--features',
  'android',
  '--ci',
  ...forwardedArgs,
]
removeStaleReleaseApks()
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

  verifyReleaseApks(licensePublicKey)
  process.exit(0)
})
