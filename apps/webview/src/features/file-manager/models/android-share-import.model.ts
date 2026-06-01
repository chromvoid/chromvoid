import {atom, computed, wrap} from '@reatom/core'

import {i18n} from 'root/i18n'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import type {CatalogService} from 'root/core/catalog/catalog'
import type {ChromVoidState} from 'root/core/state/app-state'
import type {TransportLike} from 'root/core/transport/transport'
import {navigationModel} from 'root/app/navigation/navigation.model'
import {tryGetAppContext} from 'root/shared/services/app-context'
import {subscribeToSignalChanges} from 'root/shared/services/subscribed-signal'
import type {Store} from 'root/app/state/store'
import {showAndroidSharePartialImportDialog} from '../services/android-share-partial-import-dialog'
import {
  androidShareDiagnosticErrorCode,
  androidShareDiagnosticErrorMessage,
  logAndroidShareDiagnostic,
  sanitizeAndroidShareDiagnosticMessage,
  summarizeAndroidSharePayload,
} from './android-share-import.diagnostics'

export type AndroidSharedFilesHandoff = {
  sessionId: string
  files: Array<{
    name: string
    size: number | null
    mimeType: string | null
  }>
}

export type SharedFilesHandoff = AndroidSharedFilesHandoff

export type AndroidShareImportState =
  | {kind: 'none'}
  | {kind: 'pending-locked'; payload: AndroidSharedFilesHandoff}
  | {kind: 'ready'; payload: AndroidSharedFilesHandoff}
  | {kind: 'uploading'; payload: AndroidSharedFilesHandoff; uploadId: string}
  | {kind: 'partial-decision'; decision: AndroidSharePartialImportDecision}
  | {kind: 'failed'; message: string; code?: string | null}

export type AndroidSharePartialImportDecision = {
  uploadId: string
  completed: Array<{
    fileId: string
    nodeId: number
    name: string
  }>
  failedCount: number
  failedMessage: string
  failedCode?: string | null
}

export type AndroidSharePartialImportChoice = 'keep' | 'delete'

export type AndroidShareImportResult =
  | {kind: 'success'}
  | {kind: 'failed'}
  | {kind: 'partial'; decision: AndroidSharePartialImportDecision}

export type SharedFilesImportResult = AndroidShareImportResult

export type AndroidSharePendingLockedSummary = {
  fileCount: number
  knownBytes: number
  unknownSizes: number
}

type AndroidShareImportEnvironment = {
  state: Pick<ChromVoidState, 'data'>
  store: Pick<
    Store,
    'remoteSessionState' | 'startSharedFilesImport' | 'pushNotification'
  >
  ws: Pick<TransportLike, 'kind' | 'cancelSharedFiles' | 'uploadSharedFiles'>
  catalog: Pick<CatalogService, 'api' | 'refresh'>
  showPartialImportDialog?: (
    decision: AndroidSharePartialImportDecision,
  ) => Promise<AndroidSharePartialImportChoice | null>
}

function summarizePayload(payload: AndroidSharedFilesHandoff): AndroidSharePendingLockedSummary {
  const summary = summarizeAndroidSharePayload(payload)
  return {
    fileCount: summary.files,
    knownBytes: summary.knownBytes,
    unknownSizes: summary.unknownSizes,
  }
}

function logAndroidShareImport(event: string, details: Record<string, unknown> = {}): void {
  logAndroidShareDiagnostic('import', event, details)
}

function activeShareSessionId(state: AndroidShareImportState): string | null {
  if (state.kind === 'pending-locked' || state.kind === 'ready' || state.kind === 'uploading') {
    return state.payload.sessionId
  }
  return null
}

class AndroidShareImportModel {
  private env: AndroidShareImportEnvironment | null = null
  private starting = false
  private partialDecisionDialogOpen = false

  readonly state = atom<AndroidShareImportState>({kind: 'none'}, 'androidShareImport.state')

  readonly pendingLockedSummary = computed<AndroidSharePendingLockedSummary | null>(() => {
    const state = this.state()
    return state.kind === 'pending-locked' ? summarizePayload(state.payload) : null
  }, 'androidShareImport.pendingLockedSummary')

  connect(env: AndroidShareImportEnvironment): () => void {
    this.env = env

    void this.sync()
    const unsubscribeStorage = subscribeToSignalChanges(
      env.state.data,
      () => {
        void this.sync()
      },
      {
        readSnapshot: () => env.state.data().StorageOpened === true,
      },
    )
    const unsubscribeRemote = subscribeToSignalChanges(env.store.remoteSessionState, () => {
      void this.sync()
    })

    return () => {
      unsubscribeStorage()
      unsubscribeRemote()
      if (this.env === env) this.env = null
    }
  }

  receiveHandoff(payload: AndroidSharedFilesHandoff): void {
    const current = this.state()
    logAndroidShareImport('handoff_received', {
      state: current.kind,
      ...summarizeAndroidSharePayload(payload),
    })
    if (activeShareSessionId(current) === payload.sessionId) {
      logAndroidShareImport('handoff_ignored_duplicate', {
        state: current.kind,
        ...summarizeAndroidSharePayload(payload),
      })
      return
    }

    if (current.kind === 'uploading' || current.kind === 'partial-decision') {
      logAndroidShareImport('handoff_rejected_busy', {
        state: current.kind,
        ...summarizeAndroidSharePayload(payload),
      })
      void this.rejectIncomingPayload(
        payload,
        i18n('uploads:android-share-import-busy'),
      )
      return
    }

    this.state.set({kind: 'ready', payload})
    logAndroidShareImport('state_ready', summarizeAndroidSharePayload(payload))
    void this.sync()
  }

  async cancelPendingShare(): Promise<void> {
    const state = this.state()
    if (state.kind !== 'pending-locked' && state.kind !== 'ready') return

    logAndroidShareImport('cancel_pending_requested', {
      state: state.kind,
      ...summarizeAndroidSharePayload(state.payload),
    })
    await wrap(this.cancelNativeSession(state.payload.sessionId))
    this.clear()
  }

  async keepPartialImport(): Promise<void> {
    const state = this.state()
    const env = this.env
    if (state.kind !== 'partial-decision' || !env) return

    logAndroidShareImport('partial_keep_requested', {
      uploadId: state.decision.uploadId,
      completed: state.decision.completed.length,
      failedCount: state.decision.failedCount,
      failedCode: state.decision.failedCode ?? null,
    })
    await wrap(env.catalog.refresh().catch(() => {}))
    navigationModel.navigateFilesPath('/', 'replace')
    env.store.pushNotification(
      'warning',
      i18n('uploads:android-share-partial-kept', {
        imported: String(state.decision.completed.length),
        failed: String(state.decision.failedCount),
      }),
    )
    this.clear()
  }

  async deletePartialImport(): Promise<void> {
    const state = this.state()
    const env = this.env
    if (state.kind !== 'partial-decision' || !env) return

    logAndroidShareImport('partial_delete_requested', {
      uploadId: state.decision.uploadId,
      completed: state.decision.completed.length,
      failedCount: state.decision.failedCount,
      failedCode: state.decision.failedCode ?? null,
    })
    let deletedCount = 0
    let cleanupFailures = 0
    for (const file of state.decision.completed) {
      try {
        await wrap(env.catalog.api.delete(file.nodeId))
        deletedCount += 1
      } catch {
        cleanupFailures += 1
      }
    }

    logAndroidShareImport('partial_delete_cleanup_finished', {
      uploadId: state.decision.uploadId,
      deletedCount,
      cleanupFailures,
    })
    await wrap(env.catalog.refresh().catch(() => {}))
    navigationModel.navigateFilesPath('/', 'replace')
    if (cleanupFailures > 0) {
      env.store.pushNotification(
        'error',
        i18n('uploads:android-share-partial-cleanup-failed', {
          deleted: String(deletedCount),
          failedCleanup: String(cleanupFailures),
        }),
      )
    } else {
      env.store.pushNotification(
        'success',
        i18n('uploads:android-share-partial-deleted', {
          deleted: String(deletedCount),
          failed: String(state.decision.failedCount),
        }),
      )
    }
    this.clear()
  }

  clear(): void {
    const current = this.state()
    if (current.kind !== 'none') {
      logAndroidShareImport('state_cleared', {previousState: current.kind})
    }
    this.state.set({kind: 'none'})
  }

  markFailed(message: string, code?: string | null): void {
    logAndroidShareImport('state_failed', {
      code: code ?? null,
      message: sanitizeAndroidShareDiagnosticMessage(message),
    })
    this.state.set({kind: 'failed', message, code})
  }

  private async sync(): Promise<void> {
    if (this.starting) {
      logAndroidShareImport('sync_skipped', {reason: 'starting'})
      return
    }

    const env = this.env
    if (!env) return

    const current = this.state()
    if (current.kind !== 'ready' && current.kind !== 'pending-locked') return

    if (env.state.data().StorageOpened !== true) {
      if (current.kind !== 'pending-locked') {
        this.state.set({kind: 'pending-locked', payload: current.payload})
        logAndroidShareImport('state_pending_locked', summarizeAndroidSharePayload(current.payload))
      }
      return
    }

    const payload = current.payload
    if (env.store.remoteSessionState() !== 'inactive') {
      logAndroidShareImport('payload_rejected_remote_active', summarizeAndroidSharePayload(payload))
      await this.rejectPayload(
        payload,
        i18n('uploads:android-share-import-remote-active'),
        'ANDROID_SHARE_REMOTE_ACTIVE',
      )
      return
    }

    const caps = getRuntimeCapabilities()
    if (
      env.ws.kind !== 'tauri' ||
      !caps.supports_share_import ||
      !caps.supports_native_file_upload ||
      typeof env.ws.uploadSharedFiles !== 'function'
    ) {
      logAndroidShareImport('payload_rejected_unsupported', {
        wsKind: env.ws.kind,
        supportsShareImport: caps.supports_share_import,
        supportsNativeFileUpload: caps.supports_native_file_upload,
        hasUploadSharedFiles: typeof env.ws.uploadSharedFiles === 'function',
        ...summarizeAndroidSharePayload(payload),
      })
      await this.rejectPayload(
        payload,
        i18n('uploads:share-import-unsupported'),
        'ANDROID_SHARE_IMPORT_UNSUPPORTED',
      )
      return
    }

    await this.startImport(payload)
  }

  private async startImport(payload: AndroidSharedFilesHandoff): Promise<void> {
    const env = this.env
    if (!env) return

    const uploadId = crypto.randomUUID()
    this.starting = true
    this.state.set({kind: 'uploading', payload, uploadId})
    logAndroidShareImport('upload_started', {
      uploadId,
      ...summarizeAndroidSharePayload(payload),
    })

    try {
      const result = await wrap(env.store.startSharedFilesImport(payload, uploadId))
      logAndroidShareImport('upload_finished', {
        uploadId,
        result: result.kind,
        ...(result.kind === 'partial'
          ? {
              completed: result.decision.completed.length,
              failedCount: result.decision.failedCount,
              failedCode: result.decision.failedCode ?? null,
            }
          : {}),
      })
      if (result.kind === 'partial') {
        this.state.set({kind: 'partial-decision', decision: result.decision})
        void this.promptPartialDecision(result.decision)
        return
      }
      this.clear()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logAndroidShareImport('upload_threw', {
        uploadId,
        code: androidShareDiagnosticErrorCode(error),
        message: sanitizeAndroidShareDiagnosticMessage(message),
      })
      this.markFailed(message, androidShareDiagnosticErrorCode(error))
    } finally {
      this.starting = false
    }
  }

  private async rejectPayload(
    payload: AndroidSharedFilesHandoff,
    message: string,
    code: string,
  ): Promise<void> {
    logAndroidShareImport('payload_rejected', {
      code,
      ...summarizeAndroidSharePayload(payload),
    })
    this.markFailed(message, code)
    await wrap(this.cancelNativeSession(payload.sessionId))
    this.env?.store.pushNotification('error', message)
    this.clear()
  }

  private async rejectIncomingPayload(
    payload: AndroidSharedFilesHandoff,
    message: string,
  ): Promise<void> {
    logAndroidShareImport('incoming_payload_rejected', summarizeAndroidSharePayload(payload))
    await wrap(this.cancelNativeSession(payload.sessionId))
    this.env?.store.pushNotification('error', message)
  }

  private async cancelNativeSession(sessionId: string): Promise<void> {
    const cancel = this.env?.ws.cancelSharedFiles
    if (!cancel) return

    try {
      logAndroidShareImport('cancel_native_session_requested', {sessionId})
      await cancel(sessionId)
      logAndroidShareImport('cancel_native_session_finished', {sessionId})
    } catch (error) {
      if (androidShareDiagnosticErrorCode(error) !== 'ANDROID_SHARE_SESSION_NOT_FOUND') {
        console.warn('[dashboard][android-share] cancel failed', androidShareDiagnosticErrorMessage(error))
      }
      logAndroidShareImport('cancel_native_session_failed', {
        sessionId,
        code: androidShareDiagnosticErrorCode(error),
        message: androidShareDiagnosticErrorMessage(error),
      })
    }
  }

  private async promptPartialDecision(decision: AndroidSharePartialImportDecision): Promise<void> {
    if (this.partialDecisionDialogOpen) return

    const env = this.env
    if (!env) return

    this.partialDecisionDialogOpen = true
    try {
      logAndroidShareImport('partial_dialog_opened', {
        uploadId: decision.uploadId,
        completed: decision.completed.length,
        failedCount: decision.failedCount,
        failedCode: decision.failedCode ?? null,
      })
      const choice = await (env.showPartialImportDialog ?? showAndroidSharePartialImportDialog)(decision)
      const current = this.state()
      if (current.kind !== 'partial-decision' || current.decision.uploadId !== decision.uploadId) return

      logAndroidShareImport('partial_dialog_choice', {
        uploadId: decision.uploadId,
        choice,
      })
      if (choice === 'keep') {
        await this.keepPartialImport()
      } else if (choice === 'delete') {
        await this.deletePartialImport()
      }
    } finally {
      this.partialDecisionDialogOpen = false
    }
  }
}

export const androidShareImportModel = new AndroidShareImportModel()

export function setupAndroidShareImportModel(): () => void {
  const context = tryGetAppContext()
  if (!context) return () => {}

  return androidShareImportModel.connect({
    state: context.state,
    store: context.store,
    ws: context.ws,
    catalog: context.catalog,
  })
}
