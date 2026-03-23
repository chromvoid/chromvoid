import {state} from '@statx/core'

import type {TransportEventHandler, TransportLike} from '../transport'
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
import {dispatchTauriCatalogCommand} from './tauri-catalog-command-dispatcher'
import {
  downloadFilePathViaTauri,
  downloadFileViaTauri,
  readSecretViaTauri,
  statPathViaTauri,
  uploadFilePathViaTauri,
  uploadFileViaTauri,
  writeSecretViaTauri,
} from './tauri-binary-ops'
import type {RpcCmdData, RpcCmdName, RpcCmdResult} from './tauri-rpc-types'

function isRpcCommandResult<T extends RpcCmdName>(
  command: T,
  value: RpcCommandResult,
): value is Extract<RpcCommandResult, {command: T}> {
  return value.command === command
}

type HandlerSet = Set<TransportEventHandler>

export class TauriTransport implements TransportLike {
  readonly kind = 'tauri' as const

  connected = state(false)
  connecting = state(false)
  lastError = state<string | undefined>(undefined)

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
        this.unlisten.push(await tauriListen('vault:locked', (payload) => this.emit('vault:locked', payload)))
        this.unlisten.push(
          await tauriListen('volume:status', (payload) => this.emit('volume:status', payload)),
        )
        this.unlisten.push(await tauriListen('ping', (payload) => this.emit('ping', payload)))
        this.unlisten.push(await tauriListen('pong', (payload) => this.emit('pong', payload)))
        this.unlisten.push(
          await tauriListen('ssh-agent:sign-request', (payload) =>
            this.emit('ssh-agent:sign-request', payload),
          ),
        )

        console.info('[dashboard][tauri] connect(): subscribed to events', {
          count: this.unlisten.length,
          events: [
            'update:state',
            'catalog:event',
            'vault:locked',
            'volume:status',
            'ping',
            'pong',
            'ssh-agent:sign-request',
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
        } catch (error) {
          console.warn('[dashboard][tauri] runtime_capabilities invoke failed', error)
          setRuntimeCapabilities(null)
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
    return dispatchTauriCatalogCommand({
      command,
      data,
      logger: defaultLogger,
      rpc: <T extends RpcCmdName>(cmd: T, payload: RpcCmdData<T>) => this.rpc(cmd, payload),
      rpcDispatch: (cmd, payload) => this.rpcDispatch(cmd, payload),
      rpcDispatchRaw: (cmd, payload) => this.rpcDispatchRaw(cmd, payload),
    })
  }

  async uploadFile(
    nodeId: number,
    file: File,
    opts?: {
      chunkSize?: number
      name?: string
      type?: string
      onProgress?: (c: number, t: number, p: number) => void
    },
  ): Promise<void> {
    return uploadFileViaTauri(nodeId, file, opts)
  }

  async statPath(path: string): Promise<{name: string; size: number}> {
    return statPathViaTauri(path)
  }

  async uploadFilePath(
    nodeId: number,
    path: string,
    opts?: {
      uploadId?: string
      chunkSize?: number
      totalBytes?: number
      onProgress?: (c: number, t: number, p: number) => void
    },
  ): Promise<void> {
    return uploadFilePathViaTauri(nodeId, path, opts)
  }

  async downloadFile(nodeId: number): Promise<AsyncIterable<Uint8Array>> {
    return downloadFileViaTauri(nodeId)
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

    const response = (await this.sendCatalog('passmanager:otp:generate', {
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
    await this.sendCatalog('passmanager:otp:setSecret', {
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
    await this.sendCatalog('passmanager:otp:removeSecret', {
      otp_id: params.otpId,
      entry_id: params.entryId ?? null,
    })
  }
}
