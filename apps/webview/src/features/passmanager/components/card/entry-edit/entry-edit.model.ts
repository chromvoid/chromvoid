import {state} from '@statx/core'

import {
  Entry,
  estimatePasswordStrength,
  generatePasswordWithOptions,
  i18n,
  transformUrls,
  URLValidator,
} from '@project/passmanager'
import type {IEntry, OTPOptions, SshKeyType, UrlRule} from '@project/passmanager'
import {tauriInvoke} from 'root/core/transport/tauri/ipc'
import type {PMEntrySessionModel} from '../entry/entry-session.model'
import type {PMEntrySshGeneratorResult} from '../entry-ssh/entry-ssh-generator'

export type PMEntryEditSubmitResult =
  | {ok: true}
  | {
      ok: false
      reason: 'secrets_loading' | 'validation_error' | 'save_error'
      message?: string
    }

export type PMEntryEditSshGenerateResult =
  | {ok: true}
  | {
      ok: false
      message: string
    }

export class PMEntryEditModel {
  readonly isAddNewOtp = state(false)
  readonly editedTitle = state('')
  readonly editedPassword = state('')
  readonly editedUsername = state('')
  readonly editedUrls = state('')
  readonly urlsPreview = state<string>('')
  readonly editedNote = state('')
  readonly editedIconRef = state<string | undefined>(undefined)

  readonly titleError = state('')
  readonly usernameError = state('')
  readonly urlsError = state('')
  readonly passwordError = state('')

  readonly genLength = state(16)
  readonly genLowercase = state(true)
  readonly genUppercase = state(true)
  readonly genDigits = state(true)
  readonly genSymbols = state(false)
  readonly strengthLabel = state('')
  readonly strengthScore = state(0)

  readonly showGenerator = state(false)

  readonly showSshGenerator = state(false)
  readonly sshGenKeyType = state<SshKeyType>('ed25519')
  readonly sshGenComment = state('')
  readonly sshGenerating = state(false)
  readonly sshGenResult = state<PMEntrySshGeneratorResult | null>(null)

  private readonly secretsLoaded = state(false)
  private passwordDirty = false
  private noteDirty = false
  private loadVersion = 0

  private initialUrlsNormalized = ''
  private initialUrlRules: UrlRule[] = []

  private readonly urlValidator = new URLValidator({defaultMatch: 'base_domain'})

  loadFromEntry(entry: Entry, session: PMEntrySessionModel): void {
    const loadVersion = ++this.loadVersion
    this.reset()

    this.editedTitle.set(entry.title ?? '')
    this.editedUsername.set(entry.username ?? '')
    this.editedIconRef.set(entry.iconRef)

    const urlsText = entry.urls.map((item) => item.value).join(', ')
    this.initialUrlsNormalized = this.normalizeUrlsText(urlsText)
    this.initialUrlRules = [...entry.data().urls]
    this.editedUrls.set(urlsText)
    this.updateUrlsPreview(urlsText)

    void (async () => {
      await session.ensureSecretsLoaded(entry)
      if (loadVersion !== this.loadVersion) return

      const passwordResource = session.passwordResource()
      if (!this.passwordDirty) {
        const nextPassword = passwordResource.status === 'ready' ? passwordResource.value : ''
        this.editedPassword.set(nextPassword)
        this.updateStrength(nextPassword)
      }

      const noteResource = session.noteResource()
      if (!this.noteDirty) {
        const nextNote = noteResource.status === 'ready' ? noteResource.value : ''
        this.editedNote.set(nextNote)
      }

      this.secretsLoaded.set(true)
    })()
  }

  reset(): void {
    this.isAddNewOtp.set(false)
    this.editedTitle.set('')
    this.editedPassword.set('')
    this.editedUsername.set('')
    this.editedUrls.set('')
    this.urlsPreview.set('')
    this.editedNote.set('')
    this.editedIconRef.set(undefined)

    this.titleError.set('')
    this.usernameError.set('')
    this.urlsError.set('')
    this.passwordError.set('')

    this.genLength.set(16)
    this.genLowercase.set(true)
    this.genUppercase.set(true)
    this.genDigits.set(true)
    this.genSymbols.set(false)
    this.strengthLabel.set('')
    this.strengthScore.set(0)

    this.showGenerator.set(false)

    this.showSshGenerator.set(false)
    this.sshGenKeyType.set('ed25519')
    this.sshGenComment.set('')
    this.sshGenerating.set(false)
    this.sshGenResult.set(null)

    this.secretsLoaded.set(false)
    this.passwordDirty = false
    this.noteDirty = false

    this.initialUrlsNormalized = ''
    this.initialUrlRules = []
  }

  setTitle(value: string): void {
    this.editedTitle.set(value)
    this.titleError.set('')
  }

  setPassword(value: string): void {
    this.editedPassword.set(value)
    this.passwordDirty = true
    this.updateStrength(value)
    this.passwordError.set('')
  }

  setUsername(value: string): void {
    this.editedUsername.set(value)
    this.usernameError.set('')
  }

  setUrls(value: string): void {
    this.editedUrls.set(value)
    this.updateUrlsPreview(value)
    this.urlsError.set('')

    const first = transformUrls(value)[0]
    if (!this.editedUsername.peek() && first) {
      const firstEntry = this.urlValidator.validate([first]).entries[0]
      if (firstEntry && firstEntry.kind === 'url') {
        try {
          const url = new URL(firstEntry.normalized)
          const host = url.hostname.replace(/^www\./i, '')
          if (host) this.editedUsername.set(host)
        } catch {}
      }
    }
  }

  setNote(value: string): void {
    this.editedNote.set(value)
    this.noteDirty = true
  }

  setIconRef(value: string | undefined): void {
    this.editedIconRef.set(value)
  }

  setGenLength(value: number): void {
    this.genLength.set(value)
  }

  setGenLowercase(value: boolean): void {
    this.genLowercase.set(value)
  }

  setGenUppercase(value: boolean): void {
    this.genUppercase.set(value)
  }

  setGenDigits(value: boolean): void {
    this.genDigits.set(value)
  }

  setGenSymbols(value: boolean): void {
    this.genSymbols.set(value)
  }

  toggleGenerator(): void {
    this.showGenerator.set(!this.showGenerator())
  }

  generatePassword(): void {
    const pass = generatePasswordWithOptions({
      length: Number(this.genLength()),
      sets: {
        lowercase: !!this.genLowercase(),
        uppercase: !!this.genUppercase(),
        digits: !!this.genDigits(),
        symbols: !!this.genSymbols(),
      },
    })
    this.editedPassword.set(pass)
    this.updateStrength(pass)
  }

  setSshKeyType(value: SshKeyType): void {
    this.sshGenKeyType.set(value)
  }

  setSshComment(value: string): void {
    this.sshGenComment.set(value)
  }

  openSshGenerator(entry: Entry): void {
    this.sshGenComment.set(entry.username ? `${entry.username}@${entry.title || 'key'}` : entry.title || '')
    this.showSshGenerator.set(true)
  }

  cancelSshGenerator(): void {
    this.showSshGenerator.set(false)
    this.sshGenResult.set(null)
  }

  async generateSshKey(entry: Entry): Promise<PMEntryEditSshGenerateResult> {
    this.sshGenerating.set(true)

    try {
      const result = await tauriInvoke<{
        key_id: string
        fingerprint: string
        key_type: string
      }>('ssh_keygen', {
        entryId: entry.id,
        keyType: this.sshGenKeyType(),
        comment: this.sshGenComment(),
      })

      await entry.updateSshKeys([
        ...entry.sshKeys,
        {
          id: result.key_id,
          type: result.key_type as SshKeyType,
          fingerprint: result.fingerprint,
          comment: this.sshGenComment(),
        },
      ])

      this.sshGenResult.set({fingerprint: result.fingerprint, keyType: result.key_type})
      this.showSshGenerator.set(false)
      this.sshGenResult.set(null)

      return {ok: true}
    } catch (error) {
      return {
        ok: false,
        message: (error as Error).message || String(error),
      }
    } finally {
      this.sshGenerating.set(false)
    }
  }

  async removeSshKey(entry: Entry, keyId: string): Promise<void> {
    await entry.removeSshKey(keyId)
  }

  beginAddOtp(): void {
    this.isAddNewOtp.set(true)
  }

  cancelAddOtp(): void {
    this.isAddNewOtp.set(false)
  }

  async saveOtp(entry: Entry, data: OTPOptions | undefined): Promise<void> {
    if (!data) {
      return
    }

    await entry.addOTP(data)
    this.isAddNewOtp.set(false)
  }

  hasOtps(entry: Entry): boolean {
    return entry.otps().length > 0
  }

  showOtpCreateScreen(useOtpSubScreen: boolean): boolean {
    return this.isAddNewOtp() && useOtpSubScreen
  }

  shouldOpenOtpDetails(entry: Entry, useOtpSubScreen: boolean): boolean {
    return this.hasOtps(entry) || (this.isAddNewOtp() && !this.showOtpCreateScreen(useOtpSubScreen))
  }

  async submitEdit(entry: Entry, session: PMEntrySessionModel): Promise<PMEntryEditSubmitResult> {
    if (!this.secretsLoaded()) {
      return {ok: false, reason: 'secrets_loading'}
    }

    if (!this.validate()) {
      return {ok: false, reason: 'validation_error'}
    }

    try {
      const password = this.passwordDirty ? this.editedPassword() : undefined
      const note = this.noteDirty ? this.editedNote() : undefined
      const rawSites = transformUrls(this.editedUrls())

      const nextUrls: UrlRule[] =
        this.normalizeUrlsText(this.editedUrls()) === this.initialUrlsNormalized
          ? this.initialUrlRules
          : this.urlValidator.validate(rawSites).rules

      const next: IEntry = {
        ...entry.data(),
        title: this.editedTitle(),
        username: this.editedUsername(),
        urls: nextUrls,
        iconRef: this.editedIconRef() || undefined,
      }

      await entry.update(next, password, note)
      session.applySavedSecrets({password, note})

      return {ok: true}
    } catch (error) {
      return {
        ok: false,
        reason: 'save_error',
        message: (error as Error).message,
      }
    }
  }

  private updateStrength(value: string): void {
    const result = estimatePasswordStrength(value || '')
    this.strengthLabel.set(result.label)
    this.strengthScore.set(result.score)
  }

  private updateUrlsPreview(value: string): void {
    const result = this.urlValidator.validate(transformUrls(value))
    this.urlsPreview.set(result.entries.map((entry) => entry.normalized).join(', '))
  }

  private normalizeUrlsText(value: string): string {
    return transformUrls(value)
      .map((item) => item.trim())
      .filter(Boolean)
      .join(',')
  }

  private validate(): boolean {
    let isValid = true
    this.titleError.set('')
    this.usernameError.set('')
    this.urlsError.set('')
    this.passwordError.set('')

    if (!this.editedTitle().trim()) {
      this.titleError.set(i18n('error:title_required'))
      isValid = false
    }

    const sites = transformUrls(this.editedUrls())
    if (sites.length > 0) {
      const urlsUnchanged = this.normalizeUrlsText(this.editedUrls()) === this.initialUrlsNormalized
      if (!urlsUnchanged) {
        const result = this.urlValidator.validate(sites)
        const invalid = result.errors[0]?.value
        if (invalid) {
          this.urlsError.set(i18n('error:invalid_url_rule', {invalid}))
          isValid = false
        }
      }
    }

    if (this.editedPassword().length > 0 && this.strengthScore() < 2) {
      this.passwordError.set(i18n('error:password_weak'))
    }

    return isValid
  }
}
