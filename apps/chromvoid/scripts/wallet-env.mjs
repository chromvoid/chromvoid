import fs from 'node:fs'
import path from 'node:path'

export const tonApiUrlEnv = 'CHROMVOID_TON_API_URL'
export const bitcoinEsploraUrlEnv = 'CHROMVOID_BTC_ESPLORA_URL'
export const ethereumBuildEnv = 'CHROMVOID_BUILD_WALLET_ETHEREUM'
export const ethereumRpcUrlEnv = 'CHROMVOID_ETH_RPC_URL'
export const ethereumIndexerUrlEnv = 'CHROMVOID_ETH_INDEXER_URL'
export const solanaBuildEnv = 'CHROMVOID_BUILD_WALLET_SOLANA'
export const solanaRpcUrlEnv = 'CHROMVOID_SOL_RPC_URL'

const walletEnvNames = [
  tonApiUrlEnv,
  bitcoinEsploraUrlEnv,
  ethereumBuildEnv,
  ethereumRpcUrlEnv,
  ethereumIndexerUrlEnv,
  solanaBuildEnv,
  solanaRpcUrlEnv,
]

export function loadWalletEnvFromRoot(repoRoot) {
  const envFile = path.join(repoRoot, '.env')
  if (!fs.existsSync(envFile)) {
    return
  }

  const content = fs.readFileSync(envFile, 'utf8')
  for (const name of walletEnvNames) {
    if (process.env[name] !== undefined) {
      continue
    }
    const value = readEnvValue(content, name)
    if (value !== null) {
      process.env[name] = value
    }
  }
}

function readEnvValue(content, key) {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match || match[1] !== key) {
      continue
    }

    return normalizeEnvValue(match[2])
  }

  return null
}

function normalizeEnvValue(rawValue) {
  const value = rawValue.trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }

  return value.replace(/\s+#.*$/, '').trim()
}
