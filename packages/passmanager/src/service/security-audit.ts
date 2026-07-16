import {estimatePasswordStrength} from './utils'

export type CredentialAuditEntryInput = {
  id: string
  entryType: 'login' | 'payment_card'
  password?: string
  otpCount: number
}

export type CredentialAuditEntrySummary = {
  entryId: string
  weakPassword: boolean
  reusedPassword: boolean
  hasTwoFactor: boolean
  strengthScore: 0 | 1 | 2 | 3 | 4 | null
}

export const CREDENTIAL_SECURITY_AUDIT_ARTIFACT_VERSION = 1 as const
export const CREDENTIAL_SECURITY_AUDIT_ALGORITHM_VERSION = 1 as const

export type CredentialSecurityAuditArtifactV1 = {
  version: typeof CREDENTIAL_SECURITY_AUDIT_ARTIFACT_VERSION
  algorithmVersion: typeof CREDENTIAL_SECURITY_AUDIT_ALGORITHM_VERSION
  revision: string
  generatedAt: number
  entries: Record<string, CredentialAuditEntrySummary>
  failedEntryIds: string[]
}

export type CredentialAuditResult = {
  entries: ReadonlyMap<string, CredentialAuditEntrySummary>
  weakPasswordCount: number
  reusedPasswordCount: number
  twoFactorCount: number
}

const ARTIFACT_KEYS = [
  'version',
  'algorithmVersion',
  'revision',
  'generatedAt',
  'entries',
  'failedEntryIds',
] as const

const ENTRY_SUMMARY_KEYS = [
  'entryId',
  'weakPassword',
  'reusedPassword',
  'hasTwoFactor',
  'strengthScore',
] as const

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false

  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false

  return Reflect.ownKeys(value).every((key) => typeof key === 'string')
}

function hasExactKeys(
  value: unknown,
  expectedKeys: readonly string[],
): value is Record<string, unknown> {
  if (!isPlainRecord(value)) return false

  const keys = Reflect.ownKeys(value)
  return (
    keys.length === expectedKeys.length &&
    keys.every((key) => typeof key === 'string' && expectedKeys.includes(key))
  )
}

function isGeneratedAt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isStrengthScore(value: unknown): value is CredentialAuditEntrySummary['strengthScore'] {
  return (
    value === null ||
    (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 4)
  )
}

function parseEntrySummary(
  value: unknown,
  entryId: string,
): CredentialAuditEntrySummary | undefined {
  if (!hasExactKeys(value, ENTRY_SUMMARY_KEYS)) return undefined
  if (value['entryId'] !== entryId || entryId.length === 0) return undefined
  if (typeof value['weakPassword'] !== 'boolean') return undefined
  if (typeof value['reusedPassword'] !== 'boolean') return undefined
  if (typeof value['hasTwoFactor'] !== 'boolean') return undefined
  if (!isStrengthScore(value['strengthScore'])) return undefined

  const expectedWeakPassword = value['strengthScore'] !== null && value['strengthScore'] <= 1
  if (value['weakPassword'] !== expectedWeakPassword) return undefined

  return {
    entryId,
    weakPassword: value['weakPassword'],
    reusedPassword: value['reusedPassword'],
    hasTwoFactor: value['hasTwoFactor'],
    strengthScore: value['strengthScore'],
  }
}

/**
 * Parses the persisted audit cache without accepting data outside its public,
 * secret-free schema.
 */
export function parseCredentialSecurityAuditArtifact(
  value: unknown,
  expectedRevision?: string,
): CredentialSecurityAuditArtifactV1 | undefined {
  try {
    if (!hasExactKeys(value, ARTIFACT_KEYS)) return undefined
    if (value['version'] !== CREDENTIAL_SECURITY_AUDIT_ARTIFACT_VERSION) return undefined
    if (value['algorithmVersion'] !== CREDENTIAL_SECURITY_AUDIT_ALGORITHM_VERSION) return undefined
    if (typeof value['revision'] !== 'string' || value['revision'].length === 0) return undefined
    if (expectedRevision !== undefined && value['revision'] !== expectedRevision) return undefined
    if (!isGeneratedAt(value['generatedAt'])) return undefined
    if (!isPlainRecord(value['entries'])) return undefined
    if (!Array.isArray(value['failedEntryIds'])) return undefined

    const entries: Record<string, CredentialAuditEntrySummary> = {}
    for (const [entryId, candidate] of Object.entries(value['entries'])) {
      const summary = parseEntrySummary(candidate, entryId)
      if (!summary) return undefined
      Object.defineProperty(entries, entryId, {
        configurable: true,
        enumerable: true,
        value: summary,
        writable: true,
      })
    }

    const failedEntryIds: string[] = []
    const uniqueFailedEntryIds = new Set<string>()
    for (const entryId of value['failedEntryIds']) {
      if (typeof entryId !== 'string' || entryId.length === 0 || uniqueFailedEntryIds.has(entryId)) {
        return undefined
      }
      uniqueFailedEntryIds.add(entryId)
      failedEntryIds.push(entryId)
    }

    return {
      version: CREDENTIAL_SECURITY_AUDIT_ARTIFACT_VERSION,
      algorithmVersion: CREDENTIAL_SECURITY_AUDIT_ALGORITHM_VERSION,
      revision: value['revision'],
      generatedAt: value['generatedAt'],
      entries,
      failedEntryIds,
    }
  } catch {
    return undefined
  }
}

export function createCredentialAuditResult(
  entries: CredentialAuditEntryInput[],
): CredentialAuditResult {
  const passwordEntryIds = new Map<string, string[]>()
  const summaries = new Map<string, CredentialAuditEntrySummary>()

  for (const entry of entries) {
    const isLogin = entry.entryType === 'login'
    const password = isLogin ? entry.password : undefined
    const hasPassword = password !== undefined && password.length > 0
    const strengthScore = hasPassword ? estimatePasswordStrength(password).score : null

    if (hasPassword) {
      const ids = passwordEntryIds.get(password)
      if (ids) {
        ids.push(entry.id)
      } else {
        passwordEntryIds.set(password, [entry.id])
      }
    }

    summaries.set(entry.id, {
      entryId: entry.id,
      weakPassword: strengthScore !== null && strengthScore <= 1,
      reusedPassword: false,
      hasTwoFactor: isLogin && entry.otpCount > 0,
      strengthScore,
    })
  }

  for (const entryIds of passwordEntryIds.values()) {
    if (entryIds.length <= 1) continue

    for (const entryId of entryIds) {
      const summary = summaries.get(entryId)
      if (summary) summary.reusedPassword = true
    }
  }

  let weakPasswordCount = 0
  let reusedPasswordCount = 0
  let twoFactorCount = 0

  for (const summary of summaries.values()) {
    if (summary.weakPassword) weakPasswordCount += 1
    if (summary.reusedPassword) reusedPasswordCount += 1
    if (summary.hasTwoFactor) twoFactorCount += 1
  }

  return {
    entries: summaries,
    weakPasswordCount,
    reusedPasswordCount,
    twoFactorCount,
  }
}
