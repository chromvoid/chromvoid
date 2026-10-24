import {action, atom, computed, isAbort, withAbort, withAsync, wrap} from '@reatom/core'
import {Group} from '@project/passmanager/core'

import {normalizeCredentialTags} from '@project/passmanager/tags'
import {i18n} from '@project/passmanager/i18n'
import {formatPasswordStrengthLabel} from '@project/passmanager/i18n/format'
import {estimatePasswordStrength, generatePassword} from '@project/passmanager/password-utils'
import type {IEntry, PassManagerEntryType, UrlRule} from '@project/passmanager/types'
import {formatLink} from '@project/passmanager/urls'
import {passmanagerNavigationController} from '../../../passmanager-navigation.controller'
import {pmCredentialTagsModel} from 'root/features/passmanager/models/pm-credential-tags.model'
import {getPassmanagerRoot} from 'root/features/passmanager/models/pm-root.adapter'
import {dialogService} from 'root/shared/services/dialog-service'
import {isPaymentCardExpYearInput, parsePaymentCardExpYearInput} from '../payment-card-expiry'
import {PMEntryOtpCreateModel} from '../entry-otp-create/entry-otp-create.model'
import {PMEntryWebsiteEditorModel} from '../entry-website-editor/entry-website-editor.model'
const LOGIN_OPTIONAL_DETAILS = ['icon', 'tags', 'otp', 'note'] as const
const PAYMENT_CARD_OPTIONAL_DETAILS = ['icon', 'tags'] as const

export type PMEntryCreateOptionalDetail = (typeof LOGIN_OPTIONAL_DETAILS)[number]
export type PMEntryCreateDetailsView = 'hub' | PMEntryCreateOptionalDetail

export type PMEntryCreateTargetOption = {
  id: string
  label: string
}

export type PMEntryCreateValidationField =
  | 'title'
  | 'username'
  | 'password'
  | 'urls'
  | 'cardholderName'
  | 'cardNumber'
  | 'cardExpMonth'
  | 'cardExpYear'
  | 'targetGroup'

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
        | 'invalid_payment_card'
        | 'invalid_target_group'
        | 'passmanager_unavailable'
        | 'persistence_failed'
        | 'aborted'
      field?: PMEntryCreateValidationField
      message?: string
    }

function normalizeCardDigits(value: string): string {
  return value.replace(/\D+/g, '')
}

function isActionAbort(error: unknown): boolean {
  return (
    isAbort(error) ||
    (error instanceof Error && error.name === 'AbortError') ||
    Boolean(error && typeof error === 'object' && (error as {name?: unknown}).name === 'AbortError')
  )
}

function deriveTitleFromWebsite(value: string): string {
  const website = value.trim()
  if (!website) return ''

  const normalized = formatLink(website)
  let host = ''
  try {
    host = new URL(normalized).hostname
  } catch {
    host = website.replace(/^https?:\/\//i, '').split('/')[0] ?? ''
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
  readonly websiteEditor = new PMEntryWebsiteEditorModel({onChange: () => this.onWebsitesChanged()})
  readonly cardholderName = atom('')
  readonly cardNumber = atom('')
  readonly cardExpMonth = atom('')
  readonly cardExpYear = atom('')
  readonly cardCvv = atom('')

  readonly useOtp = atom(false, 'use-otp')
  readonly otp = new PMEntryOtpCreateModel()
  readonly isEditingPassword = atom(false)
  readonly passwordStrengthScore = atom<number | null>(null)
  readonly passwordStrengthLabel = computed(() => {
    const score = this.passwordStrengthScore()
    return score === null ? '' : formatPasswordStrengthLabel(score as 0 | 1 | 2 | 3 | 4)
  })
  readonly hasStrength = computed(() => this.passwordStrengthScore() !== null)

  readonly iconRef = atom<string | undefined>(undefined)
  readonly avatarId = this.iconRef
  readonly targetGroupId = atom<string | undefined>(undefined, 'passmanager.entryCreate.targetGroupId')
  readonly pendingTargetGroupId = atom<string | undefined>(
    undefined,
    'passmanager.entryCreate.pendingTargetGroupId',
  )
  readonly targetGroupError = atom('', 'passmanager.entryCreate.targetGroupError')
  readonly tags = atom<string[]>([], 'passmanager.entryCreate.tags')
  readonly titleError = atom('')
  readonly usernameError = atom('')
  readonly passwordError = atom('')
  readonly cardholderNameError = atom('')
  readonly cardNumberError = atom('')
  readonly cardExpMonthError = atom('')
  readonly cardExpYearError = atom('')
  readonly titleWasAutofilled = atom(false)
  readonly touchedFields = atom<PMEntryCreateValidationField[]>([], 'passmanager.entryCreate.touchedFields')
  readonly submitAttempted = atom(false, 'passmanager.entryCreate.submitAttempted')
  readonly dirty = atom(false, 'passmanager.entryCreate.dirty')
  readonly detailsSheetOpen = atom(false, 'passmanager.entryCreate.detailsSheetOpen')
  readonly detailsSheetView = atom<PMEntryCreateDetailsView>('hub', 'passmanager.entryCreate.detailsView')
  readonly locationSheetOpen = atom(false, 'passmanager.entryCreate.locationSheetOpen')
  readonly discardSheetOpen = atom(false, 'passmanager.entryCreate.discardSheetOpen')
  readonly supportedOptionalDetails = computed<readonly PMEntryCreateOptionalDetail[]>(
    () => (this.entryType() === 'payment_card' ? PAYMENT_CARD_OPTIONAL_DETAILS : LOGIN_OPTIONAL_DETAILS),
    'passmanager.entryCreate.supportedDetails',
  )
  readonly configuredOptionalDetails = computed(
    () => this.supportedOptionalDetails().filter((detail) => this.optionalDetailHasData(detail)),
    'passmanager.entryCreate.configuredDetails',
  )
  readonly configuredOptionalDetailCount = computed(
    () => this.configuredOptionalDetails().length,
    'passmanager.entryCreate.configuredDetailCount',
  )
  readonly targetGroupLabel = computed(() => {
    const root = getPassmanagerRoot()
    const targetGroupId = this.targetGroupId()
    if (!root || !targetGroupId || targetGroupId === root.id) return root?.name ?? ''
    return root.getGroup(targetGroupId)?.name ?? ''
  }, 'passmanager.entryCreate.targetGroupLabel')
  readonly targetGroupOptions = computed<PMEntryCreateTargetOption[]>(() => {
    const root = getPassmanagerRoot()
    if (!root) return []

    const groups = root.entriesList().filter((entry): entry is Group => entry instanceof Group)
    return [{id: root.id, label: root.name}, ...groups.map((group) => ({id: group.id, label: group.name}))]
  }, 'passmanager.entryCreate.targetGroupOptions')
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

    const hasWebsite = this.websiteEditor.rows().some((row) => Boolean(row.value.trim()))

    if (this.useOtp() && !this.otp.canSubmit()) {
      return false
    }

    return Boolean(this.password() && (this.username().trim() || hasWebsite))
  }, 'passmanager.entryCreate.canSubmit')

  private submitPromise: Promise<PMEntryCreateSubmitResult> | undefined
  private pendingDiscardResume: (() => void) | undefined
  private tagSelectionActive = false

  constructor() {
    this.reset()
  }

  private readonly submitAction = action(async (): Promise<PMEntryCreateSubmitResult> => {
    this.submitAttempted.set(true)
    const passmanager = getPassmanagerRoot()
    if (!passmanager) {
      return {ok: false, reason: 'passmanager_unavailable'}
    }

    const title = this.title().trim()
    this.clearFormErrors()

    if (this.entryType() === 'payment_card') {
      this.titleError.set(title ? '' : i18n('error:title_required'))
      const paymentCardMeta = this.buildPaymentCardMeta()
      if (!title) {
        return {ok: false, reason: 'missing_title', field: 'title'}
      }
      if ('error' in paymentCardMeta) {
        return {
          ok: false,
          reason: 'invalid_payment_card',
          field: paymentCardMeta.field,
          message: paymentCardMeta.error,
        }
      }

      const targetError = this.prepareCreateTarget()
      if (targetError) return targetError

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
        {
          cardPan: normalizeCardDigits(this.cardNumber()),
          cardCvv: this.cardCvv().trim() || undefined,
        },
      )

      try {
        await wrap(entry.flushPendingPersistence())
        if (passmanager.getEntry(entry.id) !== entry) {
          throw new Error('Entry creation was rolled back')
        }
      } catch (error) {
        return this.createPersistenceFailure(error)
      }

      if (getPassmanagerRoot() === passmanager) {
        passmanagerNavigationController.presentCreatedEntry(entry)
      }
      return {ok: true}
    }

    const loginForm = this.validateLoginForm(title)
    if (loginForm.error) {
      return loginForm.error
    }

    if (this.useOtp() && !(await wrap(this.otp.validateWithCore()))) {
      this.detailsSheetView.set('otp')
      this.detailsSheetOpen.set(true)
      return {
        ok: false,
        reason: 'invalid_otp',
        message: i18n('otp:secret:error:invalid'),
      }
    }

    const targetError = this.prepareCreateTarget()
    if (targetError) return targetError

    const otp = this.useOtp() ? this.otp.getFormData() : undefined
    const entryData: Partial<IEntry> = {
      entryType: 'login',
      title,
      username: this.username(),
      urls: loginForm.urls,
      iconRef: this.iconRef() || undefined,
      tags: this.tags(),
    }

    const entry = passmanager.createEntry(entryData, this.password(), this.note(), otp)
    try {
      await wrap(entry.flushPendingPersistence())
      if (passmanager.getEntry(entry.id) !== entry) {
        throw new Error('Entry creation was rolled back')
      }
    } catch (error) {
      return this.createPersistenceFailure(error)
    }

    if (getPassmanagerRoot() === passmanager) {
      passmanagerNavigationController.presentCreatedEntry(entry)
    }
    return {ok: true}
  }, 'passmanager.entryCreate.submit').extend(withAbort('first-in-win'), withAsync({status: true}))

  private createPersistenceFailure(error: unknown): PMEntryCreateSubmitResult {
    if (isActionAbort(error)) {
      throw error
    }

    return {
      ok: false,
      reason: 'persistence_failed',
      message: i18n('error:save'),
    }
  }

  reset(): boolean {
    if (this.isSubmitting()) return false

    this.submitAction.abort('entry-create reset')
    this.cancelTagSelection()

    this.entryType.set('login')
    this.title.set('')
    this.username.set('')
    this.password.set('')
    this.note.set('')
    this.websiteEditor.reset()
    this.cardholderName.set('')
    this.cardNumber.set('')
    this.cardExpMonth.set('')
    this.cardExpYear.set('')
    this.cardCvv.set('')

    this.useOtp.set(false)
    this.otp.reset()
    this.isEditingPassword.set(false)
    this.passwordStrengthScore.set(null)

    this.iconRef.set(undefined)
    this.targetGroupId.set(this.getInitialTargetGroupId())
    this.pendingTargetGroupId.set(undefined)
    this.targetGroupError.set('')
    this.tags.set([])
    this.clearFormErrors()
    this.titleWasAutofilled.set(false)
    this.touchedFields.set([])
    this.submitAttempted.set(false)
    this.detailsSheetOpen.set(false)
    this.detailsSheetView.set('hub')
    this.locationSheetOpen.set(false)
    this.discardSheetOpen.set(false)
    this.pendingDiscardResume = undefined
    this.dirty.set(false)
    this.submitPromise = undefined
    return true
  }

  setTitle(value: string): void {
    if (this.title() === value) {
      this.titleWasAutofilled.set(false)
      return
    }
    this.title.set(value)
    this.titleWasAutofilled.set(false)
    this.markDirty()
    if (value.trim()) {
      this.titleError.set('')
    }
  }

  setEntryType(value: PassManagerEntryType): void {
    if (this.entryType() === value) return
    this.entryType.set(value)
    this.markDirty()
  }

  setUsername(value: string): void {
    if (this.username() === value) return
    this.username.set(value)
    this.markDirty()
    if (value.trim()) {
      this.usernameError.set('')
    }
  }

  setPassword(value: string): void {
    if (this.password() === value) return
    this.password.set(value)
    this.isEditingPassword.set(Boolean(value))
    this.updateStrength(value)
    this.markDirty()
    if (value) {
      this.passwordError.set('')
    }
  }

  setNote(value: string): void {
    if (this.note() === value) return
    this.note.set(value)
    this.markDirty()
  }

  setCardholderName(value: string): void {
    if (this.cardholderName() === value) return
    this.cardholderName.set(value)
    this.markDirty()
    if (value.trim()) {
      this.cardholderNameError.set('')
    }
  }

  setCardNumber(value: string): void {
    if (this.cardNumber() === value) return
    this.cardNumber.set(value)
    this.markDirty()
    if (normalizeCardDigits(value)) {
      this.cardNumberError.set('')
    }
  }

  setCardExpMonth(value: string): void {
    if (this.cardExpMonth() === value) return
    this.cardExpMonth.set(value)
    this.markDirty()
    if (this.isValidCardExpMonth(value)) {
      this.cardExpMonthError.set('')
    }
  }

  setCardExpYear(value: string): void {
    if (this.cardExpYear() === value) return
    this.cardExpYear.set(value)
    this.markDirty()
    if (this.isValidCardExpYear(value)) {
      this.cardExpYearError.set('')
    }
  }

  setCardCvv(value: string): void {
    if (this.cardCvv() === value) return
    this.cardCvv.set(value)
    this.markDirty()
  }

  setUseOtp(value: boolean): void {
    if (value) {
      if (!this.useOtp()) {
        this.useOtp.set(true)
        this.markDirty()
      }
      return
    }

    this.disableOtp()
  }

  private openTagEditor(): void {
    pmCredentialTagsModel.openEntryTagSelection(
      this.tags(),
      {
        onConfirm: (tags) => {
          this.tagSelectionActive = false
          this.setTags(tags)
        },
        onCancel: () => {
          this.tagSelectionActive = false
        },
      },
      {presentation: 'embedded'},
    )
    this.tagSelectionActive = true
    this.detailsSheetView.set('tags')
    this.detailsSheetOpen.set(true)
  }

  private cancelTagSelection(): void {
    if (!this.tagSelectionActive) return
    pmCredentialTagsModel.cancelEntryTagSelection()
    this.tagSelectionActive = false
  }

  private openOtpEditor(): void {
    const title = this.title().trim()
    if (!this.useOtp()) {
      this.otp.reset({label: title})
    } else {
      this.otp.setDefaultLabel(title)
    }
    this.detailsSheetView.set('otp')
    this.detailsSheetOpen.set(true)
  }

  private closeOtpEditor(): void {
    if (this.otp.qrScannerScanning()) {
      return
    }

    this.otp.actions.closeAdvanced()
    if (!this.otp.secret()) {
      this.useOtp.set(false)
    }
    if (!this.useOtp()) {
      this.otp.reset({label: this.title().trim()})
    }
    this.detailsSheetView.set('hub')
  }

  async confirmOtpEditor(): Promise<boolean> {
    this.otp.setDefaultLabel(this.title().trim())
    if (!(await this.otp.validateWithCore())) {
      return false
    }

    this.useOtp.set(true)
    this.markDirty()
    this.detailsSheetView.set('hub')
    return true
  }

  disableOtp(): void {
    const hadOtp = this.useOtp() || Boolean(this.otp.secret())
    this.useOtp.set(false)
    this.otp.reset()
    if (this.detailsSheetView() === 'otp') {
      this.detailsSheetView.set('hub')
    }
    if (hadOtp) this.markDirty()
  }

  setIconRef(value: string | undefined): void {
    if (this.iconRef() === value) return
    this.iconRef.set(value)
    this.markDirty()
  }

  setTags(value: unknown): void {
    const next = normalizeCredentialTags(value)
    if (next.length === this.tags().length && next.every((tag, index) => tag === this.tags()[index])) return
    this.tags.set(next)
    this.markDirty()
  }

  setTagsFromKeys(keys: readonly string[]): void {
    this.setTags(pmCredentialTagsModel.resolveLabelsFromTagKeys(keys, this.tags()))
  }

  openTagCatalogManager(): void {
    pmCredentialTagsModel.openCatalogManager({
      getSelectedTags: () => this.tags(),
      onSelectedTagsChange: (tags) => this.setTags(tags),
    })
  }

  optionalDetailHasData(detail: PMEntryCreateOptionalDetail): boolean {
    switch (detail) {
      case 'icon':
        return Boolean(this.iconRef())
      case 'tags':
        return this.tags().length > 0
      case 'otp':
        return this.useOtp()
      case 'note':
        return Boolean(this.note().trim())
    }
  }

  openDetailsSheet(): void {
    this.cancelTagSelection()
    this.detailsSheetView.set('hub')
    this.detailsSheetOpen.set(true)
  }

  closeDetailsSheet(): void {
    if (this.detailsSheetView() === 'otp' && this.otp.qrScannerScanning()) return
    if (this.detailsSheetView() === 'tags') {
      this.cancelTagSelection()
    }
    if (this.detailsSheetView() === 'otp') {
      this.otp.actions.closeAdvanced()
    }
    if (this.detailsSheetView() === 'otp' && !this.useOtp()) {
      this.otp.reset({label: this.title().trim()})
    }
    this.detailsSheetOpen.set(false)
    this.detailsSheetView.set('hub')
  }

  openDetailsEditor(detail: PMEntryCreateOptionalDetail): void {
    if (!this.supportedOptionalDetails().includes(detail)) return
    if (detail === 'otp') {
      this.openOtpEditor()
      return
    }
    if (detail === 'tags') {
      this.openTagEditor()
      return
    }
    this.detailsSheetView.set(detail)
    this.detailsSheetOpen.set(true)
  }

  closeDetailsEditor(): void {
    if (this.detailsSheetView() === 'hub') return
    if (this.detailsSheetView() === 'tags') {
      this.cancelTagEditor()
      return
    }
    if (this.detailsSheetView() === 'otp') {
      this.closeOtpEditor()
      return
    }
    this.detailsSheetView.set('hub')
  }

  async confirmTagEditor(): Promise<boolean> {
    if (!this.tagSelectionActive) return false
    if (!(await pmCredentialTagsModel.confirmEntryTagSelection())) return false

    this.detailsSheetView.set('hub')
    return true
  }

  cancelTagEditor(): void {
    this.cancelTagSelection()
    if (this.detailsSheetView() === 'tags') {
      this.detailsSheetView.set('hub')
    }
  }

  removeOptionalDetail(detail: PMEntryCreateOptionalDetail): void {
    if (detail === 'tags') {
      this.cancelTagSelection()
    }

    switch (detail) {
      case 'icon':
        this.iconRef.set(undefined)
        break
      case 'tags':
        this.tags.set([])
        break
      case 'otp':
        this.useOtp.set(false)
        this.otp.reset()
        break
      case 'note':
        this.note.set('')
        break
    }

    if (this.detailsSheetView() === detail) {
      this.detailsSheetView.set('hub')
    }
    this.markDirty()
  }

  async requestRemoveOptionalDetail(detail: PMEntryCreateOptionalDetail): Promise<boolean> {
    if (!this.optionalDetailHasData(detail)) return false

    const confirmed = await dialogService
      .showConfirmDialog({
        title: i18n('entry:create:remove-detail-title' as never),
        message: i18n('entry:create:remove-detail-message' as never),
        confirmText: i18n('button:remove'),
        confirmVariant: 'danger',
      })
      .catch(() => false)
    if (!confirmed) return false

    this.removeOptionalDetail(detail)
    return true
  }

  openLocationSheet(): void {
    this.pendingTargetGroupId.set(this.targetGroupId())
    this.locationSheetOpen.set(true)
  }

  closeLocationSheet(): void {
    this.locationSheetOpen.set(false)
    this.pendingTargetGroupId.set(undefined)
  }

  selectPendingTargetGroup(value: string): void {
    const root = getPassmanagerRoot()
    const next = value.trim()
    if (!root || !next || (next !== root.id && !root.getGroup(next))) return
    this.pendingTargetGroupId.set(next)
  }

  confirmPendingTargetGroup(): boolean {
    const targetGroupId = this.pendingTargetGroupId()
    return targetGroupId ? this.setTargetGroupId(targetGroupId) : false
  }

  setTargetGroupId(value: string): boolean {
    const root = getPassmanagerRoot()
    if (!root) return false

    const next = value.trim()
    if (!next || (next !== root.id && !root.getGroup(next))) {
      this.targetGroupError.set(i18n('entry:create:location-unavailable' as never))
      return false
    }

    if (next !== this.targetGroupId()) {
      this.targetGroupId.set(next)
      this.markDirty()
    }
    this.targetGroupError.set('')
    this.locationSheetOpen.set(false)
    this.pendingTargetGroupId.set(undefined)
    return true
  }

  markFieldTouched(field: PMEntryCreateValidationField): void {
    if (!this.touchedFields().includes(field)) {
      this.touchedFields.set([...this.touchedFields(), field])
    }
    this.validateField(field)
  }

  isFieldTouched(field: PMEntryCreateValidationField): boolean {
    return this.submitAttempted() || this.touchedFields().includes(field)
  }

  requestDiscard(resume: () => void): boolean {
    if (this.isSubmitting()) return true
    if (!this.dirty()) return false
    if (this.discardSheetOpen()) return true
    this.pendingDiscardResume = resume
    this.discardSheetOpen.set(true)
    return true
  }

  cancelDiscard(): void {
    this.pendingDiscardResume = undefined
    this.discardSheetOpen.set(false)
  }

  confirmDiscard(): void {
    const resume = this.pendingDiscardResume
    if (!this.reset()) return
    resume?.()
  }

  consumeTransientBack(): boolean {
    if (this.locationSheetOpen()) {
      this.closeLocationSheet()
      return true
    }
    if (this.detailsSheetOpen()) {
      if (this.detailsSheetView() === 'otp' && this.otp.view() === 'advanced') {
        this.otp.actions.closeAdvanced()
      } else if (this.detailsSheetView() === 'hub') {
        this.closeDetailsSheet()
      } else {
        this.closeDetailsEditor()
      }
      return true
    }
    if (this.discardSheetOpen()) {
      this.cancelDiscard()
      return true
    }
    return false
  }

  generatePassword(): void {
    this.setPassword(generatePassword())
  }

  async submit(): Promise<PMEntryCreateSubmitResult> {
    if (this.submitPromise) {
      return this.submitPromise
    }

    const promise = this.submitAction()
      .then(async (result) => {
        if (result.ok) this.dirty.set(false)
        if (
          !result.ok &&
          !result.field &&
          (result.reason === 'invalid_payment_card' || result.reason === 'persistence_failed')
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
        if (isActionAbort(error)) {
          return {ok: false, reason: 'aborted'} as PMEntryCreateSubmitResult
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

  private clearFormErrors(): void {
    this.titleError.set('')
    this.usernameError.set('')
    this.passwordError.set('')
    this.cardholderNameError.set('')
    this.cardNumberError.set('')
    this.cardExpMonthError.set('')
    this.cardExpYearError.set('')
  }

  private markDirty(): void {
    this.dirty.set(true)
  }

  private getInitialTargetGroupId(): string | undefined {
    const root = getPassmanagerRoot()
    if (!root) return undefined

    try {
      const route = passmanagerNavigationController.readRoute()
      if (route.kind === 'create-entry' && route.targetGroupPath) {
        const target = root
          .entriesList()
          .find((item): item is Group => item instanceof Group && item.name === route.targetGroupPath)
        if (target) return target.id
      }
    } catch {
      // Route state is optional during isolated component/model tests.
    }

    return root.id
  }

  private validateField(field: PMEntryCreateValidationField): void {
    switch (field) {
      case 'title':
        this.titleError.set(this.title().trim() ? '' : i18n('error:title_required'))
        return
      case 'username':
        this.usernameError.set(
          this.entryType() === 'login' &&
            !this.username().trim() &&
            !this.websiteEditor.rows().some((row) => row.value.trim())
            ? i18n('error:username_or_website_required')
            : '',
        )
        return
      case 'password':
        this.passwordError.set(
          this.entryType() === 'login' && !this.password() ? i18n('error:password_required') : '',
        )
        return
      case 'urls': {
        const firstRowId = this.websiteEditor.rows()[0]?.id
        if (firstRowId) this.websiteEditor.markTouched(firstRowId)
        return
      }
      case 'cardholderName':
        this.cardholderNameError.set(
          this.entryType() === 'payment_card' && !this.cardholderName().trim()
            ? i18n('payment-card:error-cardholder-required')
            : '',
        )
        return
      case 'cardNumber':
        this.cardNumberError.set(
          this.entryType() === 'payment_card' && !normalizeCardDigits(this.cardNumber())
            ? i18n('payment-card:error-number-required')
            : '',
        )
        return
      case 'cardExpMonth':
        this.cardExpMonthError.set(
          this.entryType() === 'payment_card' && !this.isValidCardExpMonth(this.cardExpMonth())
            ? i18n('payment-card:error-exp-month')
            : '',
        )
        return
      case 'cardExpYear':
        this.cardExpYearError.set(
          this.entryType() === 'payment_card' && !this.isValidCardExpYear(this.cardExpYear())
            ? i18n('payment-card:error-exp-year')
            : '',
        )
        return
      case 'targetGroup':
        this.validateTargetGroup()
        return
    }
  }

  private validateTargetGroup(): boolean {
    const root = getPassmanagerRoot()
    const targetGroupId = this.targetGroupId()
    const valid = Boolean(
      root && targetGroupId && (targetGroupId === root.id || root.getGroup(targetGroupId)),
    )
    this.targetGroupError.set(valid ? '' : i18n('entry:create:location-unavailable' as never))
    return valid
  }

  private prepareCreateTarget(): PMEntryCreateSubmitResult | null {
    const root = getPassmanagerRoot()
    if (!root || !this.validateTargetGroup()) {
      this.locationSheetOpen.set(true)
      return {
        ok: false,
        reason: 'invalid_target_group',
        field: 'targetGroup',
        message: this.targetGroupError(),
      }
    }

    const targetGroupId = this.targetGroupId()
    root.setShowElement(
      'createEntry',
      targetGroupId && targetGroupId !== root.id ? root.getGroup(targetGroupId) : undefined,
    )
    return null
  }

  private validateLoginForm(title: string): {error: PMEntryCreateSubmitResult | null; urls: UrlRule[]} {
    this.clearFormErrors()

    const websiteResult = this.websiteEditor.buildRules()
    const hasTitle = Boolean(title)
    const hasLocator = Boolean(
      this.username().trim() || this.websiteEditor.rows().some((row) => row.value.trim()),
    )
    const hasPassword = Boolean(this.password())

    this.titleError.set(hasTitle ? '' : i18n('error:title_required'))
    this.usernameError.set(hasLocator ? '' : i18n('error:username_or_website_required'))
    this.passwordError.set(hasPassword ? '' : i18n('error:password_required'))

    if (!hasTitle) return {error: {ok: false, reason: 'missing_title', field: 'title'}, urls: []}
    if (!hasLocator) {
      return {error: {ok: false, reason: 'missing_login_locator', field: 'username'}, urls: []}
    }
    if (!hasPassword) {
      return {error: {ok: false, reason: 'missing_password', field: 'password'}, urls: []}
    }
    if (!websiteResult.ok) {
      return {error: {ok: false, reason: 'invalid_website', field: 'urls'}, urls: []}
    }

    return {error: null, urls: websiteResult.rules}
  }

  private onWebsitesChanged(): void {
    this.markDirty()
    const website = this.websiteEditor.primaryValue()
    if (website) this.usernameError.set('')

    const nextTitle = deriveTitleFromWebsite(website)
    if (!nextTitle || (this.title().trim() && !this.titleWasAutofilled())) return
    this.title.set(nextTitle)
    this.titleWasAutofilled.set(true)
    this.titleError.set('')
  }

  private buildPaymentCardMeta():
    | {value: NonNullable<Extract<IEntry, {entryType: 'payment_card'}>['paymentCard']>}
    | {error: string; field: PMEntryCreateValidationField} {
    const cardholderName = this.cardholderName().trim()
    const cardPan = normalizeCardDigits(this.cardNumber())
    const expMonth = Number.parseInt(this.cardExpMonth().trim(), 10)
    const expYear = parsePaymentCardExpYearInput(this.cardExpYear())
    const cardholderError = cardholderName ? '' : i18n('payment-card:error-cardholder-required')
    const cardNumberError = cardPan ? '' : i18n('payment-card:error-number-required')
    const expMonthError = this.isValidCardExpMonth(this.cardExpMonth())
      ? ''
      : i18n('payment-card:error-exp-month')
    const expYearError = expYear === undefined ? i18n('payment-card:error-exp-year') : ''

    this.cardholderNameError.set(cardholderError)
    this.cardNumberError.set(cardNumberError)
    this.cardExpMonthError.set(expMonthError)
    this.cardExpYearError.set(expYearError)

    if (cardholderError) return {error: cardholderError, field: 'cardholderName'}
    if (cardNumberError) return {error: cardNumberError, field: 'cardNumber'}
    if (expMonthError) return {error: expMonthError, field: 'cardExpMonth'}
    if (expYearError || expYear === undefined) {
      return {error: expYearError, field: 'cardExpYear'}
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
    return isPaymentCardExpYearInput(value)
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
}
