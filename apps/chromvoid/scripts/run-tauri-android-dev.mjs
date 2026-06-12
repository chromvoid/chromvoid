#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn, spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(appRoot, '..', '..')
const webviewDistRoot = path.join(repoRoot, 'apps', 'webview', 'dist')
const androidProjectRoot = path.join(appRoot, 'src-tauri', 'gen', 'android')
const generatedAndroidTauriConfigPath = path.join(
  androidProjectRoot,
  'app',
  'src',
  'main',
  'assets',
  'tauri.conf.json',
)
const generatedAndroidAssetsRoot = path.dirname(generatedAndroidTauriConfigPath)
const devTauriConfigPath = path.join(appRoot, 'src-tauri', 'tauri.dev.conf.json')
const forwardedArgs = process.argv.slice(2)
const devServerPort = 4400
const defaultAdbTunnelPort = '15037'
const releaseLaunchIntent = 'Starting: Intent { cmp=com.chromvoid.app/.MainActivity }'
const debugPackageName = 'com.chromvoid.app.dev'
const licensePublicKeyEnv = 'CHROMVOID_LICENSE_PUBLIC_KEY_ED25519_2026_01'
const licensePublicKeyFile = path.join(appRoot, 'src-tauri', 'gen', 'android', '.license-public-key')
const androidAbiTargets = new Map([
  ['arm64-v8a', {abi: 'arm64-v8a', arch: 'arm64', target: 'aarch64', rustTarget: 'aarch64-linux-android'}],
  ['armeabi-v7a', {abi: 'armeabi-v7a', arch: 'arm', target: 'armv7', rustTarget: 'armv7-linux-androideabi'}],
  ['x86', {abi: 'x86', arch: 'x86', target: 'i686', rustTarget: 'i686-linux-android'}],
  ['x86_64', {abi: 'x86_64', arch: 'x86_64', target: 'x86_64', rustTarget: 'x86_64-linux-android'}],
])
const gradleFlavorSegments = new Map([
  ['arm64', 'Arm64'],
  ['arm', 'Arm'],
  ['x86', 'X86'],
  ['x86_64', 'X86_64'],
])
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

function isEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase())
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function mergeConfigOverlay(target, overlay) {
  for (const [key, value] of Object.entries(overlay)) {
    if (isPlainObject(value) && isPlainObject(target[key])) {
      mergeConfigOverlay(target[key], value)
      continue
    }
    target[key] = value
  }
  return target
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`failed to read JSON from ${filePath}: ${error.message}`)
  }
}

function applyGeneratedAndroidDevConfig() {
  if (!fs.existsSync(generatedAndroidTauriConfigPath)) {
    throw new Error(
      `generated Android Tauri config not found at ${generatedAndroidTauriConfigPath}; run bun run android:init first`,
    )
  }
  if (!fs.existsSync(devTauriConfigPath)) {
    throw new Error(`dev Tauri config not found at ${devTauriConfigPath}`)
  }

  const generatedConfig = readJsonFile(generatedAndroidTauriConfigPath)
  const devConfig = readJsonFile(devTauriConfigPath)
  const nextConfig = mergeConfigOverlay(generatedConfig, devConfig)
  nextConfig.build ??= {}
  nextConfig.build.devUrl = null
  nextConfig.build.frontendDist = '../../webview/dist'

  const current = fs.readFileSync(generatedAndroidTauriConfigPath, 'utf8')
  const next = `${JSON.stringify(nextConfig, null, 2)}\n`
  if (current === next) {
    log('generated Android Tauri config already uses dev overlay')
    return
  }

  fs.writeFileSync(generatedAndroidTauriConfigPath, next)
  log('applied dev Tauri config overlay to generated Android assets')
}

function applyRemoteAdbTunnelEnv(env) {
  if (!isEnabled(env.CHROMVOID_USE_ADB_TUNNEL)) {
    return
  }

  if (!env.ADB_SERVER_SOCKET) {
    const port = env.CHROMVOID_ADB_TUNNEL_PORT || defaultAdbTunnelPort
    env.ADB_SERVER_SOCKET = `tcp:127.0.0.1:${port}`
  }

  log(`remote ADB tunnel mode enabled via ${env.ADB_SERVER_SOCKET}`)
  log('ensure bun run android:adb-bridge is running on the Mac with the USB device attached')
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

function applyGradleJavaHome(env) {
  const javaHome = resolveGradleJavaHome()
  const pathEntries = []

  if (javaHome) {
    env.JAVA_HOME = javaHome
    pathEntries.push(path.join(javaHome, 'bin'))
    log(`using Gradle JAVA_HOME: ${javaHome}`)
  }

  const rustBin = resolveRustBinDir()
  if (rustBin) {
    pathEntries.push(rustBin)
    log(`using Rust toolchain bin: ${rustBin}`)
  }

  if (pathEntries.length > 0) {
    env.PATH = `${pathEntries.join(path.delimiter)}${path.delimiter}${env.PATH || ''}`
  }
}

function adbPath(androidHome) {
  return path.join(androidHome, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
}

function gradleWrapperPath() {
  return path.join(androidProjectRoot, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parsePidList(stdout) {
  return [...new Set(
    stdout
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean)
      .filter((value) => /^\d+$/.test(value))
      .map((value) => Number.parseInt(value, 10)),
  )].sort((left, right) => left - right)
}

function findListeningPids(port, env) {
  const lsofResult = spawnSync('lsof', [`-tiTCP:${port}`, '-sTCP:LISTEN'], {
    encoding: 'utf8',
    env,
  })
  if (!lsofResult.error) {
    return parsePidList(lsofResult.stdout)
  }
  if (lsofResult.error.code !== 'ENOENT') {
    throw lsofResult.error
  }

  const fuserResult = spawnSync('fuser', [`${port}/tcp`], {
    encoding: 'utf8',
    env,
  })
  if (!fuserResult.error) {
    return parsePidList(fuserResult.stdout)
  }
  if (fuserResult.error.code !== 'ENOENT') {
    throw fuserResult.error
  }

  log(`could not inspect tcp:${port}: neither lsof nor fuser is available`)
  return []
}

async function releaseDevServerPort(port, env) {
  let pids = findListeningPids(port, env)
  if (pids.length === 0) {
    return
  }

  log(`releasing tcp:${port} from PID(s): ${pids.join(', ')}`)
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch (error) {
      if (error?.code !== 'ESRCH') {
        throw error
      }
    }
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await sleep(250)
    pids = findListeningPids(port, env)
    if (pids.length === 0) {
      return
    }
  }

  log(`force killing remaining PID(s) on tcp:${port}: ${pids.join(', ')}`)
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch (error) {
      if (error?.code !== 'ESRCH') {
        throw error
      }
    }
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await sleep(250)
    pids = findListeningPids(port, env)
    if (pids.length === 0) {
      return
    }
  }

  throw new Error(`failed to release tcp:${port}; still occupied by PID(s): ${pids.join(', ')}`)
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

function detectDeviceAbi(adb, serial, env) {
  const result = spawnSync(adb, ['-s', serial, 'shell', 'getprop', 'ro.product.cpu.abi'], {
    encoding: 'utf8',
    env,
  })
  if (result.status !== 0) {
    log(`could not detect Android ABI for ${serial}: ${result.stderr?.trim() || 'adb getprop failed'}`)
    return null
  }

  return result.stdout.trim().replace(/\r/g, '')
}

function configureAndroidGradleTargets(adb, devices, env) {
  const explicitKeys = [
    'ORG_GRADLE_PROJECT_abiList',
    'ORG_GRADLE_PROJECT_archList',
    'ORG_GRADLE_PROJECT_targetList',
  ]
  if (explicitKeys.some((key) => env[key])) {
    log('using explicit Gradle Android target properties from environment')
    return env.ORG_GRADLE_PROJECT_archList
      ?.split(',')
      .map((arch) => arch.trim())
      .filter(Boolean) ?? []
  }
  if (devices.length === 0) {
    return []
  }

  const selectedTargets = []
  for (const serial of devices) {
    const abi = detectDeviceAbi(adb, serial, env)
    const target = abi ? androidAbiTargets.get(abi) : null
    if (!target) {
      log(`unknown Android ABI for ${serial}: ${abi || 'empty'}; keeping default all-target build`)
      return []
    }
    if (!selectedTargets.some((item) => item.target === target.target)) {
      selectedTargets.push(target)
    }
  }

  env.ORG_GRADLE_PROJECT_abiList = selectedTargets.map((item) => item.abi).join(',')
  env.ORG_GRADLE_PROJECT_archList = selectedTargets.map((item) => item.arch).join(',')
  env.ORG_GRADLE_PROJECT_targetList = selectedTargets.map((item) => item.target).join(',')
  log(
    `restricting Android Gradle targets to ${env.ORG_GRADLE_PROJECT_targetList} (${env.ORG_GRADLE_PROJECT_abiList})`,
  )
  return selectedTargets.map((item) => item.arch)
}

function decodeBase64OrBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
  return Buffer.from(padded, 'base64')
}

function readExistingLicensePublicKey() {
  try {
    return fs.existsSync(licensePublicKeyFile) ? fs.readFileSync(licensePublicKeyFile, 'utf8').trim() : ''
  } catch {
    return ''
  }
}

function resolveLicensePublicKey() {
  const envValue = process.env[licensePublicKeyEnv]?.trim()
  const fileValue = readExistingLicensePublicKey()
  const value = envValue || fileValue
  if (!value) {
    try {
      fs.rmSync(licensePublicKeyFile, {force: true})
    } catch {
      // best-effort cleanup only
    }
    log(
      `warning: ${licensePublicKeyEnv} is not set; recovery-code license activation will fail because native Core has no trusted license public key.`,
    )
    return ''
  }

  let bytes
  try {
    bytes = decodeBase64OrBase64Url(value)
  } catch {
    log(`warning: ${licensePublicKeyEnv} is not valid base64/base64url; license activation will fail.`)
    try {
      fs.rmSync(licensePublicKeyFile, {force: true})
    } catch {
      // best-effort cleanup only
    }
    return ''
  }

  if (bytes.length !== 32) {
    log(
      `warning: ${licensePublicKeyEnv} must decode to a 32-byte Ed25519 public key, got ${bytes.length} bytes.`,
    )
    try {
      fs.rmSync(licensePublicKeyFile, {force: true})
    } catch {
      // best-effort cleanup only
    }
    return ''
  }

  if (!envValue && fileValue) {
    log(`using ${licensePublicKeyFile} for ${licensePublicKeyEnv}`)
    return value
  }

  try {
    const nextContent = `${value}\n`
    const currentContent = fs.existsSync(licensePublicKeyFile)
      ? fs.readFileSync(licensePublicKeyFile, 'utf8')
      : ''
    if (currentContent !== nextContent) {
      fs.writeFileSync(licensePublicKeyFile, nextContent, {mode: 0o600})
    }
  } catch (error) {
    log(`warning: failed to write ${licensePublicKeyFile}: ${error.message}`)
  }

  return value
}

function resolveLaunchableActivity(adb, serial, packageName, env) {
  const result = spawnSync(
    adb,
    ['-s', serial, 'shell', 'cmd', 'package', 'resolve-activity', '--brief', packageName],
    {
      encoding: 'utf8',
      env,
    },
  )
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `failed to resolve ${packageName}`)
  }

  const component = result.stdout
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.includes('/'))
  if (!component) {
    throw new Error(`could not resolve launchable activity for ${packageName}`)
  }

  return component
}

function launchResolvedActivity(adb, serial, component, env) {
  const result = spawnSync(adb, ['-s', serial, 'shell', 'am', 'start', '-n', component], {
    encoding: 'utf8',
    env,
  })
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `failed to launch ${component}`)
  }
}

function forceStopPackage(adb, serial, packageName, env) {
  const result = spawnSync(adb, ['-s', serial, 'shell', 'am', 'force-stop', packageName], {
    encoding: 'utf8',
    env,
  })
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `failed to force-stop ${packageName}`)
  }
}

function maybeRelaunchDebugApp(adb, devices, env) {
  let launched = false
  for (const serial of devices) {
    try {
      const component = resolveLaunchableActivity(adb, serial, debugPackageName, env)
      log(`restarting ${debugPackageName} on ${serial}`)
      forceStopPackage(adb, serial, debugPackageName, env)
      launchResolvedActivity(adb, serial, component, env)
      launched = true
    } catch (error) {
      log(`failed to foreground ${debugPackageName} on ${serial}: ${error.message}`)
    }
  }
  return launched
}

function attachMirroredOutput(stream, output, onText) {
  if (!stream) {
    return
  }

  stream.setEncoding('utf8')
  let buffer = ''
  stream.on('data', (chunk) => {
    output.write(chunk)
    buffer = `${buffer}${chunk}`
    onText(buffer)
    if (buffer.length > 8192) {
      buffer = buffer.slice(-4096)
    }
  })
}

function gradleDebugTasksForArchs(archs, action) {
  const uniqueArchs = [...new Set(archs)]
  if (uniqueArchs.length === 0) {
    return [`:app:${action}Debug`]
  }

  return uniqueArchs.map((arch) => {
    const segment = gradleFlavorSegments.get(arch)
    if (!segment) {
      throw new Error(`unsupported Android Gradle arch: ${arch}`)
    }
    return `:app:${action}${segment}Debug`
  })
}

function debugApkPathForArch(arch) {
  if (!arch) {
    return path.join(androidProjectRoot, 'app', 'build', 'outputs', 'apk', 'universal', 'debug', 'app-universal-debug.apk')
  }
  return path.join(androidProjectRoot, 'app', 'build', 'outputs', 'apk', arch, 'debug', `app-${arch}-debug.apk`)
}

function androidTargetsForArchs(archs) {
  const uniqueArchs = [...new Set(archs)]
  const targets = [...androidAbiTargets.values()]
  if (uniqueArchs.length === 0) {
    return targets
  }

  return uniqueArchs.map((arch) => {
    const target = targets.find((item) => item.arch === arch)
    if (!target) {
      throw new Error(`unsupported Android Gradle arch: ${arch}`)
    }
    return target
  })
}

function removeStaleAndroidRustArtifacts(archs) {
  for (const target of androidTargetsForArchs(archs)) {
    const artifacts = [
      path.join(appRoot, 'src-tauri', 'target', target.rustTarget, 'debug', 'libchromvoid_lib.so'),
      path.join(androidProjectRoot, 'app', 'src', 'main', 'jniLibs', target.abi, 'libchromvoid_lib.so'),
    ]

    for (const artifact of artifacts) {
      if (!fs.existsSync(artifact)) {
        continue
      }
      fs.rmSync(artifact, {force: true})
      log(`removed stale Android Rust artifact ${path.relative(appRoot, artifact)}`)
    }
  }
}

function removeStaleDebugApks(archs) {
  const candidates = new Set([debugApkPathForArch(null)])
  for (const arch of new Set(archs)) {
    candidates.add(debugApkPathForArch(arch))
  }

  for (const apk of candidates) {
    if (!fs.existsSync(apk)) {
      continue
    }
    fs.rmSync(apk, {force: true})
    log(`removed stale Android debug APK ${path.relative(appRoot, apk)}`)
  }
}

function installDebugApkThroughAdb(adb, devices, archs, env) {
  const fallbackArch = [...new Set(archs)][0] ?? null
  for (const serial of devices) {
    const abi = detectDeviceAbi(adb, serial, env)
    const arch = (abi && androidAbiTargets.get(abi)?.arch) || fallbackArch
    const apk = debugApkPathForArch(arch)
    if (!fs.existsSync(apk)) {
      throw new Error(`Android debug APK not found at ${apk}`)
    }

    log(`installing ${path.basename(apk)} on ${serial} via adb tunnel`)
    const result = spawnSync(adb, ['-s', serial, 'install', '-r', apk], {
      encoding: 'utf8',
      env,
      stdio: 'inherit',
    })
    if (result.error) {
      throw result.error
    }
    if (result.status !== 0) {
      throw new Error(`adb install failed for ${serial} with exit code ${result.status}`)
    }
  }
}

function runForcedWebviewBuild(env) {
  log('building production WebView dist for Android debug package')
  const result = spawnSync('node', ['./scripts/build-webview-if-needed.mjs', '--force'], {
    cwd: appRoot,
    env,
    stdio: 'inherit',
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`WebView production build failed with exit code ${result.status}`)
  }
}

function syncAndroidWebviewDistAssets() {
  const distIndex = path.join(webviewDistRoot, 'index.html')
  if (!fs.existsSync(distIndex)) {
    throw new Error(`WebView dist index not found at ${distIndex}`)
  }

  for (const entry of fs.readdirSync(generatedAndroidAssetsRoot, {withFileTypes: true})) {
    if (entry.name === 'tauri.conf.json') {
      continue
    }
    fs.rmSync(path.join(generatedAndroidAssetsRoot, entry.name), {recursive: true, force: true})
  }

  const entries = fs.readdirSync(webviewDistRoot, {withFileTypes: true})
  for (const entry of entries) {
    if (entry.name === '.chromvoid-build-cache.json' || entry.name === 'tauri.conf.json') {
      continue
    }

    const source = path.join(webviewDistRoot, entry.name)
    const target = path.join(generatedAndroidAssetsRoot, entry.name)
    fs.rmSync(target, {recursive: true, force: true})
    fs.cpSync(source, target, {recursive: true, force: true})
  }

  log('synced production WebView dist into generated Android assets')
}

function runGradleDebugInstall(env, archs, devices, adb) {
  const gradlew = gradleWrapperPath()
  if (!fs.existsSync(gradlew)) {
    throw new Error(`Gradle wrapper not found at ${gradlew}`)
  }

  const useAdbTunnel = isEnabled(env.CHROMVOID_USE_ADB_TUNNEL)
  const tasks = gradleDebugTasksForArchs(archs, useAdbTunnel ? 'assemble' : 'install')
  log(`${useAdbTunnel ? 'building' : 'installing'} Android debug package via Gradle: ${tasks.join(', ')}`)
  const result = spawnSync(gradlew, ['--project-dir', androidProjectRoot, ...tasks, '--console=plain'], {
    cwd: androidProjectRoot,
    env,
    stdio: 'inherit',
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`Gradle Android debug ${useAdbTunnel ? 'assemble' : 'install'} failed with exit code ${result.status}`)
  }

  if (useAdbTunnel) {
    installDebugApkThroughAdb(adb, devices, archs, env)
  }
}

function runTauriDev(tauriBinary, tauriArgs, appRoot, env, adb, devices) {
  return new Promise((resolve, reject) => {
    let shouldRelaunchDebugApp = true
    const child = spawn(tauriBinary, tauriArgs, {
      cwd: appRoot,
      env,
      stdio: ['inherit', 'pipe', 'pipe'],
    })

    const maybeHandleReleaseLaunch = (buffer) => {
      if (!shouldRelaunchDebugApp || !buffer.includes(releaseLaunchIntent)) {
        return
      }

      shouldRelaunchDebugApp = false
      maybeRelaunchDebugApp(adb, devices, env)
    }

    attachMirroredOutput(child.stdout, process.stdout, maybeHandleReleaseLaunch)
    attachMirroredOutput(child.stderr, process.stderr, maybeHandleReleaseLaunch)
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      resolve({code, signal})
    })
  })
}

const androidHome = resolveAndroidHome()
const skipFreshTauriPrebuild =
  process.env.ORG_GRADLE_PROJECT_chromvoidSkipFreshTauriPrebuild || 'true'
const licensePublicKey = resolveLicensePublicKey()
const childEnv = {
  ...process.env,
  ANDROID_HOME: androidHome,
  ANDROID_SDK_ROOT: androidHome,
  ORG_GRADLE_PROJECT_chromvoidSkipFreshTauriPrebuild: skipFreshTauriPrebuild,
  ORG_GRADLE_PROJECT_chromvoidProductionWebviewDev: 'true',
}
applyGradleJavaHome(childEnv)
applyRemoteAdbTunnelEnv(childEnv)
if (licensePublicKey) {
  childEnv[licensePublicKeyEnv] = licensePublicKey
}
log(
  `fresh Tauri prebuild reuse ${skipFreshTauriPrebuild === 'true' ? 'enabled' : 'disabled'} for Android Gradle Rust task`,
)

const adb = adbPath(androidHome)
if (!fs.existsSync(adb)) {
  throw new Error(`adb not found at ${adb}`)
}

const devices = listConnectedDevices(adb, childEnv)
let selectedArchs = []
if (devices.length === 0) {
  log('no connected Android devices detected')
} else {
  selectedArchs = configureAndroidGradleTargets(adb, devices, childEnv)
}

if (devices.length > 0 && forwardedArgs.length === 0) {
  runForcedWebviewBuild(childEnv)
  syncAndroidWebviewDistAssets()
  applyGeneratedAndroidDevConfig()
  removeStaleAndroidRustArtifacts(selectedArchs)
  removeStaleDebugApks(selectedArchs)
  runGradleDebugInstall(childEnv, selectedArchs, devices, adb)
  process.exit(maybeRelaunchDebugApp(adb, devices, childEnv) ? 0 : 1)
}

const hasExplicitHostArg =
  forwardedArgs.includes('--host')
  || forwardedArgs.some((arg) => arg.startsWith('--host='))
  || forwardedArgs.includes('--force-ip-prompt')
const hasExplicitFeaturesArg =
  forwardedArgs.includes('--features')
  || forwardedArgs.some((arg) => arg.startsWith('--features='))
  || forwardedArgs.includes('-f')
const lanHost = process.env.TAURI_ANDROID_DEV_HOST || detectLanHost()
const tauriArgs = ['android', 'dev', '--config', 'src-tauri/tauri.dev.conf.json', '--port', String(devServerPort)]

if (!hasExplicitFeaturesArg) {
  log('using Android Cargo feature set')
  tauriArgs.push('--features', 'android')
}

if (!hasExplicitHostArg && devices.length === 0 && lanHost) {
  log(`using --host ${lanHost}`)
  tauriArgs.push('--host', lanHost)
}

tauriArgs.push(...forwardedArgs)
const maxAttempts = 2
let lastExitCode = 1

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  await releaseDevServerPort(devServerPort, childEnv)
  const {code, signal} = await runTauriDev(tauriBinary, tauriArgs, appRoot, childEnv, adb, devices)

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
  }
}

process.exit(lastExitCode)
