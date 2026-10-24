import {atom, computed, wrap} from '@reatom/core'

import {navigationModel} from 'root/app/navigation/navigation.model'
import {guidanceCompletionBridge} from 'root/core/guidance'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {i18n} from 'root/i18n'
import {getAppContext, tryGetAppContext} from 'root/shared/services/app-context'
import {systemClipboardTextWriter} from 'root/shared/services/clipboard'
import {canShareText, shareText} from 'root/shared/services/share'
import {toast} from 'root/shared/services/toast-manager'

import type {
  ConnectionState,
  ConnectionStatusEvent,
  CoreMode,
  ModeSwitchResult,
  NetworkPairedPeer,
  RemoteStatus,
  SyncSnapshot,
  SyncStatusEvent,
  WriterLockInfo,
} from './remote.model'
import {
  defaultSyncSnapshot,
  deriveRemoteStatusWithLock,
  formatSyncProgress,
  getConnectionStatusCategory,
  getModeInfo,
  getWriterLockToastMessage,
  isRemoteMode,
  onConnectionStatus,
  onModeChanged,
  onModeSwitching,
  onSyncStatus,
  switchMode,
  syncPhaseToState,
} from './remote.model'
import {RemoteHostsFlowModel} from './remote-hosts-flow.model'
import {deriveDesktopUsbRemoteSessionPresentation} from './remote-usb-session.contract'

export class RemotePageModel {
  readonly connectionState = atom<ConnectionState>('disconnected', 'remote.page.connectionState')
  readonly remoteStatus = atom<RemoteStatus>(
    {
      connection_state: 'disconnected',
      vault_locked: false,
      locked_by_other: false,
      writer_device: null,
    },
    'remote.page.remoteStatus',
  )

  readonly currentMode = atom<CoreMode>('local', 'remote.page.currentMode')
  readonly transportType = atom<string | null>(null, 'remote.page.transportType')
  readonly modeSwitching = atom(false, 'remote.page.modeSwitching')
  readonly connectionPhase = atom<string | null>(null, 'remote.page.connectionPhase')
  readonly syncPhase = atom<string | null>(null, 'remote.page.syncPhase')
  readonly modeError = atom<string | null>(null, 'remote.page.modeError')
  readonly syncSnapshot = atom<SyncSnapshot>(defaultSyncSnapshot(), 'remote.page.syncSnapshot')

  remoteHosts = new RemoteHostsFlowModel()

  readonly desktopUsbSessionPresentation = computed(
    () =>
      deriveDesktopUsbRemoteSessionPresentation({
        currentMode: this.currentMode(),
        connectionState: this.connectionState(),
        remoteSessionState: getAppContext().store.remoteSessionState(),
        remoteStatus: this.remoteStatus(),
        syncSnapshot: this.syncSnapshot(),
        usbStatus: this.remoteHosts.usb.status(),
        activeUsbErrorCode: this.remoteHosts.usb.activeErrorCode(),
        lastActiveHost: this.remoteHosts.usb.lastActiveHost(),
        silentPhoneHost: this.remoteHosts.usb.silentPhoneRecoveryHost(),
        usbPanelOpen: this.remoteHosts.view() === 'usb-mobile',
        usbErrorText: this.remoteHosts.usb.errorText(),
        switchingToLocal: this.modeSwitching(),
      }),
    'remote.page.desktopUsbSessionPresentation',
  )

  private connected = false
  private lockPollTimer: ReturnType<typeof setInterval> | null = null
  private eventUnlisteners: Array<() => void> = []
  private guidanceCompletionUnsubscribe?: () => void
  private remotePanelClosePromise: Promise<void> | null = null
  private remotePanelCloseGeneration = 0

  private static readonly LOCK_POLL_INTERVAL_MS = 5_000

  readonly isMobileRuntime = (): boolean => getRuntimeCapabilities().mobile

  connect(): void {
    if (this.connected) return
    this.connected = true
    this.guidanceCompletionUnsubscribe = guidanceCompletionBridge.bindRemotePairedDevices(
      this.remoteHosts.peers,
    )
    this.remoteHosts.connect()
    if (!this.isMobileRuntime()) {
      this.remoteHosts.activateDesktopInventory()
      void this.loadModeData()
      this.setupModeListeners()
      void this.remoteHosts.loadPeers()
    }
    this.syncRemoteHostsPanel()
  }

  disconnect(): void {
    if (!this.connected) return
    this.connected = false
    this.guidanceCompletionUnsubscribe?.()
    this.guidanceCompletionUnsubscribe = undefined
    this.modeSwitching.set(false)
    this.remotePanelCloseGeneration += 1
    this.remotePanelClosePromise = null
    this.clearLockPoll()
    this.teardownModeListeners()
    this.remoteHosts.disconnect()
  }

  async loadModeData(): Promise<void> {
    try {
      const modeInfo = await wrap(getModeInfo())
      if (!this.connected) return
      this.currentMode.set(modeInfo.mode)
      this.connectionState.set(modeInfo.connection_state)
      this.remoteStatus.set(deriveRemoteStatusWithLock(modeInfo.connection_state, this.syncSnapshot()))
      this.transportType.set(modeInfo.transport_type)
    } catch (e) {
      console.warn('[remote] loadModeData failed', e)
    }
  }

  switchToLocal = (): void => {
    if (this.modeSwitching()) return
    if (this.currentMode() === 'local') {
      this.remoteHosts.usb.clearLastActiveHost()
      this.remoteHosts.usb.dismissError()
      this.remoteHosts.showHosts()
      return
    }
    this.modeSwitching.set(true)
    this.modeError.set(null)
    void switchMode('local')
      .then(
        wrap(() => {
          if (!this.connected) return
          this.remoteHosts.usb.clearLastActiveHost()
        }),
      )
      .catch(
        wrap((e) => {
          if (!this.connected) return
          this.modeError.set(e instanceof Error ? e.message : String(e))
          this.modeSwitching.set(false)
        }),
      )
  }

  syncRetry = (): void => {
    this.syncSnapshot.set({
      ...this.syncSnapshot(),
      state: 'reconnecting',
      errorMessage: null,
      progress: i18n('remote:reconnecting-text'),
    })
    void this.loadModeData()
  }

  requestWriteLock = (): void => {
    const snap = this.syncSnapshot()
    const holderName = snap.writerLock?.holder ?? this.remoteStatus().writer_device
    toast.warning(getWriterLockToastMessage(holderName), 'Writer Lock', {
      key: 'remote.writer-lock',
    })
  }

  releaseWriteLock = (): void => {
    const prev = this.syncSnapshot()
    this.syncSnapshot.set({
      ...prev,
      writerLock: null,
    })
    this.remoteStatus.set(deriveRemoteStatusWithLock(this.connectionState(), this.syncSnapshot()))
  }

  syncRemoteHostsPanel(): void {
    if (this.remoteHosts.isMobileHostRuntime()) return
    const currentView = this.remoteHosts.view()
    if (currentView === 'wait') return

    const requestedPanel = navigationModel.snapshot().remote?.panel ?? 'hosts'
    if (requestedPanel === 'pair-ios' && currentView !== 'pair-ios') {
      if (!this.remoteHosts.openPairIos()) {
        navigationModel.navigateToRemotePanel(currentView, 'replace')
      }
      return
    }

    if (requestedPanel === 'usb-mobile' && currentView !== 'usb-mobile') {
      if (!this.remoteHosts.openUsbMobile()) {
        navigationModel.navigateToRemotePanel(currentView, 'replace')
      }
      return
    }

    if (requestedPanel === 'hosts' && currentView !== 'hosts') {
      this.closeRemotePanel(currentView, true)
    }
  }

  openPairIos = (): void => {
    if (!this.remoteHosts.openPairIos()) return
    navigationModel.navigateToRemotePanel('pair-ios')
  }

  openUsbMobile = (): void => {
    if (!this.remoteHosts.openUsbMobile({scan: true})) return
    navigationModel.navigateToRemotePanel('usb-mobile')
  }

  retryUsbSession = (): void => {
    const hostId = this.remoteHosts.usb.silentPhoneRecoveryHostId()
    if (hostId) {
      void this.remoteHosts.connectUsbPairedHost(hostId)
    } else if (this.remoteHosts.openUsbMobile()) {
      navigationModel.navigateToRemotePanel('usb-mobile')
    }
  }

  forgetUsbSessionPhone = async (): Promise<void> => {
    const hostId = this.remoteHosts.usb.silentPhoneRecoveryHostId()
    if (!hostId) return
    const removed = await wrap(this.remoteHosts.removeUsbPairedHost(hostId))
    if (removed && this.remoteHosts.openUsbMobile()) {
      navigationModel.navigateToRemotePanel('usb-mobile')
    }
  }

  backToHosts = (): void => {
    const view = this.remoteHosts.view()
    if (view !== 'usb-mobile' && view !== 'pair-ios') return
    this.closeRemotePanel(view, false)
  }

  private closeRemotePanel(view: 'pair-ios' | 'usb-mobile', routeAlreadyChanged: boolean): void {
    if (this.remotePanelClosePromise) return
    const generation = ++this.remotePanelCloseGeneration
    this.remotePanelClosePromise = (async () => {
      const closed = await wrap(
        view === 'usb-mobile' ? this.remoteHosts.closeUsbMobile() : this.remoteHosts.closePairIos(),
      )
      if (generation !== this.remotePanelCloseGeneration) return
      if (closed && !routeAlreadyChanged) {
        navigationModel.navigateToRemotePanel('hosts', 'replace')
      } else if (!closed && routeAlreadyChanged) {
        navigationModel.navigateToRemotePanel(view, 'replace')
      }
    })().finally(() => {
      if (generation === this.remotePanelCloseGeneration) this.remotePanelClosePromise = null
    })
  }

  refreshRemotePeers = (): void => {
    void this.remoteHosts.loadPeers()
  }

  connectRemotePeer = (peerId: string): void => {
    void this.remoteHosts.connectToPeer(peerId)
  }

  removeRemotePeer = (peer: NetworkPairedPeer): void => {
    void this.remoteHosts.removePeer(peer).then((removed) => {
      if (removed) {
        toast.success(i18n('remote:paired-host-removed'), i18n('navigation:remote'), {
          key: `remote.peer.remove:${peer.peer_id}`,
        })
      }
    })
  }

  remoteOfferInput = (event: Event): void => {
    const target = event.target as {value?: string} | null
    this.remoteHosts.setOfferInput(target?.value ?? '')
  }

  remotePinInput = (event: Event): void => {
    const target = event.target as {value?: string} | null
    this.remoteHosts.setPinInput(target?.value ?? '')
  }

  remoteDeviceLabelInput = (event: Event): void => {
    const target = event.target as {value?: string} | null
    this.remoteHosts.setDeviceLabel(target?.value ?? '')
  }

  submitRemotePairing = async (event?: Event): Promise<void> => {
    event?.preventDefault()
    const success = await this.remoteHosts.submitPairing()
    if (success && !this.remoteHosts.isMobileHostRuntime()) {
      navigationModel.navigateToRemotePanel('hosts', 'replace')
    }
  }

  refreshRemotePresence = (): void => {
    void this.remoteHosts.refreshPresence()
  }

  canShareMobileHostOffer(): boolean {
    return canShareText()
  }

  async copyMobileHostOffer(): Promise<boolean> {
    const offer = this.remoteHosts.offerText()
    if (!offer) return false

    try {
      await wrap(systemClipboardTextWriter.writeText(offer))
      toast.success(i18n('remote:mobile-host-invitation-copied'), i18n('navigation:remote'), {
        key: 'remote.mobile-host.copy',
      })
      return true
    } catch {
      toast.error(i18n('remote:mobile-host-invitation-copy-error'), i18n('navigation:remote'), {
        key: 'remote.mobile-host.copy',
      })
      return false
    }
  }

  async shareMobileHostOffer(): Promise<boolean> {
    const offer = this.remoteHosts.offerText()
    if (!offer || !this.canShareMobileHostOffer()) return false

    try {
      const result = await wrap(
        shareText({
          title: i18n('remote:mobile-host-share-title'),
          text: offer,
        }),
      )
      return result === 'shared'
    } catch {
      toast.error(i18n('remote:mobile-host-invitation-share-error'), i18n('navigation:remote'), {
        key: 'remote.mobile-host.share',
      })
      return false
    }
  }

  remoteWaitReason = (): 'host_unlock' | 'phone_approval' => {
    return tryGetAppContext()?.store.remoteSessionState() === 'waiting_phone_approval'
      ? 'phone_approval'
      : 'host_unlock'
  }

  disconnectRemoteTransport = (): void => {
    void this.remoteHosts.disconnectTransport()
  }

  readonly getModeBadgeClass = (mode: CoreMode): string => {
    if (mode === 'switching') return 'switching'
    if (isRemoteMode(mode)) {
      const cat = getConnectionStatusCategory(this.connectionState())
      switch (cat) {
        case 'connected':
          return 'success'
        case 'degraded':
          return 'warning'
        case 'disconnected':
          return 'danger'
        case 'switching':
          return 'switching'
      }
    }
    return ''
  }

  private setupModeListeners(): void {
    const guard = (p: Promise<() => void>) => {
      p.then((unlisten) => {
        if (!this.connected) {
          unlisten()
          return
        }
        this.eventUnlisteners.push(unlisten)
      }).catch(() => {})
    }

    guard(
      onModeSwitching(
        wrap(() => {
          if (!this.connected) return
          this.modeSwitching.set(true)
          this.connectionPhase.set(i18n('remote:mode-label-switching'))
          this.modeError.set(null)
        }),
      ),
    )

    guard(
      onModeChanged(
        wrap((r: ModeSwitchResult) => {
          if (!this.connected) return
          this.modeSwitching.set(false)
          this.currentMode.set(r.current_mode)
          this.connectionPhase.set(null)
          void this.loadModeData()
        }),
      ),
    )

    guard(
      onConnectionStatus(
        wrap((e: ConnectionStatusEvent) => {
          if (!this.connected) return
          this.connectionPhase.set(e.phase)
        }),
      ),
    )

    guard(
      onSyncStatus(
        wrap((e: SyncStatusEvent) => {
          if (!this.connected) return
          this.syncPhase.set(e.phase)
          this.handleSyncEvent(e)
        }),
      ),
    )
  }

  private teardownModeListeners(): void {
    for (const unlisten of this.eventUnlisteners) unlisten()
    this.eventUnlisteners = []
  }

  private updateConnectionState(connState: ConnectionState): void {
    this.connectionState.set(connState)
    this.remoteStatus.set(deriveRemoteStatusWithLock(connState, this.syncSnapshot()))

    if (connState === 'locked') {
      this.startLockPoll()
    } else {
      this.clearLockPoll()
    }
  }

  private startLockPoll(): void {
    if (this.lockPollTimer !== null) return
    this.lockPollTimer = setInterval(
      wrap(() => void this.pollLockState()),
      RemotePageModel.LOCK_POLL_INTERVAL_MS,
    )
  }

  private clearLockPoll(): void {
    if (this.lockPollTimer !== null) {
      clearInterval(this.lockPollTimer)
      this.lockPollTimer = null
    }
  }

  private async pollLockState(): Promise<void> {
    try {
      const modeInfo = await wrap(getModeInfo())
      if (!this.connected) return
      this.updateConnectionState(modeInfo.connection_state)
    } catch (e) {
      console.warn('[remote] lock poll failed', e)
    }
  }

  private handleSyncEvent(e: SyncStatusEvent): void {
    const syncState = syncPhaseToState(e.phase)
    const progress = formatSyncProgress(e)
    const prev = this.syncSnapshot()

    const writerLock = e['writer_lock']
      ? (e['writer_lock'] as WriterLockInfo)
      : syncState === 'idle'
        ? null
        : prev.writerLock

    const snapshot: SyncSnapshot = {
      state: syncState,
      progress,
      lastSyncMs: syncState === 'synced' ? Date.now() : prev.lastSyncMs,
      writerLock,
      errorMessage: syncState === 'error' ? ((e['message'] as string) ?? 'Sync failed') : null,
    }

    this.syncSnapshot.set(snapshot)
    this.remoteStatus.set(deriveRemoteStatusWithLock(this.connectionState(), snapshot))
  }
}
