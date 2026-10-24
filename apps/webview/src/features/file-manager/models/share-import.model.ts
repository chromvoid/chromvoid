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
import {showSharePartialImportDialog} from '../services/share-partial-import-dialog'
import {
  shareDiagnosticErrorCode,
  shareDiagnosticErrorMessage,
  logShareDiagnostic,
  sanitizeShareDiagnosticMessage,
  summarizeSharePayload,
} from './share-import.diagnostics'

export type SharedFilesHandoff = {
  sessionId: string
  files: Array<{
    name: string
    size: number | null
    mimeType: string | null
  }>
}


export type ShareImportState =
  | {kind: 'none'}
  | {kind: 'pending-locked'; payload: SharedFilesHandoff}
  | {kind: 'ready'; payload: SharedFilesHandoff}
  | {kind: 'uploading'; payload: SharedFilesHandoff; uploadId: string}
  | {kind: 'partial-decision'; decision: SharePartialImportDecision}
  | {kind: 'failed'; message: string; code?: string | null}

export type SharePartialImportDecision = {
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

export type SharePartialImportChoice = 'keep' | 'delete'

export type SharedFilesImportResult =
  | {kind: 'success'}
  | {kind: 'failed'}
  | {kind: 'partial'; decision: SharePartialImportDecision}


export type SharePendingLockedSummary = {
  fileCount: number
  knownBytes: number
  unknownSizes: number
}

type ShareImportEnvironment = {
  state: Pick<ChromVoidState, 'data'>
  store: Pick<
    Store,
    'remoteSessionState' | 'startSharedFilesImport' | 'pushNotification'
  >
  ws: Pick<TransportLike, 'kind' | 'cancelSharedFiles' | 'uploadSharedFiles'>
  catalog: Pick<CatalogService, 'api' | 'refresh'>
  showPartialImportDialog?: (
    decision: SharePartialImportDecision,
  ) => Promise<SharePartialImportChoice | null>
}

function summarizePayload(payload: SharedFilesHandoff): SharePendingLockedSummary {
  const summary = summarizeSharePayload(payload)
  return {
    fileCount: summary.files,
    knownBytes: summary.knownBytes,
    unknownSizes: summary.unknownSizes,
  }
}

function logShareImport(event: string, details: Record<string, unknown> = {}): void {
  logShareDiagnostic('import', event, details)
}

function activeShareSessionId(state: ShareImportState): string | null {
  if (state.kind === 'pending-locked' || state.kind === 'ready' || state.kind === 'uploading') {
    return state.payload.sessionId
  }
  return null
}

class ShareImportModel {
  private env: ShareImportEnvironment | null = null
  private starting = false
  private partialDecisionDialogOpen = false

  readonly state = atom<ShareImportState>({kind: 'none'}, 'shareImport.state')

  readonly pendingLockedSummary = computed<SharePendingLockedSummary | null>(() => {
    const state = this.state()
    return state.kind === 'pending-locked' ? summarizePayload(state.payload) : null
  }, 'shareImport.pendingLockedSummary')

  connect(env: ShareImportEnvironment): () => void {
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

  receiveHandoff(payload: SharedFilesHandoff): void {
    const current = this.state()
    logShareImport('handoff_received', {
      state: current.kind,
      ...summarizeSharePayload(payload),
    })
    if (activeShareSessionId(current) === payload.sessionId) {
      logShareImport('handoff_ignored_duplicate', {
        state: current.kind,
        ...summarizeSharePayload(payload),
      })
      return
    }

    if (current.kind === 'uploading' || current.kind === 'partial-decision') {
      logShareImport('handoff_rejected_busy', {
        state: current.kind,
        ...summarizeSharePayload(payload),
      })
      void this.rejectIncomingPayload(
        payload,
        i18n('uploads:share-import-busy'),
      )
      return
    }

    this.state.set({kind: 'ready', payload})
    logShareImport('state_ready', summarizeSharePayload(payload))
    void this.sync()
  }

  async cancelPendingShare(): Promise<void> {
    const state = this.state()
    if (state.kind !== 'pending-locked' && state.kind !== 'ready') return

    logShareImport('cancel_pending_requested', {
      state: state.kind,
      ...summarizeSharePayload(state.payload),
    })
    await wrap(this.cancelNativeSession(state.payload.sessionId))
    this.clear()
  }

  async keepPartialImport(): Promise<void> {
    const state = this.state()
    const env = this.env
    if (state.kind !== 'partial-decision' || !env) return

    logShareImport('partial_keep_requested', {
      uploadId: state.decision.uploadId,
      completed: state.decision.completed.length,
      failedCount: state.decision.failedCount,
      failedCode: state.decision.failedCode ?? null,
    })
    await wrap(env.catalog.refresh().catch(() => {}))
    navigationModel.navigateFilesPath('/', 'replace')
    env.store.pushNotification(
      'warning',
      i18n('uploads:share-partial-kept', {
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

    logShareImport('partial_delete_requested', {
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

    logShareImport('partial_delete_cleanup_finished', {
      uploadId: state.decision.uploadId,
      deletedCount,
      cleanupFailures,
    })
    await wrap(env.catalog.refresh().catch(() => {}))
    navigationModel.navigateFilesPath('/', 'replace')
    if (cleanupFailures > 0) {
      env.store.pushNotification(
        'error',
        i18n('uploads:share-partial-cleanup-failed', {
          deleted: String(deletedCount),
          failedCleanup: String(cleanupFailures),
        }),
      )
    } else {
      env.store.pushNotification(
        'success',
        i18n('uploads:share-partial-deleted', {
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
      logShareImport('state_cleared', {previousState: current.kind})
    }
    this.state.set({kind: 'none'})
  }

  markFailed(message: string, code?: string | null): void {
    logShareImport('state_failed', {
      code: code ?? null,
      message: sanitizeShareDiagnosticMessage(message),
    })
    this.state.set({kind: 'failed', message, code})
  }

  private async sync(): Promise<void> {
    if (this.starting) {
      logShareImport('sync_skipped', {reason: 'starting'})
      return
    }

    const env = this.env
    if (!env) return

    const current = this.state()
    if (current.kind !== 'ready' && current.kind !== 'pending-locked') return

    if (env.state.data().StorageOpened !== true) {
      if (current.kind !== 'pending-locked') {
        this.state.set({kind: 'pending-locked', payload: current.payload})
        logShareImport('state_pending_locked', summarizeSharePayload(current.payload))
      }
      return
    }

    const payload = current.payload
    if (env.store.remoteSessionState() !== 'inactive') {
      logShareImport('payload_rejected_remote_active', summarizeSharePayload(payload))
      await this.rejectPayload(
        payload,
        i18n('uploads:share-import-remote-active'),
        'SHARE_REMOTE_ACTIVE',
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
      logShareImport('payload_rejected_unsupported', {
        wsKind: env.ws.kind,
        supportsShareImport: caps.supports_share_import,
        supportsNativeFileUpload: caps.supports_native_file_upload,
        hasUploadSharedFiles: typeof env.ws.uploadSharedFiles === 'function',
        ...summarizeSharePayload(payload),
      })
      await this.rejectPayload(
        payload,
        i18n('uploads:share-import-unsupported'),
        'SHARE_IMPORT_UNSUPPORTED',
      )
      return
    }

    await this.startImport(payload)
  }

  private async startImport(payload: SharedFilesHandoff): Promise<void> {
    const env = this.env
    if (!env) return

    const uploadId = crypto.randomUUID()
    this.starting = true
    this.state.set({kind: 'uploading', payload, uploadId})
    logShareImport('upload_started', {
      uploadId,
      ...summarizeSharePayload(payload),
    })

    try {
      const result = await wrap(env.store.startSharedFilesImport(payload, uploadId))
      logShareImport('upload_finished', {
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
      logShareImport('upload_threw', {
        uploadId,
        code: shareDiagnosticErrorCode(error),
        message: sanitizeShareDiagnosticMessage(message),
      })
      this.markFailed(message, shareDiagnosticErrorCode(error))
    } finally {
      this.starting = false
    }
  }

  private async rejectPayload(
    payload: SharedFilesHandoff,
    message: string,
    code: string,
  ): Promise<void> {
    logShareImport('payload_rejected', {
      code,
      ...summarizeSharePayload(payload),
    })
    this.markFailed(message, code)
    await wrap(this.cancelNativeSession(payload.sessionId))
    this.env?.store.pushNotification('error', message)
    this.clear()
  }

  private async rejectIncomingPayload(
    payload: SharedFilesHandoff,
    message: string,
  ): Promise<void> {
    logShareImport('incoming_payload_rejected', summarizeSharePayload(payload))
    await wrap(this.cancelNativeSession(payload.sessionId))
    this.env?.store.pushNotification('error', message)
  }

  private async cancelNativeSession(sessionId: string): Promise<void> {
    const cancel = this.env?.ws.cancelSharedFiles
    if (!cancel) return

    try {
      logShareImport('cancel_native_session_requested', {sessionId})
      await cancel(sessionId)
      logShareImport('cancel_native_session_finished', {sessionId})
    } catch (error) {
      // Rust's code for a share session that has already gone; the name predates iOS sharing it.
      if (shareDiagnosticErrorCode(error) !== 'ANDROID_SHARE_SESSION_NOT_FOUND') {
        console.warn('[dashboard][share] cancel failed', shareDiagnosticErrorMessage(error))
      }
      logShareImport('cancel_native_session_failed', {
        sessionId,
        code: shareDiagnosticErrorCode(error),
        message: shareDiagnosticErrorMessage(error),
      })
    }
  }

  private async promptPartialDecision(decision: SharePartialImportDecision): Promise<void> {
    if (this.partialDecisionDialogOpen) return

    const env = this.env
    if (!env) return

    this.partialDecisionDialogOpen = true
    try {
      logShareImport('partial_dialog_opened', {
        uploadId: decision.uploadId,
        completed: decision.completed.length,
        failedCount: decision.failedCount,
        failedCode: decision.failedCode ?? null,
      })
      const choice = await (env.showPartialImportDialog ?? showSharePartialImportDialog)(decision)
      const current = this.state()
      if (current.kind !== 'partial-decision' || current.decision.uploadId !== decision.uploadId) return

      logShareImport('partial_dialog_choice', {
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

export const shareImportModel = new ShareImportModel()

export function setupShareImportModel(): () => void {
  const context = tryGetAppContext()
  if (!context) return () => {}

  return shareImportModel.connect({
    state: context.state,
    store: context.store,
    ws: context.ws,
    catalog: context.catalog,
  })
}
