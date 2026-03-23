import {state} from '@statx/core'

import {ALGORITHMS, DEFAULT_OPTIONS, ENCODINGS, i18n} from '@project/passmanager'
import type {Algorithm, Encoding, OTPOptions, OTPType} from '@project/passmanager'

const GOOGLE_PRESET = {
  algorithm: 'SHA1' as Algorithm,
  digits: 6,
  period: 30,
  encoding: 'base32' as Encoding,
}

export type PMEntryOtpPreset = 'googleAuth' | 'custom'

export class PMEntryOtpCreateModel {
  readonly secret = state(DEFAULT_OPTIONS.secret ?? '')
  readonly label = state(DEFAULT_OPTIONS.label ?? '')
  readonly otpType = state<OTPType>('TOTP')
  readonly preset = state<PMEntryOtpPreset>('googleAuth')
  readonly period = state(DEFAULT_OPTIONS.period ?? 30)
  readonly digits = state(DEFAULT_OPTIONS.digits ?? 6)
  readonly algorithm = state<Algorithm>(DEFAULT_OPTIONS.algorithm ?? 'SHA1')
  readonly encoding = state<Encoding>(DEFAULT_OPTIONS.encoding ?? 'base32')
  readonly counter = state(0)

  readonly secretError = state('')
  readonly digitsError = state('')
  readonly periodError = state('')
  readonly labelError = state('')
  readonly counterError = state('')

  getFormData(): OTPOptions {
    const isGoogleAuth = this.preset() === 'googleAuth'
    const type = this.otpType()

    return {
      id: '',
      secret: this.secret(),
      label: this.label(),
      type,
      algorithm: isGoogleAuth ? GOOGLE_PRESET.algorithm : this.algorithm(),
      digits: isGoogleAuth ? GOOGLE_PRESET.digits : this.digits(),
      period: isGoogleAuth ? GOOGLE_PRESET.period : this.period(),
      encoding: isGoogleAuth ? GOOGLE_PRESET.encoding : this.encoding(),
      counter: type === 'HOTP' ? this.counter() : undefined,
    }
  }

  validate(): boolean {
    let ok = true
    this.resetErrors()

    const secret = this.secret()
    const digits = this.digits()
    const period = this.period()
    const label = this.label()
    const counter = this.counter()
    const isCustom = this.preset() === 'custom'
    const isHOTP = this.otpType() === 'HOTP'

    if (!secret) {
      this.secretError.set(i18n('error:required'))
      ok = false
    }

    if (isCustom) {
      if (!digits || digits < 4 || digits > 10) {
        this.digitsError.set(i18n('error:digits_range'))
        ok = false
      }

      if (!isHOTP && (!period || period < 10 || period > 120)) {
        this.periodError.set(i18n('error:period_range'))
        ok = false
      }
    }

    if (isHOTP && counter < 0) {
      this.counterError.set(i18n('error:counter_negative'))
      ok = false
    }

    if (label.length > 64) {
      this.labelError.set(i18n('error:label_too_long'))
      ok = false
    }

    return ok
  }

  setSecret(value: string): string {
    const next = this.normalizeSecret(value)
    this.secret.set(next)
    this.secretError.set('')
    return next
  }

  setLabel(value: string): void {
    this.label.set(value)
    this.labelError.set('')
  }

  setPeriod(value: number): void {
    const next = Number.isFinite(value) ? value : 30
    this.period.set(next)
    this.periodError.set('')
  }

  setDigits(value: number): void {
    const next = Number.isFinite(value) ? value : 6
    this.digits.set(next)
    this.digitsError.set('')
  }

  setCounter(value: number): void {
    const next = Math.max(0, Number.isFinite(value) ? value : 0)
    this.counter.set(next)
    this.counterError.set('')
  }

  setPreset(value: PMEntryOtpPreset): void {
    this.preset.set(value)
  }

  setOtpType(value: OTPType): void {
    this.otpType.set(value)
  }

  setAlgorithm(value: Algorithm): void {
    this.algorithm.set(value)
  }

  setEncoding(value: Encoding): void {
    this.encoding.set(value)
  }

  reset(): void {
    this.secret.set(DEFAULT_OPTIONS.secret ?? '')
    this.label.set(DEFAULT_OPTIONS.label ?? '')
    this.otpType.set('TOTP')
    this.preset.set('googleAuth')
    this.period.set(DEFAULT_OPTIONS.period ?? 30)
    this.digits.set(DEFAULT_OPTIONS.digits ?? 6)
    this.algorithm.set(DEFAULT_OPTIONS.algorithm ?? 'SHA1')
    this.encoding.set(DEFAULT_OPTIONS.encoding ?? 'base32')
    this.counter.set(0)
    this.resetErrors()
  }

  private normalizeSecret(value: string): string {
    const currentEncoding = this.preset() === 'custom' ? this.encoding() : GOOGLE_PRESET.encoding
    if (currentEncoding !== 'base32') {
      return value
    }

    return value.toUpperCase().replace(/[^A-Z2-7=]/g, '')
  }

  private resetErrors(): void {
    this.secretError.set('')
    this.digitsError.set('')
    this.periodError.set('')
    this.labelError.set('')
    this.counterError.set('')
  }
}

export const PM_ENTRY_OTP_ALGORITHMS = ALGORITHMS
export const PM_ENTRY_OTP_ENCODINGS = ENCODINGS
