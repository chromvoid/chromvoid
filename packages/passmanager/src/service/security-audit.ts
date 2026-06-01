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

export type CredentialAuditResult = {
  entries: ReadonlyMap<string, CredentialAuditEntrySummary>
  weakPasswordCount: number
  reusedPasswordCount: number
  twoFactorCount: number
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
