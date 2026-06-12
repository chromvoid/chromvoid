import {atom, wrap} from '@reatom/core'
import {open} from '@tauri-apps/plugin-dialog'

import {navigationModel} from 'root/app/navigation/navigation.model'
import {guidanceModel} from 'root/core/guidance'
import {moduleAccessModel} from 'root/core/pro/module-access.model'
import {isTauriRuntime} from 'root/core/runtime/runtime'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {tauriInvoke, tauriListen, type UnlistenFn} from 'root/core/transport/tauri/ipc'
import {i18n} from 'root/i18n'
import {getAppContext} from 'root/shared/services/app-context'

import {VolumeMountModel, type VolumeBackend} from '../volume/volume-mount.model'

const VOLUME_MOUNT_WARNING_ID = 'remote-storage.mount-warning'

export type TransferStep = 'idle' | 'confirm' | 'password' | 'progress' | 'result'

export interface BackupProgressEvent {
  backup_id: string
  phase: 'starting' | 'metadata' | 'chunks' | 'finishing'
  chunk_index: number
  chunk_count: number
  bytes_written: number
  estimated_size: number
}

export interface BackupLocalCreated {
  backup_id: string
  backup_dir: string
  estimated_size: number
  chunk_count: number
}

export interface RpcResult<T> {
  ok: boolean
  result?: T
  error?: string
  code?: string
}

export interface TransferResult {
  success: boolean
  backupDir?: string
  error?: string
  code?: string
}

export class RemoteStorageModel {
  readonly transferStep = atom<TransferStep>('idle')
  readonly targetDir = atom<string | null>(null)
  readonly masterPassword = atom('')
  readonly progress = atom<BackupProgressEvent | null>(null)
  readonly transferResult = atom<TransferResult | null>(null)
  readonly isCancelling = atom(false)

  readonly volume = new VolumeMountModel()
  private progressUnlisten: UnlistenFn | null = null
  private initialized = false
  private exportInFlight = false

  initialize() {
    if (this.initialized) return
    this.initialized = true
    if (isTauriRuntime()) {
      void this.volume.refreshStatus()
      void this.volume.refreshBackends()
    }
  }

  closePage() {
    navigationModel.goBack()
  }

  getMobileToolbarContext(): {
    title: string
    canGoBack: boolean
    backDisabled: boolean
    showCommand: boolean
  } {
    const step = this.transferStep()
    if (step === 'idle') {
      return {
        title: i18n('remote-storage:toolbar-storage'),
        canGoBack: false,
        backDisabled: false,
        showCommand: true,
      }
    }

    if (step === 'confirm') {
      return {
        title: i18n('remote-storage:toolbar-confirm-export'),
        canGoBack: true,
        backDisabled: false,
        showCommand: false,
      }
    }

    if (step === 'password') {
      return {
        title: i18n('remote-storage:toolbar-authorization'),
        canGoBack: true,
        backDisabled: false,
        showCommand: false,
      }
    }

    if (step === 'progress') {
      return {
        title: i18n('remote-storage:toolbar-export-progress'),
        canGoBack: true,
        backDisabled: true,
        showCommand: false,
      }
    }

    return {
      title: i18n('remote-storage:toolbar-export-result'),
      canGoBack: true,
      backDisabled: false,
      showCommand: false,
    }
  }

  handleMobileToolbarBack(): boolean {
    const step = this.transferStep()
    if (step === 'idle') return false

    if (step === 'progress') return true

    if (step === 'confirm') {
      this.cancelWizard()
      return true
    }

    if (step === 'password') {
      this.goToStep('confirm')
      return true
    }

    if (step === 'result') {
      this.goToStep('password')
      return true
    }

    return false
  }

  onVolumeMount = async () => {
    if (!isTauriRuntime()) return
    if (this.requestVolumeMountWarning()) return
    await this.volume.mount()
    if (this.volume.status().state === 'mounted') {
      guidanceModel.emitDomainEvent('volume_mount.started')
    }
  }

  onVolumeUnmount = () => {
    if (!isTauriRuntime()) return
    void this.volume.unmount()
  }

  onVolumeRefresh = () => {
    if (!isTauriRuntime()) return
    void this.volume.refreshStatus()
    void this.volume.refreshBackends()
  }

  onBackendChange = (event: Event) => {
    const value = (event.target as HTMLSelectElement).value as VolumeBackend
    this.volume.selectedBackend.set(value)
  }

  copyVolumeUrl = async () => {
    const status = this.volume.status()
    const url = status.mountpoint
    if (!url) return

    try {
      await wrap(navigator.clipboard.writeText(url))
      getAppContext().store.pushNotification('success', i18n('remote-storage:webdav-url-copied'))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      getAppContext().store.pushNotification('error', i18n('errors:failed-to-copy', {message: msg}))
    }
  }

  startTransferWizard = () => {
    this.transferStep.set('confirm')
    this.targetDir.set(null)
    this.masterPassword.set('')
    this.progress.set(null)
    this.transferResult.set(null)
    this.isCancelling.set(false)
  }

  cancelWizard = () => {
    this.transferStep.set('idle')
    this.masterPassword.set('')
    this.isCancelling.set(false)
    if (this.progressUnlisten) {
      this.progressUnlisten()
      this.progressUnlisten = null
    }
  }

  goToStep = (step: TransferStep) => {
    this.transferStep.set(step)
  }

  private requestVolumeMountWarning(): boolean {
    if (!getRuntimeCapabilities().supports_volume) return false
    if (moduleAccessModel.featureAccess('mounted-vault').status !== 'enabled') return false
    if (guidanceModel.hasProgressForDefinition(VOLUME_MOUNT_WARNING_ID)) return false
    if (guidanceModel.completedDomainEvents().has('volume_mount.started')) return false

    guidanceModel.openBlockedAction({
      surface: 'remote-storage',
      anchorId: 'remote-storage.mount',
      feature: 'mounted-vault',
      reason: 'enabled',
    })

    const active = guidanceModel.activeGuidance()
    if (
      active.kind !== 'hidden' &&
      active.kind !== 'waiting_for_anchor' &&
      active.definition.id === VOLUME_MOUNT_WARNING_ID
    ) {
      return true
    }

    guidanceModel.clearBlockedActionRequest()
    return false
  }

  selectFolder = async () => {
    if (!isTauriRuntime()) return

    try {
      const selected = await wrap(
        open({
          directory: true,
          title: i18n('remote-storage:select-export-folder'),
        }),
      )
      if (selected && typeof selected === 'string') {
        this.targetDir.set(selected)
      }
    } catch (e) {
      console.error('Failed to open folder dialog:', e)
    }
  }

  handlePasswordInput = (e: Event) => {
    const event = e as CustomEvent<{value?: string}>
    const input = e.target as {value?: string} | null
    this.masterPassword.set(event.detail?.value ?? input?.value ?? '')
  }

  startExport = async () => {
    if (!isTauriRuntime()) return
    if (this.exportInFlight) return

    const targetDir = this.targetDir()
    const masterPassword = this.masterPassword()

    if (!masterPassword.trim()) return

    this.exportInFlight = true
    this.transferStep.set('progress')
    this.progress.set(null)
    this.transferResult.set(null)
    this.isCancelling.set(false)

    try {
      this.progressUnlisten = await wrap(
        tauriListen<BackupProgressEvent>('backup:progress', (payload) => {
          this.progress.set(payload)
        }),
      )
    } catch (e) {
      console.warn('Failed to setup progress listener:', e)
    }

    try {
      const result = await wrap(
        tauriInvoke<RpcResult<BackupLocalCreated>>('backup_local_create', {
          masterPassword,
          targetDir: targetDir || undefined,
        }),
      )

      if (result.ok && result.result) {
        this.transferResult.set({
          success: true,
          backupDir: result.result.backup_dir,
        })
        guidanceModel.emitDomainEvent('backup.created')
      } else {
        this.transferResult.set({
          success: false,
          error:
            result.error ||
            (result.code === 'CANCELLED'
              ? i18n('remote-storage:export-cancelled')
              : i18n('remote-storage:unknown-error')),
          code: result.code,
        })
      }
    } catch (e) {
      this.transferResult.set({
        success: false,
        error: e instanceof Error ? e.message : String(e),
      })
    } finally {
      this.masterPassword.set('')
      this.exportInFlight = false
      this.isCancelling.set(false)
      if (this.progressUnlisten) {
        this.progressUnlisten()
        this.progressUnlisten = null
      }
      this.transferStep.set('result')
    }
  }

  cancelExport = async () => {
    if (!isTauriRuntime()) return
    if (this.transferStep() !== 'progress') return
    if (this.isCancelling()) return

    this.isCancelling.set(true)

    try {
      const result = await wrap(
        tauriInvoke<RpcResult<{cancelled: boolean; operation: string}>>('backup_local_cancel'),
      )
      if (!result.ok) {
        this.isCancelling.set(false)
        getAppContext().store.pushNotification(
          'error',
          result.error || i18n('remote-storage:cancel-export-request-failed'),
        )
      }
    } catch (e) {
      this.isCancelling.set(false)
      getAppContext().store.pushNotification('error', e instanceof Error ? e.message : String(e))
    }
  }

  copyBackupPath = async () => {
    const result = this.transferResult()
    if (!result?.backupDir) return

    try {
      await wrap(navigator.clipboard.writeText(result.backupDir))
      getAppContext().store.pushNotification('success', i18n('remote-storage:path-copied'))
    } catch (e) {
      console.error('Failed to copy path:', e)
    }
  }

  formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  getProgressPercent = (): number => {
    const prog = this.progress()
    if (!prog || prog.estimated_size === 0) return 0
    return Math.min(100, Math.round((prog.bytes_written / prog.estimated_size) * 100))
  }

  getPhaseLabel = (phase: string): string => {
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

  getStepNumber(step: TransferStep): number {
    const steps: TransferStep[] = ['confirm', 'password', 'progress', 'result']
    return steps.indexOf(step) + 1
  }
}

export const remoteStorageModel = new RemoteStorageModel()
