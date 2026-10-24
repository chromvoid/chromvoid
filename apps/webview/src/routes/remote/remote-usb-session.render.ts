import {html, nothing, type TemplateResult} from 'lit'

import {i18n} from 'root/i18n'

import type {
  DesktopUsbRemoteSessionPresentation,
  DesktopUsbRemoteSessionStage,
} from './remote-usb-session.contract'

interface DesktopUsbRemoteSessionRenderContext {
  session: DesktopUsbRemoteSessionPresentation
  formatLastSyncTime: (ms: number) => string
  onRequestWriteLock: () => void
  onReconnectUsb: () => void
  onRetryUsb: () => void
  onForgetUsb: () => void
  actionBusy: boolean
  onUseLocal: () => void
}

function hostLabel(session: DesktopUsbRemoteSessionPresentation): string {
  if (!session.host) return i18n('remote:desktop-usb-phone-label')
  if (session.host.label) return session.host.label
  return session.host.platform === 'ios'
    ? i18n('remote:platform-ios')
    : i18n('remote:peer-android-host')
}

function stageLabel(stage: DesktopUsbRemoteSessionStage): string {
  switch (stage) {
    case 'waiting_host_unlock':
      return i18n('remote:usb-mobile-state-waiting-host-unlock')
    case 'waiting_phone_approval':
      return i18n('remote:usb-mobile-state-session-approval')
    case 'ready':
      return i18n('status:ready')
    case 'connection_lost':
      return i18n('remote:usb-mobile-state-recovery')
    case 'error':
      return i18n('status:error')
  }
}

function stageTitle(session: DesktopUsbRemoteSessionPresentation, label: string): string {
  switch (session.stage) {
    case 'waiting_host_unlock':
      return i18n('remote:desktop-usb-unlock-title', {host: label})
    case 'waiting_phone_approval':
      return i18n('remote:desktop-usb-approval-title', {host: label})
    case 'ready':
      return i18n('remote:desktop-usb-ready-title')
    case 'connection_lost':
      return i18n('remote:desktop-usb-lost-title')
    case 'error':
      return session.errorCode === 'ERR_USB_MOBILE_PHONE_NOT_RESPONDING'
        ? i18n('remote:usb-mobile-phone-not-responding-title')
        : i18n('remote:desktop-usb-error-title')
  }
}

function stageDescription(session: DesktopUsbRemoteSessionPresentation, label: string): string {
  switch (session.stage) {
    case 'waiting_host_unlock':
      return i18n('remote:desktop-usb-unlock-description', {host: label})
    case 'waiting_phone_approval':
      return i18n('remote:desktop-usb-approval-description', {host: label})
    case 'ready':
      return i18n('remote:desktop-usb-ready-description', {host: label})
    case 'connection_lost':
      return i18n('remote:desktop-usb-lost-description', {host: label})
    case 'error':
      return session.errorCode === 'ERR_USB_MOBILE_PHONE_NOT_RESPONDING'
        ? i18n('remote:usb-mobile-phone-not-responding-description')
        : i18n('remote:desktop-usb-error-description')
  }
}

function renderStatusItem(label: string, value: unknown, state: string): TemplateResult {
  return html`
    <div class="remote-usb-status-item" data-state=${state}>
      <dt>${label}</dt>
      <dd>${value}</dd>
    </div>
  `
}

function renderConnectionStatus(session: DesktopUsbRemoteSessionPresentation): TemplateResult {
  const disconnected = session.stage === 'connection_lost'
  const failed = session.stage === 'error'
  const value = disconnected
    ? i18n('remote:desktop-usb-connection-disconnected')
    : failed
      ? i18n('remote:mobile-host-path-degraded')
      : i18n('remote:mobile-host-path-connected')

  return renderStatusItem(
    i18n('remote:desktop-usb-connection-label'),
    value,
    disconnected || failed ? 'danger' : 'success',
  )
}

function renderPhoneStatus(session: DesktopUsbRemoteSessionPresentation): TemplateResult {
  let value: string
  let state = 'muted'
  switch (session.stage) {
    case 'waiting_host_unlock':
      value = i18n('remote:usb-mobile-recovery-unlock')
      state = 'warning'
      break
    case 'waiting_phone_approval':
      value = i18n('remote:usb-mobile-state-session-approval')
      state = 'warning'
      break
    case 'ready':
      value = i18n('remote:desktop-usb-phone-ready')
      state = 'success'
      break
    case 'connection_lost':
    case 'error':
      value = i18n('remote:desktop-usb-phone-unavailable')
      break
  }
  return renderStatusItem(i18n('remote:desktop-usb-phone-label'), value, state)
}

function renderAccessStatus(session: DesktopUsbRemoteSessionPresentation): TemplateResult {
  if (session.stage === 'connection_lost' || session.stage === 'error') {
    return renderStatusItem(
      i18n('remote:desktop-usb-access-label'),
      i18n('remote:desktop-usb-access-unavailable'),
      'muted',
    )
  }

  if (session.access === 'pending') {
    return renderStatusItem(
      i18n('remote:desktop-usb-access-label'),
      i18n('remote:desktop-usb-access-pending'),
      'muted',
    )
  }

  if (session.access === 'read_only') {
    const value = session.writerLockHolder
      ? i18n('remote:write-locked-by', {holder: session.writerLockHolder})
      : i18n('remote:write-locked-by-other')
    return renderStatusItem(i18n('remote:desktop-usb-access-label'), value, 'warning')
  }

  return renderStatusItem(
    i18n('remote:desktop-usb-access-label'),
    i18n('remote:write-access'),
    'success',
  )
}

function renderSyncStatus(ctx: DesktopUsbRemoteSessionRenderContext): TemplateResult | typeof nothing {
  const {session} = ctx
  if (session.stage !== 'ready') return nothing

  const snapshot = session.sync
  const value =
    snapshot.state === 'synced'
      ? snapshot.lastSyncMs
        ? i18n('remote:sync-last', {time: ctx.formatLastSyncTime(snapshot.lastSyncMs)})
        : i18n('statusbar:catalog:idle')
      : snapshot.state === 'syncing'
        ? snapshot.progress ?? i18n('status:syncing')
        : snapshot.state === 'reconnecting'
          ? i18n('remote:reconnecting-text')
          : snapshot.state === 'error'
            ? snapshot.errorMessage ?? i18n('remote:sync-error')
            : i18n('remote:sync-realtime')
  const state = snapshot.state === 'error' ? 'danger' : snapshot.state === 'synced' ? 'success' : 'muted'

  return renderStatusItem(i18n('remote:sync-title'), value, state)
}

function renderActions(ctx: DesktopUsbRemoteSessionRenderContext): TemplateResult {
  if (ctx.session.stage === 'error' && ctx.session.errorCode === 'ERR_USB_MOBILE_PHONE_NOT_RESPONDING') {
    return html`
      <div class="remote-usb-actions">
        <cv-button variant="primary" ?disabled=${ctx.actionBusy} @click=${ctx.onRetryUsb}>
          ${i18n('remote:preauth-usb-retry')}
        </cv-button>
        ${ctx.session.host
          ? html`
              <cv-button variant="danger" ?disabled=${ctx.actionBusy} @click=${ctx.onForgetUsb}>
                ${i18n('remote:preauth-remove-confirm')}
              </cv-button>
            `
          : nothing}
        <cv-button variant="ghost" ?disabled=${ctx.actionBusy} @click=${ctx.onUseLocal}>
          ${i18n('remote:desktop-usb-use-local')}
        </cv-button>
      </div>
    `
  }
  const recovery = ctx.session.stage === 'connection_lost' || ctx.session.stage === 'error'
  if (recovery) {
    return html`
      <div class="remote-usb-actions">
        <cv-button variant="primary" @click=${ctx.onReconnectUsb}>
          ${i18n('remote:desktop-usb-reconnect')}
        </cv-button>
        <cv-button variant="ghost" @click=${ctx.onUseLocal}>
          ${i18n('remote:desktop-usb-use-local')}
        </cv-button>
      </div>
    `
  }

  return html`
    <div class="remote-usb-actions">
      <cv-button
        variant="primary"
        ?disabled=${ctx.session.switchingToLocal}
        .loading=${ctx.session.switchingToLocal}
        @click=${ctx.onUseLocal}
      >
        ${i18n('remote:desktop-usb-disconnect-local')}
      </cv-button>
      ${ctx.session.access === 'read_only'
        ? html`
            <cv-button variant="ghost" @click=${ctx.onRequestWriteLock}>
              ${i18n('remote:request-lock')}
            </cv-button>
          `
        : nothing}
    </div>
  `
}

function renderTechnicalDetails(session: DesktopUsbRemoteSessionPresentation): TemplateResult {
  return html`
    <cv-disclosure class="remote-usb-details">
      <span slot="trigger" class="remote-usb-details-trigger">
        <strong>${i18n('remote:mobile-host-technical-details')}</strong>
        <small>${i18n('remote:mobile-host-technical-summary')}</small>
      </span>
      <dl class="remote-usb-detail-list">
        ${session.host
          ? html`
              <div>
                <dt>${i18n('remote:usb-mobile-active-host')}</dt>
                <dd><code dir="ltr">${session.host.hostId}</code></dd>
              </div>
            `
          : nothing}
        <div>
          <dt>${i18n('remote:transport')}</dt>
          <dd>${i18n('remote:transport-usb-mobile')}</dd>
        </div>
        ${session.host
          ? html`
              <div>
                <dt>${i18n('remote:mobile-host-platform')}</dt>
                <dd>
                  ${session.host.platform === 'ios'
                    ? i18n('remote:platform-ios')
                    : i18n('remote:platform-android')}
                </dd>
              </div>
              <div>
                <dt>${i18n('remote:desktop-usb-bridge-label')}</dt>
                <dd>
                  ${session.host.bridgeKind === 'ios_external_accessory'
                    ? i18n('remote:transport-ios-external-accessory')
                    : i18n('remote:transport-android-aoa')}
                </dd>
              </div>
            `
          : nothing}
        <div>
          <dt>${i18n('remote:transport-network-fallback')}</dt>
          <dd>${i18n('remote:network-fallback-disabled')}</dd>
        </div>
        ${session.errorCode
          ? html`
              <div>
                <dt>${i18n('remote:desktop-usb-error-code-label')}</dt>
                <dd><code dir="ltr">${session.errorCode}</code></dd>
              </div>
            `
          : nothing}
        ${session.errorText
          ? html`
              <div>
                <dt>${i18n('status:error')}</dt>
                <dd><code dir="auto">${session.errorText}</code></dd>
              </div>
            `
          : nothing}
      </dl>
    </cv-disclosure>
  `
}

export function renderDesktopUsbRemoteSession(
  ctx: DesktopUsbRemoteSessionRenderContext,
): TemplateResult {
  const {session} = ctx
  const label = hostLabel(session)
  const urgentAnnouncement = session.stage === 'connection_lost' || session.stage === 'error'

  return html`
    <section
      class="remote-usb-session"
      data-usb-session-stage=${session.stage}
      aria-labelledby="remote-usb-session-title"
    >
      <header class="remote-usb-header">
        <span class="remote-usb-device-icon" aria-hidden="true">
          <cv-icon name="smartphone" size="l"></cv-icon>
        </span>
        <div class="remote-usb-identity">
          <p>${i18n('remote:mode-label-remote')}</p>
          <h2><bdi dir="auto">${label}</bdi></h2>
          <div class="remote-usb-meta">
            <span>${i18n('remote:transport-usb-mobile')}</span>
            ${session.host
              ? html`
                  <span aria-hidden="true">·</span>
                  <span
                    >${session.host.platform === 'ios'
                      ? i18n('remote:platform-ios')
                      : i18n('remote:platform-android')}</span
                  >
                `
              : nothing}
          </div>
        </div>
        <span class="remote-usb-stage-badge" data-stage=${session.stage}>${stageLabel(session.stage)}</span>
      </header>

      <div class="remote-usb-body">
        <div
          class="remote-usb-next-step"
          role=${urgentAnnouncement ? 'alert' : 'status'}
          aria-live=${urgentAnnouncement ? 'assertive' : 'polite'}
          aria-atomic="true"
        >
          <h1 id="remote-usb-session-title">${stageTitle(session, label)}</h1>
          <p class="remote-usb-description">${stageDescription(session, label)}</p>
          ${renderActions(ctx)}
        </div>

        <dl class="remote-usb-status-list">
          ${renderConnectionStatus(session)} ${renderPhoneStatus(session)} ${renderAccessStatus(session)}
          ${renderSyncStatus(ctx)}
        </dl>
      </div>

      ${renderTechnicalDetails(session)}
    </section>
  `
}
