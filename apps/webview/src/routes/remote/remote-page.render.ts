import {html, nothing, type TemplateResult} from 'lit'
import {renderGuidanceInline} from 'root/features/guidance/render-guidance-inline'
import {i18n} from 'root/i18n'
import {
  renderRemoteHostsFlowPanel,
  type RemoteHostsFlowPanelActions,
  type RemoteHostsFlowPanelUI,
} from './remote-hosts-flow.render'

import type {
  ConnectionState,
  CoreMode,
  PairedDeviceInfo,
  RemoteStatus,
  SyncSnapshot,
  UsbDevice,
} from './remote.model'
import type {RemoteHostsFlowModel} from './remote-hosts-flow.model'

type RemoteCalloutVariant = 'info' | 'success' | 'warning' | 'danger' | 'neutral'

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
  modeError: () => string | null
  getModeLabel: (mode: CoreMode) => string
  getModeBadgeClass: (mode: CoreMode) => string
  getConnectedPeerName: (mode: CoreMode) => string | null
  isRemoteMode: (mode: CoreMode) => boolean
  onSwitchToLocal: () => void
  isMobileRuntime: () => boolean
  remoteHostsModel: RemoteHostsFlowModel
  remoteHostsActions: RemoteHostsFlowPanelActions
  remoteHostsUi?: RemoteHostsFlowPanelUI
  // Sync context (Task 13)
  syncSnapshot: () => SyncSnapshot
  formatLastSyncTime: (ms: number) => string
  onSyncRetry: () => void
  onRequestWriteLock: () => void
  onReleaseWriteLock: () => void
}

function renderRemoteCallout({
  variant,
  title,
  text,
  extra,
  role,
}: {
  variant: RemoteCalloutVariant
  title?: unknown
  text: unknown
  extra?: TemplateResult
  role?: 'alert' | 'status'
}): TemplateResult {
  const content = html`
    ${title ? html`<span class="remote-callout-title">${title}</span>` : nothing}
    <span class="remote-callout-text">${text}</span>
    ${extra ?? nothing}
  `

  return role
    ? html`<cv-callout class="remote-callout" variant=${variant} density="compact" role=${role}>${content}</cv-callout>`
    : html`<cv-callout class="remote-callout" variant=${variant} density="compact">${content}</cv-callout>`
}

export const renderConnectionCard = (ctx: RemotePageRenderContext): TemplateResult | typeof nothing => {
  const s = ctx.connectionState()
  const acting = ctx.acting()

  return html`
    <section class="card">
      <div class="card-header">
        <div class="card-title">
          <div class="name">${i18n('remote:connection-title')}</div>
          <div class="hint">${i18n('remote:connection-hint')}</div>
        </div>
        <div class="card-header-actions">
          <span class="badge ${ctx.getConnectionBadgeClass(s)}">${ctx.getConnectionLabel(s)}</span>
          ${s !== 'disconnected'
            ? html`
                <cv-button size="small" variant="primary" ?disabled=${acting} @click=${ctx.onDisconnect}>
                  ${acting ? i18n('status:working') : i18n('button:disconnect')}
                </cv-button>
              `
            : nothing}
        </div>
      </div>
    </section>
  `
}

export const renderDeviceItem = (ctx: RemotePageRenderContext, dev: UsbDevice): TemplateResult => {
  const serial = dev.serial_number ? i18n('remote:serial', {value: dev.serial_number}) : i18n('remote:no-serial')
  const vid = `VID: 0x${dev.vendor_id.toString(16).padStart(4, '0').toUpperCase()}`
  const pid = `PID: 0x${dev.product_id.toString(16).padStart(4, '0').toUpperCase()}`

  const acting = ctx.acting()
  const hasSerial = dev.serial_number !== null
  const disabled = acting || !hasSerial
  const label = acting
    ? i18n('status:working')
    : dev.is_paired
      ? i18n('button:connect')
      : i18n('button:pair')
  const title = hasSerial ? '' : i18n('remote:no-serial-title')
  const onClick = dev.is_paired ? () => ctx.onConnect(dev) : () => ctx.onPair(dev)

  return html`
    <div class="device-item">
      <div class="device-info">
        <div class="device-name">${dev.display_name}</div>
        <div class="device-port">${dev.port_path}</div>
        <div class="device-meta">${serial} &middot; ${vid} &middot; ${pid}</div>
      </div>
      <div class="device-badges">
        ${dev.is_paired ? html`<span class="badge success">${i18n('status:paired')}</span>` : nothing}
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
    <cv-guidance-anchor anchor-id="remote.pair-device" surface="remote" owner="remote">
      <section class="card">
        <div class="card-header">
          <div class="card-title">
            <div class="name">${i18n('remote:usb-devices-title')}</div>
            <div class="hint">${i18n('remote:usb-devices-hint')}</div>
          </div>
          <cv-button size="small" variant="primary" ?disabled=${isScanning} @click=${ctx.onScan}>
            ${isScanning ? i18n('loading') : i18n('button:scan')}
          </cv-button>
        </div>
        <div class="card-body">
          ${devs.length > 0
            ? html`<div class="device-list">${devs.map((d) => renderDeviceItem(ctx, d))}</div>`
            : html`
                <div class="empty-state">
                  ${i18n('remote:no-devices')}
                  ${renderGuidanceInline('remote.pair-device', 'remote')}
                </div>
              `}
        </div>
      </section>
    </cv-guidance-anchor>
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
          ${i18n('remote:serial', {value: dev.serial_number})} &middot;
          ${i18n('remote:paired-at', {value: ctx.formatDate(dev.paired_at)})} &middot;
          ${i18n('remote:last-seen', {value: ctx.formatRelativeTime(dev.last_seen)})}
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
          <div class="name">${i18n('remote:paired-devices-title')}</div>
          <div class="hint">${i18n('remote:paired-devices-hint')}</div>
        </div>
        ${paired.length > 0 ? html`<span class="badge">${paired.length} ${i18n('status:paired')}</span>` : nothing}
      </div>
      <div class="card-body">
        ${paired.length > 0
          ? html`<div class="device-list">${paired.map((d) => renderPairedDeviceItem(ctx, d))}</div>`
          : html`<div class="empty-state">${i18n('remote:no-paired-devices')}</div>`}
      </div>
    </section>
  `
}

export const renderLockedByOtherHint = (ctx: RemotePageRenderContext): TemplateResult | typeof nothing => {
  const status = ctx.remoteStatus()
  if (!status.locked_by_other) return nothing

  return renderRemoteCallout({
    variant: 'danger',
    title: i18n('remote:vault-locked-other-title'),
    text: i18n('remote:vault-locked-other-no-holder'),
    extra: html`
      <div class="lock-polling">
        <span class="spinner"></span>
        <span>${i18n('remote:auto-checking', {seconds: 5})}</span>
      </div>
    `,
  })
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
  const showModeBody = switching || Boolean(error) || isRemote

  return html`
    <section class="card mode-card">
      <div class="card-header">
        <div class="card-title">
          <div class="name">${i18n('remote:operating-mode-title')}</div>
          <div class="hint">${i18n('remote:operating-mode-hint')}</div>
        </div>
        <div class="card-header-actions">
          <span class="badge ${ctx.getModeBadgeClass(mode)}">${ctx.getModeLabel(mode)}</span>
        </div>
      </div>
      ${showModeBody
        ? html`
            <div class="card-body">
              ${switching
                ? html`
                    <div class="mode-switching">
                      <span class="spinner switching-spinner"></span>
                      <span class="switching-label">${phase ?? i18n('remote:mode-label-switching')}</span>
                    </div>
                  `
                : nothing}
              ${error ? renderRemoteCallout({variant: 'danger', text: error, role: 'alert'}) : nothing}
              ${isRemote && peerName
                ? html`
                    <div class="mode-info-row">
                      <span class="mode-info-label">${i18n('remote:connected-peer')}</span>
                      <span class="mode-info-value">${peerName}</span>
                    </div>
                  `
                : nothing}
              ${isRemote && transport
                ? html`
                    <div class="mode-info-row">
                      <span class="mode-info-label">${i18n('remote:transport')}</span>
                      <span class="badge">${transport.toUpperCase()}</span>
                    </div>
                  `
                : nothing}

              ${isRemote
                ? html`
                    <div class="mode-actions">
                      <cv-button
                        size="small"
                        variant="primary"
                        ?disabled=${switching}
                        @click=${ctx.onSwitchToLocal}
                      >
                        ${i18n('remote:mode-label-local')}
                      </cv-button>
                    </div>
                  `
                : nothing}
            </div>
          `
        : nothing}
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
      ? i18n('statusbar:catalog:idle')
      : snap.state === 'syncing'
        ? i18n('status:syncing')
        : snap.state === 'reconnecting'
          ? i18n('remote:reconnecting-text')
          : snap.state === 'error'
            ? i18n('remote:sync-error')
            : snap.state

  return html`
    <section class="card sync-status-card">
      <div class="card-header">
        <div class="card-title">
          <div class="name">${i18n('remote:sync-title')}</div>
          <div class="hint">
            ${snap.progress ??
            (snap.state === 'synced' && snap.lastSyncMs
              ? i18n('remote:sync-last', {time: ctx.formatLastSyncTime(snap.lastSyncMs)})
              : i18n('remote:sync-realtime'))}
          </div>
        </div>
        <div class="card-header-actions">
          <span class="badge ${badgeClass}">${stateLabel}</span>
          ${snap.state === 'syncing' || snap.state === 'reconnecting'
            ? html`<span class="spinner sync-spinner"></span>`
            : nothing}
          ${snap.state === 'error'
            ? html`<cv-button size="small" variant="primary" @click=${ctx.onSyncRetry}>
                ${i18n('button:retry')}
              </cv-button>`
            : nothing}
        </div>
      </div>
      ${snap.state === 'error' && snap.errorMessage
        ? html`<div class="card-body">
            ${renderRemoteCallout({variant: 'danger', text: snap.errorMessage, role: 'alert'})}
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
          <div class="name">${i18n('remote:writer-lock-title')}</div>
          <div class="hint">${i18n('remote:writer-lock-hint')}</div>
        </div>
        <div class="card-header-actions">
          <span class="badge danger">${i18n('status:locked')}</span>
        </div>
      </div>
      <div class="card-body">
        <div class="writer-lock-info">
          <div class="writer-lock-holder">
            <span class="mode-info-label">${i18n('remote:lock-holder')}</span>
            <span class="mode-info-value">${snap.writerLock.holder}</span>
          </div>
          <div class="writer-lock-message">
            ${i18n('remote:writer-lock-message')}
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
            <span class="writer-access-label locked">
              ${holderName
                ? i18n('remote:write-locked-by', {holder: holderName})
                : i18n('remote:write-locked-by-other')}
            </span>
            <cv-button size="small" variant="primary" @click=${ctx.onRequestWriteLock}
              >${i18n('remote:request-lock')}</cv-button
            >
          `
        : html` <span class="writer-access-label unlocked">${i18n('remote:write-access')}</span> `}
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
    hints.push(
      renderRemoteCallout({
        variant: 'danger',
        title: i18n('remote:peer-unreachable'),
        text: i18n('remote:peer-unreachable-text'),
        role: 'alert',
      }),
    )
  }

  // Transport degraded: connecting or syncing
  if (connState === 'connecting' || connState === 'syncing') {
    hints.push(
      renderRemoteCallout({
        variant: 'warning',
        title: i18n('remote:connection-progress'),
        text: html`
          ${connState === 'syncing'
            ? i18n('remote:syncing-with-phase', {phase: syncPhase ? `(${syncPhase})` : ''})
            : i18n('remote:establishing-transport')}
        `,
        extra: html`
          <div class="lock-polling">
          <span class="spinner"></span>
          <span>${i18n('remote:please-wait')}</span>
          </div>
        `,
      }),
    )
  }

  // Locked by writer — enhanced with lock holder info
  if (status.locked_by_other) {
    const writerName = status.writer_device
    hints.push(
      renderRemoteCallout({
        variant: 'danger',
        title: i18n('remote:vault-locked-other-title'),
        text: html`
          ${writerName
            ? i18n('remote:vault-locked-other-holder', {holder: writerName})
            : i18n('remote:vault-locked-other-no-holder')}
        `,
        extra: html`
          <div class="lock-polling">
          <span class="spinner"></span>
          <span>${i18n('remote:auto-checking', {seconds: 5})}</span>
          </div>
        `,
      }),
    )
  }

  if (hints.length === 0) return nothing
  return html`${hints}`
}

export const renderRemotePage = (ctx: RemotePageRenderContext): TemplateResult => {
  const isMobileRuntime = ctx.isMobileRuntime()
  return html`
    <div class="page">
      <header class="header">
        ${ctx.hideBackLink
          ? nothing
          : html`<cv-button unstyled class="back-link" @click=${ctx.onBack}>
              <cv-icon slot="prefix" name="arrow-left"></cv-icon>
              ${i18n('navigation:files')}
            </cv-button>`}
        <h1 class="title">${i18n('remote:title')}</h1>
        <p class="subtitle">${i18n('remote:subtitle')}</p>
      </header>

      <div class="grid">
        ${renderModeCard(ctx)} ${renderSyncStatusBar(ctx)} ${renderWriterLockCard(ctx)}
        ${renderWriterAccessIndicator(ctx)} ${renderUxStateHints(ctx)}
        ${isMobileRuntime ? nothing : renderConnectionCard(ctx)} ${renderLockedByOtherHint(ctx)}
        ${renderRemoteHostsFlowPanel({
          model: ctx.remoteHostsModel,
          actions: ctx.remoteHostsActions,
          ui: ctx.remoteHostsUi,
        })}
        ${isMobileRuntime ? nothing : renderDevicesCard(ctx)} ${isMobileRuntime ? nothing : renderPairedDevicesCard(ctx)}
      </div>
    </div>
  `
}
