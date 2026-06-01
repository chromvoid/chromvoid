import {describe, expect, it} from 'vitest'

import {parseOtpAuthUri} from './otp-auth-uri'

describe('parseOtpAuthUri', () => {
  it('parses a standard TOTP URI', () => {
    const result = parseOtpAuthUri(
      'otpauth://totp/GitHub:user%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&digits=6&period=30',
    )

    expect(result).toEqual({
      ok: true,
      otp: {
        id: '',
        secret: 'JBSWY3DPEHPK3PXP',
        label: 'user@example.com',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        encoding: 'base32',
        type: 'TOTP',
      },
    })
  })

  it('parses an HOTP URI with counter', () => {
    const result = parseOtpAuthUri(
      'otpauth://hotp/YubiKey?secret=JBSWY3DPEHPK3PXP&counter=7&algorithm=SHA256&digits=8',
    )

    expect(result).toEqual({
      ok: true,
      otp: {
        id: '',
        secret: 'JBSWY3DPEHPK3PXP',
        label: 'YubiKey',
        algorithm: 'SHA256',
        digits: 8,
        period: 30,
        encoding: 'base32',
        type: 'HOTP',
        counter: 7,
      },
    })
  })

  it('uses fallback label when URI has no label', () => {
    const result = parseOtpAuthUri('otpauth://totp/?secret=JBSWY3DPEHPK3PXP', 'Fallback')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.otp.label).toBe('Fallback')
    }
  })

  it('rejects unsupported algorithm', () => {
    const result = parseOtpAuthUri('otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP&algorithm=MD5')

    expect(result).toMatchObject({ok: false, code: 'unsupported_algorithm'})
  })

  it('rejects missing secret', () => {
    const result = parseOtpAuthUri('otpauth://totp/Test?issuer=Test')

    expect(result).toMatchObject({ok: false, code: 'missing_secret'})
  })
})
