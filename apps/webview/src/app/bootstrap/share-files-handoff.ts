import {
  shareImportModel,
  setupShareImportModel,
  type SharedFilesHandoff,
} from 'root/features/file-manager/models/share-import.model'
import {
  logShareDiagnostic,
  shareDiagnosticErrorMessage,
  summarizeSharePayload,
} from 'root/features/file-manager/models/share-import.diagnostics'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {tauriInvoke} from 'root/core/transport/tauri/ipc'

type RpcResult<T> = {ok: true; result: T} | {ok: false; error: string; code?: string | null}

function logShareHandoff(event: string, details: Record<string, unknown> = {}): void {
  logShareDiagnostic('handoff', event, details)
}

function normalizeFile(value: unknown): SharedFilesHandoff['files'][number] | null {
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

function normalizeHandoff(raw: unknown): SharedFilesHandoff | null {
  if (!raw || typeof raw !== 'object') return null
  const payload = raw as Record<string, unknown>
  const sessionId = typeof payload['sessionId'] === 'string' ? payload['sessionId'].trim() : ''
  const files = Array.isArray(payload['files'])
    ? payload['files'].map(normalizeFile).filter((file): file is SharedFilesHandoff['files'][number] => file !== null)
    : []
  if (!sessionId || files.length === 0) return null
  return {sessionId, files}
}

/**
 * Files shared into the app from another app wait in the native share
 * extension until the webview asks for them. Only the iOS shell offers them;
 * every other runtime reports no share import and is never asked.
 */
async function requestPendingSharedFiles(): Promise<void> {
  const caps = getRuntimeCapabilities()
  if (caps.platform !== 'ios' || !caps.supports_share_import || !caps.supports_native_file_upload) {
    return
  }

  try {
    const res = await tauriInvoke<RpcResult<unknown[]>>('catalog_list_shared_files')
    if (!res.ok || !Array.isArray(res.result)) {
      logShareHandoff('pending_invalid', {
        ok: res.ok,
        code: res.ok ? null : res.code ?? null,
      })
      return
    }

    for (const item of res.result) {
      const payload = normalizeHandoff(item)
      if (!payload) continue
      logShareHandoff('handoff_forwarded', summarizeSharePayload(payload))
      shareImportModel.receiveHandoff(payload)
    }
  } catch (error) {
    logShareHandoff('pending_request_failed', {
      message: shareDiagnosticErrorMessage(error),
    })
  }
}

export function setupShareFilesHandoff(): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const cleanupModel = setupShareImportModel()
  logShareHandoff('listener_ready')
  void requestPendingSharedFiles()

  return () => {
    logShareHandoff('listener_removed')
    cleanupModel()
  }
}
