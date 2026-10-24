import {afterEach, describe, expect, test} from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {bitcoinEsploraUrlEnv, loadWalletEnvFromRoot} from './wallet-env.mjs'

const originalBitcoinEsploraUrl = process.env[bitcoinEsploraUrlEnv]
const temporaryRoots = []

afterEach(() => {
  restoreEnv(bitcoinEsploraUrlEnv, originalBitcoinEsploraUrl)
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, {recursive: true, force: true})
  }
})

describe('loadWalletEnvFromRoot', () => {
  test('loads the Bitcoin provider override from .env', () => {
    const root = createRepoEnv('CHROMVOID_BTC_ESPLORA_URL=https://self-hosted.example/api/\n')
    delete process.env[bitcoinEsploraUrlEnv]

    loadWalletEnvFromRoot(root)

    expect(process.env[bitcoinEsploraUrlEnv]).toBe('https://self-hosted.example/api/')
  })

  test('preserves explicit process overrides', () => {
    const root = createRepoEnv('CHROMVOID_BTC_ESPLORA_URL=https://env-file.example/api/\n')
    process.env[bitcoinEsploraUrlEnv] = 'https://runtime.example/api/'

    loadWalletEnvFromRoot(root)

    expect(process.env[bitcoinEsploraUrlEnv]).toBe('https://runtime.example/api/')
  })
})

function createRepoEnv(content) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chromvoid-wallet-env-'))
  temporaryRoots.push(root)
  fs.writeFileSync(path.join(root, '.env'), content)
  return root
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = value
}
