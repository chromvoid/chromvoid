import {atom, wrap} from '@reatom/core'

import {navigationModel} from 'root/app/navigation/navigation.model'
import {guidanceCompletionBridge} from 'root/core/guidance'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {i18n} from 'root/i18n'
import {toast} from 'root/shared/services/toast-manager'

import type {
  ConnectionState,
  ConnectionStatusEvent,
  CoreMode,
  ModeSwitchResult,
  NetworkPairedPeer,
  PairedDeviceInfo,
  RemoteStatus,
  SyncSnapshot,
  SyncStatusEvent,
  UsbDevice,
  WriterLockInfo,
} from './remote.model'
import {
  connectUsbDevice as connectUsbRemoteDevice,
  defaultSyncSnapshot,
  deriveRemoteStatusWithLock,
  disconnectUsbDevice as disconnectUsbRemoteDevice,
  formatSyncProgress,
  getConnectionState,
  getConnectionStatusCategory,
  getModeInfo,
  getWriterLockToastMessage,
  isRemoteMode,
  listPairedDevices,
  onConnectionStatus,
  onModeChanged,
  onModeSwitching,
  onSyncStatus,
  pairUsbDevice,
  scanUsbDevices,
  switchMode,
  syncPhaseToState,
} from './remote.model'
import {RemoteHostsFlowModel} from './remote-hosts-flow.model'

export class RemotePageModel {
  readonly devices = atom<UsbDevice[]>([], 'remote.page.devices')
  readonly pairedDevices = atom<PairedDeviceInfo[]>([], 'remote.page.pairedDevices')
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
  readonly scanning = atom(false, 'remote.page.scanning')
  readonly acting = atom(false, 'remote.page.acting')

  readonly currentMode = atom<CoreMode>('local', 'remote.page.currentMode')
  readonly transportType = atom<string | null>(null, 'remote.page.transportType')
  readonly modeSwitching = atom(false, 'remote.page.modeSwitching')
  readonly connectionPhase = atom<string | null>(null, 'remote.page.connectionPhase')
  readonly syncPhase = atom<string | null>(null, 'remote.page.syncPhase')
  readonly modeError = atom<string | null>(null, 'remote.page.modeError')
  readonly syncSnapshot = atom<SyncSnapshot>(defaultSyncSnapshot(), 'remote.page.syncSnapshot')

  remoteHosts = new RemoteHostsFlowModel()

  private connected = false
  private lockPollTimer: ReturnType<typeof setInterval> | null = null
  private eventUnlisteners: Array<() => void> = []
  private guidanceCompletionUnsubscribe?: () => void

  private static readonly LOCK_POLL_INTERVAL_MS = 5_000

  readonly isMobileRuntime = (): boolean => getRuntimeCapabilities().mobile

  connect(): void {
    if (this.connected) return
    this.connected = true
    this.guidanceCompletionUnsubscribe = guidanceCompletionBridge.bindRemotePairedDevices(this.pairedDevices)
    void this.loadData()
    this.remoteHosts.connect()
    if (!this.isMobileRuntime()) {
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
    this.scanning.set(false)
    this.acting.set(false)
    this.modeSwitching.set(false)
    this.clearLockPoll()
    this.teardownModeListeners()
    this.remoteHosts.disconnect()
  }

  async loadData(): Promise<void> {
    try {
      const [connState, paired] = await wrap(Promise.all([getConnectionState(), listPairedDevices()]))
      if (!this.connected) return
      this.updateConnectionState(connState)
      this.pairedDevices.set(paired)
    } catch (e) {
      console.warn('[remote] loadData failed', e)
    }
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
    if (this.modeSwitching() || this.acting()) return
    this.modeSwitching.set(true)
    this.modeError.set(null)
    void switchMode('local').catch((e) => {
      if (!this.connected) return
      this.modeError.set(e instanceof Error ? e.message : String(e))
      this.modeSwitching.set(false)
    })
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
    toast.warning(getWriterLockToastMessage(holderName), 'Writer Lock')
  }

  releaseWriteLock = (): void => {
    const prev = this.syncSnapshot()
    this.syncSnapshot.set({
      ...prev,
      writerLock: null,
    })
    this.remoteStatus.set(deriveRemoteStatusWithLock(this.connectionState(), this.syncSnapshot()))
  }

  goBack = (): void => {
    navigationModel.goBack()
  }

  scan = async (): Promise<void> => {
    this.scanning.set(true)
    try {
      const found = await wrap(scanUsbDevices())
      if (!this.connected) return
      this.devices.set(found)
    } catch (e) {
      console.warn('[remote] scan failed', e)
    } finally {
      this.scanning.set(false)
    }
  }

  pair = async (dev: UsbDevice): Promise<void> => {
    if (this.acting()) return
    if (!dev.serial_number) return

    this.acting.set(true)
    try {
      const label = dev.display_name?.trim() || dev.serial_number
      await wrap(pairUsbDevice({port_path: dev.port_path, serial_number: dev.serial_number, label}))
      await this.refreshAll()
    } catch (e) {
      console.warn('[remote] pair failed', e)
    } finally {
      this.acting.set(false)
    }
  }

  connectDevice = async (dev: UsbDevice): Promise<void> => {
    if (this.acting()) return
    if (!dev.serial_number) return

    this.acting.set(true)
    try {
      await wrap(connectUsbRemoteDevice({port_path: dev.port_path, serial_number: dev.serial_number}))
      await this.refreshAll()
    } catch (e) {
      console.warn('[remote] connect failed', e)
    } finally {
      this.acting.set(false)
    }
  }

  disconnectDevice = async (): Promise<void> => {
    if (this.acting()) return

    this.acting.set(true)
    try {
      await wrap(disconnectUsbRemoteDevice())
      await this.refreshAll()
    } catch (e) {
      console.warn('[remote] disconnect failed', e)
    } finally {
      this.acting.set(false)
    }
  }

  syncRemoteHostsPanel(): void {
    if (this.remoteHosts.view() === 'wait') return

    const requestedPanel = navigationModel.snapshot().remote?.panel ?? 'hosts'
    if (requestedPanel === 'pair-ios' && this.remoteHosts.view() !== 'pair-ios') {
      this.remoteHosts.openPairIos()
      return
    }

    if (requestedPanel === 'hosts' && this.remoteHosts.view() !== 'hosts') {
      this.remoteHosts.showHosts()
    }
  }

  openPairIos = (): void => {
    navigationModel.navigateToRemotePanel('pair-ios')
    this.remoteHosts.openPairIos()
  }

  backToHosts = (): void => {
    navigationModel.navigateToRemotePanel('hosts', 'replace')
    void this.remoteHosts.closePairIos()
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
        toast.success(i18n('remote:paired-host-removed'), i18n('navigation:remote'))
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

  submitRemotePairing = async (): Promise<void> => {
    const success = await this.remoteHosts.submitPairing()
    if (success && !this.remoteHosts.isMobileHostRuntime()) {
      navigationModel.navigateToRemotePanel('hosts', 'replace')
    }
  }

  refreshRemotePresence = (): void => {
    void this.remoteHosts.refreshPresence()
  }

  disconnectRemoteTransport = (): void => {
    void this.remoteHosts.disconnectTransport()
  }

  readonly formatDate = (ms: number): string => {
    return new Date(ms).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})
  }

  readonly formatRelativeTime = (ms: number): string => {
    const diff = Date.now() - ms
    if (diff < 60_000) return i18n('time:just-now')
    if (diff < 3_600_000) return i18n('time:minutes-ago', {value: Math.floor(diff / 60_000)})
    if (diff < 86_400_000) return i18n('time:hours-ago', {value: Math.floor(diff / 3_600_000)})
    return this.formatDate(ms)
  }

  readonly getConnectionBadgeClass = (s: ConnectionState): string => {
    switch (s) {
      case 'ready':
        return 'success'
      case 'connecting':
      case 'syncing':
        return 'warning'
      case 'error':
      case 'locked':
        return 'danger'
      default:
        return ''
    }
  }

  readonly getConnectionLabel = (s: ConnectionState): string => {
    switch (s) {
      case 'disconnected':
        return i18n('status:disconnected')
      case 'connecting':
        return i18n('status:connecting')
      case 'syncing':
        return i18n('status:syncing')
      case 'ready':
        return i18n('status:ready')
      case 'locked':
        return i18n('status:locked')
      case 'error':
        return i18n('status:error')
    }
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

  private async refreshAll(): Promise<void> {
    await wrap(Promise.all([this.loadData(), this.scan()]))
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
      onModeSwitching(() => {
        if (!this.connected) return
        this.modeSwitching.set(true)
        this.connectionPhase.set(i18n('remote:mode-label-switching'))
        this.modeError.set(null)
      }),
    )

    guard(
      onModeChanged((r: ModeSwitchResult) => {
        if (!this.connected) return
        this.modeSwitching.set(false)
        this.currentMode.set(r.current_mode)
        this.connectionPhase.set(null)
        void this.loadModeData()
      }),
    )

    guard(
      onConnectionStatus((e: ConnectionStatusEvent) => {
        if (!this.connected) return
        this.connectionPhase.set(e.phase)
      }),
    )

    guard(
      onSyncStatus((e: SyncStatusEvent) => {
        if (!this.connected) return
        this.syncPhase.set(e.phase)
        this.handleSyncEvent(e)
      }),
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
      () => void this.pollLockState(),
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
      const connState = await wrap(getConnectionState())
      if (!this.connected) return
      this.updateConnectionState(connState)
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
