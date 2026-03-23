import {computed, state} from '@statx/core'

import {HOTP, TOTP} from 'otpauth'

import {estimatePasswordStrength, generatePassword, isLink, transformUrls} from '@project/passmanager'
import type {IEntry, SshKeyType, UrlRule} from '@project/passmanager'
import {tauriInvoke} from 'root/core/transport/tauri/ipc'
import type {AndroidPasswordSavePrefill} from 'root/features/passmanager/models/android-password-save-prefill'
import {PMEntryOtpCreateModel} from '../entry-otp-create/entry-otp-create.model'

export type PMEntryCreateSshResult = {
  fingerprint: string
  keyType: string
  pending?: boolean
}

export type PMEntryCreateSubmitResult =
  | {ok: true}
  | {
      ok: false
      reason: 'missing_title' | 'invalid_otp' | 'passmanager_unavailable'
      message?: string
    }

export class PMEntryCreateModel {
  readonly title = state('')
  readonly username = state('')
  readonly password = state('')
  readonly note = state('')
  readonly urls = state('')

  readonly useOtp = state(false, {name: 'use-otp'})
  readonly otp = new PMEntryOtpCreateModel()

  readonly isEditingPassword = state(false)
  readonly passwordStrengthScore = state<number | null>(null)
  readonly passwordStrengthLabel = state('')
  readonly hasStrength = computed(() => this.passwordStrengthScore() !== null)

  readonly iconRef = state<string | undefined>(undefined)

  readonly useSsh = state(false)
  readonly showSshGenerator = state(false)
  readonly sshGenKeyType = state<SshKeyType>('ed25519')
  readonly sshGenComment = state('')
  readonly sshGenerating = state(false)
  readonly sshGenResult = state<PMEntryCreateSshResult | null>(null)

  reset(): void {
    this.title.set('')
    this.username.set('')
    this.password.set('')
    this.note.set('')
    this.urls.set('')

    this.useOtp.set(false)
    this.otp.reset()

    this.isEditingPassword.set(false)
    this.passwordStrengthScore.set(null)
    this.passwordStrengthLabel.set('')

    this.iconRef.set(undefined)

    this.useSsh.set(false)
    this.showSshGenerator.set(false)
    this.sshGenKeyType.set('ed25519')
    this.sshGenComment.set('')
    this.sshGenerating.set(false)
    this.sshGenResult.set(null)
  }

  setTitle(value: string): void {
    this.title.set(value)
  }

  setUsername(value: string): void {
    this.username.set(value)
  }

  setPassword(value: string): void {
    this.password.set(value)
    this.isEditingPassword.set(Boolean(value))
    this.updateStrength(value)
  }

  setUrls(value: string): void {
    this.urls.set(value)
  }

  setNote(value: string): void {
    this.note.set(value)
  }

  setUseOtp(value: boolean): void {
    this.useOtp.set(value)
  }

  setIconRef(value: string | undefined): void {
    this.iconRef.set(value)
  }

  setUseSsh(value: boolean): void {
    this.useSsh.set(value)
    if (value) {
      this.showSshGenerator.set(true)
      return
    }

    this.showSshGenerator.set(false)
    this.sshGenResult.set(null)
  }

  setSshKeyType(value: SshKeyType): void {
    this.sshGenKeyType.set(value)
  }

  setSshComment(value: string): void {
    this.sshGenComment.set(value)
  }

  requestSshGeneration(): void {
    this.sshGenResult.set({
      fingerprint: '',
      keyType: this.sshGenKeyType(),
      pending: true,
    })
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
      this.setUrls(prefill.urls.trim())
    }
  }

  submit(): PMEntryCreateSubmitResult {
    const passmanager = window.passmanager
    if (!passmanager) {
      return {ok: false, reason: 'passmanager_unavailable'}
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

    const title = this.title().trim()
    if (!title) {
      return {ok: false, reason: 'missing_title'}
    }

    const rawUrls = this.urls().trim()
    const urls = this.buildUrlRules(title, rawUrls)

    const entryData: Partial<IEntry> = {
      title,
      username: this.username(),
      urls,
      iconRef: this.iconRef() || undefined,
    }

    const entry = passmanager.createEntry(entryData, this.password(), this.note(), otp)
    if (entry && this.sshGenResult()) {
      void this.generateSshForEntry(entry)
    }

    return {ok: true}
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

  private buildUrlRules(title: string, rawUrls: string): UrlRule[] {
    if (!rawUrls && isLink(title)) {
      return [{value: title, match: 'base_domain'}]
    }

    if (!rawUrls) {
      return []
    }

    return transformUrls(rawUrls).map((value) => ({value, match: 'base_domain'}))
  }

  private updateStrength(value: string): void {
    if (!value) {
      this.passwordStrengthScore.set(null)
      this.passwordStrengthLabel.set('')
      return
    }

    try {
      const strength = estimatePasswordStrength(value)
      this.passwordStrengthScore.set(strength.score)
      this.passwordStrengthLabel.set(strength.label)
    } catch (error) {
      console.warn('[entry-create] failed to estimate password strength', error)
    }
  }

  private async generateSshForEntry(
    entry: NonNullable<ReturnType<typeof window.passmanager.createEntry>>,
  ): Promise<void> {
    this.sshGenerating.set(true)

    try {
      await entry.flushPendingPersistence()

      const generated = await tauriInvoke<{
        key_id: string
        public_key_openssh: string
        fingerprint: string
        key_type: string
      }>('ssh_keygen', {
        entryId: entry.id,
        keyType: this.sshGenKeyType(),
        comment: this.sshGenComment(),
      })

      await entry.updateSshKeys([
        {
          id: generated.key_id,
          type: generated.key_type as SshKeyType,
          fingerprint: generated.fingerprint,
          comment: this.sshGenComment(),
        },
      ])

      this.sshGenResult.set({
        fingerprint: generated.fingerprint,
        keyType: generated.key_type,
        pending: false,
      })
    } catch (error) {
      console.warn('[ssh] failed to generate key on create', error)
    } finally {
      this.sshGenerating.set(false)
    }
  }
}
