import {atom} from '@reatom/core'

import type {
  AndroidAudioCommand,
  AndroidAudioCommandResult,
  AndroidAudioPlayerEvent,
  ImagePhotoMetadata,
  MediaStreamErrorEvent,
  NativeAudioCommand,
  NativeAudioCommandResult,
  NativeAudioPlayerEvent,
  NativeUploadOptions,
  PreparedMediaStreamSource,
  PreparedAndroidVideoSource,
  PreparedPreviewFileSource,
  PreparedPreviewFileVariant,
  PreviewCachePurgeReason,
  PreviewCachePurgeResult,
  TransportEventHandler,
  TransportLike,
} from '../transport'
import type {
  CatalogFileReplaceOptions,
  CatalogFileReplaceResult,
  CatalogSourceMetadata,
} from '../../catalog/catalog'
import {normalizeFileMediaInfo} from '../../catalog/media-info'
import {defaultLogger} from '../../logger'
import {tauriInvoke, tauriListen} from './ipc'
import type {RpcCommandResult, RpcResult} from '@chromvoid/scheme'
import {isSuccess} from '@chromvoid/scheme'
import type {RpcDispatchResponse} from './rpc-dispatch'
import {
  getRuntimeCapabilities,
  setRuntimeCapabilities,
  type RuntimeCapabilities,
} from '../../runtime/runtime-capabilities'
import {
  runtimeModeModel,
  type RuntimeCoreMode,
  type RuntimeModeSwitchResult,
} from '../../runtime/runtime-mode.model'
import {dispatchTauriCatalogCommand} from './tauri-catalog-command-dispatcher'
import {moduleAccessModel} from '../../pro/module-access.model'
import {
  downloadFilePathViaTauri,
  downloadFileViaTauri,
  imageMetadataViaTauri,
  openExternalViaTauri,
  prepareMediaStreamViaTauri,
  preparePreviewFileViaTauri,
  previewImageViaTauri,
  purgePreviewSourcesViaTauri,
  readSecretViaTauri,
  replaceFileViaTauri,
  releaseMediaStreamViaTauri,
  releasePreviewFileViaTauri,
  cancelAndroidSharedFilesViaTauri,
  cancelNativeOtpQrScanViaTauri,
  cancelSharedFilesViaTauri,
  sendAndroidAudioCommandViaTauri,
  sendNativeAudioCommandViaTauri,
  statPathViaTauri,
  startNativeOtpQrScanViaTauri,
  thumbnailImageViaTauri,
  startAndroidVideoViaTauri,
  stopAndroidVideoViaTauri,
  uploadAndroidSharedFilesViaTauri,
  uploadSharedFilesViaTauri,
  uploadFilePathViaTauri,
  uploadFileViaTauri,
  uploadNativeFilesViaTauri,
  warmupAndroidAudioViaTauri,
  writeSecretViaTauri,
} from './tauri-binary-ops'
import type {RpcCmdData, RpcCmdName, RpcCmdResult} from './tauri-rpc-types'

type RuntimeModeInfo = {
  mode?: RuntimeCoreMode
  remote_core_features?: unknown
}

function isRpcCommandResult<T extends RpcCmdName>(
  command: T,
  value: RpcCommandResult,
): value is Extract<RpcCommandResult, {command: T}> {
  return value.command === command
}

type HandlerSet = Set<TransportEventHandler>

function isPassmanagerMutatingCommand(command: string): boolean {
  return (
    command.startsWith('passmanager:') &&
    !command.endsWith(':read') &&
    !command.endsWith(':list') &&
    !command.endsWith(':export') &&
    !command.endsWith(':generate') &&
    !command.endsWith(':subscribe') &&
    !command.endsWith(':unsubscribe')
  )
}

function normalizeNodeType(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value === 'Dir') return 0
  if (value === 'File') return 1
  if (value === 'Symlink') return 2
  return Number(value)
}

function normalizeCatalogSourceMetadata(value: unknown): CatalogSourceMetadata {
  const payload = value as Record<string, unknown>
  const sourceRevision = payload['sourceRevision'] ?? payload['source_revision']
  const mediaInspectedRevision = payload['mediaInspectedRevision'] ?? payload['media_inspected_revision']
  return {
    nodeId: Number(payload['nodeId'] ?? payload['node_id']),
    nodeType: normalizeNodeType(payload['nodeType'] ?? payload['node_type']),
    name: String(payload['name'] ?? ''),
    mimeType:
      typeof payload['mimeType'] === 'string'
        ? payload['mimeType']
        : typeof payload['mime_type'] === 'string'
          ? payload['mime_type']
          : null,
    size: Number(payload['size']),
    sourceRevision:
      typeof sourceRevision === 'number' && Number.isFinite(sourceRevision) ? sourceRevision : null,
    mediaInspectedRevision:
      typeof mediaInspectedRevision === 'number' && Number.isFinite(mediaInspectedRevision)
        ? mediaInspectedRevision
        : null,
    mediaInfo: normalizeFileMediaInfo(payload['mediaInfo'] ?? payload['media_info']),
  }
}

export class TauriTransport implements TransportLike {
  readonly kind = 'tauri' as const

  connected = atom(false)
  connecting = atom(false)
  lastError = atom<string | undefined>(undefined)

  private handlers = new Map<string, HandlerSet>()
  private unlisten: Array<() => void> = []

  connect(): void {
    if (this.connected()) return

    console.info('[dashboard][tauri] connect(): start')
    this.connecting.set(true)

    void (async () => {
      try {
        const hasGlobalTauri = typeof (globalThis as {__TAURI__?: unknown}).__TAURI__ === 'object'
        const hasTauriInternals =
          typeof (globalThis as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__ === 'object'

        console.info('[dashboard][tauri] connect(): runtime globals', {
          hasGlobalTauri,
          hasTauriInternals,
        })

        this.unlisten.push(await tauriListen('update:state', (payload) => this.emit('update:state', payload)))
        this.unlisten.push(
          await tauriListen('catalog:event', (payload) => this.emit('catalog:event', payload)),
        )
        this.unlisten.push(
          await tauriListen('catalog:event:batch', (payload) =>
            this.emit('catalog:event:batch', payload),
          ),
        )
        this.unlisten.push(await tauriListen('vault:locked', (payload) => this.emit('vault:locked', payload)))
        this.unlisten.push(
          await tauriListen('volume:status', (payload) => this.emit('volume:status', payload)),
        )
        this.unlisten.push(await tauriListen('ping', (payload) => this.emit('ping', payload)))
        this.unlisten.push(await tauriListen('pong', (payload) => this.emit('pong', payload)))
        this.unlisten.push(
          await tauriListen<MediaStreamErrorEvent>('media-stream:error', (payload) =>
            this.emit('media-stream:error', payload),
          ),
        )
        this.unlisten.push(
          await tauriListen('ssh-agent:sign-request', (payload) =>
            this.emit('ssh-agent:sign-request', payload),
          ),
        )
        this.unlisten.push(
          await tauriListen('android-media-session:action', (payload) =>
            this.emit('android-media-session:action', payload),
          ),
        )
        this.unlisten.push(
          await tauriListen('android-video-player:event', (payload) =>
            this.emit('android-video-player:event', payload),
          ),
        )
        this.unlisten.push(
          await tauriListen<AndroidAudioPlayerEvent>('android-audio-player:event', (payload) =>
            this.emit('android-audio-player:event', payload),
          ),
        )
        this.unlisten.push(
          await tauriListen<NativeAudioPlayerEvent>('native-audio-player:event', (payload) =>
            this.emit('native-audio-player:event', payload),
          ),
        )
        this.unlisten.push(
          await tauriListen<RuntimeModeSwitchResult>('mode:changed', (payload) => {
            runtimeModeModel.handleModeChanged(payload)
            void moduleAccessModel.refresh()
            this.emit('mode:changed', payload)
          }),
        )

        console.info('[dashboard][tauri] connect(): subscribed to events', {
          count: this.unlisten.length,
          events: [
            'update:state',
            'catalog:event',
            'catalog:event:batch',
            'vault:locked',
            'volume:status',
            'ping',
            'pong',
            'media-stream:error',
            'ssh-agent:sign-request',
            'android-media-session:action',
            'android-video-player:event',
            'android-audio-player:event',
            'native-audio-player:event',
            'mode:changed',
          ],
        })

        try {
          const response = await tauriInvoke<RpcResult<{storage_root: string}>>('init_local_storage')
          if (!isSuccess(response)) {
            console.warn('[dashboard][tauri] init_local_storage failed', response.error)
          }
        } catch (error) {
          console.warn('[dashboard][tauri] init_local_storage invoke failed', error)
        }

        try {
          const capabilities = await tauriInvoke<RuntimeCapabilities>('runtime_capabilities')
          setRuntimeCapabilities(capabilities)
          void moduleAccessModel.refresh()
        } catch (error) {
          console.warn('[dashboard][tauri] runtime_capabilities invoke failed', error)
          setRuntimeCapabilities(null)
        }

        try {
          const modeInfo = await tauriInvoke<RuntimeModeInfo>('mode_status')
          runtimeModeModel.setCoreMode(modeInfo.mode, modeInfo.remote_core_features)
          void moduleAccessModel.refresh()
        } catch (modeStatusError) {
          try {
            const mode = await tauriInvoke<RpcResult<RuntimeCoreMode>>('get_current_mode')
            if (isSuccess(mode)) {
              runtimeModeModel.setCoreMode(mode.result)
            } else {
              runtimeModeModel.setCoreMode('switching')
              console.warn('[dashboard][tauri] get_current_mode failed', mode.error)
            }
          } catch (error) {
            runtimeModeModel.setCoreMode('switching')
            console.warn('[dashboard][tauri] get_current_mode invoke failed', error)
          }
          console.warn('[dashboard][tauri] mode_status invoke failed', modeStatusError)
        }

        this.connected.set(true)
      } catch (error) {
        console.warn('[dashboard][tauri] connect(): failed', error)
        this.lastError.set(error instanceof Error ? error.message : String(error))
        this.connected.set(false)
      } finally {
        this.connecting.set(false)
      }
    })()
  }

  disconnect(): void {
    for (const unlisten of this.unlisten) {
      try {
        unlisten()
      } catch (error) {
        console.warn('[dashboard][tauri] disconnect(): unlisten failed', error)
      }
    }

    this.unlisten = []
    setRuntimeCapabilities(null)
    runtimeModeModel.handleTransportDisconnect()
    this.connected.set(false)
    this.connecting.set(false)
  }

  on(event: string, handler: TransportEventHandler): void {
    const set = this.handlers.get(event) ?? new Set()
    set.add(handler)
    this.handlers.set(event, set)
  }

  off(event: string, handler: TransportEventHandler): void {
    const set = this.handlers.get(event)
    if (!set) return

    set.delete(handler)
    if (set.size === 0) this.handlers.delete(event)
  }

  getRuntimeCapabilities(): RuntimeCapabilities {
    return getRuntimeCapabilities()
  }

  private emit(event: string, payload: unknown): void {
    const set = this.handlers.get(event)
    if (!set) return

    for (const handler of set) {
      try {
        handler(undefined, payload)
      } catch (error) {
        console.warn('[dashboard][tauri] event handler failed', {
          event,
          error,
        })
      }
    }
  }

  private async rpc<T extends RpcCmdName>(command: T, data: RpcCmdData<T>): Promise<RpcCmdResult<T>> {
    const t0 = performance.now()
    const response = await tauriInvoke<RpcDispatchResponse>('rpc_dispatch', {
      args: {
        v: 1,
        command,
        data,
      },
    })
    const dt = Math.round(performance.now() - t0)
    if (dt > 100) {
      console.info('[debug][rpc] rpc: command=%s dt_ms=%d', command, dt)
    }

    if (!isSuccess(response)) {
      const message = response.error || 'RPC error'
      const code = response.code ? ` (${response.code})` : ''
      throw new Error(`${message}${code}`)
    }

    const out = response.result
    if (!out || typeof out !== 'object' || !('command' in out) || !('result' in out)) {
      throw new Error('Invalid rpc_dispatch response')
    }

    const result = out as RpcCommandResult
    if (!isRpcCommandResult(command, result)) {
      throw new Error(`rpc_dispatch command mismatch: expected ${command}, got ${result.command}`)
    }

    return result.result as RpcCmdResult<T>
  }

  private async rpcDispatch(command: string, data: Record<string, unknown>): Promise<unknown> {
    const t0 = performance.now()
    const response = await tauriInvoke<RpcDispatchResponse>('rpc_dispatch', {
      args: {
        v: 1,
        command,
        data,
      },
    })
    const dt = Math.round(performance.now() - t0)
    if (dt > 100) {
      console.info('[debug][rpc] rpcDispatch: command=%s dt_ms=%d', command, dt)
    }

    if (!isSuccess(response)) {
      const message = response.error || 'RPC error'
      const code = response.code ? ` (${response.code})` : ''
      throw new Error(`${message}${code}`)
    }

    const out = response.result
    if (!out || typeof out !== 'object' || !('command' in out) || !('result' in out)) {
      throw new Error('Invalid rpc_dispatch response')
    }

    const result = out as RpcCommandResult
    if (result.command !== command) {
      throw new Error(`rpc_dispatch command mismatch: expected ${command}, got ${result.command}`)
    }

    return result.result
  }

  private async rpcDispatchRaw(command: string, data: Record<string, unknown>): Promise<RpcResult<unknown>> {
    return tauriInvoke<RpcResult<unknown>>('rpc_dispatch', {
      args: {
        v: 1,
        command,
        data,
      },
    })
  }

  async sendCatalog(command: string, data: Record<string, unknown>): Promise<unknown> {
    if (command.startsWith('passmanager:')) {
      return this.sendPassmanager(command, data)
    }
    return dispatchTauriCatalogCommand({
      command,
      data,
      logger: defaultLogger,
      rpc: <T extends RpcCmdName>(cmd: T, payload: RpcCmdData<T>) => this.rpc(cmd, payload),
      rpcDispatch: (cmd, payload) => this.rpcDispatch(cmd, payload),
      rpcDispatchRaw: (cmd, payload) => this.rpcDispatchRaw(cmd, payload),
    })
  }

  async sendPassmanager(command: string, data: Record<string, unknown>): Promise<unknown> {
    const result = await dispatchTauriCatalogCommand({
      command,
      data,
      logger: defaultLogger,
      rpc: <T extends RpcCmdName>(cmd: T, payload: RpcCmdData<T>) => this.rpc(cmd, payload),
      rpcDispatch: (cmd, payload) => this.rpcDispatch(cmd, payload),
      rpcDispatchRaw: (cmd, payload) => this.rpcDispatchRaw(cmd, payload),
    })

    if (isPassmanagerMutatingCommand(command)) {
      queueMicrotask(() => {
        this.emit('passmanager:changed', {command})
      })
    }

    return result
  }

  async uploadFile(
    target: number | {parentPath?: string; name: string},
    file: File,
    opts?: {
      chunkSize?: number
      name?: string
      type?: string
      onProgress?: (c: number, t: number, p: number) => void
    },
  ): Promise<{nodeId: number}> {
    return uploadFileViaTauri(target, file, opts)
  }

  async statPath(path: string): Promise<{name: string; size: number}> {
    return statPathViaTauri(path)
  }

  async uploadFilePath(
    target: number | {parentPath?: string; name: string},
    path: string,
    opts?: {
      uploadId?: string
      chunkSize?: number
      totalBytes?: number
      onProgress?: (c: number, t: number, p: number) => void
    },
  ): Promise<{nodeId: number}> {
    return uploadFilePathViaTauri(target, path, opts)
  }

  async uploadNativeFiles(
    parentPath: string,
    opts?: NativeUploadOptions,
  ): Promise<void> {
    return uploadNativeFilesViaTauri(parentPath, opts)
  }

  async uploadSharedFiles(
    parentPath: string,
    sharedSessionId: string,
    opts?: NativeUploadOptions,
  ): Promise<void> {
    return uploadSharedFilesViaTauri(parentPath, sharedSessionId, opts)
  }

  async uploadAndroidSharedFiles(
    parentPath: string,
    shareSessionId: string,
    opts?: NativeUploadOptions,
  ): Promise<void> {
    return uploadAndroidSharedFilesViaTauri(parentPath, shareSessionId, opts)
  }

  async cancelSharedFiles(sharedSessionId: string): Promise<void> {
    return cancelSharedFilesViaTauri(sharedSessionId)
  }

  async cancelAndroidSharedFiles(shareSessionId: string): Promise<void> {
    return cancelAndroidSharedFilesViaTauri(shareSessionId)
  }

  async startNativeOtpQrScan(scanId: string): Promise<void> {
    return startNativeOtpQrScanViaTauri(scanId)
  }

  async cancelNativeOtpQrScan(scanId: string): Promise<void> {
    return cancelNativeOtpQrScanViaTauri(scanId)
  }

  async downloadFile(nodeId: number): Promise<AsyncIterable<Uint8Array>> {
    return downloadFileViaTauri(nodeId)
  }

  async sourceMetadata(nodeId: number): Promise<CatalogSourceMetadata> {
    const result = await this.rpc('catalog:source:metadata', {node_id: nodeId})
    return normalizeCatalogSourceMetadata(result)
  }

  async replaceFile(
    nodeId: number,
    bytes: Uint8Array,
    options: CatalogFileReplaceOptions,
  ): Promise<CatalogFileReplaceResult> {
    return replaceFileViaTauri(nodeId, bytes, options)
  }

  async previewImage(
    nodeId: number,
    opts: {
      fileName: string
      mimeType?: string | null
      lastModified?: number | null
      refreshDerivativeCache?: boolean
    },
  ): Promise<{bytes: Uint8Array; mimeType: string; name: string; chunkSize: number}> {
    return previewImageViaTauri(nodeId, opts)
  }

  async thumbnailImage(
    nodeId: number,
    opts: {
      fileName: string
      mimeType?: string | null
      lastModified?: number | null
      refreshDerivativeCache?: boolean
    },
  ): Promise<{bytes: Uint8Array; mimeType: string; name: string; chunkSize: number}> {
    return thumbnailImageViaTauri(nodeId, opts)
  }

  async imageMetadata(
    nodeId: number,
    opts: {
      fileName: string
      mimeType?: string | null
      lastModified?: number | null
    },
  ): Promise<ImagePhotoMetadata> {
    return imageMetadataViaTauri(nodeId, opts)
  }

  async preparePreviewFile(
    nodeId: number,
    opts: {
      fileName: string
      mimeType?: string | null
      lastModified?: number | null
      variant: PreparedPreviewFileVariant
      refreshDerivativeCache?: boolean
    },
  ): Promise<PreparedPreviewFileSource> {
    return preparePreviewFileViaTauri(nodeId, opts)
  }

  async releasePreviewFile(source: PreparedPreviewFileSource): Promise<void> {
    return releasePreviewFileViaTauri(source)
  }

  async purgePreviewSources(reason: PreviewCachePurgeReason): Promise<PreviewCachePurgeResult> {
    return purgePreviewSourcesViaTauri(reason)
  }

  async prepareMediaStream(
    nodeId: number,
    opts: {
      fileName: string
      mimeType?: string | null
      lastModified?: number | null
    },
  ): Promise<PreparedMediaStreamSource> {
    return prepareMediaStreamViaTauri(nodeId, opts)
  }

  async releaseMediaStream(source: PreparedMediaStreamSource): Promise<void> {
    return releaseMediaStreamViaTauri(source)
  }

  async startAndroidVideo(
    nodeId: number,
    opts: {
      fileName: string
      mimeType?: string | null
      lastModified?: number | null
    },
  ): Promise<PreparedAndroidVideoSource> {
    return startAndroidVideoViaTauri(nodeId, opts)
  }

  async stopAndroidVideo(source: PreparedAndroidVideoSource): Promise<void> {
    return stopAndroidVideoViaTauri(source)
  }

  async sendAndroidAudioCommand(command: AndroidAudioCommand): Promise<AndroidAudioCommandResult> {
    return sendAndroidAudioCommandViaTauri(command)
  }

  async sendNativeAudioCommand(command: NativeAudioCommand): Promise<NativeAudioCommandResult> {
    return sendNativeAudioCommandViaTauri(command)
  }

  async warmupAndroidAudio(): Promise<boolean> {
    return warmupAndroidAudioViaTauri()
  }

  async downloadFilePath(
    nodeId: number,
    targetPath: string,
    opts?: {
      downloadId?: string
      totalBytes?: number
      onProgress?: (writtenBytes: number, totalBytes: number, percent: number) => void
    },
  ): Promise<{bytes_written: number; name: string; mime_type: string}> {
    return downloadFilePathViaTauri(nodeId, targetPath, opts)
  }

  async openExternal(
    nodeId: number,
    opts?: {
      openId?: string
      onProgress?: (writtenBytes: number, totalBytes: number, percent: number) => void
    },
  ): Promise<{path: string}> {
    return openExternalViaTauri(nodeId, opts)
  }

  async readSecret(nodeId: number): Promise<AsyncIterable<Uint8Array>> {
    return readSecretViaTauri(nodeId)
  }

  async writeSecret(nodeId: number, data: ArrayBuffer): Promise<void> {
    return writeSecretViaTauri(nodeId, data)
  }

  async eraseSecret(nodeId: number): Promise<void> {
    await this.rpc('catalog:secret:erase', {node_id: nodeId})
  }

  async generateOTP(params: {
    otpId?: string
    entryId?: string
    ts?: number
    digits?: number
    period?: number
    ha?: string
  }): Promise<string> {
    const otp_id = params.otpId?.trim() || null
    const entry_id = params.entryId?.trim() || null
    if (!otp_id && !entry_id) {
      throw new Error('generateOTP requires otpId or entryId')
    }

    const response = (await this.sendPassmanager('passmanager:otp:generate', {
      otp_id,
      entry_id,
      ts: params.ts ?? null,
      digits: params.digits ?? null,
      period: params.period ?? null,
      ha: params.ha ?? null,
    })) as {ok: boolean; result?: {otp?: string}}

    if (!response.result?.otp) {
      throw new Error('passmanager:otp:generate returned no OTP code')
    }

    return response.result.otp
  }

  async setOTPSecret(params: {
    otpId: string
    entryId?: string
    secret: string
    encoding?: string
    algorithm?: string
    digits?: number
    period?: number
  }): Promise<void> {
    await this.sendPassmanager('passmanager:otp:setSecret', {
      otp_id: params.otpId,
      entry_id: params.entryId ?? null,
      secret: params.secret,
      encoding: params.encoding ?? null,
      algorithm: params.algorithm ?? null,
      digits: params.digits ?? null,
      period: params.period ?? null,
    })
  }

  async removeOTPSecret(params: {otpId: string; entryId?: string}): Promise<void> {
    await this.sendPassmanager('passmanager:otp:removeSecret', {
      otp_id: params.otpId,
      entry_id: params.entryId ?? null,
    })
  }
}
