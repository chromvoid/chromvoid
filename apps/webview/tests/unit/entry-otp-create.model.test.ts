import {afterEach, describe, expect, it, vi} from 'vitest'

import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {PMEntryOtpCreateModel} from '../../src/features/passmanager/components/card/entry-otp-create/entry-otp-create.model'
import {
  OtpQrNativeScanError,
  type OtpQrScannerPort,
} from '../../src/features/passmanager/components/card/entry-otp-create/entry-otp-native-scanner.service'

function createScannerPort(overrides: Partial<OtpQrScannerPort> = {}): OtpQrScannerPort {
  return {
    isAvailable: vi.fn(() => true),
    scanOtpQr: vi.fn(),
    cancelOtpQr: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('PMEntryOtpCreateModel', () => {
  afterEach(() => {
    resetRuntimeCapabilities()
  })

  it('groups base32 secret for display and keeps normalized save value', () => {
    const model = new PMEntryOtpCreateModel()

    const formatted = model.setSecret('jbsw y3dp ehpk 3pxp')

    expect(formatted).toBe('JBSW Y3DP EHPK 3PXP')
    expect(model.secretInput()).toBe('JBSW Y3DP EHPK 3PXP')
    expect(model.secret()).toBe('JBSWY3DPEHPK3PXP')
    expect(model.getFormData().secret).toBe('JBSWY3DPEHPK3PXP')
  })

  it('pastes and normalizes a secret through the model clipboard port', async () => {
    const clipboard = {
      readText: vi.fn(async () => 'jbsw y3dp ehpk 3pxp'),
    }
    const model = new PMEntryOtpCreateModel(createScannerPort(), clipboard)

    const normalized = await model.actions.pasteSecretFromClipboard()

    expect(clipboard.readText).toHaveBeenCalledTimes(1)
    expect(normalized).toBe('JBSW Y3DP EHPK 3PXP')
    expect(model.secretInput()).toBe('JBSW Y3DP EHPK 3PXP')
    expect(model.secret()).toBe('JBSWY3DPEHPK3PXP')
  })

  it('does not change the secret when clipboard is empty', async () => {
    const clipboard = {
      readText: vi.fn(async () => ''),
    }
    const model = new PMEntryOtpCreateModel(createScannerPort(), clipboard)
    model.setSecret('AABBCCDD')

    const normalized = await model.actions.pasteSecretFromClipboard()

    expect(normalized).toBe('')
    expect(model.secret()).toBe('AABBCCDD')
  })

  it('does not change the secret when clipboard read fails', async () => {
    const clipboard = {
      readText: vi.fn(async () => {
        throw new Error('clipboard denied')
      }),
    }
    const model = new PMEntryOtpCreateModel(createScannerPort(), clipboard)
    model.setSecret('AABBCCDD')

    const normalized = await model.actions.pasteSecretFromClipboard()

    expect(normalized).toBe('')
    expect(model.secret()).toBe('AABBCCDD')
  })

  it('flags invalid base32 characters without stripping them', () => {
    const model = new PMEntryOtpCreateModel()

    model.setSecret('JBSW ???')

    expect(model.secret()).toBe('JBSW???')
    expect(model.secretValidation().status).toBe('error')
    expect(model.canSubmit()).toBe(false)
  })

  it('validates secret as required', () => {
    const model = new PMEntryOtpCreateModel()

    const valid = model.validate()

    expect(valid).toBe(false)
    expect(model.secretError()).toBeTruthy()
    expect(model.canSubmit()).toBe(false)
  })

  it('uses Google preset values in form data', () => {
    const model = new PMEntryOtpCreateModel()
    model.setSecret('JBSWY3DPEHPK3PXP')
    model.setPreset('custom')
    model.setDigits(9)
    model.setPeriod(90)
    model.setPreset('googleAuth')

    const data = model.getFormData()

    expect(data.type).toBe('TOTP')
    expect(data.algorithm).toBe('SHA1')
    expect(data.encoding).toBe('base32')
    expect(data.digits).toBe(6)
    expect(data.period).toBe(30)
    expect(data.counter).toBeUndefined()
  })

  it('keeps custom advanced settings in form data', () => {
    const model = new PMEntryOtpCreateModel()
    model.setPreset('custom')
    model.setSecret('JBSWY3DPEHPK3PXP')
    model.setPeriod(45)
    model.setDigits(8)
    model.setAlgorithm('SHA512')
    model.setEncoding('base32')

    expect(model.getFormData()).toMatchObject({
      type: 'TOTP',
      algorithm: 'SHA512',
      digits: 8,
      period: 45,
      encoding: 'base32',
    })
  })

  it('returns HOTP counter in custom mode', () => {
    const model = new PMEntryOtpCreateModel()
    model.setPreset('custom')
    model.setOtpType('HOTP')
    model.setSecret('JBSWY3DPEHPK3PXP')
    model.setCounter(7)

    const data = model.getFormData()

    expect(data.type).toBe('HOTP')
    expect(data.counter).toBe(7)
  })

  it('applies a standard TOTP QR payload as Google Authenticator preset', () => {
    const model = new PMEntryOtpCreateModel()

    const applied = model.applyQrPayload(
      'otpauth://totp/GitHub:user%40example.com?secret=jbswy3dpehpk3pxp&issuer=GitHub&digits=6&period=30',
    )

    expect(applied).toBe(true)
    expect(model.qrScannerOpen()).toBe(false)
    expect(model.qrScannerError()).toBe('')
    expect(model.preset()).toBe('googleAuth')
    expect(model.secret()).toBe('JBSWY3DPEHPK3PXP')
    expect(model.label()).toBe('user@example.com')
    expect(model.getFormData()).toMatchObject({
      type: 'TOTP',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      encoding: 'base32',
    })
  })

  it('applies an HOTP QR payload as custom mode with counter', () => {
    const model = new PMEntryOtpCreateModel()

    const applied = model.applyQrPayload(
      'otpauth://hotp/YubiKey?secret=JBSWY3DPEHPK3PXP&algorithm=SHA256&digits=8&counter=12',
    )

    expect(applied).toBe(true)
    expect(model.preset()).toBe('custom')
    expect(model.getFormData()).toMatchObject({
      type: 'HOTP',
      algorithm: 'SHA256',
      digits: 8,
      counter: 12,
    })
  })

  it('applies a custom TOTP QR payload with period, digits, and algorithm', () => {
    const model = new PMEntryOtpCreateModel()

    const applied = model.applyQrPayload(
      'otpauth://totp/Work?secret=JBSWY3DPEHPK3PXP&algorithm=SHA512&digits=8&period=45',
    )

    expect(applied).toBe(true)
    expect(model.preset()).toBe('custom')
    expect(model.getFormData()).toMatchObject({
      type: 'TOTP',
      algorithm: 'SHA512',
      digits: 8,
      period: 45,
      encoding: 'base32',
    })
  })

  it('does not overwrite current secret when QR payload is invalid', () => {
    const model = new PMEntryOtpCreateModel()
    model.setSecret('AABBCCDD')

    const applied = model.applyQrPayload('otpauth://totp/Test?issuer=Test')

    expect(applied).toBe(false)
    expect(model.secret()).toBe('AABBCCDD')
    expect(model.qrScannerError()).toBeTruthy()
  })

  it('reports native QR scanner availability from runtime capabilities', () => {
    const scanner = createScannerPort()
    const model = new PMEntryOtpCreateModel(scanner)

    setRuntimeCapabilities({platform: 'macos', desktop: true})
    expect(model.qrScannerAvailable()).toBe(false)

    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_native_otp_qr_scan: true,
    })

    expect(model.qrScannerAvailable()).toBe(true)
  })

  it('applies native QR scan success payload and closes pending state', async () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_native_otp_qr_scan: true,
    })
    const scanner = createScannerPort({
      scanOtpQr: vi.fn(async () => (
        'otpauth://totp/GitHub:user%40example.com?secret=jbswy3dpehpk3pxp&issuer=GitHub&digits=6&period=30'
      )),
    })
    const model = new PMEntryOtpCreateModel(scanner)

    await model.openQrScanner()

    expect(scanner.scanOtpQr).toHaveBeenCalledWith(expect.stringMatching(/^otp-qr-|[0-9a-f-]{36}$/u))
    expect(model.qrScannerScanning()).toBe(false)
    expect(model.qrScannerOpen()).toBe(false)
    expect(model.qrScannerError()).toBe('')
    expect(model.secret()).toBe('JBSWY3DPEHPK3PXP')
    expect(model.label()).toBe('user@example.com')
  })

  it('leaves manual form untouched when native QR scan is cancelled', async () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_native_otp_qr_scan: true,
    })
    const scanner = createScannerPort({
      scanOtpQr: vi.fn(async () => {
        throw new OtpQrNativeScanError('cancelled', 'cancelled')
      }),
    })
    const model = new PMEntryOtpCreateModel(scanner)
    model.setSecret('JBSWY3DPEHPK3PXP')
    model.setLabel('Manual')

    await model.openQrScanner()

    expect(model.secret()).toBe('JBSWY3DPEHPK3PXP')
    expect(model.label()).toBe('Manual')
    expect(model.qrScannerScanning()).toBe(false)
    expect(model.qrScannerOpen()).toBe(false)
    expect(model.qrScannerError()).toBe('')
  })

  it('renders native QR permission and invalid errors through existing QR messages', async () => {
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
      supports_native_otp_qr_scan: true,
    })

    const permissionModel = new PMEntryOtpCreateModel(
      createScannerPort({
        scanOtpQr: vi.fn(async () => {
          throw new OtpQrNativeScanError('permission_denied', 'denied')
        }),
      }),
    )
    await permissionModel.openQrScanner()
    expect(permissionModel.qrScannerError()).toContain('Camera permission')

    const invalidModel = new PMEntryOtpCreateModel(
      createScannerPort({
        scanOtpQr: vi.fn(async () => 'not-an-otp-url'),
      }),
    )
    await invalidModel.openQrScanner()
    expect(invalidModel.qrScannerError()).toContain('valid OTP setup link')
  })

  it('resets with default label for the current entry', () => {
    const model = new PMEntryOtpCreateModel()

    model.reset({label: 'OpenAI'})

    expect(model.label()).toBe('OpenAI')
    expect(model.getFormData().label).toBe('OpenAI')
  })

  it('generates a TOTP preview for valid setup', () => {
    const model = new PMEntryOtpCreateModel()
    model.reset({label: 'OpenAI'})
    model.setSecret('JBSWY3DPEHPK3PXP')

    const preview = model.preview()

    expect(model.canSubmit()).toBe(true)
    expect(preview).not.toBeNull()
    expect(preview?.label).toBe('OpenAI')
    expect(preview?.code).toMatch(/^\d{3} \d{3}$/)
    expect(preview?.leftSeconds).toBeGreaterThanOrEqual(1)
    expect(preview?.leftSeconds).toBeLessThanOrEqual(30)
  })
})
