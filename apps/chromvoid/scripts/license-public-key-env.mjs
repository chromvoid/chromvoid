import fs from 'node:fs'
import path from 'node:path'

export const licensePublicKeyEnv = 'CHROMVOID_LICENSE_PUBLIC_KEY_ED25519_2026_01'

export function resolveLicensePublicKeyEnv({appRoot, env = process.env, onFileResolved} = {}) {
  if (!appRoot) {
    throw new Error('appRoot is required to resolve the license public key')
  }

  const resolvedEnv = {...env}
  const explicitValue = env[licensePublicKeyEnv]?.trim()
  if (explicitValue) {
    validateLicensePublicKey(explicitValue)
    resolvedEnv[licensePublicKeyEnv] = explicitValue
    return resolvedEnv
  }

  // An empty runtime variable would override a valid option_env! value in Core.
  delete resolvedEnv[licensePublicKeyEnv]

  for (const filePath of licensePublicKeyFiles(appRoot)) {
    if (!fs.existsSync(filePath)) continue

    const value = fs.readFileSync(filePath, 'utf8').trim()
    if (!value) continue

    validateLicensePublicKey(value)
    resolvedEnv[licensePublicKeyEnv] = value
    onFileResolved?.(filePath)
    break
  }

  return resolvedEnv
}

export function licensePublicKeyFiles(appRoot) {
  return [
    path.join(appRoot, 'src-tauri', 'gen', 'apple', '.license-public-key'),
    path.join(appRoot, 'src-tauri', 'gen', 'android', '.license-public-key'),
  ]
}

function validateLicensePublicKey(value) {
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) {
    throw new Error(`${licensePublicKeyEnv} must be base64/base64url encoded`)
  }

  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
  const bytes = Buffer.from(padded, 'base64')
  if (bytes.length !== 32) {
    throw new Error(
      `${licensePublicKeyEnv} must decode to a 32-byte Ed25519 public key, got ${bytes.length} bytes`,
    )
  }
}
