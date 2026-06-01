import {atom, computed, wrap} from '@reatom/core'

import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {tauriInvoke} from 'root/core/transport/tauri/ipc'
import {i18n} from 'root/i18n'
import {getAppContext} from 'root/shared/services/app-context'
import {dialogService} from 'root/shared/services/dialog'

import {remoteSessionModel} from './remote-session.model'
import {
  getModeStatus,
  isRemoteMode,
  listNetworkPairedPeers,
  removeNetworkPairedPeer,
  switchMode,
  type ModeInfo,
  type NetworkPairedPeer,
  type RemoteHost,
} from './remote.model'

const DEFAULT_IOS_RELAY_URL = 'wss://relay.chromvoid.com'
const PRESENCE_AUTO_REFRESH_THRESHOLD_MS = 30_000

export interface PairingOffer {
  session_id: string
  relay_base_url: string
  device_label: string
  expires_at_ms: number
  platform?: string | null
}

export interface HostPresence {
  peer_id: string
  relay_url: string
  room_id: string
  expires_at_ms: number
  status: 'ready' | 'offline' | 'waking'
}

export type MobileHostPhase = 'Idle' | 'Pairing' | 'Ready' | 'Error'

export interface ConnectedDesktopPeer {
  peer_id: string
  label: string
  connected_at_ms: number
  transport_type: string
}

export interface MobileHostStatus {
  phase: MobileHostPhase
  platform: string
  relay_url: string | null
  device_id: string | null
  device_label: string | null
  pairing_pin: string | null
  pairing_offer: PairingOffer | null
  expires_at_ms: number | null
  presence: HostPresence | null
  paired_peer_id: string | null
  connected_peers: ConnectedDesktopPeer[]
  error: string | null
}

export type IosHostStatus = MobileHostStatus

interface ServerProfileSummary {
  profile_id: string
  mode: string
}

interface BootstrapProfile {
  profile_id: string
  relay_url: string
}

type RemoteHostsCallbacks = {
  onTransportLost?: () => void
}

export type RemoteHostsFlowView = 'hosts' | 'pair-ios' | 'wait'
export type RemoteHostsPairPhase = 'idle' | 'starting' | 'waiting' | 'connecting' | 'success' | 'failed'

export class RemoteHostsFlowModel {
  readonly view = atom<RemoteHostsFlowView>('hosts')
  readonly peers = atom<NetworkPairedPeer[]>([])
  readonly loadingPeers = atom(false)
  readonly removingPeerId = atom<string | null>(null)
  readonly activePeerId = atom<string | null>(null)
  readonly transportConnectedPeerId = atom<string | null>(null)
  readonly errorText = atom<string | null>(null)
  readonly statusText = atom<string | null>(null)

  readonly pairPhase = atom<RemoteHostsPairPhase>('idle')
  readonly pairError = atom<string | null>(null)
  readonly offerInput = atom('')
  readonly pinInput = atom('')
  readonly deviceLabel = atom('')
  readonly hostStatus = atom<MobileHostStatus | null>(null)

  readonly isMobileHostRuntime = computed<boolean>(() => {
    const caps = getRuntimeCapabilities()
    return caps.mobile && caps.supports_network_remote
  })
  readonly hostPlatform = computed<string>(() => {
    const platform = this.hostStatus()?.platform?.trim()
    if (platform) return platform
    return getRuntimeCapabilities().platform === 'android' ? 'android' : 'ios'
  })
  readonly transportConnected = computed<boolean>(() => this.transportConnectedPeerId() !== null)
  readonly connectedPeer = computed<NetworkPairedPeer | null>(() => {
    const peerId = this.transportConnectedPeerId()
    if (!peerId) return null
    return this.peers().find((peer) => peer.peer_id === peerId) ?? null
  })
  readonly connectedPeerLabel = computed<string>(() => {
    return this.connectedPeer()?.label ?? this.connectedPeer()?.peer_id ?? i18n('welcome:iphone-vault')
  })
  readonly pairingPin = computed<string>(() => this.hostStatus()?.pairing_pin ?? '')
  readonly offer = computed<PairingOffer | null>(() => this.hostStatus()?.pairing_offer ?? null)
  readonly offerText = computed<string>(() => {
    const offer = this.offer()
    if (!offer) return ''

    const params = new URLSearchParams({
      session_id: offer.session_id,
      relay_base_url: offer.relay_base_url,
      device_label: offer.device_label,
      expires_at_ms: String(offer.expires_at_ms),
      platform: offer.platform ?? this.hostPlatform(),
    })
    return `chromvoid://pair-mobile?${params.toString()}`
  })
  readonly currentDeviceLabel = computed<string>(() => {
    const hostLabel = this.hostStatus()?.device_label?.trim()
    if (hostLabel) return hostLabel

    const input = this.deviceLabel().trim()
    if (input) return input

    if (!this.isMobileHostRuntime()) {
      return i18n('network-pair:default-device-desktop')
    }

    return this.hostPlatform() === 'android'
      ? i18n('network-pair:default-device-android')
      : i18n('network-pair:default-device-ios')
  })

  private callbacks: RemoteHostsCallbacks = {}
  private modePollTimer: ReturnType<typeof setInterval> | null = null
  private peerPollTimer: ReturnType<typeof setInterval> | null = null
  private peerPollingEnabled = false
  private hostPollTimer: ReturnType<typeof setInterval> | null = null
  private presenceRefreshPromise: Promise<void> | null = null
  private peerLoadGeneration = 0
  private modeRefreshGeneration = 0
  private hostStatusGeneration = 0
  private presenceRefreshGeneration = 0

  connect(callbacks: RemoteHostsCallbacks = {}): void {
    this.callbacks = callbacks
    if (this.isMobileHostRuntime()) {
      void this.refreshHostStatus()
      return
    }
    void this.refreshModeState()
  }

  disconnect(): void {
    this.invalidateAsyncRefreshes()
    this.stopModePolling()
    this.pausePeerPolling()
    this.stopHostPolling()
    this.presenceRefreshPromise = null
    this.loadingPeers.set(false)
    this.callbacks = {}
  }

  showHosts(): void {
    this.view.set('hosts')
    this.clearPairTransientErrors()
    if (this.peerPollingEnabled && !this.transportConnected()) {
      this.startPeerPolling()
    }
  }

  openPairIos(): void {
    this.errorText.set(null)
    this.pausePeerPolling()
    this.view.set('pair-ios')

    if (this.isMobileHostRuntime()) {
      void this.refreshHostStatus()
    }
  }

  async closePairIos(): Promise<void> {
    await this.cancelPairing()
    this.showHosts()
  }

  setOfferInput(value: string): void {
    this.offerInput.set(value)
  }

  setPinInput(value: string): void {
    this.pinInput.set(value.replace(/\s+/g, ''))
  }

  setDeviceLabel(value: string): void {
    this.deviceLabel.set(value)
  }

  handleOfferInput = (event: Event) => {
    const target = event.target as {value?: string} | null
    this.setOfferInput(target?.value ?? '')
  }

  handlePinInput = (event: Event) => {
    const target = event.target as {value?: string} | null
    this.setPinInput(target?.value ?? '')
  }

  handleDeviceLabelInput = (event: Event) => {
    const target = event.target as {value?: string} | null
    this.setDeviceLabel(target?.value ?? '')
  }

  async loadPeers(): Promise<void> {
    if (this.isMobileHostRuntime()) return
    this.peerPollingEnabled = true
    if (this.loadingPeers()) return

    this.loadingPeers.set(true)
    this.errorText.set(null)
    const requestId = ++this.peerLoadGeneration
    try {
      const [peers] = await wrap(Promise.all([listNetworkPairedPeers(), this.refreshModeState()]))
      if (!this.isPeerLoadCurrent(requestId)) return
      this.peers.set(peers)
    } catch (e) {
      if (!this.isPeerLoadCurrent(requestId)) return
      this.errorText.set(e instanceof Error ? e.message : String(e))
    } finally {
      if (!this.isPeerLoadCurrent(requestId)) return
      this.loadingPeers.set(false)
      if (this.peerPollingEnabled && !this.transportConnected()) {
        this.startPeerPolling()
      }
    }
  }

  async submitPairing(): Promise<boolean> {
    this.stopPeerPolling()
    this.pairError.set(null)

    if (this.isMobileHostRuntime()) {
      await this.startIosHostMode()
      return this.pairPhase() !== 'failed'
    }

    this.errorText.set(null)
    this.statusText.set(i18n('welcome:remote-pairing'))

    await this.pairDesktopToIos()
    if (this.pairPhase() !== 'success') {
      this.statusText.set(null)
      return false
    }

    await this.loadPeers()
    this.statusText.set(i18n('welcome:remote-pairing-done'))
    this.resetPairingState({clearDesktopInputs: true})
    this.showHosts()
    return true
  }

  async cancelPairing(): Promise<void> {
    this.invalidateHostRefreshes()
    this.stopHostPolling()
    if (this.isMobileHostRuntime()) {
      try {
        await wrap(tauriInvoke<unknown>('mobile_host_stop'))
      } catch {
        // best-effort
      }
    }
    this.resetPairingState({clearDesktopInputs: true})
  }

  async removePeer(peer: NetworkPairedPeer): Promise<boolean> {
    if (this.removingPeerId() || this.loadingPeers()) return false

    const label = peer.label || peer.peer_id
    const targetLabel =
      peer.platform === 'ios' ? i18n('welcome:paired-iphone-host') : i18n('welcome:paired-network-peer')
    const confirmed = await wrap(
      dialogService.showConfirmDialog({
        title: i18n('welcome:remove-paired-host-title'),
        message: i18n('welcome:remove-paired-host-message', {label, target: targetLabel}),
        confirmText: i18n('button:remove'),
        confirmVariant: 'danger',
      }),
    )
    if (!confirmed) return false

    this.removingPeerId.set(peer.peer_id)
    this.errorText.set(null)
    this.statusText.set(i18n('welcome:remote-removing'))

    try {
      await wrap(removeNetworkPairedPeer(peer.peer_id))
      await this.loadPeers()
      this.statusText.set(i18n('welcome:remote-removed'))
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
    this.invalidatePeerLoads()
    this.activePeerId.set(peerId)
    this.errorText.set(null)
    this.statusText.set(i18n('welcome:remote-connecting'))
    this.stopPeerPolling()

    try {
      const modeInfo = await this.safeGetModeStatus()
      if (modeInfo && isRemoteMode(modeInfo.mode)) {
        const modePeerId = this.resolveModeRemotePeerId(modeInfo)
        const activePeerId = this.resolveActiveRemotePeerId(modeInfo)
        if (modePeerId === peerId && activePeerId === peerId) {
          await remoteSessionModel.syncNow()
          await this.refreshModeState()
          this.statusText.set(i18n('welcome:remote-connected-wait'))
          this.view.set('wait')
          return true
        }

        await this.restoreLocalModeIfNeeded()
      }

      await wrap(switchMode('remote', peerId))
      await this.refreshModeState()
      if (!this.transportConnected()) {
        throw new Error(i18n('welcome:remote-transport-not-ready'))
      }

      await remoteSessionModel.syncNow()
      this.statusText.set(i18n('welcome:remote-connected-wait'))
      this.view.set('wait')
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

  async disconnectTransport(): Promise<void> {
    this.statusText.set(i18n('welcome:disconnecting'))
    await this.restoreLocalModeIfNeeded()
    this.statusText.set(null)
    this.view.set('hosts')
  }

  async exitPreAuthRemote(): Promise<void> {
    await this.restoreLocalModeIfNeeded()
    this.reset()
  }

  async refreshPresence(): Promise<void> {
    await this.refreshPresenceInternal(true)
  }

  pausePeerPolling(): void {
    this.peerPollingEnabled = false
    this.stopPeerPolling()
  }

  private async startIosHostMode(): Promise<void> {
    this.pairPhase.set('starting')
    this.pairError.set(null)
    const requestId = ++this.hostStatusGeneration

    try {
      const relayUrl = await this.resolveRelayUrl()
      if (!this.isHostStatusCurrent(requestId)) return
      const status = await wrap(
        tauriInvoke<MobileHostStatus>('mobile_host_start', {
          relayUrl,
          deviceLabel: this.currentDeviceLabel(),
        }),
      )
      if (!this.isHostStatusCurrent(requestId)) return
      this.applyHostStatus(status)
      this.startHostPolling()
    } catch (e) {
      if (!this.isHostStatusCurrent(requestId)) return
      this.pairError.set(e instanceof Error ? e.message : String(e))
      this.pairPhase.set('failed')
    }
  }

  private async pairDesktopToIos(): Promise<void> {
    this.pairPhase.set('connecting')
    this.pairError.set(null)

    try {
      const offer = this.parseOfferInput()
      const pin = this.pinInput().trim()
      if (!pin) {
        throw new Error(i18n('network-pair:error-pin-required'))
      }

      await wrap(
        tauriInvoke<unknown>('desktop_pair_mobile_host', {
          offer,
          pin,
          deviceLabel: this.currentDeviceLabel(),
        }),
      )
      this.pairPhase.set('success')
    } catch (e) {
      this.pairError.set(e instanceof Error ? e.message : String(e))
      this.pairPhase.set('failed')
    }
  }

  private parseOfferInput(): PairingOffer {
    const raw = this.offerInput().trim()
    if (!raw) {
      throw new Error(i18n('network-pair:error-offer-required'))
    }

    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw) as Partial<PairingOffer>
      return this.validateOffer(parsed)
    }

    if (raw.startsWith('chromvoid://')) {
      const normalized = raw.replace('chromvoid://', 'https://chromvoid.local/')
      const parsed = new URL(normalized)
      const scheme = raw.slice('chromvoid://'.length).split('?')[0] ?? ''
      return this.validateOffer({
        session_id: parsed.searchParams.get('session_id') ?? '',
        relay_base_url: parsed.searchParams.get('relay_base_url') ?? '',
        device_label: parsed.searchParams.get('device_label') ?? '',
        expires_at_ms: Number(parsed.searchParams.get('expires_at_ms') ?? '0'),
        platform:
          parsed.searchParams.get('platform') ??
          (scheme === 'pair-mobile' ? 'android' : scheme === 'pair-ios' ? 'ios' : 'ios'),
      })
    }

    throw new Error(i18n('network-pair:error-offer-format'))
  }

  private validateOffer(offer: Partial<PairingOffer>): PairingOffer {
    if (!offer.session_id || !offer.relay_base_url || !offer.device_label || !offer.expires_at_ms) {
      throw new Error(i18n('network-pair:error-offer-fields'))
    }

    return {
      session_id: offer.session_id,
      relay_base_url: offer.relay_base_url,
      device_label: offer.device_label,
      expires_at_ms: offer.expires_at_ms,
      platform: offer.platform ?? 'ios',
    }
  }

  private async refreshHostStatus(): Promise<void> {
    if (!this.isMobileHostRuntime()) return
    const requestId = ++this.hostStatusGeneration

    try {
      const status = await wrap(tauriInvoke<MobileHostStatus>('mobile_host_status'))
      if (!this.isHostStatusCurrent(requestId)) return
      this.applyHostStatus(status)
      if (this.shouldAutoRefreshPresence(status)) {
        await this.refreshPresenceInternal(false, requestId)
      }
      if (!this.isHostStatusCurrent(requestId)) return
      if (status.phase === 'Pairing' || status.phase === 'Ready') {
        this.startHostPolling()
      }
    } catch (e) {
      if (!this.isHostStatusCurrent(requestId)) return
      this.pairError.set(e instanceof Error ? e.message : String(e))
      this.pairPhase.set('failed')
    }
  }

  private shouldAutoRefreshPresence(status: MobileHostStatus): boolean {
    if (status.phase !== 'Ready') return false

    const presence = status.presence
    if (!presence) return true

    return presence.status !== 'ready' || presence.expires_at_ms - Date.now() <= PRESENCE_AUTO_REFRESH_THRESHOLD_MS
  }

  private async refreshPresenceInternal(
    markFailureAsFatal: boolean,
    hostRequestId = this.hostStatusGeneration,
  ): Promise<void> {
    if (!this.isMobileHostRuntime()) return
    if (this.presenceRefreshPromise) {
      await this.presenceRefreshPromise
      return
    }

    const requestId = ++this.presenceRefreshGeneration
    this.presenceRefreshPromise = (async () => {
      try {
        const relayUrl = this.hostStatus()?.relay_url ?? (await this.resolveRelayUrl())
        if (!this.isPresenceRefreshCurrent(requestId) || !this.isHostStatusCurrent(hostRequestId)) return
        const status = await wrap(tauriInvoke<MobileHostStatus>('mobile_host_publish_presence', {relayUrl}))
        if (!this.isPresenceRefreshCurrent(requestId) || !this.isHostStatusCurrent(hostRequestId)) return
        this.applyHostStatus(status)
      } catch (e) {
        if (!this.isPresenceRefreshCurrent(requestId) || !this.isHostStatusCurrent(hostRequestId)) return
        this.pairError.set(e instanceof Error ? e.message : String(e))
        if (markFailureAsFatal) {
          this.pairPhase.set('failed')
        }
      } finally {
        if (this.isPresenceRefreshCurrent(requestId)) {
          this.presenceRefreshPromise = null
        }
      }
    })()

    await this.presenceRefreshPromise
  }

  private applyHostStatus(status: MobileHostStatus): void {
    this.hostStatus.set(status)
    this.pairError.set(status.error)
    if (status.device_label) {
      this.deviceLabel.set(status.device_label)
    }

    switch (status.phase) {
      case 'Idle':
        this.pairPhase.set('idle')
        this.stopHostPolling()
        break
      case 'Pairing':
        this.pairPhase.set('waiting')
        break
      case 'Ready':
        this.pairPhase.set('success')
        break
      case 'Error':
        this.pairPhase.set('failed')
        break
    }
  }

  private async refreshModeState(): Promise<void> {
    if (this.isMobileHostRuntime()) return
    const requestId = ++this.modeRefreshGeneration
    const modeInfo = await this.safeGetModeStatus(requestId)
    if (!this.isModeRefreshCurrent(requestId)) return
    const previousPeerId = this.transportConnectedPeerId()
    const nextPeerId = this.resolveActiveRemotePeerId(modeInfo)

    this.transportConnectedPeerId.set(nextPeerId)
    if (nextPeerId) {
      this.stopPeerPolling()
      this.startModePolling()
      if (!this.statusText()) {
        this.statusText.set(i18n('welcome:remote-connected-open'))
      }
      if (this.view() !== 'wait') {
        this.view.set('wait')
      }
      return
    }

    this.stopModePolling()
    if (this.peerPollingEnabled) {
      this.startPeerPolling()
    }
    if (previousPeerId) {
      this.statusText.set(null)
      this.errorText.set(i18n('welcome:remote-transport-lost'))
      this.view.set('hosts')
      this.callbacks.onTransportLost?.()
    }
  }

  private async restoreLocalModeIfNeeded(): Promise<void> {
    this.stopModePolling()
    this.stopPeerPolling()
    this.invalidateModeRefreshes()
    const modeInfo = await this.safeGetModeStatus()
    if (modeInfo && isRemoteMode(modeInfo.mode)) {
      try {
        await wrap(switchMode('local'))
      } catch {
        // best-effort
      }
    }

    this.invalidateModeRefreshes()
    this.transportConnectedPeerId.set(null)
    this.activePeerId.set(null)
    getAppContext().store.resetRemoteSession()
  }

  private async safeGetModeStatus(requestId?: number): Promise<ModeInfo | null> {
    if (this.isMobileHostRuntime()) return null
    try {
      return await wrap(getModeStatus())
    } catch (e) {
      if (requestId !== undefined && !this.isModeRefreshCurrent(requestId)) return null
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

  private startHostPolling(): void {
    if (this.hostPollTimer !== null) return
    this.hostPollTimer = setInterval(() => {
      void this.refreshHostStatus()
    }, 2_000)
  }

  private stopHostPolling(): void {
    if (this.hostPollTimer === null) return
    clearInterval(this.hostPollTimer)
    this.hostPollTimer = null
  }

  private async resolveRelayUrl(): Promise<string> {
    const profiles = await wrap(tauriInvoke<ServerProfileSummary[]>('network_list_server_profiles'))
    if (!profiles || profiles.length === 0) {
      return DEFAULT_IOS_RELAY_URL
    }

    const profileId = profiles[0]!.profile_id
    const bootstrap = await wrap(tauriInvoke<BootstrapProfile>('network_get_bootstrap_profile', {profileId}))
    if (!bootstrap.relay_url) {
      throw new Error(i18n('network-pair:error-relay-missing', {profileId}))
    }
    return bootstrap.relay_url
  }

  private clearPairTransientErrors(): void {
    this.pairError.set(null)
    if (!this.isMobileHostRuntime()) {
      this.pairPhase.set('idle')
    }
  }

  private resetPairingState({clearDesktopInputs}: {clearDesktopInputs: boolean}): void {
    this.pairPhase.set('idle')
    this.pairError.set(null)
    this.hostStatus.set(null)

    if (clearDesktopInputs && !this.isMobileHostRuntime()) {
      this.offerInput.set('')
      this.pinInput.set('')
    }
  }

  private reset(): void {
    this.invalidateAsyncRefreshes()
    this.stopModePolling()
    this.pausePeerPolling()
    this.stopHostPolling()
    this.activePeerId.set(null)
    this.transportConnectedPeerId.set(null)
    this.errorText.set(null)
    this.statusText.set(null)
    this.resetPairingState({clearDesktopInputs: true})
    this.view.set('hosts')
  }

  private invalidateAsyncRefreshes(): void {
    this.invalidatePeerLoads()
    this.invalidateModeRefreshes()
    this.invalidateHostRefreshes()
  }

  private invalidatePeerLoads(): void {
    this.peerLoadGeneration += 1
    this.loadingPeers.set(false)
  }

  private invalidateModeRefreshes(): void {
    this.modeRefreshGeneration += 1
  }

  private invalidateHostRefreshes(): void {
    this.hostStatusGeneration += 1
    this.presenceRefreshGeneration += 1
    this.presenceRefreshPromise = null
  }

  private isPeerLoadCurrent(requestId: number): boolean {
    return requestId === this.peerLoadGeneration
  }

  private isModeRefreshCurrent(requestId: number): boolean {
    return requestId === this.modeRefreshGeneration
  }

  private isHostStatusCurrent(requestId: number): boolean {
    return requestId === this.hostStatusGeneration
  }

  private isPresenceRefreshCurrent(requestId: number): boolean {
    return requestId === this.presenceRefreshGeneration
  }
}
