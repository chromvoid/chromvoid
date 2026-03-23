import {html, nothing, type TemplateResult} from 'lit'

import type {
  ConnectionState,
  CoreMode,
  NetworkPairedPeer,
  PairedDeviceInfo,
  RemoteStatus,
  SyncSnapshot,
  UsbDevice,
} from './remote.model'

export interface RemotePageRenderContext {
  hideBackLink: boolean
  connectionState: () => ConnectionState
  remoteStatus: () => RemoteStatus
  devices: () => UsbDevice[]
  pairedDevices: () => PairedDeviceInfo[]
  acting: () => boolean
  scanning: () => boolean
  formatDate: (ms: number) => string
  formatRelativeTime: (ms: number) => string
  getConnectionBadgeClass: (s: ConnectionState) => string
  getConnectionLabel: (s: ConnectionState) => string
  onBack: () => void
  onDisconnect: () => void
  onScan: () => void
  onConnect: (dev: UsbDevice) => void
  onPair: (dev: UsbDevice) => void
  // Mode context
  currentMode: () => CoreMode
  transportType: () => string | null
  modeSwitching: () => boolean
  connectionPhase: () => string | null
  syncPhase: () => string | null
  networkPeers: () => NetworkPairedPeer[]
  removingNetworkPeerId: () => string | null
  modeError: () => string | null
  getModeLabel: (mode: CoreMode) => string
  getModeBadgeClass: (mode: CoreMode) => string
  getConnectedPeerName: (mode: CoreMode) => string | null
  isRemoteMode: (mode: CoreMode) => boolean
  onSwitchToLocal: () => void
  onSwitchToRemote: (peerId: string) => void
  onRemoveNetworkPeer: (peer: NetworkPairedPeer) => void
  // Sync context (Task 13)
  syncSnapshot: () => SyncSnapshot
  formatLastSyncTime: (ms: number) => string
  onSyncRetry: () => void
  onRequestWriteLock: () => void
  onReleaseWriteLock: () => void
}

export const renderConnectionCard = (ctx: RemotePageRenderContext): TemplateResult | typeof nothing => {
  const s = ctx.connectionState()
  const acting = ctx.acting()

  return html`
    <section class="card">
      <div class="card-header">
        <div class="card-title">
          <div class="name">Connection Status</div>
          <div class="hint">Current USB connection state</div>
        </div>
        <div class="card-header-actions">
          <span class="badge ${ctx.getConnectionBadgeClass(s)}">${ctx.getConnectionLabel(s)}</span>
          ${s !== 'disconnected'
            ? html`
                <cv-button size="small" variant="primary" ?disabled=${acting} @click=${ctx.onDisconnect}>
                  ${acting ? 'Working...' : 'Disconnect'}
                </cv-button>
              `
            : nothing}
        </div>
      </div>
    </section>
  `
}

export const renderDeviceItem = (ctx: RemotePageRenderContext, dev: UsbDevice): TemplateResult => {
  const serial = dev.serial_number ? `S/N: ${dev.serial_number}` : 'No serial'
  const vid = `VID: 0x${dev.vendor_id.toString(16).padStart(4, '0').toUpperCase()}`
  const pid = `PID: 0x${dev.product_id.toString(16).padStart(4, '0').toUpperCase()}`

  const acting = ctx.acting()
  const hasSerial = dev.serial_number !== null
  const disabled = acting || !hasSerial
  const label = acting ? 'Working...' : dev.is_paired ? 'Connect' : 'Pair'
  const title = hasSerial ? '' : 'Device has no serial number'
  const onClick = dev.is_paired ? () => ctx.onConnect(dev) : () => ctx.onPair(dev)

  return html`
    <div class="device-item">
      <div class="device-info">
        <div class="device-name">${dev.display_name}</div>
        <div class="device-port">${dev.port_path}</div>
        <div class="device-meta">${serial} &middot; ${vid} &middot; ${pid}</div>
      </div>
      <div class="device-badges">
        ${dev.is_paired ? html`<span class="badge success">Paired</span>` : nothing}
        ${dev.device_state ? html`<span class="badge">${dev.device_state}</span>` : nothing}
      </div>
      <div class="device-actions">
        <cv-button size="small" variant="primary" ?disabled=${disabled} title=${title} @click=${onClick}>
          ${label}
        </cv-button>
      </div>
    </div>
  `
}

export const renderDevicesCard = (ctx: RemotePageRenderContext): TemplateResult => {
  const devs = ctx.devices()
  const isScanning = ctx.scanning()

  return html`
    <section class="card">
      <div class="card-header">
        <div class="card-title">
          <div class="name">USB Devices</div>
          <div class="hint">Discovered devices on USB ports</div>
        </div>
        <cv-button size="small" variant="primary" ?disabled=${isScanning} @click=${ctx.onScan}>
          ${isScanning ? 'Scanning...' : 'Scan'}
        </cv-button>
      </div>
      <div class="card-body">
        ${devs.length > 0
          ? html`<div class="device-list">${devs.map((d) => renderDeviceItem(ctx, d))}</div>`
          : html`<div class="empty-state">
              No devices discovered. Click "Scan" to search for USB devices.
            </div>`}
      </div>
    </section>
  `
}

export const renderPairedDeviceItem = (
  ctx: RemotePageRenderContext,
  dev: PairedDeviceInfo,
): TemplateResult => {
  return html`
    <div class="device-item">
      <div class="device-info">
        <div class="device-name">${dev.label}</div>
        <div class="device-meta">
          S/N: ${dev.serial_number} &middot; Paired: ${ctx.formatDate(dev.paired_at)} &middot; Last seen:
          ${ctx.formatRelativeTime(dev.last_seen)}
        </div>
      </div>
    </div>
  `
}

export const renderPairedDevicesCard = (ctx: RemotePageRenderContext): TemplateResult => {
  const paired = ctx.pairedDevices()

  return html`
    <section class="card">
      <div class="card-header">
        <div class="card-title">
          <div class="name">Paired Devices</div>
          <div class="hint">Previously connected and trusted devices</div>
        </div>
        ${paired.length > 0 ? html`<span class="badge">${paired.length} paired</span>` : nothing}
      </div>
      <div class="card-body">
        ${paired.length > 0
          ? html`<div class="device-list">${paired.map((d) => renderPairedDeviceItem(ctx, d))}</div>`
          : html`<div class="empty-state">No paired devices</div>`}
      </div>
    </section>
  `
}

export const renderLockedByOtherHint = (ctx: RemotePageRenderContext): TemplateResult | typeof nothing => {
  const status = ctx.remoteStatus()
  if (!status.locked_by_other) return nothing

  return html`
    <div class="hint-block danger">
      <div class="hint-title">Vault is locked by another device</div>
      <div class="hint-text">
        Waiting for the lock to be released. You can view data but cannot make changes.
      </div>
      <div class="lock-polling">
        <span class="spinner"></span>
        <span>Auto-checking every 5 seconds</span>
      </div>
    </div>
  `
}

// ---------------------------------------------------------------------------
// Mode Switch Card
// ---------------------------------------------------------------------------

export const renderModeCard = (ctx: RemotePageRenderContext): TemplateResult => {
  const mode = ctx.currentMode()
  const switching = ctx.modeSwitching()
  const phase = ctx.connectionPhase()
  const transport = ctx.transportType()
  const peerName = ctx.getConnectedPeerName(mode)
  const error = ctx.modeError()
  const isRemote = ctx.isRemoteMode(mode)
  const peers = ctx.networkPeers()

  return html`
    <section class="card mode-card">
      <div class="card-header">
        <div class="card-title">
          <div class="name">Operating Mode</div>
          <div class="hint">Switch between Local and Remote vault</div>
        </div>
        <div class="card-header-actions">
          <span class="badge ${ctx.getModeBadgeClass(mode)}">${ctx.getModeLabel(mode)}</span>
        </div>
      </div>
      <div class="card-body">
        ${switching
          ? html`
              <div class="mode-switching">
                <span class="spinner switching-spinner"></span>
                <span class="switching-label">${phase ?? 'Switching mode…'}</span>
              </div>
            `
          : nothing}
        ${error ? html`<div class="hint-block danger"><div class="hint-text">${error}</div></div>` : nothing}
        ${isRemote && peerName
          ? html`
              <div class="mode-info-row">
                <span class="mode-info-label">Connected peer</span>
                <span class="mode-info-value">${peerName}</span>
              </div>
            `
          : nothing}
        ${isRemote && transport
          ? html`
              <div class="mode-info-row">
                <span class="mode-info-label">Transport</span>
                <span class="badge">${transport.toUpperCase()}</span>
              </div>
            `
          : nothing}

        <div class="mode-actions">
          ${isRemote
            ? html`
                <cv-button
                  size="small"
                  variant="primary"
                  ?disabled=${switching}
                  @click=${ctx.onSwitchToLocal}
                >
                  Switch to Local
                </cv-button>
              `
            : nothing}
          ${!isRemote && mode !== 'switching'
            ? peers.length > 0
              ? html`
                  <div class="peer-select-group">
                    <span class="mode-info-label">Connect to peer:</span>
                    <div class="device-list">
                      ${peers.map((p) => {
                        const platformLabel = p.platform === 'ios' ? 'iPhone Host' : 'Network Peer'
                        const statusLabel = p.platform === 'ios' ? p.status ?? 'offline' : null
                        const isRemoving = ctx.removingNetworkPeerId() === p.peer_id
                        const statusClass =
                          statusLabel === 'ready'
                            ? 'success'
                            : statusLabel === 'waking'
                              ? 'warning'
                              : statusLabel === 'offline'
                                ? 'danger'
                                : ''
                        const actionLabel =
                          p.platform === 'ios' && statusLabel !== 'ready' ? 'Wake & Connect' : 'Connect'

                        return html`
                          <div class="device-item">
                            <div class="device-info">
                              <div class="device-name">${p.label || p.peer_id}</div>
                              <div class="device-port">${p.peer_id}</div>
                              <div class="device-meta">
                                Paired: ${ctx.formatDate(p.paired_at)} &middot; Last seen:
                                ${ctx.formatRelativeTime(p.last_seen)}
                              </div>
                            </div>
                            <div class="device-badges">
                              <span class="badge">${platformLabel}</span>
                              ${statusLabel ? html`<span class="badge ${statusClass}">${statusLabel}</span>` : nothing}
                            </div>
                            <div class="device-actions">
                              <cv-button
                                size="small"
                                variant="primary"
                                ?disabled=${switching || isRemoving}
                                @click=${() => ctx.onSwitchToRemote(p.peer_id)}
                              >
                                ${actionLabel}
                              </cv-button>
                              <cv-button
                                size="small"
                                variant="danger"
                                ?disabled=${switching || isRemoving}
                                .loading=${isRemoving}
                                @click=${() => ctx.onRemoveNetworkPeer(p)}
                              >
                                Remove
                              </cv-button>
                            </div>
                          </div>
                        `
                      })}
                    </div>
                  </div>
                `
              : html`<div class="empty-state">
                  No paired network peers. Use Network Pairing to pair a device first.
                </div>`
            : nothing}
        </div>
      </div>
    </section>
  `
}

// ---------------------------------------------------------------------------
// Sync Status Bar (Task 13)
// ---------------------------------------------------------------------------

export const renderSyncStatusBar = (ctx: RemotePageRenderContext): TemplateResult | typeof nothing => {
  const mode = ctx.currentMode()
  if (!ctx.isRemoteMode(mode)) return nothing

  const snap = ctx.syncSnapshot()
  if (snap.state === 'idle') return nothing

  const badgeClass = snap.state === 'synced' ? 'success' : snap.state === 'error' ? 'danger' : 'warning'

  const stateLabel =
    snap.state === 'synced'
      ? 'Synced'
      : snap.state === 'syncing'
        ? 'Syncing'
        : snap.state === 'reconnecting'
          ? 'Reconnecting'
          : snap.state === 'error'
            ? 'Sync Error'
            : snap.state

  return html`
    <section class="card sync-status-card">
      <div class="card-header">
        <div class="card-title">
          <div class="name">Sync Status</div>
          <div class="hint">
            ${snap.progress ??
            (snap.state === 'synced' && snap.lastSyncMs
              ? `Last sync: ${ctx.formatLastSyncTime(snap.lastSyncMs)}`
              : 'Real-time data synchronization')}
          </div>
        </div>
        <div class="card-header-actions">
          <span class="badge ${badgeClass}">${stateLabel}</span>
          ${snap.state === 'syncing' || snap.state === 'reconnecting'
            ? html`<span class="spinner sync-spinner"></span>`
            : nothing}
          ${snap.state === 'error'
            ? html`<cv-button size="small" variant="primary" @click=${ctx.onSyncRetry}>Retry</cv-button>`
            : nothing}
        </div>
      </div>
      ${snap.state === 'error' && snap.errorMessage
        ? html`<div class="card-body">
            <div class="hint-block danger"><div class="hint-text">${snap.errorMessage}</div></div>
          </div>`
        : nothing}
    </section>
  `
}

// ---------------------------------------------------------------------------
// Writer Lock Card (Task 13)
// ---------------------------------------------------------------------------

export const renderWriterLockCard = (ctx: RemotePageRenderContext): TemplateResult | typeof nothing => {
  const mode = ctx.currentMode()
  if (!ctx.isRemoteMode(mode)) return nothing

  const snap = ctx.syncSnapshot()
  if (!snap.writerLock) return nothing

  return html`
    <section class="card writer-lock-card">
      <div class="card-header">
        <div class="card-title">
          <div class="name">Writer Lock Active</div>
          <div class="hint">Write operations are blocked</div>
        </div>
        <div class="card-header-actions">
          <span class="badge danger">Locked</span>
        </div>
      </div>
      <div class="card-body">
        <div class="writer-lock-info">
          <div class="writer-lock-holder">
            <span class="mode-info-label">Lock holder</span>
            <span class="mode-info-value">${snap.writerLock.holder}</span>
          </div>
          <div class="writer-lock-message">
            Another device is currently writing. Your changes will be queued until the lock is released.
          </div>
        </div>
      </div>
    </section>
  `
}

// ---------------------------------------------------------------------------
// Writer Access Indicator (Task 13 QA fix)
// ---------------------------------------------------------------------------

export const renderWriterAccessIndicator = (
  ctx: RemotePageRenderContext,
): TemplateResult | typeof nothing => {
  const mode = ctx.currentMode()
  if (!ctx.isRemoteMode(mode)) return nothing

  const snap = ctx.syncSnapshot()
  const isLocked = snap.writerLock !== null || ctx.remoteStatus().locked_by_other
  const holderName = snap.writerLock?.holder ?? ctx.remoteStatus().writer_device

  return html`
    <div class="writer-access-row">
      ${isLocked
        ? html`
            <span class="writer-access-label locked">Write locked by ${holderName ?? 'another device'}</span>
            <cv-button size="small" variant="primary" @click=${ctx.onRequestWriteLock}
              >Request Lock</cv-button
            >
          `
        : html` <span class="writer-access-label unlocked">You have write access</span> `}
    </div>
  `
}

// ---------------------------------------------------------------------------
// UX State Hints
// ---------------------------------------------------------------------------
export const renderUxStateHints = (ctx: RemotePageRenderContext): TemplateResult | typeof nothing => {
  const mode = ctx.currentMode()
  if (!ctx.isRemoteMode(mode)) return nothing

  const connState = ctx.connectionState()
  const syncPhase = ctx.syncPhase()
  const status = ctx.remoteStatus()

  const hints: TemplateResult[] = []

  // Paired but unreachable: Remote mode, disconnected
  if (connState === 'disconnected' || connState === 'error') {
    hints.push(html`
      <div class="hint-block danger">
        <div class="hint-title">Peer unreachable</div>
        <div class="hint-text">
          The paired device is not reachable. Check that it is online and on the same network.
        </div>
      </div>
    `)
  }

  // Transport degraded: connecting or syncing
  if (connState === 'connecting' || connState === 'syncing') {
    hints.push(html`
      <div class="hint-block warning">
        <div class="hint-title">Connection in progress</div>
        <div class="hint-text">
          ${connState === 'syncing'
            ? `Syncing data with remote peer… ${syncPhase ? `(${syncPhase})` : ''}`
            : 'Establishing transport connection…'}
        </div>
        <div class="lock-polling">
          <span class="spinner"></span>
          <span>Please wait</span>
        </div>
      </div>
    `)
  }

  // Locked by writer — enhanced with lock holder info
  if (status.locked_by_other) {
    const writerName = status.writer_device
    hints.push(html`
      <div class="hint-block danger">
        <div class="hint-title">Vault locked by another device</div>
        <div class="hint-text">
          ${writerName
            ? `The writer lock is held by "${writerName}". You can view data but cannot make changes.`
            : 'The writer lock is held by another device. You can view data but cannot make changes.'}
        </div>
        <div class="lock-polling">
          <span class="spinner"></span>
          <span>Auto-checking every 5 seconds</span>
        </div>
      </div>
    `)
  }

  if (hints.length === 0) return nothing
  return html`${hints}`
}

export const renderRemotePage = (ctx: RemotePageRenderContext): TemplateResult => {
  return html`
    <div class="page">
      <header class="header">
        ${ctx.hideBackLink
          ? nothing
          : html`<button class="back-link" @click=${ctx.onBack}>
              <cv-icon name="arrow-left"></cv-icon>
              Back to files
            </button>`}
        <h1 class="title">Remote Device</h1>
        <p class="subtitle">Manage connection mode and remote devices</p>
      </header>

      <div class="grid">
        ${renderModeCard(ctx)} ${renderSyncStatusBar(ctx)} ${renderWriterLockCard(ctx)}
        ${renderWriterAccessIndicator(ctx)} ${renderUxStateHints(ctx)} ${renderConnectionCard(ctx)}
        ${renderLockedByOtherHint(ctx)} ${renderDevicesCard(ctx)} ${renderPairedDevicesCard(ctx)}
      </div>
    </div>
  `
}
