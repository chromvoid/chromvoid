import {atom, computed, wrap} from '@reatom/core'

import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {tauriInvoke} from 'root/core/transport/tauri/ipc'
import {i18n} from 'root/i18n'
import {getAppContext} from 'root/shared/services/app-context'
import {dialogService} from 'root/shared/services/dialog'

import {
  resolveActiveRemoteHost,
  resolveActiveRemotePeerId,
  resolveModeRemotePeerId,
  resolveRemoteHostId,
  shouldAutoRefreshPresence,
  type MobileHostStatus,
  type RemoteHostsCallbacks,
  type RemoteHostsFlowView,
} from './remote-hosts-flow.contract'
import {
  deriveDesktopRemoteHostsPresentation,
  type DesktopRemoteHostsPresentation,
} from './remote-desktop-preauth.contract'
import {
  RemoteDesktopPairingModel,
  type RemoteDesktopPairingSubmitResult,
} from './remote-desktop-pairing.model'
import {RemoteHostsPolling, RemoteUsbInventoryWatch, resolveRemoteRelayUrl} from './remote-hosts-flow.runtime'
import {RemoteHostsUsbCoordinator} from './remote-hosts-usb-coordinator'
import {RemoteMobileHostModel} from './remote-mobile-host.model'
import {RemoteMobilePairedComputersModel} from './remote-mobile-paired-computers.model'
import {RemotePeerListModel, type RemotePeerLoadIntent} from './remote-peer-list.model'
import {remoteSessionModel} from './remote-session.model'
import {RemoteUsbFlowModel} from './remote-usb-flow.model'
import {
  getModeStatus,
  isRemoteMode,
  removeNetworkPairedPeer,
  switchMode,
  type MobileUsbScannedHost,
  type MobileUsbStatus,
  type ModeInfo,
  type NetworkPairedPeer,
  type RemoteHost,
} from './remote.model'

export type {
  ConnectedDesktopPeer,
  HostPresence,
  IosHostStatus,
  MobileHostPhase,
  MobileHostPageState,
  MobileHostStatus,
  MobileHostTransportKind,
  PairingOffer,
  RemoteHostsFlowView,
  RemoteHostsPairPhase,
} from './remote-hosts-flow.contract'
export type {
  RemoteDesktopPairingField,
  RemoteDesktopPairingSubmitResult,
} from './remote-desktop-pairing.model'
export type {RemotePeerLoadIntent} from './remote-peer-list.model'
export type RemoteDesktopActionErrorKind = 'connect' | 'disconnect' | 'remove' | 'status' | 'transport_lost'
export class RemoteHostsFlowModel {
  readonly view = atom<RemoteHostsFlowView>('hosts', 'remote.hosts.view')
  readonly removingPeerId = atom<string | null>(null, 'remote.hosts.removingPeerId')
  readonly activePeerId = atom<string | null>(null, 'remote.hosts.activePeerId')
  readonly transportConnectedHost = atom<RemoteHost | null>(null, 'remote.hosts.transportConnectedHost')
  readonly transportConnectedPeerId = computed(
    () => resolveRemoteHostId(this.transportConnectedHost()),
    'remote.hosts.transportConnectedPeerId',
  )
  readonly errorText = atom<string | null>(null, 'remote.hosts.errorText')
  readonly desktopActionErrorKind = atom<RemoteDesktopActionErrorKind | null>(
    null,
    'remote.hosts.desktopActionErrorKind',
  )
  readonly statusText = atom<string | null>(null, 'remote.hosts.statusText')
  readonly modeTransitionBusy = atom(false, 'remote.hosts.modeTransitionBusy')
  readonly desktopPairingOperationBusy = atom(false, 'remote.hosts.desktopPairingOperationBusy')

  private readonly mobileHost = new RemoteMobileHostModel()
  readonly desktopPairing = new RemoteDesktopPairingModel({deviceLabel: this.mobileHost.deviceLabel})
  readonly offerInput = this.desktopPairing.offerInput
  readonly pinInput = this.desktopPairing.pinInput
  readonly pairPhase = this.mobileHost.pairPhase
  readonly pairError = this.mobileHost.pairError
  readonly deviceLabel = this.mobileHost.deviceLabel
  readonly hostStatus = this.mobileHost.hostStatus
  readonly mobileHostStopping = this.mobileHost.stopping
  readonly isMobileHostRuntime = this.mobileHost.isRuntime
  readonly hostPlatform = this.mobileHost.platform
  readonly mobileHostTransports = this.mobileHost.transports
  readonly mobileHostPageState = this.mobileHost.pageState
  readonly connectedNetworkPeers = this.mobileHost.connectedNetworkPeers
  readonly connectedUsbPeers = this.mobileHost.connectedUsbPeers
  readonly pairingPin = this.mobileHost.pairingPin
  readonly offer = this.mobileHost.offer
  readonly offerText = this.mobileHost.offerText
  readonly currentDeviceLabel = this.mobileHost.currentDeviceLabel
  readonly pairedComputers = new RemoteMobilePairedComputersModel({
    hostStatus: this.mobileHost.hostStatus,
    hostOperationBusy: () =>
      this.mobileHostStopping() || this.pairPhase() === 'starting' || this.modeTransitionBusy(),
    refreshHostStatus: () => this.refreshHostStatus(),
  })
  readonly usb = new RemoteUsbFlowModel()

  readonly isMobileUsbRemoteRuntime = computed<boolean>(() => {
    const caps = getRuntimeCapabilities()
    return caps.desktop && caps.supports_mobile_usb_remote
  })
  readonly transportConnected = computed<boolean>(() => this.transportConnectedPeerId() !== null)
  private readonly peerList = new RemotePeerListModel({
    isMobileHostRuntime: this.isMobileHostRuntime,
    transportConnected: this.transportConnected,
    refreshMode: (silent) => this.refreshModeState({silent}),
    clearGlobalError: () => this.clearActionError(),
    reportGlobalError: (message) => {
      this.errorText.set(message)
      this.desktopActionErrorKind.set(null)
    },
  })
  readonly peers = this.peerList.peers
  readonly loadingPeers = this.peerList.loading
  readonly peerListLoaded = this.peerList.loaded
  readonly peerListError = this.peerList.error
  readonly peerListErrorKind = this.peerList.errorKind
  readonly connectionOperationBusy = computed<boolean>(
    () =>
      this.activePeerId() !== null ||
      this.removingPeerId() !== null ||
      this.desktopPairingOperationBusy() ||
      this.desktopPairing.busy() ||
      this.modeTransitionBusy() ||
      this.usb.actionBusy() ||
      this.pairedComputers.operationBusy(),
    'remote.hosts.connectionOperationBusy',
  )
  readonly desktopHostsPresentation = computed<DesktopRemoteHostsPresentation>(
    () =>
      deriveDesktopRemoteHostsPresentation({
        peers: this.peers(),
        usbSupported: this.isMobileUsbRemoteRuntime(),
        usbChecking: this.usb.detectingDevices(),
        usbDevices: this.usb.detectedDevices(),
      }),
    'remote.hosts.desktopHostsPresentation',
  )
  readonly connectedPeerLabel = computed<string>(() => {
    const host = this.transportConnectedHost()
    if (host?.type === 'mobile_usb')
      return host.label?.trim() || this.usb.lastActiveHost()?.label || i18n('remote:remote-host-fallback')
    const peer = this.peers().find(({peer_id}) => peer_id === this.transportConnectedPeerId())
    return peer?.label ?? peer?.peer_id ?? i18n('remote:remote-host-fallback')
  })
  private readonly usbCoordinator = new RemoteHostsUsbCoordinator({
    usb: this.usb,
    available: this.isMobileUsbRemoteRuntime,
    busy: this.connectionOperationBusy,
    isOpen: () => this.view() === 'usb-mobile',
    enter: () => {
      this.clearActionError()
      this.pausePeerPolling()
      this.view.set('usb-mobile')
    },
    leave: () => this.showHosts(),
    setRemovingHostId: (hostId) => this.removingPeerId.set(hostId),
  })
  private callbacks: RemoteHostsCallbacks = {}
  private presenceRefreshPromise: Promise<void> | null = null
  private modeRefreshGeneration = 0
  private hostStatusGeneration = 0
  private presenceRefreshGeneration = 0
  private readonly polling = new RemoteHostsPolling({
    refreshMode: () => void this.refreshModeState(),
    refreshMobileHost: () => void this.refreshHostStatus(),
  })
  private readonly usbInventoryWatch = new RemoteUsbInventoryWatch(this.usb, {
    available: () => this.isMobileUsbRemoteRuntime(),
    applyStatus: (status) => this.applyMobileUsbStatusEvent(status),
  })

  connect(callbacks: RemoteHostsCallbacks = {}): void {
    this.callbacks = callbacks
    if (this.isMobileHostRuntime()) {
      this.pairedComputers.connect()
      void this.refreshHostStatus()
      return
    }
    this.usbInventoryWatch.startStatus()
    void this.refreshModeState()
  }

  disconnect(): void {
    this.invalidateAsyncRefreshes()
    this.usbCoordinator.invalidate()
    this.deactivateDesktopInventory()
    this.usbInventoryWatch.stopStatus()
    this.polling.stopMode()
    this.pausePeerPolling()
    this.polling.stopMobileHost()
    this.pairedComputers.disconnect()
    this.presenceRefreshPromise = null
    this.loadingPeers.set(false)
    this.mobileHostStopping.set(false)
    this.callbacks = {}
  }

  showHosts(): void {
    this.view.set('hosts')
    this.mobileHost.clearTransientErrors()
    this.peerList.resumeIfEnabled()
  }
  activateDesktopInventory(options: {refresh?: boolean} = {}): void { this.usbInventoryWatch.activateInventory(options) }
  deactivateDesktopInventory(): void { this.usbInventoryWatch.deactivateInventory() }
  openPairIos(): boolean {
    if (this.connectionOperationBusy()) return false
    this.clearActionError()
    this.pausePeerPolling()
    this.view.set('pair-ios')

    if (this.isMobileHostRuntime()) {
      void this.refreshHostStatus()
    }

    return true
  }

  openUsbMobile(options: {scan?: boolean} = {}): boolean {
    this.activateDesktopInventory({refresh: false})
    return this.usbCoordinator.open(options)
  }

  async closePairIos(): Promise<boolean> {
    if (!this.isMobileHostRuntime() && this.connectionOperationBusy()) return false
    await this.cancelPairing()
    this.showHosts()
    return true
  }

  async closeUsbMobile(): Promise<boolean> {
    return await wrap(this.usbCoordinator.close())
  }

  setOfferInput(value: string): void {
    this.desktopPairing.setOfferInput(value)
  }

  setPinInput(value: string): void {
    this.desktopPairing.setPinInput(value)
  }

  setDeviceLabel(value: string): void {
    this.desktopPairing.setDeviceLabel(value)
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

  async loadPeers(intent: RemotePeerLoadIntent = 'manual'): Promise<void> {
    await wrap(this.peerList.load(intent))
  }

  async submitPairing(): Promise<boolean> {
    if (this.isMobileHostRuntime()) {
      return await wrap(this.startMobileHost())
    }

    const result = await wrap(this.submitDesktopPairing())
    return result.status === 'success'
  }

  async submitDesktopPairing(): Promise<RemoteDesktopPairingSubmitResult> {
    if (this.isMobileHostRuntime() || this.connectionOperationBusy()) {
      return {status: 'busy'}
    }

    this.desktopPairingOperationBusy.set(true)
    try {
      this.peerList.stopPolling()
      this.pairError.set(null)

      this.clearActionError()
      this.statusText.set(i18n('welcome:remote-pairing'))
      this.pairPhase.set('connecting')

      const result = await wrap(this.desktopPairing.submit())
      if (result.status === 'validation_error') {
        this.pairError.set(
          result.firstInvalid === 'offer' ? this.desktopPairing.offerError() : this.desktopPairing.pinError(),
        )
        this.pairPhase.set('failed')
        this.statusText.set(null)
        return result
      }
      if (result.status === 'backend_error') {
        this.pairError.set(result.error)
        this.pairPhase.set('failed')
        this.statusText.set(null)
        return result
      }
      if (result.status === 'busy') {
        this.statusText.set(null)
        return result
      }

      this.pairPhase.set('success')

      await wrap(this.loadPeers('manual'))
      this.statusText.set(i18n('welcome:remote-pairing-done'))
      this.resetPairingState()
      this.showHosts()
      return result
    } finally {
      this.desktopPairingOperationBusy.set(false)
    }
  }

  async cancelPairing(): Promise<void> {
    this.invalidateHostRefreshes()
    this.polling.stopMobileHost()
    if (this.isMobileHostRuntime()) {
      try {
        await wrap(tauriInvoke<unknown>('mobile_host_stop'))
      } catch {
        // best-effort
      }
    }
    this.resetPairingState()
  }

  async startMobileHost(): Promise<boolean> {
    if (
      !this.isMobileHostRuntime() ||
      this.mobileHostStopping() ||
      this.pairPhase() === 'starting' ||
      this.pairedComputers.operationBusy()
    ) {
      return false
    }
    await wrap(this.startMobileHostMode())
    return this.pairPhase() !== 'failed'
  }

  async retryMobileHost(): Promise<boolean> {
    return await wrap(this.startMobileHost())
  }

  async stopMobileHost(): Promise<boolean> {
    if (!this.isMobileHostRuntime() || this.mobileHostStopping() || this.pairedComputers.operationBusy())
      return false

    const connectedPeers = this.hostStatus()?.connected_peers ?? []
    if (connectedPeers.length > 0) {
      const confirmed = await wrap(
        dialogService.showConfirmDialog({
          title: i18n('remote:mobile-host-stop-title'),
          message: i18n('remote:mobile-host-stop-connected-message', {
            count: connectedPeers.length,
          }),
          confirmText: i18n('button:stop'),
          confirmVariant: 'danger',
        }),
      )
      if (!confirmed) return false
    }

    this.invalidateHostRefreshes()
    this.polling.stopMobileHost()
    const requestId = ++this.hostStatusGeneration
    this.mobileHostStopping.set(true)
    this.pairError.set(null)

    try {
      const status = await wrap(tauriInvoke<MobileHostStatus>('mobile_host_stop'))
      if (!this.isHostStatusCurrent(requestId)) return false
      this.applyHostStatus(status)
      return true
    } catch (error) {
      if (!this.isHostStatusCurrent(requestId)) return false
      this.pairError.set(error instanceof Error ? error.message : String(error))
      return false
    } finally {
      if (this.isHostStatusCurrent(requestId)) {
        this.mobileHostStopping.set(false)
      }
    }
  }

  async removePeer(peer: NetworkPairedPeer): Promise<boolean> {
    if (this.connectionOperationBusy() || this.loadingPeers()) return false

    const label = peer.label || peer.peer_id
    this.removingPeerId.set(peer.peer_id)

    try {
      const confirmed = await wrap(
        dialogService.showConfirmDialog({
          title: i18n('remote:preauth-remove-title'),
          message: i18n('remote:preauth-remove-description', {label}),
          confirmText: i18n('remote:preauth-remove-confirm'),
          confirmVariant: 'danger',
        }),
      )
      if (!confirmed) return false

      this.clearActionError()
      this.statusText.set(i18n('welcome:remote-removing'))
      await wrap(removeNetworkPairedPeer(peer.peer_id))
      await wrap(this.loadPeers('manual'))
      this.statusText.set(i18n('welcome:remote-removed'))
      return true
    } catch (e) {
      this.statusText.set(null)
      this.setActionError('remove', e)
      return false
    } finally {
      this.removingPeerId.set(null)
    }
  }

  async removeUsbPairedHost(hostId: string): Promise<boolean> {
    const removed = await wrap(this.usbCoordinator.remove(hostId))
    if (removed) this.statusText.set(i18n('welcome:remote-removed'))
    return removed
  }
  async dispatchDesktopUsbAction(): Promise<boolean> {
    return await wrap(this.usbCoordinator.dispatchPrimary())
  }

  async refreshUsbStatus(): Promise<boolean> {
    return await this.usbCoordinator.run(() => this.usb.refreshStatus())
  }

  async scanUsbHosts(): Promise<boolean> {
    return await this.usbCoordinator.run(() => this.usb.scan())
  }

  async loadUsbPairedHosts(): Promise<boolean> {
    return await this.usbCoordinator.run(() => this.usb.loadPaired())
  }

  async pairUsbScannedHost(host: MobileUsbScannedHost): Promise<boolean> {
    return await this.usbCoordinator.run(() => this.usb.pairScannedHost(host))
  }

  async confirmUsbPairing(): Promise<boolean> {
    return await this.usbCoordinator.run(() => this.usb.confirmPairing())
  }

  async connectUsbPairedHost(hostId: string): Promise<boolean> {
    return await this.usbCoordinator.run(() => this.usb.connectPairedHost(hostId))
  }

  async disconnectUsb(): Promise<boolean> {
    return await this.usbCoordinator.run(() => this.usb.disconnect())
  }

  async connectToPeer(peerId: string): Promise<boolean> {
    if (!peerId.trim() || this.connectionOperationBusy()) {
      return false
    }
    this.invalidatePeerLoads()
    this.activePeerId.set(peerId)
    this.clearActionError()
    this.statusText.set(i18n('welcome:remote-connecting'))
    this.peerList.stopPolling()

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

        if (!(await wrap(this.restoreLocalModeIfNeeded()))) {
          this.statusText.set(null)
          return false
        }
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
      this.setActionError('connect', e)
      return false
    } finally {
      this.activePeerId.set(null)
      this.peerList.resumeIfEnabled()
    }
  }

  async disconnectTransport(): Promise<boolean> {
    if (this.connectionOperationBusy()) return false
    this.modeTransitionBusy.set(true)
    this.statusText.set(i18n('welcome:disconnecting'))
    try {
      if (!(await wrap(this.restoreLocalModeIfNeeded()))) {
        this.statusText.set(null)
        return false
      }
      this.statusText.set(null)
      this.view.set('hosts')
      return true
    } finally {
      this.modeTransitionBusy.set(false)
    }
  }

  async exitPreAuthRemote(): Promise<boolean> {
    if (this.connectionOperationBusy()) return false
    this.modeTransitionBusy.set(true)
    try {
      if (!(await wrap(this.restoreLocalModeIfNeeded()))) return false
      this.reset()
      return true
    } finally {
      this.modeTransitionBusy.set(false)
    }
  }

  async refreshPresence(): Promise<void> {
    await this.refreshPresenceInternal(true)
  }

  pausePeerPolling(): void {
    this.peerList.pause()
  }

  private applyMobileUsbStatusEvent(status: MobileUsbStatus): void {
    this.usb.applyStatusEvent(status)
    if (
      status.session_state === 'remote_dashboard_open' &&
      status.error_code === 'ERR_USB_MOBILE_WRITER_LOCKED'
    ) {
      this.view.set('usb-mobile')
      this.callbacks.onUsbRecoveryRequired?.()
    }
    void this.refreshModeState()
  }

  private async startMobileHostMode(): Promise<void> {
    this.pairPhase.set('starting')
    this.pairError.set(null)
    const requestId = ++this.hostStatusGeneration

    try {
      const relayUrl = await wrap(resolveRemoteRelayUrl())
      if (!this.isHostStatusCurrent(requestId)) return
      const status = await wrap(
        tauriInvoke<MobileHostStatus>('mobile_host_start', {
          relayUrl,
          deviceLabel: this.currentDeviceLabel(),
        }),
      )
      if (!this.isHostStatusCurrent(requestId)) return
      this.applyHostStatus(status)
      this.polling.startMobileHost()
    } catch (e) {
      if (!this.isHostStatusCurrent(requestId)) return
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
        this.polling.startMobileHost()
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
        const relayUrl = this.hostStatus()?.relay_url ?? (await wrap(resolveRemoteRelayUrl()))
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
    if (this.mobileHost.applyStatus(status)) this.polling.stopMobileHost()
    this.pairedComputers.handleHostStatus(status)
  }

  private async refreshModeState({silent = false}: {silent?: boolean} = {}): Promise<void> {
    if (this.isMobileHostRuntime()) return
    const requestId = ++this.modeRefreshGeneration
    const modeInfo = await wrap(this.safeGetModeStatus(requestId, silent))
    if (!this.isModeRefreshCurrent(requestId)) return
    const previousPeerId = this.transportConnectedPeerId()
    const nextHost = resolveActiveRemoteHost(modeInfo)
    const nextPeerId = resolveRemoteHostId(nextHost)

    this.transportConnectedHost.set(nextHost)
    if (nextHost?.type === 'tauri_remote_wss') this.usb.clearLastActiveHost()
    if (nextPeerId) {
      this.peerList.stopPolling()
      this.polling.startMode()
      if (!this.statusText()) {
        this.statusText.set(i18n('welcome:remote-connected-open'))
      }
      if (this.view() !== 'wait') {
        this.view.set('wait')
      }
      return
    }

    this.polling.stopMode()
    this.peerList.resumeIfEnabled()
    if (previousPeerId) {
      this.statusText.set(null)
      this.errorText.set(i18n('welcome:remote-transport-lost'))
      this.desktopActionErrorKind.set('transport_lost')
      this.view.set('hosts')
      this.callbacks.onTransportLost?.()
    }
  }

  private async restoreLocalModeIfNeeded(): Promise<boolean> {
    this.polling.stopMode()
    this.peerList.stopPolling()
    this.invalidateModeRefreshes()
    const modeInfo = await wrap(this.safeGetModeStatus())
    if (!modeInfo) {
      this.resumeAfterFailedLocalModeRestore()
      return false
    }
    if (isRemoteMode(modeInfo.mode)) {
      const isMobileUsb = modeInfo.mode.remote.host.type === 'mobile_usb'
      try {
        if (isMobileUsb && !(await wrap(this.usb.disconnect())))
          throw new Error(this.usb.errorText() ?? i18n('remote:usb-mobile-error-generic'))
        if (!isMobileUsb) await wrap(switchMode('local'))
      } catch (error) {
        this.setActionError('disconnect', error)
        this.resumeAfterFailedLocalModeRestore()
        return false
      }
    }

    this.invalidateModeRefreshes()
    this.transportConnectedHost.set(null)
    this.activePeerId.set(null)
    getAppContext().store.resetRemoteSession()
    return true
  }
  private resumeAfterFailedLocalModeRestore(): void {
    if (this.transportConnected()) {
      this.polling.startMode()
      return
    }
    this.peerList.resumeIfEnabled()
  }
  private async safeGetModeStatus(requestId?: number, silent = false): Promise<ModeInfo | null> {
    if (this.isMobileHostRuntime()) return null
    try {
      return await wrap(getModeStatus())
    } catch (e) {
      if (requestId !== undefined && !this.isModeRefreshCurrent(requestId)) return null
      if (!silent) this.setActionError('status', e)
      return null
    }
  }

  private resetPairingState(): void {
    this.mobileHost.reset()

    if (!this.isMobileHostRuntime()) {
      this.desktopPairing.reset()
    }
  }

  private reset(): void {
    this.invalidateAsyncRefreshes()
    this.polling.stopMode()
    this.pausePeerPolling()
    this.polling.stopMobileHost()
    this.activePeerId.set(null)
    this.transportConnectedHost.set(null)
    this.clearActionError()
    this.statusText.set(null)
    this.resetPairingState()
    this.view.set('hosts')
  }

  private invalidateAsyncRefreshes(): void {
    this.invalidatePeerLoads()
    this.invalidateModeRefreshes()
    this.invalidateHostRefreshes()
  }

  private clearActionError(): void {
    this.errorText.set(null)
    this.desktopActionErrorKind.set(null)
  }

  private setActionError(kind: RemoteDesktopActionErrorKind, error: unknown): void {
    this.errorText.set(error instanceof Error ? error.message : String(error))
    this.desktopActionErrorKind.set(kind)
  }

  private invalidatePeerLoads(): void {
    this.peerList.invalidate()
  }

  private invalidateModeRefreshes(): void {
    this.modeRefreshGeneration += 1
  }

  private invalidateHostRefreshes(): void {
    this.hostStatusGeneration += 1
    this.presenceRefreshGeneration += 1
    this.presenceRefreshPromise = null
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
