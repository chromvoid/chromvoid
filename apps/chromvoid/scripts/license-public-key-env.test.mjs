import {afterEach, describe, expect, test} from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  licensePublicKeyEnv,
  resolveLicensePublicKeyEnv,
} from './license-public-key-env.mjs'

const temporaryRoots = []
const validKey = Buffer.alloc(32, 7).toString('base64url')

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, {recursive: true, force: true})
  }
})

describe('resolveLicensePublicKeyEnv', () => {
  test('preserves and validates an explicit key', () => {
    const appRoot = createAppRoot()

    const resolved = resolveLicensePublicKeyEnv({
      appRoot,
      env: {[licensePublicKeyEnv]: ` ${validKey} `},
    })

    expect(resolved[licensePublicKeyEnv]).toBe(validKey)
  })

  test('uses the first non-empty local key when the runtime variable is empty', () => {
    const appRoot = createAppRoot()
    writeKeyFile(appRoot, 'apple', '')
    const androidFile = writeKeyFile(appRoot, 'android', validKey)
    const resolvedFiles = []

    const resolved = resolveLicensePublicKeyEnv({
      appRoot,
      env: {[licensePublicKeyEnv]: '', KEEP_ME: 'true'},
      onFileResolved: (filePath) => resolvedFiles.push(filePath),
    })

    expect(resolved).toEqual({[licensePublicKeyEnv]: validKey, KEEP_ME: 'true'})
    expect(resolvedFiles).toEqual([androidFile])
  })

  test('removes an empty runtime override when no local key exists', () => {
    const appRoot = createAppRoot()

    const resolved = resolveLicensePublicKeyEnv({
      appRoot,
      env: {[licensePublicKeyEnv]: '', KEEP_ME: 'true'},
    })

    expect(resolved).toEqual({KEEP_ME: 'true'})
  })

  test('rejects an invalid explicit key instead of silently using a file', () => {
    const appRoot = createAppRoot()
    writeKeyFile(appRoot, 'android', validKey)

    expect(() =>
      resolveLicensePublicKeyEnv({
        appRoot,
        env: {[licensePublicKeyEnv]: 'not-a-32-byte-key'},
      }),
    ).toThrow('must decode to a 32-byte Ed25519 public key')
  })
})

function createAppRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chromvoid-license-key-env-'))
  temporaryRoots.push(root)
  return root
}

function writeKeyFile(appRoot, platform, value) {
  const directory = path.join(appRoot, 'src-tauri', 'gen', platform)
  const filePath = path.join(directory, '.license-public-key')
  fs.mkdirSync(directory, {recursive: true})
  fs.writeFileSync(filePath, `${value}\n`)
  return filePath
}
