#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn, spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(scriptDir, '..')
const forwardedArgs = process.argv.slice(2)
const androidPackageFormats = new Set(['--apk', '--aab'])
const requestedPackageFlags = [
  ...new Set(forwardedArgs.filter((arg) => androidPackageFormats.has(arg))),
]
const packageBuildFlags = requestedPackageFlags.length > 0 ? requestedPackageFlags : ['--apk']
const forwardedTauriArgs = forwardedArgs.filter((arg) => !androidPackageFormats.has(arg))
const buildApk = packageBuildFlags.includes('--apk')
const buildAab = packageBuildFlags.includes('--aab')
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
      `Missing ${licensePublicKeyEnv}. Run bun run preflight:android:release or write the base64/base64url Ed25519 public key to ${licensePublicKeyFile}.`,
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

function isReleaseAndroidOutput(filePath) {
  const lowerSegments = filePath.split(path.sep).map((segment) => segment.toLowerCase())
  const fileName = path.basename(filePath).toLowerCase()
  return (
    lowerSegments.includes('release') ||
    lowerSegments.some((segment) => segment.endsWith('release')) ||
    fileName.includes('-release')
  )
}

function collectReleasePackages(dir, extension) {
  if (!fs.existsSync(dir)) {
    return []
  }

  const entries = fs.readdirSync(dir, {withFileTypes: true})
  const packages = []
  for (const entry of entries) {
    const filePath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      packages.push(...collectReleasePackages(filePath, extension))
      continue
    }
    if (entry.isFile() && filePath.endsWith(extension) && isReleaseAndroidOutput(filePath)) {
      packages.push(filePath)
    }
  }
  return packages
}

function collectReleaseApks(dir) {
  return collectReleasePackages(dir, '.apk')
}

function collectReleaseAabs(dir) {
  return collectReleasePackages(dir, '.aab')
}

function collectAabNativeLibEntries(aabPath) {
  return unzip(aabPath, ['-Z1', aabPath])
    .toString('utf8')
    .split(/\r?\n/)
    .filter((entry) => /^base\/lib\/[^/]+\/[^/]+\.so$/.test(entry))
    .sort()
}

function unzip(packagePath, args) {
  const result = spawnSync('unzip', args, {
    cwd: appRoot,
    maxBuffer: 128 * 1024 * 1024,
  })
  if (result.status !== 0) {
    const detail =
      result.stderr?.toString().trim() ||
      result.stdout?.toString().trim() ||
      `unzip failed for ${packagePath}`
    fail(detail)
  }
  return result.stdout
}

function assertAndroidPackageEmbedsLicensePublicKey(packagePath, licensePublicKey) {
  const entries = unzip(packagePath, ['-Z1', packagePath])
    .toString('utf8')
    .split(/\r?\n/)
    .filter((entry) => entry.endsWith('libchromvoid_lib.so'))

  if (entries.length === 0) {
    fail(`No libchromvoid_lib.so found in ${packagePath}`)
  }

  const keyBytes = Buffer.from(licensePublicKey)
  for (const entry of entries) {
    const libBytes = unzip(packagePath, ['-p', packagePath, entry])
    if (!libBytes.includes(keyBytes)) {
      fail(`${packagePath} contains ${entry} built without ${licensePublicKeyEnv}`)
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
    assertAndroidPackageEmbedsLicensePublicKey(apk, licensePublicKey)
  }
  console.log(`[tauri-android-release] Verified ${apks.length} release APK(s) embed ${licensePublicKeyEnv}`)
}

function verifyReleaseAabs(licensePublicKey) {
  const outputsDir = path.join(appRoot, 'src-tauri', 'gen', 'android', 'app', 'build', 'outputs', 'bundle')
  const aabs = collectReleaseAabs(outputsDir)
  if (aabs.length === 0) {
    fail(`No release AAB found under ${outputsDir}`)
  }

  for (const aab of aabs) {
    assertAndroidPackageEmbedsLicensePublicKey(aab, licensePublicKey)
  }
  console.log(`[tauri-android-release] Verified ${aabs.length} release AAB(s) embed ${licensePublicKeyEnv}`)
  for (const aab of aabs) {
    console.log(`[tauri-android-release] AAB ready: ${path.relative(appRoot, aab)}`)
  }
  return aabs
}

function removeStaleReleaseApks() {
  const outputsDir = path.join(appRoot, 'src-tauri', 'gen', 'android', 'app', 'build', 'outputs', 'apk')
  for (const apk of collectReleaseApks(outputsDir)) {
    fs.rmSync(apk, {force: true})
  }
}

function removeStaleReleaseAabs() {
  const outputsDir = path.join(appRoot, 'src-tauri', 'gen', 'android', 'app', 'build', 'outputs', 'bundle')
  for (const aab of collectReleaseAabs(outputsDir)) {
    fs.rmSync(aab, {force: true})
  }
}

function releaseNativeDebugSymbolsZipPath() {
  return path.join(
    appRoot,
    'src-tauri',
    'gen',
    'android',
    'app',
    'build',
    'outputs',
    'native-debug-symbols',
    'universalRelease',
    'native-debug-symbols.zip',
  )
}

function removeStaleReleaseNativeDebugSymbols() {
  fs.rmSync(releaseNativeDebugSymbolsZipPath(), {force: true})
}

function resolveReadelf(ndkHome) {
  const candidates = [
    process.env.CHROMVOID_READELF,
    path.join(ndkHome, 'toolchains', 'llvm', 'prebuilt', ndkHostTag(), 'bin', executableName('llvm-readelf')),
    executableName('llvm-readelf'),
    executableName('readelf'),
  ].filter(Boolean)

  for (const candidate of candidates) {
    const hasPathSeparator = candidate.includes(path.sep)
    if (hasPathSeparator && !fs.existsSync(candidate)) {
      continue
    }
    const result = spawnSync(candidate, ['--version'], {
      encoding: 'utf8',
      stdio: 'ignore',
    })
    if (result.status === 0) {
      return candidate
    }
  }

  fail('Unable to find readelf/llvm-readelf for native debug symbols validation')
}

function nativeLibraryHasSymbolTable(readelfPath, filePath) {
  const result = spawnSync(readelfPath, ['-S', filePath], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim() || `${readelfPath} failed`
    fail(`Failed to inspect native library ${filePath}: ${detail}`)
  }
  return result.stdout.includes('.symtab')
}

function copyNativeDebugSymbolInputs(aabs, workDir, readelfPath) {
  const mergedNativeLibsDir = path.join(
    appRoot,
    'src-tauri',
    'gen',
    'android',
    'app',
    'build',
    'intermediates',
    'merged_native_libs',
    'universalRelease',
    'mergeUniversalReleaseNativeLibs',
    'out',
    'lib',
  )

  const copiedEntries = new Set()
  for (const aab of aabs) {
    for (const entry of collectAabNativeLibEntries(aab)) {
      const [, abi, fileName] = entry.match(/^base\/lib\/([^/]+)\/([^/]+\.so)$/) ?? []
      if (!abi || !fileName) {
        continue
      }

      const zipEntry = `${abi}/${fileName}`
      if (copiedEntries.has(zipEntry)) {
        continue
      }

      const source = path.join(mergedNativeLibsDir, abi, fileName)
      if (!fs.existsSync(source)) {
        fail(`Native debug symbol source not found for ${entry}: ${source}`)
      }

      if (!nativeLibraryHasSymbolTable(readelfPath, source)) {
        console.log(`[tauri-android-release] Skipping stripped native library in symbols zip: ${zipEntry}`)
        continue
      }

      const destination = path.join(workDir, zipEntry)
      fs.mkdirSync(path.dirname(destination), {recursive: true})
      fs.copyFileSync(source, destination)
      copiedEntries.add(zipEntry)
    }
  }

  if (copiedEntries.size === 0) {
    fail('No native libraries with symbol tables found in release AAB; cannot create native debug symbols zip')
  }

  return [...copiedEntries].sort()
}

function createReleaseNativeDebugSymbolsZip(aabs, readelfPath) {
  const zipPath = releaseNativeDebugSymbolsZipPath()
  const outputDir = path.dirname(zipPath)
  const workDir = path.join(outputDir, 'native-debug-symbols-work')
  fs.rmSync(workDir, {recursive: true, force: true})
  fs.mkdirSync(outputDir, {recursive: true})

  try {
    const entries = copyNativeDebugSymbolInputs(aabs, workDir, readelfPath)
    fs.rmSync(zipPath, {force: true})
    const result = spawnSync('zip', ['-qr', zipPath, '.'], {
      cwd: workDir,
      encoding: 'utf8',
    })
    if (result.error) {
      throw result.error
    }
    if (result.status !== 0) {
      const detail = result.stderr?.trim() || result.stdout?.trim() || 'zip failed'
      fail(`Failed to create native debug symbols zip: ${detail}`)
    }

    const zipEntries = unzip(zipPath, ['-Z1', zipPath])
      .toString('utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .sort()
    for (const entry of entries) {
      if (!zipEntries.includes(entry)) {
        fail(`Native debug symbols zip is missing ${entry}`)
      }
    }
    console.log(`[tauri-android-release] Native debug symbols ready: ${path.relative(appRoot, zipPath)}`)
  } finally {
    fs.rmSync(workDir, {recursive: true, force: true})
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
const readelfPath = resolveReadelf(ndkHome)
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
console.log(`[tauri-android-release] using readelf: ${readelfPath}`)
childEnv.PATH = [
  javaHome && path.join(javaHome, 'bin'),
  rustBin,
  childEnv.PATH,
].filter(Boolean).join(path.delimiter)

const args = [
  'android',
  'build',
  ...packageBuildFlags,
  '--target',
  'aarch64',
  '--features',
  'android',
  '--ci',
  ...forwardedTauriArgs,
]
if (buildApk) {
  removeStaleReleaseApks()
}
if (buildAab) {
  removeStaleReleaseAabs()
  removeStaleReleaseNativeDebugSymbols()
}
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

  if (buildApk) {
    verifyReleaseApks(licensePublicKey)
  }
  if (buildAab) {
    const aabs = verifyReleaseAabs(licensePublicKey)
    createReleaseNativeDebugSymbolsZip(aabs, readelfPath)
  }
  process.exit(0)
})
