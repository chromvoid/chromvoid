#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import {spawn, spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {resolveLicensePublicKeyEnv} from './license-public-key-env.mjs'
import {loadWalletEnvFromRoot} from './wallet-env.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(appRoot, '..', '..')
loadWalletEnvFromRoot(repoRoot)
const forwardedArgs = process.argv.slice(2)
const bundlesMacosApp = process.platform === 'darwin' && !forwardedArgs.includes('--no-bundle')
const localTauriBinary = path.join(
  appRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tauri.cmd' : 'tauri',
)
const tauriBinary = fs.existsSync(localTauriBinary) ? localTauriBinary : 'tauri'
const tauriRoot = path.join(appRoot, 'src-tauri')
const macosMinimumVersion = '13.0'

if (bundlesMacosApp && forwardedArgs.includes('--no-sign')) {
  console.error(
    '[tauri-build-runner] --no-sign is incompatible with the bundled macOS Credential Provider',
  )
  process.exit(2)
}

function forwardedTarget(args) {
  const inline = args.find((arg) => arg.startsWith('--target='))
  if (inline) {
    return inline.slice('--target='.length)
  }
  const index = args.indexOf('--target')
  return index >= 0 ? args[index + 1] : undefined
}

function runChecked(command, args, cwd = repoRoot, envOverrides = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: {...process.env, ...envOverrides},
    stdio: 'inherit',
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? 'unknown'}`)
  }
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, {cwd: repoRoot, env: process.env, encoding: 'utf8'})
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? 'unknown'}`)
  }
  return result.stdout.trim()
}

function cargoTargetDir() {
  const configured = process.env.CARGO_TARGET_DIR
  return configured
    ? path.resolve(repoRoot, configured)
    : path.join(repoRoot, 'target')
}

function buildProductCli(target) {
  const args = ['build', '--release', '-p', 'chromvoid-product-cli']
  if (target) {
    args.push('--target', target)
  }
  runChecked('cargo', args)
  return path.join(
    cargoTargetDir(),
    ...(target ? [target] : []),
    'release',
    process.platform === 'win32' ? 'chromvoid.exe' : 'chromvoid',
  )
}

function stageMacosProductCli(signing) {
  if (!bundlesMacosApp) {
    return
  }

  const requestedTarget = forwardedTarget(forwardedArgs)
  const bundleTarget = requestedTarget ?? commandOutput('rustc', ['--print', 'host-tuple'])
  const binariesDir = path.join(appRoot, 'src-tauri', 'binaries')
  const destination = path.join(binariesDir, 'chromvoid-agent')
  fs.mkdirSync(binariesDir, {recursive: true})

  if (bundleTarget === 'universal-apple-darwin') {
    const arm64 = buildProductCli('aarch64-apple-darwin')
    const x64 = buildProductCli('x86_64-apple-darwin')
    runChecked('lipo', ['-create', arm64, x64, '-output', destination])
  } else {
    const binary = buildProductCli(requestedTarget)
    fs.copyFileSync(binary, destination)
  }
  fs.chmodSync(destination, 0o755)
  if (!signing?.identity || !signing.certificateName) {
    throw new Error('Credential Provider signing metadata is required for the bundled macOS CLI')
  }
  const timestampArg = signing.certificateName.startsWith('Developer ID Application:')
    ? '--timestamp'
    : '--timestamp=none'
  runChecked('codesign', [
    '--force',
    '--sign',
    signing.identity,
    '--identifier',
    'com.chromvoid.cli',
    '--options',
    'runtime',
    timestampArg,
    destination,
  ])
  runChecked('codesign', ['--verify', '--strict', '--verbose=2', destination])
  console.log(`[tauri-build-runner] staged signed CLI sidecar ${destination}`)
}

function stageMacosCredentialProvider() {
  if (!bundlesMacosApp) {
    return undefined
  }

  const requestedTarget = forwardedTarget(forwardedArgs)
  let architectures
  if (requestedTarget === 'universal-apple-darwin') {
    architectures = 'arm64 x86_64'
  } else if (requestedTarget === 'x86_64-apple-darwin') {
    architectures = 'x86_64'
  } else if (requestedTarget === 'aarch64-apple-darwin') {
    architectures = 'arm64'
  }

  const script = path.join(scriptDir, 'build-credential-extension.sh')
  runChecked('bash', [script, '--release'], repoRoot, {
    ...(architectures ? {CHROMVOID_MACOS_ARCHS: architectures} : {}),
    ...(process.env.APPLE_SIGNING_IDENTITY
      ? {CODESIGN_IDENTITY: process.env.APPLE_SIGNING_IDENTITY}
      : {}),
  })

  const identityPath = path.join(
    appRoot,
    'src-tauri',
    'gen',
    'apple',
    'build',
    'credential-provider',
    'stage',
    'signing-identity',
  )
  const certificateNamePath = path.join(path.dirname(identityPath), 'signing-certificate-name')
  const identity = fs.readFileSync(identityPath, 'utf8').trim()
  const certificateName = fs.readFileSync(certificateNamePath, 'utf8').trim()
  if (!identity || !certificateName) {
    throw new Error(`empty Apple signing identity at ${identityPath}`)
  }
  return {identity, certificateName}
}

function tauriBuildProfile() {
  return forwardedArgs.includes('--debug') ? 'debug' : 'release'
}

function configuredTauriTargetDir() {
  const configured = process.env.CARGO_TARGET_DIR?.trim()
  return configured ? path.resolve(tauriRoot, configured) : path.join(tauriRoot, 'target')
}

function packagingTargetDir() {
  const configured = process.env.CHROMVOID_TAURI_BUNDLE_TARGET_DIR?.trim()
  return configured
    ? path.resolve(tauriRoot, configured)
    : path.join(tauriRoot, 'target', 'tauri-bundle')
}

function bundleRelativePath() {
  const target = forwardedTarget(forwardedArgs)
  return path.join(
    ...(target ? [target] : []),
    tauriBuildProfile(),
    'bundle',
    'macos',
    'ChromVoid.app',
  )
}

function publishMacosAppBundle() {
  if (!bundlesMacosApp) return

  const relativePath = bundleRelativePath()
  const source = path.join(packagingTargetDir(), relativePath)
  const destination = path.join(configuredTauriTargetDir(), relativePath)
  if (!fs.existsSync(source)) {
    throw new Error(`packaged macOS app does not exist: ${source}`)
  }
  runChecked(
    process.execPath,
    [path.join(scriptDir, 'verify-macos-runtime-libraries.mjs'), '--app-bundle', source],
    appRoot,
    {MACOSX_DEPLOYMENT_TARGET: macosMinimumVersion},
  )
  if (path.resolve(source) !== path.resolve(destination)) {
    fs.rmSync(destination, {recursive: true, force: true})
    fs.mkdirSync(path.dirname(destination), {recursive: true})
    runChecked('ditto', ['--rsrc', '--extattr', '--acl', source, destination])
  }
  runChecked('codesign', ['--verify', '--deep', '--strict', '--verbose=2', destination])
  console.log(`[tauri-build-runner] published macOS app bundle ${destination}`)
}

function hasExplicitBundleArgs(args) {
  return args.some(
    (arg) =>
      arg === '--bundles' ||
      arg === '-b' ||
      arg.startsWith('--bundles=') ||
      arg.startsWith('-b=') ||
      arg === '--no-bundle',
  )
}

function defaultBundleArgs() {
  if (hasExplicitBundleArgs(forwardedArgs)) {
    return []
  }

  switch (process.platform) {
    case 'darwin':
      return ['--bundles', 'app']
    case 'linux':
      return ['--bundles', 'appimage']
    case 'win32':
      return ['--bundles', 'nsis']
    default:
      return []
  }
}

try {
  const macosSigning = stageMacosCredentialProvider()
  if (macosSigning && !process.env.APPLE_CERTIFICATE) {
    process.env.APPLE_SIGNING_IDENTITY = macosSigning.identity
  }
  stageMacosProductCli(macosSigning)
} catch (error) {
  console.error(`[tauri-build-runner] failed to stage macOS bundle inputs: ${error.message}`)
  process.exit(1)
}

const bundleConfig =
  process.platform === 'darwin'
    ? 'src-tauri/tauri.macos-cli.conf.json'
    : 'src-tauri/tauri.cli-sidecar.conf.json'
const tauriArgs = [
  'build',
  '--config',
  bundleConfig,
  ...defaultBundleArgs(),
  ...forwardedArgs,
]
const child = spawn(tauriBinary, tauriArgs, {
  cwd: appRoot,
  env: {
    ...resolveLicensePublicKeyEnv({
      appRoot,
      env: process.env,
      onFileResolved: (filePath) => {
        console.log(`[tauri-build-runner] using license public key from ${filePath}`)
      },
    }),
    ...(process.platform === 'darwin'
      ? {
          MACOSX_DEPLOYMENT_TARGET: macosMinimumVersion,
          ...(bundlesMacosApp
            ? {
                CARGO_TARGET_DIR: packagingTargetDir(),
                CHROMVOID_TAURI_PROFILE: tauriBuildProfile(),
              }
            : {}),
        }
      : {}),
    ...(process.platform === 'darwin' && forwardedTarget(forwardedArgs)
      ? {CHROMVOID_TAURI_TARGET: forwardedTarget(forwardedArgs)}
      : {}),
  },
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  if (code === 0) {
    try {
      publishMacosAppBundle()
    } catch (error) {
      console.error(`[tauri-build-runner] failed to publish macOS bundle: ${error.message}`)
      process.exit(1)
      return
    }
  }
  process.exit(code ?? 1)
})
