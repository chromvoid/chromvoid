import {action, atom, computed, wrap} from '@reatom/core'

import {Entry, OTP} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'
import {formatPasswordStrengthLabel} from '@project/passmanager/i18n/format'
import {
  copyWithAutoWipe,
  DEFAULT_CLIPBOARD_WIPE_MS,
  estimatePasswordStrength,
  generatePasswordWithOptions,
} from '@project/passmanager/password-utils'
import {
  credentialTagKey,
  normalizeCredentialTagLabel,
  normalizeCredentialTags,
  type CredentialTagKey,
} from '@project/passmanager/tags'
import type {SshKeyType, UrlRule} from '@project/passmanager/types'
import {transformUrls, URLValidator} from '@project/passmanager/urls'
import {passmanagerSshKeygen} from 'root/features/passmanager/service/passmanager-ssh-keygen'
import {pmEntryEditorModel, type PMEntryEditorSurface} from '../../../models/pm-entry-editor.model'
import {pmCredentialTagsModel} from '../../../models/pm-credential-tags.model'
import {isPassmanagerReadOnlyOrMissing} from '../../../models/pm-root.adapter'
import {toast} from 'root/shared/services/toast-manager'
import {dialogService} from 'root/shared/services/dialog-service'
import {PMEntryOtpCreateModel} from '../entry-otp-create/entry-otp-create.model'
import {PMEntrySshCreateModel} from '../entry-ssh/entry-ssh-create.model'
import type {PMEntryRenderData} from './entry.model'
import {PMEntryModel} from './entry.model'

export type PMEntryInlineField = 'title' | 'username' | 'password' | 'website'
export type PMEntryCredentialEditField = 'username' | 'password'
export type PMEntryEditFocusField = PMEntryCredentialEditField | 'title' | 'note'
export type PMEntrySectionSnippet = 'note' | 'otp' | 'ssh' | 'tags' | 'payment-card'
export type PMEntryMobilePasswordCharset = 'lowercase' | 'uppercase' | 'digits' | 'symbols'
export type PMEntryEditFocusRequest = {
  field: PMEntryEditFocusField
  token: number
}

export type PMEntryMobileEditIntent =
  | {
      kind: 'section'
      section: 'otp'
      mode: 'add' | 'manage'
    }
  | {
      kind: 'section'
      section: 'note'
      mode: 'edit'
    }
  | {
      kind: 'section'
      section: 'ssh'
      mode: 'add' | 'manage'
    }
  | {
      kind: 'section'
      section: 'tags'
      mode: 'edit'
    }
  | {
      kind: 'section'
      section: 'payment-card'
      mode: 'edit'
    }

export type PMEntryEditData = PMEntryRenderData & {
  title: string
  username: string
  otpCount: number
  websiteCount: number
  hasSshKeys: boolean
  isEditingEntry: boolean
  hasActiveEditorSurface: boolean
  isReadOnly: boolean
  canEditFields: boolean
  canEditWebsite: boolean
  canAddOtp: boolean
  canStartOtpSnippet: boolean
  canAddMissingOtpInEntryView: boolean
  canManageOtp: boolean
  canManageSsh: boolean
  canAddSsh: boolean
  canStartSshSnippet: boolean
  canAddMissingSshInEntryView: boolean
  canEditTags: boolean
  canEditPaymentCard: boolean
  compactMeta: string
}

function normalizeCardDigits(value: string): string {
  return value.replace(/\D+/g, '')
}

type PMEntryEditTapField = PMEntryCredentialEditField | 'title' | 'note'

type PMEntryEditTap = {
  entryId: string
  field: PMEntryEditTapField
  startX: number
  startY: number
  pointerId: number
  time: number
}

type PMEntryEditLastTap = {
  entryId: string
  field: PMEntryEditTapField
  x: number
  y: number
  time: number
}

export class PMEntryEditModel extends PMEntryModel {
  private static readonly ENTRY_EDIT_DOUBLE_TAP_MS = 320
  private static readonly ENTRY_EDIT_DOUBLE_TAP_DISTANCE = 24
  private static readonly ENTRY_EDIT_TAP_MAX_MS = 260
  private static readonly ENTRY_EDIT_TAP_MOVE_GUARD = 12

  private readonly urlValidator = new URLValidator({defaultMatch: 'base_domain'})
  private requestedSurface: PMEntryEditorSurface | null = null
  private entryEditDraftEntryId: string | undefined
  private entryEditPasswordBaseline: string | undefined
  private entryEditNoteBaseline: string | undefined
  private entryEditPasswordDirty = false
  private entryEditNoteDirty = false
  private entryEditTap: PMEntryEditTap | null = null
  private lastEntryEditTap: PMEntryEditLastTap | null = null
  private nextEntryEditFocusToken = 1

  readonly editIntent = atom<PMEntryMobileEditIntent | null>(null, 'passmanager.entryMobile.editIntent')
  readonly entryEditFocusRequest = atom<PMEntryEditFocusRequest | null>(
    null,
    'passmanager.entryMobile.entryEditFocusRequest',
  )
  readonly inlineField = atom<PMEntryInlineField | null>(null, 'passmanager.entryMobile.inlineField')
  readonly inlineTitle = atom('', 'passmanager.entryMobile.inlineTitle')
  readonly inlineUsername = atom('', 'passmanager.entryMobile.inlineUsername')
  readonly inlinePassword = atom('', 'passmanager.entryMobile.inlinePassword')
  readonly inlinePasswordStrengthScore = atom<number | null>(null, 'passmanager.entryMobile.inlinePasswordStrengthScore')
  readonly inlinePasswordStrengthLabel = computed(() => {
    const score = this.inlinePasswordStrengthScore()
    return score === null ? '' : formatPasswordStrengthLabel(score as 0 | 1 | 2 | 3 | 4)
  }, 'passmanager.entryMobile.inlinePasswordStrengthLabel')
  readonly inlinePasswordGeneratorOpen = atom(false, 'passmanager.entryMobile.inlinePasswordGeneratorOpen')
  readonly inlinePasswordGenLength = atom(16, 'passmanager.entryMobile.inlinePasswordGenLength')
  readonly inlinePasswordGenLowercase = atom(true, 'passmanager.entryMobile.inlinePasswordGenLowercase')
  readonly inlinePasswordGenUppercase = atom(true, 'passmanager.entryMobile.inlinePasswordGenUppercase')
  readonly inlinePasswordGenDigits = atom(true, 'passmanager.entryMobile.inlinePasswordGenDigits')
  readonly inlinePasswordGenSymbols = atom(false, 'passmanager.entryMobile.inlinePasswordGenSymbols')
  readonly inlineWebsite = atom('', 'passmanager.entryMobile.inlineWebsite')
  readonly inlineIconRef = atom<string | undefined>(undefined, 'passmanager.entryMobile.inlineIconRef')
  readonly inlineError = atom('', 'passmanager.entryMobile.inlineError')
  readonly inlineSaving = atom(false, 'passmanager.entryMobile.inlineSaving')
  readonly sectionSnippet = atom<PMEntrySectionSnippet | null>(null, 'passmanager.entryMobile.sectionSnippet')
  readonly noteDraft = atom('', 'passmanager.entryMobile.noteDraft')
  readonly noteError = atom('', 'passmanager.entryMobile.noteError')
  readonly noteSaving = atom(false, 'passmanager.entryMobile.noteSaving')
  readonly paymentCardTitleDraft = atom('', 'passmanager.entryMobile.paymentCardTitleDraft')
  readonly paymentCardholderNameDraft = atom('', 'passmanager.entryMobile.paymentCardholderNameDraft')
  readonly paymentCardNumberDraft = atom('', 'passmanager.entryMobile.paymentCardNumberDraft')
  readonly paymentCardExpMonthDraft = atom('', 'passmanager.entryMobile.paymentCardExpMonthDraft')
  readonly paymentCardExpYearDraft = atom('', 'passmanager.entryMobile.paymentCardExpYearDraft')
  readonly paymentCardCvvDraft = atom('', 'passmanager.entryMobile.paymentCardCvvDraft')
  readonly paymentCardError = atom('', 'passmanager.entryMobile.paymentCardError')
  readonly paymentCardSaving = atom(false, 'passmanager.entryMobile.paymentCardSaving')
  readonly otpSaving = atom(false, 'passmanager.entryMobile.otpSaving')
  readonly otpError = atom('', 'passmanager.entryMobile.otpError')
  readonly otpDraft = new PMEntryOtpCreateModel()
  readonly sshGeneratorOpen = atom(false, 'passmanager.entryMobile.sshGeneratorOpen')
  readonly sshDraft = new PMEntrySshCreateModel()
  readonly sshKeyType = this.sshDraft.keyType
  readonly sshComment = this.sshDraft.comment
  readonly sshName = this.sshDraft.name
  readonly sshGenerating = atom(false, 'passmanager.entryMobile.sshGenerating')
  readonly sshResult = this.sshDraft.result
  readonly sshError = this.sshDraft.error
  readonly tagDraft = atom<string[]>([], 'passmanager.entryMobile.tagDraft')
  readonly tagInput = atom('', 'passmanager.entryMobile.tagInput')
  readonly tagError = atom('', 'passmanager.entryMobile.tagError')
  readonly tagSaving = atom(false, 'passmanager.entryMobile.tagSaving')

  readonly openEditIntent = action((intent: PMEntryMobileEditIntent) => {
    if (isPassmanagerReadOnlyOrMissing()) return
    this.cancelInlineEdit()
    this.editIntent.set(intent)
    this.startEntryEdit()
  }, 'passmanager.entryMobile.openEditIntent')

  readonly clearEditIntent = action(() => {
    this.editIntent.set(null)
  }, 'passmanager.entryMobile.clearEditIntent')

  resetRequestedSurface(): void {
    this.requestedSurface = null
  }

  getRequestedSurfaceFromEditor(entry: Entry): PMEntryEditorSurface | null {
    return this.resolveRequestedSurface(entry)
  }

  syncRequestedSurfaceFromEditor(entry: Entry): void {
    const requestedSurface = this.getRequestedSurfaceFromEditor(entry)
    if (requestedSurface === this.requestedSurface) {
      return
    }

    this.requestedSurface = requestedSurface
    this.applyRequestedSurface(entry, requestedSurface)
  }

  syncEntryEditSecretsFromResources(entry: Entry): void {
    if (entry.entryType === 'payment_card') return
    if (this.entryEditDraftEntryId !== entry.id) return
    if (!pmEntryEditorModel.isActiveForEntry(entry.id, 'entry')) return

    if (!this.entryEditPasswordDirty && this.entryEditPasswordBaseline === undefined) {
      const passwordResource = this.state.passwordResource()
      if (passwordResource.status === 'ready') {
        this.entryEditPasswordBaseline = passwordResource.value
        this.inlinePassword.set(passwordResource.value)
        this.updateInlinePasswordStrength(passwordResource.value)
      }
    }

    if (!this.entryEditNoteDirty && this.entryEditNoteBaseline === undefined) {
      const noteResource = this.state.noteResource()
      if (noteResource.status === 'ready') {
        this.entryEditNoteBaseline = noteResource.value
        this.noteDraft.set(noteResource.value)
      }
    }
  }

  beginNoteEdit(entry: Entry): void {
    if (isPassmanagerReadOnlyOrMissing()) return
    this.cancelInlineEdit()
    this.clearEditIntent()
    pmEntryEditorModel.openSurface(entry.id, 'note')
    this.sectionSnippet.set('note')
    this.noteError.set('')
    const noteResource = this.state.noteResource()
    this.noteDraft.set(noteResource.status === 'ready' ? noteResource.value : '')
  }

  private resolveRequestedSurface(entry: Entry): PMEntryEditorSurface | null {
    if (!pmEntryEditorModel.isActiveForEntry(entry.id)) {
      return null
    }

    const surface = pmEntryEditorModel.activeSurface()
    return entry.entryType === 'payment_card' && surface === 'title' ? 'payment-card' : surface
  }

  private applyRequestedSurface(entry: Entry, requestedSurface: PMEntryEditorSurface | null): void {
    const inlineField = this.inlineField()
    const sectionSnippet = this.sectionSnippet()

    if (!requestedSurface) {
      this.entryEditDraftEntryId = undefined
      this.resetEntryEditSecretTracking()
      if (inlineField) {
        this.cancelInlineEdit()
      }
      if (sectionSnippet) {
        this.closeSectionSnippet()
      }
      return
    }

    if (requestedSurface === 'entry') {
      if (entry.entryType === 'payment_card') {
        this.beginPaymentCardEdit(entry)
        return
      }

      if (sectionSnippet) {
        this.closeSectionSnippet(false)
      }
      if (inlineField) {
        this.resetInlineEditState()
      }
      this.beginEntryEdit(entry)
      return
    }

    if (
      requestedSurface === 'title' ||
      requestedSurface === 'username' ||
      requestedSurface === 'password' ||
      requestedSurface === 'website'
    ) {
      if (sectionSnippet) {
        this.closeSectionSnippet()
      }
      if (inlineField !== requestedSurface) {
        this.beginInlineEdit(entry, requestedSurface)
      }
      return
    }

    if (inlineField) {
      this.cancelInlineEdit()
    }

    if (requestedSurface === 'note' && sectionSnippet !== 'note') {
      this.beginNoteEdit(entry)
      return
    }

    if (requestedSurface === 'otp' && sectionSnippet !== 'otp') {
      this.beginOtpSnippet(entry)
      return
    }

    if (requestedSurface === 'ssh' && sectionSnippet !== 'ssh') {
      this.beginSshSnippet(entry)
      return
    }

    if (requestedSurface === 'tags' && sectionSnippet !== 'tags') {
      this.startTagEdit(entry)
      return
    }

    if (requestedSurface === 'payment-card' && sectionSnippet !== 'payment-card') {
      this.beginPaymentCardEdit(entry)
    }
  }

  cancelNoteEdit(): void {
    if (this.sectionSnippet() === 'note') {
      this.closeSectionSnippet()
    }
  }

  setNoteDraft(value: string): void {
    this.noteDraft.set(value)
    this.entryEditNoteDirty = this.isSecretDraftDirty(value, this.entryEditNoteBaseline)
    this.noteError.set('')
  }

  async saveNoteEdit(entry: Entry): Promise<boolean> {
    if (this.noteSaving()) return false

    this.noteSaving.set(true)
    this.noteError.set('')

    try {
      await wrap(entry.update({...entry.data()}, undefined, this.noteDraft()))
      this.actions.applySavedSecrets({note: this.noteDraft()})
      this.closeSectionSnippet()
      return true
    } catch (error) {
      this.noteError.set((error as Error).message || i18n('error:save'))
      this.noteSaving.set(false)
      return false
    }
  }

  beginOtpSnippet(entry?: Entry): void {
    if (isPassmanagerReadOnlyOrMissing()) return
    if (entry?.entryType === 'payment_card') return
    if (entry && !this.canOpenSectionSnippet(entry, 'otp')) return
    this.cancelInlineEdit()
    this.clearEditIntent()
    if (entry) {
      pmEntryEditorModel.openSurface(entry.id, 'otp')
    }
    this.sectionSnippet.set('otp')
    this.otpSaving.set(false)
    this.otpError.set('')
    this.otpDraft.reset({label: entry?.data().title ?? ''})
  }

  async saveOtpSnippet(entry: Entry): Promise<boolean> {
    if (entry.entryType === 'payment_card') return false
    if (this.otpSaving()) return false
    if (!this.otpDraft.validate()) return false

    const data = this.otpDraft.getFormData()

    this.otpSaving.set(true)
    this.otpError.set('')

    try {
      await wrap(entry.addOTP(data))
      this.closeSectionSnippet()
      return true
    } catch (error) {
      this.otpError.set((error as Error).message || i18n('error:save'))
      this.otpSaving.set(false)
      return false
    }
  }

  async removeOtp(otp: OTP): Promise<boolean> {
    return wrap(otp.remove())
  }

  beginSshSnippet(entry: Entry, _openGenerator = false): void {
    this.openSshGenerator(entry)
  }

  closeSectionSnippet(closeEditorSurface = true): void {
    if (this.sectionSnippet() === 'otp' && this.otpDraft.qrScannerScanning()) {
      return
    }

    const closingTagSnippet = this.sectionSnippet() === 'tags'

    if (closeEditorSurface) {
      pmEntryEditorModel.closeSurface()
    }
    this.sectionSnippet.set(null)
    this.noteError.set('')
    this.noteSaving.set(false)
    this.paymentCardError.set('')
    this.paymentCardSaving.set(false)
    this.otpSaving.set(false)
    this.otpError.set('')
    this.tagError.set('')
    this.tagSaving.set(false)
    this.tagInput.set('')
    if (closingTagSnippet) {
      this.tagDraft.set([])
    }
    this.sshGeneratorOpen.set(false)
    this.sshDraft.reset()
  }

  startTagEdit(entry: Entry): void {
    if (isPassmanagerReadOnlyOrMissing()) return
    this.cancelInlineEdit()
    this.clearEditIntent()
    pmEntryEditorModel.openSurface(entry.id, 'tags')
    this.sectionSnippet.set('tags')
    this.tagDraft.set(normalizeCredentialTags(entry.tags))
    this.tagInput.set('')
    this.tagError.set('')
    this.tagSaving.set(false)
  }

  setTagDraft(tags: unknown): void {
    this.tagDraft.set(normalizeCredentialTags(tags))
    this.tagError.set('')
  }

  setTagDraftFromKeys(keys: readonly string[]): void {
    this.setTagDraft(pmCredentialTagsModel.resolveLabelsFromTagKeys(keys, this.tagDraft()))
  }

  setTagInput(value: string): void {
    this.tagInput.set(value)
    this.tagError.set('')
  }

  addTagDraft(label: unknown = this.tagInput()): void {
    const normalizedLabel = normalizeCredentialTagLabel(label)
    if (!normalizedLabel) {
      if (String(label ?? '').trim()) {
        this.tagError.set(i18n('tags:too_long'))
      }
      return
    }

    this.tagDraft.set(normalizeCredentialTags([...this.tagDraft(), normalizedLabel]))
    this.tagInput.set('')
    this.tagError.set('')
  }

  removeTagDraft(key: CredentialTagKey): void {
    const normalizedKey = credentialTagKey(key)
    if (!normalizedKey) return

    this.tagDraft.set(this.tagDraft().filter((tag) => credentialTagKey(tag) !== normalizedKey))
    this.tagError.set('')
  }

  async saveTagEdit(entry: Entry): Promise<boolean> {
    if (this.tagSaving()) return false

    this.tagSaving.set(true)
    this.tagError.set('')

    try {
      await wrap(entry.updateTags(this.tagDraft()))
      this.closeSectionSnippet()
      return true
    } catch (error) {
      this.tagError.set((error as Error).message || i18n('error:save'))
      this.tagSaving.set(false)
      return false
    }
  }

  cancelTagEdit(): void {
    this.closeSectionSnippet()
  }

  openSshGenerator(entry: Entry): void {
    if (isPassmanagerReadOnlyOrMissing()) return
    if (entry.entryType === 'payment_card') return
    if (!this.canOpenSectionSnippet(entry, 'ssh')) return
    this.cancelInlineEdit()
    this.clearEditIntent()
    pmEntryEditorModel.openSurface(entry.id, 'ssh')
    this.sectionSnippet.set('ssh')
    this.sshGeneratorOpen.set(true)
    this.sshDraft.reset({entryTitle: entry.data().title ?? entry.title, username: entry.username})
  }

  cancelSshGenerator(): void {
    this.closeSectionSnippet()
  }

  setSshKeyType(value: SshKeyType): void {
    this.sshDraft.setKeyType(value)
  }

  setSshName(value: string): void {
    this.sshDraft.setName(value)
  }

  setSshComment(value: string): void {
    this.sshDraft.setComment(value)
  }

  async generateSshKey(entry: Entry): Promise<boolean> {
    if (entry.entryType === 'payment_card') return false
    if (this.sshGenerating()) return false
    if (!this.sshDraft.validate()) return false

    const ssh = this.sshDraft.getFormData()

    this.sshGenerating.set(true)
    this.sshDraft.setPending()

    try {
      const result = await wrap(
        passmanagerSshKeygen({
          entryId: entry.id,
          keyType: ssh.keyType,
          comment: ssh.comment,
        }),
      )

      await wrap(
        entry.updateSshKeys([
          ...entry.sshKeys,
          {
            id: result.key_id,
            type: result.key_type as SshKeyType,
            fingerprint: result.fingerprint,
            name: ssh.name,
            comment: ssh.comment,
          },
        ]),
      )

      this.sshDraft.setResult({
        keyId: result.key_id,
        keyType: result.key_type as SshKeyType,
        fingerprint: result.fingerprint,
        publicKey: result.public_key_openssh,
        name: ssh.name,
        comment: ssh.comment,
      })
      return true
    } catch (error) {
      this.sshDraft.setError((error as Error).message || i18n('error:save'))
      return false
    } finally {
      this.sshGenerating.set(false)
    }
  }

  async copyGeneratedSshPublicKey(): Promise<boolean> {
    const publicKey = this.sshDraft.result()?.publicKey
    if (!publicKey) return false

    try {
      await wrap(copyWithAutoWipe(publicKey, DEFAULT_CLIPBOARD_WIPE_MS))
      toast.success(i18n('ssh:public_key_copied'))
      return true
    } catch (error) {
      this.sshDraft.setError((error as Error).message || i18n('error:save'))
      return false
    }
  }

  async removeSshKey(entry: Entry, keyId: string): Promise<void> {
    if (entry.entryType === 'payment_card') return
    const confirmed = await wrap(
      dialogService.showConfirmDialog({
        title: i18n('ssh:remove:confirm:title'),
        message: i18n('ssh:remove:confirm:text'),
        variant: 'warning',
        confirmVariant: 'danger',
      }),
    ).catch(() => false)
    if (!confirmed) return

    await wrap(entry.removeSshKey(keyId))
  }

  beginPaymentCardEdit(entry: Entry): void {
    if (isPassmanagerReadOnlyOrMissing()) return
    if (entry.entryType !== 'payment_card') return

    this.cancelInlineEdit()
    this.clearEditIntent()
    pmEntryEditorModel.openSurface(entry.id, 'payment-card')
    this.sectionSnippet.set('payment-card')
    this.paymentCardError.set('')
    this.paymentCardTitleDraft.set(entry.title ?? '')
    this.paymentCardholderNameDraft.set(entry.paymentCard?.cardholderName ?? '')
    this.paymentCardNumberDraft.set(this.state.cardPan() ?? '')
    this.paymentCardExpMonthDraft.set(entry.paymentCard?.expMonth ? String(entry.paymentCard.expMonth) : '')
    this.paymentCardExpYearDraft.set(entry.paymentCard?.expYear ? String(entry.paymentCard.expYear) : '')
    this.paymentCardCvvDraft.set(this.state.cardCvv() ?? '')
    this.inlineIconRef.set(entry.iconRef)
  }

  setPaymentCardDraft(
    field: 'title' | 'cardholderName' | 'cardNumber' | 'expMonth' | 'expYear' | 'cardCvv',
    value: string,
  ): void {
    switch (field) {
      case 'title':
        this.paymentCardTitleDraft.set(value)
        break
      case 'cardholderName':
        this.paymentCardholderNameDraft.set(value)
        break
      case 'cardNumber':
        this.paymentCardNumberDraft.set(value)
        break
      case 'expMonth':
        this.paymentCardExpMonthDraft.set(value)
        break
      case 'expYear':
        this.paymentCardExpYearDraft.set(value)
        break
      case 'cardCvv':
        this.paymentCardCvvDraft.set(value)
        break
    }

    this.paymentCardError.set('')
  }

  async savePaymentCardEdit(entry: Entry): Promise<boolean> {
    if (entry.entryType !== 'payment_card') return false
    if (this.paymentCardSaving()) return false

    const cardholderName = this.paymentCardholderNameDraft().trim()
    if (!cardholderName) {
      this.paymentCardError.set(i18n('payment-card:error-cardholder-required'))
      return false
    }

    const cardPan = normalizeCardDigits(this.paymentCardNumberDraft())
    if (!cardPan) {
      this.paymentCardError.set(i18n('payment-card:error-number-required'))
      return false
    }

    const expMonth = Number.parseInt(this.paymentCardExpMonthDraft().trim(), 10)
    const expYear = Number.parseInt(this.paymentCardExpYearDraft().trim(), 10)
    if (!Number.isInteger(expMonth) || expMonth < 1 || expMonth > 12) {
      this.paymentCardError.set(i18n('payment-card:error-exp-month'))
      return false
    }

    if (!Number.isInteger(expYear) || expYear < 2000 || expYear > 9999) {
      this.paymentCardError.set(i18n('payment-card:error-exp-year'))
      return false
    }

    this.paymentCardSaving.set(true)
    this.paymentCardError.set('')

    try {
      await wrap(
        entry.update(
          {
            ...entry.data(),
            entryType: 'payment_card',
            title: this.paymentCardTitleDraft().trim(),
            urls: [],
            username: '',
            iconRef: this.inlineIconRef() || undefined,
            otps: [],
            sshKeys: [],
            paymentCard: {
              cardholderName,
              expMonth,
              expYear,
              brand: entry.paymentCard?.brand ?? 'unknown',
              last4: cardPan.slice(-4) || undefined,
            },
          },
          undefined,
          undefined,
        ),
      )

      const cardPanSaved = await wrap(entry.saveCardPan(cardPan))
      if (!cardPanSaved) {
        throw new Error(i18n('payment-card:error-save-number'))
      }

      const cardCvv = this.paymentCardCvvDraft().trim()
      const cardCvvSaved = cardCvv ? await wrap(entry.saveCardCvv(cardCvv)) : await wrap(entry.cleanCardCvv())
      if (!cardCvvSaved) {
        throw new Error(i18n('payment-card:error-save-cvv'))
      }

      this.actions.applySavedSecrets({
        cardPan,
        cardCvv: cardCvv || null,
      })
      this.closeSectionSnippet()
      return true
    } catch (error) {
      this.paymentCardError.set((error as Error).message || i18n('error:save'))
      this.paymentCardSaving.set(false)
      return false
    }
  }

  beginInlineEdit(entry: Entry, field: PMEntryInlineField): void {
    if (isPassmanagerReadOnlyOrMissing()) return
    if (entry.entryType === 'payment_card' && field !== 'title') return

    pmEntryEditorModel.openSurface(entry.id, field)
    this.inlineField.set(field)
    this.inlineError.set('')

    switch (field) {
      case 'title':
        this.inlineTitle.set(entry.title ?? '')
        return
      case 'username':
        this.inlineUsername.set(entry.username ?? '')
        return
      case 'password': {
        const passwordResource = this.state.passwordResource()
        this.inlinePassword.set(passwordResource.status === 'ready' ? passwordResource.value : '')
        this.updateInlinePasswordStrength(this.inlinePassword())
        this.inlinePasswordGeneratorOpen.set(false)
        return
      }
      case 'website':
        this.inlineWebsite.set(entry.urls.map((item) => item.value).join(', '))
        return
    }
  }

  startCredentialEditTap(
    entry: Entry,
    field: PMEntryCredentialEditField,
    point: {x: number; y: number},
    pointerId: number,
  ): void {
    if (isPassmanagerReadOnlyOrMissing()) return
    if (entry.entryType === 'payment_card') return

    this.startEntryEditTap(entry, field, point, pointerId)
  }

  startNoteEntryEditTap(
    entry: Entry,
    point: {x: number; y: number},
    pointerId: number,
  ): void {
    if (isPassmanagerReadOnlyOrMissing()) return

    this.startEntryEditTap(entry, 'note', point, pointerId)
  }

  startTitleEntryEditTap(
    entry: Entry,
    point: {x: number; y: number},
    pointerId: number,
  ): void {
    if (isPassmanagerReadOnlyOrMissing()) return

    this.startEntryEditTap(entry, 'title', point, pointerId)
  }

  private startEntryEditTap(
    entry: Entry,
    field: PMEntryEditTapField,
    point: {x: number; y: number},
    pointerId: number,
  ): void {
    this.entryEditTap = {
      entryId: entry.id,
      field,
      startX: point.x,
      startY: point.y,
      pointerId,
      time: Date.now(),
    }
  }

  moveCredentialEditTap(point: {x: number; y: number}, pointerId: number): void {
    this.moveEntryEditTap(point, pointerId)
  }

  moveEntryEditTap(point: {x: number; y: number}, pointerId: number): void {
    const current = this.entryEditTap
    if (!current || current.pointerId !== pointerId) return

    const deltaX = Math.abs(point.x - current.startX)
    const deltaY = Math.abs(point.y - current.startY)
    if (
      deltaX <= PMEntryEditModel.ENTRY_EDIT_TAP_MOVE_GUARD &&
      deltaY <= PMEntryEditModel.ENTRY_EDIT_TAP_MOVE_GUARD
    ) {
      return
    }

    this.cancelEntryEditTap()
  }

  endCredentialEditTap(point: {x: number; y: number}, pointerId: number, entry: Entry): boolean {
    const field = this.consumeEntryEditTap(point, pointerId, entry)
    if (field !== 'username' && field !== 'password') {
      return false
    }

    this.beginCredentialEntryEdit(entry, field)
    return true
  }

  endNoteEntryEditTap(point: {x: number; y: number}, pointerId: number, entry: Entry): boolean {
    const field = this.consumeEntryEditTap(point, pointerId, entry)
    if (field !== 'note') {
      return false
    }

    this.beginNoteEntryEdit(entry)
    return true
  }

  endTitleEntryEditTap(point: {x: number; y: number}, pointerId: number, entry: Entry): boolean {
    const field = this.consumeEntryEditTap(point, pointerId, entry)
    if (field !== 'title') {
      return false
    }

    this.beginTitleEntryEdit(entry)
    return true
  }

  private consumeEntryEditTap(
    point: {x: number; y: number},
    pointerId: number,
    entry: Entry,
  ): PMEntryEditTapField | null {
    const current = this.entryEditTap
    if (!current || current.pointerId !== pointerId || current.entryId !== entry.id) return null

    this.entryEditTap = null
    const deltaX = Math.abs(point.x - current.startX)
    const deltaY = Math.abs(point.y - current.startY)
    if (
      deltaX > PMEntryEditModel.ENTRY_EDIT_TAP_MOVE_GUARD ||
      deltaY > PMEntryEditModel.ENTRY_EDIT_TAP_MOVE_GUARD
    ) {
      this.lastEntryEditTap = null
      return null
    }

    const now = Date.now()
    if (now - current.time > PMEntryEditModel.ENTRY_EDIT_TAP_MAX_MS) {
      this.lastEntryEditTap = null
      return null
    }

    const previousTap = this.lastEntryEditTap
    const isDoubleTap =
      Boolean(previousTap) &&
      previousTap!.entryId === entry.id &&
      previousTap!.field === current.field &&
      now - previousTap!.time <= PMEntryEditModel.ENTRY_EDIT_DOUBLE_TAP_MS &&
      Math.hypot(point.x - previousTap!.x, point.y - previousTap!.y) <=
        PMEntryEditModel.ENTRY_EDIT_DOUBLE_TAP_DISTANCE

    this.lastEntryEditTap = isDoubleTap
      ? null
      : {
          entryId: entry.id,
          field: current.field,
          x: point.x,
          y: point.y,
          time: now,
        }

    if (!isDoubleTap) {
      return null
    }

    return current.field
  }

  cancelCredentialEditTap(): void {
    this.cancelEntryEditTap()
  }

  cancelEntryEditTap(): void {
    this.entryEditTap = null
    this.lastEntryEditTap = null
  }

  clearCredentialEditTap(): void {
    this.clearEntryEditTap()
  }

  clearEntryEditTap(): void {
    this.cancelEntryEditTap()
  }

  beginCredentialEntryEdit(entry: Entry, field: PMEntryCredentialEditField): void {
    if (isPassmanagerReadOnlyOrMissing()) return
    if (entry.entryType === 'payment_card') return

    this.clearEntryEditTap()
    this.beginEntryEdit(entry, field)
  }

  beginNoteEntryEdit(entry: Entry): void {
    this.clearEntryEditTap()
    this.beginEntryEdit(entry, 'note')
  }

  beginTitleEntryEdit(entry: Entry): void {
    this.clearEntryEditTap()
    this.beginEntryEdit(entry, 'title')
  }

  beginEntryEdit(entry: Entry, focusField?: PMEntryEditFocusField): void {
    if (isPassmanagerReadOnlyOrMissing()) return
    if (entry.entryType === 'payment_card') {
      this.beginPaymentCardEdit(entry)
      return
    }

    pmEntryEditorModel.openSurface(entry.id, 'entry')
    this.inlineField.set(null)
    this.inlineError.set('')
    this.inlineSaving.set(false)
    this.seedEntryEditDrafts(entry)
    if (focusField) {
      this.entryEditFocusRequest.set({
        field: focusField,
        token: this.nextEntryEditFocusToken,
      })
      this.nextEntryEditFocusToken += 1
    }
  }

  beginInlineIconEdit(entry: Entry): void {
    if (isPassmanagerReadOnlyOrMissing()) return

    const activeSurface = pmEntryEditorModel.isActiveForEntry(entry.id) ? pmEntryEditorModel.activeSurface() : null
    if (activeSurface === 'entry' || activeSurface === 'payment-card') {
      this.inlineError.set('')
      return
    }

    this.resetInlineEditState()
    this.clearEditIntent()
    this.inlineIconRef.set(entry.iconRef)
    this.inlineError.set('')
  }

  cancelInlineEdit(): void {
    pmEntryEditorModel.closeSurface()
    this.resetInlineEditState()
  }

  cancelEntryEdit(entry?: Entry): void {
    if (entry && !pmEntryEditorModel.isActiveForEntry(entry.id)) {
      return
    }

    pmEntryEditorModel.closeSurface(entry?.id)
    this.entryEditDraftEntryId = undefined
    this.resetEntryEditSecretTracking()
    this.resetInlineEditState()
    this.noteError.set('')
    this.noteSaving.set(false)
    this.sectionSnippet.set(null)
    this.entryEditFocusRequest.set(null)
    this.clearEntryEditTap()
  }

  private resetInlineEditState(): void {
    this.inlineField.set(null)
    this.inlineIconRef.set(undefined)
    this.inlinePasswordGeneratorOpen.set(false)
    this.inlinePasswordStrengthScore.set(null)
    this.inlineError.set('')
    this.inlineSaving.set(false)
  }

  setInlineDraft(field: PMEntryInlineField, value: string): void {
    switch (field) {
      case 'title':
        this.inlineTitle.set(value)
        break
      case 'username':
        this.inlineUsername.set(value)
        break
      case 'password':
        this.inlinePassword.set(value)
        this.entryEditPasswordDirty = this.isSecretDraftDirty(value, this.entryEditPasswordBaseline)
        this.updateInlinePasswordStrength(value)
        break
      case 'website':
        this.inlineWebsite.set(value)
        break
    }

    this.inlineError.set('')
  }

  setInlinePasswordGenLength(value: number): void {
    if (!Number.isFinite(value)) return
    this.inlinePasswordGenLength.set(Math.min(128, Math.max(4, Math.round(value))))
  }

  toggleInlinePasswordCharset(charset: PMEntryMobilePasswordCharset): void {
    switch (charset) {
      case 'lowercase':
        this.inlinePasswordGenLowercase.set(!this.inlinePasswordGenLowercase())
        return
      case 'uppercase':
        this.inlinePasswordGenUppercase.set(!this.inlinePasswordGenUppercase())
        return
      case 'digits':
        this.inlinePasswordGenDigits.set(!this.inlinePasswordGenDigits())
        return
      case 'symbols':
        this.inlinePasswordGenSymbols.set(!this.inlinePasswordGenSymbols())
        return
    }
  }

  toggleInlinePasswordGenerator(): void {
    this.inlinePasswordGeneratorOpen.set(!this.inlinePasswordGeneratorOpen())
  }

  generateInlinePassword(): void {
    const password = generatePasswordWithOptions({
      length: this.inlinePasswordGenLength(),
      sets: {
        lowercase: this.inlinePasswordGenLowercase(),
        uppercase: this.inlinePasswordGenUppercase(),
        digits: this.inlinePasswordGenDigits(),
        symbols: this.inlinePasswordGenSymbols(),
      },
    })

    this.inlinePassword.set(password)
    this.entryEditPasswordDirty = this.isSecretDraftDirty(password, this.entryEditPasswordBaseline)
    this.updateInlinePasswordStrength(password)
    this.inlineError.set('')
  }

  setInlineIconRef(value: string | undefined): void {
    this.inlineIconRef.set(value)
    this.inlineError.set('')
  }

  async saveInlineIcon(entry: Entry, iconRef: string | undefined): Promise<boolean> {
    if (this.inlineSaving()) return false

    this.inlineSaving.set(true)
    this.inlineError.set('')
    this.inlineIconRef.set(iconRef)

    try {
      await wrap(
        entry.update(
          {
            ...entry.data(),
            iconRef: iconRef || undefined,
          },
          undefined,
          undefined,
        ),
      )

      return true
    } catch (error) {
      this.inlineError.set((error as Error).message || i18n('error:save'))
      return false
    } finally {
      this.inlineSaving.set(false)
    }
  }

  async saveInlineEdit(entry: Entry): Promise<boolean> {
    const field = this.inlineField()
    if (!field || this.inlineSaving()) return false

    this.inlineSaving.set(true)
    this.inlineError.set('')

    try {
      switch (field) {
        case 'title':
          if (!this.inlineTitle().trim()) {
            this.inlineError.set(i18n('error:title_required'))
            this.inlineSaving.set(false)
            return false
          }

          await wrap(
            entry.update(
              {
                ...entry.data(),
                title: this.inlineTitle(),
              },
              undefined,
              undefined,
            ),
          )
          break
        case 'username':
          if (entry.entryType === 'payment_card') {
            this.inlineSaving.set(false)
            return false
          }
          await wrap(
            entry.update(
              {
                ...entry.data(),
                username: this.inlineUsername(),
              },
              undefined,
              undefined,
            ),
          )
          break
        case 'password':
          if (entry.entryType === 'payment_card') {
            this.inlineSaving.set(false)
            return false
          }
          await wrap(entry.update({...entry.data()}, this.inlinePassword(), undefined))
          this.actions.applySavedSecrets({password: this.inlinePassword()})
          break
        case 'website': {
          if (entry.entryType === 'payment_card') {
            this.inlineSaving.set(false)
            return false
          }
          const nextUrls = this.resolveNextUrls(entry)
          if (!nextUrls) {
            this.inlineSaving.set(false)
            return false
          }

          await wrap(
            entry.update(
              {
                ...entry.data(),
                urls: nextUrls,
              },
              undefined,
              undefined,
            ),
          )
          break
        }
      }

      this.cancelInlineEdit()
      return true
    } catch (error) {
      this.inlineError.set((error as Error).message || i18n('error:save'))
      this.inlineSaving.set(false)
      return false
    }
  }

  async saveEntryEdit(entry: Entry): Promise<boolean> {
    if (entry.entryType === 'payment_card') {
      return this.savePaymentCardEdit(entry)
    }

    if (this.inlineSaving()) return false

    if (!this.inlineTitle().trim()) {
      this.inlineError.set(i18n('error:title_required'))
      return false
    }

    const nextUrls = this.resolveNextUrls(entry)
    if (!nextUrls) {
      return false
    }

    this.inlineSaving.set(true)
    this.inlineError.set('')

    try {
      const nextPassword = this.entryEditPasswordDirty ? this.inlinePassword() : undefined
      const nextNote = this.entryEditNoteDirty ? this.noteDraft() : undefined

      await wrap(
        entry.update(
          {
            ...entry.data(),
            title: this.inlineTitle(),
            username: this.inlineUsername(),
            urls: nextUrls,
            iconRef: this.inlineIconRef() || undefined,
          },
          nextPassword,
          nextNote,
        ),
      )

      this.actions.applySavedSecrets({
        ...(nextPassword === undefined ? {} : {password: nextPassword}),
        ...(nextNote === undefined ? {} : {note: nextNote}),
      })
      this.cancelEntryEdit(entry)
      return true
    } catch (error) {
      this.inlineError.set((error as Error).message || i18n('error:save'))
      this.inlineSaving.set(false)
      return false
    }
  }

  private seedEntryEditDrafts(entry: Entry): void {
    if (this.entryEditDraftEntryId === entry.id) {
      return
    }

    this.entryEditDraftEntryId = entry.id
    this.inlineTitle.set(entry.title ?? '')
    this.inlineUsername.set(entry.username ?? '')
    const passwordResource = this.state.passwordResource()
    const passwordDraft = passwordResource.status === 'ready' ? passwordResource.value : ''
    this.entryEditPasswordBaseline = passwordResource.status === 'ready' ? passwordResource.value : undefined
    this.inlinePassword.set(passwordDraft)
    this.updateInlinePasswordStrength(this.inlinePassword())
    this.inlinePasswordGeneratorOpen.set(false)
    this.inlineWebsite.set(entry.urls.map((item) => item.value).join(', '))
    this.inlineIconRef.set(entry.iconRef)
    const noteResource = this.state.noteResource()
    this.entryEditNoteBaseline = noteResource.status === 'ready' ? noteResource.value : undefined
    this.noteDraft.set(noteResource.status === 'ready' ? noteResource.value : '')
    this.entryEditPasswordDirty = false
    this.entryEditNoteDirty = false
    this.noteError.set('')
    this.tagDraft.set(entry.tags)
    this.tagInput.set('')
    this.tagError.set('')
    this.tagSaving.set(false)
  }

  private isSecretDraftDirty(value: string, baseline: string | undefined): boolean {
    return value !== (baseline ?? '')
  }

  private resetEntryEditSecretTracking(): void {
    this.entryEditPasswordBaseline = undefined
    this.entryEditNoteBaseline = undefined
    this.entryEditPasswordDirty = false
    this.entryEditNoteDirty = false
  }

  private canOpenSectionSnippet(entry: Entry, surface: 'otp' | 'ssh'): boolean {
    if (!pmEntryEditorModel.isActiveForEntry(entry.id)) {
      return true
    }

    return pmEntryEditorModel.activeSurface() === surface
  }

  private resolveNextUrls(entry: Entry): UrlRule[] | null {
    const inlineWebsite = this.inlineWebsite()
    const normalizedCurrent = this.normalizeUrlsText(entry.urls.map((item) => item.value).join(', '))
    const normalizedNext = this.normalizeUrlsText(inlineWebsite)

    if (normalizedCurrent === normalizedNext) {
      return [...entry.data().urls]
    }

    const result = this.urlValidator.validate(transformUrls(inlineWebsite))
    const invalid = result.errors[0]?.value
    if (invalid) {
      this.inlineError.set(i18n('error:invalid_url_rule', {invalid}))
      return null
    }

    return result.rules
  }

  private normalizeUrlsText(value: string): string {
    return transformUrls(value)
      .map((item) => item.trim())
      .filter(Boolean)
      .join(',')
  }

  private updateInlinePasswordStrength(value: string): void {
    if (!value) {
      this.inlinePasswordStrengthScore.set(null)
      return
    }

    try {
      const result = estimatePasswordStrength(value)
      this.inlinePasswordStrengthScore.set(result.score)
    } catch (error) {
      console.warn('[entry-mobile] failed to estimate password strength', error)
    }
  }

  protected override buildEntryData(card: Entry): PMEntryEditData {
    const base = super.buildEntryData(card)
    const isReadOnly = isPassmanagerReadOnlyOrMissing()
    const canEdit = !isReadOnly
    const activeSurface = pmEntryEditorModel.isActiveForEntry(card.id) ? pmEntryEditorModel.activeSurface() : null
    const hasActiveEditorSurface = activeSurface !== null
    const isEditingEntry =
      activeSurface === 'entry' || (card.entryType === 'payment_card' && activeSurface === 'payment-card')

    if (card.entryType === 'payment_card') {
      return {
        ...base,
        title: base.entryTitleText,
        username: base.paymentCardholderName,
        otpCount: 0,
        websiteCount: 0,
        hasSshKeys: false,
        isEditingEntry,
        hasActiveEditorSurface,
        isReadOnly,
        canEditFields: canEdit,
        canEditWebsite: false,
        canAddOtp: false,
        canStartOtpSnippet: false,
        canAddMissingOtpInEntryView: false,
        canManageOtp: false,
        canManageSsh: false,
        canAddSsh: false,
        canStartSshSnippet: false,
        canAddMissingSshInEntryView: false,
        canEditTags: canEdit,
        canEditPaymentCard: canEdit,
        compactMeta: [base.paymentCardExpiryLabel, card.updatedFormatted, card.createdFormatted].filter(Boolean).join(' • '),
      }
    }

    const otpCount = card.otps().length

    return {
      ...base,
      title: base.entryTitleText,
      username: card.username || '—',
      otpCount,
      websiteCount: base.visibleUrls.length,
      hasSshKeys: card.sshKeys.length > 0,
      isEditingEntry,
      hasActiveEditorSurface,
      isReadOnly,
      canEditFields: canEdit,
      canEditWebsite: canEdit,
      canAddOtp: canEdit,
      canStartOtpSnippet: canEdit && !hasActiveEditorSurface,
      canAddMissingOtpInEntryView: canEdit && !hasActiveEditorSurface && otpCount === 0,
      canManageOtp: canEdit && otpCount > 0,
      canManageSsh: canEdit && card.sshKeys.length > 0,
      canAddSsh: canEdit,
      canStartSshSnippet: canEdit && !hasActiveEditorSurface,
      canAddMissingSshInEntryView: canEdit && !hasActiveEditorSurface && card.sshKeys.length === 0,
      canEditTags: canEdit,
      canEditPaymentCard: false,
      compactMeta: [card.updatedFormatted, card.createdFormatted].filter(Boolean).join(' • '),
    }
  }
}
