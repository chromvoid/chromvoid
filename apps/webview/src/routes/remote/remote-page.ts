import {state} from '@statx/core'
import {XLitElement} from '@statx/lit'

import {navigationModel} from 'root/app/navigation/navigation.model'
import {dialogService} from 'root/shared/services/dialog'

import type {
  ConnectionState,
  ConnectionStatusEvent,
  CoreMode,
  ModeSwitchResult,
  ModeTransition,
  NetworkPairedPeer,
  PairedDeviceInfo,
  RemoteStatus,
  SyncSnapshot,
  SyncStatusEvent,
  UsbDevice,
  WriterLockInfo,
} from './remote.model'
import {
  connectUsbDevice,
  defaultSyncSnapshot,
  deriveRemoteStatusWithLock,
  disconnectUsbDevice,
  formatLastSyncTime,
  formatSyncProgress,
  getConnectionState,
  getConnectionStatusCategory,
  getConnectedPeerName,
  getModeInfo,
  getModeLabel,
  getWriterLockToastMessage,
  isRemoteMode,
  listNetworkPairedPeers,
  listPairedDevices,
  onConnectionStatus,
  onModeChanged,
  onModeSwitching,
  removeNetworkPairedPeer,
  onSyncStatus,
  pairUsbDevice,
  scanUsbDevices,
  switchMode,
  syncPhaseToState,
} from './remote.model'
import {renderRemotePage} from './remote-page.render'
import {remotePageStyles} from './remote-page.styles'
import {toast} from 'root/shared/services/toast-manager'

export class RemotePage extends XLitElement {
  static define() {
    if (!customElements.get('remote-page')) {
      customElements.define('remote-page', this)
    }
  }

  static properties = {
    hideBackLink: {type: Boolean, attribute: 'hide-back-link'},
  }

  declare hideBackLink: boolean

  constructor() {
    super()
    this.hideBackLink = false
  }

  static styles = [...remotePageStyles]

  private devices = state<UsbDevice[]>([])
  private pairedDevices = state<PairedDeviceInfo[]>([])
  private connectionState = state<ConnectionState>('disconnected')
  private remoteStatus = state<RemoteStatus>({
    connection_state: 'disconnected',
    vault_locked: false,
    locked_by_other: false,
    writer_device: null,
  })
  private scanning = state(false)
  private acting = state(false)
  private lockPollTimer: ReturnType<typeof setInterval> | null = null

  // ---- Mode state ----
  private currentMode = state<CoreMode>('local')
  private transportType = state<string | null>(null)
  private modeSwitching = state(false)
  private connectionPhase = state<string | null>(null)
  private syncPhase = state<string | null>(null)
  private networkPeers = state<NetworkPairedPeer[]>([])
  private removingNetworkPeerId = state<string | null>(null)
  private modeError = state<string | null>(null)

  // ---- Sync state (Task 13) ----
  private syncSnapshot = state<SyncSnapshot>(defaultSyncSnapshot())

  private eventUnlisteners: Array<() => void> = []

  connectedCallback(): void {
    super.connectedCallback()
    this.loadData()
    this.loadModeData()
    this.setupModeListeners()
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.clearLockPoll()
    this.teardownModeListeners()
  }

  // ---- Data loading ----

  private async loadData(): Promise<void> {
    try {
      const [connState, paired] = await Promise.all([getConnectionState(), listPairedDevices()])
      this.updateConnectionState(connState)
      this.pairedDevices.set(paired)
    } catch (e) {
      console.warn('[remote] loadData failed', e)
    }
  }

  private async loadModeData(): Promise<void> {
    try {
      const [modeInfo, peers] = await Promise.all([getModeInfo(), listNetworkPairedPeers()])
      this.currentMode.set(modeInfo.mode)
      this.connectionState.set(modeInfo.connection_state)
      this.remoteStatus.set(deriveRemoteStatusWithLock(modeInfo.connection_state, this.syncSnapshot()))
      this.transportType.set(modeInfo.transport_type)
      this.networkPeers.set(peers)
    } catch (e) {
      console.warn('[remote] loadModeData failed', e)
    }
  }

  // ---- Mode event listeners ----

  private setupModeListeners(): void {
    const guard = (p: Promise<() => void>) => {
      p.then((unlisten) => this.eventUnlisteners.push(unlisten)).catch(() => {})
    }

    guard(
      onModeSwitching((t: ModeTransition) => {
        this.modeSwitching.set(true)
        this.connectionPhase.set(`Switching to ${t.to_mode}…`)
        this.modeError.set(null)
      }),
    )

    guard(
      onModeChanged((r: ModeSwitchResult) => {
        this.modeSwitching.set(false)
        this.currentMode.set(r.current_mode)
        this.connectionPhase.set(null)
        void this.loadModeData()
      }),
    )

    guard(
      onConnectionStatus((e: ConnectionStatusEvent) => {
        this.connectionPhase.set(e.phase)
      }),
    )

    guard(
      onSyncStatus((e: SyncStatusEvent) => {
        this.syncPhase.set(e.phase)
        this.handleSyncEvent(e)
      }),
    )
  }

  private teardownModeListeners(): void {
    for (const unlisten of this.eventUnlisteners) unlisten()
    this.eventUnlisteners = []
  }

  // ---- Mode switch handlers ----

  private handleSwitchToLocal(): void {
    if (this.modeSwitching() || this.acting()) return
    this.modeSwitching.set(true)
    this.modeError.set(null)
    switchMode('local').catch((e) => {
      this.modeError.set(e instanceof Error ? e.message : String(e))
      this.modeSwitching.set(false)
    })
  }

  private handleSwitchToRemote(peerId: string): void {
    if (this.modeSwitching() || this.acting()) return
    this.modeSwitching.set(true)
    this.modeError.set(null)
    switchMode('remote', peerId).catch((e) => {
      this.modeError.set(e instanceof Error ? e.message : String(e))
      this.modeSwitching.set(false)
    })
  }

  private async handleRemoveNetworkPeer(peer: NetworkPairedPeer): Promise<void> {
    if (this.modeSwitching() || this.acting() || this.removingNetworkPeerId()) return

    const label = peer.label || peer.peer_id
    const targetLabel = peer.platform === 'ios' ? 'paired iPhone host' : 'paired network peer'
    const confirmed = await dialogService.showConfirmDialog({
      title: 'Remove Paired Host',
      message: `Remove "${label}" from ${targetLabel}s? You will need to pair it again before reconnecting.`,
      confirmText: 'Remove',
      confirmVariant: 'danger',
    })
    if (!confirmed) return

    this.removingNetworkPeerId.set(peer.peer_id)
    this.modeError.set(null)

    try {
      await removeNetworkPairedPeer(peer.peer_id)
      await this.loadModeData()
      toast.success('Paired host removed', 'Remote')
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      this.modeError.set(message)
      toast.error(message, 'Failed to remove peer')
    } finally {
      this.removingNetworkPeerId.set(null)
    }
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

  // ---- Lock polling ----

  private static readonly LOCK_POLL_INTERVAL_MS = 5_000

  private startLockPoll(): void {
    if (this.lockPollTimer !== null) return
    this.lockPollTimer = setInterval(() => void this.pollLockState(), RemotePage.LOCK_POLL_INTERVAL_MS)
  }

  private clearLockPoll(): void {
    if (this.lockPollTimer !== null) {
      clearInterval(this.lockPollTimer)
      this.lockPollTimer = null
    }
  }

  private async pollLockState(): Promise<void> {
    try {
      const connState = await getConnectionState()
      this.updateConnectionState(connState)
    } catch (e) {
      console.warn('[remote] lock poll failed', e)
    }
  }

  // ---- Sync event handling (Task 13) ----

  private handleSyncEvent(e: SyncStatusEvent): void {
    const syncState = syncPhaseToState(e.phase)
    const progress = formatSyncProgress(e)
    const prev = this.syncSnapshot()

    // Extract writer-lock info if present
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

  private handleSyncRetry(): void {
    // Re-trigger mode data load which will re-bootstrap sync
    this.syncSnapshot.set({
      ...this.syncSnapshot(),
      state: 'reconnecting',
      errorMessage: null,
      progress: 'Reconnecting…',
    })
    void this.loadModeData()
  }

  // ---- Writer lock actions (Task 13 QA fix) ----

  private handleRequestWriteLock(): void {
    const snap = this.syncSnapshot()
    const holderName = snap.writerLock?.holder ?? this.remoteStatus().writer_device
    toast.warning(getWriterLockToastMessage(holderName), 'Writer Lock')
  }

  private handleReleaseWriteLock(): void {
    // Frontend-only: clear local lock state. No backend command exists yet.
    const prev = this.syncSnapshot()
    this.syncSnapshot.set({
      ...prev,
      writerLock: null,
    })
    this.remoteStatus.set(deriveRemoteStatusWithLock(this.connectionState(), this.syncSnapshot()))
  }

  // ---- Handlers ----

  private onBack = () => {
    navigationModel.goBack()
  }

  private onScan = async () => {
    this.scanning.set(true)
    try {
      const found = await scanUsbDevices()
      this.devices.set(found)
    } catch (e) {
      console.warn('[remote] scan failed', e)
    } finally {
      this.scanning.set(false)
    }
  }

  private refreshAll = async (): Promise<void> => {
    await Promise.all([this.loadData(), this.onScan()])
  }

  private onPair = async (dev: UsbDevice): Promise<void> => {
    if (this.acting()) return
    if (!dev.serial_number) return

    this.acting.set(true)
    try {
      const label = dev.display_name?.trim() || dev.serial_number
      await pairUsbDevice({port_path: dev.port_path, serial_number: dev.serial_number, label})
      await this.refreshAll()
    } catch (e) {
      console.warn('[remote] pair failed', e)
    } finally {
      this.acting.set(false)
    }
  }

  private onConnect = async (dev: UsbDevice): Promise<void> => {
    if (this.acting()) return
    if (!dev.serial_number) return

    this.acting.set(true)
    try {
      await connectUsbDevice({port_path: dev.port_path, serial_number: dev.serial_number})
      await this.refreshAll()
    } catch (e) {
      console.warn('[remote] connect failed', e)
    } finally {
      this.acting.set(false)
    }
  }

  private onDisconnect = async (): Promise<void> => {
    if (this.acting()) return

    this.acting.set(true)
    try {
      await disconnectUsbDevice()
      await this.refreshAll()
    } catch (e) {
      console.warn('[remote] disconnect failed', e)
    } finally {
      this.acting.set(false)
    }
  }

  // ---- Formatting helpers ----

  private formatDate(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})
  }

  private formatRelativeTime(ms: number): string {
    const diff = Date.now() - ms
    if (diff < 60_000) return 'just now'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
    return this.formatDate(ms)
  }

  // ---- Connection state helpers ----

  private getConnectionBadgeClass(s: ConnectionState): string {
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

  private getConnectionLabel(s: ConnectionState): string {
    switch (s) {
      case 'disconnected':
        return 'Disconnected'
      case 'connecting':
        return 'Connecting'
      case 'syncing':
        return 'Syncing'
      case 'ready':
        return 'Ready'
      case 'locked':
        return 'Locked'
      case 'error':
        return 'Error'
    }
  }

  // ---- Mode badge helpers ----

  private getModeBadgeClass(mode: CoreMode): string {
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

  protected render() {
    return renderRemotePage({
      hideBackLink: this.hideBackLink,
      connectionState: this.connectionState,
      remoteStatus: this.remoteStatus,
      devices: this.devices,
      pairedDevices: this.pairedDevices,
      acting: this.acting,
      scanning: this.scanning,
      formatDate: this.formatDate.bind(this),
      formatRelativeTime: this.formatRelativeTime.bind(this),
      getConnectionBadgeClass: this.getConnectionBadgeClass.bind(this),
      getConnectionLabel: this.getConnectionLabel.bind(this),
      onBack: this.onBack,
      onDisconnect: this.onDisconnect,
      onScan: this.onScan,
      onConnect: this.onConnect,
      onPair: this.onPair,
      // Mode context
      currentMode: this.currentMode,
      transportType: this.transportType,
      modeSwitching: this.modeSwitching,
      connectionPhase: this.connectionPhase,
      syncPhase: this.syncPhase,
      networkPeers: this.networkPeers,
      removingNetworkPeerId: this.removingNetworkPeerId,
      modeError: this.modeError,
      getModeLabel,
      getModeBadgeClass: this.getModeBadgeClass.bind(this),
      getConnectedPeerName,
      isRemoteMode,
      onSwitchToLocal: this.handleSwitchToLocal.bind(this),
      onSwitchToRemote: this.handleSwitchToRemote.bind(this),
      onRemoveNetworkPeer: this.handleRemoveNetworkPeer.bind(this),
      // Sync context (Task 13)
      syncSnapshot: this.syncSnapshot,
      formatLastSyncTime,
      onSyncRetry: this.handleSyncRetry.bind(this),
      onRequestWriteLock: this.handleRequestWriteLock.bind(this),
      onReleaseWriteLock: this.handleReleaseWriteLock.bind(this),
    })
  }
}

RemotePage.define()
