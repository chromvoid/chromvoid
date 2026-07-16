import {atom, computed, wrap} from '@reatom/core'

import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {tauriInvoke, type UnlistenFn} from 'root/core/transport/tauri/ipc'
import {i18n} from 'root/i18n'
import {getAppContext} from 'root/shared/services/app-context'
import {dialogService} from 'root/shared/services/dialog'

import {
  DEFAULT_IOS_RELAY_URL,
  parsePairingOffer,
  resolveActiveRemotePeerId,
  resolveModeRemotePeerId,
  shouldAutoRefreshPresence,
  type BootstrapProfile,
  type MobileHostStatus,
  type MobileHostTransportKind,
  type PairingOffer,
  type RemoteFlowScreen,
  type RemoteFlowSummaryItem,
  type RemoteHostsCallbacks,
  type RemoteHostsFlowView,
  type RemoteHostsPairPhase,
  type ServerProfileSummary,
} from './remote-hosts-flow.contract'
import {remoteSessionModel} from './remote-session.model'
import {RemoteUsbFlowModel} from './remote-usb-flow.model'
import {
  getModeStatus,
  isRemoteMode,
  listNetworkPairedPeers,
  onMobileUsbInventoryChanged,
  onMobileUsbStatusChanged,
  removeNetworkPairedPeer,
  switchMode,
  type MobileUsbHostView,
  type MobileUsbStatus,
  type ModeInfo,
  type NetworkPairedPeer,
} from './remote.model'

export type {
  ConnectedDesktopPeer,
  HostPresence,
  IosHostStatus,
  MobileHostPhase,
  MobileHostStatus,
  MobileHostTransportKind,
  PairingOffer,
  RemoteFlowScreen,
  RemoteFlowSummaryItem,
  RemoteHostsFlowView,
  RemoteHostsPairPhase,
} from './remote-hosts-flow.contract'

type PollTimer = ReturnType<typeof setInterval>

function startPolling(callback: () => void): PollTimer {
  return setInterval(wrap(callback), 2_000)
}

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
  readonly usb = new RemoteUsbFlowModel()

  readonly isMobileHostRuntime = computed<boolean>(() => {
    const caps = getRuntimeCapabilities()
    return caps.mobile && caps.supports_network_remote
  })
  readonly isMobileUsbRemoteRuntime = computed<boolean>(() => {
    const caps = getRuntimeCapabilities()
    return caps.desktop && caps.supports_mobile_usb_remote
  })
  readonly hostPlatform = computed<string>(() => {
    const platform = this.hostStatus()?.platform?.trim()
    if (platform) return platform
    return getRuntimeCapabilities().platform === 'android' ? 'android' : 'ios'
  })
  readonly mobileHostTransports = computed<MobileHostTransportKind[]>(() => {
    if (!this.isMobileHostRuntime()) return []
    return this.hostPlatform() === 'android'
      ? (['wss_relay', 'usb_mobile'] satisfies MobileHostTransportKind[])
      : (['wss_relay'] satisfies MobileHostTransportKind[])
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
  readonly welcomeFlowScreen = computed<RemoteFlowScreen>(() => {
    const view = this.view()
    if (view === 'pair-ios') return 'pair'
    if (view === 'usb-mobile') return 'usb'
    if (view === 'wait') return 'wait'
    return 'hosts'
  })
  readonly welcomeFlowSummaryItems = computed<RemoteFlowSummaryItem[]>(() => {
    const transportConnected = this.transportConnected()
    const transportState: RemoteFlowSummaryItem['state'] = transportConnected ? 'connected' : 'idle'

    return [
      {
        label: i18n('welcome:remote-flow-screen-label'),
        value: this.welcomeFlowScreen(),
      },
      {
        label: 'transport',
        state: transportState,
        value: transportConnected ? 'connected' : 'none',
      },
      {
        label: i18n('welcome:remote-flow-peer-label'),
        value: transportConnected ? this.connectedPeerLabel() : 'n/a',
      },
      {
        label: i18n('welcome:remote-flow-hosts-label'),
        value: String(this.peers().length),
      },
    ]
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
  private usbInventoryUnlisten: Promise<UnlistenFn> | null = null
  private usbStatusUnlisten: Promise<UnlistenFn> | null = null
  private modePollTimer: PollTimer | null = null
  private peerPollTimer: PollTimer | null = null
  private peerPollingEnabled = false
  private hostPollTimer: PollTimer | null = null
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
    this.startUsbInventoryWatch()
    void this.refreshModeState()
  }

  disconnect(): void {
    this.invalidateAsyncRefreshes()
    this.stopUsbInventoryWatch()
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

  openUsbMobile(options: {scan?: boolean} = {}): void {
    if (!this.isMobileUsbRemoteRuntime()) return
    this.errorText.set(null)
    this.pausePeerPolling()
    this.view.set('usb-mobile')
    void this.usb.refreshDetectedDevices()
    const refresh = this.usb.refreshStatus()
    if (!options.scan) return
    void refresh.then((ok) => {
      if (ok) void this.usb.scanAndConnectSingleHost(() => this.view() === 'usb-mobile')
    })
  }

  async closePairIos(): Promise<void> {
    await this.cancelPairing()
    this.showHosts()
  }

  async closeUsbMobile(): Promise<void> {
    if (this.usb.flowState() === 'pairing_approval') {
      await wrap(this.usb.disconnect())
    }
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
      await wrap(this.startIosHostMode())
      return this.pairPhase() !== 'failed'
    }

    this.errorText.set(null)
    this.statusText.set(i18n('welcome:remote-pairing'))

    await wrap(this.pairDesktopToIos())
    if (this.pairPhase() !== 'success') {
      this.statusText.set(null)
      return false
    }

    await wrap(this.loadPeers())
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
      await wrap(this.loadPeers())
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

  async removeUsbPairedHost(hostId: string): Promise<boolean> {
    if (this.usb.actionBusy()) return false
    const host = this.findUsbHostView(hostId)
    if (!host) return false

    const label = host.label || host.host_id
    const confirmed = await wrap(
      dialogService.showConfirmDialog({
        title: i18n('welcome:remove-paired-host-title'),
        message: i18n('welcome:remove-paired-host-message', {
          label,
          target: i18n('remote:transport-usb-mobile'),
        }),
        confirmText: i18n('button:remove'),
        confirmVariant: 'danger',
      }),
    )
    if (!confirmed) return false

    return await this.usb.removePaired(host.host_id)
  }

  async connectToPeer(peerId: string): Promise<boolean> {
    this.invalidatePeerLoads()
    this.activePeerId.set(peerId)
    this.errorText.set(null)
    this.statusText.set(i18n('welcome:remote-connecting'))
    this.stopPeerPolling()

    try {
      const modeInfo = await wrap(this.safeGetModeStatus())
      if (modeInfo && isRemoteMode(modeInfo.mode)) {
        const modePeerId = resolveModeRemotePeerId(modeInfo)
        const activePeerId = resolveActiveRemotePeerId(modeInfo)
        if (modePeerId === peerId && activePeerId === peerId) {
          await wrap(remoteSessionModel.syncNow())
          await wrap(this.refreshModeState())
          this.statusText.set(i18n('welcome:remote-connected-wait'))
          this.view.set('wait')
          return true
        }

        await wrap(this.restoreLocalModeIfNeeded())
      }

      await wrap(switchMode('remote', peerId))
      await wrap(this.refreshModeState())
      if (!this.transportConnected()) {
        throw new Error(i18n('welcome:remote-transport-not-ready'))
      }

      await wrap(remoteSessionModel.syncNow())
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
    await wrap(this.restoreLocalModeIfNeeded())
    this.statusText.set(null)
    this.view.set('hosts')
  }

  async exitPreAuthRemote(): Promise<void> {
    await wrap(this.restoreLocalModeIfNeeded())
    this.reset()
  }

  async refreshPresence(): Promise<void> {
    await this.refreshPresenceInternal(true)
  }

  pausePeerPolling(): void {
    this.peerPollingEnabled = false
    this.stopPeerPolling()
  }

  private startUsbInventoryWatch(): void {
    if (!this.isMobileUsbRemoteRuntime() || this.usbInventoryUnlisten !== null) return
    void this.usb.refreshDetectedDevices()
    this.usbInventoryUnlisten = onMobileUsbInventoryChanged(
      wrap(() => {
        void this.usb.refreshDetectedDevices()
      }),
    ).catch(() => () => {})
    this.usbStatusUnlisten = onMobileUsbStatusChanged(
      wrap((status) => {
        this.applyMobileUsbStatusEvent(status)
      }),
    ).catch(() => () => {})
  }

  private stopUsbInventoryWatch(): void {
    const unlisten = this.usbInventoryUnlisten
    this.usbInventoryUnlisten = null
    if (unlisten !== null) {
      void unlisten.then((dispose) => dispose())
    }
    const statusUnlisten = this.usbStatusUnlisten
    this.usbStatusUnlisten = null
    if (statusUnlisten !== null) {
      void statusUnlisten.then((dispose) => dispose())
    }
  }

  private applyMobileUsbStatusEvent(status: MobileUsbStatus): void {
    this.usb.applyStatusEvent(status)
    void this.refreshModeState()
  }

  private findUsbHostView(hostId: string): MobileUsbHostView | null {
    return (
      this.usb.pairedHosts().find((host) => host.host_id === hostId) ??
      this.usb.status()?.paired_hosts.find((host) => host.host_id === hostId) ??
      null
    )
  }

  private async startIosHostMode(): Promise<void> {
    this.pairPhase.set('starting')
    this.pairError.set(null)
    const requestId = ++this.hostStatusGeneration

    try {
      const relayUrl = await wrap(this.resolveRelayUrl())
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
      const offer = parsePairingOffer(this.offerInput())
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

  private async refreshHostStatus(): Promise<void> {
    if (!this.isMobileHostRuntime()) return
    const requestId = ++this.hostStatusGeneration

    try {
      const status = await wrap(tauriInvoke<MobileHostStatus>('mobile_host_status'))
      if (!this.isHostStatusCurrent(requestId)) return
      this.applyHostStatus(status)
      if (shouldAutoRefreshPresence(status)) {
        await wrap(this.refreshPresenceInternal(false, requestId))
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

  private async refreshPresenceInternal(
    markFailureAsFatal: boolean,
    hostRequestId = this.hostStatusGeneration,
  ): Promise<void> {
    if (!this.isMobileHostRuntime()) return
    if (this.presenceRefreshPromise) {
      await wrap(this.presenceRefreshPromise)
      return
    }

    const requestId = ++this.presenceRefreshGeneration
    this.presenceRefreshPromise = (async () => {
      try {
        const relayUrl = this.hostStatus()?.relay_url ?? (await wrap(this.resolveRelayUrl()))
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

    await wrap(this.presenceRefreshPromise)
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
    const modeInfo = await wrap(this.safeGetModeStatus(requestId))
    if (!this.isModeRefreshCurrent(requestId)) return
    const previousPeerId = this.transportConnectedPeerId()
    const nextPeerId = resolveActiveRemotePeerId(modeInfo)

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
    const modeInfo = await wrap(this.safeGetModeStatus())
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

  private startModePolling(): void {
    this.modePollTimer ??= startPolling(() => void this.refreshModeState())
  }

  private stopModePolling(): void {
    if (this.modePollTimer !== null) clearInterval(this.modePollTimer)
    this.modePollTimer = null
  }

  private startPeerPolling(): void {
    this.peerPollTimer ??= startPolling(() => void this.loadPeers())
  }

  private stopPeerPolling(): void {
    if (this.peerPollTimer !== null) clearInterval(this.peerPollTimer)
    this.peerPollTimer = null
  }

  private startHostPolling(): void {
    this.hostPollTimer ??= startPolling(() => void this.refreshHostStatus())
  }

  private stopHostPolling(): void {
    if (this.hostPollTimer !== null) clearInterval(this.hostPollTimer)
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
    if (!this.isMobileHostRuntime()) this.pairPhase.set('idle')
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
