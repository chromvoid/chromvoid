import {describe, expect, it, vi} from 'vitest'

import {parseOtpAuthUri} from './otp-auth-uri'
import sharedCases from './otp-auth-uri-cases.json'

describe('parseOtpAuthUri', () => {
  it('parses a standard TOTP URI', () => {
    const result = parseOtpAuthUri(
      'otpauth://totp/GitHub:user%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&digits=6&period=30',
    )

    expect(result).toEqual({
      ok: true,
      metadata: {issuer: 'GitHub', account: 'user@example.com'},
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

  it('parses a TOTP URI when Android WebView treats the custom scheme as path-only', () => {
    const NativeURL = URL
    class AndroidWebViewURL extends NativeURL {
      override get hostname(): string {
        return this.protocol === 'otpauth:' ? '' : super.hostname
      }
    }

    vi.stubGlobal('URL', AndroidWebViewURL)
    try {
      expect(
        parseOtpAuthUri(
          'otpauth://totp/ChromVoid%20Emulator:qr-test%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=ChromVoid%20Emulator',
        ),
      ).toMatchObject({
        ok: true,
        metadata: {issuer: 'ChromVoid Emulator', account: 'qr-test@example.com'},
        otp: {type: 'TOTP', secret: 'JBSWY3DPEHPK3PXP'},
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('parses an HOTP URI with counter', () => {
    const result = parseOtpAuthUri(
      'otpauth://hotp/YubiKey?secret=JBSWY3DPEHPK3PXP&counter=7&algorithm=SHA256&digits=8',
    )

    expect(result).toEqual({
      ok: true,
      metadata: {issuer: '', account: 'YubiKey'},
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

    const sha384 = parseOtpAuthUri('otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP&algorithm=SHA384')

    expect(sha384).toMatchObject({ok: false, code: 'unsupported_algorithm'})
  })

  it('rejects missing secret', () => {
    const result = parseOtpAuthUri('otpauth://totp/Test?issuer=Test')

    expect(result).toMatchObject({ok: false, code: 'missing_secret'})
  })

  it('rejects ambiguous authority, fragments, and duplicate security parameters', () => {
    for (const [raw, code] of [
      ['otpauth://user@totp/Test?secret=ABC', 'invalid_authority'],
      ['otpauth://totp:123/Test?secret=ABC', 'invalid_authority'],
      ['otpauth://totp/Test?secret=ABC#fragment', 'fragment_not_allowed'],
      ['otpauth://totp/Test?secret=ABC&SECRET=DEF', 'duplicate_parameter'],
      ['otpauth://totp/Test?secret=ABC&digits=6&digits=8', 'duplicate_parameter'],
    ] as const) {
      expect(parseOtpAuthUri(raw)).toMatchObject({ok: false, code})
    }
  })

  it('enforces Core-compatible digits, TOTP period, counter, and size bounds', () => {
    expect(parseOtpAuthUri('otpauth://totp/Test?secret=ABC&digits=7')).toMatchObject({
      ok: false,
      code: 'invalid_digits',
    })
    expect(parseOtpAuthUri('otpauth://totp/Test?secret=ABC&period=9')).toMatchObject({
      ok: false,
      code: 'invalid_period',
    })
    expect(parseOtpAuthUri('otpauth://totp/Test?secret=ABC&period=121')).toMatchObject({
      ok: false,
      code: 'invalid_period',
    })
    expect(parseOtpAuthUri('otpauth://hotp/Test?secret=ABC&counter=-1')).toMatchObject({
      ok: false,
      code: 'invalid_counter',
    })
    expect(parseOtpAuthUri(`otpauth://totp/Test?secret=${'A'.repeat(4097)}`)).toMatchObject({
      ok: false,
      code: 'secret_too_long',
    })
    expect(parseOtpAuthUri(`otpauth://totp/${'A'.repeat(257)}?secret=ABC`)).toMatchObject({
      ok: false,
      code: 'label_too_long',
    })
    expect(parseOtpAuthUri(`otpauth://totp/Test?secret=${'A'.repeat(16 * 1024)}`)).toMatchObject({
      ok: false,
      code: 'uri_too_long',
    })
  })

  it('ignores unknown parameters and exposes issuer/account review metadata', () => {
    const result = parseOtpAuthUri(
      'otpauth://totp/Acme:alice%40example.com?secret=ABC&issuer=Acme&image=https%3A%2F%2Fexample.com',
    )

    expect(result).toMatchObject({
      ok: true,
      metadata: {issuer: 'Acme', account: 'alice@example.com'},
      otp: {label: 'alice@example.com'},
    })
  })
})

describe('shared native setup-link compatibility', () => {
  it.each(sharedCases)('preserves $label settings and review metadata', (item) => {
    const result = parseOtpAuthUri(item.uri)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.code)
    expect(result.metadata).toEqual({issuer: item.issuer, account: item.account})
    expect(result.otp).toMatchObject({
      label: item.label,
      type: item.type,
      algorithm: item.algorithm,
      digits: item.digits,
      period: item.period,
    })
    expect(result.otp.counter === undefined ? null : String(result.otp.counter)).toBe(item.counter)
  })
})
