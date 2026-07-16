import {afterEach, describe, expect, test} from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {bitcoinEsploraUrlEnv, loadWalletEnvFromRoot, walletEnabledEnv} from './wallet-env.mjs'

const originalWalletEnabled = process.env[walletEnabledEnv]
const originalBitcoinEsploraUrl = process.env[bitcoinEsploraUrlEnv]
const temporaryRoots = []

afterEach(() => {
  restoreEnv(walletEnabledEnv, originalWalletEnabled)
  restoreEnv(bitcoinEsploraUrlEnv, originalBitcoinEsploraUrl)
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, {recursive: true, force: true})
  }
})

describe('loadWalletEnvFromRoot', () => {
  test('loads the wallet flag and Bitcoin provider override from .env', () => {
    const root = createRepoEnv(
      'CHROMVOID_WALLET_ENABLED=true\nCHROMVOID_BTC_ESPLORA_URL=https://self-hosted.example/api/\n',
    )
    delete process.env[walletEnabledEnv]
    delete process.env[bitcoinEsploraUrlEnv]

    loadWalletEnvFromRoot(root)

    expect(process.env[walletEnabledEnv]).toBe('true')
    expect(process.env[bitcoinEsploraUrlEnv]).toBe('https://self-hosted.example/api/')
  })

  test('preserves explicit process overrides', () => {
    const root = createRepoEnv(
      'CHROMVOID_WALLET_ENABLED=false\nCHROMVOID_BTC_ESPLORA_URL=https://env-file.example/api/\n',
    )
    process.env[walletEnabledEnv] = 'true'
    process.env[bitcoinEsploraUrlEnv] = 'https://runtime.example/api/'

    loadWalletEnvFromRoot(root)

    expect(process.env[walletEnabledEnv]).toBe('true')
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
