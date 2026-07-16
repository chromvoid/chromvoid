import {action, atom, computed, isAbort, withAbort, withAsync, wrap} from '@reatom/core'

import {DEFAULT_OPTIONS, parseOtpAuthUri, type OtpAuthUriParseErrorCode} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import {timer} from '@project/passmanager/timer'
import type {Algorithm, Encoding, OTPOptions, OTPType} from '@project/passmanager/types'
import {
  canScanOtpQrReactive,
  defaultOtpQrScannerPort,
  OtpQrNativeScanError,
  type OtpQrScannerPort,
} from './entry-otp-native-scanner.service'
import {
  defaultOtpClipboardPort,
  defaultOtpDraftPreviewPort,
  getCoreValidationErrorMessage,
  getCoreValidationKey,
  GOOGLE_PRESET,
  groupOtpCode,
  type OtpClipboardPort,
  type PMEntryOtpDraftPreviewPort,
  type PMEntryOtpPreview,
  type PMEntryOtpPreviewResource,
  type PMEntryOtpResetOptions,
  type PMEntryOtpSecretValidation,
} from './entry-otp-create.preview'

export type PMEntryOtpPreset = 'googleAuth' | 'custom'
export type PMEntryOtpCreateView = 'main' | 'advanced'
export {
  configurePMEntryOtpDraftPreviewPort,
  defaultOtpClipboardPort,
  defaultOtpDraftPreviewPort,
  PM_ENTRY_OTP_ALGORITHMS,
  PM_ENTRY_OTP_ENCODINGS,
} from './entry-otp-create.preview'
export type {
  OtpClipboardPort,
  PMEntryOtpDraftPreviewPort,
  PMEntryOtpPreview,
  PMEntryOtpResetOptions,
  PMEntryOtpSecretValidation,
} from './entry-otp-create.preview'

export class PMEntryOtpCreateModel {
  private qrScannerRunId = 0
  private qrScannerActiveScanId: string | null = null

  private readonly secretInputState = atom(
    DEFAULT_OPTIONS.secret ?? '',
    'passmanager.entryOtpCreate.secretInput',
  )
  private readonly secretTouchedState = atom(false, 'passmanager.entryOtpCreate.secretTouched')
  private readonly labelState = atom(DEFAULT_OPTIONS.label ?? '', 'passmanager.entryOtpCreate.label')
  private readonly otpTypeState = atom<OTPType>('TOTP', 'passmanager.entryOtpCreate.otpType')
  private readonly presetState = atom<PMEntryOtpPreset>('googleAuth', 'passmanager.entryOtpCreate.preset')
  private readonly periodState = atom(DEFAULT_OPTIONS.period ?? 30, 'passmanager.entryOtpCreate.period')
  private readonly digitsState = atom(DEFAULT_OPTIONS.digits ?? 6, 'passmanager.entryOtpCreate.digits')
  private readonly algorithmState = atom<Algorithm>(
    DEFAULT_OPTIONS.algorithm ?? 'SHA1',
    'passmanager.entryOtpCreate.algorithm',
  )
  private readonly encodingState = atom<Encoding>(
    DEFAULT_OPTIONS.encoding ?? 'base32',
    'passmanager.entryOtpCreate.encoding',
  )
  private readonly counterState = atom(0, 'passmanager.entryOtpCreate.counter')
  private readonly viewState = atom<PMEntryOtpCreateView>('main', 'passmanager.entryOtpCreate.view')

  private readonly secretErrorState = atom('', 'passmanager.entryOtpCreate.secretError')
  private readonly digitsErrorState = atom('', 'passmanager.entryOtpCreate.digitsError')
  private readonly periodErrorState = atom('', 'passmanager.entryOtpCreate.periodError')
  private readonly labelErrorState = atom('', 'passmanager.entryOtpCreate.labelError')
  private readonly counterErrorState = atom('', 'passmanager.entryOtpCreate.counterError')
  private readonly qrScannerOpenState = atom(false, 'passmanager.entryOtpCreate.qrScannerOpen')
  private readonly qrScannerScanningState = atom(false, 'passmanager.entryOtpCreate.qrScannerScanning')
  private readonly qrScannerErrorState = atom('', 'passmanager.entryOtpCreate.qrScannerError')
  private readonly secretValidationPendingKeyState = atom('', 'passmanager.entryOtpCreate.secretValidationPendingKey')
  private readonly previewResourceState = atom<PMEntryOtpPreviewResource | null>(
    null,
    'passmanager.entryOtpCreate.previewResource',
  )
  private readonly qrScannerAvailableState = computed(
    () => canScanOtpQrReactive() && this.qrScanner.isAvailable(),
    'passmanager.entryOtpCreate.qrScannerAvailable',
  )

  private readonly secretState = computed(
    () => this.normalizeSecretForSave(this.secretInputState()),
    'passmanager.entryOtpCreate.secret',
  )
  private readonly secretValidationState = computed(
    () => this.getSecretValidation(),
    'passmanager.entryOtpCreate.secretValidation',
  )
  private readonly canSubmitState = computed(() => this.isSubmittable(), 'passmanager.entryOtpCreate.canSubmit')
  private readonly previewState = computed(() => this.getPreview(), 'passmanager.entryOtpCreate.preview')

  readonly state = {
    secret: this.secretState,
    secretInput: this.secretInputState,
    secretValidation: this.secretValidationState,
    label: this.labelState,
    otpType: this.otpTypeState,
    preset: this.presetState,
    period: this.periodState,
    digits: this.digitsState,
    algorithm: this.algorithmState,
    encoding: this.encodingState,
    counter: this.counterState,
    view: this.viewState,
    secretError: this.secretErrorState,
    digitsError: this.digitsErrorState,
    periodError: this.periodErrorState,
    labelError: this.labelErrorState,
    counterError: this.counterErrorState,
    qrScannerOpen: this.qrScannerOpenState,
    qrScannerScanning: this.qrScannerScanningState,
    qrScannerError: this.qrScannerErrorState,
    qrScannerAvailable: this.qrScannerAvailableState,
    canSubmit: this.canSubmitState,
    preview: this.previewState,
  }

  readonly secret = this.secretState
  readonly secretInput = this.secretInputState
  readonly secretValidation = this.secretValidationState
  readonly label = this.labelState
  readonly otpType = this.otpTypeState
  readonly preset = this.presetState
  readonly period = this.periodState
  readonly digits = this.digitsState
  readonly algorithm = this.algorithmState
  readonly encoding = this.encodingState
  readonly counter = this.counterState
  readonly view = this.viewState
  readonly secretError = this.secretErrorState
  readonly digitsError = this.digitsErrorState
  readonly periodError = this.periodErrorState
  readonly labelError = this.labelErrorState
  readonly counterError = this.counterErrorState
  readonly qrScannerOpen = this.qrScannerOpenState
  readonly qrScannerScanning = this.qrScannerScanningState
  readonly qrScannerError = this.qrScannerErrorState
  readonly qrScannerAvailable = this.qrScannerAvailableState
  readonly canSubmit = this.canSubmitState
  readonly preview = this.previewState

  constructor(
    private readonly qrScanner: OtpQrScannerPort = defaultOtpQrScannerPort,
    private readonly clipboard: OtpClipboardPort = defaultOtpClipboardPort,
    private readonly previewPort: PMEntryOtpDraftPreviewPort = defaultOtpDraftPreviewPort,
  ) {}

  private readonly validateWithCoreAction = action(async (): Promise<boolean> => {
    const form = this.getFormData()
    const key = getCoreValidationKey(form)
    const localError = this.getLocalSecretError(form)

    this.previewResourceState.set(null)

    if (localError) {
      this.secretValidationPendingKeyState.set('')
      this.previewResourceState.set({
        key,
        status: 'error',
        message: localError,
      })
      return false
    }

    this.secretValidationPendingKeyState.set(key)

    try {
      const result = await wrap(
        this.previewPort.previewOTP({
          secret: form.secret ?? '',
          encoding: form.encoding,
          algorithm: form.algorithm,
          digits: form.digits,
          period: form.period,
          type: form.type ?? 'TOTP',
          counter: form.type === 'HOTP' ? (form.counter ?? 0) : undefined,
          ts: Math.floor(Date.now() / 1000),
        }),
      )
      this.previewResourceState.set({
        key,
        status: 'valid',
        preview: {
          label: form.label || i18n('otp:default:name'),
          code: groupOtpCode(result.otp),
          leftSeconds: result.leftSeconds,
          period: result.period,
        },
      })
      return true
    } catch (error) {
      if (isAbort(error)) throw error
      this.previewResourceState.set({
        key,
        status: 'error',
        message: getCoreValidationErrorMessage(error),
      })
      return false
    } finally {
      if (this.secretValidationPendingKeyState() === key) {
        this.secretValidationPendingKeyState.set('')
      }
    }
  }, 'passmanager.entryOtpCreate.validateWithCore').extend(withAbort(), withAsync({status: true}))

  readonly actions = {
    setSecret: action((value: string) => {
      const next = this.setSecretValue(value)
      this.requestCoreValidation()
      return next
    }, 'passmanager.entryOtpCreate.setSecret'),

    pasteSecretFromClipboard: action(async () => {
      let value = ''
      try {
        value = await wrap(this.clipboard.readText())
      } catch {
        return ''
      }

      if (!value) return ''
      const next = this.setSecretValue(value)
      this.requestCoreValidation()
      return next
    }, 'passmanager.entryOtpCreate.pasteSecretFromClipboard'),

    setLabel: action((value: string) => {
      this.labelState.set(value)
      this.labelErrorState.set('')
    }, 'passmanager.entryOtpCreate.setLabel'),

    setPeriod: action((value: number) => {
      const next = Number.isFinite(value) ? value : 30
      this.presetState.set('custom')
      this.periodState.set(next)
      this.periodErrorState.set('')
      this.requestCoreValidation()
    }, 'passmanager.entryOtpCreate.setPeriod'),

    setDigits: action((value: number) => {
      const next = Number.isFinite(value) ? value : 6
      this.presetState.set('custom')
      this.digitsState.set(next)
      this.digitsErrorState.set('')
      this.requestCoreValidation()
    }, 'passmanager.entryOtpCreate.setDigits'),

    setCounter: action((value: number) => {
      const next = Math.max(0, Number.isFinite(value) ? value : 0)
      this.counterState.set(next)
      this.counterErrorState.set('')
      this.requestCoreValidation()
    }, 'passmanager.entryOtpCreate.setCounter'),

    setPreset: action((value: PMEntryOtpPreset) => {
      this.presetState.set(value)
      this.secretInputState.set(this.formatSecretInput(this.secretInputState()))
      this.requestCoreValidation()
    }, 'passmanager.entryOtpCreate.setPreset'),

    setOtpType: action((value: OTPType) => {
      this.otpTypeState.set(value)
      this.requestCoreValidation()
    }, 'passmanager.entryOtpCreate.setOtpType'),

    openAdvanced: action(() => {
      this.viewState.set('advanced')
    }, 'passmanager.entryOtpCreate.openAdvanced'),

    closeAdvanced: action(() => {
      this.viewState.set('main')
    }, 'passmanager.entryOtpCreate.closeAdvanced'),

    setAlgorithm: action((value: Algorithm) => {
      this.presetState.set('custom')
      this.algorithmState.set(value)
      this.requestCoreValidation()
    }, 'passmanager.entryOtpCreate.setAlgorithm'),

    setEncoding: action((value: Encoding) => {
      this.presetState.set('custom')
      this.encodingState.set(value)
      this.secretInputState.set(this.formatSecretInput(this.secretInputState()))
      this.requestCoreValidation()
    }, 'passmanager.entryOtpCreate.setEncoding'),

    openQrScanner: action(async () => {
      await this.startQrScan()
    }, 'passmanager.entryOtpCreate.openQrScanner'),

    closeQrScanner: action(() => {
      this.cancelActiveQrScan()
      this.qrScannerOpenState.set(false)
      this.qrScannerScanningState.set(false)
      this.qrScannerErrorState.set('')
    }, 'passmanager.entryOtpCreate.closeQrScanner'),

    setQrScannerScanning: action((value: boolean) => {
      this.qrScannerScanningState.set(value)
    }, 'passmanager.entryOtpCreate.setQrScannerScanning'),

    setQrScannerError: action((value: string) => {
      this.qrScannerErrorState.set(value)
    }, 'passmanager.entryOtpCreate.setQrScannerError'),

    applyQrPayload: action((value: string) => {
      const result = parseOtpAuthUri(value, this.labelState())
      if (!result.ok) {
        this.qrScannerErrorState.set(this.getQrParseErrorMessage(result.code))
        return false
      }

      this.applyDraftValue(result.otp)
      return true
    }, 'passmanager.entryOtpCreate.applyQrPayload'),

    applyDraft: action((otp: OTPOptions) => {
      this.applyDraftValue(otp)
    }, 'passmanager.entryOtpCreate.applyDraft'),

    reset: action((options?: PMEntryOtpResetOptions) => {
      this.secretInputState.set(this.formatSecretInput(DEFAULT_OPTIONS.secret ?? ''))
      this.secretTouchedState.set(false)
      this.labelState.set(options?.label ?? DEFAULT_OPTIONS.label ?? '')
      this.otpTypeState.set('TOTP')
      this.presetState.set('googleAuth')
      this.periodState.set(DEFAULT_OPTIONS.period ?? 30)
      this.digitsState.set(DEFAULT_OPTIONS.digits ?? 6)
      this.algorithmState.set(DEFAULT_OPTIONS.algorithm ?? 'SHA1')
      this.encodingState.set(DEFAULT_OPTIONS.encoding ?? 'base32')
      this.counterState.set(0)
      this.viewState.set('main')
      this.resetErrors()
      this.qrScannerOpenState.set(false)
      this.qrScannerScanningState.set(false)
      this.qrScannerErrorState.set('')
      this.previewResourceState.set(null)
      this.secretValidationPendingKeyState.set('')
      this.validateWithCoreAction.abort('entry otp create reset')
      this.cancelActiveQrScan()
    }, 'passmanager.entryOtpCreate.reset'),

    setDefaultLabel: action((value: string) => {
      if (this.labelState().trim()) {
        return
      }

      this.labelState.set(value.trim())
    }, 'passmanager.entryOtpCreate.setDefaultLabel'),
  }

  getFormData(): OTPOptions {
    const isGoogleAuth = this.state.preset() === 'googleAuth'
    const type = this.state.otpType()

    return {
      id: '',
      secret: this.normalizeSecretForSave(this.state.secretInput()),
      label: this.state.label().trim(),
      type,
      algorithm: isGoogleAuth ? GOOGLE_PRESET.algorithm : this.state.algorithm(),
      digits: isGoogleAuth ? GOOGLE_PRESET.digits : this.state.digits(),
      period: isGoogleAuth ? GOOGLE_PRESET.period : this.state.period(),
      encoding: isGoogleAuth ? GOOGLE_PRESET.encoding : this.state.encoding(),
      counter: type === 'HOTP' ? this.state.counter() : undefined,
    }
  }

  validate(): boolean {
    this.resetErrors()
    this.secretTouchedState.set(true)

    const digits = this.state.digits()
    const period = this.state.period()
    const label = this.state.label()
    const counter = this.state.counter()
    const isCustom = this.state.preset() === 'custom'
    const isHOTP = this.state.otpType() === 'HOTP'
    const secretValidation = this.state.secretValidation()
    let ok = secretValidation.status === 'valid'

    if (secretValidation.status === 'error') {
      this.secretErrorState.set(secretValidation.message)
    }

    if (isCustom) {
      if (digits !== 6 && digits !== 8) {
        this.digitsErrorState.set(i18n('error:digits_range'))
        ok = false
      }

      if (!isHOTP && (!period || period < 10 || period > 120)) {
        this.periodErrorState.set(i18n('error:period_range'))
        ok = false
      }
    }

    if (isHOTP && counter < 0) {
      this.counterErrorState.set(i18n('error:counter_negative'))
      ok = false
    }

    if (label.length > 64) {
      this.labelErrorState.set(i18n('error:label_too_long'))
      ok = false
    }

    return ok
  }

  async validateWithCore(): Promise<boolean> {
    this.secretTouchedState.set(true)
    const ok = await this.validateWithCoreAction().catch((error) => {
      if (isAbort(error)) return false
      return false
    })
    return this.validate() && ok
  }

  setSecret(value: string): string {
    return this.actions.setSecret(value)
  }

  setLabel(value: string): void {
    this.actions.setLabel(value)
  }

  setPeriod(value: number): void {
    this.actions.setPeriod(value)
  }

  setDigits(value: number): void {
    this.actions.setDigits(value)
  }

  setCounter(value: number): void {
    this.actions.setCounter(value)
  }

  setPreset(value: PMEntryOtpPreset): void {
    this.actions.setPreset(value)
  }

  setOtpType(value: OTPType): void {
    this.actions.setOtpType(value)
  }

  setAlgorithm(value: Algorithm): void {
    this.actions.setAlgorithm(value)
  }

  setEncoding(value: Encoding): void {
    this.actions.setEncoding(value)
  }

  openQrScanner(): Promise<void> {
    return this.actions.openQrScanner()
  }

  closeQrScanner(): void {
    this.actions.closeQrScanner()
  }

  setQrScannerScanning(value: boolean): void {
    this.actions.setQrScannerScanning(value)
  }

  setQrScannerError(value: string): void {
    this.actions.setQrScannerError(value)
  }

  applyQrPayload(value: string): boolean {
    return this.actions.applyQrPayload(value)
  }

  applyDraft(otp: OTPOptions): void {
    this.actions.applyDraft(otp)
  }

  reset(options?: PMEntryOtpResetOptions): void {
    this.actions.reset(options)
  }

  setDefaultLabel(value: string): void {
    this.actions.setDefaultLabel(value)
  }

  private getSecretValidation(): PMEntryOtpSecretValidation {
    const secret = this.state.secret()
    const form = this.getFormData()
    const key = getCoreValidationKey(form)

    if (!secret) {
      if (!this.secretTouchedState() && !this.secretErrorState()) {
        return {
          status: 'idle',
          message: '',
        }
      }

      return {
        status: 'error',
        message: this.secretErrorState() || i18n('error:required'),
      }
    }

    const localError = this.getLocalSecretError(form)
    if (localError) {
      return {
        status: 'error',
        message: localError,
      }
    }

    if (this.secretValidationPendingKeyState() === key) {
      return {
        status: 'pending',
        message: '',
      }
    }

    const resource = this.previewResourceState()
    if (resource?.key !== key) {
      return {
        status: 'idle',
        message: '',
      }
    }

    if (resource.status === 'error') {
      return {
        status: 'error',
        message: resource.message,
      }
    }

    return {
      status: 'valid',
      message: i18n('otp:secret:valid'),
    }
  }

  private isSubmittable(): boolean {
    const secretValidation = this.state.secretValidation()
    if (secretValidation.status !== 'valid') {
      return false
    }

    if (this.getLabelError() || this.getCounterError()) {
      return false
    }

    if (this.state.preset() !== 'custom') {
      return true
    }

    return !this.getDigitsError() && !this.getPeriodError()
  }

  private getPreview(): PMEntryOtpPreview | null {
    if (this.state.secretValidation().status !== 'valid') {
      return null
    }

    timer()

    const form = this.getFormData()
    const resource = this.previewResourceState()
    if (resource?.key !== getCoreValidationKey(form) || resource.status !== 'valid') {
      return null
    }

    return {
      ...resource.preview,
      label: form.label || i18n('otp:default:name'),
    }
  }

  private normalizeSecretForSave(value: string): string {
    const currentEncoding = this.state.preset() === 'custom' ? this.state.encoding() : GOOGLE_PRESET.encoding
    const compact = value.replace(/\s+/g, '')
    if (currentEncoding !== 'base32') {
      return compact
    }

    return compact.toUpperCase()
  }

  private formatSecretInput(value: string): string {
    const currentEncoding = this.state.preset() === 'custom' ? this.state.encoding() : GOOGLE_PRESET.encoding
    if (currentEncoding !== 'base32') {
      return value.trim()
    }

    const compact = value.toUpperCase().replace(/\s+/g, '')
    let next = ''
    let groupLength = 0

    for (const char of compact) {
      if (groupLength === 4) {
        next += ' '
        groupLength = 0
      }
      next += char
      groupLength += 1
    }

    return next
  }

  private hasInvalidBase32Chars(secret: string): boolean {
    const currentEncoding = this.state.preset() === 'custom' ? this.state.encoding() : GOOGLE_PRESET.encoding
    return currentEncoding === 'base32' && !/^[A-Z2-7]+=*$/u.test(secret)
  }

  private getDigitsError(): string {
    const digits = this.state.digits()
    return digits !== 6 && digits !== 8 ? i18n('error:digits_range') : ''
  }

  private getPeriodError(): string {
    if (this.state.otpType() === 'HOTP') {
      return ''
    }

    const period = this.state.period()
    return !period || period < 10 || period > 120 ? i18n('error:period_range') : ''
  }

  private getCounterError(): string {
    return this.state.otpType() === 'HOTP' && this.state.counter() < 0 ? i18n('error:counter_negative') : ''
  }

  private getLabelError(): string {
    return this.state.label().length > 64 ? i18n('error:label_too_long') : ''
  }

  private getLocalSecretError(form: OTPOptions): string {
    const secret = form.secret ?? ''
    if (!secret) {
      return i18n('error:required')
    }

    if (this.hasInvalidBase32Chars(secret)) {
      return i18n('otp:secret:error:base32_chars')
    }

    return ''
  }

  private requestCoreValidation(): void {
    if (!this.state.secret()) {
      this.validateWithCoreAction.abort('entry otp secret empty')
      this.secretValidationPendingKeyState.set('')
      this.previewResourceState.set(null)
      return
    }

    void this.validateWithCoreAction().catch(() => undefined)
  }

  private resetErrors(): void {
    this.secretErrorState.set('')
    this.digitsErrorState.set('')
    this.periodErrorState.set('')
    this.labelErrorState.set('')
    this.counterErrorState.set('')
  }

  private async startQrScan(): Promise<void> {
    if (this.qrScannerScanningState()) return

    if (!this.qrScannerAvailableState()) {
      this.qrScannerErrorState.set(i18n('otp:qr:error:camera_unavailable'))
      return
    }

    const runId = ++this.qrScannerRunId
    const scanId = this.createQrScanId()
    this.qrScannerActiveScanId = scanId
    this.qrScannerOpenState.set(true)
    this.qrScannerScanningState.set(true)
    this.qrScannerErrorState.set('')

    try {
      const payload = await wrap(this.qrScanner.scanOtpQr(scanId))
      if (this.qrScannerRunId !== runId || this.qrScannerActiveScanId !== scanId) return

      const applied = this.actions.applyQrPayload(payload)
      if (!applied) {
        this.qrScannerOpenState.set(false)
        this.qrScannerScanningState.set(false)
      }
    } catch (error) {
      if (this.qrScannerRunId !== runId || this.qrScannerActiveScanId !== scanId) return
      if (error instanceof OtpQrNativeScanError && error.code === 'cancelled') {
        this.qrScannerErrorState.set('')
      } else {
        this.qrScannerErrorState.set(this.getQrScanErrorMessage(error))
      }
    } finally {
      if (this.qrScannerRunId === runId && this.qrScannerActiveScanId === scanId) {
        this.qrScannerActiveScanId = null
        this.qrScannerOpenState.set(false)
        this.qrScannerScanningState.set(false)
      }
    }
  }

  private cancelActiveQrScan(): void {
    const scanId = this.qrScannerActiveScanId
    if (!scanId) return

    this.qrScannerRunId += 1
    this.qrScannerActiveScanId = null
    void this.qrScanner.cancelOtpQr(scanId).catch(() => undefined)
  }

  private createQrScanId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }

    return `otp-qr-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }

  private getQrScanErrorMessage(error: unknown): string {
    if (error instanceof OtpQrNativeScanError) {
      if (error.code === 'permission_denied') {
        return i18n('otp:qr:error:permission')
      }
      if (error.code === 'unavailable') {
        return i18n('otp:qr:error:camera_unavailable')
      }
    }

    return i18n('otp:qr:error:invalid')
  }

  private isGoogleAuthPreset(otp: OTPOptions): boolean {
    return (
      (otp.type ?? 'TOTP') === 'TOTP' &&
      otp.algorithm === GOOGLE_PRESET.algorithm &&
      otp.digits === GOOGLE_PRESET.digits &&
      otp.period === GOOGLE_PRESET.period &&
      otp.encoding === GOOGLE_PRESET.encoding
    )
  }

  private getQrParseErrorMessage(code: OtpAuthUriParseErrorCode): string {
    if (code === 'missing_secret') {
      return i18n('otp:qr:error:missing_secret')
    }

    return i18n('otp:qr:error:invalid')
  }

  private applyDraftValue(otp: OTPOptions): void {
    const type = otp.type ?? 'TOTP'
    const preset = this.isGoogleAuthPreset(otp) ? 'googleAuth' : 'custom'

    this.presetState.set(preset)
    this.otpTypeState.set(type)
    this.algorithmState.set(otp.algorithm)
    this.encodingState.set(otp.encoding)
    this.digitsState.set(otp.digits)
    this.periodState.set(otp.period)
    this.counterState.set(otp.counter ?? 0)
    this.labelState.set(otp.label)
    this.secretInputState.set(this.formatSecretInput(otp.secret ?? ''))
    this.secretTouchedState.set(true)
    this.resetErrors()
    this.qrScannerErrorState.set('')
    this.qrScannerScanningState.set(false)
    this.qrScannerOpenState.set(false)
    this.requestCoreValidation()
  }

  private setSecretValue(value: string): string {
    const next = this.formatSecretInput(value)
    this.secretInputState.set(next)
    this.secretTouchedState.set(true)
    this.secretErrorState.set('')
    return next
  }
}
