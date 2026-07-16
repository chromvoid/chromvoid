#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(scriptDir, '..')
const tauriRoot = path.join(appRoot, 'src-tauri')
const minimumMacosVersion = process.env.MACOSX_DEPLOYMENT_TARGET?.trim() || '13.0'
const forbiddenMacFuseRuntime =
  /(?:^|\/)(?:lib(?:osx|mac)?fuse[^/]*\.dylib|MFMount(?:\.framework)?|macFUSE\.framework)(?:$|\/)/i
const machoMagics = new Set([
  0xfeedface, 0xcefaedfe, 0xfeedfacf, 0xcffaedfe, 0xcafebabe, 0xbebafeca, 0xcafebabf, 0xbfbafeca,
])

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: tauriRoot,
    encoding: 'utf8',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const details = (result.stderr || result.stdout || '').trim()
    throw new Error(`${command} exited with status ${result.status}${details ? `: ${details}` : ''}`)
  }
  return result.stdout.trim()
}

function cargoTargetDir() {
  const configured = process.env.CARGO_TARGET_DIR?.trim()
  return configured ? path.resolve(tauriRoot, configured) : path.join(tauriRoot, 'target')
}

function tauriBinaryPath() {
  const target = process.env.CHROMVOID_TAURI_TARGET?.trim()
  const profile = process.env.CHROMVOID_TAURI_PROFILE?.trim() || 'release'
  return path.join(cargoTargetDir(), ...(target ? [target] : []), profile, 'chromvoid')
}

function loadDependencies(binaryPath) {
  const dependencies = []
  for (const line of run('otool', ['-L', binaryPath]).split('\n').slice(1)) {
    const trimmed = line.trim()
    if (!trimmed || /\(architecture [^)]+\):$/.test(trimmed)) continue

    const marker = ' (compatibility version '
    const markerIndex = trimmed.lastIndexOf(marker)
    if (markerIndex <= 0) {
      throw new Error(`failed to parse otool dependency for ${binaryPath}: ${trimmed}`)
    }
    dependencies.push(trimmed.slice(0, markerIndex))
  }
  return dependencies
}

function compareVersions(left, right) {
  const leftParts = left.split('.').map(Number)
  const rightParts = right.split('.').map(Number)
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0)
    if (difference !== 0) return difference
  }
  return 0
}

function assertCompatibleMinimumVersion(binaryPath) {
  const architectureCount = run('lipo', ['-archs', binaryPath]).split(/\s+/).filter(Boolean).length
  const versions = [...run('vtool', ['-show-build', binaryPath]).matchAll(/\bminos\s+([0-9.]+)/g)].map(
    (match) => match[1],
  )
  if (versions.length !== architectureCount) {
    throw new Error(
      `${binaryPath} declares ${versions.length} macOS minimum versions for ${architectureCount} Mach-O slices`,
    )
  }

  const incompatible = versions.filter((version) => compareVersions(version, minimumMacosVersion) > 0)
  if (incompatible.length > 0) {
    throw new Error(
      `${binaryPath} requires macOS ${incompatible.join(', ')}, newer than the app minimum ${minimumMacosVersion}`,
    )
  }
}

function assertRuntimeDependencies(binaryPath, {allowBundledRelative = false} = {}) {
  const dependencies = loadDependencies(binaryPath)
  const forbidden = dependencies.filter((dependency) => forbiddenMacFuseRuntime.test(dependency))
  if (forbidden.length > 0) {
    throw new Error(
      `macFUSE must remain an optional user-installed runtime; ${binaryPath} links: ${forbidden.join(', ')}`,
    )
  }

  const external = dependencies.filter(
    (dependency) =>
      path.isAbsolute(dependency) &&
      !dependency.startsWith('/System/') &&
      !dependency.startsWith('/usr/lib/'),
  )
  if (external.length > 0) {
    throw new Error(`${binaryPath} has unbundled external dependencies: ${external.join(', ')}`)
  }

  const unresolvedRelative = dependencies.filter(
    (dependency) => !allowBundledRelative && dependency.startsWith('@'),
  )
  if (unresolvedRelative.length > 0) {
    throw new Error(`${binaryPath} has unresolved relative dependencies: ${unresolvedRelative.join(', ')}`)
  }
}

function walkBundle(rootPath) {
  const entries = []
  const regularFiles = []
  const pending = [rootPath]

  while (pending.length > 0) {
    const directory = pending.pop()
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const entryPath = path.join(directory, entry.name)
      entries.push(entryPath)
      if (entry.isDirectory()) {
        pending.push(entryPath)
      } else if (entry.isFile()) {
        regularFiles.push(entryPath)
      }
    }
  }

  return {entries, regularFiles}
}

function isMachO(filePath) {
  const descriptor = fs.openSync(filePath, 'r')
  try {
    const header = Buffer.allocUnsafe(4)
    if (fs.readSync(descriptor, header, 0, header.length, 0) !== header.length) return false
    return machoMagics.has(header.readUInt32BE(0))
  } finally {
    fs.closeSync(descriptor)
  }
}

function verifyMainBinary(binaryPath) {
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`Tauri binary does not exist: ${binaryPath}`)
  }

  assertCompatibleMinimumVersion(binaryPath)
  assertRuntimeDependencies(binaryPath)
  console.log('[macos-runtime-libraries] verified main executable has no external runtime dependencies')
}

function verifyAppBundle(appBundlePath) {
  if (!fs.existsSync(appBundlePath)) {
    throw new Error(`macOS app bundle does not exist: ${appBundlePath}`)
  }

  const {entries, regularFiles} = walkBundle(appBundlePath)
  const forbiddenArtifacts = entries.filter((entryPath) => forbiddenMacFuseRuntime.test(entryPath))
  if (forbiddenArtifacts.length > 0) {
    throw new Error(`macFUSE runtime artifacts found in app bundle: ${forbiddenArtifacts.join(', ')}`)
  }

  const binaries = regularFiles.filter(isMachO)
  for (const binaryPath of binaries) {
    assertRuntimeDependencies(binaryPath, {allowBundledRelative: true})
  }

  const mainBinary = path.join(appBundlePath, 'Contents', 'MacOS', 'chromvoid')
  assertCompatibleMinimumVersion(mainBinary)
  console.log(
    `[macos-runtime-libraries] verified ${binaries.length} Mach-O files in ${appBundlePath}; macFUSE remains external and optional`,
  )
}

function main() {
  if (process.platform !== 'darwin') return

  const args = process.argv.slice(2)
  if (args.length === 0) {
    verifyMainBinary(tauriBinaryPath())
    return
  }
  if (args.length === 2 && args[0] === '--app-bundle') {
    verifyAppBundle(path.resolve(args[1]))
    return
  }
  throw new Error(`usage: ${path.basename(process.argv[1])} [--app-bundle /path/to/ChromVoid.app]`)
}

try {
  main()
} catch (error) {
  console.error(`[macos-runtime-libraries] ${error.message}`)
  process.exit(1)
}
