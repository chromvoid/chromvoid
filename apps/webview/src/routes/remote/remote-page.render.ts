import {html, nothing, type TemplateResult} from 'lit'
import {i18n} from 'root/i18n'
import {renderRouteBackLink} from 'root/shared/ui/route-back-link'
import {renderRouteCallout, type RouteCalloutVariant} from 'root/shared/ui/route-callout'
import {
  renderRemoteHostsFlowPanel,
  type RemoteHostsFlowPanelActions,
  type RemoteHostsFlowPanelUI,
} from './remote-hosts-flow.render'

import type {
  ConnectionState,
  CoreMode,
  RemoteStatus,
  SyncSnapshot,
} from './remote.model'
import type {RemoteHostsFlowModel} from './remote-hosts-flow.model'

type RemoteCalloutVariant = RouteCalloutVariant

export interface RemotePageRenderContext {
  hideBackLink: boolean
  externalToolbar: boolean
  connectionState: () => ConnectionState
  remoteStatus: () => RemoteStatus
  onBack: () => void
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
  return renderRouteCallout({
    className: 'remote-callout',
    variant,
    titleClassName: 'remote-callout-title',
    textClassName: 'remote-callout-text',
    title,
    text,
    extra,
    role,
  })
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
  return html`
    <div class="page">
      ${ctx.externalToolbar
        ? nothing
        : html`
            <header class="header">
              ${renderRouteBackLink({
                hidden: ctx.hideBackLink,
                label: i18n('navigation:files'),
                onBack: ctx.onBack,
              })}
              <h1 class="title">${i18n('remote:title')}</h1>
              <p class="subtitle">${i18n('remote:subtitle')}</p>
            </header>
          `}

      <div class="grid">
        ${renderModeCard(ctx)} ${renderSyncStatusBar(ctx)} ${renderWriterLockCard(ctx)}
        ${renderWriterAccessIndicator(ctx)} ${renderUxStateHints(ctx)}
        ${renderLockedByOtherHint(ctx)}
        ${renderRemoteHostsFlowPanel({
          model: ctx.remoteHostsModel,
          actions: ctx.remoteHostsActions,
          ui: ctx.remoteHostsUi,
        })}
      </div>
    </div>
  `
}
