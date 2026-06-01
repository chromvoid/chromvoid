import {
  androidShareImportModel,
  setupAndroidShareImportModel,
  type AndroidSharedFilesHandoff,
} from 'root/features/file-manager/models/android-share-import.model'
import {
  androidShareDiagnosticErrorMessage,
  logAndroidShareDiagnostic,
  summarizeAndroidSharePayload,
} from 'root/features/file-manager/models/android-share-import.diagnostics'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {tauriInvoke} from 'root/core/transport/tauri/ipc'

type RpcResult<T> = {ok: true; result: T} | {ok: false; error: string; code?: string | null}

type WindowWithAndroidSharedFiles = Window & {
  __chromvoidPendingAndroidSharedFiles?: unknown
  ChromVoidAndroidShare?: {
    requestPendingSharedFiles?: () => void
  }
}

function logAndroidShareHandoff(event: string, details: Record<string, unknown> = {}): void {
  logAndroidShareDiagnostic('handoff', event, details)
}

function normalizeFile(value: unknown): AndroidSharedFilesHandoff['files'][number] | null {
  if (!value || typeof value !== 'object') return null
  const file = value as Record<string, unknown>
  const name = typeof file['name'] === 'string' ? file['name'].trim() : ''
  if (!name) return null

  const rawSize = file['size']
  const size = typeof rawSize === 'number' && Number.isFinite(rawSize) && rawSize >= 0 ? rawSize : null
  const rawMimeType = file['mimeType']
  const mimeType = typeof rawMimeType === 'string' && rawMimeType.trim() ? rawMimeType.trim() : null

  return {name, size, mimeType}
}

function readPendingSharedFiles(): AndroidSharedFilesHandoff | null {
  const win = window as WindowWithAndroidSharedFiles
  const raw = win.__chromvoidPendingAndroidSharedFiles
  if (!raw || typeof raw !== 'object') {
    if (raw !== undefined) {
      logAndroidShareHandoff('pending_global_invalid', {valueType: typeof raw})
      win.__chromvoidPendingAndroidSharedFiles = undefined
    }
    return null
  }

  win.__chromvoidPendingAndroidSharedFiles = undefined

  const payload = raw as Record<string, unknown>
  const sessionId = typeof payload['sessionId'] === 'string' ? payload['sessionId'].trim() : ''
  const files = Array.isArray(payload['files'])
    ? payload['files'].map(normalizeFile).filter((file): file is AndroidSharedFilesHandoff['files'][number] => file !== null)
    : []

  if (!sessionId || files.length === 0) {
    logAndroidShareHandoff('payload_rejected', {
      hasSessionId: Boolean(sessionId),
      files: files.length,
      rawFilesType: Array.isArray(payload['files']) ? 'array' : typeof payload['files'],
    })
    return null
  }

  const handoff = {sessionId, files}
  logAndroidShareHandoff('payload_consumed', summarizeAndroidSharePayload(handoff))
  return handoff
}

function handlePendingSharedFiles(): void {
  const payload = readPendingSharedFiles()
  if (!payload) return

  logAndroidShareHandoff('handoff_forwarded', summarizeAndroidSharePayload(payload))
  androidShareImportModel.receiveHandoff(payload)
}

function requestNativePendingSharedFiles(): void {
  const bridge = (window as WindowWithAndroidSharedFiles).ChromVoidAndroidShare
  if (typeof bridge?.requestPendingSharedFiles === 'function') {
    try {
      bridge.requestPendingSharedFiles()
      logAndroidShareHandoff('native_pending_requested')
    } catch (error) {
      logAndroidShareHandoff('native_pending_request_failed', {
        message: androidShareDiagnosticErrorMessage(error),
      })
    }
  }

  void requestTauriPendingSharedFiles()
}

async function requestTauriPendingSharedFiles(): Promise<void> {
  const caps = getRuntimeCapabilities()
  if (
    caps.platform !== 'ios' ||
    !caps.supports_share_import ||
    !caps.supports_native_file_upload
  ) {
    return
  }

  try {
    const res = await tauriInvoke<RpcResult<unknown[]>>('catalog_list_shared_files')
    if (!res.ok || !Array.isArray(res.result)) {
      logAndroidShareHandoff('tauri_pending_invalid', {
        ok: res.ok,
        code: res.ok ? null : res.code ?? null,
      })
      return
    }

    for (const item of res.result) {
      const payload = normalizeHandoff(item)
      if (!payload) continue
      logAndroidShareHandoff('tauri_handoff_forwarded', summarizeAndroidSharePayload(payload))
      androidShareImportModel.receiveHandoff(payload)
    }
  } catch (error) {
    logAndroidShareHandoff('tauri_pending_request_failed', {
      message: androidShareDiagnosticErrorMessage(error),
    })
  }
}

function normalizeHandoff(raw: unknown): AndroidSharedFilesHandoff | null {
  if (!raw || typeof raw !== 'object') return null
  const payload = raw as Record<string, unknown>
  const sessionId = typeof payload['sessionId'] === 'string' ? payload['sessionId'].trim() : ''
  const files = Array.isArray(payload['files'])
    ? payload['files'].map(normalizeFile).filter((file): file is AndroidSharedFilesHandoff['files'][number] => file !== null)
    : []
  if (!sessionId || files.length === 0) return null
  return {sessionId, files}
}

export function setupAndroidShareFilesHandoff(): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const cleanupModel = setupAndroidShareImportModel()
  window.addEventListener('chromvoid:android-share-files-pending', handlePendingSharedFiles)
  logAndroidShareHandoff('listener_ready')
  handlePendingSharedFiles()
  requestNativePendingSharedFiles()

  return () => {
    window.removeEventListener('chromvoid:android-share-files-pending', handlePendingSharedFiles)
    logAndroidShareHandoff('listener_removed')
    cleanupModel()
  }
}
