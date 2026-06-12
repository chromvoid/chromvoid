#!/usr/bin/env node

import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import {spawn, spawnSync} from 'node:child_process'

const defaultSshTarget = 'dev-ubuntu'
const defaultAdbTunnelPort = '15037'
const defaultDevServerPort = '4400'

const args = process.argv.slice(2)
const adbOnly = args.includes('--adb-only')
const helpRequested = args.includes('--help') || args.includes('-h')

function log(message) {
  console.log(`[android-adb-bridge] ${message}`)
}

function fail(message) {
  console.error(`[android-adb-bridge] ${message}`)
  process.exit(1)
}

function usage() {
  console.log(`Usage: node ./scripts/open-android-adb-bridge.mjs [--adb-only]

Starts a foreground SSH tunnel from this Mac to dev-ubuntu.

Environment:
  ADB                         Optional adb executable path
  ANDROID_HOME                Optional Android SDK path
  ANDROID_SDK_ROOT            Optional Android SDK path
  CHROMVOID_DEV_SSH_TARGET    SSH target, default: ${defaultSshTarget}
  CHROMVOID_ADB_TUNNEL_PORT   Remote adb tunnel port, default: ${defaultAdbTunnelPort}
  CHROMVOID_DEV_SERVER_PORT   Dev server port, default: ${defaultDevServerPort}
`)
}

function isExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

function commandWorks(command, args) {
  const result = spawnSync(command, args, {stdio: 'ignore'})
  return !result.error && result.status === 0
}

function validatePort(name, value) {
  if (!/^\d+$/.test(value)) {
    fail(`${name} must be a numeric TCP port, got: ${value}`)
  }
  const port = Number.parseInt(value, 10)
  if (port < 1 || port > 65535) {
    fail(`${name} must be between 1 and 65535, got: ${value}`)
  }
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

  for (const candidate of candidates) {
    if (isExecutable(candidate)) {
      return candidate
    }
  }

  if (commandWorks('adb', ['version'])) {
    return 'adb'
  }

  fail('adb not found. Set ADB, ANDROID_HOME, or ANDROID_SDK_ROOT so Android platform-tools can be found.')
}

function runRequired(command, args, label) {
  const result = spawnSync(command, args, {stdio: 'inherit'})
  if (result.error) {
    fail(`${label} failed: ${result.error.message}`)
  }
  if (result.status !== 0) {
    fail(`${label} exited with code ${result.status}`)
  }
}

function assertLocalPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        reject(new Error(`localhost:${port} is already in use. Stop the local process or rerun with --adb-only.`))
        return
      }
      reject(error)
    })
    server.listen(Number.parseInt(port, 10), '127.0.0.1', () => {
      server.close(resolve)
    })
  })
}

function assertRemotePortAvailable(target, port) {
  const script = `
set -eu
port="$1"
if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1 && command -v ss >/dev/null 2>&1; then
  sudo -n ss -H -ltnp "sport = :$port" | head -n 1 || true
elif command -v ss >/dev/null 2>&1; then
  ss -H -ltn "sport = :$port" | head -n 1 || true
elif command -v lsof >/dev/null 2>&1; then
  lsof -nP -iTCP:"$port" -sTCP:LISTEN | tail -n +2 | head -n 1 || true
elif command -v python3 >/dev/null 2>&1; then
  python3 - "$port" <<'PY'
import socket
import sys

port = int(sys.argv[1])
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.settimeout(0.5)
try:
    sock.connect(("127.0.0.1", port))
except OSError:
    pass
else:
    print(f"127.0.0.1:{port} is accepting connections")
finally:
    sock.close()
PY
fi
`
  const result = spawnSync('ssh', [target, 'sh', '-s', '--', port], {
    encoding: 'utf8',
    input: script,
  })
  if (result.error) {
    fail(`could not check ${target} localhost:${port}: ${result.error.message}`)
  }
  if (result.status !== 0) {
    const details = result.stderr?.trim() || result.stdout?.trim() || `ssh exited with code ${result.status}`
    fail(`could not check ${target} localhost:${port}: ${details}`)
  }

  const occupiedBy = result.stdout.trim()
  if (occupiedBy) {
    fail(
      `${target} localhost:${port} is already in use: ${occupiedBy}\n` +
        'Another Android ADB bridge may already be running. Stop that bridge, use the existing tunnel, ' +
        'or choose a different CHROMVOID_ADB_TUNNEL_PORT on both Mac and dev-ubuntu.',
    )
  }
}

if (helpRequested) {
  usage()
  process.exit(0)
}

const sshTarget = process.env.CHROMVOID_DEV_SSH_TARGET || defaultSshTarget
const adbTunnelPort = process.env.CHROMVOID_ADB_TUNNEL_PORT || defaultAdbTunnelPort
const devServerPort = process.env.CHROMVOID_DEV_SERVER_PORT || defaultDevServerPort
const adb = resolveAdb()

validatePort('CHROMVOID_ADB_TUNNEL_PORT', adbTunnelPort)
validatePort('CHROMVOID_DEV_SERVER_PORT', devServerPort)
runRequired(adb, ['start-server'], 'adb start-server')
log(`adb devices visible on this Mac:`)
runRequired(adb, ['devices', '-l'], 'adb devices -l')

assertRemotePortAvailable(sshTarget, adbTunnelPort)
if (!adbOnly) {
  await assertLocalPortAvailable(devServerPort)
}

const sshArgs = [
  '-N',
  '-o',
  'ExitOnForwardFailure=yes',
  '-o',
  'ServerAliveInterval=30',
  '-R',
  `127.0.0.1:${adbTunnelPort}:127.0.0.1:5037`,
]

if (!adbOnly) {
  sshArgs.push('-L', `127.0.0.1:${devServerPort}:127.0.0.1:${devServerPort}`)
}

sshArgs.push(sshTarget)

log(`opening SSH bridge to ${sshTarget}`)
log(`dev-ubuntu ADB socket: tcp:127.0.0.1:${adbTunnelPort}`)
if (!adbOnly) {
  log(`Mac localhost:${devServerPort} forwards to dev-ubuntu localhost:${devServerPort}`)
  log('keep this process running, then run bun run --cwd apps/chromvoid android:remote-adb on dev-ubuntu')
} else {
  log('ADB-only mode is for release install flows and does not build or install by itself')
  log('Tauri dev builds now package production WebView assets; omit --adb-only only for custom localhost:4400 hosts')
}

const child = spawn('ssh', sshArgs, {stdio: 'inherit'})
child.on('error', (error) => {
  fail(`ssh failed: ${error.message}`)
})
child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
