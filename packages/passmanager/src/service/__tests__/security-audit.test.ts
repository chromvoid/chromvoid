import {describe, expect, it} from 'vitest'

import {createCredentialAuditResult, type CredentialAuditEntryInput} from '../security-audit'

function loginEntry(overrides: Partial<CredentialAuditEntryInput> = {}): CredentialAuditEntryInput {
  return {
    id: 'login-1',
    entryType: 'login',
    password: 'CorrectHorseBatteryStaple!2026',
    otpCount: 0,
    ...overrides,
  }
}

function cardEntry(overrides: Partial<CredentialAuditEntryInput> = {}): CredentialAuditEntryInput {
  return {
    id: 'card-1',
    entryType: 'payment_card',
    password: '123',
    otpCount: 1,
    ...overrides,
  }
}

describe('createCredentialAuditResult()', () => {
  it('counts score 0 or 1 login passwords as weak', () => {
    const result = createCredentialAuditResult([
      loginEntry({id: 'score-0', password: 'abc'}),
      loginEntry({id: 'score-1', password: 'abcdefgh'}),
    ])

    expect(result.weakPasswordCount).toBe(2)
    expect(result.entries.get('score-0')).toMatchObject({
      weakPassword: true,
      strengthScore: 0,
    })
    expect(result.entries.get('score-1')).toMatchObject({
      weakPassword: true,
      strengthScore: 1,
    })
  })

  it('does not count score 2+ passwords as weak', () => {
    const result = createCredentialAuditResult([
      loginEntry({id: 'score-2', password: 'medium-pass-123'}),
      loginEntry({id: 'score-4', password: 'CorrectHorseBatteryStaple!2026'}),
    ])

    expect(result.weakPasswordCount).toBe(0)
    expect(result.entries.get('score-2')?.weakPassword).toBe(false)
    expect(result.entries.get('score-2')?.strengthScore).toBeGreaterThanOrEqual(2)
    expect(result.entries.get('score-4')).toMatchObject({
      weakPassword: false,
      strengthScore: 4,
    })
  })

  it('marks both login entries that share a non-empty password as reused', () => {
    const result = createCredentialAuditResult([
      loginEntry({id: 'first', password: 'same-password'}),
      loginEntry({id: 'second', password: 'same-password'}),
      loginEntry({id: 'third', password: 'unique-password'}),
    ])

    expect(result.reusedPasswordCount).toBe(2)
    expect(result.entries.get('first')?.reusedPassword).toBe(true)
    expect(result.entries.get('second')?.reusedPassword).toBe(true)
    expect(result.entries.get('third')?.reusedPassword).toBe(false)
  })

  it('does not mark a single password occurrence as reused', () => {
    const result = createCredentialAuditResult([loginEntry({id: 'only', password: 'single-password'})])

    expect(result.reusedPasswordCount).toBe(0)
    expect(result.entries.get('only')?.reusedPassword).toBe(false)
  })

  it('ignores empty and missing passwords for weak and reused counts', () => {
    const result = createCredentialAuditResult([
      loginEntry({id: 'empty-1', password: ''}),
      loginEntry({id: 'empty-2', password: ''}),
      loginEntry({id: 'missing', password: undefined}),
    ])

    expect(result.weakPasswordCount).toBe(0)
    expect(result.reusedPasswordCount).toBe(0)
    expect(result.entries.get('empty-1')).toMatchObject({
      weakPassword: false,
      reusedPassword: false,
      strengthScore: null,
    })
    expect(result.entries.get('missing')).toMatchObject({
      weakPassword: false,
      reusedPassword: false,
      strengthScore: null,
    })
  })

  it('ignores payment cards for weak, reused, and 2FA audit flags', () => {
    const result = createCredentialAuditResult([
      cardEntry({id: 'card-1', password: 'abc', otpCount: 2}),
      cardEntry({id: 'card-2', password: 'abc', otpCount: 1}),
    ])

    expect(result.weakPasswordCount).toBe(0)
    expect(result.reusedPasswordCount).toBe(0)
    expect(result.twoFactorCount).toBe(0)
    expect(result.entries.get('card-1')).toMatchObject({
      weakPassword: false,
      reusedPassword: false,
      hasTwoFactor: false,
      strengthScore: null,
    })
  })

  it('counts login entries with OTP metadata as 2FA entries', () => {
    const result = createCredentialAuditResult([
      loginEntry({id: 'with-otp', otpCount: 1}),
      loginEntry({id: 'without-otp', otpCount: 0}),
    ])

    expect(result.twoFactorCount).toBe(1)
    expect(result.entries.get('with-otp')?.hasTwoFactor).toBe(true)
    expect(result.entries.get('without-otp')?.hasTwoFactor).toBe(false)
  })

  it('does not expose password strings through serializable result data', () => {
    const password = 'serializable-secret-password'
    const result = createCredentialAuditResult([loginEntry({id: 'secret-entry', password})])
    const serialized = JSON.stringify({
      weakPasswordCount: result.weakPasswordCount,
      reusedPasswordCount: result.reusedPasswordCount,
      twoFactorCount: result.twoFactorCount,
      entries: Array.from(result.entries.entries()),
    })

    expect(serialized).not.toContain(password)
    expect(serialized).not.toContain('serializable-secret')
  })
})
