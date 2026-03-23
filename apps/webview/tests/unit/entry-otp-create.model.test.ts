import {describe, expect, it} from 'vitest'

import {PMEntryOtpCreateModel} from '../../src/features/passmanager/components/card/entry-otp-create/entry-otp-create.model'

describe('PMEntryOtpCreateModel', () => {
  it('normalizes base32 secret by default', () => {
    const model = new PMEntryOtpCreateModel()

    const normalized = model.setSecret('ab!2 c7=+')

    expect(normalized).toBe('AB2C7=')
    expect(model.secret()).toBe('AB2C7=')
  })

  it('validates secret as required', () => {
    const model = new PMEntryOtpCreateModel()

    const valid = model.validate()

    expect(valid).toBe(false)
    expect(model.secretError()).toBeTruthy()
  })

  it('uses Google preset values in form data', () => {
    const model = new PMEntryOtpCreateModel()
    model.setSecret('AABBCCDD')
    model.setDigits(9)
    model.setPeriod(90)

    const data = model.getFormData()

    expect(data.type).toBe('TOTP')
    expect(data.algorithm).toBe('SHA1')
    expect(data.encoding).toBe('base32')
    expect(data.digits).toBe(6)
    expect(data.period).toBe(30)
    expect(data.counter).toBeUndefined()
  })

  it('returns HOTP counter in custom mode', () => {
    const model = new PMEntryOtpCreateModel()
    model.setPreset('custom')
    model.setOtpType('HOTP')
    model.setSecret('AABBCCDD')
    model.setCounter(7)

    const data = model.getFormData()

    expect(data.type).toBe('HOTP')
    expect(data.counter).toBe(7)
  })
})
