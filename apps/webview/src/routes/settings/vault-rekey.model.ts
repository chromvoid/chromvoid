import {atom, computed, wrap} from '@reatom/core'

import {navigationModel} from 'root/app/navigation/navigation.model'
import {isTauriRuntime} from 'root/core/runtime/runtime'
import {tauriInvoke, tauriListen, type UnlistenFn} from 'root/core/transport/tauri/ipc'
import {i18n} from 'root/i18n'
import {getAppContext} from 'root/shared/services/app-context'

type RpcOk<T> = {ok: true; result: T}
type RpcErr = {ok: false; error: string; code?: string | null}
type RpcResult<T> = RpcOk<T> | RpcErr

type VaultRekeyPhase =
  | 'preparing'
  | 'scanning'
  | 'writing'
  | 'validating'
  | 'committing'
  | 'cleaning'
  | 'completed'

export interface VaultRekeyProgressEvent {
  phase: VaultRekeyPhase
  processed_chunks: number
  total_chunks: number
  can_cancel: boolean
}

interface VaultRekeyResult {
  backup_recommended?: boolean
}

function isOk<T>(res: RpcResult<T>): res is RpcOk<T> {
  return typeof res === 'object' && res !== null && 'ok' in res && res.ok === true
}

class VaultRekeyModel {
  readonly currentPassword = atom('')
  readonly newPassword = atom('')
  readonly confirmPassword = atom('')
  readonly busy = atom(false)
  readonly isCancelling = atom(false)
  readonly progress = atom<VaultRekeyProgressEvent | null>(null)
  readonly error = atom('')
  readonly success = atom(false)
  readonly backupRecommended = atom(false)

  readonly newPasswordTooShort = computed(
    () => this.newPassword().length > 0 && this.newPassword().length < 8,
  )
  readonly passwordMismatch = computed(
    () => this.confirmPassword().length > 0 && this.newPassword() !== this.confirmPassword(),
  )
  readonly samePassword = computed(
    () =>
      this.currentPassword().length > 0 &&
      this.newPassword().length > 0 &&
      this.currentPassword() === this.newPassword(),
  )
  readonly inlineValidationMessage = computed(() => {
    if (this.newPasswordTooShort()) return i18n('settings:vault-password-too-short')
    if (this.samePassword()) return i18n('settings:vault-password-same')
    if (this.passwordMismatch()) return i18n('settings:vault-password-mismatch')
    return ''
  })
  readonly canSubmit = computed(
    () =>
      !this.busy() &&
      this.currentPassword().length > 0 &&
      this.newPassword().length >= 8 &&
      this.confirmPassword().length > 0 &&
      this.newPassword() === this.confirmPassword() &&
      this.currentPassword() !== this.newPassword(),
  )
  readonly canCancel = computed(() => {
    const progress = this.progress()
    return this.busy() && !this.isCancelling() && progress?.can_cancel === true
  })
  readonly progressPercent = computed(() => {
    const progress = this.progress()
    if (!progress) return 0
    if (progress.phase === 'completed') return 100
    if (progress.total_chunks <= 0) return 0
    return Math.min(100, Math.round((progress.processed_chunks / progress.total_chunks) * 100))
  })
  readonly progressPhaseLabel = computed(() => {
    const progress = this.progress()
    if (!progress) return i18n('settings:vault-password-phase-preparing')
    return this.phaseLabel(progress.phase)
  })
  readonly progressSummary = computed(() => {
    const progress = this.progress()
    if (!progress || progress.total_chunks <= 0) return i18n('settings:vault-password-progress-starting')
    return i18n('settings:vault-password-progress-summary', {
      done: progress.processed_chunks,
      total: progress.total_chunks,
    })
  })
  readonly successVisible = computed(() => this.success())
  readonly backupRecommendationVisible = computed(() => this.success() && this.backupRecommended())

  private progressUnlisten: UnlistenFn | null = null

  setCurrentPassword(value: string): void {
    this.currentPassword.set(value)
    this.clearTransientState()
  }

  setNewPassword(value: string): void {
    this.newPassword.set(value)
    this.clearTransientState()
  }

  setConfirmPassword(value: string): void {
    this.confirmPassword.set(value)
    this.clearTransientState()
  }

  reset(): void {
    this.currentPassword.set('')
    this.newPassword.set('')
    this.confirmPassword.set('')
    this.busy.set(false)
    this.isCancelling.set(false)
    this.progress.set(null)
    this.error.set('')
    this.success.set(false)
    this.backupRecommended.set(false)
    this.cleanupProgressListener()
  }

  async submit(): Promise<void> {
    const validationError = this.getSubmitValidationError()
    if (validationError) {
      this.error.set(validationError)
      this.success.set(false)
      return
    }
    if (!isTauriRuntime()) {
      this.error.set(i18n('settings:vault-password-unavailable'))
      this.success.set(false)
      return
    }

    this.busy.set(true)
    this.isCancelling.set(false)
    this.error.set('')
    this.success.set(false)
    this.backupRecommended.set(false)
    this.progress.set({
      phase: 'preparing',
      processed_chunks: 0,
      total_chunks: 0,
      can_cancel: true,
    })

    try {
      await wrap(this.startProgressListener())
      const result = await wrap(
        tauriInvoke<RpcResult<VaultRekeyResult>>('vault_rekey', {
          currentPassword: this.currentPassword(),
          newPassword: this.newPassword(),
        }),
      )

      if (!isOk(result)) {
        this.error.set(this.errorLabel(result.error, result.code))
        this.success.set(false)
        return
      }

      this.currentPassword.set('')
      this.newPassword.set('')
      this.confirmPassword.set('')
      this.progress.set({
        phase: 'completed',
        processed_chunks: this.progress()?.total_chunks ?? 0,
        total_chunks: this.progress()?.total_chunks ?? 0,
        can_cancel: false,
      })
      this.success.set(true)
      this.backupRecommended.set(result.result.backup_recommended !== false)
      getAppContext().store.pushNotification('success', i18n('settings:vault-password-success-title'))
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error))
      this.success.set(false)
    } finally {
      this.busy.set(false)
      this.isCancelling.set(false)
      this.cleanupProgressListener()
    }
  }

  async cancel(): Promise<void> {
    if (!isTauriRuntime() || !this.canCancel()) return
    this.isCancelling.set(true)
    try {
      const result = await wrap(
        tauriInvoke<RpcResult<{cancelled: boolean; operation: string}>>('vault_rekey_cancel'),
      )
      if (!isOk(result)) {
        this.isCancelling.set(false)
        this.error.set(result.error || i18n('settings:vault-password-cancel-failed'))
      }
    } catch (error) {
      this.isCancelling.set(false)
      this.error.set(error instanceof Error ? error.message : String(error))
    }
  }

  openBackupSurface(): void {
    navigationModel.navigateToSurface('remote-storage')
  }

  private clearTransientState(): void {
    if (this.busy()) return
    this.error.set('')
    this.success.set(false)
    this.backupRecommended.set(false)
  }

  private getSubmitValidationError(): string {
    if (this.currentPassword().length === 0) return i18n('settings:vault-password-current-required')
    if (this.newPassword().length < 8) return i18n('settings:vault-password-too-short')
    if (this.currentPassword() === this.newPassword()) return i18n('settings:vault-password-same')
    if (this.newPassword() !== this.confirmPassword()) return i18n('settings:vault-password-mismatch')
    return ''
  }

  private async startProgressListener(): Promise<void> {
    this.cleanupProgressListener()
    this.progressUnlisten = await wrap(
      tauriListen<VaultRekeyProgressEvent>('vault:rekey:progress', (event) => {
        this.progress.set(event)
      }),
    )
  }

  private cleanupProgressListener(): void {
    if (!this.progressUnlisten) return
    this.progressUnlisten()
    this.progressUnlisten = null
  }

  private phaseLabel(phase: VaultRekeyPhase): string {
    switch (phase) {
      case 'preparing':
        return i18n('settings:vault-password-phase-preparing')
      case 'scanning':
        return i18n('settings:vault-password-phase-scanning')
      case 'writing':
        return i18n('settings:vault-password-phase-writing')
      case 'validating':
        return i18n('settings:vault-password-phase-validating')
      case 'committing':
        return i18n('settings:vault-password-phase-committing')
      case 'cleaning':
        return i18n('settings:vault-password-phase-cleaning')
      case 'completed':
        return i18n('settings:vault-password-phase-completed')
    }
  }

  private errorLabel(error: string, code?: string | null): string {
    switch (code) {
      case 'REKEY_INVALID_CURRENT_PASSWORD':
        return i18n('settings:vault-password-wrong-current')
      case 'REKEY_PASSWORD_POLICY':
        return error || i18n('settings:vault-password-policy-error')
      case 'REKEY_CANCELLED':
        return i18n('settings:vault-password-cancelled')
      case 'REKEY_ALREADY_IN_PROGRESS':
        return i18n('settings:vault-password-already-running')
      case 'UNSUPPORTED_REMOTE_MODE':
        return i18n('settings:vault-password-unsupported-mode')
      default:
        return error || i18n('settings:vault-password-error')
    }
  }
}

export const vaultRekeyModel = new VaultRekeyModel()
