import {beforeEach, describe, it} from 'node:test'
import assert from 'node:assert/strict'

import {setLang} from './i18n'
import {otpDisplayLabel, pickOtp} from './otp-selection'

type FakeOtp = {
  id: string
  label?: string
}

describe('popup otp selection', () => {
  beforeEach(() => {
    setLang('en')
  })

  it('picks selected otp when id exists', () => {
    const otps: FakeOtp[] = [
      {id: 'otp-1', label: 'Primary'},
      {id: 'otp-2', label: 'Work'},
    ]

    const selected = pickOtp(otps, 'otp-2')
    assert.equal(selected?.id, 'otp-2')
  })

  it('falls back to first otp when selected id missing', () => {
    const otps: FakeOtp[] = [
      {id: 'otp-1', label: 'Primary'},
      {id: 'otp-2', label: 'Work'},
    ]

    const selected = pickOtp(otps, 'missing')
    assert.equal(selected?.id, 'otp-1')
  })

  it('returns undefined when otp list is empty', () => {
    const selected = pickOtp<FakeOtp>([], 'otp-1')
    assert.equal(selected, undefined)
  })

  it('builds fallback labels when otp label is empty', () => {
    const otp: FakeOtp = {id: 'otp-1', label: '  '}
    assert.equal(otpDisplayLabel(otp, 1), 'OTP 2')
  })
})
