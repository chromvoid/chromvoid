import {action, atom, computed, isAbort, withAbort, withAsync, wrap} from '@reatom/core'
import type {Entry as PMCoreEntry} from '@project/passmanager/core'

import {HOTP, TOTP} from 'otpauth'

import {normalizeCredentialTags} from '@project/passmanager/tags'
import {i18n} from '@project/passmanager/i18n'
import {formatPasswordStrengthLabel} from '@project/passmanager/i18n/format'
import {estimatePasswordStrength, generatePassword} from '@project/passmanager/password-utils'
import type {IEntry, PassManagerEntryType, SshKeyType, UrlRule} from '@project/passmanager/types'
import {formatLink, isLink, transformUrls} from '@project/passmanager/urls'
import {passmanagerNavigationController} from '../../../passmanager-navigation.controller'
import type {AndroidPasswordSavePrefill} from 'root/features/passmanager/models/android-password-save-prefill'
import {pmCredentialTagsModel} from 'root/features/passmanager/models/pm-credential-tags.model'
import {getPassmanagerRoot} from 'root/features/passmanager/models/pm-root.adapter'
import {passmanagerSshKeygen} from 'root/features/passmanager/service/passmanager-ssh-keygen'
import {dialogService} from 'root/shared/services/dialog-service'
import {PMEntryOtpCreateModel} from '../entry-otp-create/entry-otp-create.model'
import {
  PMEntrySshCreateModel,
  type PMEntrySshCreateResult,
} from '../entry-ssh/entry-ssh-create.model'

function getInitialTargetGroupPath(): string | undefined {
  try {
    const route = passmanagerNavigationController.readRoute()
    return route.kind === 'create-entry' ? route.targetGroupPath : undefined
  } catch {
    return undefined
  }
}

export type PMEntryCreateSshResult = PMEntrySshCreateResult

export type PMEntryCreatePaymentCardField =
  | 'title'
  | 'cardholderName'
  | 'cardNumber'
  | 'expMonth'
  | 'expYear'
  | 'cardCvv'

export type PMEntryCreateValidationField =
  | 'title'
  | 'username'
  | 'password'
  | 'urls'
  | 'cardholderName'
  | 'cardNumber'
  | 'cardExpMonth'
  | 'cardExpYear'

export type PMEntryCreateSubmitResult =
  | {ok: true}
  | {
      ok: false
      reason:
        | 'missing_title'
        | 'missing_login_locator'
        | 'missing_password'
        | 'invalid_website'
        | 'invalid_otp'
        | 'invalid_ssh'
        | 'invalid_payment_card'
        | 'passmanager_unavailable'
      field?: PMEntryCreateValidationField
      message?: string
    }

function normalizeCardDigits(value: string): string {
  return value.replace(/\D+/g, '')
}

function deriveTitleFromWebsite(value: string): string {
  const firstUrl = transformUrls(value)[0]
  if (!firstUrl) return ''

  const normalized = formatLink(firstUrl)
  let host = ''
  try {
    host = new URL(normalized).hostname
  } catch {
    host = firstUrl.replace(/^https?:\/\//i, '').split('/')[0] ?? ''
  }

  const base = host.replace(/^www\./i, '').split('.')[0] ?? ''
  const lower = base.toLowerCase()
  if (lower === 'github') return 'GitHub'
  if (!base) return ''

  return base
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export class PMEntryCreateModel {
  readonly entryType = atom<PassManagerEntryType>('login')
  readonly title = atom('')
  readonly username = atom('')
  readonly password = atom('')
  readonly note = atom('')
  readonly urls = atom('')
  readonly website = this.urls
  readonly cardholderName = atom('')
  readonly cardNumber = atom('')
  readonly cardExpMonth = atom('')
  readonly cardExpYear = atom('')
  readonly cardCvv = atom('')

  readonly useOtp = atom(false, 'use-otp')
  readonly otp = new PMEntryOtpCreateModel()
  readonly otpSheetOpen = atom(false, 'passmanager.entryCreate.otpSheetOpen')
  readonly useNote = atom(false, 'use-note')

  readonly isEditingPassword = atom(false)
  readonly passwordStrengthScore = atom<number | null>(null)
  readonly passwordStrengthLabel = computed(() => {
    const score = this.passwordStrengthScore()
    return score === null ? '' : formatPasswordStrengthLabel(score as 0 | 1 | 2 | 3 | 4)
  })
  readonly hasStrength = computed(() => this.passwordStrengthScore() !== null)

  readonly iconRef = atom<string | undefined>(undefined)
  readonly avatarId = this.iconRef
  readonly targetGroupPath = atom<string | undefined>(getInitialTargetGroupPath())
  readonly tags = atom<string[]>([], 'passmanager.entryCreate.tags')
  readonly titleError = atom('')
  readonly usernameError = atom('')
  readonly websiteError = atom('')
  readonly passwordError = atom('')
  readonly cardholderNameError = atom('')
  readonly cardNumberError = atom('')
  readonly cardExpMonthError = atom('')
  readonly cardExpYearError = atom('')
  readonly titleWasAutofilled = atom(false)

  readonly useSsh = atom(false)
  readonly showSshGenerator = atom(false)
  readonly ssh = new PMEntrySshCreateModel()
  readonly sshSheetOpen = atom(false, 'passmanager.entryCreate.sshSheetOpen')
  readonly sshGenKeyType = this.ssh.keyType
  readonly sshGenComment = this.ssh.comment
  readonly sshGenName = this.ssh.name
  readonly sshGenerating = computed(
    () => this.generateSshForEntryAction.pending() > 0,
    'passmanager.entryCreate.sshGenerating',
  )
  readonly sshGenResult = this.ssh.result
  readonly isSubmitting = computed(
    () => this.submitAction.pending() > 0,
    'passmanager.entryCreate.isSubmitting',
  )
  readonly canSubmit = computed(() => {
    const title = this.title().trim()
    if (!title) return false

    if (this.entryType() === 'payment_card') {
      return Boolean(
        this.cardholderName().trim() &&
          normalizeCardDigits(this.cardNumber()) &&
          this.cardExpMonth().trim() &&
          this.cardExpYear().trim(),
      )
    }

    const website = this.website().trim()
    if (website && !this.isValidWebsiteList(website)) return false

    if (this.useOtp() && !this.otp.canSubmit()) {
      return false
    }

    if (this.useSsh() && !this.ssh.canSubmit()) {
      return false
    }

    return Boolean(this.password() && (this.username().trim() || website))
  }, 'passmanager.entryCreate.canSubmit')

  private submitPromise: Promise<PMEntryCreateSubmitResult> | undefined
  private generateSshPromise: Promise<void> | undefined

  private readonly submitAction = action(async (): Promise<PMEntryCreateSubmitResult> => {
    const passmanager = getPassmanagerRoot()
    if (!passmanager) {
      return {ok: false, reason: 'passmanager_unavailable'}
    }

    const title = this.title().trim()
    this.clearFormErrors()

    if (!title) {
      this.titleError.set(i18n('error:title_required'))
      return {ok: false, reason: 'missing_title', field: 'title'}
    }

    if (this.entryType() === 'payment_card') {
      const paymentCardMeta = this.buildPaymentCardMeta()
      if ('error' in paymentCardMeta) {
        return {
          ok: false,
          reason: 'invalid_payment_card',
          field: paymentCardMeta.field,
          message: paymentCardMeta.error,
        }
      }

      const entry = passmanager.createEntry(
        {
          title,
          entryType: 'payment_card',
          paymentCard: paymentCardMeta.value,
          iconRef: this.iconRef() || undefined,
          tags: this.tags(),
        },
        '',
        '',
        undefined,
      )

      if (entry) {
        await wrap(entry.flushPendingPersistence())

        const cardPanSaved = await wrap(entry.saveCardPan(normalizeCardDigits(this.cardNumber())))
        if (!cardPanSaved) {
          return {
            ok: false,
            reason: 'invalid_payment_card',
            message: i18n('payment-card:error-save-number'),
          }
        }

        const normalizedCvv = this.cardCvv().trim()
        const cardCvvSaved = await wrap(
          normalizedCvv ? entry.saveCardCvv(normalizedCvv) : entry.cleanCardCvv(),
        )
        if (!cardCvvSaved) {
          return {
            ok: false,
            reason: 'invalid_payment_card',
            message: i18n('payment-card:error-save-cvv'),
          }
        }
      }

      return {ok: true}
    }

    const loginFormError = this.validateLoginForm(title)
    if (loginFormError) {
      return loginFormError
    }

    if (this.useOtp() && !this.otp.validate()) {
      this.otpSheetOpen.set(true)
      return {
        ok: false,
        reason: 'invalid_otp',
        message: i18n('otp:secret:error:invalid'),
      }
    }

    if (this.useSsh() && !this.ssh.validate()) {
      this.sshSheetOpen.set(true)
      return {
        ok: false,
        reason: 'invalid_ssh',
        message: i18n('ssh:error:name_required'),
      }
    }

    const otp = this.useOtp() ? this.otp.getFormData() : undefined
    const otpError = this.validateOtp(otp)
    if (otpError) {
      return {
        ok: false,
        reason: 'invalid_otp',
        message: otpError,
      }
    }

    const rawUrls = this.urls().trim()
    const urls = this.buildUrlRules(rawUrls)

    const entryData: Partial<IEntry> = {
      entryType: 'login',
      title,
      username: this.username(),
      urls,
      iconRef: this.iconRef() || undefined,
      tags: this.tags(),
    }

    const entry = passmanager.createEntry(entryData, this.password(), this.note(), otp)
    if (entry && this.sshGenResult()) {
      await wrap(this.generateSshForEntry(entry))
    }

    return {ok: true}
  }, 'passmanager.entryCreate.submit').extend(withAbort('first-in-win'), withAsync({status: true}))

  private readonly generateSshForEntryAction = action(
    async (entry: PMCoreEntry): Promise<void> => {
      await wrap(entry.flushPendingPersistence())
      const ssh = this.ssh.getFormData()

      const generated = await wrap(
        passmanagerSshKeygen({
          entryId: entry.id,
          keyType: ssh.keyType,
          comment: ssh.comment,
        }),
      )

      await wrap(
        entry.updateSshKeys([
          {
            id: generated.key_id,
            type: generated.key_type as SshKeyType,
            fingerprint: generated.fingerprint,
            name: ssh.name,
            comment: ssh.comment,
          },
        ]),
      )

      this.ssh.setResult({
        keyId: generated.key_id,
        fingerprint: generated.fingerprint,
        publicKey: generated.public_key_openssh,
        keyType: generated.key_type as SshKeyType,
        name: ssh.name,
        comment: ssh.comment,
        pending: false,
      })
    },
    'passmanager.entryCreate.generateSshForEntry',
  ).extend(withAbort('first-in-win'), withAsync({status: true}))

  reset(): void {
    this.submitAction.abort('entry-create reset')
    this.generateSshForEntryAction.abort('entry-create reset')

    this.entryType.set('login')
    this.title.set('')
    this.username.set('')
    this.password.set('')
    this.note.set('')
    this.urls.set('')
    this.cardholderName.set('')
    this.cardNumber.set('')
    this.cardExpMonth.set('')
    this.cardExpYear.set('')
    this.cardCvv.set('')

    this.useOtp.set(false)
    this.otp.reset()
    this.otpSheetOpen.set(false)
    this.useNote.set(false)

    this.isEditingPassword.set(false)
    this.passwordStrengthScore.set(null)

    this.iconRef.set(undefined)
    this.tags.set([])
    this.clearFormErrors()
    this.titleWasAutofilled.set(false)

    this.useSsh.set(false)
    this.showSshGenerator.set(false)
    this.sshSheetOpen.set(false)
    this.ssh.reset()
    this.submitPromise = undefined
    this.generateSshPromise = undefined
  }

  setTitle(value: string): void {
    this.title.set(value)
    this.titleWasAutofilled.set(false)
    if (value.trim()) {
      this.titleError.set('')
    }
  }

  setEntryType(value: PassManagerEntryType): void {
    this.entryType.set(value)
  }

  setUsername(value: string): void {
    this.username.set(value)
    if (value.trim()) {
      this.usernameError.set('')
    }
  }

  setPassword(value: string): void {
    this.password.set(value)
    this.isEditingPassword.set(Boolean(value))
    this.updateStrength(value)
    if (value) {
      this.passwordError.set('')
    }
  }

  setUrls(value: string): void {
    this.urls.set(value)
    if (!value.trim() || this.isValidWebsiteList(value)) {
      this.websiteError.set('')
    }
  }

  setWebsite(value: string): void {
    this.setUrls(value)
    const nextTitle = deriveTitleFromWebsite(value)
    if (!nextTitle) return
    if (this.title().trim() && !this.titleWasAutofilled()) return

    this.title.set(nextTitle)
    this.titleWasAutofilled.set(true)
    this.titleError.set('')
  }

  setNote(value: string): void {
    this.note.set(value)
  }

  setUseNote(value: boolean): void {
    this.useNote.set(value)
  }

  setCardholderName(value: string): void {
    this.cardholderName.set(value)
    if (value.trim()) {
      this.cardholderNameError.set('')
    }
  }

  setCardNumber(value: string): void {
    this.cardNumber.set(value)
    if (normalizeCardDigits(value)) {
      this.cardNumberError.set('')
    }
  }

  setCardExpMonth(value: string): void {
    this.cardExpMonth.set(value)
    if (this.isValidCardExpMonth(value)) {
      this.cardExpMonthError.set('')
    }
  }

  setCardExpYear(value: string): void {
    this.cardExpYear.set(value)
    if (this.isValidCardExpYear(value)) {
      this.cardExpYearError.set('')
    }
  }

  setCardCvv(value: string): void {
    this.cardCvv.set(value)
  }

  setPaymentCardField(field: PMEntryCreatePaymentCardField, value: string): void {
    switch (field) {
      case 'title':
        this.setTitle(value)
        break
      case 'cardholderName':
        this.setCardholderName(value)
        break
      case 'cardNumber':
        this.setCardNumber(value)
        break
      case 'expMonth':
        this.setCardExpMonth(value)
        break
      case 'expYear':
        this.setCardExpYear(value)
        break
      case 'cardCvv':
        this.setCardCvv(value)
        break
    }
  }

  setUseOtp(value: boolean): void {
    this.useOtp.set(value)
  }

  openOtpSheet(): void {
    const title = this.title().trim()
    if (!this.useOtp()) {
      this.otp.reset({label: title})
    } else {
      this.otp.setDefaultLabel(title)
    }
    this.otpSheetOpen.set(true)
  }

  closeOtpSheet(): void {
    if (this.otp.qrScannerScanning()) {
      this.otpSheetOpen.set(true)
      return
    }

    this.otpSheetOpen.set(false)
    if (!this.otp.secret()) {
      this.useOtp.set(false)
    }
  }

  confirmOtpSheet(): boolean {
    this.otp.setDefaultLabel(this.title().trim())
    if (!this.otp.validate()) {
      return false
    }

    this.useOtp.set(true)
    this.otpSheetOpen.set(false)
    return true
  }

  disableOtp(): void {
    this.useOtp.set(false)
    this.otpSheetOpen.set(false)
    this.otp.reset()
  }

  setIconRef(value: string | undefined): void {
    this.iconRef.set(value)
  }

  setTags(value: unknown): void {
    this.tags.set(normalizeCredentialTags(value))
  }

  setTagsFromKeys(keys: readonly string[]): void {
    this.setTags(pmCredentialTagsModel.resolveLabelsFromTagKeys(keys, this.tags()))
  }

  setUseSsh(value: boolean): void {
    this.useSsh.set(value)
    if (value) {
      this.ssh.setDefaultEntry({entryTitle: this.title().trim(), username: this.username().trim()})
      this.showSshGenerator.set(true)
      return
    }

    this.showSshGenerator.set(false)
    this.sshSheetOpen.set(false)
    this.ssh.reset()
  }

  setSshKeyType(value: SshKeyType): void {
    this.ssh.setKeyType(value)
  }

  setSshName(value: string): void {
    this.ssh.setName(value)
  }

  setSshComment(value: string): void {
    this.ssh.setComment(value)
  }

  openSshSheet(): void {
    if (!this.useSsh()) {
      this.ssh.reset({entryTitle: this.title().trim(), username: this.username().trim()})
    } else {
      this.ssh.setDefaultEntry({entryTitle: this.title().trim(), username: this.username().trim()})
    }
    this.sshSheetOpen.set(true)
  }

  closeSshSheet(): void {
    this.sshSheetOpen.set(false)
    if (!this.useSsh()) {
      this.ssh.reset()
    }
  }

  confirmSshSheet(): boolean {
    this.ssh.setDefaultEntry({entryTitle: this.title().trim(), username: this.username().trim()})
    if (!this.ssh.validate()) {
      return false
    }

    this.useSsh.set(true)
    this.showSshGenerator.set(true)
    this.ssh.setPending()
    this.sshSheetOpen.set(false)
    return true
  }

  disableSsh(): void {
    this.setUseSsh(false)
  }

  requestSshGeneration(): void {
    this.ssh.setDefaultEntry({entryTitle: this.title().trim(), username: this.username().trim()})
    if (!this.ssh.validate()) {
      this.sshSheetOpen.set(true)
      return
    }
    this.useSsh.set(true)
    this.showSshGenerator.set(true)
    this.ssh.setPending()
  }

  generatePassword(): void {
    this.setPassword(generatePassword())
  }

  applyPrefill(prefill: AndroidPasswordSavePrefill): void {
    const title = prefill.title.trim()
    if (title) {
      this.setTitle(title)
    }
    if (prefill.username.trim()) {
      this.setUsername(prefill.username.trim())
    }
    if (prefill.password) {
      this.setPassword(prefill.password)
    }
    if (prefill.urls.trim()) {
      this.setWebsite(prefill.urls.trim())
    }
  }

  async submit(): Promise<PMEntryCreateSubmitResult> {
    if (this.submitPromise) {
      return this.submitPromise
    }

    const promise = this.submitAction()
      .then(async (result) => {
        if (
          !result.ok &&
          !result.field &&
          (result.reason === 'invalid_otp' ||
            result.reason === 'invalid_ssh' ||
            result.reason === 'invalid_payment_card')
        ) {
          await dialogService
            .showAlertDialog({
              title: i18n('error:save'),
              message: result.message ?? '',
              variant: 'danger',
            })
            .catch(() => {})
        }
        return result
      })
      .catch((error) => {
        if (isAbort(error)) {
          return {ok: true} as PMEntryCreateSubmitResult
        }

        throw error
      })
      .finally(() => {
        if (this.submitPromise === promise) {
          this.submitPromise = undefined
        }
      })

    this.submitPromise = promise
    return promise
  }

  private validateOtp(otp: ReturnType<PMEntryOtpCreateModel['getFormData']> | undefined): string | null {
    if (!otp) {
      return null
    }

    try {
      if (otp.type === 'HOTP') {
        new HOTP(otp)
      } else {
        new TOTP(otp)
      }

      return null
    } catch (error) {
      if (error instanceof Error) {
        return error.message
      }

      return String(error)
    }
  }

  private buildUrlRules(rawUrls: string): UrlRule[] {
    if (!rawUrls) {
      return []
    }

    return transformUrls(rawUrls).map((value) => ({value: formatLink(value), match: 'base_domain'}))
  }

  private clearFormErrors(): void {
    this.titleError.set('')
    this.usernameError.set('')
    this.websiteError.set('')
    this.passwordError.set('')
    this.cardholderNameError.set('')
    this.cardNumberError.set('')
    this.cardExpMonthError.set('')
    this.cardExpYearError.set('')
  }

  private isValidWebsiteList(value: string): boolean {
    return transformUrls(value).every((url) => isLink(url))
  }

  private validateLoginForm(title: string): PMEntryCreateSubmitResult | null {
    this.clearFormErrors()

    if (!title) {
      this.titleError.set(i18n('error:title_required'))
      return {ok: false, reason: 'missing_title', field: 'title'}
    }

    const rawUrls = this.website().trim()
    if (rawUrls && !this.isValidWebsiteList(rawUrls)) {
      this.websiteError.set(i18n('error:valid_website_required'))
      return {ok: false, reason: 'invalid_website', field: 'urls'}
    }

    if (!this.username().trim() && !rawUrls) {
      this.usernameError.set(i18n('error:username_or_website_required'))
      return {ok: false, reason: 'missing_login_locator', field: 'username'}
    }

    if (!this.password()) {
      this.passwordError.set(i18n('error:password_required'))
      return {ok: false, reason: 'missing_password', field: 'password'}
    }

    return null
  }

  private buildPaymentCardMeta():
    | {value: NonNullable<Extract<IEntry, {entryType: 'payment_card'}>['paymentCard']>}
    | {error: string; field: PMEntryCreateValidationField} {
    const cardholderName = this.cardholderName().trim()
    if (!cardholderName) {
      const error = i18n('payment-card:error-cardholder-required')
      this.cardholderNameError.set(error)
      return {error, field: 'cardholderName'}
    }

    const cardPan = normalizeCardDigits(this.cardNumber())
    if (!cardPan) {
      const error = i18n('payment-card:error-number-required')
      this.cardNumberError.set(error)
      return {error, field: 'cardNumber'}
    }

    const expMonth = Number.parseInt(this.cardExpMonth().trim(), 10)
    const expYear = Number.parseInt(this.cardExpYear().trim(), 10)
    if (!this.isValidCardExpMonth(this.cardExpMonth())) {
      const error = i18n('payment-card:error-exp-month')
      this.cardExpMonthError.set(error)
      return {error, field: 'cardExpMonth'}
    }

    if (!this.isValidCardExpYear(this.cardExpYear())) {
      const error = i18n('payment-card:error-exp-year')
      this.cardExpYearError.set(error)
      return {error, field: 'cardExpYear'}
    }

    return {
      value: {
        cardholderName,
        expMonth,
        expYear,
        brand: 'unknown',
        last4: cardPan.slice(-4) || undefined,
      },
    }
  }

  private isValidCardExpMonth(value: string): boolean {
    const expMonth = Number.parseInt(value.trim(), 10)
    return Number.isInteger(expMonth) && expMonth >= 1 && expMonth <= 12
  }

  private isValidCardExpYear(value: string): boolean {
    const expYear = Number.parseInt(value.trim(), 10)
    return Number.isInteger(expYear) && expYear >= 2000 && expYear <= 9999
  }

  private updateStrength(value: string): void {
    if (!value) {
      this.passwordStrengthScore.set(null)
      return
    }

    try {
      const strength = estimatePasswordStrength(value)
      this.passwordStrengthScore.set(strength.score)
    } catch (error) {
      console.warn('[entry-create] failed to estimate password strength', error)
    }
  }

  private async generateSshForEntry(
    entry: PMCoreEntry,
  ): Promise<void> {
    if (this.generateSshPromise) {
      return this.generateSshPromise
    }

    const promise = this.generateSshForEntryAction(entry)
      .catch((error) => {
        if (!isAbort(error)) {
          console.warn('[ssh] failed to generate key on create', error)
        }
      })
      .finally(() => {
        if (this.generateSshPromise === promise) {
          this.generateSshPromise = undefined
        }
      })

    this.generateSshPromise = promise
    return promise
  }
}
