import {navigationModel} from 'root/app/navigation/navigation.model'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {tauriInvoke} from 'root/core/transport/tauri/ipc'
import {runtimeModeModel} from 'root/core/runtime/runtime-mode.model'
import {getAppContext} from 'root/shared/services/app-context'
import {subscribeToSignalChanges, type Unsubscribe} from 'root/shared/services/subscribed-signal'
import {i18n} from 'root/i18n'
import {wrap} from '@reatom/core'

import {
  getModeStatus,
  isRemoteMode,
  mobileUsbStatus,
  onConnectionStatus,
  onMobileUsbStatusChanged,
  onModeChanged,
  type MobileUsbStatus,
  type RemoteHost,
} from './remote.model'

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
    throw new Error(res.error || i18n('remote:rpc-error'))
  }
  if (!res.result || typeof res.result !== 'object' || res.result.command !== command) {
    throw new Error(`rpc_dispatch command mismatch: expected ${command}`)
  }
  return res.result.result
}

function resolveRemotePeerId(host: RemoteHost): string | null {
  if (host.type === 'tauri_remote_wss') return host.peer_id
  if (host.type === 'mobile_usb') return host.host_id
  return null
}

function isMobileUsbHost(host: RemoteHost): boolean {
  return host.type === 'mobile_usb'
}

function normalizeTransportSessionGeneration(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

function readRemoteSessionGeneration(store: unknown): number | null {
  const source = (store as {remoteSessionGeneration?: () => number | null}).remoteSessionGeneration
  return typeof source === 'function' ? source() : null
}

function setRemoteSessionGeneration(store: unknown, generation: number | null): void {
  const source = (store as {remoteSessionGeneration?: {set?: (value: number | null) => void}})
    .remoteSessionGeneration
  if (typeof source?.set === 'function') source.set(generation)
}

function setRemoteSessionPhoneApproval(store: unknown, peerId: string | null): void {
  const source = (store as {setRemoteSessionPhoneApproval?: (peerId: string | null) => void})
    .setRemoteSessionPhoneApproval
  if (typeof source === 'function') {
    source(peerId)
    return
  }

  const fallback = (store as {setRemoteSessionWaiting?: (peerId: string | null) => void})
    .setRemoteSessionWaiting
  if (typeof fallback === 'function') fallback(peerId)
}

class RemoteSessionModel {
  private readonly pollIntervalMs = 5_000
  private modeChangedUnlisten: (() => void) | null = null
  private connectionStatusUnlisten: (() => void) | null = null
  private mobileUsbStatusUnlisten: (() => void) | null = null
  private transportConnectedUnlisten: Unsubscribe | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private syncPromise: Promise<void> | null = null
  private connected = false

  async connect(): Promise<void> {
    if (this.connected) return
    this.connected = true
    const {ws} = getAppContext()
    this.transportConnectedUnlisten = subscribeToSignalChanges(ws.connected, (connected) => {
      if (connected) void this.syncNow()
    })
    this.modeChangedUnlisten = await wrap(onModeChanged(wrap(() => {
      void this.syncNow()
    })))
    this.connectionStatusUnlisten = await wrap(onConnectionStatus(wrap(() => {
      void this.syncNow()
    })))
    this.mobileUsbStatusUnlisten = await wrap(onMobileUsbStatusChanged(wrap(() => {
      void this.syncNow()
    })))
    await wrap(this.syncNow())
  }

  disconnect(): void {
    this.modeChangedUnlisten?.()
    this.connectionStatusUnlisten?.()
    this.mobileUsbStatusUnlisten?.()
    this.transportConnectedUnlisten?.()
    this.modeChangedUnlisten = null
    this.connectionStatusUnlisten = null
    this.mobileUsbStatusUnlisten = null
    this.transportConnectedUnlisten = null
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
    const {store, ws} = getAppContext()

    if (!ws.connected() || !getRuntimeCapabilities().desktop) {
      store.resetRemoteSession()
      this.stopPolling()
      return
    }

    const previousState = store.remoteSessionState()
    const previousPeerId = store.remoteSessionPeerId()
    const previousGeneration = readRemoteSessionGeneration(store)

    let modeInfo
    try {
      modeInfo = await wrap(getModeStatus())
    } catch (error) {
      console.warn('[remote-session] mode_status failed', error)
      store.resetRemoteSession()
      this.stopPolling()
      return
    }
    const transportSessionGeneration = normalizeTransportSessionGeneration(
      modeInfo.transport_session_generation,
    )
    runtimeModeModel.setCoreMode(modeInfo.mode, modeInfo.remote_core_features, transportSessionGeneration)

    if (!isRemoteMode(modeInfo.mode)) {
      store.resetRemoteSession()
      this.stopPolling()
      return
    }

    const remoteHost = modeInfo.mode.remote.host as RemoteHost
    const peerId = resolveRemotePeerId(remoteHost)
    if (!peerId || modeInfo.connection_state === 'disconnected' || modeInfo.connection_state === 'error') {
      store.resetRemoteSession()
      this.stopPolling()
      return
    }

    this.startPolling()

    if (isMobileUsbHost(remoteHost)) {
      const usbStatus = await this.loadMobileUsbStatus()
      if (usbStatus?.session_state === 'session_approval_required') {
        setRemoteSessionGeneration(store, transportSessionGeneration)
        setRemoteSessionPhoneApproval(store, peerId)
        return
      }

      if (usbStatus?.session_state === 'transport_ready_host_locked') {
        setRemoteSessionGeneration(store, transportSessionGeneration)
        store.setRemoteSessionWaiting(peerId)
        if (previousState === 'ready') {
          store.handleRemoteHostLocked()
        }
        return
      }
    }

    let vaultStatus: VaultStatusResponse
    try {
      vaultStatus = await wrap(tauriRpc<VaultStatusResponse>('vault:status', {}))
    } catch (error) {
      console.warn('[remote-session] vault:status failed', error)
      return
    }

    if (vaultStatus.is_unlocked) {
      if (
        previousState !== 'ready' ||
        previousPeerId !== peerId ||
        previousGeneration !== transportSessionGeneration
      ) {
        navigationModel.reset()
      }
      setRemoteSessionGeneration(store, transportSessionGeneration)
      store.setRemoteSessionReady(peerId)
      return
    }

    setRemoteSessionGeneration(store, transportSessionGeneration)
    store.setRemoteSessionWaiting(peerId)
    if (previousState === 'ready') {
      store.handleRemoteHostLocked()
    }
  }

  private async loadMobileUsbStatus(): Promise<MobileUsbStatus | null> {
    try {
      return await wrap(mobileUsbStatus())
    } catch (error) {
      console.warn('[remote-session] mobile_usb_status failed', error)
      return null
    }
  }

  private startPolling(): void {
    if (this.pollTimer !== null) return
    this.pollTimer = setInterval(wrap(() => {
      void this.syncNow()
    }), this.pollIntervalMs)
  }

  private stopPolling(): void {
    if (this.pollTimer === null) return
    clearInterval(this.pollTimer)
    this.pollTimer = null
  }
}

export const remoteSessionModel = new RemoteSessionModel()
