import {ALGORITHMS, ENCODINGS} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import type {Algorithm, Encoding, OTPOptions, OTPPreviewParams, OTPPreviewResult} from '@project/passmanager/types'

export const GOOGLE_PRESET = {
  algorithm: 'SHA1' as Algorithm,
  digits: 6,
  period: 30,
  encoding: 'base32' as Encoding,
}

export type PMEntryOtpSecretValidation = {
  status: 'idle' | 'pending' | 'valid' | 'error'
  message: string
}

export type PMEntryOtpPreview = {
  label: string
  code: string
  leftSeconds: number
  period: number
}

export type PMEntryOtpResetOptions = {
  label?: string
}

export type OtpClipboardPort = {
  readText(): Promise<string>
}

export type PMEntryOtpDraftPreviewPort = {
  previewOTP(data: OTPPreviewParams): Promise<OTPPreviewResult>
}

export type PMEntryOtpPreviewResource =
  | {
      key: string
      status: 'valid'
      preview: PMEntryOtpPreview
    }
  | {
      key: string
      status: 'error'
      message: string
    }

export const defaultOtpClipboardPort: OtpClipboardPort = {
  async readText(): Promise<string> {
    return (await navigator.clipboard?.readText?.()) ?? ''
  },
}

let configuredOtpDraftPreviewPort: PMEntryOtpDraftPreviewPort = {
  async previewOTP(): Promise<OTPPreviewResult> {
    throw new Error('OTP preview port is not configured')
  },
}

export function configurePMEntryOtpDraftPreviewPort(port: PMEntryOtpDraftPreviewPort): void {
  configuredOtpDraftPreviewPort = port
}

export const defaultOtpDraftPreviewPort: PMEntryOtpDraftPreviewPort = {
  previewOTP(data: OTPPreviewParams): Promise<OTPPreviewResult> {
    return configuredOtpDraftPreviewPort.previewOTP(data)
  },
}

export function getCoreValidationKey(form: OTPOptions): string {
  return JSON.stringify({
    secret: form.secret ?? '',
    encoding: form.encoding,
    algorithm: form.algorithm,
    digits: form.digits,
    period: form.period,
    type: form.type ?? 'TOTP',
    counter: form.type === 'HOTP' ? (form.counter ?? 0) : null,
  })
}

export function getCoreValidationErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/digits/i.test(message)) {
    return i18n('error:digits_range')
  }
  if (/period/i.test(message)) {
    return i18n('error:period_range')
  }
  if (/counter/i.test(message)) {
    return i18n('error:counter_negative')
  }
  return i18n('otp:secret:error:invalid')
}

export function groupOtpCode(value: string): string {
  if (value.length <= 3) {
    return value
  }

  return value.replace(/(.{3})(?=.)/g, '$1 ')
}

export const PM_ENTRY_OTP_ALGORITHMS = ALGORITHMS
export const PM_ENTRY_OTP_ENCODINGS = ENCODINGS
