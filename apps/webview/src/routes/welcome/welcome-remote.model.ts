import {computed, state} from '@statx/core'

import {getAppContext} from 'root/shared/services/app-context'
import {dialogService} from 'root/shared/services/dialog'

import {NetworkPairModel} from '../network-pair/network-pair.model'
import {
  getModeStatus,
  isRemoteMode,
  listNetworkPairedPeers,
  removeNetworkPairedPeer,
  switchMode,
  type ModeInfo,
  type NetworkPairedPeer,
  type RemoteHost,
} from '../remote/remote.model'
import {remoteSessionModel} from '../remote/remote-session.model'

type WelcomeRemoteCallbacks = {
  onTransportLost?: () => void
}

export class WelcomeRemoteModel {
  readonly peers = state<NetworkPairedPeer[]>([])
  readonly loadingPeers = state(false)
  readonly removingPeerId = state<string | null>(null)
  readonly activePeerId = state<string | null>(null)
  readonly transportConnectedPeerId = state<string | null>(null)
  readonly errorText = state<string | null>(null)
  readonly statusText = state<string | null>(null)
  readonly pairModel = new NetworkPairModel()

  readonly transportConnected = computed<boolean>(() => this.transportConnectedPeerId() !== null)
  readonly connectedPeer = computed<NetworkPairedPeer | null>(() => {
    const peerId = this.transportConnectedPeerId()
    if (!peerId) return null
    return this.peers().find((peer) => peer.peer_id === peerId) ?? null
  })

  private callbacks: WelcomeRemoteCallbacks = {}
  private modePollTimer: ReturnType<typeof setInterval> | null = null
  private peerPollTimer: ReturnType<typeof setInterval> | null = null
  private peerPollingEnabled = false

  connect(callbacks: WelcomeRemoteCallbacks = {}): void {
    this.callbacks = callbacks
    void this.refreshModeState()
  }

  disconnect(): void {
    this.stopModePolling()
    this.pausePeerPolling()
    this.callbacks = {}
    this.pairModel.dispose()
  }

  async loadPeers(): Promise<void> {
    this.peerPollingEnabled = true
    if (this.loadingPeers()) return
    console.info('[welcome-remote] loadPeers:start')
    this.loadingPeers.set(true)
    this.errorText.set(null)
    try {
      const [peers] = await Promise.all([listNetworkPairedPeers(), this.refreshModeState()])
      this.peers.set(peers)
      console.info('[welcome-remote] loadPeers:success', {count: peers.length})
    } catch (e) {
      console.error('[welcome-remote] loadPeers:failed', e)
      this.errorText.set(e instanceof Error ? e.message : String(e))
    } finally {
      this.loadingPeers.set(false)
      if (this.peerPollingEnabled && !this.transportConnected()) {
        this.startPeerPolling()
      }
    }
  }

  async submitPairing(): Promise<boolean> {
    this.stopPeerPolling()
    console.info('[welcome-remote] submitPairing:start', {
      phase: this.pairModel.phase(),
      offerLength: this.pairModel.offerInput().trim().length,
      pinLength: this.pairModel.pinInput().trim().length,
      deviceLabel: this.pairModel.currentDeviceLabel(),
    })
    this.errorText.set(null)
    this.statusText.set('Pairing with iPhone host…')

    await this.pairModel.startPairing()
    console.info('[welcome-remote] submitPairing:afterStart', {
      phase: this.pairModel.phase(),
      error: this.pairModel.error(),
    })
    if (this.pairModel.phase() !== 'success') {
      this.statusText.set(null)
      this.errorText.set(this.pairModel.error())
      return false
    }

    await this.loadPeers()
    console.info('[welcome-remote] submitPairing:success', {
      peerCount: this.peers().length,
    })
    this.statusText.set('Pairing completed. Select the iPhone host to connect.')
    await this.pairModel.cancelPairing()
    return true
  }

  async cancelPairing(): Promise<void> {
    console.info('[welcome-remote] cancelPairing')
    await this.pairModel.cancelPairing()
    this.errorText.set(null)
    this.statusText.set(null)
  }

  async removePeer(peer: NetworkPairedPeer): Promise<boolean> {
    if (this.removingPeerId() || this.loadingPeers()) return false

    const label = peer.label || peer.peer_id
    const targetLabel = peer.platform === 'ios' ? 'paired iPhone host' : 'paired network peer'
    const confirmed = await dialogService.showConfirmDialog({
      title: 'Remove Paired Host',
      message: `Remove "${label}" from ${targetLabel}s? You will need to pair it again before reconnecting.`,
      confirmText: 'Remove',
      confirmVariant: 'danger',
    })
    if (!confirmed) return false

    this.removingPeerId.set(peer.peer_id)
    this.errorText.set(null)
    this.statusText.set('Removing paired host…')

    try {
      await removeNetworkPairedPeer(peer.peer_id)
      await this.loadPeers()
      this.statusText.set('Paired host removed.')
      return true
    } catch (e) {
      this.statusText.set(null)
      this.errorText.set(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      this.removingPeerId.set(null)
    }
  }

  async connectToPeer(peerId: string): Promise<boolean> {
    this.activePeerId.set(peerId)
    this.errorText.set(null)
    this.statusText.set('Connecting to remote host…')
    this.stopPeerPolling()

    try {
      const modeInfo = await this.safeGetModeStatus()
      if (modeInfo && isRemoteMode(modeInfo.mode)) {
        const modePeerId = this.resolveModeRemotePeerId(modeInfo)
        const activePeerId = this.resolveActiveRemotePeerId(modeInfo)
        if (modePeerId === peerId && activePeerId === peerId) {
          await remoteSessionModel.syncNow()
          await this.refreshModeState()
          this.statusText.set('Transport connected. Waiting for the vault to be opened on your iPhone.')
          return true
        } else {
          await this.restoreLocalModeIfNeeded()
        }
      }

      await switchMode('remote', peerId)
      await this.refreshModeState()
      if (!this.transportConnected()) {
        throw new Error('Remote transport did not become ready.')
      }
      await remoteSessionModel.syncNow()
      this.statusText.set('Transport connected. Waiting for the vault to be opened on your iPhone.')
      return true
    } catch (e) {
      this.statusText.set(null)
      this.errorText.set(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      this.activePeerId.set(null)
      if (this.peerPollingEnabled && !this.transportConnected()) {
        this.startPeerPolling()
      }
    }
  }

  async exitPreAuthRemote(): Promise<void> {
    await this.restoreLocalModeIfNeeded()
    this.reset()
  }

  async disconnectTransport(): Promise<void> {
    this.statusText.set('Disconnecting…')
    await this.restoreLocalModeIfNeeded()
    this.statusText.set(null)
  }

  pausePeerPolling(): void {
    this.peerPollingEnabled = false
    this.stopPeerPolling()
  }

  private async refreshModeState(): Promise<void> {
    const modeInfo = await this.safeGetModeStatus()
    const previousPeerId = this.transportConnectedPeerId()
    const nextPeerId = this.resolveActiveRemotePeerId(modeInfo)

    this.transportConnectedPeerId.set(nextPeerId)
    if (nextPeerId) {
      this.stopPeerPolling()
      this.startModePolling()
      if (!this.statusText()) {
        this.statusText.set('Transport connected. Open the vault on your iPhone to continue.')
      }
      return
    }

    this.stopModePolling()
    if (this.peerPollingEnabled) {
      this.startPeerPolling()
    }
    if (previousPeerId) {
      this.statusText.set(null)
      this.errorText.set('Remote connection lost before unlock.')
      this.callbacks.onTransportLost?.()
    }
  }

  private async restoreLocalModeIfNeeded(): Promise<void> {
    const modeInfo = await this.safeGetModeStatus()
    if (modeInfo && isRemoteMode(modeInfo.mode)) {
      try {
        await switchMode('local')
      } catch {
        // best-effort
      }
    }
    this.stopModePolling()
    this.stopPeerPolling()
    this.transportConnectedPeerId.set(null)
    this.activePeerId.set(null)
    getAppContext().store.resetRemoteSession()
  }

  private async safeGetModeStatus(): Promise<ModeInfo | null> {
    try {
      return await getModeStatus()
    } catch (e) {
      this.errorText.set(e instanceof Error ? e.message : String(e))
      return null
    }
  }

  private resolveRemotePeerId(modeInfo: ModeInfo | null): string | null {
    if (!modeInfo || !isRemoteMode(modeInfo.mode)) return null
    const host = modeInfo.mode.remote.host as RemoteHost
    return host.type === 'tauri_remote_wss' ? host.peer_id : null
  }

  private resolveModeRemotePeerId(modeInfo: ModeInfo | null): string | null {
    return this.resolveRemotePeerId(modeInfo)
  }

  private resolveActiveRemotePeerId(modeInfo: ModeInfo | null): string | null {
    if (!modeInfo) return null
    if (modeInfo.connection_state === 'disconnected' || modeInfo.connection_state === 'error') {
      return null
    }
    return this.resolveRemotePeerId(modeInfo)
  }

  private startModePolling(): void {
    if (this.modePollTimer !== null) return
    this.modePollTimer = setInterval(() => {
      void this.refreshModeState()
    }, 2_000)
  }

  private stopModePolling(): void {
    if (this.modePollTimer === null) return
    clearInterval(this.modePollTimer)
    this.modePollTimer = null
  }

  private startPeerPolling(): void {
    if (this.peerPollTimer !== null) return
    this.peerPollTimer = setInterval(() => {
      void this.loadPeers()
    }, 2_000)
  }

  private stopPeerPolling(): void {
    if (this.peerPollTimer === null) return
    clearInterval(this.peerPollTimer)
    this.peerPollTimer = null
  }

  private reset(): void {
    this.stopModePolling()
    this.pausePeerPolling()
    this.activePeerId.set(null)
    this.transportConnectedPeerId.set(null)
    this.errorText.set(null)
    this.statusText.set(null)
  }
}
