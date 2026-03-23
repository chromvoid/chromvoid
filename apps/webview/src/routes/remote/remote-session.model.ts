import {navigationModel} from 'root/app/navigation/navigation.model'
import {tauriInvoke} from 'root/core/transport/tauri/ipc'
import {getAppContext} from 'root/shared/services/app-context'

import {getModeStatus, isRemoteMode, onConnectionStatus, onModeChanged, type RemoteHost} from './remote.model'

type RpcOk<T> = {ok: true; result: T}
type RpcErr = {ok: false; error: string; code?: string | null}
type RpcResult<T> = RpcOk<T> | RpcErr
type RpcCommandResult<T> = {command: string; result: T}

type VaultStatusResponse = {
  is_unlocked: boolean
  session_started_at: number | null
}

function isOk<T>(res: RpcResult<T>): res is RpcOk<T> {
  return typeof res === 'object' && res !== null && 'ok' in res && (res as {ok: unknown}).ok === true
}

async function tauriRpc<T = unknown>(command: string, data: Record<string, unknown>): Promise<T> {
  const res = await tauriInvoke<RpcResult<RpcCommandResult<T>>>('rpc_dispatch', {args: {v: 1, command, data}})
  if (!isOk(res)) {
    throw new Error(res.error || 'RPC error')
  }
  if (!res.result || typeof res.result !== 'object' || res.result.command !== command) {
    throw new Error(`rpc_dispatch command mismatch: expected ${command}`)
  }
  return res.result.result
}

function resolveRemotePeerId(host: RemoteHost): string | null {
  return host.type === 'tauri_remote_wss' ? host.peer_id : null
}

class RemoteSessionModel {
  private readonly pollIntervalMs = 5_000
  private modeChangedUnlisten: (() => void) | null = null
  private connectionStatusUnlisten: (() => void) | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private syncPromise: Promise<void> | null = null
  private connected = false

  async connect(): Promise<void> {
    if (this.connected) return
    this.connected = true
    this.modeChangedUnlisten = await onModeChanged(() => {
      void this.syncNow()
    })
    this.connectionStatusUnlisten = await onConnectionStatus(() => {
      void this.syncNow()
    })
    await this.syncNow()
  }

  disconnect(): void {
    this.modeChangedUnlisten?.()
    this.connectionStatusUnlisten?.()
    this.modeChangedUnlisten = null
    this.connectionStatusUnlisten = null
    this.stopPolling()
    this.syncPromise = null
    this.connected = false
  }

  async syncNow(): Promise<void> {
    if (this.syncPromise) {
      await this.syncPromise
      return
    }

    const pending = this.performSync().finally(() => {
      if (this.syncPromise === pending) {
        this.syncPromise = null
      }
    })
    this.syncPromise = pending
    await pending
  }

  private async performSync(): Promise<void> {
    const {store} = getAppContext()
    const previousState = store.remoteSessionState()
    const previousPeerId = store.remoteSessionPeerId()

    let modeInfo
    try {
      modeInfo = await getModeStatus()
    } catch (error) {
      console.warn('[remote-session] mode_status failed', error)
      store.resetRemoteSession()
      this.stopPolling()
      return
    }

    if (!isRemoteMode(modeInfo.mode)) {
      store.resetRemoteSession()
      this.stopPolling()
      return
    }

    const peerId = resolveRemotePeerId(modeInfo.mode.remote.host as RemoteHost)
    if (!peerId || modeInfo.connection_state === 'disconnected' || modeInfo.connection_state === 'error') {
      store.resetRemoteSession()
      this.stopPolling()
      return
    }

    this.startPolling()

    let vaultStatus: VaultStatusResponse
    try {
      vaultStatus = await tauriRpc<VaultStatusResponse>('vault:status', {})
    } catch (error) {
      console.warn('[remote-session] vault:status failed', error)
      return
    }

    if (vaultStatus.is_unlocked) {
      if (previousState !== 'ready' || previousPeerId !== peerId) {
        navigationModel.reset()
      }
      store.setRemoteSessionReady(peerId)
      return
    }

    store.setRemoteSessionWaiting(peerId)
    if (previousState === 'ready') {
      store.handleRemoteHostLocked()
    }
  }

  private startPolling(): void {
    if (this.pollTimer !== null) return
    this.pollTimer = setInterval(() => {
      void this.syncNow()
    }, this.pollIntervalMs)
  }

  private stopPolling(): void {
    if (this.pollTimer === null) return
    clearInterval(this.pollTimer)
    this.pollTimer = null
  }
}

export const remoteSessionModel = new RemoteSessionModel()
