import {state} from '@statx/core'
import {open} from '@tauri-apps/plugin-dialog'

import {navigationModel} from 'root/app/navigation/navigation.model'
import {isTauriRuntime} from 'root/core/runtime/runtime'
import {tauriInvoke, tauriListen, type UnlistenFn} from 'root/core/transport/tauri/ipc'
import {getAppContext} from 'root/shared/services/app-context'

import {VolumeMountModel, type VolumeBackend} from '../volume/volume-mount.model'

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
  readonly transferStep = state<TransferStep>('idle')
  readonly targetDir = state<string | null>(null)
  readonly masterPassword = state('')
  readonly progress = state<BackupProgressEvent | null>(null)
  readonly transferResult = state<TransferResult | null>(null)
  readonly isCancelling = state(false)

  readonly volume = new VolumeMountModel()
  private progressUnlisten: UnlistenFn | null = null

  initialize() {
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
        title: 'Storage',
        canGoBack: false,
        backDisabled: false,
        showCommand: true,
      }
    }

    if (step === 'confirm') {
      return {
        title: 'Confirm Export',
        canGoBack: true,
        backDisabled: false,
        showCommand: false,
      }
    }

    if (step === 'password') {
      return {
        title: 'Authorization',
        canGoBack: true,
        backDisabled: false,
        showCommand: false,
      }
    }

    if (step === 'progress') {
      return {
        title: 'Export in Progress',
        canGoBack: true,
        backDisabled: true,
        showCommand: false,
      }
    }

    return {
      title: 'Export Result',
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

  onVolumeMount = () => {
    if (!isTauriRuntime()) return
    void this.volume.mount()
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
      await navigator.clipboard.writeText(url)
      getAppContext().store.pushNotification('success', 'WebDAV URL copied to clipboard')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      getAppContext().store.pushNotification('error', `Failed to copy: ${msg}`)
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
    this.isCancelling.set(false)
    if (this.progressUnlisten) {
      this.progressUnlisten()
      this.progressUnlisten = null
    }
  }

  goToStep = (step: TransferStep) => {
    this.transferStep.set(step)
  }

  selectFolder = async () => {
    if (!isTauriRuntime()) return

    try {
      const selected = await open({
        directory: true,
        title: 'Выберите папку для экспорта',
      })
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

    const targetDir = this.targetDir()
    const masterPassword = this.masterPassword()

    if (!masterPassword.trim()) return

    this.transferStep.set('progress')
    this.progress.set(null)
    this.transferResult.set(null)
    this.isCancelling.set(false)

    try {
      this.progressUnlisten = await tauriListen<BackupProgressEvent>('backup:progress', (payload) => {
        this.progress.set(payload)
      })
    } catch (e) {
      console.warn('Failed to setup progress listener:', e)
    }

    try {
      const result = await tauriInvoke<RpcResult<BackupLocalCreated>>('backup_local_create', {
        masterPassword,
        targetDir: targetDir || undefined,
      })

      if (result.ok && result.result) {
        this.transferResult.set({
          success: true,
          backupDir: result.result.backup_dir,
        })
      } else {
        this.transferResult.set({
          success: false,
          error:
            result.error ||
            (result.code === 'CANCELLED' ? 'Экспорт отменён пользователем.' : 'Unknown error'),
          code: result.code,
        })
      }
    } catch (e) {
      this.transferResult.set({
        success: false,
        error: e instanceof Error ? e.message : String(e),
      })
    } finally {
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
      const result =
        await tauriInvoke<RpcResult<{cancelled: boolean; operation: string}>>('backup_local_cancel')
      if (!result.ok) {
        this.isCancelling.set(false)
        getAppContext().store.pushNotification(
          'error',
          result.error || 'Не удалось запросить отмену экспорта',
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
      await navigator.clipboard.writeText(result.backupDir)
      getAppContext().store.pushNotification('success', 'Путь скопирован в буфер обмена')
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
        return 'Подготовка...'
      case 'metadata':
        return 'Сохранение метаданных...'
      case 'chunks':
        return 'Экспорт данных...'
      case 'finishing':
        return 'Завершение...'
      default:
        return 'Обработка...'
    }
  }

  getStepNumber(step: TransferStep): number {
    const steps: TransferStep[] = ['confirm', 'password', 'progress', 'result']
    return steps.indexOf(step) + 1
  }
}
