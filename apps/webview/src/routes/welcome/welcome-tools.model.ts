import {atom, computed, wrap} from '@reatom/core'
import {open} from '@tauri-apps/plugin-dialog'

import {isTauriRuntime} from 'root/core/runtime/runtime'
import {guidanceModel} from 'root/core/guidance'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {tauriInvoke, tauriListen, type UnlistenFn} from 'root/core/transport/tauri/ipc'
import {i18n} from 'root/i18n'
import {getAppContext} from 'root/shared/services/app-context'
import {dialogService} from 'root/shared/services/dialog'
import {toast} from 'root/shared/services/toast-manager'

import {WelcomeSharedModel} from './welcome-shared.model'
import {openWelcomeMasterRekeyDialog} from './welcome-master-rekey-dialog'

type RpcOk<T> = {ok: true; result: T}
type RpcErr = {ok: false; error: string; code?: string | null}
type RpcResult<T> = RpcOk<T> | RpcErr
type RpcCommandResult<T> = RpcResult<T>

const DEFAULT_STORAGE_ROOT = 'storage'

type TransferPhase = 'starting' | 'metadata' | 'chunks' | 'finishing'

type BackupProgressEvent = {
  backup_id: string
  phase: TransferPhase
  chunk_index: number
  chunk_count: number
  bytes_written: number
  estimated_size: number
}

type RestoreProgressEvent = {
  restore_id: string
  phase: TransferPhase
  chunk_index: number
  chunk_count: number
  bytes_written: number
  estimated_size: number
}

type RestoreLocalSourceSelected = {
  backup_path: string
  display_name: string
}

type MasterRekeyResult = {
  rewrapped_artifacts: string[]
  backup_recommended: boolean
}

function isOk<T>(res: RpcResult<T>): res is RpcOk<T> {
  return typeof res === 'object' && res !== null && 'ok' in res && (res as {ok: unknown}).ok === true
}

export class WelcomeToolsModel {
  readonly shared: WelcomeSharedModel
  readonly backupInProgress!: ReturnType<typeof computed<boolean>>
  readonly backupCancelling!: ReturnType<typeof computed<boolean>>
  readonly backupProgressPercent!: ReturnType<typeof computed<number>>
  readonly restoreInProgress!: ReturnType<typeof computed<boolean>>
  readonly restoreCancelling!: ReturnType<typeof computed<boolean>>
  readonly restoreProgressPercent!: ReturnType<typeof computed<number>>
  readonly storePath!: ReturnType<typeof computed<string>>
  readonly isDesktopRuntime!: ReturnType<typeof computed<boolean>>
  readonly supportsStorageRootSelection!: ReturnType<typeof computed<boolean>>
  readonly supportsMobileBackupRestore!: ReturnType<typeof computed<boolean>>
  readonly supportsAndroidSafBackupRestore!: ReturnType<typeof computed<boolean>>
  readonly backupProgress = atom<BackupProgressEvent | null>(null)
  readonly restoreProgress = atom<RestoreProgressEvent | null>(null)
  readonly masterRekeyInProgress = atom(false)

  private readonly backupState = atom({
    inProgress: false,
    cancelling: false,
  })

  private readonly restoreState = atom({
    inProgress: false,
    cancelling: false,
  })
  private readonly privacyMode = atom(false)
  private backupProgressUnlisten: UnlistenFn | null = null
  private restoreProgressUnlisten: UnlistenFn | null = null

  constructor(shared: WelcomeSharedModel) {
    this.shared = shared
    this.backupInProgress = computed<boolean>(() => this.shared.busy() && this.backupState().inProgress)
    this.backupCancelling = computed<boolean>(() => this.backupState().cancelling)
    this.backupProgressPercent = computed<number>(() => {
      const progress = this.backupProgress()
      if (!progress || progress.estimated_size === 0) return 0
      return Math.min(100, Math.round((progress.bytes_written / progress.estimated_size) * 100))
    })
    this.restoreInProgress = computed<boolean>(() => this.shared.busy() && this.restoreState().inProgress)
    this.restoreCancelling = computed<boolean>(() => this.restoreState().cancelling)
    this.restoreProgressPercent = computed<number>(() => {
      const progress = this.restoreProgress()
      if (!progress) return 0
      if (progress.estimated_size > 0) {
        return Math.min(100, Math.round((progress.bytes_written / progress.estimated_size) * 100))
      }
      if (progress.chunk_count > 0) {
        return Math.min(100, Math.round((progress.chunk_index / progress.chunk_count) * 100))
      }
      return 0
    })
    this.storePath = computed<string>(() => String(getAppContext().state.data().StorePath ?? ''))
    this.isDesktopRuntime = computed<boolean>(() => isTauriRuntime() && getRuntimeCapabilities().desktop)
    this.supportsStorageRootSelection = computed<boolean>(
      () => isTauriRuntime() && getRuntimeCapabilities().supports_storage_root_selection,
    )
    this.supportsMobileBackupRestore = computed<boolean>(
      () => isTauriRuntime() && getRuntimeCapabilities().supports_mobile_backup_restore,
    )
    this.supportsAndroidSafBackupRestore = this.supportsMobileBackupRestore
  }

  disconnect(): void {
    this.clearBackupProgressListener()
    this.clearRestoreProgressListener()
  }

  get isPrivacyMode() {
    return this.privacyMode
  }

  get busy() {
    return this.shared.busy
  }

  togglePrivacy = () => {
    this.privacyMode.set(!this.privacyMode())
  }

  onBackupClick = async () => {
    if (!isTauriRuntime()) return
    if (this.shared.busy()) return

    const targetDir = this.supportsMobileBackupRestore()
      ? undefined
      : await wrap(open(
          {
            directory: true,
            multiple: false,
            title: i18n('welcome:backup-destination'),
            defaultPath: this.storePath() || undefined,
          },
        ))
    if (!this.supportsMobileBackupRestore() && !targetDir) return

    const pwd = await wrap(dialogService.showInputDialog({
      title: i18n('backup:title'),
      label: i18n('welcome:master-password'),
      type: 'password',
      required: true,
    }))
    if (!pwd) return

    try {
      this.backupState.set({inProgress: true, cancelling: false})
      this.backupProgress.set(null)
      this.shared.setBusy(true)
      await wrap(this.startBackupProgressListener())
      const args: {masterPassword: string; targetDir?: string} = {
        masterPassword: pwd,
      }
      if (typeof targetDir === 'string') {
        args.targetDir = targetDir
      }
      const res = await wrap(tauriInvoke<RpcCommandResult<{backup_dir: string}>>('backup_local_create', args))

      if (!isOk(res)) {
        if (res.code === 'CANCELLED') return
        throw new Error(res.error)
      }

      guidanceModel.emitDomainEvent('backup.created')
      getAppContext().store.pushNotification('success', i18n('welcome:backup-created', {path: res.result.backup_dir}))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      this.clearBackupProgressListener()
      this.backupProgress.set(null)
      this.backupState.set({inProgress: false, cancelling: false})
      this.shared.setBusy(false)
    }
  }

  cancelBackup = async () => {
    if (!isTauriRuntime()) return
    if (!this.backupState().inProgress) return
    if (this.backupState().cancelling) return

    this.backupState.set({...this.backupState(), cancelling: true})

    try {
      const res = await wrap(
        tauriInvoke<RpcCommandResult<{cancelled: boolean; operation: string}>>('backup_local_cancel'),
      )
      if (!isOk(res)) {
        this.backupState.set({...this.backupState(), cancelling: false})
        toast.error(res.error || i18n('remote-storage:cancel-export-request-failed'))
      }
    } catch (error) {
      this.backupState.set({...this.backupState(), cancelling: false})
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  onRestoreClick = async () => {
    if (!isTauriRuntime()) return
    if (this.shared.busy()) return

    const confirmed = await wrap(
      dialogService.showConfirmDialog({
        title: i18n('restore:title'),
        message: i18n('onboard:restore:warning'),
        confirmText: i18n('button:continue'),
        confirmVariant: 'danger',
      }),
    )
    if (!confirmed) return

    const backupPath = await wrap(this.selectRestoreBackupPath())
    if (!backupPath) return

    const pwd = await wrap(
      dialogService.showInputDialog({
        title: i18n('welcome:restore-title'),
        label: i18n('welcome:master-password'),
        type: 'password',
        required: true,
      }),
    )
    if (!pwd) return

    try {
      this.restoreState.set({inProgress: true, cancelling: false})
      this.restoreProgress.set(null)
      this.shared.setBusy(true)
      await wrap(this.startRestoreProgressListener())
      const args: {masterPassword: string; backupPath?: string} = {
        masterPassword: pwd,
      }
      if (typeof backupPath === 'string') {
        args.backupPath = backupPath
      }
      const res = await wrap(tauriInvoke<RpcCommandResult<unknown>>('restore_local_from_folder', args))

      if (!isOk(res)) {
        if (res.code === 'CANCELLED') {
          toast.info(i18n('welcome:restore-cancelled'))
        } else {
          throw new Error(res.error)
        }
      } else {
        guidanceModel.emitDomainEvent('restore.started')
        toast.success(i18n('onboard:restore:success'))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      this.clearRestoreProgressListener()
      this.restoreProgress.set(null)
      this.restoreState.set({inProgress: false, cancelling: false})
      this.shared.setBusy(false)
    }
  }

  private async selectRestoreBackupPath(): Promise<string | undefined> {
    if (this.supportsMobileBackupRestore()) {
      try {
        const res = await wrap(
          tauriInvoke<RpcCommandResult<RestoreLocalSourceSelected>>('restore_local_select_source'),
        )
        if (!isOk(res)) {
          if (res.code !== 'CANCELLED') {
            toast.error(res.error)
          }
          return undefined
        }
        return res.result.backup_path
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error))
        return undefined
      }
    }

    const selected = await wrap(
      open({
        directory: true,
        multiple: false,
        title: i18n('welcome:backup-folder'),
        defaultPath: this.storePath() || undefined,
      }),
    )
    return typeof selected === 'string' ? selected : undefined
  }

  cancelRestore = async () => {
    if (!isTauriRuntime()) return
    if (!this.restoreState().inProgress) return
    if (this.restoreState().cancelling) return

    this.restoreState.set({...this.restoreState(), cancelling: true})

    try {
      const res = await wrap(
        tauriInvoke<RpcCommandResult<{cancelled: boolean; operation: string}>>('restore_local_cancel'),
      )
      if (!isOk(res)) {
        this.restoreState.set({...this.restoreState(), cancelling: false})
        toast.error(res.error || i18n('welcome:restore-cancel-request-failed'))
      }
    } catch (error) {
      this.restoreState.set({...this.restoreState(), cancelling: false})
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  onEraseClick = async () => {
    if (!isTauriRuntime()) return
    if (this.shared.busy()) return

    const confirmed = await wrap(
      dialogService.showConfirmDialog({
        title: i18n('welcome:erase-device-title'),
        message: i18n('onboard:erase:confirm:text'),
        confirmText: i18n('button:erase'),
        confirmVariant: 'danger',
      }),
    )
    if (!confirmed) return

    const pwd = await wrap(
      dialogService.showInputDialog({
        title: i18n('welcome:erase-device-title'),
        label: i18n('welcome:master-password'),
        type: 'password',
        required: true,
      }),
    )
    if (!pwd) return

    try {
      this.shared.setBusy(true)
      const res = await wrap(
        tauriInvoke<RpcCommandResult<unknown>>('erase_device', {
          masterPassword: pwd,
          confirm: true,
        }),
      )
      if (!isOk(res)) throw new Error(res.error)
      toast.success(i18n('welcome:device-erased'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      this.shared.setBusy(false)
    }
  }

  onMasterPasswordChangeClick = async () => {
    if (!isTauriRuntime()) return
    if (this.shared.busy()) return

    const input = await wrap(openWelcomeMasterRekeyDialog())
    if (!input) return

    try {
      this.masterRekeyInProgress.set(true)
      this.shared.setBusy(true)
      const res = await wrap(
        tauriInvoke<RpcCommandResult<MasterRekeyResult>>('master_rekey', {
          currentPassword: input.currentPassword,
          newMasterPassword: input.newMasterPassword,
        }),
      )
      if (!isOk(res)) {
        throw new Error(this.getMasterRekeyErrorMessage(res))
      }
      getAppContext().store.pushNotification('success', i18n('changepwd:success'))
    } catch (error) {
      getAppContext().store.pushNotification('error', error instanceof Error ? error.message : String(error))
    } finally {
      this.masterRekeyInProgress.set(false)
      this.shared.setBusy(false)
    }
  }

  onChangeStorePath = async () => {
    if (!isTauriRuntime()) return
    if (!this.supportsStorageRootSelection()) return
    if (this.shared.busy()) return
    const next = await wrap(
      open({
        directory: true,
        multiple: false,
        title: i18n('welcome:storage-folder'),
        defaultPath: this.storePath() || undefined,
      }),
    )
    if (!next) return

    try {
      this.shared.setBusy(true)
      const res = await wrap(
        tauriInvoke<RpcCommandResult<{storage_root: string}>>('storage_set_root', {
          storageRoot: next,
        }),
      )
      if (!isOk(res)) throw new Error(res.error)
      getAppContext().state.update({StorePath: res.result.storage_root, StorageOpened: false})
    } catch (error) {
      this.shared.setBusy(false, error instanceof Error ? error.message : String(error))
    } finally {
      this.shared.setBusy(false)
    }
  }

  onUseDefaultStorePath = async () => {
    if (!isTauriRuntime()) return
    if (!this.supportsStorageRootSelection()) return
    if (this.shared.busy()) return

    try {
      this.shared.setBusy(true)
      const res = await wrap(
        tauriInvoke<RpcCommandResult<{storage_root: string}>>('storage_set_root', {
          storageRoot: DEFAULT_STORAGE_ROOT,
        }),
      )
      if (!isOk(res)) throw new Error(res.error)
      getAppContext().state.update({StorePath: res.result.storage_root, StorageOpened: false})
    } catch (error) {
      this.shared.setBusy(false, error instanceof Error ? error.message : String(error))
    } finally {
      this.shared.setBusy(false)
    }
  }

  onPrintKit = () => {
    window.print()
  }

  getBackupPhaseLabel = (phase: string): string => {
    switch (phase) {
      case 'starting':
        return i18n('remote-storage:phase-starting')
      case 'metadata':
        return i18n('remote-storage:phase-metadata')
      case 'chunks':
        return i18n('remote-storage:phase-chunks')
      case 'finishing':
        return i18n('remote-storage:phase-finishing')
      default:
        return i18n('remote-storage:phase-processing')
    }
  }

  getRestorePhaseLabel = (phase: string): string => {
    switch (phase) {
      case 'starting':
        return i18n('welcome:restore-phase-starting')
      case 'metadata':
        return i18n('welcome:restore-phase-metadata')
      case 'chunks':
        return i18n('welcome:restore-phase-chunks')
      case 'finishing':
        return i18n('welcome:restore-phase-finishing')
      default:
        return i18n('welcome:restore-phase-processing')
    }
  }

  formatBackupBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  private getMasterRekeyErrorMessage(error: RpcErr): string {
    switch (error.code) {
      case 'MASTER_REKEY_INVALID_CURRENT_PASSWORD':
        return i18n('changepwd:invalid-current')
      case 'MASTER_REKEY_PASSWORD_POLICY':
        return i18n('changepwd:policy-error')
      default:
        return error.error
    }
  }

  private async startBackupProgressListener(): Promise<void> {
    this.clearBackupProgressListener()

    try {
      this.backupProgressUnlisten = await wrap(
        tauriListen<BackupProgressEvent>('backup:progress', (payload) => {
          this.backupProgress.set(payload)
        }),
      )
    } catch (error) {
      console.warn('Failed to setup backup progress listener:', error)
    }
  }

  private async startRestoreProgressListener(): Promise<void> {
    this.clearRestoreProgressListener()

    try {
      this.restoreProgressUnlisten = await wrap(
        tauriListen<RestoreProgressEvent>('restore:progress', (payload) => {
          this.restoreProgress.set(payload)
        }),
      )
    } catch (error) {
      console.warn('Failed to setup restore progress listener:', error)
    }
  }

  private clearBackupProgressListener(): void {
    if (!this.backupProgressUnlisten) return
    this.backupProgressUnlisten()
    this.backupProgressUnlisten = null
  }

  private clearRestoreProgressListener(): void {
    if (!this.restoreProgressUnlisten) return
    this.restoreProgressUnlisten()
    this.restoreProgressUnlisten = null
  }
}
